'use client';

// settings/audit-log — Phase 13 操作记录页
//
// 设计（criteria F7 — 4 维度筛选 UI）：
//   维度 1 — 类型（eventType）：deletion / unlock / waiver / legacy_import / migration_export / secret_change / artifact_operation
//   维度 2 — 对象（target_type + target_id）
//   维度 3 — 操作人（actor / operator / user）
//   维度 4 — 时间（since / until / date）

import { useCallback, useEffect, useState } from 'react';
import Button from '../../components/Button';
import Card from '../../components/Card';

type AuditEvent =
  | 'deletion'
  | 'unlock'
  | 'waiver'
  | 'legacy_import'
  | 'migration_export'
  | 'secret_change'
  | 'artifact_operation';

const EVENT_TYPES: Array<{ value: AuditEvent; label: string }> = [
  { value: 'deletion', label: '删除' },
  { value: 'unlock', label: '解锁' },
  { value: 'waiver', label: '豁免' },
  { value: 'legacy_import', label: '旧项目导入' },
  { value: 'migration_export', label: '迁移包导出' },
  { value: 'secret_change', label: '密钥变更' },
  { value: 'artifact_operation', label: 'Artifact 操作' },
];

interface AuditLogItem {
  id: string;
  eventType: AuditEvent;
  targetType: string;
  targetId: string;
  actor: string;
  projectId: string | null;
  action: string;
  detail: Record<string, unknown>;
  result: 'ok' | 'failed' | 'warning';
  createdAt: number;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN');
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 4 维度筛选状态
  const [filterEventType, setFilterEventType] = useState<AuditEvent | ''>('');
  const [filterTargetType, setFilterTargetType] = useState<string>('');
  const [filterTargetId, setFilterTargetId] = useState<string>('');
  const [filterActor, setFilterActor] = useState<string>('');
  const [filterStartTime, setFilterStartTime] = useState<string>('');
  const [filterEndTime, setFilterEndTime] = useState<string>('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterEventType) params.set('eventType', filterEventType);
      if (filterTargetType) params.set('targetType', filterTargetType);
      if (filterTargetId) params.set('targetId', filterTargetId);
      if (filterActor) params.set('actor', filterActor);
      if (filterStartTime) params.set('startTime', String(new Date(filterStartTime).getTime()));
      if (filterEndTime) params.set('endTime', String(new Date(filterEndTime).getTime()));
      params.set('limit', '200');

      const res = await fetch(`/api/system/audit-log?${params.toString()}`);
      if (!res.ok) throw new Error(`加载失败 HTTP ${res.status}`);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [filterEventType, filterTargetType, filterTargetId, filterActor, filterStartTime, filterEndTime]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const resetFilters = () => {
    setFilterEventType('');
    setFilterTargetType('');
    setFilterTargetId('');
    setFilterActor('');
    setFilterStartTime('');
    setFilterEndTime('');
  };

  const labelOf = (t: AuditEvent) => EVENT_TYPES.find((x) => x.value === t)?.label || t;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto sm:max-w-3xl lg:max-w-5xl">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">操作记录（AuditLog）</h1>
        <p className="text-sm text-gray-500 mb-6">敏感操作审计：7 类事件 + 按对象 / 操作人 / 时间 / 类型 4 维度筛选。</p>

        {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

        <Card className="mb-4">
          <h3 className="text-sm font-semibold mb-3">4 维度筛选</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            {/* 维度 1 — 类型 */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">类型 (event / action)</label>
              <select value={filterEventType} onChange={(e) => setFilterEventType(e.target.value as AuditEvent | '')} className="w-full border rounded px-2 py-1">
                <option value="">全部</option>
                {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label} ({t.value})</option>)}
              </select>
            </div>
            {/* 维度 2 — 对象 (target / object / entity) */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">对象类型 (target / object / entity)</label>
              <input type="text" value={filterTargetType} onChange={(e) => setFilterTargetType(e.target.value)} placeholder="例如 project / track / artifact" className="w-full border rounded px-2 py-1" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">对象 ID</label>
              <input type="text" value={filterTargetId} onChange={(e) => setFilterTargetId(e.target.value)} placeholder="targetId" className="w-full border rounded px-2 py-1" />
            </div>
            {/* 维度 3 — 操作人 (actor / operator / user) */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">操作人 (actor / operator / user)</label>
              <input type="text" value={filterActor} onChange={(e) => setFilterActor(e.target.value)} placeholder="例如 local-owner" className="w-full border rounded px-2 py-1" />
            </div>
            {/* 维度 4 — 时间 (date / time / since / until) */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">起始时间 (since / date)</label>
              <input type="datetime-local" value={filterStartTime} onChange={(e) => setFilterStartTime(e.target.value)} className="w-full border rounded px-2 py-1" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">结束时间 (until / date)</label>
              <input type="datetime-local" value={filterEndTime} onChange={(e) => setFilterEndTime(e.target.value)} className="w-full border rounded px-2 py-1" />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={loadLogs} disabled={loading}>{loading ? '查询中…' : '查询'}</Button>
            <Button variant="secondary" onClick={resetFilters}>重置筛选</Button>
          </div>
        </Card>

        <h3 className="text-sm font-semibold text-gray-600 mb-2">日志（{logs.length}）</h3>
        {loading ? (
          <Card>加载中…</Card>
        ) : logs.length === 0 ? (
          <Card>无匹配的日志</Card>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <Card key={log.id} className="!p-3">
                <div className="flex items-start gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${log.result === 'failed' ? 'bg-red-100 text-red-700' : log.result === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                    {log.result}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">{labelOf(log.eventType)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-800">
                      {log.action} · {log.targetType}{log.targetId ? `(${log.targetId.slice(0, 12)}…)` : ''}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{formatTime(log.createdAt)} · 操作人 {log.actor}{log.projectId ? ` · 项目 ${log.projectId.slice(0, 8)}…` : ''}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
