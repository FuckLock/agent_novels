'use client';

// Phase 11 RoughCutTimeline —— 粗剪时间线 + 缺口 chip + 质量门禁状态展示
//
// 约束：
//   - 缺口（gap / missing）必须用 amber 警示色（criteria G2 — var(--tf-warning) / var(--tf-warning-soft)）
//   - 时间线按 Track order 顺序渲染（criteria G3）
//   - 缺口 chip / 缺口列表必须可见（criteria G4）
//
// MVP 范围（spec L486 — 完整可视化由 Phase 12+ 接入）：
//   - 基本时长展示 + Track 名 + 缺口 chip（amber）
//   - 完整时间线轨道 / 拖拽 / 缩放等高级 UX 留 Phase 12+

import StatusPill from '@/app/components/StatusPill';

export interface RoughCutTimelineTrack {
  trackId: string;
  orderIndex: number;
  objective: string;
  durationSeconds: number;
  takeId: string | null;
  artifactId: string | null;
  qualityStatus: string;
  lockedAt: number | null;
}

export interface RoughCutTimelineMissing {
  trackId: string;
  orderIndex: number;
  objective: string;
  reason: string;
}

export interface RoughCutTimelineProps {
  status: 'partial' | 'complete' | 'incomplete' | 'has_gaps' | 'sealed' | string;
  version: number;
  episodeIndex: number;
  totalDurationSeconds: number;
  tracks: RoughCutTimelineTrack[];
  missingTracks: RoughCutTimelineMissing[];
  lockedTakeCount?: number;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = (seconds - minutes * 60).toFixed(0);
  return `${minutes}m ${rest}s`;
}

function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'complete' || status === 'sealed') return 'success';
  if (status === 'partial' || status === 'has_gaps' || status === 'incomplete') return 'warning';
  if (status === 'failed') return 'danger';
  return 'neutral';
}

/**
 * RoughCutTimeline 组件
 *
 * 渲染按 Track order 排序的时间线 + 缺口 chip
 */
export default function RoughCutTimeline({
  status,
  version,
  episodeIndex,
  totalDurationSeconds,
  tracks,
  missingTracks,
  lockedTakeCount,
}: RoughCutTimelineProps) {
  const orderedTracks = [...tracks].sort((a, b) => a.orderIndex - b.orderIndex);
  const hasMissing = missingTracks.length > 0;
  const missingByTrackId = new Map(missingTracks.map((m) => [m.trackId, m]));

  return (
    <section className="rounded-[var(--tf-radius-md)] border border-[var(--tf-border-subtle)] bg-[var(--tf-bg-panel)] p-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--tf-text-primary)]">
            粗剪时间线 · 第 {episodeIndex} 集 · v{version}
          </h3>
          <p className="mt-1 text-xs text-[var(--tf-text-muted)]">
            时长 {formatDuration(totalDurationSeconds)} · Track {orderedTracks.length} · 锁定 {lockedTakeCount ?? 0}
            {hasMissing ? ` · 缺口 ${missingTracks.length}` : ''}
          </p>
        </div>
        <StatusPill variant={statusVariant(status)}>{status}</StatusPill>
      </header>

      {/* 时间线 — 按 Track order_index 顺序渲染 */}
      <ol className="space-y-2">
        {orderedTracks.map((track) => {
          const missing = missingByTrackId.get(track.trackId);
          const isMissing = !!missing;
          return (
            <li
              key={track.trackId}
              className="flex items-center gap-3 rounded-[var(--tf-radius-sm)] border border-[var(--tf-border-subtle)] p-3"
              style={isMissing ? { background: 'var(--tf-warning-soft)' } : undefined}
            >
              <span
                className="inline-flex h-6 w-8 items-center justify-center rounded text-xs font-medium"
                style={{
                  background: isMissing ? 'var(--tf-warning)' : 'var(--tf-accent-primary-soft)',
                  color: isMissing ? '#fff' : 'var(--tf-accent-primary)',
                }}
              >
                {track.orderIndex + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--tf-text-primary)]">
                  {track.objective || '（未命名 Track）'}
                </p>
                <p className="mt-1 text-xs text-[var(--tf-text-muted)]">
                  时长 {formatDuration(track.durationSeconds)}
                  {track.takeId ? ` · take ${track.takeId.slice(0, 8)}` : ''}
                  {track.qualityStatus ? ` · ${track.qualityStatus}` : ''}
                </p>
              </div>
              {/* 缺口 chip — amber 警示色（criteria G2 + G4） */}
              {isMissing ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium"
                  style={{
                    background: 'var(--tf-warning-soft)',
                    color: 'var(--tf-warning)',
                    border: '1px solid var(--tf-warning)',
                  }}
                  title={`缺口原因：${missing.reason}`}
                >
                  缺口 missing
                </span>
              ) : (
                <StatusPill variant={statusVariant(track.qualityStatus || 'unchecked')}>
                  {track.qualityStatus || 'unchecked'}
                </StatusPill>
              )}
            </li>
          );
        })}
      </ol>

      {/* 缺口汇总 — amber 色 (criteria G2 + G4) */}
      {hasMissing ? (
        <div
          className="mt-3 rounded-[var(--tf-radius-sm)] border px-3 py-2"
          style={{
            background: 'var(--tf-warning-soft)',
            borderColor: 'var(--tf-warning)',
          }}
        >
          <p className="text-xs font-medium" style={{ color: 'var(--tf-warning)' }}>
            存在 {missingTracks.length} 个缺口 Track（未锁定 take）
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs text-[var(--tf-text-secondary)]">
            {missingTracks.slice(0, 5).map((m) => (
              <li key={m.trackId}>
                #{m.orderIndex + 1} · {m.objective || '（未命名）'} · 原因 {m.reason}
              </li>
            ))}
            {missingTracks.length > 5 ? <li>… 共 {missingTracks.length} 项</li> : null}
          </ul>
        </div>
      ) : null}

      {orderedTracks.length === 0 ? (
        <p className="mt-3 text-xs text-[var(--tf-text-muted)]">暂无 Track — 请先生成 TrackPlan。</p>
      ) : null}
    </section>
  );
}
