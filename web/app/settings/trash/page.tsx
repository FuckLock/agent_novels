'use client';

// settings/trash — Phase 13 回收站页
//
// 流程：列表（软删除条目）→ 选条目 → 恢复 | 硬删除前 previewImpact（spec L175）→ 用户确认 → 硬删除
//
// 核心 UI（criteria F5）：硬删除按钮必须前置 previewImpact Modal，展示 recordCount / artifactCount / 引用清单

import { useCallback, useEffect, useState } from 'react';
import Button from '../../components/Button';
import Card from '../../components/Card';
import Modal from '../../components/Modal';

interface ImpactReport {
  recordCount: number;
  artifactCount: number;
  fileSizeTotal: number;
  details: Array<{ table: string; count: number }>;
  artifactReferences: Array<{ artifactId: string; refCount: number; sizeBytes: number }>;
}

interface TrashEntry {
  id: string;
  targetType: string;
  targetId: string;
  projectId: string | null;
  status: 'soft_deleted' | 'restored' | 'hard_deleted';
  title: string;
  recordCount: number;
  artifactCount: number;
  fileSizeTotal: number;
  softDeletedAt: number;
  hardDeletedAt: number | null;
  restoredAt: number | null;
  actor: string;
  reason: string;
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN');
}

export default function TrashPage() {
  const [entries, setEntries] = useState<TrashEntry[]>([]);
  const [statusFilter, setStatusFilter] = useState<'soft_deleted' | 'restored' | 'hard_deleted' | ''>('soft_deleted');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<TrashEntry | null>(null);
  const [showImpactModal, setShowImpactModal] = useState(false);
  const [impactPreview, setImpactPreview] = useState<ImpactReport | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = statusFilter ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/system/trash${q}`);
      if (!res.ok) throw new Error(`加载失败 HTTP ${res.status}`);
      const data = await res.json();
      setEntries(data.entries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const previewImpact = async (entry: TrashEntry) => {
    setSelectedEntry(entry);
    setShowImpactModal(true);
    setImpactPreview(null);
    setImpactLoading(true);
    try {
      const res = await fetch(`/api/system/trash?action=previewImpact&targetType=${encodeURIComponent(entry.targetType)}&targetId=${encodeURIComponent(entry.targetId)}`);
      if (!res.ok) throw new Error(`影响清单加载失败 HTTP ${res.status}`);
      const data = await res.json();
      setImpactPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '影响清单加载失败');
    } finally {
      setImpactLoading(false);
    }
  };

  const handleRestore = async (entry: TrashEntry) => {
    if (!confirm(`确认恢复 ${entry.title || entry.targetType}：${entry.targetId.slice(0, 8)}…？`)) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/system/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', trashEntryId: entry.id }),
      });
      if (!res.ok) throw new Error(`恢复失败 HTTP ${res.status}`);
      await loadEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleHardDelete = async () => {
    if (!selectedEntry) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/system/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'hardDelete', trashEntryId: selectedEntry.id, confirmed: true }),
      });
      if (!res.ok) throw new Error(`硬删除失败 HTTP ${res.status}`);
      setShowImpactModal(false);
      setSelectedEntry(null);
      setImpactPreview(null);
      await loadEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : '硬删除失败');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8" style={{ background: 'var(--tf-bg-canvas)' }}>
      <div className="mx-auto sm:max-w-3xl lg:max-w-5xl">
        <h1 className="text-2xl font-bold text-gray-800 mb-1" style={{ color: 'var(--tf-text-primary)' }}>回收站</h1>
        <p className="text-sm text-gray-500 mb-6">软删除后可恢复；<strong className="text-amber-600">硬删除前会展示影响清单</strong>（关联记录数 + Artifact 引用数 + 文件大小），需用户确认。</p>

        {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            <Button size="sm" variant={statusFilter === 'soft_deleted' ? 'primary' : 'secondary'} onClick={() => setStatusFilter('soft_deleted')}>待处理 ({entries.filter((e) => e.status === 'soft_deleted').length})</Button>
            <Button size="sm" variant={statusFilter === 'restored' ? 'primary' : 'secondary'} onClick={() => setStatusFilter('restored')}>已恢复</Button>
            <Button size="sm" variant={statusFilter === 'hard_deleted' ? 'primary' : 'secondary'} onClick={() => setStatusFilter('hard_deleted')}>已硬删除</Button>
          </div>
          <Button variant="secondary" size="sm" onClick={loadEntries} disabled={loading}>{loading ? '加载中…' : '刷新'}</Button>
        </div>

        {loading ? (
          <Card>加载中…</Card>
        ) : entries.length === 0 ? (
          <Card>回收站为空</Card>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <Card key={entry.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">{entry.targetType}</span>
                      <span className="font-medium text-gray-800 truncate" title={entry.title}>{entry.title || entry.targetId.slice(0, 12) + '…'}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      软删除于 {formatTime(entry.softDeletedAt)} · 操作人 {entry.actor}
                    </div>
                    <div className="text-xs text-gray-600 mt-2">
                      影响：<strong>{entry.recordCount}</strong> 条记录 · <strong>{entry.artifactCount}</strong> Artifact 引用 · {formatBytes(entry.fileSizeTotal)}
                    </div>
                    {entry.reason && <div className="text-xs text-gray-500 italic mt-1">原因：{entry.reason}</div>}
                  </div>
                  {entry.status === 'soft_deleted' && (
                    <div className="flex flex-col gap-2">
                      <Button size="sm" variant="secondary" onClick={() => handleRestore(entry)} disabled={actionLoading}>恢复</Button>
                      <Button size="sm" variant="danger" onClick={() => previewImpact(entry)} disabled={actionLoading}>硬删除…</Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showImpactModal} onClose={() => setShowImpactModal(false)} title="硬删除影响清单（不可逆）">
        {impactLoading ? (
          <p>正在计算影响…</p>
        ) : impactPreview && selectedEntry ? (
          <div>
            <p className="text-sm text-gray-700 mb-3">即将永久删除 <code className="bg-gray-100 px-1">{selectedEntry.targetType}</code>：<code className="bg-gray-100 px-1">{selectedEntry.targetId.slice(0, 16)}…</code></p>
            <div className="p-3 bg-red-50 border border-red-200 rounded mb-3">
              <div className="text-sm font-semibold text-red-700">影响清单（recordCount / artifactCount / fileSizeTotal）：</div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                <div>记录数：<strong>{impactPreview.recordCount}</strong></div>
                <div>Artifact 引用：<strong>{impactPreview.artifactCount}</strong></div>
                <div>总大小：<strong>{formatBytes(impactPreview.fileSizeTotal)}</strong></div>
              </div>
              {impactPreview.details.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs text-red-600 font-semibold">关联表：</div>
                  <ul className="text-xs text-red-700 mt-1 list-disc list-inside">
                    {impactPreview.details.map((d) => <li key={d.table}>{d.table}: {d.count} 条</li>)}
                  </ul>
                </div>
              )}
              {impactPreview.artifactReferences.length > 0 && (
                <div className="mt-2 text-xs text-red-700">
                  Artifact 引用清单（前 3）：{impactPreview.artifactReferences.slice(0, 3).map((r) => r.artifactId.slice(0, 8)).join(', ')}…
                </div>
              )}
            </div>
            <p className="text-xs text-amber-600 mb-3">本操作不可逆；Artifact 引用计数 -1，引用为 0 时下次清理回收。</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowImpactModal(false)}>取消</Button>
              <Button variant="danger" onClick={handleHardDelete} loading={actionLoading}>确认硬删除</Button>
            </div>
          </div>
        ) : (
          <p>无法加载影响清单</p>
        )}
      </Modal>
    </div>
  );
}
