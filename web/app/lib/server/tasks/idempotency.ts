// runtime: nodejs
// idempotency: 任务幂等性 — requestHash 计算 + duplicate_blocked 拦截 + providerJobId 反向查询
//
// 核心硬约束（spec L398 + L419 + L753）：
//   1. requestHash = sha256(projectId + episode + trackId + strategy + prompt + modelId)
//      同样输入永远产生同样 hash → 同 hash 已有活跃任务时直接返回 duplicate_blocked
//   2. 重复检测仅考虑活跃 / 已成功状态（pending / submitted / running / queued / succeeded）
//      cancelled / failed 不在阻拦之列（允许用户改 prompt 重提交）
//   3. providerJobId 反向查询 — 服务重启时按 providerJobId 找回原 Task 完成对账
//
// 注意：本模块不直接发起视频任务 / 不调用真实 provider；仅做 hash 计算 + DB 查询

import { createHash } from 'node:crypto';
import { ensureSchema } from '../db/migrate';
import { getSqlite } from '../db/client';

/** requestHash 输入字段（任一子集组合即可，至少 4 个维度参与 hash） */
export interface RequestHashInput {
  projectId: string;
  episode?: number | string;
  trackId: string;
  strategy: string;
  prompt?: string;
  modelId: string;
  /** 可选 — 业务需要锁定的额外维度（如 duration / aspectRatio） */
  extra?: Record<string, string | number | boolean | null | undefined>;
}

/** 重复任务命中后的拦截结果 */
export interface DuplicateBlockedResult {
  status: 'duplicate_blocked';
  taskId: string;
  existingStatus: string;
  providerJobId: string | null;
  requestHash: string;
}

/** 普通的任务行（按 idempotency 角度访问的字段） */
interface TaskRowSlim {
  id: string;
  status: string;
  provider_job_id: string | null;
  request_hash: string;
}

/** 视为"活跃 / 已锁定"的状态集合 — 这些状态命中即拦截重复提交 */
const ACTIVE_TASK_STATUSES = [
  'pending',
  'queued',
  'submitted',
  'running',
  'retrying',
  'reconciling',
  'succeeded',
] as const;

/**
 * 计算 requestHash — sha256(projectId + episode + trackId + strategy + prompt + modelId + extra)
 *
 * 关键约束（spec L398 + L753）：
 *   - 同样输入永远产生同样 hash（确定性 sort + JSON.stringify）
 *   - 至少 4 个维度参与 hash（projectId / trackId / strategy / modelId 必填）
 */
export function computeRequestHash(input: RequestHashInput): string {
  const normalized = {
    projectId: String(input.projectId || '').trim(),
    episode: input.episode !== undefined && input.episode !== null ? String(input.episode) : '',
    trackId: String(input.trackId || '').trim(),
    strategy: String(input.strategy || '').trim(),
    prompt: typeof input.prompt === 'string' ? input.prompt.trim() : '',
    modelId: String(input.modelId || '').trim(),
    extra: input.extra ? sortObject(input.extra) : {},
  };
  const payload = JSON.stringify(normalized);
  return createHash('sha256').update(payload).digest('hex');
}

/** 旧别名 — 兼容备用调用点 */
export const buildRequestHash = computeRequestHash;
export const hashRequest = computeRequestHash;

function sortObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return sorted;
}

/**
 * 查询同 requestHash 是否已有活跃 / 已成功任务
 * 命中 → 返回 duplicate_blocked 结果；未命中 → 返回 null
 *
 * SQL: SELECT id, status, provider_job_id, request_hash FROM tasks
 *      WHERE request_hash = ? AND status IN (...active...)
 *      ORDER BY created_at DESC LIMIT 1
 */
export async function checkDuplicate(requestHash: string): Promise<DuplicateBlockedResult | null> {
  if (!requestHash) return null;
  await ensureSchema();

  const placeholders = ACTIVE_TASK_STATUSES.map(() => '?').join(', ');
  // SQL: SELECT ... FROM tasks WHERE request_hash = ? AND status IN (active...)
  const sql = `SELECT id, status, provider_job_id, request_hash FROM tasks WHERE request_hash = ? AND status IN (${placeholders}) ORDER BY created_at DESC LIMIT 1`;
  const row = getSqlite()
    .prepare(sql)
    .get(requestHash, ...ACTIVE_TASK_STATUSES) as TaskRowSlim | undefined;

  if (!row) return null;
  return {
    status: 'duplicate_blocked',
    taskId: row.id,
    existingStatus: row.status,
    providerJobId: row.provider_job_id,
    requestHash: row.request_hash,
  };
}

/** 别名 — 暴露多种调用名 */
export const findExistingTask = checkDuplicate;
export const detectDuplicate = checkDuplicate;

/**
 * 反向查询：根据 providerJobId 找回原 Task — 服务重启对账用
 * spec L555：暂停 / 重启后通过 providerJobId 拉取远端状态
 */
export async function findTaskByProviderJobId(
  providerJobId: string,
): Promise<{ id: string; status: string; requestHash: string } | null> {
  if (!providerJobId) return null;
  await ensureSchema();
  // SQL: SELECT ... FROM tasks WHERE provider_job_id = ?
  const row = getSqlite()
    .prepare(
      `SELECT id, status, request_hash FROM tasks WHERE provider_job_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(providerJobId) as { id: string; status: string; request_hash: string } | undefined;
  if (!row) return null;
  return { id: row.id, status: row.status, requestHash: row.request_hash };
}

export const lookupByProviderJob = findTaskByProviderJobId;

/**
 * 列出所有处于活跃状态的任务（用于服务重启时扫描需对账的任务）
 * spec L416 + L555 服务重启对账硬约束
 */
export async function listInflightTasks(): Promise<Array<{ id: string; status: string; providerJobId: string | null }>> {
  await ensureSchema();
  const placeholders = ['pending', 'queued', 'submitted', 'running', 'retrying', 'reconciling']
    .map(() => '?')
    .join(', ');
  const rows = getSqlite()
    .prepare(
      `SELECT id, status, provider_job_id FROM tasks
       WHERE status IN (${placeholders})
       ORDER BY created_at ASC`,
    )
    .all('pending', 'queued', 'submitted', 'running', 'retrying', 'reconciling') as Array<{
    id: string;
    status: string;
    provider_job_id: string | null;
  }>;
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    providerJobId: row.provider_job_id,
  }));
}
