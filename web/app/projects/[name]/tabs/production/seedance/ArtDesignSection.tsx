'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import ImageLightbox from './ImageLightbox';

interface ArtDesignSectionProps {
  encodedName: string;
  assets: { type: string; name: string; path: string }[];
}

interface DesignData {
  characterPrompts: string;
  scenePrompts: string;
  manifest: Record<string, unknown> | null;
}

/** 从提示词 markdown 提取角色/场景名和描述摘要 */
function extractPromptEntries(promptText: string): { name: string; description: string }[] {
  if (!promptText) return [];
  const entries: { name: string; description: string }[] = [];
  // 按 ## 或 ### 分割
  const blocks = promptText.split(/\n#{2,3}\s+/).filter(b => b.trim());
  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim());
    if (lines.length === 0) continue;
    const name = lines[0].trim().replace(/^#+\s*/, '');
    const description = lines.slice(1).join(' ').trim().replace(/\n/g, ' ');
    entries.push({ name, description });
  }
  return entries;
}

export default function ArtDesignSection({ encodedName, assets }: ArtDesignSectionProps) {
  const [design, setDesign] = useState<DesignData>({
    characterPrompts: '',
    scenePrompts: '',
    manifest: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState<'characters' | 'scenes' | 'props'>('characters');
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [copiedName, setCopiedName] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/projects/${encodedName}/seedance/design`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => setDesign(data))
      .catch((err) => {
        console.error('加载服化道设计失败:', err);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [encodedName]);

  const characterImages = assets.filter(a => a.type === 'characters');
  const sceneImages = assets.filter(a => a.type === 'scenes');

  if (error) {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
        <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-red-600 font-medium">加载失败</p>
          <p className="text-xs text-red-600 mt-0.5">请检查网络或刷新页面重试</p>
        </div>
        <button
          onClick={() => {
            setError(false);
            setLoading(true);
            fetch(`/api/projects/${encodedName}/seedance/design`)
              .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
              })
              .then(data => setDesign(data))
              .catch(() => setError(true))
              .finally(() => setLoading(false));
          }}
          className="text-xs text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 px-2 py-1 rounded transition flex-shrink-0"
        >
          重试
        </button>
        <button
          onClick={() => setError(false)}
          className="text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-300 w-6 h-6 flex items-center justify-center rounded transition flex-shrink-0"
          aria-label="关闭"
        >
          ×
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 animate-pulse space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-4 bg-gray-100 rounded" style={{ width: `${60 + (i * 9) % 40}%` }} />
        ))}
      </div>
    );
  }

  const hasCharData = design.characterPrompts || characterImages.length > 0;
  const hasSceneData = design.scenePrompts || sceneImages.length > 0;
  const hasAnyData = hasCharData || hasSceneData;

  if (!hasAnyData) {
    return (
      <div className="bg-white rounded-xl p-12 text-center text-gray-500 shadow-sm">
        <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-sm">暂无服化道设计</p>
        <p className="text-xs mt-1">在制作面板中使用 Seedance 模式生成</p>
      </div>
    );
  }

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedName(key);
      setTimeout(() => setCopiedName(null), 2000);
    } catch {
      // ignore
    }
  };

  const tabs = [
    { id: 'characters' as const, label: '角色设定', hasData: hasCharData },
    { id: 'scenes' as const, label: '场景设定', hasData: hasSceneData },
    { id: 'props' as const, label: '道具设定', hasData: false },
  ];

  // 构建角色条目：以图片为主，无图则从提示词提取
  const charPromptEntries = extractPromptEntries(design.characterPrompts);
  const scenePromptEntries = extractPromptEntries(design.scenePrompts);

  // 合并角色图片和提示词
  const charCards = characterImages.length > 0
    ? characterImages.map(img => {
        const cleanName = img.name.replace(/\.[^.]+$/, '');
        const promptEntry = charPromptEntries.find(e =>
          e.name.includes(cleanName) || cleanName.includes(e.name)
        );
        return {
          name: cleanName,
          imageSrc: `/api/projects/${encodedName}/assets/images/seedance/images/characters/${img.name}?t=${Date.now()}`,
          description: promptEntry?.description || '',
          fullPrompt: promptEntry?.description || '',
        };
      })
    : charPromptEntries.map(e => ({
        name: e.name,
        imageSrc: '',
        description: e.description,
        fullPrompt: e.description,
      }));

  // 合并场景图片和提示词
  const sceneCards = sceneImages.length > 0
    ? sceneImages.map(img => {
        const cleanName = img.name.replace(/\.[^.]+$/, '').replace('scene-', '');
        const promptEntry = scenePromptEntries.find(e =>
          e.name.includes(cleanName) || cleanName.includes(e.name)
        );
        return {
          name: cleanName,
          imageSrc: `/api/projects/${encodedName}/assets/images/seedance/images/scenes/${img.name}?t=${Date.now()}`,
          description: promptEntry?.description || '',
          fullPrompt: promptEntry?.description || '',
        };
      })
    : scenePromptEntries.map(e => ({
        name: e.name,
        imageSrc: '',
        description: e.description,
        fullPrompt: e.description,
      }));

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {/* 子Tab */}
        <div className="flex gap-1 p-3 border-b bg-gray-50">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 text-sm rounded-md transition flex items-center gap-1.5 ${
                activeTab === tab.id ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
              {!tab.hasData && (
                <span className="text-xs opacity-60">（待生成）</span>
              )}
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* 角色 Tab */}
          {activeTab === 'characters' && (
            <div className="space-y-3">
              {charCards.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">暂无角色设定数据</p>
              ) : (
                charCards.map((card, i) => (
                  <div
                    key={i}
                    className="flex gap-4 bg-white rounded-lg border border-gray-100 p-4 hover:shadow-md transition"
                  >
                    {/* 左侧图片 */}
                    <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                      {card.imageSrc ? (
                        <div
                          className="relative w-full h-full cursor-zoom-in hover:ring-2 hover:ring-purple-300 rounded-lg"
                          onClick={() => setLightbox({ src: card.imageSrc, alt: card.name })}
                        >
                          <Image
                            src={card.imageSrc}
                            alt={card.name}
                            fill
                            className="object-cover"
                            sizes="80px"
                          />
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* 右侧信息 */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 mb-1">{card.name}</p>
                      <p className="text-xs text-gray-500 line-clamp-3">
                        {card.description ? card.description.slice(0, 100) : '暂无描述'}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        {card.imageSrc && (
                          <button
                            onClick={() => setLightbox({ src: card.imageSrc, alt: card.name })}
                            className="text-xs text-gray-500 hover:text-purple-600 transition"
                          >
                            放大图片
                          </button>
                        )}
                        {card.fullPrompt && (
                          <button
                            onClick={() => handleCopy(card.fullPrompt, `char-${i}`)}
                            className="text-xs text-purple-600 hover:text-purple-700 transition"
                          >
                            {copiedName === `char-${i}` ? '已复制' : '复制提示词'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 场景 Tab */}
          {activeTab === 'scenes' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sceneCards.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8 col-span-full">暂无场景设定数据</p>
              ) : (
                sceneCards.map((card, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-lg border border-gray-100 overflow-hidden hover:shadow-md transition"
                  >
                    {/* 顶部图片（场景用 aspect-video 卡片内） */}
                    <div className="aspect-video w-full relative bg-gray-100">
                      {card.imageSrc ? (
                        <div
                          className="relative w-full h-full cursor-zoom-in hover:ring-2 hover:ring-purple-300"
                          onClick={() => setLightbox({ src: card.imageSrc, alt: card.name })}
                        >
                          <Image
                            src={card.imageSrc}
                            alt={card.name}
                            fill
                            className="object-cover"
                            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          />
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* 下方信息 */}
                    <div className="p-3">
                      <p className="text-sm font-semibold text-gray-800 mb-1">{card.name}</p>
                      <p className="text-xs text-gray-500 line-clamp-2">
                        {card.description ? card.description.slice(0, 80) : '暂无描述'}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        {card.imageSrc && (
                          <button
                            onClick={() => setLightbox({ src: card.imageSrc, alt: card.name })}
                            className="text-xs text-gray-500 hover:text-purple-600 transition"
                          >
                            放大图片
                          </button>
                        )}
                        {card.fullPrompt && (
                          <button
                            onClick={() => handleCopy(card.fullPrompt, `scene-${i}`)}
                            className="text-xs text-purple-600 hover:text-purple-700 transition"
                          >
                            {copiedName === `scene-${i}` ? '已复制' : '复制提示词'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 道具 Tab */}
          {activeTab === 'props' && (
            <div className="py-12 text-center text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <p className="text-sm">暂无道具设定</p>
              <p className="text-xs mt-1 text-gray-400">功能开发中，敬请期待</p>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  );
}
