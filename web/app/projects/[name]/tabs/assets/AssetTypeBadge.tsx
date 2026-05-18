'use client';

import { SeedanceAssetType } from '../../types';

interface AssetTypeBadgeProps {
  type: SeedanceAssetType;
}

const TYPE_CONFIG: Record<SeedanceAssetType, { label: string; className: string }> = {
  character: {
    label: '角色',
    className: 'bg-orange-100 text-orange-700',
  },
  scene: {
    label: '场景',
    className: 'bg-green-100 text-green-700',
  },
  prop: {
    label: '道具',
    className: 'bg-purple-100 text-purple-700',
  },
  costume: {
    label: '服装',
    className: 'bg-blue-100 text-blue-700',
  },
  makeup: {
    label: '妆发',
    className: 'bg-pink-100 text-pink-700',
  },
};

/** 资产类型标签组件（新配色） */
export default function AssetTypeBadge({ type }: AssetTypeBadgeProps) {
  const config = TYPE_CONFIG[type];
  return (
    <span className={`text-[11px] px-1.5 py-0.5 rounded ${config.className}`}>
      {config.label}
    </span>
  );
}
