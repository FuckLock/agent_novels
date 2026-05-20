'use client';

// settings/legacy-import — Phase 13 旧 novels/ 导入向导页
//
// 流程：扫描 → 选目录 → 预览 6 类内容 → 编辑映射规则（MVP 手动）→ 确认导入 → 显示结果
//
// 边界：仅与 /api/system/legacy-import 通信（service 层确保 novels/ 只读）

import { useCallback, useEffect, useState } from 'react';
import Button from '../../components/Button';
import Card from '../../components/Card';
import Modal from '../../components/Modal';

interface LegacyCandidate {
  legacyDirName: string;
  absolutePath: string;
  sizeBytes: number;
  fileCount: number;
  mtime: number;
}

interface LegacyPreviewSummary {
  totalFiles: number;
  totalSizeBytes: number;
  chapterCount: number;
  configCount: number;
  scriptCount: number;
  assetCount: number;
  reviewCount: number;
  seedanceCount: number;
  unmappedCount: number;
}

interface LegacyPreview {
  chapters: Array<{ relativePath: string; sizeBytes: number }>;
  configs: Array<{ relativePath: string; kind: string }>;
  scripts: Array<{ relativePath: string }>;
  assets: Array<{ relativePath: string; mimeType: string }>;
  reviews: Array<{ relativePath: string }>;
  seedanceArtifacts: Array<{ relativePath: string; kind: string }>;
  summary: LegacyPreviewSummary;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function LegacyImportPage() {
  const [candidates, setCandidates] = useState<LegacyCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string>('');
  const [preview, setPreview] = useState<LegacyPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; warnings: string[] } | null>(null);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/system/legacy-import?action=scan');
      if (!res.ok) throw new Error(`扫描失败 HTTP ${res.status}`);
      const data = await res.json();
      setCandidates(data.candidates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '扫描失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCandidates(); }, [loadCandidates]);

  const loadPreview = useCallback(async (legacyDirName: string) => {
    setPreviewLoading(true);
    setPreview(null);
    setError('');
    try {
      const res = await fetch(`/api/system/legacy-import?action=preview&legacyDirName=${encodeURIComponent(legacyDirName)}`);
      if (!res.ok) throw new Error(`预览失败 HTTP ${res.status}`);
      const data = await res.json();
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '预览失败');
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const handleSelect = (name: string) => {
    setSelected(name);
    setResult(null);
    loadPreview(name);
  };

  const handleImport = async () => {
    if (!selected) return;
    setImporting(true);
    setShowConfirm(false);
    try {
      const res = await fetch('/api/system/legacy-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', legacyDirName: selected, mappingRules: {} }),
      });
      if (!res.ok) throw new Error(`导入失败 HTTP ${res.status}`);
      const data = await res.json();
      setResult({
        ok: true,
        message: `导入完成：项目 ID ${data.targetProjectId || data.id}`,
        warnings: data.warnings || [],
      });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : '导入失败', warnings: [] });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8" style={{ background: 'var(--tf-bg-canvas)' }}>
      <div className="mx-auto sm:max-w-3xl lg:max-w-5xl">
        <h1 className="text-2xl font-bold text-gray-800 mb-1" style={{ color: 'var(--tf-text-primary)' }}>旧项目导入</h1>
        <p className="text-sm text-gray-500 mb-6">从 novels/ 旧目录只读扫描章节 / 配置 / 脚本 / 资产 / review / seedance 产物。源数据严格只读不改写。</p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
        )}

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-600">可导入的旧项目（{candidates.length}）</h2>
          <Button variant="secondary" size="sm" onClick={loadCandidates} disabled={loading}>{loading ? '扫描中…' : '重新扫描'}</Button>
        </div>

        {loading ? (
          <Card>正在扫描…</Card>
        ) : candidates.length === 0 ? (
          <Card>暂无可导入的旧项目（novels/ 为空或不存在）</Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {candidates.map((c) => (
              <Card key={c.legacyDirName} className={selected === c.legacyDirName ? 'border-blue-400' : ''}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-800 truncate" title={c.legacyDirName}>{c.legacyDirName}</div>
                    <div className="text-xs text-gray-500 mt-1 truncate" title={c.absolutePath}>{c.absolutePath}</div>
                    <div className="text-xs text-gray-500 mt-2">文件数 {c.fileCount} · {formatBytes(c.sizeBytes)}</div>
                  </div>
                  <Button size="sm" onClick={() => handleSelect(c.legacyDirName)}>{selected === c.legacyDirName ? '已选' : '查看预览'}</Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {previewLoading && <Card className="mb-4">加载预览中…</Card>}

        {preview && (
          <Card className="mb-4">
            <h3 className="font-semibold mb-3">预览：{selected}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              <div>章节：<strong>{preview.summary.chapterCount}</strong></div>
              <div>配置：<strong>{preview.summary.configCount}</strong></div>
              <div>脚本：<strong>{preview.summary.scriptCount}</strong></div>
              <div>资产：<strong>{preview.summary.assetCount}</strong></div>
              <div>review：<strong>{preview.summary.reviewCount}</strong></div>
              <div>seedance（视频）：<strong>{preview.summary.seedanceCount}</strong></div>
              <div className="col-span-full text-xs text-gray-500 mt-2">总文件 {preview.summary.totalFiles} · {formatBytes(preview.summary.totalSizeBytes)} · 未映射 {preview.summary.unmappedCount}</div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => setShowConfirm(true)} disabled={importing}>确认导入</Button>
            </div>
            <p className="mt-3 text-xs text-amber-600">本操作只读 novels/ 旧目录，写入新对象到工作目录的 SQLite。</p>
          </Card>
        )}

        {result && (
          <Card className={result.ok ? 'border-green-400' : 'border-red-400'}>
            <div className="font-semibold">{result.ok ? '导入完成' : '导入失败'}</div>
            <div className="text-sm mt-1">{result.message}</div>
            {result.warnings.length > 0 && (
              <ul className="mt-2 text-xs text-amber-600 list-disc list-inside">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </Card>
        )}
      </div>

      <Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)} title="确认导入">
        <p className="text-sm text-gray-600 mb-4">将从 legacy 旧目录 <code className="bg-gray-100 px-1">{selected}</code> 创建新项目（源目录只读不修改）。继续？</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setShowConfirm(false)}>取消</Button>
          <Button onClick={handleImport} loading={importing}>确认导入</Button>
        </div>
      </Modal>
    </div>
  );
}
