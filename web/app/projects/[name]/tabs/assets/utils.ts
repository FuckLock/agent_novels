import { AssetState } from '../../types';

/** 状态标签配置 */
export const STATE_DISPLAY: Record<AssetState, { label: string; className: string }> = {
  pending: { label: '待生成', className: 'bg-gray-100 text-gray-500' },
  generating: { label: '生成中', className: 'bg-blue-50 text-blue-700' },
  success: { label: '已完成', className: 'bg-green-50 text-green-700' },
  failed: { label: '失败', className: 'bg-red-50 text-red-600' },
};

// 将 "ep1" 格式转为 "第1集"
export function formatEpisodeRef(ref: string): string {
  const match = ref.match(/^ep(\d+)$/i);
  if (match) return `第${match[1]}集`;
  return ref;
}

// 去除资产名称末尾多余的 "|"
export function cleanAssetName(name: string): string {
  return name.replace(/\s*\|+\s*$/, '').trim();
}
