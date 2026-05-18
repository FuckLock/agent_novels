'use client';

import { useState, useEffect, useCallback } from 'react';
import MarkdownPreview from '@/app/components/MarkdownPreview';
import MarkdownEditorModal from '@/app/components/MarkdownEditorModal';
import { ProjectDetail, OutlineEpisode } from '../types';

type SubTab = 'storyline' | 'outline' | 'skeleton' | 'adaptation';

interface OutlineManageTabProps {
  project: ProjectDetail;
  encodedName: string;
  name: string;
  onReload: () => void;
}

export default function OutlineManageTab({ project, encodedName, onReload }: OutlineManageTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('storyline');

  const subTabs: { id: SubTab; label: string }[] = [
    { id: 'storyline', label: '故事线' },
    { id: 'outline', label: '大纲' },
    { id: 'skeleton', label: '故事骨架' },
    { id: 'adaptation', label: '改编策略' },
  ];

  return (
    <div className="h-[calc(100vh-140px)] flex bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* 左侧 AI 聊天面板 */}
      <div className="w-[35%] shrink-0 border-r border-gray-200 flex flex-col">
        {/* 顶部标题 */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 01-1.59.659H9.06a2.25 2.25 0 01-1.591-.659L5 14.5m14 0V5a2 2 0 00-2-2H7a2 2 0 00-2 2v9.5" />
            </svg>
          </div>
          <h2 className="text-sm font-medium text-gray-900">AI 助手</h2>
        </div>

        {/* 消息区 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5" />
              </svg>
            </div>
            <div className="bg-gray-50 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-700 max-w-[85%]">
              欢迎使用Toonflow！请选择小说后开始AI创作...
            </div>
          </div>
        </div>

        {/* 底部输入框 */}
        <div className="px-4 py-3 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="输入内容..."
              className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-400"
            />
            <button className="w-10 h-10 bg-purple-600 hover:bg-purple-700 rounded-full flex items-center justify-center transition shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-4 4m4-4l4 4" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* 右侧内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Sub-tab 切换条 */}
        <div className="px-6 border-b border-gray-100 flex gap-6">
          {subTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`py-3 text-sm font-medium border-b-2 transition ${
                activeSubTab === tab.id
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 子页内容 */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeSubTab === 'storyline' && (
            <StorylineSubTab encodedName={encodedName} storyline={project.storyline} onReload={onReload} />
          )}
          {activeSubTab === 'outline' && (
            <OutlineSubTab encodedName={encodedName} outline={project.outline} onReload={onReload} />
          )}
          {activeSubTab === 'skeleton' && (
            <MarkdownContentSubTab
              encodedName={encodedName}
              apiPath="skeleton"
              title="故事骨架"
              description="AI 生成的故事骨架结构"
              onReload={onReload}
            />
          )}
          {activeSubTab === 'adaptation' && (
            <MarkdownContentSubTab
              encodedName={encodedName}
              apiPath="adaptation"
              title="改编策略"
              description="AI 生成的改编策略方案"
              onReload={onReload}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ======================== 故事线子页 ======================== */

function StorylineSubTab({
  encodedName,
  storyline: initialStoryline,
  onReload,
}: {
  encodedName: string;
  storyline?: string;
  onReload: () => void;
}) {
  const [storyline, setStoryline] = useState(initialStoryline || '');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setStoryline(initialStoryline || '');
  }, [initialStoryline]);

  const fetchStoryline = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${encodedName}/storyline`);
      if (res.ok) {
        const data = await res.json();
        setStoryline(data.storyline || data.content || '');
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [encodedName]);

  useEffect(() => { fetchStoryline(); }, [fetchStoryline]);

  const handleSave = async (content: string) => {
    await fetch(`/api/projects/${encodedName}/storyline`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyline: content }),
    });
    setStoryline(content);
    setEditing(false);
    onReload();
  };

  return (
    <div>
      {/* 标题栏卡片 */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-500 rounded-xl p-5 mb-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">故事线管理</h3>
            <p className="text-purple-200 text-sm mt-1">管理和编辑项目的核心故事线</p>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition"
          >
            编辑故事线
          </button>
        </div>
      </div>

      {/* 内容区 */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">加载中...</div>
      ) : storyline ? (
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <MarkdownPreview content={storyline} />
        </div>
      ) : (
        <div className="text-center py-16 text-gray-400">暂无故事线内容</div>
      )}

      <MarkdownEditorModal
        isOpen={editing}
        initialContent={storyline}
        title="编辑故事线"
        onSave={handleSave}
        onCancel={() => setEditing(false)}
      />
    </div>
  );
}

/* ======================== 大纲子页 ======================== */

function OutlineSubTab({
  encodedName,
  outline: initialOutline,
  onReload,
}: {
  encodedName: string;
  outline?: OutlineEpisode[] | null;
  onReload: () => void;
}) {
  const [outlineData, setOutlineData] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [activeEpisode, setActiveEpisode] = useState(0);

  const episodes = initialOutline || [];

  const fetchOutline = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${encodedName}/outline`);
      if (res.ok) {
        const data = await res.json();
        // outline API 可能返回 markdown content 或结构化数据
        if (typeof data.content === 'string') {
          setOutlineData(data.content);
        } else if (data.outline) {
          // 结构化大纲 -> 转为 markdown 展示
          setOutlineData(formatOutlineToMarkdown(data.outline, activeEpisode));
        }
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [encodedName, activeEpisode]);

  useEffect(() => { fetchOutline(); }, [fetchOutline]);

  const handleSave = async (content: string) => {
    await fetch(`/api/projects/${encodedName}/outline`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    setOutlineData(content);
    setEditing(false);
    onReload();
  };

  return (
    <div>
      {/* 集数 Tab（多集时显示） */}
      {episodes.length > 1 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {episodes.map((ep, idx) => (
            <button
              key={idx}
              onClick={() => setActiveEpisode(idx)}
              className={`px-3 py-1.5 text-sm rounded-lg transition ${
                activeEpisode === idx
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              第{idx + 1}集
            </button>
          ))}
        </div>
      )}

      {/* 编辑按钮 */}
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-50 rounded-md transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          编辑大纲
        </button>
      </div>

      {/* 内容 */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">加载中...</div>
      ) : outlineData ? (
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <MarkdownPreview content={outlineData} />
        </div>
      ) : (
        <div className="text-center py-16 text-gray-400">暂无大纲内容</div>
      )}

      <MarkdownEditorModal
        isOpen={editing}
        initialContent={outlineData}
        title={episodes.length > 1 ? `编辑第${activeEpisode + 1}集大纲` : '编辑大纲'}
        onSave={handleSave}
        onCancel={() => setEditing(false)}
      />
    </div>
  );
}

function formatOutlineToMarkdown(outline: OutlineEpisode[], episodeIdx: number): string {
  const ep = outline[episodeIdx];
  if (!ep) return '';

  const lines: string[] = [];
  lines.push(`# 第${ep.episodeIndex}集 ${ep.title || ''}`);
  if (ep.outline) { lines.push('', ep.outline); }
  if (ep.coreConflict) { lines.push('', `## 核心冲突`, ep.coreConflict); }
  if (ep.openingHook) { lines.push('', `## 开场钩子`, ep.openingHook); }
  if (ep.keyEvents?.length) { lines.push('', `## 关键事件`, ...ep.keyEvents.map(e => `- ${e}`)); }
  if (ep.emotionalCurve) { lines.push('', `## 情感曲线`, ep.emotionalCurve); }
  if (ep.endingHook) { lines.push('', `## 结尾钩子`, ep.endingHook); }
  return lines.join('\n');
}

/* ======================== 通用 Markdown 内容子页（骨架/策略） ======================== */

function MarkdownContentSubTab({
  encodedName,
  apiPath,
  title,
  description,
  onReload,
}: {
  encodedName: string;
  apiPath: string;
  title: string;
  description: string;
  onReload: () => void;
}) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${encodedName}/${apiPath}`);
      if (res.ok) {
        const data = await res.json();
        setContent(data.content || '');
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [encodedName, apiPath]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (newContent: string) => {
    await fetch(`/api/projects/${encodedName}/${apiPath}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newContent }),
    });
    setContent(newContent);
    setEditing(false);
    onReload();
  };

  return (
    <div>
      {/* 编辑按钮 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mt-0.5">{description}</p>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-50 rounded-md transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          编辑
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">加载中...</div>
      ) : content ? (
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <MarkdownPreview content={content} />
        </div>
      ) : (
        <div className="text-center py-16 text-gray-400">暂无{title}内容</div>
      )}

      <MarkdownEditorModal
        isOpen={editing}
        initialContent={content}
        title={`编辑${title}`}
        onSave={handleSave}
        onCancel={() => setEditing(false)}
      />
    </div>
  );
}
