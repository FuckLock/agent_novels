'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Button from '@/app/components/Button';
import { SKELETON_WIDTHS, renderScriptLine, countChars } from '../../utils/scriptUtils';

export default function ScriptPage() {
  const params = useParams();
  const router = useRouter();
  const { name, episode } = params as { name: string; episode: string };

  const [content, setContent] = useState('');
  const [editContent, setEditContent] = useState('');
  const [outlineTitle, setOutlineTitle] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadContent = useCallback(() => {
    setLoading(true);
    setError('');
    const ep = parseInt(episode, 10);
    // 并发请求：剧本内容 + 项目大纲（仅首次加载时获取标题）
    Promise.all([
      fetch(`/api/projects/${name}/scripts/${episode}`).then(res => {
        if (!res.ok) throw new Error('加载剧本失败');
        return res.json();
      }),
      fetch(`/api/projects/${name}`).then(res => res.ok ? res.json() : null),
    ])
      .then(([scriptData, projectData]) => {
        setContent(scriptData.content || '');
        if (projectData?.outline) {
          const epOutline = (projectData.outline as { episodeIndex: number; title?: string }[])
            .find(o => o.episodeIndex === ep);
          if (epOutline?.title) setOutlineTitle(epOutline.title);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [name, episode]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${name}/scripts/${episode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      });
      if (!res.ok) throw new Error('保存失败');
      setContent(editContent);
      setIsEditing(false);
      setError('');
    } catch {
      setError('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = () => {
    setEditContent(content);
    setIsEditing(true);
    setError('');
  };

  const handleCancel = () => {
    setIsEditing(false);
    setError('');
  };

  const wordCount = isEditing ? countChars(editContent) : countChars(content);
  const pageTitle = outlineTitle ? `第${episode}集 · ${outlineTitle}` : `第${episode}集剧本`;

  return (
    <div className="min-h-full bg-[var(--tf-bg-canvas)]">
        {/* 顶部工具栏（sticky） */}
        <div className="sticky top-0 z-10 border-b border-[var(--tf-border-subtle)] bg-[var(--tf-bg-panel)] shadow-sm">
          <div className="px-6 py-4 flex items-center justify-between">
            {/* 左侧：返回 + 标题 */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => router.back()}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                返回
              </button>
              <div className="h-4 w-px bg-gray-200 flex-shrink-0" />
              <h1 className="text-lg font-semibold text-gray-800 truncate">{pageTitle}</h1>
            </div>

            {/* 右侧：字数 + 操作按钮 */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {wordCount > 0 && (
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                  {wordCount} 字符
                </span>
              )}
              {!loading && (
                isEditing ? (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSave} loading={saving}>保存剧本</Button>
                    <Button size="sm" variant="secondary" onClick={handleCancel}>取消</Button>
                  </div>
                ) : (
                  <Button size="sm" onClick={handleEdit} disabled={!content}>编辑</Button>
                )
              )}
            </div>
          </div>

          {/* 错误提示条 */}
          {error && (
            <div className="px-6 pb-3">
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
                <span className="text-sm text-red-600">{error}</span>
                <div className="flex items-center gap-2">
                  <button onClick={loadContent} className="text-sm text-red-500 hover:text-red-700 underline">重试</button>
                  <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 主内容区 */}
        <div className="max-w-4xl mx-auto px-6 py-6">
          {loading ? (
            /* 12行骨架屏 */
            <div className="bg-white rounded-xl shadow-sm p-6 animate-pulse space-y-2">
              {SKELETON_WIDTHS.map((w, i) => (
                <div key={i} className="h-4 bg-gray-100 rounded" style={{ width: w }} />
              ))}
            </div>
          ) : isEditing ? (
            /* 编辑模式：全高 textarea */
            <div className="relative">
              <p className="text-xs text-gray-400 mb-2">编辑完成后点击「保存剧本」，内容将写入本地文件。</p>
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                disabled={saving}
                className="w-full min-h-[70vh] resize-none rounded-xl bg-white p-6 font-mono text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--tf-accent-primary-soft)] disabled:opacity-60"
                style={{ lineHeight: '1.8' }}
              />
              <span className="absolute bottom-3 right-4 text-xs text-gray-400">{countChars(editContent)} 字符</span>
            </div>
          ) : content ? (
            /* 阅读模式：行号 + 语法高亮 */
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <tbody>
                    {content.split('\n').map((line, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-0.5 text-right text-sm text-gray-400 select-none w-12 align-top" style={{ lineHeight: '1.8' }}>
                          {i + 1}
                        </td>
                        <td className="px-4 py-0.5 text-sm text-gray-700 whitespace-pre-wrap font-mono" style={{ lineHeight: '1.8' }}>
                          {renderScriptLine(line)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* 空状态 */
            <div className="bg-white rounded-xl shadow-sm p-12 text-center">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm text-gray-500 mb-1">暂无剧本内容</p>
              <p className="text-xs text-gray-400 mt-1">在内容工作台使用「生成剧本」功能开始</p>
            </div>
          )}
        </div>
    </div>
  );
}
