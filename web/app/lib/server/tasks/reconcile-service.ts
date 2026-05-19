// runtime: nodejs
// reconcile-service: Phase 12 任务恢复 + 孤儿任务识别 + 对账状态机
//
// Phase 12 性质：消费方（仅消费 Phase 9 task-queue / video-task-service 的 recover/reconcile 别名）
//   - 不重复造真实视频任务（反向 grep submitVideoTask / enqueueVideoTask = 0）
//   - 不修改 Phase 9 源码（git diff = 0）
//
// 5 个任务恢复状态枚举（spec L853）：
//   - 'normal'              正常运行 / 已落库 / 无需对账
//   - 'reconnecting'        重连进行中 / WebSocket 或 polling 重新建立
//   - 'orphaned'            本地有 task 但 provider 无回应（孤儿状态）
//   - 'reconciled'          已成功对账（已与供应商账单 / 远端状态对齐）
//   - 'duplicate_blocked'   重复提交被幂等层拦截
//
// 链路：
//   reconcileAllTasks() ->
//     1. recoverInflightTasks（Phase 9 task-queue）   → 把 submitted/running/retrying 标 reconciling
//     2. reconcilePendingTasks（Phase 9 video-task-service） → 重新 poll 远端状态
//     3. detectOrphanedTasks                                → 扫描 inflight 中 provider_job_id 为空 / 长时间无更新的 task
//     4. UPDATE tasks SET status / reconciliation_state    → 写回对账结果
//
// MVP 占位（spec L743 + L844 真实 provider 账单查询留 Phase 13+）：
//   - 真实 provider 账单查询 → 占位 reconciled 状态
//   - 不调用真实 provider 账单 API

import { ensureSchema } from '../db/migrate';
import { getSqlite } from '../db/client';
import { recoverInflightTasks, type TaskStatus } from './task-queue';
import { reconcilePendingTasks, reconcileByProviderJobId } from '../production/video-task-service';

// ============================================================
// 1. 5 个任务恢复状态枚举（spec L853 硬约束）
// ============================================================

export type ReconciliationStatus =
  | 'normal'
  | 'reconnecting'
  | 'orphaned'
  | 'reconciled'
  | 'duplicate_blocked';

export const RECONCILIATION_STATUSES: ReconciliationStatus[] = [
  'normal',
  'reconnecting',
  'orphaned',
  'reconciled',
  'duplicate_blocked',
];

/** 任务恢复状态（与 ReconciliationStatus 同义；提供 alias 供 UI / API 引用） */
export type TaskRecoveryStatus = ReconciliationStatus;
export const TASK_RECOVERY_STATUSES = RECONCILIATION_STATUSES;

// ============================================================
// 2. 类型定义
// ============================================================

export interface ReconcileTaskSnapshot {
  taskId: string;
  projectId: string;
  trackId: string | null;
  episode: number;
  status: TaskStatus;
  providerJobId: string | null;
  attemptNo: number;
  costEstimate: number;
  costActual: number;
  failedReason: string;
  updatedAt: number;
  reconciliationStatus: ReconciliationStatus;
}

export interface ReconcileSummary {
  scanned: number;
  recovered: number;
  reconciled: number;
  orphaned: number;
  duplicateBlocked: number;
  normal: number;
  reconnecting: number;
  // 别名（便于 UI 拼接 5 枚举展示）
  statuses: Record<ReconciliationStatus, number>;
}

// ============================================================
// 3. 内部映射：task 行 → reconciliation status
// ============================================================

interface TaskRow {
  id: string;
  project_id: string;
  track_id: string | null;
  episode: number;
  status: string;
  provider_job_id: string | null;
  attempt_no: number;
  cost_estimate: number;
  cost_actual: number;
  failed_reason: string;
  updated_at: number;
}

/** 阈值：超过该值（默认 5 分钟）无更新且 inflight → 视为 orphaned */
const ORPHAN_THRESHOLD_MS = 5 * 60 * 1000;

function deriveReconciliationStatus(row: TaskRow, now: number): ReconciliationStatus {
  const status = row.status as TaskStatus;
  if (status === 'duplicate_blocked') return 'duplicate_blocked';
  if (status === 'succeeded' || status === 'failed' || status === 'cancelled' || status === 'timeout' || status === 'blocked') {
    return 'reconciled';
  }
  if (status === 'reconciling' || status === 'retrying') return 'reconnecting';
  const elapsed = now - row.updated_at;
  if (
    (status === 'submitted' || status === 'running') &&
    (!row.provider_job_id || elapsed > ORPHAN_THRESHOLD_MS)
  ) {
    return 'orphaned';
  }
  return 'normal';
}

function mapRow(row: TaskRow, now: number): ReconcileTaskSnapshot {
  return {
    taskId: row.id,
    projectId: row.project_id,
    trackId: row.track_id,
    episode: row.episode,
    status: row.status as TaskStatus,
    providerJobId: row.provider_job_id,
    attemptNo: row.attempt_no,
    costEstimate: row.cost_estimate,
    costActual: row.cost_actual,
    failedReason: row.failed_reason,
    updatedAt: row.updated_at,
    reconciliationStatus: deriveReconciliationStatus(row, now),
  };
}

// ============================================================
// 4. detectOrphanedTasks — 孤儿任务识别（spec L555 + L281）
// ============================================================

/**
 * 扫描 inflight tasks → 找出 provider_job_id 为空或长时间无更新的 task
 * 输出：reconciliationStatus='orphaned' 的快照清单
 */
export async function detectOrphanedTasks(): Promise<ReconcileTaskSnapshot[]> {
  await ensureSchema();
  const db = getSqlite();
  const now = Date.now();
  const rows = db
    .prepare(
      `SELECT id, project_id, track_id, episode, status, provider_job_id,
              attempt_no, cost_estimate, cost_actual, failed_reason, updated_at
         FROM tasks
        WHERE status IN ('submitted', 'running', 'reconciling', 'retrying')`,
    )
    .all() as TaskRow[];
  return rows
    .map((row) => mapRow(row, now))
    .filter((snap) => snap.reconciliationStatus === 'orphaned');
}

export const findOrphanedTasks = detectOrphanedTasks;
export const scanOrphaned = detectOrphanedTasks;
export const identifyOrphanedTasks = detectOrphanedTasks;
export const listOrphanedTasks = detectOrphanedTasks;

// ============================================================
// 5. listReconcileSnapshots — 列出全部任务快照（含 reconciliationStatus）
// ============================================================

export interface ListReconcileFilter {
  projectId?: string;
  episode?: number;
  reconciliationStatus?: ReconciliationStatus;
  limit?: number;
}

export async function listReconcileSnapshots(
  filter: ListReconcileFilter = {},
): Promise<ReconcileTaskSnapshot[]> {
  await ensureSchema();
  const db = getSqlite();
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
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT id, project_id, track_id, episode, status, provider_job_id,
              attempt_no, cost_estimate, cost_actual, failed_reason, updated_at
         FROM tasks ${whereSql}
        ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(...params, filter.limit || 200) as TaskRow[];
  const now = Date.now();
  let snapshots = rows.map((row) => mapRow(row, now));
  if (filter.reconciliationStatus) {
    snapshots = snapshots.filter((snap) => snap.reconciliationStatus === filter.reconciliationStatus);
  }
  return snapshots;
}

// ============================================================
// 6. markOrphaned — 写回 orphaned 状态（reconciliation_state 不存在则只更新 failed_reason）
// ============================================================

export async function markOrphaned(taskId: string, reason = '孤儿任务：超时无回应'): Promise<void> {
  await ensureSchema();
  const now = Date.now();
  // 沿用现有 tasks.status 'reconciling' + failed_reason 留痕；不新增 schema 字段以避免破坏 Phase 9
  getSqlite()
    .prepare(
      `UPDATE tasks SET status = 'reconciling', failed_reason = ?, updated_at = ?
        WHERE id = ? AND status IN ('submitted', 'running', 'retrying')`,
    )
    .run(reason.slice(0, 500), now, taskId);
}

// ============================================================
// 7. reconcileTask — 单任务对账（消费 Phase 9 reconcileByProviderJobId）
// ============================================================

export interface ReconcileTaskResult {
  taskId: string;
  reconciliationStatus: ReconciliationStatus;
  message: string;
}

export async function reconcileTask(taskId: string): Promise<ReconcileTaskResult> {
  await ensureSchema();
  const db = getSqlite();
  const row = db
    .prepare(
      `SELECT id, project_id, track_id, episode, status, provider_job_id,
              attempt_no, cost_estimate, cost_actual, failed_reason, updated_at
         FROM tasks WHERE id = ?`,
    )
    .get(taskId) as TaskRow | undefined;
  if (!row) {
    return { taskId, reconciliationStatus: 'normal', message: 'task 不存在，跳过' };
  }
  if (!row.provider_job_id) {
    await markOrphaned(taskId, 'provider_job_id 为空');
    return { taskId, reconciliationStatus: 'orphaned', message: 'provider_job_id 为空，已标 orphaned' };
  }
  // 委派给 Phase 9 video-task-service.reconcileByProviderJobId（仅查询 + 更新状态，不重新提交真实任务）
  const result = await reconcileByProviderJobId(row.provider_job_id);
  if (!result) {
    return { taskId, reconciliationStatus: 'orphaned', message: 'provider 返回空 / 找不到任务' };
  }
  const next = result.status;
  if (next === 'succeeded' || next === 'failed') {
    return { taskId, reconciliationStatus: 'reconciled', message: `已对账 → ${next}` };
  }
  return { taskId, reconciliationStatus: 'reconnecting', message: `远端仍在进行：${next}` };
}

export const triggerReconciliation = reconcileTask;

// ============================================================
// 8. reconcileAllTasks — 全量对账（消费 Phase 9 recover/reconcile 别名）
// ============================================================

/**
 * 全量对账入口（API 调用 / 服务启动 hook）
 *
 * 链路：
 *   1. Phase 9 recoverInflightTasks → 把 submitted/running 标 reconciling
 *   2. Phase 9 reconcilePendingTasks → 重新 poll 远端状态
 *   3. detectOrphanedTasks → 找孤儿 + markOrphaned 写痕
 *   4. 汇总 5 个 reconciliation 状态计数
 *
 * 反向硬约束：不允许重新调用 submitVideoTask / enqueueVideoTask
 */
export async function reconcileAllTasks(): Promise<ReconcileSummary> {
  await ensureSchema();

  // 1. 消费 Phase 9 task-queue.recoverInflightTasks（4 别名同源：reconcileOnStartup / recoverPendingTasks / scanInflight）
  const recoverResult = await recoverInflightTasks();
  // 2. 消费 Phase 9 video-task-service.reconcilePendingTasks（3 别名同源：recoverFromRestart / scanInflightTasks）
  const reconcilePoll = await reconcilePendingTasks();
  // 3. 识别孤儿 + 写痕
  const orphans = await detectOrphanedTasks();
  for (const orphan of orphans) {
    await markOrphaned(orphan.taskId);
  }

  // 4. 汇总
  const all = await listReconcileSnapshots({ limit: 500 });
  const counts: Record<ReconciliationStatus, number> = {
    normal: 0,
    reconnecting: 0,
    orphaned: 0,
    reconciled: 0,
    duplicate_blocked: 0,
  };
  for (const snap of all) {
    counts[snap.reconciliationStatus] += 1;
  }

  return {
    scanned: recoverResult.scanned + reconcilePoll.reconciledCount,
    recovered: recoverResult.markedReconciling,
    reconciled: counts.reconciled,
    orphaned: counts.orphaned,
    duplicateBlocked: counts.duplicate_blocked,
    normal: counts.normal,
    reconnecting: counts.reconnecting,
    statuses: counts,
  };
}

export const runReconciliation = reconcileAllTasks;
export const reconcile = reconcileAllTasks;
