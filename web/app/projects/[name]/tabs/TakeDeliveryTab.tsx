import { CheckCircle2, Film, PackageCheck, Scissors, TriangleAlert } from 'lucide-react';
import Card from '@/app/components/Card';
import Button from '@/app/components/Button';
import StatusPill from '@/app/components/StatusPill';
import type { ProjectDetail } from '../types';

interface TakeDeliveryTabProps {
  project: ProjectDetail;
}

const qualityRows = [
  { label: '角色一致性', status: 'unchecked', variant: 'neutral' as const },
  { label: '动作可读性', status: 'unchecked', variant: 'neutral' as const },
  { label: '构图与时长', status: 'unchecked', variant: 'neutral' as const },
];

export default function TakeDeliveryTab({ project }: TakeDeliveryTabProps) {
  const episodes = project.scripts?.slice(0, 4) ?? [];
  const readyCount = 0;

  return (
    <div className="grid min-h-[620px] grid-cols-1 gap-6 xl:grid-cols-[minmax(360px,460px)_1fr]">
      <section className="rounded-[var(--tf-radius-md)] bg-[var(--tf-bg-inverse)] p-4 text-[var(--tf-text-inverse)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Take 审核</h3>
            <p className="mt-1 text-xs text-[var(--tf-text-muted)]">{readyCount} 个可锁定候选</p>
          </div>
          <StatusPill variant="neutral" className="border-[#334155] bg-[#1f2937] text-[#cbd5e1]">
            review
          </StatusPill>
        </div>

        <div className="flex aspect-video items-center justify-center rounded-[var(--tf-radius-sm)] border border-[#334155] bg-[var(--tf-bg-inverse-raised)]">
          <Film className="h-12 w-12 text-[#64748b]" />
        </div>

        <div className="mt-4 space-y-3">
          {episodes.length === 0 ? (
            <div className="rounded-[var(--tf-radius-sm)] border border-[#334155] bg-[#111827] p-4">
              <p className="text-sm font-medium">暂无 Take</p>
              <p className="mt-2 text-xs leading-5 text-[#94a3b8]">当前项目还没有分集视频候选。</p>
            </div>
          ) : (
            episodes.map((episode) => (
              <div key={episode.episode} className="rounded-[var(--tf-radius-sm)] border border-[#334155] bg-[#111827] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold">EP{episode.episode.toString().padStart(2, '0')}</p>
                  <StatusPill variant="warning">waiting</StatusPill>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#94a3b8]">
                  {episode.name || '分集剧本已就绪，视频候选尚未生成。'}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="space-y-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="min-h-[104px]">
            <div className="flex items-start justify-between gap-3">
              <Scissors className="h-5 w-5 text-[var(--tf-accent-primary)]" />
              <StatusPill variant="neutral">incomplete</StatusPill>
            </div>
            <p className="mt-5 text-sm font-semibold text-[var(--tf-text-primary)]">RoughCut</p>
            <p className="mt-1 text-xs text-[var(--tf-text-muted)]">0 locked take</p>
          </Card>
          <Card className="min-h-[104px]">
            <div className="flex items-start justify-between gap-3">
              <CheckCircle2 className="h-5 w-5 text-[var(--tf-success)]" />
              <StatusPill variant="neutral">unchecked</StatusPill>
            </div>
            <p className="mt-5 text-sm font-semibold text-[var(--tf-text-primary)]">QualityGate</p>
            <p className="mt-1 text-xs text-[var(--tf-text-muted)]">{qualityRows.length} 项检查</p>
          </Card>
          <Card className="min-h-[104px]">
            <div className="flex items-start justify-between gap-3">
              <PackageCheck className="h-5 w-5 text-[var(--tf-info)]" />
              <StatusPill variant="neutral">preparing</StatusPill>
            </div>
            <p className="mt-5 text-sm font-semibold text-[var(--tf-text-primary)]">EpisodeDeliveryPackage</p>
            <p className="mt-1 text-xs text-[var(--tf-text-muted)]">0 files</p>
          </Card>
        </div>

        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-[var(--tf-border-subtle)] px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--tf-text-primary)]">质量门禁</h3>
              <p className="mt-1 text-xs text-[var(--tf-text-muted)]">Take 锁定前检查</p>
            </div>
            <TriangleAlert className="h-4 w-4 text-[var(--tf-warning)]" />
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

        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled>
            预览粗剪
          </Button>
          <Button disabled>
            导出单集交付包
          </Button>
        </div>
      </section>
    </div>
  );
}
