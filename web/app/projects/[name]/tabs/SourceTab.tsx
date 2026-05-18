'use client';

import { useState } from 'react';
import { FilePlus, Pencil, Trash2 } from 'lucide-react';
import Button from '@/app/components/Button';
import Modal from '@/app/components/Modal';
import ChapterImportModal from '@/app/components/source/ChapterImportModal';
import ChapterEditor from '@/app/components/source/ChapterEditor';
import { ChapterItem, ProjectDetail } from '../types';

interface SourceTabProps {
  project: ProjectDetail;
  encodedName: string;
  onReload: () => void;
}

export default function SourceTab({ project, encodedName, onReload }: SourceTabProps) {
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<ChapterItem | null>(null);
  const [deleting, setDeleting] = useState<ChapterItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const chapters = project.chapters || [];

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${encodedName}/chapters/${deleting.number}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '删除失败');
      setDeleting(null);
      onReload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--tf-text-primary)]">小说原文</h2>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">{chapters.length} 个章节</p>
        </div>
        <Button onClick={() => setShowImport(true)}>
          <FilePlus className="h-4 w-4" />
          导入原文
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      {chapters.length === 0 ? (
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-[var(--tf-border-strong)] bg-[var(--tf-bg-panel)] text-center">
          <FilePlus className="mb-3 h-10 w-10 text-[var(--tf-text-muted)]" />
          <p className="text-sm font-medium text-[var(--tf-text-primary)]">暂无章节</p>
          <div className="mt-4">
            <Button size="sm" onClick={() => setShowImport(true)}>
              <FilePlus className="h-4 w-4" />
              导入原文
            </Button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--tf-border-subtle)] bg-[var(--tf-bg-panel)]">
          <table className="w-full table-fixed">
            <thead className="bg-[var(--tf-bg-raised)] text-left text-xs text-[var(--tf-text-muted)]">
              <tr>
                <th className="w-20 px-4 py-3 font-medium">章</th>
                <th className="w-56 px-4 py-3 font-medium">章节名称</th>
                <th className="px-4 py-3 font-medium">内容摘要</th>
                <th className="w-28 px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {chapters.map((chapter) => (
                <tr key={chapter.id || chapter.number} className="border-t border-[var(--tf-border-subtle)]">
                  <td className="px-4 py-3 text-sm text-[var(--tf-text-secondary)]">{chapter.number}</td>
                  <td className="truncate px-4 py-3 text-sm font-medium text-[var(--tf-text-primary)]">{chapter.title || `第${chapter.number}章`}</td>
                  <td className="truncate px-4 py-3 text-sm text-[var(--tf-text-secondary)]">{chapter.preview || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setEditing(chapter)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="编辑">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => setDeleting(chapter)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="删除">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ChapterImportModal
        isOpen={showImport}
        encodedName={encodedName}
        onClose={() => setShowImport(false)}
        onImported={onReload}
      />
      <ChapterEditor chapter={editing} encodedName={encodedName} onClose={() => setEditing(null)} onSaved={onReload} />

      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="确认删除章节">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">确定删除「{deleting?.title || `第${deleting?.number}章`}」？下游文本派生结果会标记为需要重新生成。</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleting(null)}>取消</Button>
            <Button variant="danger" onClick={remove} loading={busy}>删除</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
