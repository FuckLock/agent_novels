'use client';
import { useState, useEffect, useMemo } from 'react';
import { parsePrompts, PromptCard as PromptCardType } from './promptParser';
import PromptCard from './PromptCard';
import PromptDrawer from './PromptDrawer';

interface StoryboardPromptsProps {
  encodedName: string;
  episode: number;
  assets: { type: string; name: string; path: string }[];
  refreshKey?: number;
}

/** 将 matched asset 路径转换为相对路径（novels/项目名 之后的部分） */
function assetToRelPath(asset: { path: string }): string {
  const pathParts = asset.path.split('/');
  const novelsIdx = pathParts.indexOf('novels');
  return novelsIdx >= 0 && novelsIdx + 2 < pathParts.length
    ? pathParts.slice(novelsIdx + 2).join('/')
    : pathParts.slice(-2).join('/');
}

/** 在 assets 中按名称关键字查找场景图（排除 -crop 和 grid 版本） */
function findSceneAsset(
  keyword: string,
  assets: { type: string; name: string; path: string }[]
) {
  return assets.find(a => {
    const cleanName = a.name.replace(/\.[^.]+$/, '');
    if (cleanName.includes('-crop') || cleanName.includes('grid')) return false;
    return cleanName.includes(keyword) || keyword.includes(cleanName.replace('scene-', ''));
  });
}

/** 构建 @图片N → 相对路径 映射，同时记录每个引用的类型（人物/场景） */
export function buildImageMap(
  raw: string,
  assets: { type: string; name: string; path: string }[]
): Map<string, string> {
  const imageMap = new Map<string, string>();
  const lines = raw.split('\n');

  for (const line of lines) {
    // 格式1：markdown 表格行 "| @图片4 | 场景参考 | 齐云宗山门广场·炎夏正午... |"
    const tableMatch = line.match(/\|\s*@图片(\d+)\s*\|\s*(\S+参考)\s*\|\s*(.+?)\s*\|/);
    if (tableMatch) {
      const refKey = `@图片${tableMatch[1]}`;
      if (imageMap.has(refKey)) continue;
      // 取场景名：去掉 "——场景宫格格1" 等后缀，取第一段
      const refName = tableMatch[3].trim().replace(/[—·].*$/, '').trim();
      const matched = findSceneAsset(refName, assets);
      if (matched) imageMap.set(refKey, assetToRelPath(matched));
      continue;
    }

    // 格式2：原有格式 "@图片4 = 场景名" 或 "@图片4：场景名"
    const refMatch = line.match(/@图片(\d+)\s*[=：:]\s*(.+?)(?:\s*[（(]|$)/);
    if (refMatch) {
      const refKey = `@图片${refMatch[1]}`;
      if (imageMap.has(refKey)) continue;
      const refName = refMatch[2].trim();
      const matched = findSceneAsset(refName, assets);
      if (matched) imageMap.set(refKey, assetToRelPath(matched));
    }
  }
  return imageMap;
}

const PAGE_SIZE = 12;

export default function StoryboardPrompts({ encodedName, episode, assets, refreshKey }: StoryboardPromptsProps) {
  const [rawContent, setRawContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedCard, setSelectedCard] = useState<PromptCardType | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/projects/${encodedName}/seedance/${episode}/prompts`)
      .then(res => res.ok ? res.json() : { content: '' })
      .then(data => setRawContent(data.content || ''))
      .catch(() => setRawContent(''))
      .finally(() => setLoading(false));
  }, [encodedName, episode, refreshKey]);

  const cards = useMemo(() => parsePrompts(rawContent), [rawContent]);
  const imageMap = useMemo(() => buildImageMap(rawContent, assets), [rawContent, assets]);

  // 切换集数时清理选中卡片和展开状态
  useEffect(() => {
    setSelectedCard(null);
    setShowAll(false);
  }, [rawContent]);

  const visibleCards = showAll ? cards : cards.slice(0, PAGE_SIZE);
  const hasMore = cards.length > PAGE_SIZE;

  const handleCopy = async (content: string, id: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(rawContent);
      setCopiedId('__all__');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 animate-pulse space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-4 bg-gray-100 rounded" style={{ width: `${60 + (i * 9) % 40}%` }} />
        ))}
      </div>
    );
  }

  if (!rawContent) {
    return (
      <div className="bg-white rounded-xl py-12 text-center text-gray-500 shadow-sm">
        <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm">暂无分镜提示词</p>
        <p className="text-xs mt-1">在制作面板中使用 Seedance 模式生成</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* 标题栏 */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">
            视频提示词
            <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
              {cards.length}
            </span>
          </h3>
          <button
            onClick={handleCopyAll}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-purple-600 transition px-3 py-1.5 rounded-lg hover:bg-purple-50 border border-gray-200"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            {copiedId === '__all__' ? '已复制全部' : '全部复制'}
          </button>
        </div>

        {/* 4 列卡片网格 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {visibleCards.map(card => (
            <PromptCard
              key={card.id}
              card={card}
              encodedName={encodedName}
              imageMap={imageMap}
              assets={assets}
              onSelect={setSelectedCard}
              onCopy={handleCopy}
              copied={copiedId === card.id}
            />
          ))}
        </div>

        {/* 展开更多 */}
        {hasMore && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full py-3 text-sm text-purple-600 hover:text-purple-700 border border-dashed border-purple-200 hover:border-purple-400 rounded-lg transition"
          >
            展开更多（共 {cards.length} 条，已显示 {PAGE_SIZE} 条）
          </button>
        )}
        {hasMore && showAll && (
          <button
            onClick={() => setShowAll(false)}
            className="w-full py-3 text-sm text-gray-500 hover:text-gray-700 border border-dashed border-gray-200 hover:border-gray-300 rounded-lg transition"
          >
            收起（显示前 {PAGE_SIZE} 条）
          </button>
        )}
      </div>

      {/* 详情抽屉 */}
      {selectedCard && (
        <PromptDrawer
          card={selectedCard}
          cards={cards}
          encodedName={encodedName}
          imageMap={imageMap}
          assets={assets}
          onClose={() => setSelectedCard(null)}
          onNavigate={setSelectedCard}
          onCopy={handleCopy}
          copied={copiedId === selectedCard.id}
        />
      )}
    </>
  );
}
