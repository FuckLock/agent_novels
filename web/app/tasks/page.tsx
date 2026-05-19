'use client';

// tasks/page.tsx — Phase 12 任务中心真实化（原 74 行壳 → 接入 TaskTable + CostReviewPanel + 数据源）
//
// 数据源：
//   - /api/tasks/reconcile  (GET 拉快照 / POST 触发对账 / 行级操作)
//   - /api/usage             (5 维度成本聚合 + 4 类成本字段)
//   - /api/tasks             (Phase 9 既有任务列表 — 兼容 fallback)
//
// 设计系沿用：Card / StatusPill / CSS 变量 var(--tf-*) — 保留 74 行壳的语义

import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Clapperboard, FileText, Image as ImageIcon, ListChecks } from 'lucide-react';
import Card from '../components/Card';
import StatusPill from '../components/StatusPill';
import Button from '../components/Button';
import TaskTable, { type TaskTableItem } from '../components/tasks/TaskTable';
import CostReviewPanel, {
  type CostDimension,
  type CostReportData,
} from '../components/usage/CostReviewPanel';

interface ReconcileSnapshot {
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

interface ReconcileResponse {
  snapshots: ReconcileSnapshot[];
  counts: Record<string, number>;
  orphanedCount: number;
}

interface UsageResponse {
  report: CostReportData;
  deviation: {
    estimated: number;
    actual: number;
    failed: number;
    retry: number;
    deviationAmount: number;
    deviationPercent: number | null;
    costStatus: string;
  };
  costFields: {
    estimated_amount: number;
    actual_amount: number;
    failed_amount: number;
    retry_amount: number;
    estimated_cost: number;
    actual_cost: number;
  };
}

const lanes = [
  { title: '文本生产', status: '待接入', icon: FileText, variant: 'warning' as const },
  { title: '资产塑造', status: '待接入', icon: ImageIcon, variant: 'info' as const },
  { title: '视频制作', status: 'Phase 12 接入', icon: Clapperboard, variant: 'success' as const },
];

export default function TasksPage() {
  const [snapshots, setSnapshots] = useState<TaskTableItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [orphanedCount, setOrphanedCount] = useState(0);
  const [report, setReport] = useState<CostReportData | null>(null);
  const [costFields, setCostFields] = useState<UsageResponse['costFields'] | null>(null);
  const [dimension, setDimension] = useState<CostDimension>('projectId');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReconcile = useCallback(async () => {
    const res = await fetch('/api/tasks/reconcile', { cache: 'no-store' });
    if (!res.ok) throw new Error(`reconcile API ${res.status}`);
    const data: ReconcileResponse = await res.json();
    setSnapshots(
      data.snapshots.map((s) => ({
        taskId: s.taskId,
        projectId: s.projectId,
        trackId: s.trackId,
        episode: s.episode,
        status: s.status,
        providerJobId: s.providerJobId,
        attemptNo: s.attemptNo,
        costEstimate: s.costEstimate,
        costActual: s.costActual,
        failedReason: s.failedReason,
        updatedAt: s.updatedAt,
        reconciliationStatus: s.reconciliationStatus,
      })),
    );
    setCounts(data.counts || {});
    setOrphanedCount(data.orphanedCount || 0);
  }, []);

  const loadUsage = useCallback(
    async (dim: CostDimension) => {
      const res = await fetch(`/api/usage?dimension=${encodeURIComponent(dim)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`usage API ${res.status}`);
      const data: UsageResponse = await res.json();
      setReport(data.report);
      setCostFields(data.costFields);
    },
    [],
  );

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadReconcile(), loadUsage(dimension)]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '未知错误';
      setError(`加载失败：${msg}`);
    } finally {
      setLoading(false);
    }
  }, [loadReconcile, loadUsage, dimension]);

  // 单次轮询（30s 刷新；Phase 7 双 setInterval 教训沿用 — 仅 1 个轮询源）
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        await refreshAll();
      } catch {
        // 静默
      }
    };
    tick();
    const timer = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refreshAll]);

  const handleDimensionChange = useCallback(
    async (dim: CostDimension) => {
      setDimension(dim);
      setLoading(true);
      try {
        await loadUsage(dim);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '未知错误';
        setError(`成本复盘加载失败：${msg}`);
      } finally {
        setLoading(false);
      }
    },
    [loadUsage],
  );

  const handleReconcileAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tasks/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'all' }),
      });
      if (!res.ok) throw new Error(`reconcile POST ${res.status}`);
      await refreshAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '未知错误';
      setError(`触发对账失败：${msg}`);
    } finally {
      setLoading(false);
    }
  }, [refreshAll]);

  const handleTaskAction = useCallback(
    async (action: 'pause' | 'resume' | 'cancel' | 'retry', taskId: string) => {
      try {
        await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, taskId }),
        });
        await refreshAll();
      } catch (e) {
        const msg = e instanceof Error ? e.message : '未知错误';
        setError(`任务操作失败：${msg}`);
      }
    },
    [refreshAll],
  );

  const handleReconcileTask = useCallback(
    async (taskId: string) => {
      try {
        await fetch('/api/tasks/reconcile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'task', taskId }),
        });
        await refreshAll();
      } catch (e) {
        const msg = e instanceof Error ? e.message : '未知错误';
        setError(`对账失败：${msg}`);
      }
    },
    [refreshAll],
  );

  return (
    <div className="p-6 lg:p-10">
      <div className="mx-auto max-w-[1180px] space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--tf-text-primary)]">任务中心</h2>
            <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
              对账 + 成本复盘 — 5 个恢复状态 / 5 维度聚合 / 4 类成本字段
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill variant="info">Phase 12</StatusPill>
            <Button size="sm" variant="primary" onClick={handleReconcileAll} loading={loading}>
              触发对账
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-[var(--tf-radius-sm)] border border-red-400 bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {lanes.map((lane) => {
            const Icon = lane.icon;
            return (
              <Card key={lane.title} className="min-h-[150px]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[var(--tf-radius-md)] bg-[var(--tf-bg-raised)] text-[var(--tf-text-primary)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <StatusPill variant={lane.variant}>{lane.status}</StatusPill>
                </div>
                <div className="mt-5">
                  <h3 className="text-base font-semibold text-[var(--tf-text-primary)]">{lane.title}</h3>
                  <div className="mt-4 h-1.5 rounded-full bg-[var(--tf-bg-canvas)]">
                    <div className="h-full w-2 rounded-full bg-[var(--tf-border-strong)]" />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-[var(--tf-border-subtle)] px-5 py-4">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-[var(--tf-text-secondary)]" />
              <h3 className="text-sm font-semibold text-[var(--tf-text-primary)]">恢复状态汇总</h3>
            </div>
            <ArrowUpRight className="h-4 w-4 text-[var(--tf-text-muted)]" />
          </div>
          <div className="grid grid-cols-2 gap-3 px-5 py-4 md:grid-cols-5">
            <CountStat label="正常 normal" value={counts.normal || 0} />
            <CountStat label="重连 reconnecting" value={counts.reconnecting || 0} />
            <CountStat label="孤儿 orphaned" value={counts.orphaned || 0} variant="warning" />
            <CountStat label="已对账 reconciled" value={counts.reconciled || 0} variant="success" />
            <CountStat
              label="重复拦截 duplicate_blocked"
              value={counts.duplicate_blocked || 0}
              variant="warning"
            />
          </div>
          {orphanedCount > 0 && (
            <div className="border-t border-[var(--tf-border-subtle)] bg-amber-50 px-5 py-2 text-xs text-amber-700 dark:bg-amber-950/20 dark:text-amber-300">
              检测到 {orphanedCount} 个孤儿任务（无 provider_job_id 或长时间无更新）
            </div>
          )}
        </Card>

        <TaskTable
          tasks={snapshots}
          loading={loading}
          onRecover={(id) => handleTaskAction('resume', id)}
          onCancel={(id) => handleTaskAction('cancel', id)}
          onRetry={(id) => handleTaskAction('retry', id)}
          onReconcile={(id) => handleReconcileTask(id)}
          onDetail={(id) => {
            window.alert(`详情视图待 Phase 13+ 接入（taskId: ${id}）`);
          }}
        />

        <CostReviewPanel
          report={report}
          dimension={dimension}
          onDimensionChange={handleDimensionChange}
          loading={loading}
          costFields={costFields || undefined}
        />
      </div>
    </div>
  );
}

function CountStat({
  label,
  value,
  variant = 'neutral',
}: {
  label: string;
  value: number;
  variant?: 'neutral' | 'info' | 'warning' | 'success';
}) {
  const colorClass: Record<string, string> = {
    neutral: 'text-[var(--tf-text-primary)]',
    info: 'text-blue-600 dark:text-blue-300',
    warning: 'text-amber-600 dark:text-amber-300',
    success: 'text-green-600 dark:text-green-300',
  };
  return (
    <div className="rounded-[var(--tf-radius-sm)] border border-[var(--tf-border-subtle)] bg-[var(--tf-bg-panel)] px-3 py-2">
      <div className="text-xs text-[var(--tf-text-muted)]">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${colorClass[variant]}`}>{value}</div>
    </div>
  );
}
