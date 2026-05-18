'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import StoryboardPrompts from './seedance/StoryboardPrompts';

type NodeId = 'A' | 'B' | 'C1' | 'C2' | 'C3' | 'D';

/** 处理行内格式：**粗体**、`代码` */
function processInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;
  let i = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={i++} className="font-semibold text-gray-800">{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<code key={i++} className="bg-gray-100 text-purple-600 px-1 py-0.5 rounded text-xs">{match[3]}</code>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

/** 轻量级 Markdown 渲染组件 */
function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let key = 0;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        elements.push(<pre key={key++} className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 overflow-x-auto my-2 font-mono">{codeBuffer.join('\n')}</pre>);
        codeBuffer = [];
      }
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) { codeBuffer.push(line); continue; }

    if (!line.trim()) { elements.push(<div key={key++} className="h-2" />); continue; }

    if (/^-{3,}$/.test(line.trim())) { elements.push(<hr key={key++} className="my-4 border-gray-200" />); continue; }

    if (line.startsWith('### ')) {
      elements.push(<h3 key={key++} className="text-base font-semibold text-gray-800 mt-4 mb-2">{processInline(line.slice(4))}</h3>);
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={key++} className="text-lg font-bold text-gray-900 mt-5 mb-2">{processInline(line.slice(3))}</h2>);
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(<h1 key={key++} className="text-xl font-bold text-gray-900 mt-4 mb-3">{processInline(line.slice(2))}</h1>);
      continue;
    }

    if (line.startsWith('> ')) {
      elements.push(<blockquote key={key++} className="border-l-3 border-purple-300 pl-3 py-1 text-sm text-gray-500 italic my-2">{processInline(line.slice(2))}</blockquote>);
      continue;
    }

    if (line.trim().startsWith('|')) {
      if (/^\|[\s\-:]+\|/.test(line.trim())) continue;
      elements.push(<div key={key++} className="text-sm text-gray-700 font-mono bg-gray-50 px-2 py-0.5 border-b border-gray-100">{line}</div>);
      continue;
    }

    elements.push(<p key={key++} className="text-sm text-gray-700 leading-relaxed my-1">{processInline(line)}</p>);
  }

  return <div>{elements}</div>;
}

/** 通用状态提示组件 */
function StatusHint({ icon, title, description }: { icon: 'pending' | 'running'; title: string; description: string }) {
  return (
    <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
      {icon === 'running' ? (
        <div className="w-10 h-10 border-3 border-purple-200 border-t-purple-500 rounded-full animate-spin" />
      ) : (
        <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )}
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className="text-xs text-gray-400 max-w-xs">{description}</p>
    </div>
  );
}

interface NodeDetailPanelProps {
  nodeId: NodeId;
  encodedName: string;
  episode: number;
  onClose: () => void;
  promptsStatus?: string;
  nodeStatus?: string;
}

/** A 导演分析 — 读取 01-director.md 渲染 */
function DirectorContent({ encodedName, episode }: { encodedName: string; episode: number }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/projects/${encodedName}/seedance/${episode}/director`)
      .then(res => res.ok ? res.json() : { content: '' })
      .then(data => setContent(data.content || ''))
      .catch(() => setContent(''))
      .finally(() => setLoading(false));
  }, [encodedName, episode]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {['60%', '85%', '72%', '90%'].map((w, i) => (
          <div key={i} className="h-4 bg-gray-100 rounded" style={{ width: w }} />
        ))}
      </div>
    );
  }

  if (!content) {
    return (
      <div className="py-8 text-center text-gray-400 text-sm">
        暂无导演分析内容
      </div>
    );
  }

  return <SimpleMarkdown content={content} />;
}

/** 资产缩略图卡片 */
function AssetCard({ asset, encodedName, compact }: {
  asset: { id: string; name: string; type: string; imagePath?: string; state?: string; generatedAt?: string };
  encodedName: string;
  compact?: boolean;
}) {
  const typeLabel: Record<string, string> = { character: '角色', scene: '场景', prop: '道具' };
  const size = compact ? 'w-16 h-16' : 'aspect-square';

  return (
    <div className="group relative">
      <div className={`${size} bg-gray-100 rounded-lg overflow-hidden border border-gray-200`}>
        {asset.state === 'success' && asset.imagePath ? (
          <img
            src={`/api/projects/${encodedName}/assets/images/${asset.imagePath}${asset.generatedAt ? `?t=${encodeURIComponent(asset.generatedAt)}` : ''}`}
            alt={asset.name}
            className="w-full h-full object-cover"
          />
        ) : asset.state === 'generating' ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-400 rounded-full animate-spin" />
            <span className="text-[10px] text-gray-400">生成中</span>
          </div>
        ) : asset.state === 'failed' ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1">
            <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span className="text-[10px] text-red-400">失败</span>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-[10px] text-gray-400">待生成</span>
          </div>
        )}
      </div>
      <p className={`${compact ? 'text-[10px]' : 'text-xs'} text-gray-600 mt-1 truncate`}>{asset.name}</p>
      <span className={`${compact ? 'text-[10px]' : 'text-xs'} text-gray-400`}>{typeLabel[asset.type] || asset.type}</span>
    </div>
  );
}

/** 按类型分组渲染资产网格 */
function AssetTypeGrid({ assets, encodedName, compact, cols }: {
  assets: { id: string; name: string; type: string; imagePath?: string; state?: string; generatedAt?: string }[];
  encodedName: string;
  compact?: boolean;
  cols?: string;
}) {
  const typeOrder = ['character', 'scene', 'prop'];
  const typeLabel: Record<string, string> = { character: '角色', scene: '场景', prop: '道具' };
  const grouped = typeOrder
    .map(type => ({ type, items: assets.filter(a => a.type === type) }))
    .filter(g => g.items.length > 0);

  return (
    <div className="space-y-3">
      {grouped.map(g => (
        <div key={g.type}>
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">{typeLabel[g.type]} ({g.items.length})</p>
          <div className={`grid ${cols || 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6'} gap-2`}>
            {g.items.map(asset => (
              <AssetCard key={asset.id} asset={asset} encodedName={encodedName} compact={compact} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** B 资产管理 — 双区分组：本集新增 + 复用资产 */
function AssetsContent({ encodedName, episode }: { encodedName: string; episode: number }) {
  type AssetItem = { id: string; name: string; type: string; imagePath?: string; state?: string; generatedAt?: string; sourceEpisode?: string; episodeRefs?: string[] };
  const [allAssets, setAllAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reusedExpanded, setReusedExpanded] = useState(false);

  const epKey = `ep${String(episode).padStart(2, '0')}`;

  const fetchAssets = useCallback(() => {
    return fetch(`/api/projects/${encodedName}/seedance/assets`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        const list: AssetItem[] = Array.isArray(data) ? data : data.assets || [];
        setAllAssets(list);
      })
      .catch(() => setAllAssets([]));
  }, [encodedName]);

  useEffect(() => {
    setLoading(true);
    fetchAssets().finally(() => setLoading(false));
  }, [fetchAssets, episode]);

  // 有 generating 状态的资产时自动轮询，全部完成后停止
  const hasGenerating = allAssets.some(a => a.state === 'generating');
  useEffect(() => {
    if (!hasGenerating) return;
    const interval = setInterval(() => { fetchAssets(); }, 5000);
    return () => clearInterval(interval);
  }, [hasGenerating, fetchAssets]);

  // 分组：本集新增 vs 复用资产
  const newAssets = allAssets.filter(a => a.sourceEpisode === epKey);
  const reusedAssets = allAssets.filter(a =>
    a.sourceEpisode !== epKey && a.state === 'success' && a.imagePath
  );

  // 本集新增的完成统计
  const newCompleted = newAssets.filter(a => a.state === 'success' && a.imagePath).length;

  if (loading) {
    return (
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-square bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (allAssets.length === 0) {
    return (
      <div className="py-8 text-center text-gray-400 text-sm">
        暂无资产数据
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 本集新增 */}
      {newAssets.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-gray-700">
              本集新增
              <span className="ml-1.5 text-[10px] font-normal text-gray-400">
                {newCompleted}/{newAssets.length} 已完成
              </span>
            </h4>
          </div>
          <AssetTypeGrid assets={newAssets} encodedName={encodedName} />
        </div>
      )}

      {/* 复用资产 */}
      {reusedAssets.length > 0 && (
        <div>
          <button
            onClick={() => setReusedExpanded(!reusedExpanded)}
            className="flex items-center gap-2 w-full text-left group"
          >
            <h4 className="text-xs font-semibold text-gray-500">
              复用资产
              <span className="ml-1.5 text-[10px] font-normal text-gray-400">
                ({reusedAssets.length}) · 来自前集，无需重新生成
              </span>
            </h4>
            <svg
              className={`w-3.5 h-3.5 text-gray-400 transition-transform ${reusedExpanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {reusedExpanded && (
            <div className="mt-2">
              <AssetTypeGrid assets={reusedAssets} encodedName={encodedName} compact cols="grid-cols-4 sm:grid-cols-6 md:grid-cols-8" />
            </div>
          )}
        </div>
      )}

      {/* EP01 等第一集没有复用资产，也没有新增分组标题 */}
      {newAssets.length === 0 && reusedAssets.length === 0 && allAssets.length > 0 && (
        <AssetTypeGrid assets={allAssets} encodedName={encodedName} />
      )}

      <div className="text-center">
        <span className="text-xs text-gray-400">
          切换到&ldquo;塑造&rdquo;Tab 查看完整资产列表
        </span>
      </div>
    </div>
  );
}

/** C3 提示词 — 加载 assets 后渲染 StoryboardPrompts（带资产缩略图） */
function PromptsContent({ encodedName, episode, refreshKey }: { encodedName: string; episode: number; refreshKey?: number }) {
  const [assets, setAssets] = useState<{ type: string; name: string; path: string }[]>([]);

  useEffect(() => {
    fetch(`/api/projects/${encodedName}/seedance/assets`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        const list: { type: string; name: string; imagePath?: string }[] =
          Array.isArray(data) ? data : data.assets || [];
        setAssets(
          list.map(a => ({
            type: a.type,
            name: a.name,
            path: a.imagePath || '',
          }))
        );
      })
      .catch(() => setAssets([]));
  }, [encodedName]);

  return (
    <StoryboardPrompts encodedName={encodedName} episode={episode} assets={assets} refreshKey={refreshKey} />
  );
}

/** C1 导演规划 — 六维度卡片渲染 */
function DirectorPlanContent({ encodedName, episode }: { encodedName: string; episode: number }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/projects/${encodedName}/seedance/${episode}/director-plan`)
      .then(res => res.ok ? res.json() : { data: null })
      .then(data => setPlan(data.data))
      .catch(() => setPlan(null))
      .finally(() => setLoading(false));
  }, [encodedName, episode]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-4 bg-gray-100 rounded" style={{ width: `${60 + (i * 12) % 35}%` }} />
        ))}
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="py-8 text-center text-gray-400 text-sm">
        导演规划尚未生成，请在右侧聊天框输入「导演规划」开始
      </div>
    );
  }

  const PACING_LABEL: Record<string, string> = { slow: '慢', medium: '中', fast: '快' };
  const TYPE_LABEL: Record<string, string> = { emotional: '情感', plot: '剧情', visual: '视觉' };
  const ACT_LABEL: Record<string, string> = { opening: '开篇', rising: '发展', climax: '高潮', falling: '收束', ending: '结尾' };

  return (
    <div className="space-y-4">
      {/* 主题核心 */}
      {plan.themeCore && (
        <div className="bg-purple-50/50 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-purple-700 mb-2">主题与叙事核心</h4>
          <div className="space-y-1.5">
            <div><span className="text-xs text-gray-500">情感主线：</span><span className="text-sm text-gray-800">{plan.themeCore.emotionalArc}</span></div>
            <div><span className="text-xs text-gray-500">观众感悟：</span><span className="text-sm text-gray-800">{plan.themeCore.viewerTakeaway}</span></div>
          </div>
        </div>
      )}

      {/* 视觉风格 */}
      {plan.visualStyle && (
        <div className="bg-blue-50/50 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-blue-700 mb-2">视觉风格基调</h4>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['色彩方案', plan.visualStyle.colorPalette],
              ['光线方案', plan.visualStyle.lightingPlan],
              ['构图风格', plan.visualStyle.compositionStyle],
              ['材质方向', plan.visualStyle.textureDirection],
            ].map(([label, val]) => (
              <div key={label as string} className="bg-white/60 rounded px-2.5 py-2">
                <div className="text-[10px] text-gray-400">{label}</div>
                <div className="text-xs text-gray-700 mt-0.5">{val as string}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 场景分组 */}
      {Array.isArray(plan.sceneGroups) && plan.sceneGroups.length > 0 && (
        <div className="bg-green-50/50 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-green-700 mb-2">场景分组</h4>
          <div className="space-y-2">
            {plan.sceneGroups.map((g: { sceneId: string; sceneName: string; shots: number[]; mood: string; lightingKey: string; colorScheme: string }, idx: number) => (
              <div key={`${g.sceneId}-${idx}`} className="bg-white/60 rounded px-3 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-gray-800">{g.sceneName}</span>
                  <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{g.mood}</span>
                </div>
                <div className="flex flex-wrap gap-1 text-[10px] text-gray-500">
                  <span>光调：{g.lightingKey}</span>
                  <span>|</span>
                  <span>色彩：{g.colorScheme}</span>
                  <span>|</span>
                  <span>镜头：{Array.isArray(g.shots) ? g.shots.join(', ') : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 叙事节奏 */}
      {Array.isArray(plan.rhythm) && plan.rhythm.length > 0 && (
        <div className="bg-amber-50/50 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-amber-700 mb-2">叙事节奏</h4>
          <div className="flex flex-wrap gap-2">
            {plan.rhythm.map((r: { act: string; shotRange: number[]; pacing: string; note: string }, i: number) => (
              <div key={i} className="bg-white/60 rounded px-2.5 py-2 flex-1 min-w-[120px]">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-xs font-medium text-gray-700">{ACT_LABEL[r.act] || r.act}</span>
                  <span className={`text-[10px] px-1 py-0.5 rounded ${r.pacing === 'fast' ? 'bg-red-100 text-red-600' : r.pacing === 'slow' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
                    {PACING_LABEL[r.pacing] || r.pacing}
                  </span>
                </div>
                <div className="text-[10px] text-gray-500">P{r.shotRange?.[0]}-P{r.shotRange?.[1]}</div>
                <div className="text-[10px] text-gray-600 mt-0.5">{r.note}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 场景意图 */}
      {Array.isArray(plan.sceneIntents) && plan.sceneIntents.length > 0 && (
        <div className="bg-rose-50/50 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-rose-700 mb-2">逐场景情绪意图</h4>
          <div className="space-y-2">
            {plan.sceneIntents.map((s: { sceneId: string; directorNote: string; audienceDistance: string }) => (
              <div key={s.sceneId} className="bg-white/60 rounded px-3 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-gray-400">{s.sceneId}</span>
                  <span className="text-[10px] bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded">{s.audienceDistance}</span>
                </div>
                <div className="text-xs text-gray-700">{s.directorNote}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 声音设计 */}
      {plan.soundDesign && (
        <div className="bg-indigo-50/50 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-indigo-700 mb-2">声音与音乐方向</h4>
          <div className="space-y-1.5">
            <div><span className="text-xs text-gray-500">BGM：</span><span className="text-xs text-gray-700">{plan.soundDesign.bgmDirection}</span></div>
            {Array.isArray(plan.soundDesign.keyEffects) && plan.soundDesign.keyEffects.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-xs text-gray-500">音效：</span>
                {plan.soundDesign.keyEffects.map((e: string, i: number) => (
                  <span key={i} className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">{e}</span>
                ))}
              </div>
            )}
            {plan.soundDesign.silenceUsage && (
              <div><span className="text-xs text-gray-500">静默：</span><span className="text-xs text-gray-700">{plan.soundDesign.silenceUsage}</span></div>
            )}
          </div>
        </div>
      )}

      {/* 转折点与转场 */}
      {(Array.isArray(plan.turningPoints) && plan.turningPoints.length > 0) || (Array.isArray(plan.transitions) && plan.transitions.length > 0) ? (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-gray-700 mb-2">转折点与转场</h4>
          {Array.isArray(plan.turningPoints) && plan.turningPoints.length > 0 && (
            <div className="space-y-1 mb-3">
              {plan.turningPoints.map((t: { afterShot: number; type: string; description: string }, i: number) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded text-[10px] shrink-0">P{t.afterShot}后</span>
                  <span className="text-[10px] bg-gray-100 text-gray-500 px-1 py-0.5 rounded shrink-0">{TYPE_LABEL[t.type] || t.type}</span>
                  <span className="text-gray-700">{t.description}</span>
                </div>
              ))}
            </div>
          )}
          {Array.isArray(plan.transitions) && plan.transitions.length > 0 && (
            <div className="space-y-1">
              {plan.transitions.map((t: { fromScene: string; toScene: string; method: string; emotionBridge: string }, i: number) => (
                <div key={i} className="text-xs text-gray-600">
                  <span className="text-gray-800">{t.fromScene}</span>
                  <span className="mx-1">→</span>
                  <span className="text-gray-800">{t.toScene}</span>
                  <span className="mx-1.5 text-gray-400">|</span>
                  <span>{t.method}</span>
                  <span className="mx-1.5 text-gray-400">|</span>
                  <span className="text-gray-500">{t.emotionBridge}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function shotTypeClass(type: string): string {
  const base = 'text-[10px] px-1.5 py-0.5 rounded font-medium';
  if (type === '大远景' || type === '远景') return `${base} bg-sky-100 text-sky-700`;
  if (type === '全景') return `${base} bg-cyan-100 text-cyan-700`;
  if (type === '中景') return `${base} bg-green-100 text-green-700`;
  if (type === '近景') return `${base} bg-amber-100 text-amber-700`;
  if (type === '特写' || type === '大特写') return `${base} bg-rose-100 text-rose-700`;
  return `${base} bg-gray-100 text-gray-600`;
}

/** C2 分镜表 — 结构化分镜卡片渲染 */
function StoryboardTableContent({ encodedName, episode }: { encodedName: string; episode: number }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/projects/${encodedName}/seedance/${episode}/storyboard-table`)
      .then(res => res.ok ? res.json() : { data: null })
      .then(data => setPlan(data.data))
      .catch(() => setPlan(null))
      .finally(() => setLoading(false));
  }, [encodedName, episode]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-4 bg-gray-100 rounded" style={{ width: `${60 + (i * 12) % 35}%` }} />
        ))}
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="py-8 text-center text-gray-400 text-sm">
        分镜表尚未生成，请在右侧聊天框输入「分镜表」开始
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = Array.isArray(plan.rows) ? plan.rows : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm text-gray-600 bg-gray-50 rounded-lg px-4 py-2.5 mb-4">
        <span>{plan.episode}</span>
        <span className="text-gray-300">|</span>
        <span>共 {rows.length} 镜</span>
        <span className="text-gray-300">|</span>
        <span>总时长 {formatDuration(plan.totalDuration)}</span>
      </div>

      {rows.map((row: { seq: number; shotType: string; duration: number; trackId: string; scene: string; description: string; action: string; dialogue?: string; emotion: string; lighting: string; soundEffect: string; cameraMove: string; assetIds?: string[] }) => (
        <div key={row.seq} className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
            <span className="text-xs font-mono bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">P{row.seq}</span>
            <span className={shotTypeClass(row.shotType)}>{row.shotType}</span>
            <span className="text-xs text-gray-500">{row.duration}s</span>
            <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded ml-auto">Track {row.trackId}</span>
          </div>
          <div className="px-3 py-2.5 space-y-1.5">
            <div className="text-[10px] text-gray-400">{row.scene}</div>
            <div className="text-sm text-gray-800">{row.description}</div>
            <div className="text-xs text-gray-600">{row.action}</div>
            {row.dialogue && row.dialogue !== '无台词' && (
              <div className="text-xs text-purple-700 bg-purple-50 rounded px-2.5 py-1.5 border-l-2 border-purple-300">
                {row.dialogue}
              </div>
            )}
            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer text-gray-400 hover:text-gray-600">详情</summary>
              <div className="mt-1.5 space-y-1 pl-2 border-l border-gray-100">
                <div><span className="text-gray-400">情绪：</span>{row.emotion}</div>
                <div><span className="text-gray-400">光影：</span>{row.lighting}</div>
                <div><span className="text-gray-400">音效：</span>{row.soundEffect}</div>
                <div><span className="text-gray-400">运镜：</span>{row.cameraMove}</div>
              </div>
            </details>
            {Array.isArray(row.assetIds) && row.assetIds.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {row.assetIds.map((id: string) => (
                  <span key={id} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{id}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {Array.isArray(plan._validationLog) && plan._validationLog.length > 0 && (
        <details className="bg-amber-50 rounded-lg p-3 mt-4">
          <summary className="text-xs font-medium text-amber-700 cursor-pointer">校验日志（{plan._validationLog.length} 项）</summary>
          <div className="mt-2 space-y-1">
            {plan._validationLog.map((log: { rule: string; seq: number; issue: string; action: string }, i: number) => (
              <div key={i} className="text-xs text-amber-800">
                <span className="font-mono bg-amber-100 px-1 rounded">{log.action}</span>
                <span className="mx-1">P{log.seq}</span>
                <span className="text-amber-600">[{log.rule}]</span>
                <span className="ml-1">{log.issue}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/** 占位内容 — 即将上线 */
function ComingSoonContent({ label }: { label: string }) {
  return (
    <div className="py-12 text-center">
      <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-xs text-gray-300 mt-1">该功能即将上线</p>
    </div>
  );
}

const NODE_TITLES: Record<NodeId, string> = {
  A: 'A 导演分析',
  B: 'B 资产管理',
  C1: 'C1 导演规划',
  C2: 'C2 分镜表',
  C3: 'C3 提示词',
  D: 'D 视频',
};

export default function NodeDetailPanel({ nodeId, encodedName, episode, onClose, promptsStatus, nodeStatus }: NodeDetailPanelProps) {
  // nodeStatus 变为 completed 时递增 refreshKey，触发内容组件重新拉取
  const [refreshKey, setRefreshKey] = useState(0);
  const prevNodeStatus = React.useRef(nodeStatus);
  useEffect(() => {
    if (nodeStatus === 'completed' && prevNodeStatus.current !== 'completed') {
      setRefreshKey(k => k + 1);
    }
    prevNodeStatus.current = nodeStatus;
  }, [nodeStatus]);

  // 也监听 promptsStatus（为 C3 提供额外的刷新触发）
  const prevPromptsStatus = React.useRef(promptsStatus);
  useEffect(() => {
    if (promptsStatus === 'completed' && prevPromptsStatus.current !== 'completed') {
      setRefreshKey(k => k + 1);
    }
    prevPromptsStatus.current = promptsStatus;
  }, [promptsStatus]);

  // 状态提示配置
  const pendingHints: Record<NodeId, { title: string; description: string }> = {
    A: { title: '导演分析尚未开始', description: '请在右侧输入「开始导演分析」或点击「开始导演分析」按钮' },
    B: { title: '资产尚未生成', description: '请先完成导演分析(A)，然后前往「塑造」Tab 生成资产图片' },
    C1: { title: '导演规划尚未生成', description: '请在右侧输入「导演规划」开始' },
    C2: { title: '分镜表尚未构建', description: '请在右侧输入「分镜表」开始' },
    C3: { title: '提示词尚未生成', description: '请先完成分镜表(C2)，然后输入「提示词」开始' },
    D: { title: '视频尚未生成', description: '请先完成提示词(C3)，然后开始视频生成' },
  };

  const runningHints: Record<NodeId, string> = {
    A: '导演分析进行中...', B: '资产生成中...', C1: '导演规划进行中...',
    C2: '分镜表构建中...', C3: '提示词生成中...', D: '视频生成中...',
  };

  function renderContent() {
    // running 状态：显示进度提示（完成后自动刷新）
    if (nodeStatus === 'running') {
      return <StatusHint icon="running" title={runningHints[nodeId]} description="完成后将自动刷新显示内容" />;
    }

    // pending 状态：显示引导提示（B 资产管理除外——它的 pending 表示"资产存在但未生成图片"，应显示实际内容）
    if (nodeStatus === 'pending' && nodeId !== 'B') {
      const hint = pendingHints[nodeId];
      return <StatusHint icon="pending" title={hint.title} description={hint.description} />;
    }

    // completed / partial / B-pending 状态：显示实际内容
    switch (nodeId) {
      case 'A':
        return <DirectorContent encodedName={encodedName} episode={episode} />;
      case 'B':
        return <AssetsContent encodedName={encodedName} episode={episode} />;
      case 'C1':
        return <DirectorPlanContent encodedName={encodedName} episode={episode} />;
      case 'C2':
        return <StoryboardTableContent encodedName={encodedName} episode={episode} />;
      case 'C3':
        return <PromptsContent encodedName={encodedName} episode={episode} refreshKey={refreshKey} />;
      case 'D':
        return <ComingSoonContent label="视频生成" />;
      default:
        return null;
    }
  }

  return (
    <div className="border-t border-gray-200 bg-white rounded-b-xl flex flex-col h-full">
      {/* 标题栏 + 关闭按钮 */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700">{NODE_TITLES[nodeId]}</h3>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition"
          aria-label="关闭详情"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {renderContent()}
      </div>
    </div>
  );
}
