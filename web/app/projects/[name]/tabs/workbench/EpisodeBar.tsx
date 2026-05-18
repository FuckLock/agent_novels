'use client';

import { ReviewResult } from '@/app/lib/novels';

interface EpisodeBarProps {
  episodes: number[];
  activeEpisode: number;
  reviews: Record<string, ReviewResult>;
  reviewKeyPrefix: string;
  onSelect: (episode: number) => void;
  onReview: () => void;
  reviewLoading: boolean;
  /** 故事线阶段：不显示集数，显示简化操作栏 */
  isStorylineMode?: boolean;
}

export default function EpisodeBar({
  episodes,
  activeEpisode,
  reviews,
  reviewKeyPrefix,
  onSelect,
  onReview,
  reviewLoading,
  isStorylineMode = false,
}: EpisodeBarProps) {
  if (!isStorylineMode && episodes.length === 0) return null;

  return (
    <div className="bg-[#f0eeff] rounded-xl px-3 py-2 mb-4 flex items-center">
      {isStorylineMode ? (
        /* 故事线简化模式 */
        <span className="text-[11px] text-[#9b8ec4] font-medium shrink-0 mr-2">故事线</span>
      ) : (
        <>
          {/* 左侧集数标签 */}
          <span className="text-[11px] text-[#9b8ec4] font-medium shrink-0 mr-2">
            共{episodes.length}集
          </span>

          {/* Tab 列表 */}
          <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0">
            {episodes.map((ep) => {
              const review = reviews[`${reviewKeyPrefix}-${ep}`];
              const isActive = ep === activeEpisode;

              const style = isActive
                ? 'bg-white shadow-sm text-purple-700 font-bold'
                : 'bg-transparent text-[#7c6caa] hover:bg-purple-200/50';

              return (
                <button
                  key={ep}
                  onClick={() => onSelect(ep)}
                  className={`shrink-0 h-7 min-w-[36px] px-2 rounded-lg text-xs transition-all relative ${style}`}
                  title={`第${ep}集${review ? ` · ${review.totalScore}分` : ''}`}
                >
                  {ep}
                  {review?.status === 'pass' && (
                    <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-purple-600" />
                  )}
                  {review?.status === 'fail' && (
                    <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full border border-orange-500" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* 右侧审核按钮 */}
      <button
        onClick={onReview}
        disabled={reviewLoading}
        className="ml-auto bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-sm shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {reviewLoading ? '审核中...' : '审核'}
      </button>
    </div>
  );
}
