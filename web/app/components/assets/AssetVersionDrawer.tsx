'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SeedanceAsset } from '@/app/projects/[name]/types';

interface AssetVersion {
  id: string;
  versionNo: number;
  source: string;
  prompt: string;
  imagePath: string;
  imageUrl: string;
  modelId: string;
  resolution: string;
  status: string;
  authorization: string;
  trackReferences: Array<{ episodeIndex: number; role: string; source: string }>;
  createdAt: string;
}

interface VersionResponse {
  canonicalVersionId: string | null;
  versions: AssetVersion[];
}

interface AssetVersionDrawerProps {
  asset: SeedanceAsset;
  encodedName: string;
  onChanged: () => void;
}

const SOURCE_LABELS: Record<string, string> = {
  manual: '手动',
  uploaded: '上传',
  generated: '生成',
  frame_extract: '抽帧',
  replacement: '替换',
  prompt_candidate: '提示词',
};

export default function AssetVersionDrawer({ asset, encodedName, onChanged }: AssetVersionDrawerProps) {
  const [data, setData] = useState<VersionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadVersions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${encodedName}/assets/${asset.id}/versions`);
      const next = await res.json();
      if (!res.ok) throw new Error(next.error || '版本加载失败');
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '版本加载失败');
    } finally {
      setLoading(false);
    }
  }, [asset.id, encodedName]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  const updateVersion = async (versionId: string, action: 'canonical' | 'archive') => {
    setBusyId(versionId);
    try {
      const res = await fetch(`/api/projects/${encodedName}/assets/${asset.id}/versions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'archive' ? { action, versionId } : { versionId }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || '版本更新失败');
      await loadVersions();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '版本更新失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="px-6 py-4 border-t border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">版本</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            当前正片版本：{data?.canonicalVersionId ? `已固定` : '未固定'}
          </p>
        </div>
        <button
          onClick={loadVersions}
          disabled={loading}
          className="w-8 h-8 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
          title="刷新版本"
        >
          <svg className={`w-4 h-4 mx-auto ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 4v5h5M20 20v-5h-5M5 15a7 7 0 0012 3M19 9A7 7 0 007 6" />
          </svg>
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="text-sm text-gray-400 py-6 text-center">版本加载中...</div>
      ) : data && data.versions.length > 0 ? (
        <div className="space-y-2">
          {data.versions.map((version) => {
            const isCanonical = version.id === data.canonicalVersionId || version.status === 'canonical';
            const imagePath = version.imagePath || asset.imagePath;
            const imageUrl = imagePath ? `/api/projects/${encodedName}/assets/images/${imagePath}` : null;
            return (
              <div key={version.id} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex gap-3">
                  <div className="w-16 h-16 rounded-md bg-gray-50 border border-gray-100 overflow-hidden shrink-0">
                    {imageUrl ? (
                      <img src={imageUrl} alt={`v${version.versionNo}`} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">无图</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">v{version.versionNo}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                        {SOURCE_LABELS[version.source] || version.source}
                      </span>
                      {isCanonical && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                          正片
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      {version.modelId || '未记录模型'} · {version.resolution || '未记录尺寸'} · {new Date(version.createdAt).toLocaleString()}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-gray-500">
                      <span className="rounded bg-gray-50 px-1.5 py-0.5">
                        授权：{version.authorization || '未记录授权'}
                      </span>
                      <span className="rounded bg-gray-50 px-1.5 py-0.5">
                        Track 引用：{(version.trackReferences || []).length}
                      </span>
                      {(version.trackReferences || []).slice(0, 3).map((ref) => (
                        <span key={`${version.id}-${ref.episodeIndex}-${ref.role}`} className="rounded bg-gray-50 px-1.5 py-0.5">
                          第{ref.episodeIndex}集 · {ref.role}
                        </span>
                      ))}
                    </div>
                    {version.prompt && (
                      <p className="mt-2 text-xs text-gray-500 line-clamp-2">{version.prompt}</p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    onClick={() => updateVersion(version.id, 'canonical')}
                    disabled={isCanonical || busyId === version.id}
                    className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    设为正片
                  </button>
                  <button
                    onClick={() => updateVersion(version.id, 'archive')}
                    disabled={isCanonical || busyId === version.id}
                    className="px-3 py-1.5 rounded-lg text-xs border border-red-100 text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    归档
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-gray-400 py-6 text-center">暂无版本记录</div>
      )}
    </div>
  );
}
