'use client';

// TaskTable — Phase 12 任务中心表格
//
// 展示 5 类任务字段（spec L491 + L555 + L853）：
//   - id / status / providerJobId / attemptNo / cost / failedReason
//
// 5 个 reconciliation 状态（与 reconcile-service.ts 同源 — spec L853）：
//   normal / reconnecting / orphaned / reconciled / duplicate_blocked
//
// 5 个行级操作（派发硬约束 + spec L555）：
//   恢复 / 取消 / 重试 / 对账 / 详情

import { useMemo, useState } from 'react';
import StatusPill, { type StatusVariant } from '@/app/components/StatusPill';
import Button from '@/app/components/Button';

export interface TaskTableItem {
  taskId: string;
  projectId: string;
  trackId: string | null;
  episode: number;
  status: string;
  providerJobId: string | null;
  attemptNo: number;
  costEstimate: number;
  costActual: number;
  failedReason: string;
  updatedAt: number;
  reconciliationStatus:
    | 'normal'
    | 'reconnecting'
    | 'orphaned'
    | 'reconciled'
    | 'duplicate_blocked';
}

interface TaskTableProps {
  tasks: TaskTableItem[];
  onRecover?: (taskId: string) => void;
  onCancel?: (taskId: string) => void;
  onRetry?: (taskId: string) => void;
  onReconcile?: (taskId: string) => void;
  onDetail?: (taskId: string) => void;
  loading?: boolean;
}

const RECONCILIATION_VARIANT: Record<TaskTableItem['reconciliationStatus'], StatusVariant> = {
  normal: 'neutral',
  reconnecting: 'info',
  orphaned: 'warning',
  reconciled: 'success',
  duplicate_blocked: 'warning',
};

const RECONCILIATION_LABEL: Record<TaskTableItem['reconciliationStatus'], string> = {
  normal: '正常',
  reconnecting: '重连中',
  orphaned: '孤儿',
  reconciled: '已对账',
  duplicate_blocked: '重复拦截',
};

const TASK_STATUS_LABEL: Record<string, string> = {
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

function formatCost(cost: number): string {
  if (!cost || cost <= 0) return '—';
  return `$${cost.toFixed(3)}`;
}

export default function TaskTable({
  tasks,
  onRecover,
  onCancel,
  onRetry,
  onReconcile,
  onDetail,
  loading,
}: TaskTableProps) {
  const [filter, setFilter] = useState<string>('all');

  const sorted = useMemo(() => {
    const filtered =
      filter === 'all' ? tasks : tasks.filter((t) => t.reconciliationStatus === filter);
    return [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [tasks, filter]);

  return (
    <div className="rounded-[var(--tf-radius-md)] border border-[var(--tf-border-subtle)] bg-[var(--tf-bg-panel)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--tf-border-subtle)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--tf-text-primary)]">任务中心</h3>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <FilterChip
            label="全部"
            active={filter === 'all'}
            onClick={() => setFilter('all')}
          />
          <FilterChip
            label="正常 normal"
            active={filter === 'normal'}
            onClick={() => setFilter('normal')}
          />
          <FilterChip
            label="重连 reconnecting"
            active={filter === 'reconnecting'}
            onClick={() => setFilter('reconnecting')}
          />
          <FilterChip
            label="孤儿 orphaned"
            active={filter === 'orphaned'}
            onClick={() => setFilter('orphaned')}
          />
          <FilterChip
            label="已对账 reconciled"
            active={filter === 'reconciled'}
            onClick={() => setFilter('reconciled')}
          />
          <FilterChip
            label="重复拦截 duplicate_blocked"
            active={filter === 'duplicate_blocked'}
            onClick={() => setFilter('duplicate_blocked')}
          />
        </div>
        {loading && (
          <span className="text-xs text-[var(--tf-text-muted)]">加载中…</span>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-[var(--tf-text-secondary)]">
          暂无任务（提交 Track 后会显示在此处）
        </div>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full table-auto border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--tf-border-subtle)] text-xs uppercase text-[var(--tf-text-secondary)]">
                <th className="px-3 py-2 text-left">任务 ID / providerJobId</th>
                <th className="px-3 py-2 text-left">状态 status</th>
                <th className="px-3 py-2 text-left">恢复状态</th>
                <th className="px-3 py-2 text-left">重试 attemptNo</th>
                <th className="px-3 py-2 text-left">成本 cost</th>
                <th className="px-3 py-2 text-left">失败原因 failedReason / error</th>
                <th className="px-3 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((task) => {
                const reconVariant = RECONCILIATION_VARIANT[task.reconciliationStatus];
                const reconLabel = RECONCILIATION_LABEL[task.reconciliationStatus];
                const statusLabel = TASK_STATUS_LABEL[task.status] || task.status;
                const isFailed =
                  task.status === 'failed' || task.status === 'timeout' || task.status === 'blocked';
                const isDuplicateBlocked = task.status === 'duplicate_blocked';
                const isOrphaned = task.reconciliationStatus === 'orphaned';
                const rowWarning = isFailed || isDuplicateBlocked || isOrphaned;
                return (
                  <tr
                    key={task.taskId}
                    className={`border-b border-[var(--tf-border-subtle)] ${
                      rowWarning ? 'bg-amber-50 dark:bg-amber-950/20' : ''
                    }`}
                  >
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs text-[var(--tf-text-primary)]">
                        {task.taskId.slice(0, 8)}
                      </div>
                      <div className="font-mono text-xs text-[var(--tf-text-secondary)]">
                        {task.providerJobId || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill variant="info">{statusLabel}</StatusPill>
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill variant={reconVariant}>{reconLabel}</StatusPill>
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--tf-text-secondary)]">
                      重试 {task.attemptNo}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--tf-text-secondary)]">
                      <div>估算 cost: {formatCost(task.costEstimate)}</div>
                      <div>实际 cost: {formatCost(task.costActual)}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-red-700 dark:text-red-300">
                      {task.failedReason ? task.failedReason.slice(0, 80) : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div className="flex flex-wrap gap-1.5">
                        {onRecover && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onRecover(task.taskId)}
                            aria-label="恢复 recover"
                          >
                            恢复
                          </Button>
                        )}
                        {onCancel && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onCancel(task.taskId)}
                            aria-label="取消 cancel"
                          >
                            取消
                          </Button>
                        )}
                        {onRetry && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onRetry(task.taskId)}
                            aria-label="重试 retry"
                          >
                            重试
                          </Button>
                        )}
                        {onReconcile && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onReconcile(task.taskId)}
                            aria-label="对账 reconcile"
                          >
                            对账
                          </Button>
                        )}
                        {onDetail && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onDetail(task.taskId)}
                            aria-label="详情 detail"
                          >
                            详情
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-[var(--tf-border-subtle)] px-4 py-2 text-xs text-[var(--tf-text-muted)]">
        共 {sorted.length} 条记录 — 5 个恢复状态：normal / reconnecting / orphaned / reconciled / duplicate_blocked
      </div>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[var(--tf-radius-sm)] border px-2 py-0.5 transition ${
        active
          ? 'border-[var(--tf-accent-primary)] bg-[var(--tf-accent-primary)] text-white'
          : 'border-[var(--tf-border-subtle)] bg-[var(--tf-bg-panel)] text-[var(--tf-text-secondary)] hover:bg-[var(--tf-bg-raised)]'
      }`}
    >
      {label}
    </button>
  );
}
