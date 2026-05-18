'use client';

import { useState } from 'react';
import Modal from '@/app/components/Modal';
import Button from '@/app/components/Button';

interface ParsedChapter {
  number: number;
  title: string;
  content: string;
  preview: string;
  charCount: number;
}

interface ImpactItem {
  label: string;
  status: string;
  reason: string;
}

interface ChapterImportModalProps {
  isOpen: boolean;
  encodedName: string;
  onClose: () => void;
  onImported: () => void;
}

function rebuildContent(chapters: ParsedChapter[]) {
  return chapters
    .map((chapter) => {
      const lines = chapter.content.split('\n');
      const firstLine = lines[0]?.trim();
      if (firstLine === chapter.title) return chapter.content.trim();
      return `${chapter.title}\n${chapter.content}`.trim();
    })
    .join('\n\n');
}

export default function ChapterImportModal({ isOpen, encodedName, onClose, onImported }: ChapterImportModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState('');
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const [chapters, setChapters] = useState<ParsedChapter[]>([]);
  const [impact, setImpact] = useState<ImpactItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const readFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.txt')) {
      setError('仅支持 .txt 文件');
      return;
    }
    setFilename(file.name);
    if (!title) setTitle(file.name.replace(/\.txt$/i, ''));
    setContent(await file.text());
  };

  const preview = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${encodedName}/source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, filename, content, sourceType: filename ? 'upload' : 'paste', dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '解析失败');
      setChapters(data.chapters || []);
      setImpact(data.impact || []);
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '解析失败');
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    setLoading(true);
    setError('');
    try {
      const finalContent = rebuildContent(chapters);
      const res = await fetch(`/api/projects/${encodedName}/source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, filename, content: finalContent, sourceType: filename ? 'upload' : 'paste' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      onImported();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="导入小说原文">
      <div className="space-y-4">
        <div className="flex gap-3 border-b border-gray-100 pb-3 text-sm">
          <span className={step === 1 ? 'font-medium text-purple-700' : 'text-gray-400'}>导入</span>
          <span className={step === 2 ? 'font-medium text-purple-700' : 'text-gray-400'}>确认章节</span>
        </div>

        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        {step === 1 ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-gray-500">原文标题</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <label className="block rounded-lg border-2 border-dashed border-gray-200 p-5 text-center text-sm text-gray-500 hover:border-purple-300">
              <input type="file" accept=".txt" className="hidden" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
              {filename || '选择 .txt 文件'}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              placeholder="或直接粘贴小说原文"
              className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-300"
            />
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>{content.length} 字符</span>
              <Button onClick={preview} disabled={!content.trim()} loading={loading}>解析章节</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
              {chapters.map((chapter, index) => (
                <div key={`${chapter.number}-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="grid grid-cols-[80px_1fr] gap-2">
                    <input
                      type="number"
                      value={chapter.number}
                      onChange={(e) => setChapters((items) => items.map((item, i) => i === index ? { ...item, number: Number(e.target.value) } : item))}
                      className="rounded-md border border-gray-200 px-2 py-1 text-sm"
                    />
                    <input
                      value={chapter.title}
                      onChange={(e) => setChapters((items) => items.map((item, i) => i === index ? { ...item, title: e.target.value } : item))}
                      className="rounded-md border border-gray-200 px-2 py-1 text-sm"
                    />
                  </div>
                  <textarea
                    value={chapter.content}
                    onChange={(e) => setChapters((items) => items.map((item, i) => i === index ? { ...item, content: e.target.value } : item))}
                    rows={3}
                    className="mt-2 w-full resize-none rounded-md border border-gray-200 px-2 py-1 text-xs"
                  />
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {impact.map((item) => item.label).join('、')} 将标记为需要重新生成
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setStep(1)}>上一步</Button>
              <Button onClick={save} loading={loading} disabled={chapters.length === 0}>保存章节</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
