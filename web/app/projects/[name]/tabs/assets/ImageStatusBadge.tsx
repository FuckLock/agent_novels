'use client';

import { AssetState } from '../../types';

interface ImageStatusBadgeProps {
  state: AssetState;
  error?: string;
}

const STATE_CONFIG: Record<AssetState, { label: string; className: string }> = {
  pending: {
    label: '待生成',
    className: 'bg-gray-100 text-gray-500',
  },
  generating: {
    label: '图片生成中',
    className: 'bg-blue-50 text-blue-600 animate-pulse',
  },
  success: {
    label: '已完成',
    className: 'bg-green-50 text-green-600',
  },
  failed: {
    label: '生成失败',
    className: 'bg-red-50 text-red-600 cursor-help',
  },
};

/** 图片生成状态标签组件 */
export default function ImageStatusBadge({ state, error }: ImageStatusBadgeProps) {
  const config = STATE_CONFIG[state];
  return (
    <span
      className={`text-[11px] px-1.5 py-0.5 rounded ${config.className}`}
      title={state === 'failed' && error ? error : undefined}
    >
      {config.label}
    </span>
  );
}
