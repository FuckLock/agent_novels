'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface TimelineEntry {
  id: string;
  assetId: string;
  assetVersionId: string;
  episodeIndex: number;
  appearanceType: string;
  riskLevel: string;
  summary: string;
  asset: {
    id: string;
    name: string;
    type: string;
    canonicalVersionId: string | null;
  };
  versionNo: number;
  flags: string[];
  trackReferences: Array<{ episodeIndex: number; role: string; source: string }>;
}

interface TimelineResponse {
  project: { name: string };
  entries: TimelineEntry[];
  summary: {
    total: number;
    reuse: number;
    variants: number;
    driftRisks: number;
    canonicalMismatches: number;
  };
}

const TYPE_LABELS: Record<string, string> = {
  character: '角色',
  scene: '场景',
  prop: '道具',
  costume: '服装',
  makeup: '妆发',
};

const APPEARANCE_LABELS: Record<string, string> = {
  new: '首次出现',
  reuse: '复用',
  variant: '变体',
  canonical_mismatch: '正片不一致',
  drift_risk: '漂移风险',
};

export default function IpTimelinePage() {
  const params = useParams();
  const encodedName = params.name as string;
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [episodeFilter, setEpisodeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    let alive = true;
    fetch(`/api/projects/${encodedName}/ip-timeline`)
      .then((res) => res.json())
      .then((next) => {
        if (alive) setData(next);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [encodedName]);

  const entries = useMemo(() => {
    const source = data?.entries || [];
    return source.filter((entry) => {
      if (typeFilter !== 'all' && entry.asset.type !== typeFilter) return false;
      if (riskFilter !== 'all' && entry.riskLevel !== riskFilter) return false;
      if (episodeFilter !== 'all' && String(entry.episodeIndex) !== episodeFilter) return false;
      if (statusFilter !== 'all' && entry.appearanceType !== statusFilter) return false;
      return true;
    });
  }, [data, episodeFilter, riskFilter, statusFilter, typeFilter]);

  const episodeOptions = useMemo(() => {
    return Array.from(new Set((data?.entries || []).map((entry) => entry.episodeIndex))).sort((a, b) => a - b);
  }, [data]);

  return (
    <div className="min-h-full bg-[var(--tf-bg-canvas)]">
      <div className="flex min-h-14 items-center justify-between border-b border-[var(--tf-border-subtle)] bg-[var(--tf-bg-panel)] px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/projects/${encodedName}`} className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--tf-radius-sm)] text-[var(--tf-text-secondary)] hover:bg-[var(--tf-bg-raised)]">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-base font-semibold text-[var(--tf-text-primary)]">跨集 IP 时间线</h1>
            <p className="text-xs text-[var(--tf-text-muted)]">{data?.project.name || decodeURIComponent(encodedName)}</p>
          </div>
        </div>
        {data && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="rounded bg-white px-2 py-1 border border-gray-200">引用 {data.summary.total}</span>
            <span className="rounded bg-white px-2 py-1 border border-gray-200">变体 {data.summary.variants}</span>
            <span className="rounded bg-white px-2 py-1 border border-gray-200">漂移 {data.summary.driftRisks}</span>
            <span className="rounded bg-white px-2 py-1 border border-gray-200">不一致 {data.summary.canonicalMismatches}</span>
          </div>
        )}
      </div>

      <main className="p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
          >
            <option value="all">全部类型</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            value={riskFilter}
            onChange={(event) => setRiskFilter(event.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
          >
            <option value="all">全部风险</option>
            <option value="low">低风险</option>
            <option value="medium">中风险</option>
            <option value="high">高风险</option>
          </select>
          <select
            value={episodeFilter}
            onChange={(event) => setEpisodeFilter(event.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
          >
            <option value="all">全部集数</option>
            {episodeOptions.map((episode) => (
              <option key={episode} value={episode}>第 {episode} 集</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
          >
            <option value="all">全部一致性</option>
            {Object.entries(APPEARANCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">加载中...</div>
        ) : entries.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">
            暂无跨集资产引用。先在剧本详情里保存关联资产。
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">集数</th>
                  <th className="px-4 py-3 text-left font-medium">资产</th>
                  <th className="px-4 py-3 text-left font-medium">版本</th>
                  <th className="px-4 py-3 text-left font-medium">状态</th>
                  <th className="px-4 py-3 text-left font-medium">风险</th>
                  <th className="px-4 py-3 text-left font-medium">说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50/70">
                    <td className="px-4 py-3 text-gray-700">第 {entry.episodeIndex} 集</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{entry.asset.name}</div>
                      <div className="text-xs text-gray-400">{TYPE_LABELS[entry.asset.type] || entry.asset.type}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">v{entry.versionNo}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <div>{APPEARANCE_LABELS[entry.appearanceType] || entry.appearanceType}</div>
                      <div className="mt-1 text-xs text-gray-400">Track 引用 {entry.trackReferences.length}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-1 text-xs ${
                        entry.riskLevel === 'high'
                          ? 'bg-red-50 text-red-700'
                          : entry.riskLevel === 'medium'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-emerald-50 text-emerald-700'
                      }`}>
                        {entry.riskLevel === 'high' ? '高' : entry.riskLevel === 'medium' ? '中' : '低'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{entry.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
