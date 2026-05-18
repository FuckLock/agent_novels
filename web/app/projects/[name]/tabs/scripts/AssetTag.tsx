'use client';

import { AssetType, ASSET_TYPE_CONFIG } from '../../types';

interface AssetTagProps {
  type: AssetType;
  name: string;
  /** 'colored' 用于弹窗中的分组彩色样式，'plain' 用于卡片列表中的统一灰色样式 */
  variant?: 'colored' | 'plain';
  onRemove?: () => void;
}

/** 单个资产标签组件 */
export default function AssetTag({ type, name, variant = 'colored', onRemove }: AssetTagProps) {
  if (variant === 'plain') {
    return (
      <span className="inline-flex items-center bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded">
        {name}
      </span>
    );
  }

  const config = ASSET_TYPE_CONFIG[type];

  return (
    <span
      className={`inline-flex items-center gap-1 ${config.bgColor} ${config.textColor} text-xs px-2 py-1 rounded transition-opacity duration-150`}
    >
      {name}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className={`${config.hoverColor} ml-0.5 opacity-60 hover:opacity-100 transition-opacity leading-none`}
          aria-label={`移除${name}`}
        >
          &times;
        </button>
      )}
    </span>
  );
}
