'use client';

import { useState, useEffect, useCallback } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import MarkdownPreview from '@/app/components/MarkdownPreview';
import MarkdownEditorModal from '@/app/components/MarkdownEditorModal';

interface ScriptItem {
  episode: number;
  name: string;
}

interface ScriptCardListProps {
  scripts: ScriptItem[];
  encodedName: string;
  onReload: () => void;
  refreshTrigger?: number;
}

export default function ScriptCardList({
  scripts,
  encodedName,
  onReload,
  refreshTrigger = 0,
}: ScriptCardListProps) {
  const [contents, setContents] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [editingEp, setEditingEp] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const loadAllScripts = useCallback(async () => {
    if (scripts.length === 0) return;
    setLoading(true);
    const result: Record<number, string> = {};
    await Promise.all(
      scripts.map(async (s) => {
        try {
          const res = await fetch(`/api/projects/${encodedName}/scripts/${s.episode}`);
          if (res.ok) {
            const data = await res.json();
            result[s.episode] = data.content || '';
          }
        } catch { /* ignore */ }
      })
    );
    setContents(result);
    setLoading(false);
  }, [scripts, encodedName]);

  useEffect(() => { loadAllScripts(); }, [loadAllScripts, refreshTrigger]);

  const handleSave = async (episode: number, newContent: string) => {
    try {
      await fetch(`/api/projects/${encodedName}/scripts/${episode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent }),
      });
      setContents((prev) => ({ ...prev, [episode]: newContent }));
      setEditingEp(null);
      onReload();
    } catch { /* ignore */ }
  };

  const handleDelete = async (episode: number) => {
    try {
      await fetch(`/api/projects/${encodedName}/scripts/${episode}`, {
        method: 'DELETE',
      });
      setDeleteConfirm(null);
      onReload();
    } catch { /* ignore */ }
  };

  if (scripts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-gray-400 text-sm py-16">剧本尚未生成</span>
      </div>
    );
  }

  if (loading && Object.keys(contents).length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        加载中...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {scripts.map((s) => {
        const content = contents[s.episode] || '';
        const displayName = s.name || `EP${String(s.episode).padStart(2, '0')}`;

        return (
          <div key={s.episode} className="border border-gray-200 rounded-xl overflow-hidden">
            {/* 卡片头部 */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 bg-gray-800 text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded">
                  #{s.episode}
                </span>
                <span className="text-sm font-medium text-gray-900 truncate">
                  {displayName}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setEditingEp(s.episode)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-md transition"
                  title="编辑"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => setDeleteConfirm(s.episode)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                  title="删除"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {/* 内容预览 */}
            <div className="px-4 py-3 max-h-[280px] overflow-y-auto text-sm">
              {content ? (
                <MarkdownPreview content={content} />
              ) : (
                <span className="text-gray-400">暂无内容</span>
              )}
            </div>
          </div>
        );
      })}

      {/* 编辑模态框 */}
      {editingEp !== null && (
        <MarkdownEditorModal
          isOpen={true}
          initialContent={contents[editingEp] || ''}
          title={`编辑第${editingEp}集剧本`}
          onSave={(c) => handleSave(editingEp, c)}
          onCancel={() => setEditingEp(null)}
        />
      )}

      {/* 删除确认 */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">确认删除</h3>
            <p className="text-sm text-gray-600 mb-5">
              确定删除第 {deleteConfirm} 集剧本吗？此操作不可撤销。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
