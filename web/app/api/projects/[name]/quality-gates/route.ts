// runtime: nodejs
// /api/projects/[name]/quality-gates - 质量门禁查询 / 通过 / 驳回 / 豁免
// spec L86 + L89 + L276 + L600 + L609 + L691 + 验收 L479

import { NextResponse } from 'next/server';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import { ensureSchema } from '@/app/lib/server/db/migrate';
import { getSqlite } from '@/app/lib/server/db/client';
import { getProject } from '@/app/lib/server/projects/project-service';
import {
  recordManualReview,
  recordVideoQualityGate,
  waiveQualityGate,
} from '@/app/lib/server/quality/quality-gate-service';
import {
  buildDefaultVideoQualityProtocols,
  VIDEO_QUALITY_METRICS,
  type VideoQualityMetric,
} from '@/app/lib/server/quality/video-quality-protocol';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function normalizeIdentifier(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

interface QualityGateRow {
  id: string;
  project_id: string;
  object_type: string;
  object_id: string;
  metric: string;
  status: string;
  scope_json: string;
  denominator: number;
  passed_count: number;
  failed_items_json: string;
  confidence: number;
  sampling_rule: string;
  review_source: string;
  operator_decision: string;
  waiver_reason: string;
  take_id: string | null;
  track_id: string | null;
  episode_index: number | null;
  operator_id: string | null;
  task_id: string | null;
  created_at: number;
  updated_at: number;
}

function mapGate(row: QualityGateRow) {
  let scope: unknown = {};
  let failedItems: unknown[] = [];
  try {
    scope = JSON.parse(row.scope_json);
  } catch {
    scope = {};
  }
  try {
    const parsed = JSON.parse(row.failed_items_json);
    failedItems = Array.isArray(parsed) ? parsed : [];
  } catch {
    failedItems = [];
  }
  return {
    id: row.id,
    projectId: row.project_id,
    objectType: row.object_type,
    objectId: row.object_id,
    metric: row.metric,
    status: row.status,
    scope,
    denominator: row.denominator,
    passedCount: row.passed_count,
    failedItems,
    confidence: row.confidence,
    samplingRule: row.sampling_rule,
    reviewSource: row.review_source,
    operatorDecision: row.operator_decision,
    waiverReason: row.waiver_reason,
    takeId: row.take_id,
    trackId: row.track_id,
    episodeIndex: row.episode_index,
    operatorId: row.operator_id,
    taskId: row.task_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * GET /api/projects/[name]/quality-gates?takeId=&trackId=&episode=&metric=
 *
 * 查询某项目下的 QualityGate 记录（支持 take / track / episode / metric 过滤）。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  try {
    const { name: rawName } = await params;
    const name = normalizeIdentifier(rawName);
    const project = await getProject(name);
    if (!project) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }

    const url = new URL(request.url);
    const takeId = url.searchParams.get('takeId') || '';
    const trackId = url.searchParams.get('trackId') || '';
    const episode = url.searchParams.get('episode');
    const metric = url.searchParams.get('metric') || '';
    const limit = Math.min(500, Number.parseInt(url.searchParams.get('limit') || '100', 10) || 100);

    await ensureSchema();
    const db = getSqlite();
    const conditions: string[] = ['project_id = ?'];
    const args: (string | number)[] = [project.id];
    if (takeId) {
      conditions.push('(take_id = ? OR object_id = ?)');
      args.push(takeId, takeId);
    }
    if (trackId) {
      conditions.push('track_id = ?');
      args.push(trackId);
    }
    if (episode) {
      conditions.push('episode_index = ?');
      args.push(Number.parseInt(episode, 10));
    }
    if (metric) {
      conditions.push('metric = ?');
      args.push(metric);
    }
    const sql = `SELECT * FROM quality_gates WHERE ${conditions.join(' AND ')}
                 ORDER BY updated_at DESC LIMIT ?`;
    const rows = db.prepare(sql).all(...args, limit) as QualityGateRow[];

    return NextResponse.json({
      projectName: name,
      gates: rows.map(mapGate),
      count: rows.length,
      metrics: VIDEO_QUALITY_METRICS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `加载 QualityGate 失败：${message}` }, { status: 500 });
  }
}

/**
 * POST /api/projects/[name]/quality-gates { action, takeId, ... }
 *
 * action:
 *   - pass      录入 6 维默认通过协议（用于 MVP 测试 / 手动标 pass）
 *   - reject    人工审核驳回（reviewSource = manual_review，decision = failed）
 *   - waive     人工豁免（必须 operator + reason + scope）
 *   - approve   人工审核通过（reviewSource = manual_review，decision = passed）
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'POST body 必须是 JSON' }, { status: 400 });
  }

  try {
    const { name: rawName } = await params;
    const name = normalizeIdentifier(rawName);
    const project = await getProject(name);
    if (!project) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }

    const action = String(body.action || '').trim();
    const takeId = String(body.takeId || '').trim();
    if (!action) {
      return NextResponse.json({ error: '缺少 action 字段（pass | reject | approve | waive）' }, { status: 400 });
    }
    if (!takeId) {
      return NextResponse.json({ error: '缺少 takeId' }, { status: 400 });
    }

    await ensureSchema();

    if (action === 'pass') {
      const protocols = buildDefaultVideoQualityProtocols(takeId, {
        denominator: typeof body.denominator === 'number' ? body.denominator : 1,
        reviewSource: 'agent_self_review',
      });
      const result = await recordVideoQualityGate({
        projectIdentifier: name,
        takeId,
        trackId: typeof body.trackId === 'string' ? body.trackId : undefined,
        taskId: typeof body.taskId === 'string' ? body.taskId : undefined,
        episodeIndex: typeof body.episode === 'number' ? body.episode : undefined,
        protocols,
        reviewSource: 'agent_self_review',
        operatorId: typeof body.operatorId === 'string' ? body.operatorId : undefined,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === 'approve' || action === 'reject') {
      const operatorId = String(body.operatorId || '').trim();
      if (!operatorId) {
        return NextResponse.json({ error: '缺少 operatorId（人工审核必须记录操作人）' }, { status: 400 });
      }
      const metric = (body.metric as VideoQualityMetric) || 'compliance';
      const id = await recordManualReview({
        projectIdentifier: name,
        takeId,
        trackId: typeof body.trackId === 'string' ? body.trackId : undefined,
        metric,
        decision: action === 'approve' ? 'passed' : 'failed',
        operatorId,
        reviewNote: typeof body.note === 'string' ? body.note : '',
        reviewSource: (body.reviewSource as 'manual_review' | 'ai_assisted_manual') ?? 'manual_review',
      });
      return NextResponse.json({ ok: true, qualityGateId: id });
    }

    if (action === 'waive') {
      // 4 字段校验（spec L89）: operator + reason + scope + timestamp
      const operatorId = String(body.operatorId || '').trim();
      const reason = String(body.reason || body.waiverReason || '').trim();
      const scope = (body.scope ?? body.affectedScope ?? null) as Record<string, unknown> | null;
      if (!operatorId) {
        return NextResponse.json({ error: '缺少 operatorId（豁免必须记录操作人）' }, { status: 400 });
      }
      if (!reason) {
        return NextResponse.json({ error: 'reason 不能为空（豁免必须记录原因）' }, { status: 422 });
      }
      if (!scope || typeof scope !== 'object') {
        return NextResponse.json({ error: '缺少 scope / 影响范围' }, { status: 422 });
      }
      const id = await waiveQualityGate({
        projectIdentifier: name,
        qualityGateId: typeof body.qualityGateId === 'string' ? body.qualityGateId : undefined,
        takeId,
        operatorId,
        waiverReason: reason,
        scope,
        metric: (body.metric as VideoQualityMetric) ?? 'compliance',
      });
      // updated_at 已在 waiveQualityGate 内由 Date.now() 写入
      return NextResponse.json({ ok: true, qualityGateId: id, waivedAt: Date.now() });
    }

    return NextResponse.json({ error: `未知 action: ${action}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `QualityGate 操作失败：${message}` }, { status: 500 });
  }
}

/**
 * PATCH /api/projects/[name]/quality-gates { qualityGateId, status? }
 *
 * 仅允许小幅修订（如更新置信度、追加 failedItems）；正式状态变更走 POST action。
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'PATCH body 必须是 JSON' }, { status: 400 });
  }

  try {
    const { name: rawName } = await params;
    const name = normalizeIdentifier(rawName);
    const project = await getProject(name);
    if (!project) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }
    const id = String(body.qualityGateId || '').trim();
    if (!id) return NextResponse.json({ error: '缺少 qualityGateId' }, { status: 400 });

    await ensureSchema();
    const now = Date.now();
    const updates: string[] = ['updated_at = ?'];
    const args: (string | number)[] = [now];
    if (typeof body.confidence === 'number') {
      updates.push('confidence = ?');
      args.push(body.confidence);
    }
    if (typeof body.samplingRule === 'string') {
      updates.push('sampling_rule = ?');
      args.push(body.samplingRule);
    }
    getSqlite()
      .prepare(`UPDATE quality_gates SET ${updates.join(', ')} WHERE id = ? AND project_id = ?`)
      .run(...args, id, project.id);
    return NextResponse.json({ ok: true, qualityGateId: id });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `QualityGate 更新失败：${message}` }, { status: 500 });
  }
}
