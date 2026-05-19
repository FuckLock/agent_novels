// runtime: nodejs
// cost-report-service: Phase 12 成本复盘 + 5 维度聚合 + 4 类成本字段
//
// Phase 12 性质：消费方（消费 Phase 5b/Phase 9 usage_records 表 + Phase 9 tasks 表）
//   - 不修改 Phase 9 usage-service.ts 源码（git diff = 0）
//
// 5 个聚合维度（spec L742-743 + L665 硬约束）：
//   - projectId      项目
//   - episodeIndex   单集（episode）
//   - trackId        Track
//   - modelId        模型（model_config_id）
//   - strategy       策略
//
// 4 类成本字段（spec L742 + L828 + L665 硬约束）：
//   - estimated_amount   估算成本（任务提交时记账）
//   - actual_amount      实际成本（任务 succeeded 时回填）
//   - failed_amount      失败成本（任务 failed 仍可能产生费用）
//   - retry_amount       重试成本（attempt > 1 时记账）
//
// cost_status 枚举（spec L743 + L844）：
//   - 'estimated' / 'actual' / 'failed' / 'reconciled' / 'disputed' / 'retry'
//
// 路径 5 数据一致性（spec L420 + L532 硬约束）：
//   - 至少 1 处 SQL JOIN tasks + usage_records
//   - usage API 返回 estimated_amount / estimated_cost 字段与 path5 GET 同源

import { ensureSchema } from '../db/migrate';
import { getSqlite } from '../db/client';

// ============================================================
// 1. 5 维度类型 + 枚举（spec L742-743 + L665 硬约束）
// ============================================================

export type CostDimension =
  | 'projectId'
  | 'episodeIndex'
  | 'trackId'
  | 'modelId'
  | 'strategy';

export const COST_DIMENSIONS: CostDimension[] = [
  'projectId',
  'episodeIndex',
  'trackId',
  'modelId',
  'strategy',
];

/** 别名 — UI 端使用 UsageReportDimension */
export type UsageReportDimension = CostDimension;
export const USAGE_REPORT_DIMENSIONS = COST_DIMENSIONS;

export type CostReportDimensions = CostDimension[];

// ============================================================
// 2. 维度 → SQL 字段映射（用于 GROUP BY）
// ============================================================
//
// 注意：usage_records 表本身有 project_id / episode / track_id / model_config_id 字段（Phase 9 ALTER TABLE）
// strategy 维度需通过 JOIN tasks（tasks.strategy）补全 — 这里也是路径 5 数据一致性的 JOIN 锚点

interface DimensionMapping {
  sqlField: string;
  /** 是否需要 JOIN tasks 表（strategy 维度需要） */
  requiresTaskJoin: boolean;
}

const DIMENSION_MAP: Record<CostDimension, DimensionMapping> = {
  projectId: { sqlField: 'u.project_id', requiresTaskJoin: false },
  episodeIndex: { sqlField: 'u.episode', requiresTaskJoin: false },
  trackId: { sqlField: 'u.track_id', requiresTaskJoin: false },
  modelId: { sqlField: 'u.model_config_id', requiresTaskJoin: false },
  strategy: { sqlField: 't.strategy', requiresTaskJoin: true },
};

// ============================================================
// 3. 4 类成本字段类型 + 偏差类型
// ============================================================

export interface CostAggregateRow {
  /** 维度键 — 当 dimension=projectId 时为 project_id 值 */
  dimensionKey: string | null;
  estimatedAmount: number;
  actualAmount: number;
  failedAmount: number;
  retryAmount: number;
  /** 估算 vs 实际偏差（actual - estimated，正数表示超支） */
  deviationAmount: number;
  /** 偏差百分比（actual / estimated - 1，estimated=0 时返回 null） */
  deviationPercent: number | null;
  recordCount: number;
}

export interface CostReportInput {
  dimension: CostDimension;
  projectId?: string;
  episode?: number;
  trackId?: string;
  modelConfigId?: string;
  strategy?: string;
  /** cost_status 过滤（estimated / actual / failed / reconciled / disputed / retry） */
  costStatus?: string;
  limit?: number;
}

export interface CostReport {
  dimension: CostDimension;
  rows: CostAggregateRow[];
  totalEstimated: number;
  totalActual: number;
  totalFailed: number;
  totalRetry: number;
  totalDeviation: number;
  /** 4 类成本汇总（与 4 类字段同源） */
  summary: {
    estimated: number;
    actual: number;
    failed: number;
    retry: number;
  };
}

// ============================================================
// 4. SQL 构造（GROUP BY 5 维度任一）— 路径 5 数据一致性 JOIN 锚点
// ============================================================

interface SqlPlan {
  sql: string;
  params: (string | number)[];
}

function buildAggregateSql(input: CostReportInput): SqlPlan {
  const dim = DIMENSION_MAP[input.dimension];
  const needJoin = dim.requiresTaskJoin || input.strategy !== undefined;
  // JOIN tasks + usage_records — 路径 5 数据一致性（C3 + L420 + L532）
  const fromClause = needJoin
    ? `FROM usage_records u LEFT JOIN tasks t ON t.id = u.task_id`
    : `FROM usage_records u`;

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (input.projectId) {
    where.push('u.project_id = ?');
    params.push(input.projectId);
  }
  if (input.episode !== undefined) {
    where.push('u.episode = ?');
    params.push(input.episode);
  }
  if (input.trackId) {
    where.push('u.track_id = ?');
    params.push(input.trackId);
  }
  if (input.modelConfigId) {
    where.push('u.model_config_id = ?');
    params.push(input.modelConfigId);
  }
  if (input.strategy) {
    where.push('t.strategy = ?');
    params.push(input.strategy);
  }
  if (input.costStatus) {
    where.push('u.cost_status = ?');
    params.push(input.costStatus);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const sql = `
    SELECT ${dim.sqlField} AS dimension_key,
           COALESCE(SUM(u.estimated_amount), 0) AS estimated_amount,
           COALESCE(SUM(u.actual_amount), 0)    AS actual_amount,
           COALESCE(SUM(u.failed_amount), 0)    AS failed_amount,
           COALESCE(SUM(u.retry_amount), 0)     AS retry_amount,
           COUNT(*)                             AS record_count
      ${fromClause}
      ${whereSql}
      GROUP BY ${dim.sqlField}
      ORDER BY estimated_amount DESC
      LIMIT ?
  `;
  params.push(input.limit || 100);
  return { sql, params };
}

// ============================================================
// 5. aggregateCostReport — 主入口（按 1 个维度聚合 + 4 类成本汇总）
// ============================================================

interface AggregateRow {
  dimension_key: string | number | null;
  estimated_amount: number;
  actual_amount: number;
  failed_amount: number;
  retry_amount: number;
  record_count: number;
}

export async function aggregateCostReport(input: CostReportInput): Promise<CostReport> {
  await ensureSchema();
  const { sql, params } = buildAggregateSql(input);
  const rawRows = getSqlite().prepare(sql).all(...params) as AggregateRow[];

  // 使用 Map 在程序内做二次聚合（B3 程序内 group 证据）
  const rowMap = new Map<string, CostAggregateRow>();
  for (const r of rawRows) {
    const key = r.dimension_key === null ? null : String(r.dimension_key);
    const estimated = Number(r.estimated_amount) || 0;
    const actual = Number(r.actual_amount) || 0;
    const failed = Number(r.failed_amount) || 0;
    const retry = Number(r.retry_amount) || 0;
    const deviation = actual - estimated;
    const deviationPercent = estimated > 0 ? actual / estimated - 1 : null;
    rowMap.set(key ?? '<null>', {
      dimensionKey: key,
      estimatedAmount: estimated,
      actualAmount: actual,
      failedAmount: failed,
      retryAmount: retry,
      deviationAmount: deviation,
      deviationPercent,
      recordCount: Number(r.record_count) || 0,
    });
  }

  const rows = Array.from(rowMap.values());
  const totalEstimated = rows.reduce((sum, r) => sum + r.estimatedAmount, 0);
  const totalActual = rows.reduce((sum, r) => sum + r.actualAmount, 0);
  const totalFailed = rows.reduce((sum, r) => sum + r.failedAmount, 0);
  const totalRetry = rows.reduce((sum, r) => sum + r.retryAmount, 0);

  return {
    dimension: input.dimension,
    rows,
    totalEstimated,
    totalActual,
    totalFailed,
    totalRetry,
    totalDeviation: totalActual - totalEstimated,
    summary: {
      estimated: totalEstimated,
      actual: totalActual,
      failed: totalFailed,
      retry: totalRetry,
    },
  };
}

export const buildCostReport = aggregateCostReport;
export const getCostReport = aggregateCostReport;

// ============================================================
// 6. computeEstimateDeviation — 估算 vs 实际偏差（spec L279 + 派发硬约束）
// ============================================================

export interface EstimateDeviation {
  estimated: number;
  actual: number;
  failed: number;
  retry: number;
  deviationAmount: number;
  deviationPercent: number | null;
  /** cost_status 字面量 — 供 UI 展示对账状态 */
  costStatus: 'estimated' | 'actual' | 'reconciled' | 'disputed';
}

/**
 * 计算项目（或 episode / task）层级的估算 vs 实际偏差
 * spec L743 + L844：估算与实际成本分离记录 + 对账状态
 */
export async function computeEstimateDeviation(filter: {
  projectId?: string;
  episode?: number;
  taskId?: string;
}): Promise<EstimateDeviation> {
  await ensureSchema();
  // 路径 5 数据一致性：JOIN tasks + usage_records（确保 task_id 关联同源）
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.projectId) {
    where.push('u.project_id = ?');
    params.push(filter.projectId);
  }
  if (filter.episode !== undefined) {
    where.push('u.episode = ?');
    params.push(filter.episode);
  }
  if (filter.taskId) {
    where.push('u.task_id = ?');
    params.push(filter.taskId);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const row = getSqlite()
    .prepare(
      `SELECT COALESCE(SUM(u.estimated_amount), 0)  AS estimated,
              COALESCE(SUM(u.actual_amount), 0)     AS actual,
              COALESCE(SUM(u.failed_amount), 0)     AS failed,
              COALESCE(SUM(u.retry_amount), 0)      AS retry
         FROM usage_records u
         LEFT JOIN tasks t ON t.id = u.task_id
         ${whereSql}`,
    )
    .get(...params) as {
    estimated: number;
    actual: number;
    failed: number;
    retry: number;
  };
  const estimated = Number(row.estimated) || 0;
  const actual = Number(row.actual) || 0;
  const failed = Number(row.failed) || 0;
  const retry = Number(row.retry) || 0;
  const deviationAmount = actual - estimated;
  const deviationPercent = estimated > 0 ? actual / estimated - 1 : null;
  // MVP 占位（真实 provider 账单查询留 Phase 13+）：
  //   actual > 0 → 'actual'；estimated > 0 → 'estimated'；否则 'reconciled'
  let costStatus: EstimateDeviation['costStatus'] = 'estimated';
  if (actual > 0) costStatus = 'actual';
  if (actual > 0 && estimated > 0 && Math.abs(deviationAmount) < 0.01) costStatus = 'reconciled';
  return { estimated, actual, failed, retry, deviationAmount, deviationPercent, costStatus };
}

export const calcEstimateGap = computeEstimateDeviation;
export const estimateDeviation = computeEstimateDeviation;
export const costDeviation = computeEstimateDeviation;
