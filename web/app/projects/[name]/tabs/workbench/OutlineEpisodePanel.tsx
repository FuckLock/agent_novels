'use client';

import { useState } from 'react';
import ReviewBadge from '@/app/components/ReviewBadge';
import ReviewDrawer from '@/app/components/ReviewDrawer';
import { ReviewResult } from '@/app/lib/novels';
import { OutlineEpisode, getItemName } from '../../types';

interface OutlineEpisodePanelProps {
  episode: OutlineEpisode;
  review: ReviewResult | null;
  onReview?: () => void;
}

export default function OutlineEpisodePanel({
  episode: ep,
  review,
  onReview,
}: OutlineEpisodePanelProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="relative overflow-hidden flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2.5 py-1 rounded-lg">第{ep.episodeIndex}集</span>
          <h2 className="text-base font-semibold text-gray-900">{ep.title}</h2>
          <ReviewBadge review={review} onClick={() => setDrawerOpen(true)} />
        </div>
      </div>

      {/* 大纲内容 */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {/* 章节范围 */}
        {ep.chapterRange && ep.chapterRange.length > 0 && (
          <Row label="章节范围">
            {ep.chapterRange.map((ch, i) => (
              <Tag key={i} color="purple">第{ch}章</Tag>
            ))}
          </Row>
        )}
        {/* 场景 */}
        {ep.scenes && ep.scenes.length > 0 && (
          <Row label="场景">
            {ep.scenes.map((s, i) => <Tag key={i} color="purple">{getItemName(s)}</Tag>)}
          </Row>
        )}
        {/* 角色 */}
        {ep.characters && ep.characters.length > 0 && (
          <Row label="角色">
            {ep.characters.map((c, i) => <Tag key={i} color="blue">{getItemName(c)}</Tag>)}
          </Row>
        )}
        {/* 道具 */}
        {ep.props && ep.props.length > 0 && (
          <Row label="道具">
            {ep.props.map((p, i) => <Tag key={i} color="green">{getItemName(p)}</Tag>)}
          </Row>
        )}
        {/* 核心冲突 */}
        {ep.coreConflict && (
          <Highlight label="核心冲突" color="orange">{ep.coreConflict}</Highlight>
        )}
        {/* 开篇钩子 */}
        {ep.openingHook && (
          <Highlight label="黄金3秒" color="yellow">{ep.openingHook}</Highlight>
        )}
        {/* 剧情主干 */}
        {ep.outline && (
          <Row label="剧情主干">
            <span className="text-xs text-gray-600">{ep.outline}</span>
          </Row>
        )}
        {/* 关键事件 */}
        {ep.keyEvents && ep.keyEvents.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs text-gray-400">关键节点</span>
            {ep.keyEvents.map((k, i) => {
              const labels = ['起', '承', '转', '合'];
              const colors = ['red', 'yellow', 'blue', 'green'];
              return (
                <Highlight key={i} label={labels[i] || ''} color={colors[i] || 'gray'}>
                  {k}
                </Highlight>
              );
            })}
          </div>
        )}
        {/* 情绪曲线 */}
        {ep.emotionalCurve && <Row label="情绪曲线"><span className="text-xs text-gray-600">{ep.emotionalCurve}</span></Row>}
        {/* 视觉重点 */}
        {ep.visualHighlights && ep.visualHighlights.length > 0 && (
          <Row label="视觉重点">
            {ep.visualHighlights.map((v, i) => <Tag key={i} color="purple">{v}</Tag>)}
          </Row>
        )}
        {/* 结尾悬念 */}
        {ep.endingHook && <Row label="结尾悬念"><span className="text-xs text-gray-600">{ep.endingHook}</span></Row>}
        {/* 金句 */}
        {ep.classicQuotes && ep.classicQuotes.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs text-gray-400">金句</span>
            {ep.classicQuotes.map((q, i) => (
              <div key={i} className="bg-purple-50 px-2 py-1 rounded">
                <span className="text-xs text-purple-700 font-medium">&ldquo;{q}&rdquo;</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 审核抽屉 */}
      {review && (
        <ReviewDrawer
          open={drawerOpen}
          review={review}
          onClose={() => setDrawerOpen(false)}
          onReview={onReview ?? (() => {})}
        />
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-gray-400 w-14 shrink-0 pt-0.5">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    purple: 'bg-purple-100 text-purple-700',
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 text-xs rounded ${colors[color] || 'bg-gray-100 text-gray-700'}`}>
      {children}
    </span>
  );
}

function Highlight({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  const colors: Record<string, string> = {
    orange: 'bg-orange-50 text-orange-700',
    yellow: 'bg-yellow-50 text-yellow-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    gray: 'bg-gray-50 text-gray-700',
  };
  const badgeColors: Record<string, string> = {
    orange: 'bg-orange-200 text-orange-800',
    yellow: 'bg-yellow-200 text-yellow-800',
    red: 'bg-red-200 text-red-800',
    blue: 'bg-blue-200 text-blue-800',
    green: 'bg-green-200 text-green-800',
    gray: 'bg-gray-200 text-gray-800',
  };
  return (
    <div className={`${colors[color] || colors.gray} px-2 py-1.5 rounded flex items-start gap-2`}>
      {label && <span className={`inline-block px-1.5 py-0.5 text-xs rounded font-bold shrink-0 ${badgeColors[color] || badgeColors.gray}`}>{label}</span>}
      <span className="text-xs font-medium">{children}</span>
    </div>
  );
}
