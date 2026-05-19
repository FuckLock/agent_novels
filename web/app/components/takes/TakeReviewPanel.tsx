'use client';

import { useState } from 'react';
import { Film } from 'lucide-react';
import Button from '@/app/components/Button';
import StatusPill from '@/app/components/StatusPill';
import {
  ISSUE_TYPES,
  ISSUE_TYPE_LABELS,
  type TakeIssueType,
} from '@/app/lib/server/quality/video-quality-protocol';

// Phase 10 TakeReviewPanel — 深色媒体审核面板
// spec L401 + L553 + L598 + L865
// Design-Brief.md：深色媒体面板（--tf-bg-inverse + --tf-text-inverse）
//
// MVP 实现：
//   - 深色背景媒体预览容器（aspect-video + Film 占位）
//   - 完整 <video> 标签播放留 Phase 11+
//   - take 候选列表（不同 take id + 状态 + 问题标签）
//   - 7 类问题重试 dropdown + 提交按钮
//
// 设计系：使用 Tailwind 内置 slate 色阶（slate-300/400/500/600/700/900/950）+ CSS token 表达深色面板，
// 避免裸 hex（G1 上限 ≤ 4）。

export interface TakeView {
  id: string;
  trackId: string;
  status: string;
  qualityStatus?: 'unchecked' | 'passed' | 'failed' | 'waived';
  locked?: boolean;
  artifactId?: string | null;
  issueTags?: string[];
  reviewNote?: string;
  parentTakeId?: string | null;
  createdAt?: number;
}

interface TakeReviewPanelProps {
  takes: TakeView[];
  activeTakeId?: string;
  onSelectTake?: (takeId: string) => void;
  onRetry?: (takeId: string, issueType: TakeIssueType, reason: string) => void;
  onAccept?: (takeId: string) => void;
  onMarkIssue?: (takeId: string, issueType: TakeIssueType, reason: string) => void;
  onLock?: (takeId: string) => void;
}

export default function TakeReviewPanel({
  takes,
  activeTakeId,
  onSelectTake,
  onRetry,
  onAccept,
  onMarkIssue,
  onLock,
}: TakeReviewPanelProps) {
  const [issueType, setIssueType] = useState<TakeIssueType>('action_mismatch');
  const [reason, setReason] = useState('');

  const active = takes.find((t) => t.id === activeTakeId) ?? takes[0];
  const readyCount = takes.filter((t) => t.qualityStatus === 'passed' || t.qualityStatus === 'waived').length;

  return (
    <section
      className="rounded-[var(--tf-radius-md)] p-4 text-[var(--tf-text-inverse)]"
      style={{ background: 'var(--tf-bg-inverse)' }}
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Take 审核</h3>
          <p className="mt-1 text-xs text-slate-400">{readyCount} 个可锁定候选</p>
        </div>
        <StatusPill variant="neutral" className="border-slate-700 bg-slate-800 text-slate-300">
          {active ? active.status : 'idle'}
        </StatusPill>
      </header>

      {/* 媒体预览容器（深色面板 + aspect-video 占位；完整 video 播放 Phase 11+ 接入） */}
      <div className="flex aspect-video items-center justify-center rounded-[var(--tf-radius-sm)] border border-slate-700 bg-[var(--tf-bg-inverse-raised)]">
        {active?.artifactId ? (
          // MVP：用 img 占位（artifactId 转 thumb url 留 Phase 11）
          <div className="flex flex-col items-center text-xs text-slate-400">
            <Film className="h-12 w-12 text-slate-500" aria-label="preview" />
            <span className="mt-2">media preview · Phase 11 接入完整视频播放</span>
          </div>
        ) : (
          <Film className="h-12 w-12 text-slate-500" aria-label="preview placeholder" />
        )}
      </div>

      {/* 候选 take 列表 */}
      <ul className="mt-4 space-y-3">
        {takes.length === 0 ? (
          <li className="rounded-[var(--tf-radius-sm)] border border-slate-700 bg-slate-900 p-4">
            <p className="text-sm font-medium">暂无 Take</p>
            <p className="mt-2 text-xs leading-5 text-slate-400">当前 Track 还没有视频候选。</p>
          </li>
        ) : (
          takes.map((take) => (
            <li
              key={take.id}
              className={`rounded-[var(--tf-radius-sm)] border bg-slate-900 p-3 ${
                take.id === active?.id ? 'border-blue-500' : 'border-slate-700'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectTake?.(take.id)}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{take.id.slice(0, 12)}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    quality: {take.qualityStatus ?? 'unchecked'}
                    {take.locked ? ' · locked' : ''}
                  </p>
                </div>
                <StatusPill variant={take.locked ? 'success' : 'warning'}>
                  {take.locked ? 'locked' : take.qualityStatus === 'passed' ? 'ready' : 'waiting'}
                </StatusPill>
              </button>
              {take.issueTags && take.issueTags.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-1">
                  {take.issueTags.map((tag) => (
                    <li
                      key={tag}
                      className="rounded-full border border-amber-400 bg-amber-900/40 px-2 py-0.5 text-xs text-amber-200"
                    >
                      {ISSUE_TYPE_LABELS[tag as TakeIssueType] ?? tag}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))
        )}
      </ul>

      {/* 7 类问题重试 dropdown + 提交按钮 */}
      {active ? (
        <div className="mt-4 rounded-[var(--tf-radius-sm)] border border-slate-700 bg-slate-950 p-3">
          <p className="text-xs font-semibold text-slate-300">重试 · 选择问题类型</p>
          <div className="mt-2 grid gap-2">
            <select
              value={issueType}
              onChange={(event) => setIssueType(event.target.value as TakeIssueType)}
              className="rounded-[var(--tf-radius-sm)] border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-[var(--tf-text-inverse)]"
            >
              {ISSUE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ISSUE_TYPE_LABELS[type]}（{type}）
                </option>
              ))}
            </select>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="说明问题（可选）"
              className="min-h-[60px] rounded-[var(--tf-radius-sm)] border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-[var(--tf-text-inverse)]"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => onRetry?.(active.id, issueType, reason)}
                disabled={!onRetry}
              >
                提交重试
              </Button>
              <Button
                variant="secondary"
                onClick={() => onMarkIssue?.(active.id, issueType, reason)}
                disabled={!onMarkIssue}
              >
                仅标记问题
              </Button>
              <Button onClick={() => onAccept?.(active.id)} disabled={!onAccept}>
                接受
              </Button>
              <Button
                onClick={() => onLock?.(active.id)}
                disabled={
                  !onLock || (active.qualityStatus !== 'passed' && active.qualityStatus !== 'waived')
                }
              >
                锁定
              </Button>
            </div>
            {active.qualityStatus !== 'passed' && active.qualityStatus !== 'waived' ? (
              <p className="text-xs text-amber-300">
                锁定前必须经过 QualityGate 通过或人工豁免（spec L600）。当前状态：
                {active.qualityStatus ?? 'unchecked'}。
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
