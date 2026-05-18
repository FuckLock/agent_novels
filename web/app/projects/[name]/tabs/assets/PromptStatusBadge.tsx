'use client';

import { PromptState } from '../../types';

interface PromptStatusBadgeProps {
  hasPrompt: boolean;
  promptState?: PromptState;
}

/** 提示词状态标签组件 */
export default function PromptStatusBadge({ hasPrompt, promptState }: PromptStatusBadgeProps) {
  // 生成中状态优先判断
  if (promptState === 'generating') {
    return (
      <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200 animate-pulse">
        提示词生成中
      </span>
    );
  }

  if (hasPrompt) {
    return (
      <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 border border-green-200">
        已生成提示词
      </span>
    );
  }

  return (
    <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-200">
      未生成提示词
    </span>
  );
}
