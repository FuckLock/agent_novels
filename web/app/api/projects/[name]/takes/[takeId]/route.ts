// runtime: nodejs
// /api/projects/[name]/takes/[takeId] - Take 接受 / 重试 / 替换 / 锁定 / 问题标记
// spec L319 + L546 + L553 + L597-600 + L609 + 验收 L479

import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import { ensureSchema } from '@/app/lib/server/db/migrate';
import { getSqlite } from '@/app/lib/server/db/client';
import { getProject } from '@/app/lib/server/projects/project-service';
import { getQualityStatus } from '@/app/lib/server/quality/quality-gate-service';
import {
  ISSUE_TYPES,
  type TakeIssueType,
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

interface TakeRow {
  id: string;
  task_id: string | null;
  track_id: string;
  project_id: string;
  artifact_id: string | null;
  parent_take_id: string | null;
  model_id: string;
  strategy: string;
  parameters_json: string;
  prompt: string;
  cost_estimate: number;
  cost_actual: number;
  provider_job_id: string | null;
  status: string;
  issue_tags: string;
  review_note: string;
  duration_seconds: number;
  quality_status: string;
  locked: number;
  locked_at: number | null;
  locked_by: string | null;
  created_at: number;
  updated_at: number;
}

function mapTake(row: TakeRow) {
  let issueTags: string[] = [];
  try {
    const parsed = JSON.parse(row.issue_tags);
    issueTags = Array.isArray(parsed) ? parsed : [];
  } catch {
    issueTags = [];
  }
  return {
    id: row.id,
    taskId: row.task_id,
    trackId: row.track_id,
    projectId: row.project_id,
    artifactId: row.artifact_id,
    parentTakeId: row.parent_take_id,
    modelId: row.model_id,
    strategy: row.strategy,
    prompt: row.prompt,
    costEstimate: row.cost_estimate,
    costActual: row.cost_actual,
    providerJobId: row.provider_job_id,
    status: row.status,
    issueTags,
    reviewNote: row.review_note,
    durationSeconds: row.duration_seconds,
    qualityStatus: row.quality_status,
    locked: row.locked === 1,
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function loadTake(projectId: string, takeId: string): TakeRow | null {
  const row = getSqlite()
    .prepare(
      `SELECT id, task_id, track_id, project_id, artifact_id, parent_take_id,
              model_id, strategy, parameters_json, prompt, cost_estimate, cost_actual,
              provider_job_id, status, issue_tags, review_note, duration_seconds,
              quality_status, locked, locked_at, locked_by, created_at, updated_at
       FROM takes WHERE id = ? AND project_id = ?`,
    )
    .get(takeId, projectId) as TakeRow | undefined;
  return row ?? null;
}

/**
 * GET /api/projects/[name]/takes/[takeId]
 *
 * 返回 Take 详情 + 关联 QualityGate 状态。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string; takeId: string }> },
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  try {
    const { name: rawName, takeId } = await params;
    const name = normalizeIdentifier(rawName);
    const project = await getProject(name);
    if (!project) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }

    await ensureSchema();
    const row = loadTake(project.id, takeId);
    if (!row) {
      return NextResponse.json({ error: 'Take 不存在' }, { status: 404 });
    }
    const quality = await getQualityStatus(name, takeId);
    return NextResponse.json({ take: mapTake(row), quality });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `加载 Take 失败：${message}` }, { status: 500 });
  }
}

/**
 * POST /api/projects/[name]/takes/[takeId] { action, ... }
 *
 * action:
 *   - accept       Take 通过审核（status='accepted' + quality_status 不变）
 *   - retry        重试（写问题标签 + 创建子 take 占位）
 *   - replace      替换为另一个候选（artifactId / providerJobId 更新）
 *   - lock         锁定（前置校验 quality_status === 'passed' || 'waived'）
 *   - mark_issue   标记问题（issue_tags 数组 + issue_type 之一）
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string; takeId: string }> },
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
    const { name: rawName, takeId } = await params;
    const name = normalizeIdentifier(rawName);
    const project = await getProject(name);
    if (!project) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }
    const action = String(body.action || '').trim();
    if (!action) {
      return NextResponse.json({ error: '缺少 action 字段' }, { status: 400 });
    }

    await ensureSchema();
    const db = getSqlite();
    const take = loadTake(project.id, takeId);
    if (!take) {
      return NextResponse.json({ error: 'Take 不存在' }, { status: 404 });
    }
    const now = Date.now();

    if (action === 'accept') {
      db.prepare(`UPDATE takes SET status = 'accepted', updated_at = ? WHERE id = ? AND project_id = ?`)
        .run(now, takeId, project.id);
      return NextResponse.json({ ok: true, takeId, status: 'accepted' });
    }

    if (action === 'retry') {
      // 写问题标签到原 take + 创建子 take 占位（继承 trackId / strategy）
      const issueType = String(body.issue_type || body.issueType || '').trim();
      const reason = typeof body.reason === 'string' ? body.reason : '';
      let tags: string[] = [];
      try {
        const parsed = JSON.parse(take.issue_tags);
        tags = Array.isArray(parsed) ? parsed : [];
      } catch {
        tags = [];
      }
      if (issueType && (ISSUE_TYPES as readonly string[]).includes(issueType)) {
        tags.push(issueType);
      }
      db.prepare(
        `UPDATE takes SET issue_tags = ?, review_note = ?, status = 'failed', updated_at = ?
         WHERE id = ? AND project_id = ?`,
      ).run(JSON.stringify(tags), reason || take.review_note, now, takeId, project.id);

      const childId = randomUUID();
      db.prepare(
        `INSERT INTO takes
          (id, task_id, track_id, project_id, artifact_id, parent_take_id,
           model_id, strategy, parameters_json, prompt, cost_estimate, cost_actual,
           provider_job_id, status, issue_tags, review_note, duration_seconds,
           quality_status, locked, locked_at, locked_by, created_at, updated_at)
         VALUES (?, NULL, ?, ?, NULL, ?, ?, ?, '{}', ?, 0, 0, NULL, 'draft', '[]', ?, 0, 'unchecked', 0, NULL, NULL, ?, ?)`,
      ).run(
        childId,
        take.track_id,
        project.id,
        takeId,
        take.model_id,
        take.strategy,
        take.prompt,
        reason || `retry from ${takeId}`,
        now,
        now,
      );
      return NextResponse.json({ ok: true, takeId, childTakeId: childId, issueType: issueType || null });
    }

    if (action === 'replace') {
      const artifactId = typeof body.artifactId === 'string' ? body.artifactId : null;
      const providerJobId = typeof body.providerJobId === 'string' ? body.providerJobId : null;
      db.prepare(
        `UPDATE takes SET artifact_id = ?, provider_job_id = ?, status = 'replaced', updated_at = ?
         WHERE id = ? AND project_id = ?`,
      ).run(artifactId, providerJobId, now, takeId, project.id);
      return NextResponse.json({ ok: true, takeId, status: 'replaced' });
    }

    if (action === 'lock') {
      // ⚠️ Phase 10 D4 硬约束 — spec L319 + L600 + L609 + 验收 L479
      // 锁定前必须校验 quality_status；不为 passed / waived 时拒绝锁定
      const qualityStatus = take.quality_status || 'unchecked';
      if (qualityStatus !== 'passed' && qualityStatus !== 'waived') {
        return NextResponse.json(
          {
            error: `quality gate not passed (current: ${qualityStatus})；锁定前必须经过 QualityGate 通过或人工豁免`,
            qualityStatus,
            takeId,
          },
          { status: 422 },
        );
      }
      const operatorId = typeof body.operatorId === 'string' ? body.operatorId : null;
      db.prepare(
        `UPDATE takes SET locked = 1, locked_at = ?, locked_by = ?, status = 'locked', updated_at = ?
         WHERE id = ? AND project_id = ?`,
      ).run(now, operatorId, now, takeId, project.id);
      return NextResponse.json({ ok: true, takeId, locked: true, qualityStatus });
    }

    if (action === 'mark_issue' || action === 'markIssue') {
      const issueType = String(body.issue_type || body.issueType || '').trim();
      const reason = typeof body.reason === 'string' ? body.reason : '';
      if (!issueType) {
        return NextResponse.json({ error: '缺少 issue_type（7 类问题之一）' }, { status: 400 });
      }
      if (!(ISSUE_TYPES as readonly string[]).includes(issueType)) {
        return NextResponse.json(
          { error: `非法 issue_type；必须是 ${ISSUE_TYPES.join(' | ')}` },
          { status: 400 },
        );
      }
      let tags: string[] = [];
      try {
        const parsed = JSON.parse(take.issue_tags);
        tags = Array.isArray(parsed) ? parsed : [];
      } catch {
        tags = [];
      }
      if (!tags.includes(issueType)) tags.push(issueType);
      db.prepare(
        `UPDATE takes SET issue_tags = ?, review_note = ?, updated_at = ? WHERE id = ? AND project_id = ?`,
      ).run(JSON.stringify(tags), reason || take.review_note, now, takeId, project.id);
      return NextResponse.json({ ok: true, takeId, issueTags: tags });
    }

    return NextResponse.json({ error: `未知 action: ${action}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `Take 操作失败：${message}` }, { status: 500 });
  }
}

/**
 * PATCH /api/projects/[name]/takes/[takeId] { reviewNote?, issueTags? }
 *
 * 编辑 Take 元信息（非状态变更走 PATCH，状态变更走 POST action）。
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ name: string; takeId: string }> },
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
    const { name: rawName, takeId } = await params;
    const name = normalizeIdentifier(rawName);
    const project = await getProject(name);
    if (!project) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }
    await ensureSchema();
    const take = loadTake(project.id, takeId);
    if (!take) {
      return NextResponse.json({ error: 'Take 不存在' }, { status: 404 });
    }
    // locked take 拒绝任意 PATCH（spec L600 锁定后只读）
    if (take.locked === 1) {
      return NextResponse.json({ error: 'Take 已锁定，无法修改' }, { status: 409 });
    }
    const updates: string[] = [];
    const args: (string | number)[] = [];
    if (typeof body.reviewNote === 'string') {
      updates.push('review_note = ?');
      args.push(body.reviewNote);
    }
    if (Array.isArray(body.issueTags)) {
      const filtered = (body.issueTags as unknown[])
        .map((tag) => String(tag))
        .filter((tag) => (ISSUE_TYPES as readonly string[]).includes(tag as TakeIssueType));
      updates.push('issue_tags = ?');
      args.push(JSON.stringify(filtered));
    }
    if (!updates.length) {
      return NextResponse.json({ error: '没有可更新字段' }, { status: 400 });
    }
    const now = Date.now();
    updates.push('updated_at = ?');
    args.push(now);
    getSqlite()
      .prepare(`UPDATE takes SET ${updates.join(', ')} WHERE id = ? AND project_id = ?`)
      .run(...args, takeId, project.id);

    return NextResponse.json({ ok: true, takeId });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `Take 更新失败：${message}` }, { status: 500 });
  }
}
