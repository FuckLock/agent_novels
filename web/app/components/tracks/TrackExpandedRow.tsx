'use client';

import { useMemo } from 'react';

/**
 * TrackExpandedRow — Track 展开行（spec L478 / L482）
 *
 * MVP 显示：
 *   - 策略 chip（含中文 UI 名 + 系统决策理由）
 *   - 依赖状态 chip（ready / blocked + 缺失清单）
 *   - 质量状态 chip（draft / locked）
 *
 * TrackSegment 完整编辑面板：标"Phase 9 接入"（spec 边界遵守）
 */

interface MissingItem {
  type: string;
  label: string;
  required: number;
  current: number;
  fixEntry?: string;
}

interface TrackData {
  id: string;
  orderIndex: number;
  objective: string;
  motion: string;
  shot: string;
  durationSeconds: number;
  strategy: string;
  strategyReason: string;
  dependencyStatus: 'ready' | 'blocked' | 'partial';
  dependencyMissing: MissingItem[];
  status: string;
}

interface Props {
  track: TrackData;
  onClose?: () => void;
}

const STRATEGY_LABEL: Record<string, string> = {
  multi_reference_text: '多参考直出',
  start_frame: '仅首帧',
  first_last_frame: '首尾帧',
  multi_keyframe: '多关键帧',
  continue_from_previous: '承接上一段尾帧',
};

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  locked: '已锁定',
  ready: '可提交',
};

export default function TrackExpandedRow({ track, onClose }: Props) {
  const strategyLabel = useMemo(
    () => STRATEGY_LABEL[track.strategy] || track.strategy,
    [track.strategy],
  );
  const isBlocked = track.dependencyStatus === 'blocked';

  return (
    <div className="border-l-2 border-[var(--tf-border-strong)] bg-[var(--tf-bg-raised)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-medium text-[var(--tf-text-primary)]">
          Track #{track.orderIndex + 1} 详情
        </h4>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-[var(--tf-text-muted)] hover:bg-[var(--tf-bg-canvas)]"
          >
            收起
          </button>
        )}
      </div>

      {/* 策略 chip（spec L478 系统使用了策略 X + 理由） */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
          策略：{strategyLabel}
        </span>
        {track.strategyReason && (
          <span className="text-xs text-[var(--tf-text-secondary)]">
            理由：{track.strategyReason}
          </span>
        )}
      </div>

      {/* 依赖状态 chip + 缺失清单（spec L482） */}
      <div className="mb-3">
        <div className="mb-1 flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              isBlocked
                ? 'bg-amber-100 text-amber-800'
                : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            依赖：{isBlocked ? '缺依赖' : '就绪'}
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            质量状态：{STATUS_LABEL[track.status] || track.status}
          </span>
        </div>
        {isBlocked && track.dependencyMissing && track.dependencyMissing.length > 0 && (
          <ul className="ml-2 mt-2 list-disc space-y-0.5 pl-4 text-xs text-amber-700">
            {track.dependencyMissing.map((m, i) => (
              <li key={`${m.type}-${i}`}>
                {m.label}（需 {m.required} / 当前 {m.current}）
                {m.fixEntry && (
                  <a
                    href={m.fixEntry}
                    className="ml-2 text-blue-700 underline hover:text-blue-900"
                  >
                    去修复
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 基础信息 */}
      <dl className="grid grid-cols-2 gap-y-1 text-xs text-[var(--tf-text-secondary)]">
        <dt className="text-[var(--tf-text-muted)]">目标</dt>
        <dd>{track.objective || '—'}</dd>
        <dt className="text-[var(--tf-text-muted)]">运动</dt>
        <dd>{track.motion || '—'}</dd>
        <dt className="text-[var(--tf-text-muted)]">镜头</dt>
        <dd>{track.shot || '—'}</dd>
        <dt className="text-[var(--tf-text-muted)]">时长</dt>
        <dd>{track.durationSeconds.toFixed(1)} 秒</dd>
      </dl>

      {/* TrackSegment 完整编辑面板：标 Phase 9 接入（MVP 占位） */}
      <div className="mt-3 rounded border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-500">
        TrackSegment（时间段细分 0-2s / 2-6s 等）完整编辑面板：
        <strong className="ml-1 text-gray-700">Phase 9 接入</strong>
        （MVP 仅显示策略 + 依赖摘要，spec L271 完整时间段编辑由 Phase 9 落地）
      </div>
    </div>
  );
}
