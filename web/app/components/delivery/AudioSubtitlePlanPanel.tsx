'use client';

// Phase 11 AudioSubtitlePlanPanel —— 5 维音频字幕计划面板
//
// 5 维（criteria G6 + spec L132 + L338 + L603）：
//   - 旁白 narration
//   - 台词 dialogue
//   - 嘴型 lip_state
//   - 音效 sfx
//   - 字幕时间段 subtitle_timing
//
// MVP 范围（spec L648 — AI 增强由 Phase 11+ 接入）：
//   - 展示 5 维占位文案 + 时间段
//   - 完整 AI 自动生成 / 编辑工作流留 Phase 12+

import StatusPill from '@/app/components/StatusPill';

export interface AudioSubtitleSegmentView {
  segmentId: string;
  trackId: string;
  trackSegmentId: string;
  orderIndex: number;
  startTimeMs: number;
  endTimeMs: number;
  narration: string;
  dialogue: string;
  lipState: string;
  sfx: string;
  subtitleTiming: {
    startTimeMs: number;
    endTimeMs: number;
    text: string;
  };
}

export interface AudioSubtitlePlanPanelProps {
  roughCutId: string;
  episodeIndex: number;
  version: number;
  dimensions: readonly string[];
  segments: AudioSubtitleSegmentView[];
  mvpNote?: string;
}

function formatMs(ms: number) {
  if (!Number.isFinite(ms)) return '0ms';
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

function timeRangeLabel(startMs: number, endMs: number) {
  return `${formatMs(startMs)} – ${formatMs(endMs)}`;
}

/**
 * 5 维标签元数据
 */
const DIMENSION_LABELS: Record<string, { zh: string; key: string }> = {
  narration: { zh: '旁白', key: 'narration' },
  dialogue: { zh: '台词', key: 'dialogue' },
  lip_state: { zh: '嘴型', key: 'lip_state' },
  sfx: { zh: '音效', key: 'sfx' },
  subtitle_timing: { zh: '字幕时间段', key: 'subtitle_timing' },
};

/**
 * AudioSubtitlePlanPanel 组件
 *
 * 渲染 5 维（旁白 / 台词 / 嘴型 / 音效 / 字幕）+ 每个 segment 的时间段
 */
export default function AudioSubtitlePlanPanel({
  roughCutId,
  episodeIndex,
  version,
  dimensions,
  segments,
  mvpNote,
}: AudioSubtitlePlanPanelProps) {
  const orderedSegments = [...segments].sort((a, b) => a.startTimeMs - b.startTimeMs);
  const dimensionCount = dimensions.length;

  return (
    <section className="rounded-[var(--tf-radius-md)] border border-[var(--tf-border-subtle)] bg-[var(--tf-bg-panel)] p-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--tf-text-primary)]">
            音频字幕计划 · 第 {episodeIndex} 集 · v{version}
          </h3>
          <p className="mt-1 text-xs text-[var(--tf-text-muted)]">
            RoughCut {roughCutId.slice(0, 8)} · 5 维 ({dimensionCount}/5) · 段 {orderedSegments.length}
          </p>
        </div>
        <StatusPill variant={dimensionCount === 5 ? 'success' : 'warning'}>
          {dimensionCount}/5 维
        </StatusPill>
      </header>

      {/* 5 维标签 - 顶部 */}
      <ul className="mb-3 flex flex-wrap gap-2">
        {(['narration', 'dialogue', 'lip_state', 'sfx', 'subtitle_timing'] as const).map((dim) => {
          const meta = DIMENSION_LABELS[dim];
          const covered = dimensions.includes(dim);
          return (
            <li
              key={dim}
              className="rounded-full border px-3 py-1 text-xs"
              style={{
                borderColor: covered ? 'var(--tf-accent-primary)' : 'var(--tf-border-subtle)',
                background: covered ? 'var(--tf-accent-primary-soft)' : 'var(--tf-bg-raised)',
                color: covered ? 'var(--tf-accent-primary)' : 'var(--tf-text-muted)',
              }}
            >
              {meta.zh}{' '}
              <span className="text-[var(--tf-text-muted)]">{`(${meta.key})`}</span>
            </li>
          );
        })}
      </ul>

      {/* 段列表 - 每段展示 5 维内容 */}
      <ol className="space-y-2">
        {orderedSegments.map((seg) => (
          <li
            key={seg.segmentId}
            className="rounded-[var(--tf-radius-sm)] border border-[var(--tf-border-subtle)] p-3"
          >
            <header className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-[var(--tf-text-secondary)]">
                #{seg.orderIndex + 1} · {timeRangeLabel(seg.startTimeMs, seg.endTimeMs)}
              </p>
              <span className="text-xs text-[var(--tf-text-muted)]">
                track {seg.trackId.slice(0, 6)} / segment {seg.trackSegmentId.slice(0, 6)}
              </span>
            </header>

            {/* 5 维内容 */}
            <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              {/* 1. 旁白 narration */}
              <div>
                <dt className="font-medium text-[var(--tf-text-secondary)]">旁白 narration</dt>
                <dd className="mt-0.5 text-[var(--tf-text-primary)]">{seg.narration}</dd>
              </div>
              {/* 2. 台词 dialogue */}
              <div>
                <dt className="font-medium text-[var(--tf-text-secondary)]">台词 dialogue</dt>
                <dd className="mt-0.5 text-[var(--tf-text-primary)]">{seg.dialogue}</dd>
              </div>
              {/* 3. 嘴型 lip_state */}
              <div>
                <dt className="font-medium text-[var(--tf-text-secondary)]">嘴型 lip_state</dt>
                <dd className="mt-0.5 text-[var(--tf-text-primary)]">{seg.lipState}</dd>
              </div>
              {/* 4. 音效 sfx */}
              <div>
                <dt className="font-medium text-[var(--tf-text-secondary)]">音效 sfx</dt>
                <dd className="mt-0.5 text-[var(--tf-text-primary)]">{seg.sfx}</dd>
              </div>
              {/* 5. 字幕时间段 subtitle_timing */}
              <div className="sm:col-span-2">
                <dt className="font-medium text-[var(--tf-text-secondary)]">字幕时间段 subtitle_timing</dt>
                <dd className="mt-0.5 text-[var(--tf-text-primary)]">
                  {timeRangeLabel(seg.subtitleTiming.startTimeMs, seg.subtitleTiming.endTimeMs)} ·{' '}
                  {seg.subtitleTiming.text}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>

      {orderedSegments.length === 0 ? (
        <p className="text-xs text-[var(--tf-text-muted)]">
          暂无段 — 请先组装 RoughCut 并生成 AudioSubtitlePlan。
        </p>
      ) : null}

      {/* MVP 说明（Phase 11+ AI 增强提示） */}
      {mvpNote ? (
        <p
          className="mt-3 rounded-[var(--tf-radius-sm)] border px-3 py-2 text-xs"
          style={{
            background: 'var(--tf-info-soft)',
            borderColor: 'var(--tf-info)',
            color: 'var(--tf-info)',
          }}
        >
          {mvpNote}
        </p>
      ) : null}
    </section>
  );
}
