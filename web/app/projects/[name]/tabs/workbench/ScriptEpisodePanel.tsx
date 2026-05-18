'use client';

import { useState, useEffect, useCallback } from 'react';
import { Pencil, Download } from 'lucide-react';
import ReviewBadge from '@/app/components/ReviewBadge';
import ReviewDrawer from '@/app/components/ReviewDrawer';
import { ReviewResult } from '@/app/lib/novels';
import MarkdownPreview from '@/app/components/MarkdownPreview';
import MarkdownEditorModal from '@/app/components/MarkdownEditorModal';

interface ScriptEpisodePanelProps {
  episode: number;
  encodedName: string;
  name: string;
  review: ReviewResult | null;
  onReview?: () => void;
}

export default function ScriptEpisodePanel({
  episode,
  encodedName,
  name,
  review,
  onReview,
}: ScriptEpisodePanelProps) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadScript = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${encodedName}/scripts/${episode}`);
      if (res.ok) {
        const data = await res.json();
        setContent(data.content || '');
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [encodedName, episode]);

  useEffect(() => { loadScript(); }, [loadScript]);

  const save = async (newContent: string) => {
    try {
      await fetch(`/api/projects/${encodedName}/scripts/${episode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent }),
      });
      setContent(newContent);
      setEditing(false);
    } catch { /* ignore */ }
  };

  const handleExport = () => {
    if (!content) return;
    fetch(`/api/projects/${encodedName}/scripts/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ episodes: [episode] }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('导出失败');
        return res.json();
      })
      .then((data) => {
        const blob = new Blob([data.content || content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename || `${name}-第${episode}集剧本.txt`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 100);
      })
      .catch(() => alert('导出失败，请重试'));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        加载中...
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-1 rounded-lg">第{episode}集</span>
          <h2 className="text-base font-semibold text-gray-900">剧本</h2>
          <span className="text-xs text-gray-400">{content.length} 字</span>
          <ReviewBadge review={review} onClick={() => setDrawerOpen(true)} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={!content}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 px-2.5 py-1.5 rounded-md transition disabled:opacity-40"
          >
            <Download size={14} />
            导出
          </button>
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 px-2.5 py-1.5 rounded-md transition"
          >
            <Pencil size={14} />
            编辑
          </button>
        </div>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto">
        {content ? (
          <MarkdownPreview content={content} />
        ) : (
          <div className="text-sm text-gray-400 text-center py-8">暂无剧本</div>
        )}
      </div>

      {/* 编辑模态框 */}
      <MarkdownEditorModal
        isOpen={editing}
        initialContent={content}
        title={`编辑第${episode}集剧本`}
        onSave={save}
        onCancel={() => setEditing(false)}
      />

      {/* 审核抽屉 */}
      {review && (
        <ReviewDrawer
          open={drawerOpen}
          review={review}
          onClose={() => setDrawerOpen(false)}
          onReview={onReview ?? (() => {})}
        />
      )}
    </div>
  );
}
