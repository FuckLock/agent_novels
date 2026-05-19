'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, PackageCheck, Scissors } from 'lucide-react';
import Card from '@/app/components/Card';
import Button from '@/app/components/Button';
import StatusPill from '@/app/components/StatusPill';
import QualityGatePanel, {
  type QualityGateView,
} from '@/app/components/quality/QualityGatePanel';
import TakeReviewPanel, {
  type TakeView,
} from '@/app/components/takes/TakeReviewPanel';
import type { TakeIssueType } from '@/app/lib/server/quality/video-quality-protocol';
import type { ProjectDetail } from '../types';

// Phase 10 TakeDeliveryTab — 117 行壳真实化
// 接入 QualityGatePanel + TakeReviewPanel
// 数据来源：
//   - GET /api/projects/[name]/takes              所有 take（按 createdAt DESC）
//   - GET /api/projects/[name]/takes/[takeId]     单 take + 质量门禁详情
//   - POST /api/projects/[name]/takes/[takeId]    accept / retry / replace / lock / mark_issue
//   - POST /api/projects/[name]/quality-gates     pass / approve / reject / waive

interface TakeDeliveryTabProps {
  project: ProjectDetail;
}

// 静态占位行（fallback；同 Phase 8 path5 模式）— 数据加载失败时展示
const qualityRows = [
  { label: '角色一致性', status: 'unchecked', variant: 'neutral' as const },
  { label: '动作可读性', status: 'unchecked', variant: 'neutral' as const },
  { label: '构图与时长', status: 'unchecked', variant: 'neutral' as const },
];

interface TakeApiResponse {
  take: TakeView;
  quality: {
    qualityStatus: 'unchecked' | 'passed' | 'failed' | 'waived';
    gates: Array<{
      id: string;
      metric: string;
      status: 'unchecked' | 'passed' | 'failed' | 'waived';
      reviewSource?: string;
      waiverReason?: string;
      operatorId?: string | null;
      updatedAt: number;
    }>;
  };
}

export default function TakeDeliveryTab({ project }: TakeDeliveryTabProps) {
  const projectName = project.name;
  const episodes = project.scripts?.slice(0, 4) ?? [];

  const [takes, setTakes] = useState<TakeView[]>([]);
  const [activeTakeId, setActiveTakeId] = useState<string | undefined>(undefined);
  const [activeDetail, setActiveDetail] = useState<TakeApiResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchTakes = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectName)}/takes`);
      if (!response.ok) throw new Error(`takes API ${response.status}`);
      const data = (await response.json()) as { takes?: TakeView[] };
      const list = Array.isArray(data.takes) ? data.takes : [];
      setTakes(list);
      if (list.length > 0 && !activeTakeId) {
        setActiveTakeId(list[0].id);
      }
      setLoadError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setLoadError(message);
    }
  }, [projectName, activeTakeId]);

  const fetchActiveDetail = useCallback(
    async (takeId: string) => {
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectName)}/takes/${encodeURIComponent(takeId)}`,
        );
        if (!response.ok) {
          setActiveDetail(null);
          return;
        }
        const data = (await response.json()) as TakeApiResponse;
        setActiveDetail(data);
      } catch {
        setActiveDetail(null);
      }
    },
    [projectName],
  );

  useEffect(() => {
    void fetchTakes();
  }, [fetchTakes]);

  useEffect(() => {
    if (activeTakeId) {
      void fetchActiveDetail(activeTakeId);
    }
  }, [activeTakeId, fetchActiveDetail]);

  const lockedCount = useMemo(() => takes.filter((t) => t.locked).length, [takes]);
  const readyCount = useMemo(
    () => takes.filter((t) => t.qualityStatus === 'passed' || t.qualityStatus === 'waived').length,
    [takes],
  );

  const handleTakeAction = useCallback(
    async (takeId: string, action: string, body: Record<string, unknown> = {}) => {
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectName)}/takes/${encodeURIComponent(takeId)}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action, ...body }),
          },
        );
        if (!response.ok) {
          const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
          setLoadError(errorBody.error || `take ${action} 失败 (${response.status})`);
          return false;
        }
        await fetchTakes();
        if (activeTakeId) await fetchActiveDetail(activeTakeId);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        setLoadError(message);
        return false;
      }
    },
    [projectName, fetchTakes, fetchActiveDetail, activeTakeId],
  );

  const gates: QualityGateView[] = useMemo(() => {
    if (!activeDetail) return [];
    return activeDetail.quality.gates.map((gate) => ({
      id: gate.id,
      metric: gate.metric,
      status: gate.status,
      denominator: 0,
      passedCount: 0,
      failedItems: [],
      reviewSource: gate.reviewSource,
      waiverReason: gate.waiverReason,
      operatorId: gate.operatorId,
    }));
  }, [activeDetail]);

  return (
    <div className="grid min-h-[620px] grid-cols-1 gap-6 xl:grid-cols-[minmax(360px,460px)_1fr]">
      <TakeReviewPanel
        takes={takes}
        activeTakeId={activeTakeId}
        onSelectTake={setActiveTakeId}
        onAccept={(takeId) => void handleTakeAction(takeId, 'accept')}
        onRetry={(takeId, issueType, reason) =>
          void handleTakeAction(takeId, 'retry', { issue_type: issueType, reason })
        }
        onMarkIssue={(takeId, issueType, reason) =>
          void handleTakeAction(takeId, 'mark_issue', { issue_type: issueType, reason })
        }
        onLock={(takeId) => void handleTakeAction(takeId, 'lock')}
      />

      <section className="space-y-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="min-h-[104px]">
            <div className="flex items-start justify-between gap-3">
              <Scissors className="h-5 w-5 text-[var(--tf-accent-primary)]" />
              <StatusPill variant="neutral">{lockedCount > 0 ? 'in_progress' : 'incomplete'}</StatusPill>
            </div>
            <p className="mt-5 text-sm font-semibold text-[var(--tf-text-primary)]">RoughCut</p>
            <p className="mt-1 text-xs text-[var(--tf-text-muted)]">{lockedCount} locked take</p>
          </Card>
          <Card className="min-h-[104px]">
            <div className="flex items-start justify-between gap-3">
              <CheckCircle2 className="h-5 w-5 text-[var(--tf-success)]" />
              <StatusPill variant={readyCount > 0 ? 'success' : 'neutral'}>
                {readyCount > 0 ? 'ready' : 'unchecked'}
              </StatusPill>
            </div>
            <p className="mt-5 text-sm font-semibold text-[var(--tf-text-primary)]">QualityGate</p>
            <p className="mt-1 text-xs text-[var(--tf-text-muted)]">
              {readyCount} / {takes.length} 通过
            </p>
          </Card>
          <Card className="min-h-[104px]">
            <div className="flex items-start justify-between gap-3">
              <PackageCheck className="h-5 w-5 text-[var(--tf-info)]" />
              <StatusPill variant="neutral">preparing</StatusPill>
            </div>
            <p className="mt-5 text-sm font-semibold text-[var(--tf-text-primary)]">EpisodeDeliveryPackage</p>
            <p className="mt-1 text-xs text-[var(--tf-text-muted)]">{episodes.length} files</p>
          </Card>
        </div>

        {/* Phase 10 真实 QualityGate 面板 */}
        <QualityGatePanel
          gates={gates}
          qualityStatus={activeDetail?.quality.qualityStatus ?? 'unchecked'}
          takeId={activeTakeId}
        />

        {/* Fallback 静态 qualityRows（数据未加载或 take 为空时展示） */}
        {!activeDetail && takes.length === 0 ? (
          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-[var(--tf-border-subtle)] px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--tf-text-primary)]">质量门禁（占位）</h3>
                <p className="mt-1 text-xs text-[var(--tf-text-muted)]">Take 锁定前检查</p>
              </div>
            </div>
            <div className="divide-y divide-[var(--tf-border-subtle)]">
              {qualityRows.map((row) => (
                <div key={row.label} className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-4">
                  <p className="truncate text-sm font-medium text-[var(--tf-text-primary)]">{row.label}</p>
                  <StatusPill variant={row.variant}>{row.status}</StatusPill>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {loadError ? (
          <div className="rounded-[var(--tf-radius-sm)] border border-amber-300 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-800">{loadError}</p>
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={lockedCount === 0}>
            预览粗剪
          </Button>
          <Button disabled={lockedCount === 0}>导出单集交付包</Button>
        </div>
      </section>
    </div>
  );
}
