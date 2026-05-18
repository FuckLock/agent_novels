'use client';
import { useState } from 'react';
import Image from 'next/image';
import ImageLightbox from './ImageLightbox';

interface AssetThumbnailProps {
  encodedName: string;
  name: string;           // 资产名称
  type: string;           // "character" | "scene" | "prop"
  imagePath: string;      // 相对路径，如 "seedance/images/characters/叶真.png"
  size: 'sm' | 'md';      // sm=28px(卡片), md=64px(抽屉)
  localRef?: string;      // "@图1" - md模式下显示编号标签
  showLabel?: boolean;    // md模式下显示名称和类型标签
}

/** 根据资产类型返回底部色条颜色 */
function getTypeBarColor(type: string): string {
  switch (type) {
    case 'character': return 'bg-purple-400';
    case 'scene':     return 'bg-blue-400';
    case 'prop':      return 'bg-amber-400';
    default:          return 'bg-gray-400';
  }
}

/** 根据资产类型返回中文标签 */
function getTypeLabel(type: string): string {
  switch (type) {
    case 'character': return '角色';
    case 'scene':     return '场景';
    case 'prop':      return '道具';
    default:          return type;
  }
}

/** 根据资产类型返回标签样式 */
function getTypeLabelStyle(type: string): string {
  switch (type) {
    case 'character': return 'bg-purple-100 text-purple-700';
    case 'scene':     return 'bg-blue-100 text-blue-700';
    case 'prop':      return 'bg-amber-100 text-amber-700';
    default:          return 'bg-gray-100 text-gray-700';
  }
}

export default function AssetThumbnail({
  encodedName,
  name,
  type,
  imagePath,
  size,
  localRef,
  showLabel,
}: AssetThumbnailProps) {
  const [imgError, setImgError] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const src = `/api/projects/${encodedName}/assets/images/${imagePath}`;
  const tooltipText = localRef ? `${localRef} - ${name}（${getTypeLabel(type)}）` : `${name}（${getTypeLabel(type)}）`;

  if (size === 'sm') {
    return (
      <div
        className="w-7 h-7 rounded overflow-hidden bg-gray-100 flex-shrink-0 relative"
        title={tooltipText}
      >
        {!imgError ? (
          <Image
            src={src}
            alt={name}
            fill
            className="object-cover"
            sizes="28px"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {/* 底部色条 */}
        <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${getTypeBarColor(type)}`} />
      </div>
    );
  }

  // size === 'md'
  const canPreview = !imgError;

  return (
    <div className="flex flex-col items-center gap-1 flex-shrink-0" title={tooltipText}>
      <div
        className={`w-16 h-16 rounded-lg overflow-hidden bg-gray-100 relative ${
          canPreview ? 'cursor-pointer group/thumb' : ''
        }`}
        onClick={canPreview ? () => setShowLightbox(true) : undefined}
        role={canPreview ? 'button' : undefined}
        tabIndex={canPreview ? 0 : undefined}
        onKeyDown={canPreview ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowLightbox(true); } } : undefined}
      >
        {!imgError ? (
          <Image
            src={src}
            alt={name}
            fill
            className="object-cover"
            sizes="64px"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {/* 底部色条 */}
        <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${getTypeBarColor(type)}`} />
        {/* 左上角编号标签 */}
        {localRef && (
          <span className="absolute top-1 left-1 bg-black/50 text-white px-1 py-0.5 rounded text-[10px] leading-none">
            {localRef}
          </span>
        )}
        {/* hover 放大图标提示 */}
        {canPreview && (
          <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/30 transition-colors flex items-center justify-center">
            <svg className="w-5 h-5 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </div>
        )}
      </div>
      {/* 名称和类型标签 */}
      {showLabel && (
        <div className="flex flex-col items-center gap-0.5 max-w-16">
          <span className="text-[11px] text-gray-700 truncate max-w-full">{name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${getTypeLabelStyle(type)}`}>
            {getTypeLabel(type)}
          </span>
        </div>
      )}
      {/* Lightbox 全屏预览 */}
      {showLightbox && (
        <ImageLightbox
          src={src}
          alt={`${name}（${getTypeLabel(type)}）`}
          onClose={() => setShowLightbox(false)}
        />
      )}
    </div>
  );
}
