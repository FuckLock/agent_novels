'use client';

import StatusPill from '@/app/components/StatusPill';
import {
  VIDEO_QUALITY_METRICS,
  VIDEO_QUALITY_METRIC_LABELS,
  type VideoQualityMetric,
} from '@/app/lib/server/quality/video-quality-protocol';

// Phase 10 QualityGatePanel — 6 维度可见 + 分母 + 失败项 + 豁免说明
// spec L86 + L88 + L102 + L490
//
// 设计来源：Design-Brief.md（StatusPill + amber 警示）+ Phase 1 TakeDeliveryTab 模式

export interface QualityGateView {
  id: string;
  metric: VideoQualityMetric | string;
  status: 'unchecked' | 'passed' | 'failed' | 'waived';
  denominator: number;
  passedCount: number;
  failedItems: Array<{ targetId?: string; issueType?: string; note?: string }>;
  confidence?: number;
  samplingRule?: string;
  reviewSource?: string;
  waiverReason?: string;
  operatorId?: string | null;
}

interface QualityGatePanelProps {
  gates: QualityGateView[];
  qualityStatus?: 'unchecked' | 'passed' | 'failed' | 'waived';
  takeId?: string;
}

function statusVariant(status: QualityGateView['status']): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'passed') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'waived') return 'warning';
  return 'neutral';
}

function MetricLabel({ metric }: { metric: VideoQualityMetric | string }) {
  if ((VIDEO_QUALITY_METRICS as readonly string[]).includes(metric)) {
    return <>{VIDEO_QUALITY_METRIC_LABELS[metric as VideoQualityMetric]}</>;
  }
  return <>{metric}</>;
}

export default function QualityGatePanel({ gates, qualityStatus, takeId }: QualityGatePanelProps) {
  // 按 6 维度索引现有结果；缺失维度显示 unchecked
  const indexed = new Map<string, QualityGateView>();
  for (const gate of gates) {
    if (!indexed.has(gate.metric)) indexed.set(gate.metric, gate);
  }
  const rows: QualityGateView[] = VIDEO_QUALITY_METRICS.map(
    (metric) =>
      indexed.get(metric) ?? {
        id: `placeholder-${metric}`,
        metric,
        status: 'unchecked' as const,
        denominator: 0,
        passedCount: 0,
        failedItems: [],
      },
  );

  const failedCount = rows.filter((row) => row.status === 'failed').length;
  const waivedCount = rows.filter((row) => row.status === 'waived').length;
  const passedCount = rows.filter((row) => row.status === 'passed').length;

  return (
    <section className="rounded-[var(--tf-radius-md)] border border-[var(--tf-border-subtle)] bg-[var(--tf-bg-elevated)] p-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--tf-text-primary)]">质量门禁</h3>
          <p className="mt-1 text-xs text-[var(--tf-text-muted)]">
            {takeId ? `Take ${takeId.slice(0, 8)}` : '—'} · 6 维 · 通过 {passedCount} / 失败 {failedCount} / 豁免{' '}
            {waivedCount}
          </p>
        </div>
        <StatusPill variant={statusVariant(qualityStatus ?? 'unchecked')}>
          {qualityStatus ?? 'unchecked'}
        </StatusPill>
      </header>

      <ul className="divide-y divide-[var(--tf-border-subtle)]">
        {rows.map((row) => {
          const denominator = row.denominator || 0;
          const passed = row.passedCount || 0;
          const rate = denominator === 0 ? 0 : Math.round((passed / denominator) * 100);
          const failedLen = row.failedItems?.length ?? 0;
          return (
            <li key={row.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--tf-text-primary)]">
                    <MetricLabel metric={row.metric} />
                  </p>
                  <p className="mt-1 text-xs text-[var(--tf-text-muted)]">
                    分母 {denominator} · 通过 {passed} · 通过率 {rate}%
                    {failedLen > 0 ? ` · 失败项 ${failedLen}` : ''}
                  </p>
                  {row.status === 'waived' && row.waiverReason ? (
                    <p className="mt-1 text-xs text-amber-600">
                      豁免说明：{row.waiverReason}
                      {row.operatorId ? ` (by ${row.operatorId})` : ''}
                    </p>
                  ) : null}
                  {row.status === 'failed' && failedLen > 0 ? (
                    <p className="mt-1 text-xs text-red-600">
                      失败原因：{row.failedItems.slice(0, 2).map((item) => item.note || item.issueType || '未知').join('，')}
                    </p>
                  ) : null}
                </div>
                <StatusPill variant={statusVariant(row.status)} className="shrink-0">
                  {row.status}
                </StatusPill>
              </div>
            </li>
          );
        })}
      </ul>

      {failedCount > 0 ? (
        <div className="mt-3 rounded-[var(--tf-radius-sm)] border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-xs text-amber-800">
            存在 {failedCount} 项失败维度。Take 锁定前需通过 QualityGate 或人工豁免（spec L600）。
          </p>
        </div>
      ) : null}
    </section>
  );
}
