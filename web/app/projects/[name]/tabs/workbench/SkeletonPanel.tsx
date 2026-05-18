'use client';

import { useState, useEffect, useCallback } from 'react';
import { Pencil, Globe, Film, ChevronDown, ChevronRight } from 'lucide-react';
import MarkdownPreview from '@/app/components/MarkdownPreview';
import MarkdownEditorModal from '@/app/components/MarkdownEditorModal';

interface EpisodeItem {
  episode: number;
  filename: string;
}

interface SkeletonPanelProps {
  encodedName: string;
  onReload?: () => void;
  refreshTrigger?: number;
}

type ViewScope = 'combined' | 'global' | { episode: number };

export default function SkeletonPanel({ encodedName, onReload, refreshTrigger = 0 }: SkeletonPanelProps) {
  const [combinedContent, setCombinedContent] = useState('');
  const [globalContent, setGlobalContent] = useState('');
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [episodeContents, setEpisodeContents] = useState<Record<number, string>>({});
  const [hasLayered, setHasLayered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [viewScope, setViewScope] = useState<ViewScope>('combined');
  const [episodesExpanded, setEpisodesExpanded] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 同时请求：兼容的拼接内容 + 分层数据
      const [combinedRes, globalRes, listRes] = await Promise.all([
        fetch(`/api/projects/${encodedName}/skeleton`),
        fetch(`/api/projects/${encodedName}/skeleton?scope=global`),
        fetch(`/api/projects/${encodedName}/skeleton?scope=list`),
      ]);

      if (combinedRes.ok) {
        const data = await combinedRes.json();
        setCombinedContent(data.content || '');
      }

      let layered = false;
      if (globalRes.ok) {
        const data = await globalRes.json();
        setGlobalContent(data.content || '');
        if (data.content) layered = true;
      }

      if (listRes.ok) {
        const data = await listRes.json();
        const epList: EpisodeItem[] = data.episodes || [];
        setEpisodes(epList);
        if (epList.length > 0) layered = true;

        // 加载各集内容
        const contents: Record<number, string> = {};
        await Promise.all(
          epList.map(async (ep) => {
            try {
              const res = await fetch(`/api/projects/${encodedName}/skeleton?scope=episode&episode=${ep.episode}`);
              if (res.ok) {
                const d = await res.json();
                contents[ep.episode] = d.content || '';
              }
            } catch { /* ignore */ }
          })
        );
        setEpisodeContents(contents);
      }

      setHasLayered(layered);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [encodedName]);

  useEffect(() => { load(); }, [load, refreshTrigger]);

  const getCurrentContent = (): string => {
    if (viewScope === 'combined') return combinedContent;
    if (viewScope === 'global') return globalContent;
    return episodeContents[viewScope.episode] || '';
  };

  const getEditTitle = (): string => {
    if (viewScope === 'combined') return '编辑故事骨架';
    if (viewScope === 'global') return '编辑全局骨架';
    return `编辑第 ${(viewScope as { episode: number }).episode} 集骨架`;
  };

  const save = async (newContent: string) => {
    if (viewScope === 'combined') return;
    try {
      let body: Record<string, unknown>;

      if (viewScope === 'global') {
        body = { content: newContent, scope: 'global' };
      } else {
        body = { content: newContent, scope: 'episode', episode: (viewScope as { episode: number }).episode };
      }

      await fetch(`/api/projects/${encodedName}/skeleton`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // 更新本地状态
      if (viewScope === 'global') {
        setGlobalContent(newContent);
      } else {
        setEpisodeContents(prev => ({
          ...prev,
          [(viewScope as { episode: number }).episode]: newContent,
        }));
      }

      setEditing(false);
      onReload?.();
    } catch { /* ignore */ }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400 text-sm">加载中...</div>;
  }

  const content = getCurrentContent();
  const hasCombined = !!combinedContent;

  if (!hasCombined && !globalContent) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-gray-400 text-sm">故事骨架尚未生成</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 顶栏：视图切换 + 编辑按钮 */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        {hasLayered ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewScope('combined')}
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md transition ${
                viewScope === 'combined'
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setViewScope('global')}
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md transition ${
                viewScope === 'global'
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Globe size={12} />
              全局
            </button>
            {episodes.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setEpisodesExpanded(!episodesExpanded)}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md transition ${
                    typeof viewScope === 'object'
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Film size={12} />
                  分集
                  {typeof viewScope === 'object' && ` (EP${viewScope.episode})`}
                  {episodesExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                {episodesExpanded && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 min-w-[120px]">
                    {episodes.map((ep) => (
                      <button
                        key={ep.episode}
                        onClick={() => {
                          setViewScope({ episode: ep.episode });
                          setEpisodesExpanded(false);
                        }}
                        className={`w-full text-left text-xs px-3 py-1.5 hover:bg-gray-50 transition ${
                          typeof viewScope === 'object' && viewScope.episode === ep.episode
                            ? 'bg-blue-50 text-blue-700 font-medium'
                            : 'text-gray-600'
                        }`}
                      >
                        第 {ep.episode} 集
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div />
        )}

        {viewScope !== 'combined' ? (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 px-2.5 py-1.5 rounded-md transition"
          >
            <Pencil size={14} />
            编辑
          </button>
        ) : null}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto">
        {content ? (
          <MarkdownPreview content={content} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-gray-400 text-sm">
              {typeof viewScope === 'object' ? `第 ${viewScope.episode} 集骨架暂无内容` : '暂无内容'}
            </span>
          </div>
        )}
      </div>

      <MarkdownEditorModal
        isOpen={editing}
        initialContent={content}
        title={getEditTitle()}
        onSave={save}
        onCancel={() => setEditing(false)}
      />
    </div>
  );
}
