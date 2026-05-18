'use client';
import { useMemo } from 'react';
import Image from 'next/image';
import { PromptCard as PromptCardType, parseAssetRefs } from './promptParser';
import AssetThumbnail from './AssetThumbnail';

interface PromptCardProps {
  card: PromptCardType;
  encodedName: string;
  imageMap: Map<string, string>;
  assets: { type: string; name: string; path: string }[];
  onSelect: (card: PromptCardType) => void;
  onCopy: (content: string, id: string) => void;
  copied: boolean;
}

export default function PromptCard({
  card,
  encodedName,
  imageMap,
  assets,
  onSelect,
  onCopy,
  copied,
}: PromptCardProps) {
  // 解析资产引用
  const assetRefs = useMemo(() => parseAssetRefs(card.rawContent), [card.rawContent]);

  // 优先取场景类型的资产作为顶部大缩略图
  const sceneAssetRef = assetRefs.find(
    ref => assets[ref.globalIndex - 1]?.type === 'scene'
  );
  const firstAssetRef = sceneAssetRef ?? assetRefs[0];
  const thumbnailAsset = firstAssetRef ? assets[firstAssetRef.globalIndex - 1] : undefined;
  // 降级到旧的 imageMap 逻辑
  const thumbnailFromMap = !thumbnailAsset
    ? (card.imageRefs.find(ref => imageMap.has(ref)) ? imageMap.get(card.imageRefs.find(ref => imageMap.has(ref))!) : undefined)
    : undefined;
  const thumbnailSrc = thumbnailAsset
    ? `/api/projects/${encodedName}/assets/images/${thumbnailAsset.path}`
    : thumbnailFromMap
      ? `/api/projects/${encodedName}/assets/images/${thumbnailFromMap}`
      : '';

  return (
    <div
      className="group bg-white rounded-lg border border-gray-100 hover:shadow-md transition cursor-pointer overflow-hidden"
      onClick={() => onSelect(card)}
    >
      {/* 顶部缩略图 */}
      <div className="relative aspect-video bg-gray-100">
        {thumbnailSrc ? (
          <Image
            src={thumbnailSrc}
            alt={card.id}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 50vw, 25vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {/* hover 遮罩 */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-end p-2">
          <p className="text-white text-xs leading-snug line-clamp-2">{card.title}</p>
        </div>
        {/* 角标 */}
        <span className="absolute top-2 left-2 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded">
          {card.id}
        </span>
      </div>

      {/* 卡片体 */}
      <div className="p-3">
        <p className="text-sm font-medium text-gray-800 line-clamp-1 mb-1">
          {card.title || card.id}
        </p>

        {/* 资产缩略图行 */}
        {assetRefs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5 mb-1.5">
            {assetRefs.slice(0, 9).map(ref => {
              const asset = assets[ref.globalIndex - 1];
              if (!asset) return null;
              return (
                <AssetThumbnail
                  key={ref.localRef}
                  encodedName={encodedName}
                  name={asset.name}
                  type={asset.type}
                  imagePath={asset.path}
                  size="sm"
                />
              );
            })}
            {assetRefs.length > 9 && (
              <span className="text-[10px] text-gray-400 flex-shrink-0">+{assetRefs.length - 9}</span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {[card.shotType, card.duration].filter(Boolean).join(' · ') || '提示词'}
          </span>
          <button
            onClick={e => {
              e.stopPropagation();
              onCopy(card.rawContent, card.id);
            }}
            className="text-xs text-purple-600 hover:text-purple-700 transition"
          >
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      </div>
    </div>
  );
}
