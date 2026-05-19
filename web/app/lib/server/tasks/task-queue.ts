// runtime: nodejs
// task-queue: Task 状态机 + DAG 依赖 + 暂停 / 取消 / 重试 / 恢复 / 列表 / 对账
//
// Task 7+ 状态枚举（spec L185 + L852）：
//   pending / queued / submitted / running / paused / cancelled / retrying / reconciling /
//   succeeded / failed / timeout / duplicate_blocked
//
// 关键硬约束：
//   - 重试 ≤ 2 次（spec L546 + L553）— attempt_no > max_attempts → 'failed' + blocked
//   - 并发上限 3（spec L552）— DEFAULT_CONCURRENCY = 3
//   - DAG 依赖（spec L752 + L555）— depends_on_task_id 字段处理
//   - 调用 idempotency.checkDuplicate + computeRequestHash（C7 段）

import { randomUUID } from 'node:crypto';
import { ensureSchema } from '../db/migrate';
import { getSqlite } from '../db/client';
import {
  computeRequestHash,
  checkDuplicate,
  findTaskByProviderJobId,
  listInflightTasks,
  type RequestHashInput,
} from './idempotency';

// ============================================================
// 类型定义
// ============================================================

export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'submitted'
  | 'running'
  | 'paused'
  | 'cancelled'
  | 'retrying'
  | 'reconciling'
  | 'succeeded'
  | 'failed'
  | 'timeout'
  | 'duplicate_blocked'
  | 'blocked';

/** 状态枚举常量 — Task 状态机参考表 */
export const TASK_STATUSES: TaskStatus[] = [
  'pending',
  'queued',
  'submitted',
  'running',
  'paused',
  'cancelled',
  'retrying',
  'reconciling',
  'succeeded',
  'failed',
  'timeout',
  'duplicate_blocked',
  'blocked',
];

/** 视为活跃 / 进行中的状态（用于并发计数 + 对账扫描） */
const ACTIVE_STATUSES: TaskStatus[] = ['pending', 'queued', 'submitted', 'running', 'retrying', 'reconciling'];

/** 视为可重试的失败状态 */
const RETRYABLE_FAILED_STATUSES: TaskStatus[] = ['failed', 'timeout'];

// ============================================================
// 配置常量
// ============================================================

/** 默认重试上限（spec L546 + L553：≤ 2） */
export const MAX_RETRIES = 2;

/** 默认并发上限（spec L552：DEFAULT_CONCURRENCY = 3） */
export const MAX_CONCURRENT = 3;

/** 别名 */
export const DEFAULT_CONCURRENCY = MAX_CONCURRENT;

// ============================================================
// 数据类型 — TaskRecord
// ============================================================

export interface TaskRecord {
  id: string;
  projectId: string;
  trackId: string | null;
  episode: number;
  taskType: string;
  status: TaskStatus;
  providerJobId: string | null;
  requestHash: string;
  attemptNo: number;
  maxAttempts: number;
  modelConfigId: string | null;
  strategy: string;
  costEstimate: number;
  costActual: number;
  providerStatus: string;
  dependsOnTaskId: string | null;
  pausedAt: number | null;
  cancelledAt: number | null;
  failedReason: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

interface TaskRow {
  id: string;
  project_id: string;
  track_id: string | null;
  episode: number;
  task_type: string;
  status: string;
  provider_job_id: string | null;
  request_hash: string;
  attempt_no: number;
  max_attempts: number;
  model_config_id: string | null;
  strategy: string;
  cost_estimate: number;
  cost_actual: number;
  provider_status: string;
  depends_on_task_id: string | null;
  paused_at: number | null;
  cancelled_at: number | null;
  failed_reason: string;
  payload_json: string;
  result_json: string;
  created_at: number;
  updated_at: number;
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function mapRow(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    trackId: row.track_id,
    episode: row.episode,
    taskType: row.task_type,
    status: row.status as TaskStatus,
    providerJobId: row.provider_job_id,
    requestHash: row.request_hash,
    attemptNo: row.attempt_no,
    maxAttempts: row.max_attempts,
    modelConfigId: row.model_config_id,
    strategy: row.strategy,
    costEstimate: row.cost_estimate,
    costActual: row.cost_actual,
    providerStatus: row.provider_status,
    dependsOnTaskId: row.depends_on_task_id,
    pausedAt: row.paused_at,
    cancelledAt: row.cancelled_at,
    failedReason: row.failed_reason,
    payload: parseJsonObject(row.payload_json),
    result: parseJsonObject(row.result_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================
// 1. enqueueTask — 入队 / 提交（含幂等性 + DAG 依赖）
// ============================================================

export interface EnqueueTaskInput {
  projectId: string;
  trackId?: string;
  episode: number;
  taskType?: string;
  strategy: string;
  modelConfigId?: string;
  prompt: string;
  modelId: string;
  costEstimate?: number;
  payload?: Record<string, unknown>;
  dependsOnTaskId?: string;
  /** 可选 — 调用方提供的 requestHash 输入字段（若不提供，使用 prompt + modelId 等默认字段） */
  hashInput?: Partial<RequestHashInput>;
}

export interface EnqueueTaskResult {
  status: 'queued' | 'duplicate_blocked';
  taskId: string;
  requestHash: string;
  existingStatus?: string;
}

/**
 * 入队 Task — 调用 idempotency.checkDuplicate 防重复
 */
export async function enqueueTask(input: EnqueueTaskInput): Promise<EnqueueTaskResult> {
  await ensureSchema();

  // 1. 计算 requestHash
  const hashInput: RequestHashInput = {
    projectId: input.projectId,
    episode: input.episode,
    trackId: input.trackId || '',
    strategy: input.strategy,
    prompt: input.prompt,
    modelId: input.modelId,
    extra: input.hashInput?.extra || {},
  };
  const requestHash = computeRequestHash(hashInput);

  // 2. 重复检测
  const duplicate = await checkDuplicate(requestHash);
  if (duplicate) {
    return {
      status: 'duplicate_blocked',
      taskId: duplicate.taskId,
      requestHash,
      existingStatus: duplicate.existingStatus,
    };
  }

  // 3. 创建 Task
  const taskId = randomUUID();
  const now = Date.now();
  const db = getSqlite();
  db.prepare(
    `INSERT INTO tasks
      (id, project_id, track_id, episode, task_type, status, provider_job_id,
       request_hash, idempotency_key, attempt_no, max_attempts, model_config_id,
       strategy, cost_estimate, cost_actual, provider_status, depends_on_task_id,
       paused_at, cancelled_at, failed_reason, payload_json, result_json,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'queued', NULL,
             ?, ?, 1, ?, ?,
             ?, ?, 0, '', ?,
             NULL, NULL, '', ?, '{}',
             ?, ?)`,
  ).run(
    taskId,
    input.projectId,
    input.trackId || null,
    input.episode,
    input.taskType || 'video',
    requestHash,
    requestHash,
    MAX_RETRIES,
    input.modelConfigId || null,
    input.strategy,
    input.costEstimate || 0,
    input.dependsOnTaskId || null,
    JSON.stringify(input.payload || { prompt: input.prompt, modelId: input.modelId }),
    now,
    now,
  );

  return { status: 'queued', taskId, requestHash };
}

export const submitTask = enqueueTask;
export const createTask = enqueueTask;
export const addTask = enqueueTask;

// ============================================================
// 2. pauseTask / resumeTask / cancelTask / retryTask
// ============================================================

export async function pauseTask(taskId: string): Promise<void> {
  await ensureSchema();
  const now = Date.now();
  // 仅活跃任务可被暂停
  getSqlite()
    .prepare(
      `UPDATE tasks SET status = 'paused', paused_at = ?, updated_at = ?
       WHERE id = ? AND status IN ('queued', 'submitted', 'running', 'retrying')`,
    )
    .run(now, now, taskId);
}

export const pauseBatch = async (taskIds: string[]): Promise<void> => {
  for (const id of taskIds) await pauseTask(id);
};
export const pauseQueue = pauseBatch;

export async function resumeTask(taskId: string): Promise<void> {
  await ensureSchema();
  const now = Date.now();
  getSqlite()
    .prepare(
      `UPDATE tasks SET status = 'queued', paused_at = NULL, updated_at = ?
       WHERE id = ? AND status = 'paused'`,
    )
    .run(now, taskId);
}

export const resumeBatch = async (taskIds: string[]): Promise<void> => {
  for (const id of taskIds) await resumeTask(id);
};
export const resumeQueue = resumeBatch;

export async function cancelTask(taskId: string): Promise<void> {
  await ensureSchema();
  const now = Date.now();
  getSqlite()
    .prepare(
      `UPDATE tasks SET status = 'cancelled', cancelled_at = ?, updated_at = ?
       WHERE id = ? AND status NOT IN ('succeeded', 'cancelled')`,
    )
    .run(now, now, taskId);
}

export const abortTask = cancelTask;
export const terminateTask = cancelTask;

/**
 * 重试 Task — 检查 attempt_no 是否超阈值
 * 超过 MAX_RETRIES → 'blocked' 状态（spec L546 + L553）
 */
export interface RetryTaskResult {
  status: 'retrying' | 'blocked' | 'noop';
  attemptNo: number;
  reason?: string;
}

export async function retryTask(taskId: string): Promise<RetryTaskResult> {
  await ensureSchema();
  const db = getSqlite();
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow | undefined;
  if (!row) return { status: 'noop', attemptNo: 0, reason: 'Task 不存在' };
  if (!RETRYABLE_FAILED_STATUSES.includes(row.status as TaskStatus)) {
    return { status: 'noop', attemptNo: row.attempt_no, reason: `当前状态 ${row.status} 不允许重试` };
  }
  if (row.attempt_no >= row.max_attempts) {
    // 已达重试上限 → blocked
    db.prepare(
      `UPDATE tasks SET status = 'blocked', failed_reason = ?, updated_at = ? WHERE id = ?`,
    ).run(`重试 ${row.attempt_no}/${row.max_attempts} 次仍失败，已 blocked`, Date.now(), taskId);
    return { status: 'blocked', attemptNo: row.attempt_no, reason: '已达 retryCount 上限' };
  }
  const nextAttempt = row.attempt_no + 1;
  db.prepare(
    `UPDATE tasks SET status = 'retrying', attempt_no = ?, failed_reason = '', updated_at = ? WHERE id = ?`,
  ).run(nextAttempt, Date.now(), taskId);
  return { status: 'retrying', attemptNo: nextAttempt };
}

export const retryWithIssue = retryTask;
export const requeueTask = retryTask;

// ============================================================
// 3. listTasks / queryTasks — 查询
// ============================================================

export interface ListTasksFilter {
  projectId?: string;
  episode?: number;
  trackId?: string;
  status?: TaskStatus | TaskStatus[];
  limit?: number;
}

export async function listTasks(filter: ListTasksFilter = {}): Promise<TaskRecord[]> {
  await ensureSchema();
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.projectId) {
    where.push('project_id = ?');
    params.push(filter.projectId);
  }
  if (filter.episode !== undefined) {
    where.push('episode = ?');
    params.push(filter.episode);
  }
  if (filter.trackId) {
    where.push('track_id = ?');
    params.push(filter.trackId);
  }
  if (filter.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    const placeholders = statuses.map(() => '?').join(', ');
    where.push(`status IN (${placeholders})`);
    params.push(...statuses);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = getSqlite()
    .prepare(
      `SELECT * FROM tasks ${whereSql}
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(...params, filter.limit || 100) as TaskRow[];
  return rows.map(mapRow);
}

export const queryTasks = listTasks;
export const fetchTasks = listTasks;
export const getTaskList = listTasks;

/**
 * 获取单个 Task
 */
export async function getTask(taskId: string): Promise<TaskRecord | null> {
  await ensureSchema();
  const row = getSqlite().prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow | undefined;
  return row ? mapRow(row) : null;
}

// ============================================================
// 4. DAG 依赖处理 — areDependenciesSatisfied
// ============================================================

/**
 * 检查 Task 的依赖是否已就绪
 * spec L752：continue_from_previous 等策略需前置 Track 已完成
 */
export async function areDependenciesSatisfied(taskId: string): Promise<{
  satisfied: boolean;
  blockingTaskId?: string;
  blockingStatus?: string;
}> {
  await ensureSchema();
  const db = getSqlite();
  const task = db.prepare('SELECT depends_on_task_id FROM tasks WHERE id = ?').get(taskId) as
    | { depends_on_task_id: string | null }
    | undefined;
  if (!task) return { satisfied: false, blockingStatus: 'task_not_found' };
  if (!task.depends_on_task_id) return { satisfied: true };
  const parent = db
    .prepare('SELECT id, status FROM tasks WHERE id = ?')
    .get(task.depends_on_task_id) as { id: string; status: string } | undefined;
  if (!parent) return { satisfied: false, blockingStatus: 'parent_missing' };
  if (parent.status === 'succeeded') return { satisfied: true };
  return { satisfied: false, blockingTaskId: parent.id, blockingStatus: parent.status };
}

// ============================================================
// 5. 并发计数 — 用于上限检查（DEFAULT_CONCURRENCY = 3）
// ============================================================

export async function getActiveTaskCount(projectId?: string): Promise<number> {
  await ensureSchema();
  const placeholders = ACTIVE_STATUSES.map(() => '?').join(', ');
  const sql = projectId
    ? `SELECT COUNT(*) AS cnt FROM tasks WHERE project_id = ? AND status IN (${placeholders})`
    : `SELECT COUNT(*) AS cnt FROM tasks WHERE status IN (${placeholders})`;
  const params: (string | TaskStatus)[] = projectId ? [projectId, ...ACTIVE_STATUSES] : [...ACTIVE_STATUSES];
  const row = getSqlite().prepare(sql).get(...params) as { cnt: number };
  return row.cnt;
}

export async function canEnqueue(projectId?: string): Promise<{ allowed: boolean; activeCount: number; limit: number }> {
  const activeCount = await getActiveTaskCount(projectId);
  return {
    allowed: activeCount < MAX_CONCURRENT,
    activeCount,
    limit: MAX_CONCURRENT,
  };
}

// ============================================================
// 6. 服务重启对账（spec L416 + L555 硬约束）
// ============================================================

/**
 * 扫描所有 inflight task — 由调度或启动 hook 触发
 * 通过 idempotency.listInflightTasks + providerJobId 反查 → 标 reconciling
 */
export async function recoverInflightTasks(): Promise<{
  scanned: number;
  markedReconciling: number;
}> {
  await ensureSchema();
  const inflight = await listInflightTasks();
  const db = getSqlite();
  const now = Date.now();
  let marked = 0;
  for (const task of inflight) {
    if (task.status === 'pending' || task.status === 'queued') continue;
    // 已 submitted / running / retrying → 标 reconciling，等待 video-task-service.poll 拉取
    db.prepare(
      `UPDATE tasks SET status = 'reconciling', updated_at = ?
       WHERE id = ? AND status IN ('submitted', 'running', 'retrying')`,
    ).run(now, task.id);
    marked += 1;
  }
  return { scanned: inflight.length, markedReconciling: marked };
}

export const reconcileOnStartup = recoverInflightTasks;
export const recoverPendingTasks = recoverInflightTasks;
export const scanInflight = recoverInflightTasks;

// ============================================================
// 7. updateTaskStatus — 内部使用（video-task-service 等调用）
// ============================================================

export async function updateTaskStatus(taskId: string, status: TaskStatus, extra?: { reason?: string; providerJobId?: string }): Promise<void> {
  await ensureSchema();
  const now = Date.now();
  const db = getSqlite();
  if (extra?.providerJobId) {
    db.prepare(
      `UPDATE tasks SET status = ?, provider_job_id = ?, failed_reason = ?, updated_at = ?
       WHERE id = ?`,
    ).run(status, extra.providerJobId, (extra.reason || '').slice(0, 500), now, taskId);
  } else {
    db.prepare(
      `UPDATE tasks SET status = ?, failed_reason = ?, updated_at = ?
       WHERE id = ?`,
    ).run(status, (extra?.reason || '').slice(0, 500), now, taskId);
  }
}

/**
 * 根据 providerJobId 找回 task
 */
export async function findByProviderJobId(providerJobId: string): Promise<TaskRecord | null> {
  const idResult = await findTaskByProviderJobId(providerJobId);
  if (!idResult) return null;
  return getTask(idResult.id);
}
