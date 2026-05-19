// runtime: nodejs
// track-plan-service: TrackPlan / Track / TrackSegment CRUD + 锁定 + revision 乐观锁
// 沿用 Phase 4 chapters service 的 revision 乐观锁模式 + prepare(?) 原生 SQL（不引入 drizzle）
//
// 主要导出：
//   - getTrackPlan / loadTrackPlan         加载或新建一份 TrackPlan
//   - listTracks                            列出某 TrackPlan 下所有 Track
//   - createTrack                           新增 Track
//   - updateTrack                           更新 Track（含 revision 乐观锁）
//   - splitTrack                            拆分 Track（按时长切分）
//   - lockTrack                             锁定 Track（提交前冻结）
//   - lockTrackPlan                         整批锁定 TrackPlan
//   - updateTrackStrategy                   仅更新策略 + reason
//   - getTrackContext                       将 Track 转成 dependency-check 的 TrackContext

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ensureSchema } from '../db/migrate';
import { getSqlite, runInTransaction } from '../db/client';
import { getProject } from '../projects/project-service';
import type { StrategyId } from './strategy-decision';
import { STRATEGY_IDS } from './strategy-decision';
import type { DependencyStatus, TrackContext } from '../production/dependency-check';

const StrategySchema = z.enum([
  'multi_reference_text',
  'start_frame',
  'first_last_frame',
  'multi_keyframe',
  'continue_from_previous',
]);

const TrackCreateSchema = z.object({
  orderIndex: z.number().int().nonnegative().optional(),
  objective: z.string().max(2000).optional().default(''),
  motion: z.string().max(2000).optional().default(''),
  shot: z.string().max(500).optional().default(''),
  lipSync: z.string().max(2000).optional().default(''),
  mood: z.string().max(500).optional().default(''),
  referenceAssets: z.array(z.string()).optional().default([]),
  durationSeconds: z.number().nonnegative().optional().default(0),
  strategy: StrategySchema.optional().default('start_frame'),
});

const TrackPatchSchema = z.object({
  objective: z.string().max(2000).optional(),
  motion: z.string().max(2000).optional(),
  shot: z.string().max(500).optional(),
  lipSync: z.string().max(2000).optional(),
  mood: z.string().max(500).optional(),
  referenceAssets: z.array(z.string()).optional(),
  durationSeconds: z.number().nonnegative().optional(),
  strategy: StrategySchema.optional(),
  strategyReason: z.string().max(500).optional(),
  dependencyStatus: z.enum(['ready', 'blocked', 'partial']).optional(),
  dependencyMissing: z.array(z.unknown()).optional(),
  revision: z.number().int().positive(),
});

const SplitSchema = z.object({
  trackId: z.string().min(1),
  splitAtSeconds: z.number().positive(),
  revision: z.number().int().positive(),
});

interface TrackPlanRow {
  id: string;
  project_id: string;
  episode_id: string | null;
  episode_index: number;
  status: string;
  revision: number;
  strategy_summary_json: string;
  budget_estimate_json: string;
  locked_at: number | null;
  created_at: number;
  updated_at: number;
}

interface TrackRow {
  id: string;
  track_plan_id: string;
  project_id: string;
  episode_id: string | null;
  order_index: number;
  objective: string;
  motion: string;
  shot: string;
  lip_sync: string;
  mood: string;
  reference_assets_json: string;
  duration_seconds: number;
  strategy: string;
  strategy_reason: string;
  dependency_status: string;
  dependency_missing_json: string;
  revision: number;
  status: string;
  locked_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface TrackRecord {
  id: string;
  trackPlanId: string;
  orderIndex: number;
  objective: string;
  motion: string;
  shot: string;
  lipSync: string;
  mood: string;
  referenceAssets: string[];
  durationSeconds: number;
  strategy: StrategyId;
  strategyReason: string;
  dependencyStatus: DependencyStatus;
  dependencyMissing: unknown[];
  revision: number;
  status: string;
  lockedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface TrackPlanRecord {
  id: string;
  projectId: string;
  episodeIndex: number;
  status: string;
  revision: number;
  strategySummary: Record<string, unknown>;
  budgetEstimate: Record<string, unknown>;
  lockedAt: number | null;
  createdAt: number;
  updatedAt: number;
  tracks: TrackRecord[];
}

function normalizeIdentifier(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function resolveProject(identifier: string) {
  await ensureSchema();
  const project = await getProject(normalizeIdentifier(identifier));
  if (!project) throw new Error('项目不存在');
  return project;
}

function parseJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isValidStrategy(value: string): value is StrategyId {
  return (STRATEGY_IDS as readonly string[]).includes(value);
}

function mapTrack(row: TrackRow): TrackRecord {
  return {
    id: row.id,
    trackPlanId: row.track_plan_id,
    orderIndex: row.order_index,
    objective: row.objective,
    motion: row.motion,
    shot: row.shot,
    lipSync: row.lip_sync,
    mood: row.mood,
    referenceAssets: parseJsonArray(row.reference_assets_json).map(String),
    durationSeconds: row.duration_seconds,
    strategy: isValidStrategy(row.strategy) ? row.strategy : 'start_frame',
    strategyReason: row.strategy_reason,
    dependencyStatus: (row.dependency_status as DependencyStatus) || 'blocked',
    dependencyMissing: parseJsonArray(row.dependency_missing_json),
    revision: row.revision,
    status: row.status,
    lockedAt: row.locked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTrackPlan(row: TrackPlanRow, tracks: TrackRecord[]): TrackPlanRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    episodeIndex: row.episode_index,
    status: row.status,
    revision: row.revision,
    strategySummary: parseJsonObject(row.strategy_summary_json),
    budgetEstimate: parseJsonObject(row.budget_estimate_json),
    lockedAt: row.locked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tracks,
  };
}

/**
 * 加载或新建 TrackPlan（每个 episode 一份）
 */
export async function loadTrackPlan(projectIdentifier: string, episodeIndex: number): Promise<TrackPlanRecord> {
  const project = await resolveProject(projectIdentifier);
  const db = getSqlite();
  let row = db
    .prepare(
      `SELECT * FROM track_plans
       WHERE project_id = ? AND episode_index = ? AND deleted_at IS NULL`,
    )
    .get(project.id, episodeIndex) as TrackPlanRow | undefined;

  if (!row) {
    const now = Date.now();
    const id = randomUUID();
    db.prepare(
      `INSERT INTO track_plans
        (id, project_id, episode_id, episode_index, status, revision,
         strategy_summary_json, budget_estimate_json, created_at, updated_at)
       VALUES (?, ?, NULL, ?, 'draft', 1, '{}', '{}', ?, ?)`,
    ).run(id, project.id, episodeIndex, now, now);
    row = db.prepare('SELECT * FROM track_plans WHERE id = ?').get(id) as TrackPlanRow;
  }

  const tracks = await listTracks(project.id, row.id);
  return mapTrackPlan(row, tracks);
}

/**
 * 列出某 TrackPlan 下的所有 Track
 */
export async function listTracks(projectIdentifier: string, trackPlanId?: string, episodeIndex?: number): Promise<TrackRecord[]> {
  const project = await resolveProject(projectIdentifier);
  let planId = trackPlanId;
  if (!planId && typeof episodeIndex === 'number') {
    const plan = await loadTrackPlan(project.id, episodeIndex);
    planId = plan.id;
  }
  if (!planId) {
    const planRow = getSqlite()
      .prepare(
        `SELECT id FROM track_plans
         WHERE project_id = ? AND deleted_at IS NULL
         ORDER BY episode_index ASC LIMIT 1`,
      )
      .get(project.id) as { id: string } | undefined;
    if (!planRow) return [];
    planId = planRow.id;
  }
  const rows = getSqlite()
    .prepare(
      `SELECT * FROM tracks
       WHERE track_plan_id = ? AND deleted_at IS NULL
       ORDER BY order_index ASC, created_at ASC`,
    )
    .all(planId) as TrackRow[];
  return rows.map(mapTrack);
}

/**
 * 新建 Track
 */
export async function createTrack(projectIdentifier: string, trackPlanId: string, rawInput: unknown): Promise<TrackRecord> {
  const project = await resolveProject(projectIdentifier);
  const input = TrackCreateSchema.parse(rawInput);
  const db = getSqlite();

  // 校验 trackPlan 归属
  const plan = db.prepare('SELECT id FROM track_plans WHERE id = ? AND project_id = ?').get(trackPlanId, project.id) as { id: string } | undefined;
  if (!plan) throw new Error('TrackPlan 不存在');

  const id = randomUUID();
  const now = Date.now();
  let orderIndex = input.orderIndex;
  if (typeof orderIndex !== 'number') {
    const maxRow = db
      .prepare('SELECT MAX(order_index) AS max_idx FROM tracks WHERE track_plan_id = ? AND deleted_at IS NULL')
      .get(trackPlanId) as { max_idx: number | null };
    orderIndex = (maxRow.max_idx ?? -1) + 1;
  }
  db.prepare(
    `INSERT INTO tracks
      (id, track_plan_id, project_id, episode_id, order_index, objective, motion, shot, lip_sync, mood,
       reference_assets_json, duration_seconds, strategy, strategy_reason, dependency_status,
       dependency_missing_json, revision, status, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'blocked', '[]', 1, 'draft', ?, ?)`,
  ).run(
    id,
    trackPlanId,
    project.id,
    orderIndex,
    input.objective,
    input.motion,
    input.shot,
    input.lipSync,
    input.mood,
    JSON.stringify(input.referenceAssets),
    input.durationSeconds,
    input.strategy,
    now,
    now,
  );

  const row = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as TrackRow;
  return mapTrack(row);
}

/**
 * 更新 Track（含 revision 乐观锁 — 沿用 Phase 4 chapters 模式）
 * - revision 不匹配 → throw '版本冲突'（API 层应返回 409 CONFLICT）
 */
export async function updateTrack(projectIdentifier: string, trackId: string, rawInput: unknown): Promise<TrackRecord> {
  const project = await resolveProject(projectIdentifier);
  const input = TrackPatchSchema.parse(rawInput);
  const db = getSqlite();

  const current = db
    .prepare('SELECT * FROM tracks WHERE id = ? AND project_id = ? AND deleted_at IS NULL')
    .get(trackId, project.id) as TrackRow | undefined;
  if (!current) throw new Error('Track 不存在');
  if (current.status === 'locked') throw new Error('Track 已锁定，不可修改');

  // revision 乐观锁校验
  if (input.revision !== current.revision) {
    const err = new Error(`revision mismatch: 期望 ${current.revision}，实际 ${input.revision}（CONFLICT）`);
    (err as Error & { code?: string }).code = 'REVISION_CONFLICT';
    throw err;
  }

  const next: Partial<TrackRow> = {};
  if (input.objective !== undefined) next.objective = input.objective;
  if (input.motion !== undefined) next.motion = input.motion;
  if (input.shot !== undefined) next.shot = input.shot;
  if (input.lipSync !== undefined) next.lip_sync = input.lipSync;
  if (input.mood !== undefined) next.mood = input.mood;
  if (input.referenceAssets !== undefined) next.reference_assets_json = JSON.stringify(input.referenceAssets);
  if (input.durationSeconds !== undefined) next.duration_seconds = input.durationSeconds;
  if (input.strategy !== undefined) next.strategy = input.strategy;
  if (input.strategyReason !== undefined) next.strategy_reason = input.strategyReason;
  if (input.dependencyStatus !== undefined) next.dependency_status = input.dependencyStatus;
  if (input.dependencyMissing !== undefined) next.dependency_missing_json = JSON.stringify(input.dependencyMissing);

  // revision 在 SQL WHERE 中再次校验（防止并发更新）
  const now = Date.now();
  const result = db
    .prepare(
      `UPDATE tracks
       SET objective = COALESCE(?, objective),
           motion = COALESCE(?, motion),
           shot = COALESCE(?, shot),
           lip_sync = COALESCE(?, lip_sync),
           mood = COALESCE(?, mood),
           reference_assets_json = COALESCE(?, reference_assets_json),
           duration_seconds = COALESCE(?, duration_seconds),
           strategy = COALESCE(?, strategy),
           strategy_reason = COALESCE(?, strategy_reason),
           dependency_status = COALESCE(?, dependency_status),
           dependency_missing_json = COALESCE(?, dependency_missing_json),
           revision = revision + 1,
           updated_at = ?
       WHERE id = ? AND revision = ?`,
    )
    .run(
      next.objective ?? null,
      next.motion ?? null,
      next.shot ?? null,
      next.lip_sync ?? null,
      next.mood ?? null,
      next.reference_assets_json ?? null,
      next.duration_seconds ?? null,
      next.strategy ?? null,
      next.strategy_reason ?? null,
      next.dependency_status ?? null,
      next.dependency_missing_json ?? null,
      now,
      trackId,
      current.revision,
    );
  if (result.changes === 0) {
    const err = new Error('revision mismatch: 并发冲突（CONFLICT）');
    (err as Error & { code?: string }).code = 'REVISION_CONFLICT';
    throw err;
  }

  const row = db.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId) as TrackRow;
  return mapTrack(row);
}

/**
 * 仅更新策略 + reason（让 strategy-decision 结果落库；不需要 revision，但仍递增）
 */
export async function updateTrackStrategy(
  projectIdentifier: string,
  trackId: string,
  strategy: StrategyId,
  reason: string,
): Promise<TrackRecord> {
  const project = await resolveProject(projectIdentifier);
  const db = getSqlite();
  const now = Date.now();
  const result = db
    .prepare(
      `UPDATE tracks
       SET strategy = ?, strategy_reason = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND project_id = ? AND deleted_at IS NULL`,
    )
    .run(strategy, reason, now, trackId, project.id);
  if (result.changes === 0) throw new Error('Track 不存在或已删除');
  const row = db.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId) as TrackRow;
  return mapTrack(row);
}

/**
 * 拆分 Track（spec L271：按时长切分一个 Track → 两个 Track）
 */
export async function splitTrack(projectIdentifier: string, rawInput: unknown): Promise<TrackRecord[]> {
  const project = await resolveProject(projectIdentifier);
  const input = SplitSchema.parse(rawInput);
  const db = getSqlite();

  return runInTransaction(() => {
    const current = db
      .prepare('SELECT * FROM tracks WHERE id = ? AND project_id = ? AND deleted_at IS NULL')
      .get(input.trackId, project.id) as TrackRow | undefined;
    if (!current) throw new Error('Track 不存在');
    if (current.status === 'locked') throw new Error('Track 已锁定，不可拆分');
    if (input.revision !== current.revision) {
      const err = new Error(`revision mismatch: 拆分前 Track 已被更新（CONFLICT）`);
      (err as Error & { code?: string }).code = 'REVISION_CONFLICT';
      throw err;
    }
    if (input.splitAtSeconds >= current.duration_seconds) {
      throw new Error('拆分点必须小于 Track 总时长');
    }

    const now = Date.now();
    const remainDuration = current.duration_seconds - input.splitAtSeconds;

    // 1. 更新原 Track 时长 = splitAtSeconds
    db.prepare(
      `UPDATE tracks
       SET duration_seconds = ?, revision = revision + 1, updated_at = ?
       WHERE id = ?`,
    ).run(input.splitAtSeconds, now, current.id);

    // 2. 后续 Track 的 order_index +1（腾出位置）
    db.prepare(
      `UPDATE tracks
       SET order_index = order_index + 1, updated_at = ?
       WHERE track_plan_id = ? AND order_index > ? AND deleted_at IS NULL`,
    ).run(now, current.track_plan_id, current.order_index);

    // 3. 新建后半段 Track
    const newId = randomUUID();
    db.prepare(
      `INSERT INTO tracks
        (id, track_plan_id, project_id, episode_id, order_index, objective, motion, shot, lip_sync, mood,
         reference_assets_json, duration_seconds, strategy, strategy_reason, dependency_status,
         dependency_missing_json, revision, status, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'blocked', '[]', 1, 'draft', ?, ?)`,
    ).run(
      newId,
      current.track_plan_id,
      current.project_id,
      current.order_index + 1,
      current.objective + '（拆分后半）',
      current.motion,
      current.shot,
      current.lip_sync,
      current.mood,
      current.reference_assets_json,
      remainDuration,
      current.strategy,
      current.strategy_reason,
      now,
      now,
    );

    const a = db.prepare('SELECT * FROM tracks WHERE id = ?').get(current.id) as TrackRow;
    const b = db.prepare('SELECT * FROM tracks WHERE id = ?').get(newId) as TrackRow;
    return [mapTrack(a), mapTrack(b)];
  });
}

/**
 * 锁定单个 Track（提交前冻结）
 */
export async function lockTrack(projectIdentifier: string, trackId: string, revision: number): Promise<TrackRecord> {
  const project = await resolveProject(projectIdentifier);
  const db = getSqlite();
  const now = Date.now();
  const result = db
    .prepare(
      `UPDATE tracks
       SET status = 'locked', locked_at = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND project_id = ? AND revision = ? AND deleted_at IS NULL`,
    )
    .run(now, now, trackId, project.id, revision);
  if (result.changes === 0) {
    const err = new Error('revision mismatch: 锁定前 Track 已被更新（CONFLICT）');
    (err as Error & { code?: string }).code = 'REVISION_CONFLICT';
    throw err;
  }
  const row = db.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId) as TrackRow;
  return mapTrack(row);
}

/**
 * 整批锁定 TrackPlan（path5 提交时调用）
 */
export async function lockTrackPlan(projectIdentifier: string, trackPlanId: string): Promise<TrackPlanRecord> {
  const project = await resolveProject(projectIdentifier);
  const db = getSqlite();
  const now = Date.now();

  return runInTransaction(() => {
    const plan = db
      .prepare('SELECT * FROM track_plans WHERE id = ? AND project_id = ? AND deleted_at IS NULL')
      .get(trackPlanId, project.id) as TrackPlanRow | undefined;
    if (!plan) throw new Error('TrackPlan 不存在');

    db.prepare(
      `UPDATE tracks
       SET status = 'locked', locked_at = ?, revision = revision + 1, updated_at = ?
       WHERE track_plan_id = ? AND status != 'locked' AND deleted_at IS NULL`,
    ).run(now, now, trackPlanId);

    db.prepare(
      `UPDATE track_plans
       SET status = 'locked', locked_at = ?, revision = revision + 1, updated_at = ?
       WHERE id = ?`,
    ).run(now, now, trackPlanId);

    const row = db.prepare('SELECT * FROM track_plans WHERE id = ?').get(trackPlanId) as TrackPlanRow;
    const tracks = db
      .prepare(
        `SELECT * FROM tracks WHERE track_plan_id = ? AND deleted_at IS NULL ORDER BY order_index ASC`,
      )
      .all(trackPlanId) as TrackRow[];
    return mapTrackPlan(row, tracks.map(mapTrack));
  });
}

/**
 * 将 TrackRecord 转换为 dependency-check 的 TrackContext
 */
export function buildTrackContext(record: TrackRecord, options: { projectIdentifier: string; hasPreviousTail?: boolean } = { projectIdentifier: '' }): TrackContext {
  const refCount = record.referenceAssets.length;
  // 资源类型识别（简单约定：以 first_frame / last_frame / keyframe / reference 前缀区分）
  const refTypes = record.referenceAssets.map((s) => s.toLowerCase());
  const hasFirstFrame = refTypes.some((s) => s.includes('first_frame') || s.includes('first-frame') || s.startsWith('first:'));
  const hasLastFrame = refTypes.some((s) => s.includes('last_frame') || s.includes('last-frame') || s.startsWith('last:'));
  const keyframeCount = refTypes.filter((s) => s.includes('keyframe')).length;
  const hasTextPrompt = (record.objective + record.motion + record.shot).trim().length > 0;

  return {
    trackId: record.id,
    strategy: record.strategy,
    referenceAssetCount: refCount,
    hasFirstFrame,
    hasLastFrame,
    keyframeCount,
    hasPreviousTail: options.hasPreviousTail ?? false,
    hasTextPrompt,
    projectIdentifier: options.projectIdentifier,
  };
}
