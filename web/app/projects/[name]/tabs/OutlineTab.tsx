'use client';
import { useState, useEffect, useCallback } from 'react';
import Modal from '@/app/components/Modal';
import ReviewPanel from '@/app/components/ReviewPanel';
import { ReviewResult } from '@/app/lib/novels';
import { OutlineEpisode, ProjectDetail, getItemName, EDIT_BTN } from '../types';

interface OutlineTabProps {
  project: ProjectDetail;
  encodedName: string;
  name: string;
  onReload: () => void;
}

export default function OutlineTab({ project, encodedName, onReload }: OutlineTabProps) {
  // 右侧 Tab 切换：故事线 / 大纲
  const [activeTab, setActiveTab] = useState<'storyline' | 'outline'>('storyline');

  // 故事线 - 内联编辑
  const [editingStoryline, setEditingStoryline] = useState(false);
  const [storylineDraft, setStorylineDraft] = useState('');

  // 大纲 - Modal 编辑（结构化）
  const [showOutlineModal, setShowOutlineModal] = useState(false);
  const [outlineEditIndex, setOutlineEditIndex] = useState(-1);
  const [outlineEditDraft, setOutlineEditDraft] = useState<OutlineEpisode>({
    episodeIndex: 1, title: '', outline: '', chapterRange: [], scenes: [], characters: [], props: [],
    coreConflict: '', openingHook: '', keyEvents: [], emotionalCurve: '', visualHighlights: [], endingHook: '', classicQuotes: [],
  });
  const [showDeleteWholeOutline, setShowDeleteWholeOutline] = useState(false);
  const [showDeleteEpisode, setShowDeleteEpisode] = useState(false);
  // 每个资产字段独立输入状态，避免切换时丢失输入
  const [sceneInput, setSceneInput] = useState('');
  const [characterInput, setCharacterInput] = useState('');
  const [propInput, setPropInput] = useState('');

  const outline = project.outline;

  // ========== 审核状态 ==========
  const [reviews, setReviews] = useState<Record<string, ReviewResult>>({});
  const [reviewLoading, setReviewLoading] = useState<string | null>(null);

  const loadReviews = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${encodedName}/reviews`);
      if (!res.ok) return;
      const data: ReviewResult[] = await res.json();
      const map: Record<string, ReviewResult> = {};
      for (const r of data) {
        const key = r.episode !== undefined ? `${r.type}-${r.episode}` : r.type;
        map[key] = r;
      }
      setReviews(map);
    } catch { /* ignore */ }
  }, [encodedName]);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  const triggerReview = async (type: 'storyline' | 'outline' | 'script', episode?: number) => {
    const key = episode !== undefined ? `${type}-${episode}` : type;
    setReviewLoading(key);
    try {
      const res = await fetch(`/api/projects/${encodedName}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, episode }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || '审核失败');
        return;
      }
      const result: ReviewResult = await res.json();
      setReviews(prev => ({ ...prev, [key]: result }));
    } catch {
      alert('审核请求失败');
    } finally {
      setReviewLoading(null);
    }
  };

  // ========== 故事线：保存 ==========
  const saveStoryline = async () => {
    await fetch(`/api/projects/${encodedName}/storyline`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyline: storylineDraft }),
    });
    setEditingStoryline(false);
    onReload();
  };

  // ========== 大纲：保存（Modal - 结构化） ==========
  const saveOutline = async () => {
    const currentOutline = outline || [];
    const updated = [...currentOutline];
    if (outlineEditIndex >= 0 && outlineEditIndex < updated.length) {
      updated[outlineEditIndex] = outlineEditDraft;
    }
    await fetch(`/api/projects/${encodedName}/outline`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: updated }),
    });
    setShowOutlineModal(false);
    onReload();
  };

  // ========== 大纲：删除全部 ==========
  const confirmDeleteWholeOutline = async () => {
    await fetch(`/api/projects/${encodedName}/outline`, { method: 'DELETE' });
    setShowDeleteWholeOutline(false);
    onReload();
  };

  // ========== 大纲：删除单集 ==========
  const confirmDeleteEpisode = async () => {
    const currentOutline = outline || [];
    const updated = currentOutline.filter((_, i) => i !== outlineEditIndex);
    await fetch(`/api/projects/${encodedName}/outline`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: updated }),
    });
    setShowDeleteEpisode(false);
    onReload();
  };

  return (
    <>
      <div className="grid gap-5 w-full" style={{ gridTemplateColumns: '2fr 3fr', height: 'calc(100vh - 140px)' }}>
        {/* 左侧：AI 助手占位 */}
        <div className="bg-white rounded-xl p-5 shadow-sm flex flex-col overflow-hidden">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </span>
            助手
          </h3>
          <div className="flex-1 flex flex-col text-gray-400 overflow-y-auto px-1">
            {/* 气泡欢迎语 */}
            <div className="flex gap-2 mb-3 mt-2">
              <span className="w-7 h-7 rounded-full bg-purple-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
              </span>
              <div className="bg-gray-50 rounded-lg rounded-tl-none px-3 py-2 text-xs text-gray-600 max-w-[85%]">
                欢迎使用 Toonflow！请选择小说后开始 AI 对话来生成小说故事线与大纲。如您需要我开始为您工作，您可以跟我说「开始」。
              </div>
            </div>
          </div>
          {/* 底部输入框占位 */}
          <div className="mt-auto pt-3 border-t border-gray-100">
            <div className="flex gap-2">
              <input disabled placeholder="输入消息..." className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 cursor-not-allowed" />
              <button disabled className="w-9 h-9 rounded-full bg-purple-300 text-white flex items-center justify-center cursor-not-allowed flex-shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* 右侧：Tab 切换（故事线 / 大纲） */}
        <div className="flex flex-col h-full overflow-hidden">
          {/* Tab 栏 */}
          <div className="flex gap-1 mb-3">
            <button
              onClick={() => setActiveTab('storyline')}
              className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${activeTab === 'storyline' ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >故事线</button>
            <button
              onClick={() => setActiveTab('outline')}
              className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${activeTab === 'outline' ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >大纲</button>
          </div>

          {/* ===== 故事线区域（Tab 切换显示） ===== */}
          {activeTab === 'storyline' && (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
              <div className="bg-gradient-to-r from-purple-600 to-purple-400 px-5 py-2 flex justify-between items-center flex-shrink-0">
                <div>
                  <h3 className="font-semibold text-white text-sm">{editingStoryline ? '编辑故事线' : '故事线'}</h3>
                  <p className="text-purple-100 text-xs mt-0.5">{editingStoryline ? '支持多行输入，提交完整的故事线脚本' : '根据上传的小说原文生成大纲和故事线'}</p>
                </div>
                {!editingStoryline ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => triggerReview('storyline')}
                      disabled={reviewLoading === 'storyline' || !project.storyline}
                      className="flex items-center gap-1 text-sm text-white/80 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      审核
                    </button>
                    {reviews['storyline'] && (
                      <ReviewPanel review={reviews['storyline']} onReview={() => triggerReview('storyline')} compact />
                    )}
                    <button
                      onClick={() => { setStorylineDraft(project.storyline || ''); setEditingStoryline(true); }}
                      className="flex items-center gap-1 text-sm text-white/80 hover:text-white"
                    >
                      {EDIT_BTN}编辑
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingStoryline(false)}
                    className="text-sm text-white/80 hover:text-white"
                  >
                    预览模式
                  </button>
                )}
              </div>
              <div className="p-5 overflow-y-auto flex-1">
              {editingStoryline ? (
                <>
                  <div className="relative">
                    <textarea
                      value={storylineDraft}
                      onChange={(e) => { if (e.target.value.length <= 5000) setStorylineDraft(e.target.value); }}
                      rows={14}
                      className="w-full px-3 py-2 border border-purple-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 bg-gray-50"
                    />
                    <span className="absolute bottom-2 right-3 text-xs text-gray-400">{storylineDraft.length}/5000</span>
                  </div>
                  <div className="flex justify-end gap-2 mt-3">
                    <button onClick={() => setEditingStoryline(false)} className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">取消</button>
                    <button onClick={saveStoryline} className="px-4 py-1.5 text-sm bg-gradient-to-r from-purple-600 to-purple-500 text-white rounded-lg hover:from-purple-700 hover:to-purple-600 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      保存
                    </button>
                  </div>
                </>
              ) : (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                    故事线内容
                  </h4>
                  <div className="text-sm text-gray-600 whitespace-pre-wrap">{project.storyline || '暂无故事线'}</div>
                  {/* 审核结果面板 */}
                  {(reviewLoading === 'storyline' || reviews['storyline']) && (
                    <div className="mt-4">
                      <ReviewPanel
                        review={reviews['storyline'] || null}
                        loading={reviewLoading === 'storyline'}
                        onReview={() => triggerReview('storyline')}
                      />
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>
          )}

          {/* ===== 大纲区域（Tab 切换显示） ===== */}
          {activeTab === 'outline' && (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
              <div className="bg-gradient-to-r from-purple-600 to-purple-400 px-5 py-3 flex justify-between items-center">
                <div>
                  <h3 className="font-semibold text-white">大纲管理</h3>
                  <p className="text-purple-100 text-xs mt-0.5">每一集的详细内容</p>
                </div>
                <div className="flex gap-2">
                  {outline && (
                    <button
                      onClick={() => setShowDeleteWholeOutline(true)}
                      className="flex items-center gap-1 text-sm text-white/70 hover:text-white"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      删除
                    </button>
                  )}
                  <button
                    disabled
                    className="text-sm text-white/40 cursor-not-allowed"
                    title="功能开发中"
                  >
                    + 新建大纲
                  </button>
                </div>
              </div>
              <div className="p-5 overflow-y-auto flex-1">
              {outline && Array.isArray(outline) ? (
                <div className="space-y-4">
                  {outline.map((ep, i) => (
                    <div key={i} className="rounded-lg overflow-hidden border border-gray-100">
                      {/* 集标题条 */}
                      <div className="bg-gradient-to-r from-purple-600 to-purple-400 px-4 py-2 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="bg-white/90 text-purple-700 text-xs font-bold px-2 py-0.5 rounded">第{ep.episodeIndex}集</span>
                          <span className="text-white font-semibold text-sm">{ep.title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {reviews[`outline-${ep.episodeIndex}`] && (
                            <ReviewPanel review={reviews[`outline-${ep.episodeIndex}`]} onReview={() => triggerReview('outline', ep.episodeIndex)} compact />
                          )}
                          <button
                            onClick={() => triggerReview('outline', ep.episodeIndex)}
                            disabled={reviewLoading === `outline-${ep.episodeIndex}`}
                            className="text-white/80 hover:text-white disabled:opacity-40"
                            title="审核此集"
                          >
                            {reviewLoading === `outline-${ep.episodeIndex}` ? (
                              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            )}
                          </button>
                          <button
                            onClick={() => { setOutlineEditIndex(i); setOutlineEditDraft({ ...ep }); setShowOutlineModal(true); }}
                            className="text-white/80 hover:text-white"
                            title="编辑"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => { setOutlineEditIndex(i); setShowDeleteEpisode(true); }}
                            className="text-white/60 hover:text-white"
                            title="删除此集"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div className="p-3 bg-gray-50 space-y-2">
                        {/* 章节范围 */}
                        {ep.chapterRange && ep.chapterRange.length > 0 && (
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-gray-400 w-12 flex-shrink-0 pt-0.5">章节范围</span>
                            <div className="flex flex-wrap gap-1">
                              {ep.chapterRange.map((ch, chi) => (
                                <span key={chi} className="inline-block px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">第{ch}章</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* 场景 */}
                        {ep.scenes && ep.scenes.length > 0 && (
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-gray-400 w-12 flex-shrink-0 pt-0.5">场景</span>
                            <div className="flex flex-wrap gap-1">
                              {ep.scenes.map((s, si) => (
                                <span key={si} className="inline-block px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">{getItemName(s)}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* 角色 */}
                        {ep.characters && ep.characters.length > 0 && (
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-gray-400 w-12 flex-shrink-0 pt-0.5">角色</span>
                            <div className="flex flex-wrap gap-1">
                              {ep.characters.map((c, ci) => (
                                <span key={ci} className="inline-block px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">{getItemName(c)}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* 道具 */}
                        {ep.props && ep.props.length > 0 && (
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-gray-400 w-12 flex-shrink-0 pt-0.5">道具</span>
                            <div className="flex flex-wrap gap-1">
                              {ep.props.map((p, pi) => (
                                <span key={pi} className="inline-block px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded">{getItemName(p)}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* 核心冲突 */}
                        {ep.coreConflict && (
                          <div className="bg-orange-50 px-2 py-1 rounded flex items-start gap-2">
                            <span className="text-xs text-gray-400 w-12 flex-shrink-0 pt-0.5">核心冲突</span>
                            <span className="text-xs text-orange-700 font-medium">{ep.coreConflict}</span>
                          </div>
                        )}
                        {/* 黄金3秒 / 开篇钩子 */}
                        {ep.openingHook && (
                          <div className="bg-yellow-50 px-2 py-1 rounded flex items-start gap-2">
                            <span className="text-xs text-gray-400 w-12 flex-shrink-0 pt-0.5">黄金3秒</span>
                            <span className="text-xs text-yellow-700 font-medium">{ep.openingHook}</span>
                          </div>
                        )}
                        {/* 剧情主干 */}
                        {ep.outline && (
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-gray-400 w-12 flex-shrink-0 pt-0.5">剧情主干</span>
                            <span className="text-xs text-gray-600">{ep.outline.substring(0, 400)}{ep.outline.length > 400 ? '...' : ''}</span>
                          </div>
                        )}
                        {/* 关键节点 */}
                        {ep.keyEvents && ep.keyEvents.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-xs text-gray-400">关键节点</span>
                            {ep.keyEvents.map((k, ki) => {
                              const bgColors = ['bg-red-50', 'bg-yellow-50', 'bg-blue-50', 'bg-green-50'];
                              const textColors = ['text-red-700', 'text-yellow-700', 'text-blue-700', 'text-green-700'];
                              const badgeColors = ['bg-red-200 text-red-800', 'bg-yellow-200 text-yellow-800', 'bg-blue-200 text-blue-800', 'bg-green-200 text-green-800'];
                              const labels = ['起', '承', '转', '合'];
                              return (
                                <div key={ki} className={`${bgColors[ki] || bgColors[0]} px-2 py-1 rounded flex items-start gap-2`}>
                                  <span className={`inline-block px-1.5 py-0.5 text-xs rounded font-bold flex-shrink-0 ${badgeColors[ki] || badgeColors[0]}`}>{labels[ki] || ''}</span>
                                  <span className={`text-xs ${textColors[ki] || textColors[0]}`}>{k}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {/* 情绪曲线 */}
                        {ep.emotionalCurve && (
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-gray-400 w-12 flex-shrink-0 pt-0.5">情绪曲线</span>
                            <span className="text-xs text-gray-600">{ep.emotionalCurve}</span>
                          </div>
                        )}
                        {/* 视觉重点 */}
                        {ep.visualHighlights && ep.visualHighlights.length > 0 && (
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-gray-400 w-12 flex-shrink-0 pt-0.5">视觉重点</span>
                            <div className="flex flex-wrap gap-1">
                              {ep.visualHighlights.map((v, vi) => (
                                <span key={vi} className="inline-block px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">{v}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* 结尾悬念 */}
                        {ep.endingHook && (
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-gray-400 w-12 flex-shrink-0 pt-0.5">结尾悬念</span>
                            <span className="text-xs text-gray-600">{ep.endingHook}</span>
                          </div>
                        )}
                        {/* 金句 */}
                        {ep.classicQuotes && ep.classicQuotes.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-xs text-gray-400">金句</span>
                            {ep.classicQuotes.map((q, qi) => (
                              <div key={qi} className="bg-purple-50 px-2 py-1 rounded">
                                <span className="text-xs text-purple-700 font-medium">&ldquo;{q}&rdquo;</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div className="text-sm text-gray-400">暂无大纲</div>}
              </div>
            </div>
          )}
        </div>{/* 关闭右侧容器 */}
      </div>

      {/* ==================== 弹框：编辑大纲（结构化表单） ==================== */}
      {showOutlineModal && (
        <Modal isOpen={true} onClose={() => setShowOutlineModal(false)} title={`编辑大纲 - 第${outlineEditDraft.episodeIndex}集`}>
          <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
            {/* 基础信息 */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 pb-1 border-b flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-500"></span>基础信息
              </h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">集数</label>
                  <input type="number" value={outlineEditDraft.episodeIndex} onChange={(e) => setOutlineEditDraft({ ...outlineEditDraft, episodeIndex: parseInt(e.target.value) || 1 })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-400 mb-1 block">标题</label>
                  <input type="text" value={outlineEditDraft.title} onChange={(e) => setOutlineEditDraft({ ...outlineEditDraft, title: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
              </div>
              <div className="mt-3">
                <label className="text-xs text-gray-400 mb-1 block">章节范围</label>
                <div className="flex flex-wrap gap-1.5 items-center min-h-[36px] px-3 py-1.5 border border-gray-200 rounded-lg bg-gray-50">
                  {(outlineEditDraft.chapterRange || []).map((ch, ci) => (
                    <span key={ci} className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                      第{ch}章
                      <button onClick={() => setOutlineEditDraft({ ...outlineEditDraft, chapterRange: (outlineEditDraft.chapterRange || []).filter((_, idx) => idx !== ci) })} className="text-purple-400 hover:text-purple-700 ml-0.5">&times;</button>
                    </span>
                  ))}
                  <input
                    type="number"
                    placeholder="+ 添加章节"
                    className="w-20 px-1 py-0.5 text-xs bg-transparent border-none outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = parseInt((e.target as HTMLInputElement).value);
                        if (!isNaN(val) && !(outlineEditDraft.chapterRange || []).includes(val)) {
                          setOutlineEditDraft({ ...outlineEditDraft, chapterRange: [...(outlineEditDraft.chapterRange || []), val].sort((a, b) => a - b) });
                          (e.target as HTMLInputElement).value = '';
                        }
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            {/* 资产关联 */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 pb-1 border-b flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-500"></span>资产关联
              </h4>
              <div className="grid grid-cols-3 gap-3">
                {/* 场景 Tag 列表 */}
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">场景</label>
                  <div className="flex flex-wrap gap-1 min-h-[60px] p-2 border border-gray-200 rounded-lg bg-gray-50">
                    {(outlineEditDraft.scenes || []).map((s, si) => (
                      <span key={si} className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                        {getItemName(s)}
                        <button onClick={() => setOutlineEditDraft({ ...outlineEditDraft, scenes: (outlineEditDraft.scenes || []).filter((_, idx) => idx !== si) })} className="text-purple-400 hover:text-purple-700 ml-0.5">&times;</button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-1 flex gap-1">
                    <input
                      type="text"
                      placeholder="场景名"
                      value={sceneInput}
                      onChange={(e) => setSceneInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && sceneInput.trim()) {
                          setOutlineEditDraft({ ...outlineEditDraft, scenes: [...(outlineEditDraft.scenes || []), { name: sceneInput.trim() }] });
                          setSceneInput('');
                        }
                      }}
                      className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded bg-white"
                    />
                    <button
                      onClick={() => { if (sceneInput.trim()) { setOutlineEditDraft({ ...outlineEditDraft, scenes: [...(outlineEditDraft.scenes || []), { name: sceneInput.trim() }] }); setSceneInput(''); } }}
                      className="px-2 py-1 text-xs text-purple-600 hover:bg-purple-50 rounded"
                    >+ 添加</button>
                  </div>
                </div>
                {/* 角色 Tag 列表 */}
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">角色</label>
                  <div className="flex flex-wrap gap-1 min-h-[60px] p-2 border border-gray-200 rounded-lg bg-gray-50">
                    {(outlineEditDraft.characters || []).map((c, ci) => (
                      <span key={ci} className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                        {getItemName(c)}
                        <button onClick={() => setOutlineEditDraft({ ...outlineEditDraft, characters: (outlineEditDraft.characters || []).filter((_, idx) => idx !== ci) })} className="text-blue-400 hover:text-blue-700 ml-0.5">&times;</button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-1 flex gap-1">
                    <input
                      type="text"
                      placeholder="角色名"
                      value={characterInput}
                      onChange={(e) => setCharacterInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && characterInput.trim()) {
                          setOutlineEditDraft({ ...outlineEditDraft, characters: [...(outlineEditDraft.characters || []), { name: characterInput.trim() }] });
                          setCharacterInput('');
                        }
                      }}
                      className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded bg-white"
                    />
                    <button
                      onClick={() => { if (characterInput.trim()) { setOutlineEditDraft({ ...outlineEditDraft, characters: [...(outlineEditDraft.characters || []), { name: characterInput.trim() }] }); setCharacterInput(''); } }}
                      className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                    >+ 添加</button>
                  </div>
                </div>
                {/* 道具 Tag 列表 */}
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">道具</label>
                  <div className="flex flex-wrap gap-1 min-h-[60px] p-2 border border-gray-200 rounded-lg bg-gray-50">
                    {(outlineEditDraft.props || []).map((p, pi) => (
                      <span key={pi} className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                        {getItemName(p)}
                        <button onClick={() => setOutlineEditDraft({ ...outlineEditDraft, props: (outlineEditDraft.props || []).filter((_, idx) => idx !== pi) })} className="text-green-400 hover:text-green-700 ml-0.5">&times;</button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-1 flex gap-1">
                    <input
                      type="text"
                      placeholder="道具名"
                      value={propInput}
                      onChange={(e) => setPropInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && propInput.trim()) {
                          setOutlineEditDraft({ ...outlineEditDraft, props: [...(outlineEditDraft.props || []), { name: propInput.trim() }] });
                          setPropInput('');
                        }
                      }}
                      className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded bg-white"
                    />
                    <button
                      onClick={() => { if (propInput.trim()) { setOutlineEditDraft({ ...outlineEditDraft, props: [...(outlineEditDraft.props || []), { name: propInput.trim() }] }); setPropInput(''); } }}
                      className="px-2 py-1 text-xs text-green-600 hover:bg-green-50 rounded"
                    >+ 添加</button>
                  </div>
                </div>
              </div>
            </div>

            {/* 剧情设计 */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 pb-1 border-b flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-500"></span>剧情设计
              </h4>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">黄金3秒 / 开篇钩子</label>
                    <input type="text" value={outlineEditDraft.openingHook || ''} onChange={(e) => setOutlineEditDraft({ ...outlineEditDraft, openingHook: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">结尾悬念</label>
                    <input type="text" value={outlineEditDraft.endingHook || ''} onChange={(e) => setOutlineEditDraft({ ...outlineEditDraft, endingHook: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-400" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">核心冲突</label>
                  <input type="text" value={outlineEditDraft.coreConflict || ''} onChange={(e) => setOutlineEditDraft({ ...outlineEditDraft, coreConflict: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">剧情主干</label>
                  <div className="relative">
                    <textarea value={outlineEditDraft.outline || ''} onChange={(e) => { if (e.target.value.length <= 1000) setOutlineEditDraft({ ...outlineEditDraft, outline: e.target.value }); }} rows={4} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    <span className="absolute bottom-2 right-3 text-xs text-gray-400">{(outlineEditDraft.outline || '').length}/1000</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">情绪曲线</label>
                  <input type="text" value={outlineEditDraft.emotionalCurve || ''} onChange={(e) => setOutlineEditDraft({ ...outlineEditDraft, emotionalCurve: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
              </div>
            </div>

            {/* 补充信息 */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 pb-1 border-b flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-500"></span>补充信息
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">关键节点（起/承/转/合）</label>
                  <div className="flex flex-wrap gap-1.5 min-h-[36px] px-3 py-1.5 border border-gray-200 rounded-lg bg-gray-50">
                    {(outlineEditDraft.keyEvents || []).map((k, ki) => {
                      const colors = ['bg-red-100 text-red-700 border-red-200', 'bg-yellow-100 text-yellow-700 border-yellow-200', 'bg-blue-100 text-blue-700 border-blue-200', 'bg-green-100 text-green-700 border-green-200'];
                      const labels = ['起', '承', '转', '合'];
                      return (
                        <span key={ki} className={`inline-flex items-center gap-0.5 px-2 py-0.5 text-xs rounded border ${colors[ki] || colors[0]}`}>
                          {labels[ki] || ''} {k.length > 20 ? k.substring(0, 20) + '...' : k}
                          <button onClick={() => setOutlineEditDraft({ ...outlineEditDraft, keyEvents: (outlineEditDraft.keyEvents || []).filter((_, idx) => idx !== ki) })} className="ml-0.5 opacity-60 hover:opacity-100">&times;</button>
                        </span>
                      );
                    })}
                    <input
                      type="text"
                      placeholder="+ 添加节点"
                      className="flex-1 min-w-[80px] px-1 py-0.5 text-xs bg-transparent border-none outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                          setOutlineEditDraft({ ...outlineEditDraft, keyEvents: [...(outlineEditDraft.keyEvents || []), (e.target as HTMLInputElement).value.trim()] });
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">视觉重点</label>
                  <div className="flex flex-wrap gap-1.5 min-h-[36px] px-3 py-1.5 border border-gray-200 rounded-lg bg-gray-50">
                    {(outlineEditDraft.visualHighlights || []).map((v, vi) => (
                      <span key={vi} className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                        {v}
                        <button onClick={() => setOutlineEditDraft({ ...outlineEditDraft, visualHighlights: (outlineEditDraft.visualHighlights || []).filter((_, idx) => idx !== vi) })} className="text-purple-400 hover:text-purple-700 ml-0.5">&times;</button>
                      </span>
                    ))}
                    <input
                      type="text"
                      placeholder="+ 添加"
                      className="flex-1 min-w-[60px] px-1 py-0.5 text-xs bg-transparent border-none outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                          setOutlineEditDraft({ ...outlineEditDraft, visualHighlights: [...(outlineEditDraft.visualHighlights || []), (e.target as HTMLInputElement).value.trim()] });
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">金句</label>
                  <div className="flex flex-wrap gap-1.5 min-h-[36px] px-3 py-1.5 border border-gray-200 rounded-lg bg-gray-50">
                    {(outlineEditDraft.classicQuotes || []).map((q, qi) => (
                      <span key={qi} className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-white text-gray-700 text-xs rounded border border-purple-200">
                        &ldquo;{q}&rdquo;
                        <button onClick={() => setOutlineEditDraft({ ...outlineEditDraft, classicQuotes: (outlineEditDraft.classicQuotes || []).filter((_, idx) => idx !== qi) })} className="text-gray-400 hover:text-gray-700 ml-0.5">&times;</button>
                      </span>
                    ))}
                    <input
                      type="text"
                      placeholder="+ 添加金句"
                      className="flex-1 min-w-[80px] px-1 py-0.5 text-xs bg-transparent border-none outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                          setOutlineEditDraft({ ...outlineEditDraft, classicQuotes: [...(outlineEditDraft.classicQuotes || []), (e.target as HTMLInputElement).value.trim()] });
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
            <button onClick={() => setShowOutlineModal(false)} className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">取消</button>
            <button onClick={saveOutline} className="px-4 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600">确认</button>
          </div>
        </Modal>
      )}

      {/* ==================== 弹框：删除全部大纲确认 ==================== */}
      {showDeleteWholeOutline && (
        <Modal isOpen={true} onClose={() => setShowDeleteWholeOutline(false)} title="确认删除全部大纲">
          <p className="text-gray-600 mb-4">确定删除该项目的全部大纲文件？此操作不可恢复！</p>
          <div className="flex gap-2">
            <button onClick={confirmDeleteWholeOutline} className="px-4 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">确认删除</button>
            <button onClick={() => setShowDeleteWholeOutline(false)} className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">取消</button>
          </div>
        </Modal>
      )}

      {/* ==================== 弹框：删除单集确认 ==================== */}
      {showDeleteEpisode && (
        <Modal isOpen={true} onClose={() => setShowDeleteEpisode(false)} title="确认删除此集大纲">
          <p className="text-gray-600 mb-4">
            确定删除第 {outlineEditIndex >= 0 && outline ? outline[outlineEditIndex]?.episodeIndex : ''} 集大纲？此操作不可恢复！
          </p>
          <div className="flex gap-2">
            <button onClick={confirmDeleteEpisode} className="px-4 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">确认删除</button>
            <button onClick={() => setShowDeleteEpisode(false)} className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">取消</button>
          </div>
        </Modal>
      )}
    </>
  );
}
