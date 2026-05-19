'use client';

import { useMemo } from 'react';
import StatusPill, { type StatusVariant } from '@/app/components/StatusPill';

/**
 * TrackTaskGrid — Phase 9 任务列表 MVP
 *
 * 显示：
 *   - providerJobId
 *   - status（含 duplicate_blocked / failed amber 警示）
 *   - elapsed duration（耗时）
 *   - cost（估算 / 实际）
 *
 * MVP 占位（标 Phase 10 接入）：
 *   - 缩略图（thumbnail preview）
 *   - 重试按钮（retry button）
 *   - 失败原因展开
 */

export interface TrackTaskGridItem {
  taskId: string;
  trackId: string;
  status: string;
  providerJobId: string | null;
  strategy: string;
  costEstimate: number;
  costActual: number;
  createdAt: number;
  updatedAt: number;
  failedReason?: string;
}

interface Props {
  tasks: TrackTaskGridItem[];
  onRetry?: (taskId: string) => void;
  onPause?: (taskId: string) => void;
}

const STATUS_VARIANT: Record<string, StatusVariant> = {
  pending: 'neutral',
  queued: 'neutral',
  submitted: 'info',
  running: 'info',
  retrying: 'warning',
  reconciling: 'info',
  paused: 'warning',
  succeeded: 'success',
  failed: 'danger',
  timeout: 'danger',
  cancelled: 'neutral',
  blocked: 'danger',
  duplicate_blocked: 'warning',
};

const STATUS_LABEL: Record<string, string> = {
  pending: '待处理',
  queued: '排队中',
  submitted: '已提交',
  running: '运行中',
  retrying: '重试中',
  reconciling: '对账中',
  paused: '已暂停',
  succeeded: '成功',
  failed: '失败',
  timeout: '超时',
  cancelled: '已取消',
  blocked: '已阻塞',
  duplicate_blocked: '幂等拦截',
};

function formatElapsed(createdAt: number, updatedAt: number): string {
  const elapsedMs = Math.max(0, updatedAt - createdAt);
  if (elapsedMs < 1000) return `${elapsedMs}ms`;
  const elapsedSec = Math.round(elapsedMs / 1000);
  if (elapsedSec < 60) return `${elapsedSec}s`;
  const min = Math.floor(elapsedSec / 60);
  const sec = elapsedSec % 60;
  return `${min}m ${sec}s`;
}

function formatCost(cost: number): string {
  if (cost <= 0) return '—';
  return `$${cost.toFixed(3)}`;
}

export default function TrackTaskGrid({ tasks, onRetry, onPause }: Props) {
  const sortedTasks = useMemo(() => [...tasks].sort((a, b) => b.createdAt - a.createdAt), [tasks]);

  if (sortedTasks.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--tf-border-subtle)] bg-[var(--tf-bg-surface)] p-6 text-center text-sm text-[var(--tf-text-secondary)]">
        暂无任务（提交 Track 后会显示在此处）
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full table-auto border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--tf-border-subtle)] text-xs uppercase text-[var(--tf-text-secondary)]">
            <th className="px-3 py-2 text-left">Track / Provider Job</th>
            <th className="px-3 py-2 text-left">状态</th>
            <th className="px-3 py-2 text-left">策略</th>
            <th className="px-3 py-2 text-left">耗时 (duration / elapsed)</th>
            <th className="px-3 py-2 text-left">成本 (cost)</th>
            <th className="px-3 py-2 text-left">操作</th>
          </tr>
        </thead>
        <tbody>
          {sortedTasks.map((task) => {
            const isDuplicateBlocked = task.status === 'duplicate_blocked';
            const isFailed = task.status === 'failed' || task.status === 'timeout' || task.status === 'blocked';
            const variant = STATUS_VARIANT[task.status] || 'neutral';
            const label = STATUS_LABEL[task.status] || task.status;
            const rowWarning = isDuplicateBlocked || isFailed;
            return (
              <tr
                key={task.taskId}
                className={`border-b border-[var(--tf-border-subtle)] ${
                  rowWarning ? 'bg-amber-50 dark:bg-amber-950/20' : ''
                }`}
              >
                <td className="px-3 py-2">
                  <div className="font-mono text-xs text-[var(--tf-text-primary)]">
                    {task.trackId.slice(0, 8)}
                  </div>
                  <div className="font-mono text-xs text-[var(--tf-text-secondary)]">
                    {task.providerJobId || '—'}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <StatusPill variant={variant}>{label}</StatusPill>
                  {isDuplicateBlocked && (
                    <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                      重复提交，已拦截（防重复扣费）
                    </div>
                  )}
                  {isFailed && task.failedReason && (
                    <div className="mt-1 text-xs text-red-700 dark:text-red-300">
                      失败原因：{task.failedReason.slice(0, 80)}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--tf-text-secondary)]">
                  {task.strategy || '—'}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--tf-text-secondary)]">
                  {formatElapsed(task.createdAt, task.updatedAt)}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--tf-text-secondary)]">
                  <div>估算: {formatCost(task.costEstimate)}</div>
                  <div>实际: {formatCost(task.costActual)}</div>
                </td>
                <td className="px-3 py-2 text-xs">
                  {/* Phase 10 接入完整重试 / 取消按钮 + 缩略图 preview */}
                  {isFailed && onRetry && (
                    <button
                      type="button"
                      onClick={() => onRetry(task.taskId)}
                      className="rounded border border-amber-400 px-2 py-1 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900"
                    >
                      重试
                    </button>
                  )}
                  {task.status === 'running' && onPause && (
                    <button
                      type="button"
                      onClick={() => onPause(task.taskId)}
                      className="rounded border border-[var(--tf-border-subtle)] px-2 py-1 text-[var(--tf-text-secondary)] hover:bg-[var(--tf-bg-raised)]"
                    >
                      暂停
                    </button>
                  )}
                  {/* TODO: Phase 10 接入 缩略图 thumbnail preview / 完整 retry 表单 / duplicate_blocked 详情链接 */}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-3 text-xs text-[var(--tf-text-secondary)]">
        共 {sortedTasks.length} 个任务 — 缩略图 thumbnail / 重试 retry 表单 / failed reason 详情 待 Phase 10 接入
      </div>
    </div>
  );
}
