'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Button from '@/app/components/Button';
import Modal from '@/app/components/Modal';
import Textarea from '@/app/components/Textarea';

export default function ChapterPage() {
  const params = useParams();
  const router = useRouter();
  const { name, id } = params;
  const [content, setContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadContent = useCallback(() => {
    setLoading(true);
    setError('');
    fetch(`/api/projects/${name}/chapters/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('加载章节失败');
        return res.json();
      })
      .then((data) => setContent(data.content))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [name, id]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${name}/chapters/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error('保存失败');
      setIsEditing(false);
    } catch {
      setError('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${name}/chapters/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      router.push(`/projects/${name}`);
    } catch {
      setError('删除失败，请重试');
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  return (
    <div className="min-h-full bg-[var(--tf-bg-canvas)]">
        <div className="border-b border-[var(--tf-border-subtle)] bg-[var(--tf-bg-panel)] p-6">
          <button onClick={() => router.back()} className="mb-2 text-sm text-[var(--tf-accent-primary)] hover:underline">&larr; 返回</button>
          <h1 className="text-2xl font-semibold text-[var(--tf-text-primary)]">第{id}章</h1>
          {error && (
            <div className="mt-2 p-2 bg-red-50 text-red-600 text-sm rounded flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">&times;</button>
            </div>
          )}
          <div className="flex gap-2 mt-4">
            {isEditing ? (
              <>
                <Button onClick={handleSave} loading={saving}>保存</Button>
                <Button variant="secondary" onClick={() => setIsEditing(false)}>取消</Button>
              </>
            ) : (
              <>
                <Button onClick={() => setIsEditing(true)} disabled={loading}>编辑</Button>
                <Button variant="danger" onClick={() => setShowDeleteModal(true)} disabled={loading}>删除</Button>
              </>
            )}
          </div>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="bg-white p-6 rounded-lg shadow animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-full mb-3" />
              <div className="h-4 bg-gray-200 rounded w-5/6 mb-3" />
              <div className="h-4 bg-gray-200 rounded w-4/6 mb-3" />
              <div className="h-4 bg-gray-100 rounded w-3/6" />
            </div>
          ) : isEditing ? (
            <Textarea value={content} onChange={setContent} rows={30} />
          ) : (
            <div className="bg-white p-6 rounded-lg shadow whitespace-pre-wrap">{content}</div>
          )}
        </div>

      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="确认删除">
        <p className="text-gray-600 mb-4">确定删除第{id}章？此操作不可恢复！</p>
        <div className="flex gap-2">
          <Button variant="danger" onClick={handleDelete} loading={deleting}>确认删除</Button>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>取消</Button>
        </div>
      </Modal>
    </div>
  );
}
