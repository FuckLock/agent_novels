'use client';

import { ReviewResult } from '@/app/lib/novels';

interface ReviewPanelProps {
  review: ReviewResult | null;
  loading?: boolean;
  onReview: () => void;
  compact?: boolean;
}

function ScoreBadge({ score, status }: { score: number; status: string }) {
  const color = status === 'pass'
    ? 'bg-green-100 text-green-700 border-green-200'
    : 'bg-red-100 text-red-700 border-red-200';

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${color}`}>
      {score}分 {status === 'pass' ? '通过' : '未通过'}
    </span>
  );
}

function DimensionBar({ name, weight, score }: { name: string; weight: number; score: number }) {
  const maxScore = weight;
  const actualScore = Math.round((score / 100) * weight);
  const percentage = Math.min(100, score);

  const barColor = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-gray-600 shrink-0 truncate">{name}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${percentage}%` }} />
      </div>
      <span className="w-10 text-right text-gray-500 shrink-0">{actualScore}/{maxScore}</span>
    </div>
  );
}

export default function ReviewPanel({ review, loading, onReview, compact }: ReviewPanelProps) {
  if (loading) {
    return (
      <div className="border border-purple-200 bg-purple-50 rounded-lg p-4 animate-pulse">
        <div className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4 text-purple-600" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-purple-700">审核中，请稍候...</span>
        </div>
      </div>
    );
  }

  if (!review) {
    return (
      <button
        onClick={onReview}
        className="inline-flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-800 hover:bg-purple-50 px-2.5 py-1.5 rounded-md transition"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        审核
      </button>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <ScoreBadge score={review.totalScore} status={review.status} />
        <button
          onClick={onReview}
          className="text-[10px] text-gray-400 hover:text-purple-600 transition"
          title="重新审核"
        >
          重审
        </button>
      </div>
    );
  }

  return (
    <div className={`border rounded-lg p-4 ${review.status === 'pass' ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}>
      {/* 头部 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800">审核结果</span>
          <ScoreBadge score={review.totalScore} status={review.status} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400">
            {new Date(review.reviewedAt).toLocaleDateString('zh-CN')}
          </span>
          <button
            onClick={onReview}
            className="text-xs text-purple-600 hover:text-purple-800 hover:bg-purple-50 px-2 py-1 rounded transition"
          >
            重新审核
          </button>
        </div>
      </div>

      {/* 维度评分 */}
      <div className="space-y-1.5 mb-3">
        {review.dimensions.map((dim) => (
          <DimensionBar key={dim.name} name={dim.name} weight={dim.weight} score={dim.score} />
        ))}
      </div>

      {/* 总体评价 */}
      {review.summary && (
        <div className="mb-3">
          <h4 className="text-xs font-medium text-gray-600 mb-1">总体评价</h4>
          <p className="text-xs text-gray-700 leading-relaxed">{review.summary}</p>
        </div>
      )}

      {/* 修改建议 */}
      {review.suggestions.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-600 mb-1">修改建议</h4>
          <ul className="space-y-0.5">
            {review.suggestions.map((s, i) => (
              <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                <span className="text-purple-500 mt-0.5 shrink-0">•</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
