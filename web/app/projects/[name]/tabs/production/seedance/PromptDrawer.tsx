'use client';
import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { PromptCard, parseAssetRefs } from './promptParser';
import AssetThumbnail from './AssetThumbnail';

interface PromptDrawerProps {
  card: PromptCard;
  cards: PromptCard[];
  encodedName: string;
  imageMap: Map<string, string>;
  assets: { type: string; name: string; path: string }[];
  onClose: () => void;
  onNavigate: (card: PromptCard) => void;
  onCopy: (content: string, id: string) => void;
  copied: boolean;
}

export default function PromptDrawer({
  card,
  cards,
  encodedName,
  imageMap,
  assets,
  onClose,
  onNavigate,
  onCopy,
  copied,
}: PromptDrawerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const currentIndex = cards.findIndex(c => c.id === card.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < cards.length - 1;

  // 进入动画
  useEffect(() => {
    const timer = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  // ESC 关闭 / 左右箭头导航
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onNavigate(cards[currentIndex - 1]);
      if (e.key === 'ArrowRight' && hasNext) onNavigate(cards[currentIndex + 1]);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onNavigate, cards, currentIndex, hasPrev, hasNext]);

  // 解析资产引用
  const assetRefs = useMemo(() => parseAssetRefs(card.rawContent), [card.rawContent]);
  const hasAssetRefs = assetRefs.some(ref => assets[ref.globalIndex - 1]);

  // 降级：无资产引用时使用旧的 imageMap 逻辑
  const firstRef = card.imageRefs[0];
  const imagePath = firstRef ? imageMap.get(firstRef) : undefined;
  const imageSrc = imagePath
    ? `/api/projects/${encodedName}/assets/images/${imagePath}`
    : '';

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-200 ${
          isVisible ? 'bg-black/20 opacity-100' : 'bg-black/0 opacity-0'
        }`}
        onClick={onClose}
      />

      {/* 侧滑抽屉 */}
      <div
        className={`fixed right-0 top-0 h-full w-full sm:w-[480px] bg-white shadow-2xl z-50 overflow-y-auto flex flex-col transition-transform duration-200 ${
          isVisible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800">
              {card.id} {card.title}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => hasPrev && onNavigate(cards[currentIndex - 1])}
              disabled={!hasPrev}
              className={`px-2 py-1 text-xs rounded transition ${
                hasPrev
                  ? 'text-purple-600 hover:bg-purple-50'
                  : 'text-gray-300 cursor-not-allowed'
              }`}
            >
              上一条
            </button>
            <button
              onClick={() => hasNext && onNavigate(cards[currentIndex + 1])}
              disabled={!hasNext}
              className={`px-2 py-1 text-xs rounded transition ${
                hasNext
                  ? 'text-purple-600 hover:bg-purple-50'
                  : 'text-gray-300 cursor-not-allowed'
              }`}
            >
              下一条
            </button>
            <button
              onClick={onClose}
              className="ml-2 text-gray-400 hover:text-gray-600 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex-1 p-5 space-y-4 pb-24">
          {/* 参考资产 */}
          {hasAssetRefs ? (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">参考资产</h4>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {assetRefs.map(ref => {
                  const asset = assets[ref.globalIndex - 1];
                  if (!asset) return null;
                  return (
                    <AssetThumbnail
                      key={ref.localRef}
                      encodedName={encodedName}
                      name={asset.name}
                      type={asset.type}
                      imagePath={asset.path}
                      size="md"
                      localRef={ref.localRef}
                      showLabel
                    />
                  );
                })}
              </div>
            </div>
          ) : imageSrc ? (
            <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-100">
              <Image
                src={imageSrc}
                alt={card.id}
                fill
                className="object-cover"
                sizes="480px"
              />
            </div>
          ) : (
            <div className="aspect-video rounded-lg bg-gray-100 flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}

          {/* 时间线 */}
          {card.timeSegments.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">时间线</h4>
              <div className="space-y-2">
                {card.timeSegments.map((seg, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-3">
                    <span className="inline-block bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded mb-1.5">
                      {seg.time}
                    </span>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{seg.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 音效 */}
          {card.audio && (
            <div className="bg-amber-50 rounded-lg p-3">
              <h4 className="text-xs font-semibold text-amber-700 mb-1">音效</h4>
              <p className="text-sm text-amber-800">{card.audio}</p>
            </div>
          )}

          {/* 时间线为空时降级展示原始内容 */}
          {card.timeSegments.length === 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">提示词内容</h4>
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans bg-gray-50 rounded-lg p-4 leading-relaxed">
                {card.rawContent}
              </pre>
            </div>
          )}
        </div>

        {/* 底部复制按钮 */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4">
          <button
            onClick={() => onCopy(card.rawContent, card.id)}
            className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded transition font-medium"
          >
            {copied ? '已复制完整提示词' : '复制完整提示词'}
          </button>
        </div>
      </div>
    </>
  );
}
