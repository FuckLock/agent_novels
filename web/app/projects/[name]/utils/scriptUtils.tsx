/**
 * 剧本页面共享工具函数
 * 被 ScriptsTab.tsx 和 scripts/[episode]/page.tsx 共同使用
 */
import React from 'react';

/** 骨架屏占位宽度列表 */
export const SKELETON_WIDTHS = ['95%', '80%', '88%', '72%', '90%', '65%', '82%', '75%', '91%', '78%', '85%', '70%'];

/**
 * 渲染剧本行：对场景标记、角色对白、音效等语法高亮
 * 返回 JSX 元素（带颜色）或原始字符串
 */
export function renderScriptLine(line: string): React.ReactNode {
  const trimmed = line.trim();
  if (trimmed.startsWith('※')) return <span className="text-purple-700 font-bold">{line}</span>;
  if (trimmed.startsWith('$')) return <span className="text-blue-600 font-medium">{line}</span>;
  if (trimmed.startsWith('【')) return <span className="text-green-700 italic">{line}</span>;
  if (trimmed.startsWith('△')) return <span className="text-gray-600">{line}</span>;
  if (trimmed.match(/^.+（.*）：/)) return <span className="text-orange-700">{line}</span>;
  if (trimmed.match(/^.+：/)) return <span className="text-orange-600">{line}</span>;
  return line;
}

/**
 * 统计字符数（含换行、空格等所有字符）
 */
export function countChars(text: string): number {
  return text.length;
}
