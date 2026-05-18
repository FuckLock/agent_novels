'use client';

import { useState } from 'react';
import { SeedanceAsset, SeedanceAssetType } from '../../types';
import AssetTypeBadge from './AssetTypeBadge';
import PromptStatusBadge from './PromptStatusBadge';
import ImageStatusBadge from './ImageStatusBadge';
import { cleanAssetName } from './utils';

interface AssetCardProps {
  asset: SeedanceAsset;
  encodedName: string;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onClick: () => void;
}

/** 类型占位图标 SVG path */
const TYPE_ICON_PATHS: Record<SeedanceAssetType, string> = {
  character: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  scene: 'M4 16l4-4 4 4 4-8 4 8M2 20h20',
  prop: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  costume: 'M8 3l4 3 4-3 3 4-3 2v10H8V9L5 7l3-4z',
  makeup: 'M7 21l10-10 3 3-10 10H7v-3zM14 4l6 6m-2-8l4 4',
};

/** 单张资产卡片（增强版） */
export default function AssetCard({ asset, encodedName, isSelected, onToggleSelect, onClick }: AssetCardProps) {
  const [imgError, setImgError] = useState(false);

  const imageUrl = asset.imagePath
    ? `/api/projects/${encodedName}/assets/images/${asset.imagePath}${asset.generatedAt ? `?t=${encodeURIComponent(asset.generatedAt)}` : ''}`
    : null;

  const hasImage = imageUrl && !imgError && asset.state === 'success';
  // 超时判断：updatedAt 距今超过 30 分钟的 generating 状态视为 stale（与后端 STUCK_TIMEOUT_MS 对齐）
  const STALE_TIMEOUT_MS = 30 * 60 * 1000;
  const isStale = asset.state === 'generating' && asset.updatedAt
    && (Date.now() - new Date(asset.updatedAt).getTime()) > STALE_TIMEOUT_MS;
  const isGenerating = asset.state === 'generating' && !isStale;
  const hasPrompt = Boolean(asset.prompt);

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelect?.(asset.id);
  };

  const handleCheckboxKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelect?.(asset.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={`group relative overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-md active:scale-[0.98] focus:outline-none ${
        isSelected
          ? 'bg-white border-2 border-purple-400 rounded-xl shadow-md ring-1 ring-purple-200'
          : 'bg-white border border-gray-200 rounded-xl hover:border-gray-300'
      }`}
    >
      {/* 右上角复选框 */}
      {onToggleSelect && (
        <div
          className={`absolute top-2 right-2 z-10 transition-opacity duration-150 ${
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <input
            type="checkbox"
            checked={isSelected ?? false}
            onChange={() => {/* handled by click */}}
            onClick={handleCheckboxClick}
            onKeyDown={handleCheckboxKeyDown}
            className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500 bg-white/80 backdrop-blur-sm cursor-pointer"
          />
        </div>
      )}

      {/* 缩略图区域 */}
      <div className="relative aspect-[4/3] bg-gray-50 overflow-hidden">
        {hasImage ? (
          <img
            src={imageUrl}
            alt={asset.name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center">
            <svg className="w-10 h-10 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={TYPE_ICON_PATHS[asset.type]} />
            </svg>
            {!isGenerating && asset.state !== 'failed' && (
              <span className="text-xs text-gray-400">等待生成</span>
            )}
            {imgError && asset.state === 'success' && (
              <span className="text-xs text-gray-400">图片加载失败</span>
            )}
          </div>
        )}

        {/* 生成中覆盖层 */}
        {isGenerating && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center">
            <svg className="w-6 h-6 text-purple-500 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-xs text-purple-600 mt-1">生成中...</span>
          </div>
        )}

        {/* 超时覆盖层（generating 超过 15 分钟） */}
        {isStale && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center">
            <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs text-amber-600 mt-1">生成超时</span>
          </div>
        )}

        {/* 失败图标 */}
        {asset.state === 'failed' && !hasImage && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <svg className="w-10 h-10 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={TYPE_ICON_PATHS[asset.type]} />
            </svg>
            <svg className="absolute bottom-2 right-2 w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
        )}
      </div>

      {/* 信息区域 */}
      <div className="p-3 space-y-1.5">
        {/* 第一行：名称 + 提示词状态标签 */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium text-gray-800 truncate flex-1">{cleanAssetName(asset.name)}</span>
          <PromptStatusBadge hasPrompt={hasPrompt} promptState={asset.promptState} />
        </div>

        {/* 第二行：类型标签 + 图片生成状态标签 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <AssetTypeBadge type={asset.type} />
          <ImageStatusBadge state={asset.state} error={asset.error} />
        </div>

        {/* 第三行：模型名称 + 分辨率 */}
        {(asset.modelId || asset.resolution) && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="truncate">{asset.modelId || '未指定模型'}</span>
            <span className="text-gray-300">|</span>
            <span>{asset.resolution || '未指定'}</span>
          </div>
        )}

        {/* 第四行：描述预览 */}
        <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
          {asset.description || '--'}
        </p>
      </div>
    </div>
  );
}
