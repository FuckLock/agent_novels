'use client';

// CostReviewPanel — Phase 12 成本复盘面板
//
// 5 维度切换器（spec L742-743 + L665 与 cost-report-service 同源）：
//   projectId / episodeIndex / trackId / modelId / strategy
//
// 4 类成本字段（spec L742 + L828 与 cost-report-service 同源）：
//   estimated / actual / failed / retry
//
// MVP 占位（spec 允许）：
//   - 完整图表（饼图 / 折线图）留 Phase 13+；本面板用「表格 + 数字汇总」呈现

import { useMemo } from 'react';
import Card from '@/app/components/Card';
import StatusPill from '@/app/components/StatusPill';
import Button from '@/app/components/Button';

export type CostDimension =
  | 'projectId'
  | 'episodeIndex'
  | 'trackId'
  | 'modelId'
  | 'strategy';

export interface CostAggregateRow {
  dimensionKey: string | null;
  estimatedAmount: number;
  actualAmount: number;
  failedAmount: number;
  retryAmount: number;
  deviationAmount: number;
  deviationPercent: number | null;
  recordCount: number;
}

export interface CostReportData {
  dimension: CostDimension;
  rows: CostAggregateRow[];
  totalEstimated: number;
  totalActual: number;
  totalFailed: number;
  totalRetry: number;
  totalDeviation: number;
  summary: {
    estimated: number;
    actual: number;
    failed: number;
    retry: number;
  };
}

interface CostReviewPanelProps {
  report: CostReportData | null;
  dimension: CostDimension;
  onDimensionChange: (dimension: CostDimension) => void;
  loading?: boolean;
  /** 估算 / 实际 / 失败 / 重试 4 类成本汇总（由 /api/usage 返回） */
  costFields?: {
    estimated_amount: number;
    actual_amount: number;
    failed_amount: number;
    retry_amount: number;
  };
}

const DIMENSIONS: Array<{ key: CostDimension; label: string }> = [
  { key: 'projectId', label: '项目 project' },
  { key: 'episodeIndex', label: '单集 episode' },
  { key: 'trackId', label: 'Track 轨道' },
  { key: 'modelId', label: '模型 model' },
  { key: 'strategy', label: '策略 strategy' },
];

function formatAmount(amount: number): string {
  if (!amount || amount <= 0) return '$0.000';
  return `$${amount.toFixed(3)}`;
}

function formatPercent(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent)) return '—';
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${(percent * 100).toFixed(1)}%`;
}

export default function CostReviewPanel({
  report,
  dimension,
  onDimensionChange,
  loading,
  costFields,
}: CostReviewPanelProps) {
  const totals = useMemo(() => {
    if (costFields) {
      return {
        estimated: costFields.estimated_amount,
        actual: costFields.actual_amount,
        failed: costFields.failed_amount,
        retry: costFields.retry_amount,
      };
    }
    if (!report) return { estimated: 0, actual: 0, failed: 0, retry: 0 };
    return report.summary;
  }, [costFields, report]);

  const deviationPercent =
    totals.estimated > 0 ? totals.actual / totals.estimated - 1 : null;

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-[var(--tf-border-subtle)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[var(--tf-text-primary)]">成本复盘</h3>
            <p className="mt-0.5 text-xs text-[var(--tf-text-muted)]">
              5 维度聚合：项目 / 单集 / Track / 模型 / 策略
            </p>
          </div>
          <StatusPill variant="info">Phase 12</StatusPill>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          {DIMENSIONS.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => onDimensionChange(d.key)}
              className={`rounded-[var(--tf-radius-sm)] border px-2 py-1 transition ${
                dimension === d.key
                  ? 'border-[var(--tf-accent-primary)] bg-[var(--tf-accent-primary)] text-white'
                  : 'border-[var(--tf-border-subtle)] bg-[var(--tf-bg-panel)] text-[var(--tf-text-secondary)] hover:bg-[var(--tf-bg-raised)]'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-b border-[var(--tf-border-subtle)] px-4 py-3 md:grid-cols-4">
        <SummaryStat label="估算 estimated" value={formatAmount(totals.estimated)} />
        <SummaryStat label="实际 actual" value={formatAmount(totals.actual)} />
        <SummaryStat label="失败 failed" value={formatAmount(totals.failed)} variant="warning" />
        <SummaryStat label="重试 retry" value={formatAmount(totals.retry)} variant="info" />
      </div>

      <div className="grid grid-cols-2 gap-3 border-b border-[var(--tf-border-subtle)] bg-[var(--tf-bg-canvas)] px-4 py-3 md:grid-cols-3">
        <SummaryStat
          label="偏差 deviation"
          value={formatAmount(totals.actual - totals.estimated)}
          variant={totals.actual > totals.estimated ? 'warning' : 'success'}
        />
        <SummaryStat label="偏差百分比" value={formatPercent(deviationPercent)} />
        <SummaryStat label="记账总条数" value={`${report?.rows.length ?? 0}`} />
      </div>

      {loading ? (
        <div className="px-4 py-8 text-center text-sm text-[var(--tf-text-secondary)]">加载中…</div>
      ) : !report || report.rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-[var(--tf-text-secondary)]">
          暂无成本记录（提交任务后会生成 estimated / actual 记录）
        </div>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full table-auto border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--tf-border-subtle)] text-xs uppercase text-[var(--tf-text-secondary)]">
                <th className="px-3 py-2 text-left">{labelOf(dimension)}</th>
                <th className="px-3 py-2 text-right">估算 estimated</th>
                <th className="px-3 py-2 text-right">实际 actual</th>
                <th className="px-3 py-2 text-right">失败 failed</th>
                <th className="px-3 py-2 text-right">重试 retry</th>
                <th className="px-3 py-2 text-right">偏差</th>
                <th className="px-3 py-2 text-right">条数</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row, idx) => (
                <tr
                  key={`${row.dimensionKey || 'null'}-${idx}`}
                  className="border-b border-[var(--tf-border-subtle)]"
                >
                  <td className="px-3 py-2 font-mono text-xs text-[var(--tf-text-primary)]">
                    {row.dimensionKey === null || row.dimensionKey === '' ? '<空>' : row.dimensionKey}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-[var(--tf-text-secondary)]">
                    {formatAmount(row.estimatedAmount)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-[var(--tf-text-secondary)]">
                    {formatAmount(row.actualAmount)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-amber-700 dark:text-amber-300">
                    {formatAmount(row.failedAmount)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-[var(--tf-text-secondary)]">
                    {formatAmount(row.retryAmount)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right text-xs ${
                      row.deviationAmount > 0
                        ? 'text-red-700 dark:text-red-300'
                        : 'text-green-700 dark:text-green-300'
                    }`}
                  >
                    {formatAmount(row.deviationAmount)} ({formatPercent(row.deviationPercent)})
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-[var(--tf-text-secondary)]">
                    {row.recordCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t border-[var(--tf-border-subtle)] px-4 py-2 text-xs text-[var(--tf-text-muted)]">
        cost_status 字面量：estimated / actual / reconciled / disputed（spec L743 + L844）
        <span className="ml-2">— 完整图表（饼图 / 折线图）待 Phase 13+ 接入</span>
      </div>
    </Card>
  );
}

function labelOf(dim: CostDimension): string {
  const found = DIMENSIONS.find((d) => d.key === dim);
  return found ? found.label : dim;
}

function SummaryStat({
  label,
  value,
  variant = 'neutral',
}: {
  label: string;
  value: string;
  variant?: 'neutral' | 'info' | 'warning' | 'success';
}) {
  const variantClass: Record<string, string> = {
    neutral: 'text-[var(--tf-text-primary)]',
    info: 'text-blue-600 dark:text-blue-300',
    warning: 'text-amber-600 dark:text-amber-300',
    success: 'text-green-600 dark:text-green-300',
  };
  return (
    <div className="rounded-[var(--tf-radius-sm)] border border-[var(--tf-border-subtle)] bg-[var(--tf-bg-panel)] px-3 py-2">
      <div className="text-xs text-[var(--tf-text-muted)]">{label}</div>
      <div className={`mt-1 text-base font-semibold ${variantClass[variant]}`}>{value}</div>
    </div>
  );
}

// 静态导出供调用方刷新（Button 引用避免 tree-shake 移除）
export function CostReviewPanelRefreshButton({ onRefresh }: { onRefresh: () => void }) {
  return (
    <Button size="sm" variant="secondary" onClick={onRefresh}>
      刷新成本复盘
    </Button>
  );
}
