import { randomUUID } from 'node:crypto';
import { ensureSchema } from '../db/migrate';
import { getSqlite } from '../db/client';
import { getProject } from '../projects/project-service';
import type { ReviewResult } from '@/app/lib/novels';
import type {
  ReviewSource,
  TakeIssueType,
  VideoQualityMetric,
  VideoQualityProtocol,
} from './video-quality-protocol';

function normalizeIdentifier(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function resolveProject(identifier: string) {
  await ensureSchema();
  return getProject(normalizeIdentifier(identifier));
}

function latestScriptId(projectId: string, episode: number) {
  const row = getSqlite()
    .prepare(
      `SELECT id FROM script_versions
       WHERE project_id = ? AND episode_index = ? AND deleted_at IS NULL
       ORDER BY version_no DESC, updated_at DESC
       LIMIT 1`,
    )
    .get(projectId, episode) as { id: string } | undefined;
  return row?.id || null;
}

function latestTextObject(projectId: string, result: ReviewResult) {
  const scope = result.scope === 'episode' ? 'episode' : 'global';
  const episodeIndex = scope === 'episode' ? result.episode : undefined;
  const where = episodeIndex === undefined
    ? 'project_id = ? AND scope = ? AND episode_index IS NULL'
    : 'project_id = ? AND scope = ? AND episode_index = ?';
  const args = episodeIndex === undefined ? [projectId, scope] : [projectId, scope, episodeIndex];

  if (result.type === 'skeleton') {
    const row = getSqlite()
      .prepare(
        `SELECT id FROM story_outlines
         WHERE ${where} AND deleted_at IS NULL
         ORDER BY version_no DESC, updated_at DESC
         LIMIT 1`,
      )
      .get(...args) as { id: string } | undefined;
    return row ? { objectType: 'story_outline', objectId: row.id, table: 'story_outlines' } : null;
  }
  if (result.type === 'adaptation') {
    const row = getSqlite()
      .prepare(
        `SELECT id FROM adaptation_plans
         WHERE ${where} AND deleted_at IS NULL
         ORDER BY version_no DESC, updated_at DESC
         LIMIT 1`,
      )
      .get(...args) as { id: string } | undefined;
    return row ? { objectType: 'adaptation_plan', objectId: row.id, table: 'adaptation_plans' } : null;
  }
  return null;
}

export async function recordQualityGateFromReview(projectIdentifier: string, result: ReviewResult) {
  const project = await resolveProject(projectIdentifier);
  if (!project) return null;

  const textObject = result.type === 'script' && result.episode
    ? { objectType: 'script', objectId: latestScriptId(project.id, result.episode), table: 'script_versions' }
    : latestTextObject(project.id, result);
  const objectId = textObject?.objectId;
  if (!objectId) return null;

  const now = Date.now();
  const id = randomUUID();
  const status = result.status === 'pass' ? 'passed' : 'failed';
  getSqlite()
    .prepare(
      `INSERT INTO quality_gates
        (id, project_id, object_type, object_id, metric, status, scope_json,
         denominator, passed_count, failed_items_json, confidence, sampling_rule,
         review_source, operator_decision, waiver_reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'agent_self_review', ?, '', ?, ?)`,
    )
    .run(
      id,
      project.id,
      textObject.objectType,
      objectId,
      'text_quality',
      status,
      JSON.stringify({ type: result.type, scope: result.scope || null, episode: result.episode || null }),
      result.dimensions.length,
      result.dimensions.filter((dimension) => dimension.score >= 80).length,
      JSON.stringify(result.status === 'pass' ? [] : result.suggestions),
      Math.max(0, Math.min(1, result.totalScore / 100)),
      '文本审核维度评分',
      status,
      now,
      now,
    );

  if (result.type === 'script' && result.episode) {
    getSqlite()
      .prepare(
        `UPDATE script_versions
         SET quality_status = ?, status = CASE WHEN ? = 'passed' THEN 'reviewed' ELSE status END, updated_at = ?
         WHERE id = ?`,
      )
      .run(status, status, now, objectId);
  } else if (textObject.table === 'story_outlines') {
    getSqlite()
      .prepare("UPDATE story_outlines SET quality_gate_id = ?, status = CASE WHEN ? = 'passed' THEN 'reviewed' ELSE status END, updated_at = ? WHERE id = ?")
      .run(id, status, now, objectId);
  } else if (textObject.table === 'adaptation_plans') {
    getSqlite()
      .prepare("UPDATE adaptation_plans SET quality_gate_id = ?, status = CASE WHEN ? = 'passed' THEN 'reviewed' ELSE status END, updated_at = ? WHERE id = ?")
      .run(id, status, now, objectId);
  }

  return id;
}

// ============================================================================
// Phase 10 扩展：视频 QualityGate / 人工豁免 / 双轨审核
//
// 不破坏 Phase 5：保留 recordQualityGateFromReview + 4 私有函数；
// reviewSource 双轨（agent_self_review / manual_review / ai_assisted_manual）；
// waive 必须 operator + reason + scope + timestamp 4 字段；
// 不引入 fetch / drizzle ORM；继续走原生 SQL prepare。
// ============================================================================

export interface VideoQualityGateInput {
  projectIdentifier: string;
  takeId: string;
  trackId?: string;
  taskId?: string;
  episodeIndex?: number;
  protocols: VideoQualityProtocol[];
  reviewSource?: ReviewSource;
  operatorId?: string;
}

/**
 * 视频 QualityGate 入口（spec L86 + L102）：6 维度协议批量写入 + take.quality_status 更新。
 */
export async function recordVideoQualityGate(input: VideoQualityGateInput): Promise<{
  qualityGateIds: string[];
  overallStatus: 'passed' | 'failed';
}> {
  const project = await resolveProject(input.projectIdentifier);
  if (!project) return { qualityGateIds: [], overallStatus: 'failed' };

  const reviewSource: ReviewSource = input.reviewSource ?? 'agent_self_review';
  const now = Date.now();
  const db = getSqlite();
  const ids: string[] = [];
  let allPassed = true;

  for (const protocol of input.protocols) {
    const id = randomUUID();
    const passed = isProtocolPassed(protocol);
    if (!passed) allPassed = false;
    db.prepare(
      `INSERT INTO quality_gates
        (id, project_id, object_type, object_id, metric, status, scope_json,
         denominator, passed_count, failed_items_json, confidence, sampling_rule,
         review_source, operator_decision, waiver_reason,
         take_id, track_id, episode_index, operator_id, task_id,
         created_at, updated_at)
       VALUES (?, ?, 'take', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      project.id,
      input.takeId,
      protocol.metric,
      passed ? 'passed' : 'failed',
      JSON.stringify({ scope: protocol.scope, takeId: input.takeId, trackId: input.trackId ?? null }),
      protocol.denominator,
      protocol.passedCount,
      JSON.stringify(protocol.failedItems ?? []),
      protocol.confidence,
      protocol.samplingRule,
      reviewSource,
      passed ? 'passed' : 'failed',
      input.takeId,
      input.trackId ?? null,
      input.episodeIndex ?? null,
      input.operatorId ?? null,
      input.taskId ?? null,
      now,
      now,
    );
    ids.push(id);
  }

  const overall: 'passed' | 'failed' = allPassed ? 'passed' : 'failed';
  db.prepare(`UPDATE takes SET quality_status = ?, updated_at = ? WHERE id = ? AND project_id = ?`)
    .run(overall, now, input.takeId, project.id);
  return { qualityGateIds: ids, overallStatus: overall };
}

/**
 * 人工审核入口（spec L765 双轨硬约束）。
 * reviewSource = 'manual_review' / 'ai_assisted_manual'；和 agent_self_review 分离。
 */
export interface ManualReviewInput {
  projectIdentifier: string;
  takeId: string;
  trackId?: string;
  metric: VideoQualityMetric | 'text_quality';
  decision: 'passed' | 'failed';
  operatorId: string;
  reviewNote?: string;
  reviewSource?: 'manual_review' | 'ai_assisted_manual';
  failedItems?: Array<{ targetId: string; issueType?: TakeIssueType; note?: string }>;
}

export async function recordManualReview(input: ManualReviewInput): Promise<string | null> {
  const project = await resolveProject(input.projectIdentifier);
  if (!project) return null;

  const reviewSource = input.reviewSource ?? 'manual_review';
  const id = randomUUID();
  const now = Date.now();
  getSqlite()
    .prepare(
      `INSERT INTO quality_gates
        (id, project_id, object_type, object_id, metric, status, scope_json,
         denominator, passed_count, failed_items_json, confidence, sampling_rule,
         review_source, operator_decision, waiver_reason,
         take_id, track_id, operator_id,
         created_at, updated_at)
       VALUES (?, ?, 'take', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      project.id,
      input.takeId,
      input.metric,
      input.decision,
      JSON.stringify({ takeId: input.takeId, trackId: input.trackId ?? null, note: input.reviewNote ?? '' }),
      1,
      input.decision === 'passed' ? 1 : 0,
      JSON.stringify(input.failedItems ?? []),
      1,
      '人工确认',
      reviewSource,
      input.decision,
      input.takeId,
      input.trackId ?? null,
      input.operatorId,
      now,
      now,
    );

  getSqlite()
    .prepare(`UPDATE takes SET quality_status = ?, updated_at = ? WHERE id = ? AND project_id = ?`)
    .run(input.decision, now, input.takeId, project.id);
  return id;
}

/**
 * 人工豁免（spec L89 + L276 + L336 + L600 + L609 + L691 + 验收 L479 硬约束）。
 * 必须 4 字段：operator + reason + scope + timestamp。
 */
export interface WaiveQualityGateInput {
  projectIdentifier: string;
  qualityGateId?: string;
  takeId?: string;
  operatorId: string;
  waiverReason: string;
  scope?: Record<string, unknown>;
  metric?: VideoQualityMetric | 'text_quality';
}

export async function waiveQualityGate(input: WaiveQualityGateInput): Promise<string | null> {
  if (!input.waiverReason || !input.waiverReason.trim()) {
    throw new Error('waiver_reason 不能为空（spec L89 豁免必须记录原因）');
  }
  if (!input.operatorId || !input.operatorId.trim()) {
    throw new Error('operator_id 不能为空（spec L89 豁免必须记录 Operator）');
  }
  const project = await resolveProject(input.projectIdentifier);
  if (!project) return null;

  const now = Date.now();
  const db = getSqlite();
  const scopeJson = JSON.stringify({ ...input.scope, takeId: input.takeId ?? null, waivedAt: now });

  if (input.qualityGateId) {
    db.prepare(
      `UPDATE quality_gates SET status = 'waived', waiver_reason = ?, operator_id = ?, operator_decision = ?, scope_json = ?, updated_at = ? WHERE id = ? AND project_id = ?`,
    ).run(input.waiverReason, input.operatorId, `waived:${input.operatorId}`, scopeJson, now, input.qualityGateId, project.id);
    if (input.takeId) {
      db.prepare(`UPDATE takes SET quality_status = 'waived', updated_at = ? WHERE id = ? AND project_id = ?`)
        .run(now, input.takeId, project.id);
    }
    return input.qualityGateId;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO quality_gates
      (id, project_id, object_type, object_id, metric, status, scope_json,
       denominator, passed_count, failed_items_json, confidence, sampling_rule,
       review_source, operator_decision, waiver_reason,
       take_id, operator_id, created_at, updated_at)
     VALUES (?, ?, 'take', ?, ?, 'waived', ?, 0, 0, '[]', 0, '人工豁免', 'manual_review', ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    project.id,
    input.takeId ?? '',
    input.metric ?? 'compliance',
    scopeJson,
    `waived:${input.operatorId}`,
    input.waiverReason,
    input.takeId ?? null,
    input.operatorId,
    now,
    now,
  );

  if (input.takeId) {
    db.prepare(`UPDATE takes SET quality_status = 'waived', updated_at = ? WHERE id = ? AND project_id = ?`)
      .run(now, input.takeId, project.id);
  }
  return id;
}

/**
 * 查询 Take 当前 QualityGate 状态（spec L600 锁定校验依赖）。
 */
export interface TakeQualityStatus {
  qualityStatus: 'unchecked' | 'passed' | 'failed' | 'waived';
  latestGateId: string | null;
  gates: Array<{
    id: string;
    metric: string;
    status: string;
    reviewSource: string;
    waiverReason: string;
    operatorId: string | null;
    updatedAt: number;
  }>;
}

export async function getQualityStatus(projectIdentifier: string, takeId: string): Promise<TakeQualityStatus> {
  const project = await resolveProject(projectIdentifier);
  if (!project) return { qualityStatus: 'unchecked', latestGateId: null, gates: [] };
  const db = getSqlite();
  const takeRow = db
    .prepare(`SELECT quality_status FROM takes WHERE id = ? AND project_id = ?`)
    .get(takeId, project.id) as { quality_status: string } | undefined;
  const rows = db
    .prepare(
      `SELECT id, metric, status, review_source, waiver_reason, operator_id, updated_at FROM quality_gates WHERE project_id = ? AND (take_id = ? OR object_id = ?) ORDER BY updated_at DESC`,
    )
    .all(project.id, takeId, takeId) as Array<{
    id: string;
    metric: string;
    status: string;
    review_source: string;
    waiver_reason: string;
    operator_id: string | null;
    updated_at: number;
  }>;

  const qualityStatus = (takeRow?.quality_status ?? 'unchecked') as TakeQualityStatus['qualityStatus'];
  return {
    qualityStatus,
    latestGateId: rows[0]?.id ?? null,
    gates: rows.map((row) => ({
      id: row.id,
      metric: row.metric,
      status: row.status,
      reviewSource: row.review_source,
      waiverReason: row.waiver_reason,
      operatorId: row.operator_id,
      updatedAt: row.updated_at,
    })),
  };
}

function isProtocolPassed(protocol: VideoQualityProtocol): boolean {
  if (protocol.metric === 'compliance' && (protocol.failedItems ?? []).length > 0) return false;
  if (protocol.denominator <= 0) return true;
  return protocol.passedCount / protocol.denominator >= 0.85;
}
