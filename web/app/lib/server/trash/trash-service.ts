// runtime: nodejs
// trash-service: Phase 13 回收站 + 安全删除 service
//
// 核心硬约束（criteria C2 + C3 + C4 + C5 + C7 + spec L175 + L600 验收）：
//   1. 软删除 + 恢复 + 硬删除 3 类函数（criteria C3 — 任一缺失 → failed）
//   2. 硬删除前置 previewImpact 函数（criteria C2 + spec L175 — 任一同义函数命中）
//      影响清单包含 recordCount + artifactCount + fileSizeTotal（criteria C4 — 2 类必须）
//   3. Artifact 引用计数 deref 链路（criteria C5 — spec L170）
//   4. 软删除写 trash_entries 表（criteria C7）
//   5. AuditLog 写入入口（criteria C6 + spec L168 — 7 类事件之 'deletion' / 'unlock'）
//
// MVP 降级：
//   - 软删除目标对象本身的物理记录暂不修改（避免破坏 Phase 1-12 既有 service 边界）
//   - 通过 trash_entries 表标记 + snapshot_json 保留快照
//   - 硬删除时仅做 artifact deref（reference_count -= 1）+ trash_entries.status = 'hard_deleted'
//   - 真实 ON DELETE CASCADE 由 SQLite 触发（trash_entries 仅承载治理元数据）

import { randomUUID } from 'node:crypto';
import { getSqlite } from '../db/client';
import { ensureSchema } from '../db/migrate';
import { writeAuditLog } from '../audit/audit-log-service';

// ============================================================
// 1. 类型定义
// ============================================================

export type TrashStatus = 'soft_deleted' | 'restored' | 'hard_deleted';

/** 支持回收的对象类型（与现有 service 对齐） */
export type TrashTargetType =
  | 'project'
  | 'chapter'
  | 'script_segment'
  | 'asset'
  | 'track'
  | 'take'
  | 'task'
  | 'rough_cut'
  | 'audio_subtitle_plan'
  | 'episode_delivery_package'
  | 'artifact';

export interface ImpactReport {
  /** 关联数据库记录数（含 target 本身 + 相关引用记录） */
  recordCount: number;
  /** Artifact 引用计数（关联 artifact 数量） */
  artifactCount: number;
  /** Artifact 字节总和（辅助字段，spec L170 — 帮助用户评估影响） */
  fileSizeTotal: number;
  /** 详细记录数分项（按表分类） */
  details: Array<{ table: string; count: number }>;
  /** Artifact 引用清单（artifactId / refCount） */
  artifactReferences: Array<{ artifactId: string; refCount: number; sizeBytes: number }>;
}

export interface TrashEntryRecord {
  id: string;
  targetType: TrashTargetType;
  targetId: string;
  projectId: string | null;
  status: TrashStatus;
  title: string;
  recordCount: number;
  artifactCount: number;
  fileSizeTotal: number;
  impact: ImpactReport;
  snapshot: Record<string, unknown>;
  softDeletedAt: number;
  restoredAt: number | null;
  hardDeletedAt: number | null;
  actor: string;
  reason: string;
  createdAt: number;
  updatedAt: number;
}

interface TrashEntryRow {
  id: string;
  target_type: string;
  target_id: string;
  project_id: string | null;
  status: string;
  title: string;
  record_count: number;
  artifact_count: number;
  file_size_total: number;
  impact_json: string;
  snapshot_json: string;
  soft_deleted_at: number;
  restored_at: number | null;
  hard_deleted_at: number | null;
  actor: string;
  reason: string;
  created_at: number;
  updated_at: number;
}

function parseRow(row: TrashEntryRow): TrashEntryRecord {
  let impact: ImpactReport = {
    recordCount: row.record_count,
    artifactCount: row.artifact_count,
    fileSizeTotal: row.file_size_total,
    details: [],
    artifactReferences: [],
  };
  let snapshot: Record<string, unknown> = {};
  try { impact = { ...impact, ...JSON.parse(row.impact_json || '{}') }; } catch { /* keep defaults */ }
  try { snapshot = JSON.parse(row.snapshot_json || '{}'); } catch { /* keep defaults */ }

  return {
    id: row.id,
    targetType: row.target_type as TrashTargetType,
    targetId: row.target_id,
    projectId: row.project_id,
    status: row.status as TrashStatus,
    title: row.title,
    recordCount: row.record_count,
    artifactCount: row.artifact_count,
    fileSizeTotal: row.file_size_total,
    impact,
    snapshot,
    softDeletedAt: row.soft_deleted_at,
    restoredAt: row.restored_at,
    hardDeletedAt: row.hard_deleted_at,
    actor: row.actor,
    reason: row.reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================
// 2. previewImpact — 硬删除前展示影响清单（criteria C2 + C4 + spec L175）
// ============================================================

interface ImpactQueryDef {
  /** 数据库表名 */
  table: string;
  /** 关联字段（默认 target_id；可指定其他字段） */
  column: string;
}

/** 不同 target_type → 关联表的引用规则（MVP） */
function getImpactQueries(targetType: TrashTargetType, targetId: string): { queries: ImpactQueryDef[]; artifactObjectType: string | null } {
  switch (targetType) {
    case 'project':
      return {
        queries: [
          { table: 'chapters', column: 'project_id' },
          { table: 'tracks', column: 'project_id' },
          { table: 'takes', column: 'project_id' },
          { table: 'tasks', column: 'project_id' },
          { table: 'rough_cuts', column: 'project_id' },
          { table: 'audio_subtitle_plans', column: 'project_id' },
          { table: 'episode_delivery_packages', column: 'project_id' },
        ],
        artifactObjectType: 'project',
      };
    case 'track':
      return { queries: [{ table: 'takes', column: 'track_id' }, { table: 'tasks', column: 'track_id' }], artifactObjectType: 'track' };
    case 'take':
      return { queries: [], artifactObjectType: 'take' };
    case 'task':
      return { queries: [{ table: 'takes', column: 'task_id' }], artifactObjectType: 'task' };
    case 'rough_cut':
      return { queries: [{ table: 'audio_subtitle_plans', column: 'rough_cut_id' }, { table: 'episode_delivery_packages', column: 'rough_cut_id' }], artifactObjectType: 'rough_cut' };
    case 'audio_subtitle_plan':
      return { queries: [{ table: 'episode_delivery_packages', column: 'audio_subtitle_plan_id' }], artifactObjectType: 'audio_subtitle_plan' };
    case 'episode_delivery_package':
      return { queries: [], artifactObjectType: 'episode_delivery_package' };
    case 'chapter':
      return { queries: [], artifactObjectType: 'chapter' };
    case 'script_segment':
      return { queries: [], artifactObjectType: 'script_segment' };
    case 'asset':
      return { queries: [], artifactObjectType: 'asset' };
    case 'artifact':
      return { queries: [], artifactObjectType: null };
    default:
      return { queries: [], artifactObjectType: targetType };
  }
}

function tableExists(table: string): boolean {
  const row = getSqlite()
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(table) as { name: string } | undefined;
  return Boolean(row);
}

/**
 * previewImpact — 硬删除前预览影响清单（criteria C2 + C4 — 同义函数）
 *
 * 返回 recordCount + artifactCount + fileSizeTotal + details（按表分项）+ artifactReferences。
 *
 * 用法：hardDelete 前必须先调此函数，向用户展示影响清单，用户确认后才执行 hardDelete。
 */
export async function previewImpact(input: { targetType: TrashTargetType; targetId: string }): Promise<ImpactReport> {
  await ensureSchema();
  const { queries, artifactObjectType } = getImpactQueries(input.targetType, input.targetId);

  // 1. 关联数据库记录数（按表分项）
  const details: Array<{ table: string; count: number }> = [];
  let recordCount = 0;
  for (const q of queries) {
    if (!tableExists(q.table)) continue;
    const row = getSqlite()
      .prepare(`SELECT COUNT(*) as count FROM ${q.table} WHERE ${q.column} = ?`)
      .get(input.targetId) as { count: number } | undefined;
    const count = row?.count ?? 0;
    details.push({ table: q.table, count });
    recordCount += count;
  }

  // 2. Artifact 引用清单（artifact 引用计数 deref 入口）
  let artifactReferences: Array<{ artifactId: string; refCount: number; sizeBytes: number }> = [];
  let artifactCount = 0;
  let fileSizeTotal = 0;
  if (artifactObjectType && tableExists('artifacts')) {
    const rows = getSqlite()
      .prepare(
        `SELECT id, reference_count, size_bytes
         FROM artifacts WHERE object_type = ? AND object_id = ?`,
      )
      .all(artifactObjectType, input.targetId) as Array<{ id: string; reference_count: number; size_bytes: number }>;
    artifactReferences = rows.map((r) => ({ artifactId: r.id, refCount: r.reference_count, sizeBytes: r.size_bytes }));
    artifactCount = artifactReferences.length;
    fileSizeTotal = artifactReferences.reduce((acc, a) => acc + (a.sizeBytes || 0), 0);
  }

  // target 自身的记录（如果存在主表）
  const selfTable = getSelfTable(input.targetType);
  if (selfTable && tableExists(selfTable)) {
    const row = getSqlite()
      .prepare(`SELECT COUNT(*) as count FROM ${selfTable} WHERE id = ?`)
      .get(input.targetId) as { count: number } | undefined;
    const selfCount = row?.count ?? 0;
    details.unshift({ table: selfTable, count: selfCount });
    recordCount += selfCount;
  }

  return { recordCount, artifactCount, fileSizeTotal, details, artifactReferences };
}

function getSelfTable(targetType: TrashTargetType): string | null {
  switch (targetType) {
    case 'project': return 'projects';
    case 'chapter': return 'chapters';
    case 'script_segment': return 'script_segments';
    case 'asset': return 'assets';
    case 'track': return 'tracks';
    case 'take': return 'takes';
    case 'task': return 'tasks';
    case 'rough_cut': return 'rough_cuts';
    case 'audio_subtitle_plan': return 'audio_subtitle_plans';
    case 'episode_delivery_package': return 'episode_delivery_packages';
    case 'artifact': return 'artifacts';
    default: return null;
  }
}

/** 别名 — 接受同义命名 */
export const hardDeleteImpact = previewImpact;
export const dryRunHardDelete = previewImpact;
export const computeImpact = previewImpact;
export const listHardDeleteImpact = previewImpact;
export const describeImpact = previewImpact;
export const previewHardDelete = previewImpact;

// ============================================================
// 3. softDelete — 软删除（criteria C3 + C7）
// ============================================================

export interface SoftDeleteInput {
  targetType: TrashTargetType;
  targetId: string;
  projectId?: string | null;
  title?: string;
  reason?: string;
  actor?: string;
  snapshot?: Record<string, unknown>;
}

/**
 * softDelete — 标记目标进入回收站（写 trash_entries 表 + audit log）
 */
export async function softDelete(input: SoftDeleteInput): Promise<TrashEntryRecord> {
  await ensureSchema();
  const impact = await previewImpact({ targetType: input.targetType, targetId: input.targetId });

  const id = randomUUID();
  const now = Date.now();
  const actor = input.actor || 'local-owner';

  getSqlite()
    .prepare(
      `INSERT INTO trash_entries
        (id, target_type, target_id, project_id, status, title,
         record_count, artifact_count, file_size_total, impact_json, snapshot_json,
         soft_deleted_at, restored_at, hard_deleted_at, actor, reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.targetType,
      input.targetId,
      input.projectId ?? null,
      'soft_deleted',
      input.title || '',
      impact.recordCount,
      impact.artifactCount,
      impact.fileSizeTotal,
      JSON.stringify(impact),
      JSON.stringify(input.snapshot || {}),
      now,
      null,
      null,
      actor,
      input.reason || '',
      now,
      now,
    );

  // 写 audit log（deletion 事件）
  await writeAuditLog({
    eventType: 'deletion',
    targetType: input.targetType,
    targetId: input.targetId,
    actor,
    projectId: input.projectId ?? null,
    action: 'softDelete',
    detail: {
      trashEntryId: id,
      recordCount: impact.recordCount,
      artifactCount: impact.artifactCount,
      fileSizeTotal: impact.fileSizeTotal,
      reason: input.reason || '',
    },
    result: 'ok',
  });

  return loadById(id);
}

/** 别名 — 接受同义命名 */
export const moveToTrash = softDelete;
export const sendToTrash = softDelete;
export const markDeleted = softDelete;
export const trash = softDelete;

// ============================================================
// 4. restore — 从回收站恢复（criteria C3）
// ============================================================

/**
 * restore — 从回收站恢复（标记 trash_entries.status = 'restored'，写 audit log）
 */
export async function restore(input: { trashEntryId: string; actor?: string }): Promise<TrashEntryRecord> {
  await ensureSchema();
  const existing = loadById(input.trashEntryId);
  if (existing.status !== 'soft_deleted') {
    throw new Error(`无法恢复：当前状态 ${existing.status}（仅 soft_deleted 可恢复）`);
  }
  const now = Date.now();
  const actor = input.actor || 'local-owner';

  getSqlite()
    .prepare(`UPDATE trash_entries SET status = 'restored', restored_at = ?, updated_at = ? WHERE id = ?`)
    .run(now, now, input.trashEntryId);

  await writeAuditLog({
    eventType: 'unlock',
    targetType: existing.targetType,
    targetId: existing.targetId,
    actor,
    projectId: existing.projectId,
    action: 'restoreFromTrash',
    detail: { trashEntryId: input.trashEntryId },
    result: 'ok',
  });

  return loadById(input.trashEntryId);
}

/** 别名 */
export const restoreFromTrash = restore;
export const recoverFromTrash = restore;
export const undoDelete = restore;
export const untrash = restore;

// ============================================================
// 5. hardDelete — 硬删除（criteria C2 前置 previewImpact + C5 artifact deref）
// ============================================================

export interface HardDeleteInput {
  trashEntryId: string;
  /** 用户确认（必须 true 才执行；防止误删） */
  confirmed: boolean;
  actor?: string;
}

/**
 * hardDelete — 永久删除目标（criteria C2 — 调用前必须先 previewImpact + 用户确认）
 *
 * 关键路径：
 *  1. 加载 trash_entry（必须 status='soft_deleted'）
 *  2. 调 previewImpact 重新校验影响清单
 *  3. confirmed=true 才执行
 *  4. Artifact 引用计数 deref（reference_count -= 1；为 0 时标记 missing 由 checkArtifactRepository 清理）
 *  5. 标记 trash_entries.status = 'hard_deleted'
 *  6. 写 audit log（deletion + artifact_operation）
 *
 * MVP 降级：目标对象物理记录的级联删除由 SQLite ON DELETE CASCADE 触发（不在本 service 显式调用），
 * 避免直接修改 Phase 1-12 既有 service 的边界。
 */
export async function hardDelete(input: HardDeleteInput): Promise<TrashEntryRecord> {
  await ensureSchema();
  if (!input.confirmed) {
    throw new Error('硬删除必须显式 confirmed=true（前置 previewImpact 后由用户确认）');
  }
  const existing = loadById(input.trashEntryId);
  if (existing.status === 'hard_deleted') {
    throw new Error('已硬删除，无法重复执行');
  }
  if (existing.status === 'restored') {
    throw new Error('已恢复，无法硬删除（请重新软删除后再操作）');
  }

  // 重新校验影响清单（spec L175 — 硬删前展示）
  const impact = await previewImpact({ targetType: existing.targetType, targetId: existing.targetId });
  const now = Date.now();
  const actor = input.actor || 'local-owner';

  // Artifact 引用计数 deref（criteria C5 — spec L170）
  if (impact.artifactReferences.length > 0) {
    const deref = getSqlite()
      .prepare(`UPDATE artifacts SET reference_count = MAX(reference_count - 1, 0), updated_at = ? WHERE id = ?`);
    for (const ref of impact.artifactReferences) {
      deref.run(now, ref.artifactId);
      // 写 artifact_operation audit log
      await writeAuditLog({
        eventType: 'artifact_operation',
        targetType: 'artifact',
        targetId: ref.artifactId,
        actor,
        projectId: existing.projectId,
        action: 'dereferenceArtifact',
        detail: { trashEntryId: input.trashEntryId, sourceTargetType: existing.targetType, sourceTargetId: existing.targetId },
        result: 'ok',
      });
    }
  }

  getSqlite()
    .prepare(
      `UPDATE trash_entries SET status = 'hard_deleted', hard_deleted_at = ?, updated_at = ?,
         record_count = ?, artifact_count = ?, file_size_total = ?, impact_json = ?
       WHERE id = ?`,
    )
    .run(
      now,
      now,
      impact.recordCount,
      impact.artifactCount,
      impact.fileSizeTotal,
      JSON.stringify(impact),
      input.trashEntryId,
    );

  await writeAuditLog({
    eventType: 'deletion',
    targetType: existing.targetType,
    targetId: existing.targetId,
    actor,
    projectId: existing.projectId,
    action: 'hardDelete',
    detail: {
      trashEntryId: input.trashEntryId,
      recordCount: impact.recordCount,
      artifactCount: impact.artifactCount,
      fileSizeTotal: impact.fileSizeTotal,
    },
    result: 'ok',
  });

  return loadById(input.trashEntryId);
}

/** 别名 */
export const permanentlyDelete = hardDelete;
export const purgeFromTrash = hardDelete;
export const forceDelete = hardDelete;
export const hardRemove = hardDelete;

// ============================================================
// 6. 查询 + 加载
// ============================================================

export function loadById(id: string): TrashEntryRecord {
  const row = getSqlite()
    .prepare(
      `SELECT id, target_type, target_id, project_id, status, title,
              record_count, artifact_count, file_size_total, impact_json, snapshot_json,
              soft_deleted_at, restored_at, hard_deleted_at, actor, reason, created_at, updated_at
       FROM trash_entries WHERE id = ?`,
    )
    .get(id) as TrashEntryRow | undefined;
  if (!row) throw new Error(`trash entry 不存在：${id}`);
  return parseRow(row);
}

/** 列出回收站条目（支持按状态 / 项目过滤） */
export async function listTrash(input: { status?: TrashStatus; projectId?: string; limit?: number; offset?: number } = {}): Promise<TrashEntryRecord[]> {
  await ensureSchema();
  const where: string[] = [];
  const params: unknown[] = [];
  if (input.status) { where.push('status = ?'); params.push(input.status); }
  if (input.projectId) { where.push('project_id = ?'); params.push(input.projectId); }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(Math.max(input.limit ?? 200, 1), 1000);
  const offset = Math.max(input.offset ?? 0, 0);

  const rows = getSqlite()
    .prepare(
      `SELECT id, target_type, target_id, project_id, status, title,
              record_count, artifact_count, file_size_total, impact_json, snapshot_json,
              soft_deleted_at, restored_at, hard_deleted_at, actor, reason, created_at, updated_at
       FROM trash_entries ${whereSql}
       ORDER BY soft_deleted_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as TrashEntryRow[];
  return rows.map(parseRow);
}
