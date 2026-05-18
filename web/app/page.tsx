'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { AlertCircle, Folder, Plus, Trash2 } from 'lucide-react';
import Card from './components/Card';
import Button from './components/Button';
import Modal from './components/Modal';
import Input from './components/Input';
import Select from './components/Select';
import Textarea from './components/Textarea';
import StatusPill from './components/StatusPill';
import { parseDescription } from './projects/[name]/types';

interface Project {
  id?: string;
  name: string;
  description: string;
  chapterCount: number;
  createdAt: string;
  status?: string;
  revision?: number;
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: '',
    style: '3D国漫',
    ratio: '16:9',
    summary: '',
  });
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const loadProjects = useCallback(() => {
    setLoading(true);
    setError('');
    fetch('/api/projects')
      .then((res) => {
        if (!res.ok) throw new Error('加载失败');
        return res.json();
      })
      .then((data) => setProjects(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleCreateProject = async () => {
    if (!formData.name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || '创建失败');
      }
      setShowNewModal(false);
      setFormData({ name: '', type: '', style: '3D国漫', ratio: '16:9', summary: '' });
      loadProjects();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '项目创建失败，请重试');
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(deleteTarget)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || '删除失败');
      }
      loadProjects();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '项目删除失败，请重试');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="p-6 lg:p-10">
      <div className="mx-auto max-w-[1280px] space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--tf-text-primary)]">创作项目</h2>
            <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">{projects.length} 个项目</p>
          </div>
          <Button onClick={() => setShowNewModal(true)}>
            <Plus className="h-4 w-4" />
            新建项目
          </Button>
        </div>

        {error && (
          <div className="flex items-center justify-between rounded-[var(--tf-radius-md)] border border-[var(--tf-danger-soft)] bg-[var(--tf-danger-soft)] px-3 py-2 text-sm text-[var(--tf-danger)]">
            <span className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </span>
            <button onClick={() => setError('')} className="text-[var(--tf-danger)] opacity-70 hover:opacity-100">&times;</button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="min-h-[174px] animate-pulse">
                <div className="flex items-start gap-4 mb-3">
                  <div className="h-11 w-11 rounded-[var(--tf-radius-md)] bg-gray-200" />
                  <div className="flex-1">
                    <div className="h-5 bg-gray-200 rounded w-2/3 mb-2" />
                    <div className="h-4 bg-gray-100 rounded w-1/3" />
                  </div>
                </div>
                <div className="h-4 bg-gray-100 rounded w-full mb-2" />
                <div className="h-4 bg-gray-100 rounded w-3/4" />
              </Card>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[var(--tf-radius-md)] border border-dashed border-[var(--tf-border-strong)] bg-[var(--tf-bg-panel)] text-[var(--tf-text-secondary)]">
            <Folder className="mb-4 h-14 w-14 text-[var(--tf-text-muted)]" />
            <p className="text-base font-medium text-[var(--tf-text-primary)]">暂无项目</p>
            <div className="mt-4">
              <Button onClick={() => setShowNewModal(true)} size="sm">
                <Plus className="h-4 w-4" />
                新建项目
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => {
              const parsed = parseDescription(p.description);
              const type = parsed['小说类型'] || '未知';
              const summary = parsed['小说简介'];
              const createdDate = p.createdAt
                ? new Date(p.createdAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                : '-';
              return (
                <Link key={p.name} href={`/projects/${encodeURIComponent(p.name)}`} className="block h-full">
                  <Card className="group relative flex h-full min-h-[174px] cursor-pointer flex-col gap-4 p-[18px] transition hover:border-[var(--tf-accent-primary)] hover:shadow-md">
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(p.name); }}
                      className="absolute right-3 top-3 rounded-[var(--tf-radius-sm)] p-1.5 text-[var(--tf-text-muted)] opacity-0 transition hover:bg-[var(--tf-danger-soft)] hover:text-[var(--tf-danger)] focus:opacity-100 group-hover:opacity-100"
                      aria-label={`删除项目 ${p.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <div className="flex items-start gap-4 pr-8">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--tf-radius-md)] bg-[var(--tf-accent-primary-soft)] text-[var(--tf-accent-primary)]">
                        <Folder className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="truncate text-lg font-semibold text-[var(--tf-text-primary)]">{p.name}</h3>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <StatusPill variant="primary">{type}</StatusPill>
                          <StatusPill variant="neutral">{p.chapterCount} 章</StatusPill>
                        </div>
                      </div>
                    </div>
                    <p className="line-clamp-2 min-h-10 text-sm leading-5 text-[var(--tf-text-secondary)]">
                      {summary || p.description.substring(0, 60)}
                    </p>
                    <div className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--tf-border-subtle)] pt-3 text-xs text-[var(--tf-text-muted)]">
                      <span>本地项目</span>
                      <span className="truncate">创建 {createdDate}</span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <Modal isOpen={showNewModal} onClose={() => setShowNewModal(false)} title="新建项目">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">项目名称 *</label>
            <Input value={formData.name} onChange={(v) => setFormData({ ...formData, name: v })} placeholder="请输入项目名称" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">小说类型</label>
            <Input value={formData.type} onChange={(v) => setFormData({ ...formData, type: v })} placeholder="例如：玄幻、都市、言情" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">影片画风</label>
            <Select
              value={formData.style}
              onChange={(v) => setFormData({ ...formData, style: v })}
              options={[
                { label: '3D国漫', value: '3D国漫' },
                { label: '2D国漫', value: '2D国漫' },
                { label: '2.5D国漫', value: '2.5D国漫' },
                { label: '真人', value: '真人' },
              ]}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">影片比例</label>
            <Select
              value={formData.ratio}
              onChange={(v) => setFormData({ ...formData, ratio: v })}
              options={[
                { label: '16:9', value: '16:9' },
                { label: '9:16', value: '9:16' },
                { label: '1:1', value: '1:1' },
              ]}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">小说简介</label>
            <Textarea value={formData.summary} onChange={(v) => setFormData({ ...formData, summary: v })} rows={4} placeholder="请输入小说简介" />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreateProject} loading={creating}>创建</Button>
            <Button variant="secondary" onClick={() => setShowNewModal(false)}>取消</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="确认删除">
        <p className="text-gray-600 mb-4">确定删除项目「{deleteTarget}」？项目会先进入软删除状态。</p>
        <div className="flex gap-2">
          <Button variant="danger" onClick={confirmDelete} loading={deleting}>确认删除</Button>
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>取消</Button>
        </div>
      </Modal>
    </div>
  );
}
