'use client';

import { ReviewResult } from '@/app/lib/novels';

interface ReviewDrawerProps {
  open: boolean;
  review: ReviewResult;
  onClose: () => void;
  onReview: () => void;
}

function DimensionBar({ name, weight, score }: { name: string; weight: number; score: number }) {
  const actualScore = Math.round((score / 100) * weight);
  const percentage = Math.min(100, score);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-600 truncate">{name}</span>
        <span className="text-gray-400 shrink-0 ml-2">{actualScore}/{weight}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#ede9fe' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${percentage}%`, backgroundColor: '#7c3aed' }}
        />
      </div>
    </div>
  );
}

export default function ReviewDrawer({ open, review, onClose, onReview }: ReviewDrawerProps) {
  const isPass = review.status === 'pass';
  const dateStr = new Date(review.reviewedAt).toLocaleDateString('zh-CN');

  return (
    <div
      className={`absolute right-0 top-0 bottom-0 w-72 bg-[#fafafa] border-l border-gray-200 z-10 flex flex-col transition-transform duration-300 ease-out ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-medium text-gray-800">审核报告</span>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition text-base leading-none"
          aria-label="关闭"
        >
          ✕
        </button>
      </div>

      {/* 可滚动内容区 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* 大号分数 */}
        <div>
          <div className="text-4xl font-light font-mono text-gray-900 leading-none">
            {review.totalScore}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            <span className={isPass ? 'text-[#312e81]' : 'text-[#c2410c]'}>
              {isPass ? '通过' : '未通过'}
            </span>
            <span className="mx-1">·</span>
            <span>{dateStr}</span>
          </div>
        </div>

        {/* 维度进度条 */}
        {review.dimensions.length > 0 && (
          <div className="space-y-3">
            {review.dimensions.map((dim) => (
              <DimensionBar
                key={dim.name}
                name={dim.name}
                weight={dim.weight}
                score={dim.score}
              />
            ))}
          </div>
        )}

        {/* 总体评价 */}
        {review.summary && (
          <div>
            <h4 className="text-xs font-medium text-gray-500 mb-1">总体评价</h4>
            <p className="text-xs text-gray-700 leading-relaxed">{review.summary}</p>
          </div>
        )}

        {/* 修改建议 */}
        {review.suggestions.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-gray-500 mb-1">修改建议</h4>
            <ul className="space-y-1">
              {review.suggestions.map((s, i) => (
                <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                  <span className="shrink-0 mt-0.5">·</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 底部按钮 */}
      <div className="px-4 py-3 border-t border-gray-100">
        <button
          type="button"
          onClick={onReview}
          className="w-full text-sm text-purple-700 hover:text-purple-900 hover:bg-purple-50 py-2 rounded-lg transition"
        >
          重新审核
        </button>
      </div>
    </div>
  );
}
