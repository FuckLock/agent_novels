// runtime: nodejs
// usage-service: Phase 9 成本记录 — 估算 / 实际 / 失败 / 重试 4 状态分离
//
// 核心硬约束（spec L742 + L828 + L844）：
//   1. 估算（estimated）：submitVideoTask 提交时写一条 cost_status='estimated'
//      estimated_amount 字段（不动 actual_amount）
//   2. 实际（actual）：任务 succeeded 时写一条 cost_status='actual'
//      actual_amount 字段（实际供应商账单值；可由 provider 回调时填回）
//   3. 失败（failed）：任务 failed 时写一条 cost_status='failed'
//      failed_amount 字段（失败也可能有费用——如部分调用花费）
//   4. 重试（retry）：重试时写一条 cost_status='actual' + retry_amount > 0
//      或扩展 cost_status='retry'
//
// 不允许：把 estimated + actual 混在同一条记录中（违反 spec L828）

import { randomUUID } from 'node:crypto';
import { ensureSchema } from '../db/migrate';
import { getSqlite } from '../db/client';

export type UsageCostStatus = 'estimated' | 'actual' | 'failed' | 'reconciled' | 'disputed' | 'retry';

export interface UsageInputCommon {
  projectId: string;
  taskId?: string;
  trackId?: string;
  episode?: number;
  agentRunId?: string;
  modelConfigId?: string;
  providerJobId?: string;
  providerBillingUnit?: string;
  objectType?: string;
  objectId?: string;
  details?: Record<string, unknown>;
}

export interface RecordEstimatedInput extends UsageInputCommon {
  estimatedAmount: number;
}

export interface RecordActualInput extends UsageInputCommon {
  actualAmount: number;
  /** 可选：附带 estimated 值（仅作记账） */
  estimatedAmount?: number;
}

export interface RecordFailedInput extends UsageInputCommon {
  failedAmount: number;
  errorMessage?: string;
}

export interface RecordRetryInput extends UsageInputCommon {
  retryAmount: number;
  attemptNo?: number;
}

/**
 * 写入估算 UsageRecord（cost_status='estimated'） — 任务提交时调用
 */
export async function recordEstimatedUsage(input: RecordEstimatedInput): Promise<string> {
  return insertUsageRecord({
    ...input,
    cost_status: 'estimated',
    estimated_amount: input.estimatedAmount,
    actual_amount: 0,
    failed_amount: 0,
    retry_amount: 0,
    estimated_cost: input.estimatedAmount,
    actual_cost: 0,
  });
}

/**
 * 写入实际 UsageRecord（cost_status='actual'） — 任务 succeeded 时调用
 * spec L828：估算与实际成本分离记录
 */
export async function recordActualUsage(input: RecordActualInput): Promise<string> {
  return insertUsageRecord({
    ...input,
    cost_status: 'actual',
    estimated_amount: input.estimatedAmount || 0,
    actual_amount: input.actualAmount,
    failed_amount: 0,
    retry_amount: 0,
    estimated_cost: input.estimatedAmount || 0,
    actual_cost: input.actualAmount,
  });
}

/**
 * 写入失败 UsageRecord（cost_status='failed'） — 任务 failed 时调用
 */
export async function recordFailedUsage(input: RecordFailedInput): Promise<string> {
  return insertUsageRecord({
    ...input,
    cost_status: 'failed',
    estimated_amount: 0,
    actual_amount: 0,
    failed_amount: input.failedAmount,
    retry_amount: 0,
    estimated_cost: 0,
    actual_cost: 0,
    details: { ...(input.details || {}), errorMessage: input.errorMessage || '' },
  });
}

/**
 * 写入重试 UsageRecord（cost_status='actual' + retry_amount） — 重试时调用
 */
export async function recordRetryUsage(input: RecordRetryInput): Promise<string> {
  return insertUsageRecord({
    ...input,
    cost_status: 'actual',
    estimated_amount: 0,
    actual_amount: 0,
    failed_amount: 0,
    retry_amount: input.retryAmount,
    estimated_cost: 0,
    actual_cost: input.retryAmount,
    details: { ...(input.details || {}), attemptNo: input.attemptNo || 0, retry: true },
  });
}

interface InsertParams extends UsageInputCommon {
  cost_status: UsageCostStatus;
  estimated_amount: number;
  actual_amount: number;
  failed_amount: number;
  retry_amount: number;
  estimated_cost: number;
  actual_cost: number;
}

async function insertUsageRecord(params: InsertParams): Promise<string> {
  await ensureSchema();
  const id = randomUUID();
  const now = Date.now();
  getSqlite()
    .prepare(
      `INSERT INTO usage_records
        (id, project_id, agent_run_id, model_config_id, object_type, object_id,
         cost_status, prompt_tokens, completion_tokens, total_tokens,
         estimated_cost, actual_cost, details_json, created_at, updated_at,
         task_id, episode, track_id, estimated_amount, actual_amount,
         failed_amount, retry_amount, provider_job_id, provider_billing_unit)
       VALUES (?, ?, ?, ?, ?, ?,
               ?, 0, 0, 0,
               ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?,
               ?, ?, ?, ?)`,
    )
    .run(
      id,
      params.projectId,
      params.agentRunId || null,
      params.modelConfigId || null,
      params.objectType || 'task',
      params.objectId || params.taskId || null,
      params.cost_status,
      params.estimated_cost,
      params.actual_cost,
      JSON.stringify(params.details || {}),
      now,
      now,
      params.taskId || null,
      params.episode || 0,
      params.trackId || null,
      params.estimated_amount,
      params.actual_amount,
      params.failed_amount,
      params.retry_amount,
      params.providerJobId || null,
      params.providerBillingUnit || '',
    );
  return id;
}

/**
 * 聚合查询 — 按项目 / episode / track / cost_status 维度汇总
 */
export interface UsageSummary {
  totalEstimated: number;
  totalActual: number;
  totalFailed: number;
  totalRetry: number;
  recordCount: number;
}

export async function aggregateUsage(filter: {
  projectId?: string;
  episode?: number;
  trackId?: string;
  taskId?: string;
  costStatus?: UsageCostStatus;
}): Promise<UsageSummary> {
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
  if (filter.taskId) {
    where.push('task_id = ?');
    params.push(filter.taskId);
  }
  if (filter.costStatus) {
    where.push('cost_status = ?');
    params.push(filter.costStatus);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const row = getSqlite()
    .prepare(
      `SELECT
         COALESCE(SUM(estimated_amount), 0) AS estimated,
         COALESCE(SUM(actual_amount), 0) AS actual,
         COALESCE(SUM(failed_amount), 0) AS failed,
         COALESCE(SUM(retry_amount), 0) AS retry,
         COUNT(*) AS cnt
       FROM usage_records ${whereSql}`,
    )
    .get(...params) as { estimated: number; actual: number; failed: number; retry: number; cnt: number };
  return {
    totalEstimated: row.estimated || 0,
    totalActual: row.actual || 0,
    totalFailed: row.failed || 0,
    totalRetry: row.retry || 0,
    recordCount: row.cnt || 0,
  };
}

export async function listUsageRecords(filter: {
  projectId?: string;
  taskId?: string;
  limit?: number;
}): Promise<Array<{ id: string; taskId: string | null; costStatus: string; estimatedAmount: number; actualAmount: number; createdAt: number }>> {
  await ensureSchema();
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.projectId) {
    where.push('project_id = ?');
    params.push(filter.projectId);
  }
  if (filter.taskId) {
    where.push('task_id = ?');
    params.push(filter.taskId);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = getSqlite()
    .prepare(
      `SELECT id, task_id, cost_status, estimated_amount, actual_amount, created_at
       FROM usage_records ${whereSql}
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(...params, filter.limit || 50) as Array<{
    id: string;
    task_id: string | null;
    cost_status: string;
    estimated_amount: number;
    actual_amount: number;
    created_at: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    taskId: r.task_id,
    costStatus: r.cost_status,
    estimatedAmount: r.estimated_amount,
    actualAmount: r.actual_amount,
    createdAt: r.created_at,
  }));
}
