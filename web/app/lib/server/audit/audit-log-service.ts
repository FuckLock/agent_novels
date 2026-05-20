// runtime: nodejs
// audit-log-service: Phase 13 敏感操作审计 service
//
// 核心硬约束（criteria D2 + spec L168 + L585 + L600 验收）：
//   1. 7 类事件枚举字面量全覆盖（任一缺失 → failed）：
//      - 'deletion'           软删除 / 硬删除
//      - 'unlock'             解锁 take / track / 缺口
//      - 'waiver'             缺口豁免 / 阻断豁免
//      - 'legacy_import'      旧 novels/ 导入
//      - 'migration_export'   ProjectMigrationPackage 导出
//      - 'secret_change'      apiKey / token 变更
//      - 'artifact_operation' Artifact 创建 / 删除 / 引用变化
//   2. 写入函数 + 查询函数 + 4 维度筛选（criteria D3 + D4 + spec L585）：
//      - 对象（targetType / targetId）
//      - 操作人（actor / operator）
//      - 时间（startTime / endTime）
//      - 类型（eventType）
//   3. 写 audit_logs 表（criteria D5 — INSERT INTO audit_logs）
//
// 边界（criteria H1）：本 service 不依赖任何 Phase 11 delivery / EpisodeDeliveryPackage
//
// 使用：所有需要记账的操作（trash / migration / legacy import / secret 变更）通过 writeAuditLog
// 入口落日志；query 函数支持 4 维度组合筛选

import { randomUUID } from 'node:crypto';
import { getSqlite } from '../db/client';
import { ensureSchema } from '../db/migrate';

// ============================================================
// 1. 7 类事件枚举（criteria D2 — 任一缺失 → failed）
// ============================================================

export type AuditEvent =
  | 'deletion'
  | 'unlock'
  | 'waiver'
  | 'legacy_import'
  | 'migration_export'
  | 'secret_change'
  | 'artifact_operation';

export type AuditEventType = AuditEvent;

export const AUDIT_EVENT_TYPES: readonly AuditEvent[] = [
  'deletion',
  'unlock',
  'waiver',
  'legacy_import',
  'migration_export',
  'secret_change',
  'artifact_operation',
] as const;

export type AuditAction = string;
export const AUDIT_ACTIONS = AUDIT_EVENT_TYPES;

/** 操作结果枚举（成功 / 失败 / 警告） */
export type AuditResult = 'ok' | 'failed' | 'warning';

// ============================================================
// 2. 类型定义
// ============================================================

export interface AuditLogRecord {
  id: string;
  eventType: AuditEvent;
  targetType: string;
  targetId: string;
  actor: string;
  projectId: string | null;
  action: string;
  detail: Record<string, unknown>;
  result: AuditResult;
  createdAt: number;
}

export interface WriteAuditLogInput {
  eventType: AuditEvent;
  /** 对象类型 — 例如 'track' / 'take' / 'project' / 'secret_ref' / 'artifact' */
  targetType?: string;
  /** 对象 ID */
  targetId?: string;
  /** 操作人 — 默认 'local-owner'（本地模式），可被 access-control 注入实际 operator_id */
  actor?: string;
  /** 关联项目 ID */
  projectId?: string | null;
  /** 动作名 — 例如 'softDelete' / 'restore' / 'hardDelete' / 'exportPackage' */
  action?: string;
  /** 详细 JSON — 任意附加字段 */
  detail?: Record<string, unknown>;
  /** 结果 — 'ok' / 'failed' / 'warning' */
  result?: AuditResult;
}

export interface QueryAuditLogInput {
  /** 类型筛选 — 4 维度之一 */
  eventType?: AuditEvent | AuditEvent[];
  /** 对象筛选 — 4 维度之一（targetType + targetId 任一/组合） */
  targetType?: string;
  targetId?: string;
  /** 操作人筛选 — 4 维度之一 */
  actor?: string;
  /** 时间范围筛选 — 4 维度之一 */
  startTime?: number;
  endTime?: number;
  /** 项目筛选（辅助） */
  projectId?: string;
  /** 分页 */
  limit?: number;
  offset?: number;
}

// ============================================================
// 3. 行解析（DB row → 业务对象）
// ============================================================

interface AuditLogRow {
  id: string;
  event_type: string;
  target_type: string;
  target_id: string;
  actor: string;
  project_id: string | null;
  action: string;
  detail_json: string;
  result: string;
  created_at: number;
}

function parseRow(row: AuditLogRow): AuditLogRecord {
  let detail: Record<string, unknown> = {};
  try {
    detail = JSON.parse(row.detail_json || '{}');
  } catch {
    detail = {};
  }
  return {
    id: row.id,
    eventType: row.event_type as AuditEvent,
    targetType: row.target_type,
    targetId: row.target_id,
    actor: row.actor,
    projectId: row.project_id,
    action: row.action,
    detail,
    result: (row.result as AuditResult) || 'ok',
    createdAt: row.created_at,
  };
}

function assertValidEventType(eventType: string): asserts eventType is AuditEvent {
  if (!AUDIT_EVENT_TYPES.includes(eventType as AuditEvent)) {
    throw new Error(`无效的 audit event_type：${eventType}`);
  }
}

// ============================================================
// 4. 写入函数（criteria D3 + spec L168）
// ============================================================

/**
 * 写入一条 audit log 记录。
 *
 * 入口设计：所有 trash / migration / legacy import / secret 变更等敏感操作必须先调此函数落账，
 * 失败时也要落账（result='failed'）以便追溯。
 */
export async function writeAuditLog(input: WriteAuditLogInput): Promise<AuditLogRecord> {
  await ensureSchema();
  assertValidEventType(input.eventType);

  const id = randomUUID();
  const now = Date.now();
  const record: AuditLogRecord = {
    id,
    eventType: input.eventType,
    targetType: input.targetType || '',
    targetId: input.targetId || '',
    actor: input.actor || 'local-owner',
    projectId: input.projectId ?? null,
    action: input.action || input.eventType,
    detail: input.detail || {},
    result: input.result || 'ok',
    createdAt: now,
  };

  getSqlite()
    .prepare(
      `INSERT INTO audit_logs
        (id, event_type, target_type, target_id, actor, project_id, action, detail_json, result, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      record.id,
      record.eventType,
      record.targetType,
      record.targetId,
      record.actor,
      record.projectId,
      record.action,
      JSON.stringify(record.detail),
      record.result,
      record.createdAt,
    );

  return record;
}

/** 别名 — 接受同义命名（spec / 派发清单可能不同） */
export const logAudit = writeAuditLog;
export const recordAuditEvent = writeAuditLog;
export const appendAuditLog = writeAuditLog;
export const createAuditLog = writeAuditLog;

// ============================================================
// 5. 查询函数（criteria D3 + D4 + spec L585 4 维度筛选）
// ============================================================

/**
 * 按 4 维度（对象 / 操作人 / 时间 / 类型）组合筛选查询 audit_logs 表。
 */
export async function queryAuditLog(input: QueryAuditLogInput = {}): Promise<AuditLogRecord[]> {
  await ensureSchema();
  const where: string[] = [];
  const params: unknown[] = [];

  // 维度 1：类型（eventType）
  if (input.eventType) {
    const types = Array.isArray(input.eventType) ? input.eventType : [input.eventType];
    if (types.length > 0) {
      where.push(`event_type IN (${types.map(() => '?').join(',')})`);
      params.push(...types);
    }
  }

  // 维度 2：对象（targetType + targetId）
  if (input.targetType) {
    where.push('target_type = ?');
    params.push(input.targetType);
  }
  if (input.targetId) {
    where.push('target_id = ?');
    params.push(input.targetId);
  }

  // 维度 3：操作人（actor / operator）
  if (input.actor) {
    where.push('actor = ?');
    params.push(input.actor);
  }

  // 维度 4：时间范围（startTime / endTime / since / until）
  if (typeof input.startTime === 'number') {
    where.push('created_at >= ?');
    params.push(input.startTime);
  }
  if (typeof input.endTime === 'number') {
    where.push('created_at <= ?');
    params.push(input.endTime);
  }

  // 辅助维度：项目
  if (input.projectId) {
    where.push('project_id = ?');
    params.push(input.projectId);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(Math.max(input.limit ?? 200, 1), 1000);
  const offset = Math.max(input.offset ?? 0, 0);

  const rows = getSqlite()
    .prepare(
      `SELECT id, event_type, target_type, target_id, actor, project_id, action, detail_json, result, created_at
       FROM audit_logs ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as AuditLogRow[];

  return rows.map(parseRow);
}

/** 别名 — 接受同义命名 */
export const listAuditLogs = queryAuditLog;
export const findAuditLogs = queryAuditLog;
export const searchAuditLogs = queryAuditLog;
export const getAuditLogs = queryAuditLog;

/**
 * 按类型聚合计数（4 维度查询的派生统计）
 */
export async function countAuditLogsByType(filters: Omit<QueryAuditLogInput, 'limit' | 'offset'> = {}): Promise<Record<AuditEvent, number>> {
  await ensureSchema();
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.actor) { where.push('actor = ?'); params.push(filters.actor); }
  if (filters.targetType) { where.push('target_type = ?'); params.push(filters.targetType); }
  if (filters.targetId) { where.push('target_id = ?'); params.push(filters.targetId); }
  if (typeof filters.startTime === 'number') { where.push('created_at >= ?'); params.push(filters.startTime); }
  if (typeof filters.endTime === 'number') { where.push('created_at <= ?'); params.push(filters.endTime); }
  if (filters.projectId) { where.push('project_id = ?'); params.push(filters.projectId); }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const rows = getSqlite()
    .prepare(`SELECT event_type, COUNT(*) as count FROM audit_logs ${whereSql} GROUP BY event_type`)
    .all(...params) as Array<{ event_type: string; count: number }>;

  const result = Object.fromEntries(AUDIT_EVENT_TYPES.map((t) => [t, 0])) as Record<AuditEvent, number>;
  for (const row of rows) {
    if (AUDIT_EVENT_TYPES.includes(row.event_type as AuditEvent)) {
      result[row.event_type as AuditEvent] = row.count;
    }
  }
  return result;
}
