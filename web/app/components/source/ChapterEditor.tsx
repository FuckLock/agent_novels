'use client';

import { useEffect, useState } from 'react';
import Modal from '@/app/components/Modal';
import Button from '@/app/components/Button';
import { ChapterItem } from '@/app/projects/[name]/types';

interface ImpactItem {
  label: string;
  status: string;
  reason: string;
}

interface ChapterEditorProps {
  chapter: ChapterItem | null;
  encodedName: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function ChapterEditor({ chapter, encodedName, onClose, onSaved }: ChapterEditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [revision, setRevision] = useState<number | undefined>();
  const [impact, setImpact] = useState<ImpactItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!chapter) return;
    setLoading(true);
    setError('');
    fetch(`/api/projects/${encodedName}/chapters/${chapter.number}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '章节加载失败');
        setTitle(data.title || chapter.title || `第${chapter.number}章`);
        setContent(data.content || '');
        setRevision(data.revision);
        setImpact(data.impact || []);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : '章节加载失败'))
      .finally(() => setLoading(false));
  }, [chapter, encodedName]);

  if (!chapter) return null;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${encodedName}/chapters/${chapter.number}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, revision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={`编辑第 ${chapter.number} 章`}>
      {loading ? (
        <div className="py-10 text-center text-sm text-gray-400">加载中...</div>
      ) : (
        <div className="space-y-4">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
          <div>
            <label className="mb-1 block text-xs text-gray-500">章节名称</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-300"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">章节内容</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={16}
              className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-300"
            />
          </div>
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {impact.map((item) => item.label).join('、') || '文本派生结果'} 将标记为需要重新生成
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>取消</Button>
            <Button onClick={save} loading={saving} disabled={!content.trim()}>保存</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
