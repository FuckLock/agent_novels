'use client';

// settings/project-migration-package — Phase 13 整工程迁移包导出/恢复页
//
// 设计：导出 manifest → 显示 6 类核心字段 + 一致性快照 + 排除的 SecretRef → 用户校验 → 下载
// 边界（criteria F3 — 反向 grep）：本页不 import 任何 Phase 11 delivery 体系组件 / service

import { useCallback, useEffect, useState } from 'react';
import Button from '../../components/Button';
import Card from '../../components/Card';
import Modal from '../../components/Modal';

interface ProjectItem {
  id: string;
  name: string;
}

interface MigrationManifest {
  packageId: string;
  schemaVersion: number;
  dbRevision: number;
  generatedAt: number;
  projectId: string;
  projectName: string;
  artifactHash: string;
  missing: { count: number; missingArtifacts: string[]; missingItem: string[] };
  runningTask: { inflight: number; pendingTasks: string[] };
  excludedFromPackage: string[];
  excludedSecrets: Array<{ refId: string; type: string; reason: string }>;
  secretsExcluded: number;
  consistentSnapshot: { snapshotAt: number; transactionStartedAt: number; tableRowCounts: Array<{ table: string; rows: number }> };
  summary: { tableCount: number; artifactCount: number; totalArtifactBytes: number; chapterCount: number; trackCount: number; takeCount: number; taskCount: number };
  notes: string[];
}

interface ExportRecord {
  id: string;
  projectId: string;
  manifest: MigrationManifest;
  artifactId: string | null;
  createdAt: number;
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export default function ProjectMigrationPackagePage() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exportRecord, setExportRecord] = useState<ExportRecord | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/system/migration-package?action=list-projects');
      if (!res.ok) throw new Error(`加载项目列表失败 HTTP ${res.status}`);
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载项目失败');
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const handleExport = async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    setShowConfirm(false);
    setError('');
    try {
      const res = await fetch('/api/system/migration-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'export', projectId: selectedProjectId }),
      });
      if (!res.ok) throw new Error(`导出失败 HTTP ${res.status}`);
      const data = await res.json();
      setExportRecord(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败');
    } finally {
      setLoading(false);
    }
  };

  const downloadManifest = () => {
    if (!exportRecord) return;
    const blob = new Blob([JSON.stringify(exportRecord.manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `migration-package-${exportRecord.manifest.packageId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto sm:max-w-3xl lg:max-w-5xl">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">整工程迁移包</h1>
        <p className="text-sm text-gray-500 mb-6">ProjectMigrationPackage 一致性快照：导出 manifest + Artifact 引用清单。<strong className="text-amber-600">默认排除 SecretRef</strong>（apiKey / token 不会打包），恢复时需重新配置。</p>

        {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

        <Card className="mb-4">
          <h3 className="text-sm font-semibold mb-3">选择项目</h3>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
          >
            <option value="">— 请选择项目 —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.id.slice(0, 8)}…)</option>
            ))}
          </select>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => setShowConfirm(true)} disabled={!selectedProjectId || loading}>{loading ? '导出中…' : '生成迁移包'}</Button>
            <Button variant="secondary" onClick={loadProjects}>刷新项目列表</Button>
          </div>
        </Card>

        {exportRecord && (
          <Card className="border-green-400">
            <h3 className="font-semibold mb-3">manifest 已生成</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>包 ID：<code className="bg-gray-100 px-1">{exportRecord.manifest.packageId.slice(0, 12)}…</code></div>
              <div>schemaVersion：<strong>{exportRecord.manifest.schemaVersion}</strong></div>
              <div>dbRevision：<strong>{exportRecord.manifest.dbRevision}</strong></div>
              <div>artifactHash：<code className="bg-gray-100 px-1 text-xs">{exportRecord.manifest.artifactHash.slice(0, 16)}…</code></div>
              <div>Artifact 数：<strong>{exportRecord.manifest.summary.artifactCount}</strong></div>
              <div>总大小：<strong>{formatBytes(exportRecord.manifest.summary.totalArtifactBytes)}</strong></div>
              <div>缺失项：<strong className={exportRecord.manifest.missing.count > 0 ? 'text-amber-600' : ''}>{exportRecord.manifest.missing.count}</strong></div>
              <div>运行中任务：<strong className={exportRecord.manifest.runningTask.inflight > 0 ? 'text-amber-600' : ''}>{exportRecord.manifest.runningTask.inflight}</strong></div>
            </div>

            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded">
              <h4 className="text-sm font-semibold text-amber-700">被排除的敏感配置（{exportRecord.manifest.secretsExcluded}）</h4>
              <p className="text-xs text-amber-700 mt-1">SecretRef / apiKey / token 等敏感信息默认排除，不会打入迁移包。恢复后需在目标实例重新配置。</p>
              {exportRecord.manifest.excludedSecrets.length > 0 && (
                <ul className="mt-2 text-xs text-amber-800 list-disc list-inside">
                  {exportRecord.manifest.excludedSecrets.slice(0, 5).map((s) => (
                    <li key={s.refId}>{s.type}：{s.reason}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4">
              <h4 className="text-sm font-semibold">一致性快照：{exportRecord.manifest.consistentSnapshot.tableRowCounts.length} 张表</h4>
              <div className="text-xs text-gray-600 mt-1 grid grid-cols-2 gap-1">
                {exportRecord.manifest.consistentSnapshot.tableRowCounts.map((t) => (
                  <div key={t.table}>{t.table}: {t.rows}</div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button onClick={downloadManifest}>下载 manifest JSON</Button>
            </div>

            {exportRecord.manifest.notes.length > 0 && (
              <ul className="mt-3 text-xs text-gray-500 list-disc list-inside">
                {exportRecord.manifest.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            )}
          </Card>
        )}
      </div>

      <Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)} title="确认生成迁移包">
        <p className="text-sm text-gray-600 mb-4">将为项目生成一致性快照 + manifest（不包含 apiKey / token 等敏感配置）。继续？</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setShowConfirm(false)}>取消</Button>
          <Button onClick={handleExport} loading={loading}>确认</Button>
        </div>
      </Modal>
    </div>
  );
}
