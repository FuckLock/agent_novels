'use client';

import { ReviewResult } from '@/app/lib/novels';

interface ReviewBadgeProps {
  review: ReviewResult | null;
  loading?: boolean;
  onClick?: () => void;
}

export default function ReviewBadge({ review, loading, onClick }: ReviewBadgeProps) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-purple-500 select-none">
        <span className="animate-pulse">○</span>
        <span className="animate-pulse">审核中</span>
      </span>
    );
  }

  if (!review) return null;

  const isPass = review.status === 'pass';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70 ${
        isPass ? 'text-[#312e81]' : 'text-[#c2410c]'
      }`}
    >
      <span>{isPass ? '◉' : '◎'}</span>
      <span>{review.totalScore}</span>
    </button>
  );
}
