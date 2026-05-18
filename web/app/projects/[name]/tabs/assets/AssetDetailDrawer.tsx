'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { SeedanceAsset, SeedanceAssetType } from '../../types';
import type { ModelConfig } from '@/app/lib/novels';
import AssetVersionDrawer from '@/app/components/assets/AssetVersionDrawer';
import AssetEditForm from './AssetEditForm';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import { cleanAssetName, formatEpisodeRef, STATE_DISPLAY } from './utils';
import ImageLightbox from '../production/seedance/ImageLightbox';

interface AssetDetailDrawerProps {
  asset: SeedanceAsset;
  encodedName: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  onStartPolling?: (batchId: string, type: 'polish' | 'generate') => void;
  imageModels: ModelConfig[];
  defaultModelId?: string;
  defaultResolution?: string;
}

const TYPE_COLORS: Record<SeedanceAssetType, string> = {
  character: 'bg-orange-100 text-orange-700',
  scene: 'bg-green-100 text-green-700',
  prop: 'bg-purple-100 text-purple-700',
  costume: 'bg-blue-100 text-blue-700',
  makeup: 'bg-pink-100 text-pink-700',
};

const TYPE_LABELS: Record<SeedanceAssetType, string> = {
  character: '角色',
  scene: '场景',
  prop: '道具',
  costume: '服装',
  makeup: '妆发',
};

const TYPE_ICON_COLORS: Record<SeedanceAssetType, string> = {
  character: 'text-orange-500',
  scene: 'text-green-600',
  prop: 'text-purple-500',
  costume: 'text-blue-500',
  makeup: 'text-pink-500',
};

const TYPE_ICON_PATHS: Record<SeedanceAssetType, string> = {
  character: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  scene: 'M4 16l4-4 4 4 4-8 4 8M2 20h20',
  prop: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  costume: 'M8 3l4 3 4-3 3 4-3 2v10H8V9L5 7l3-4z',
  makeup: 'M7 21l10-10 3 3-10 10H7v-3zM14 4l6 6m-2-8l4 4',
};

/** 右侧详情抽屉 */
export default function AssetDetailDrawer({ asset, encodedName, isOpen, onClose, onSaved, onDeleted, onStartPolling, imageModels, defaultModelId, defaultResolution }: AssetDetailDrawerProps) {
  const [editState, setEditState] = useState({
    name: asset.name,
    identityAnchor: asset.identityAnchor || [],
    prompt: asset.prompt,
    modelId: asset.modelId || defaultModelId || '',
    resolution: asset.resolution || defaultResolution || '',
  });
  const [isEditingName, setIsEditingName] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const moreMenuRef = useRef<HTMLDivElement>(null);

  // asset 变化时重置编辑状态
  useEffect(() => {
    setEditState({
      name: asset.name,
      identityAnchor: asset.identityAnchor || [],
      prompt: asset.prompt,
      modelId: asset.modelId || defaultModelId || '',
      resolution: asset.resolution || defaultResolution || '',
    });
    setIsEditingName(false);
  }, [asset]);

  // 脏检查
  const isDirty = useMemo(() => {
    return (
      editState.name !== asset.name ||
      editState.prompt !== asset.prompt ||
      editState.modelId !== (asset.modelId || defaultModelId || '') ||
      editState.resolution !== (asset.resolution || defaultResolution || '') ||
      JSON.stringify(editState.identityAnchor) !== JSON.stringify(asset.identityAnchor || [])
    );
  }, [editState, asset]);

  // 处理字段变更
  const handleChange = useCallback((field: string, value: string | string[]) => {
    setEditState((prev) => ({ ...prev, [field]: value }));
  }, []);

  // 保存
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (editState.name !== asset.name) body.name = editState.name;
      if (editState.prompt !== asset.prompt) body.prompt = editState.prompt;
      if (editState.modelId !== (asset.modelId || '')) body.modelId = editState.modelId;
      if (editState.resolution !== (asset.resolution || '')) body.resolution = editState.resolution;
      if (JSON.stringify(editState.identityAnchor) !== JSON.stringify(asset.identityAnchor || [])) {
        body.identityAnchor = editState.identityAnchor;
      }
      const res = await fetch(`/api/projects/${encodedName}/seedance/assets/${asset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '保存失败');
      }
      onSaved();
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }, [editState, asset, encodedName, onSaved]);

  // 关闭逻辑（dirty 时自动保存）
  const handleClose = useCallback(async () => {
    if (isDirty) {
      await handleSave();
    }
    onClose();
  }, [isDirty, onClose, handleSave]);

  // Esc 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !showDelete) handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, handleClose, showDelete]);

  // 点击外部关闭"更多"菜单
  useEffect(() => {
    if (!showMoreMenu) return;
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMoreMenu]);

  // 删除
  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${encodedName}/seedance/assets/${asset.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '删除失败');
      }
      setShowDelete(false);
      onDeleted();
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  // AI 润色
  const handlePolish = async () => {
    if (isDirty) await handleSave();
    setPolishing(true);
    try {
      const res = await fetch(`/api/projects/${encodedName}/seedance/assets/batch-polish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetIds: [asset.id], overwrite: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '润色请求失败');
      }
      onSaved();
      if (data.batchId && onStartPolling) {
        onStartPolling(data.batchId, 'polish');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '润色失败');
    } finally {
      setPolishing(false);
    }
  };

  // 重新生成
  const handleRegenerate = async () => {
    if (isDirty) await handleSave();
    setRegenerating(true);
    try {
      const model = editState.modelId || undefined;
      const resolution = editState.resolution || undefined;
      const res = await fetch(`/api/projects/${encodedName}/seedance/assets/batch-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetIds: [asset.id], modelId: model, resolution, overwrite: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '生成请求失败');
      }
      onSaved();
      if (data.batchId && onStartPolling) {
        onStartPolling(data.batchId, 'generate');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '生成失败');
    } finally {
      setRegenerating(false);
    }
  };

  // 下载
  const handleDownload = () => {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `${asset.name}.png`;
    a.click();
  };

  // 图片 URL（用 generatedAt 破坏缓存，确保重新生成后显示新图）
  const imageUrl = asset.imagePath
    ? `/api/projects/${encodedName}/assets/images/${asset.imagePath}${asset.generatedAt ? `?t=${encodeURIComponent(asset.generatedAt)}` : ''}`
    : null;

  // 状态显示
  const stateDisplay = STATE_DISPLAY[asset.state];

  return (
    <>
      {/* 遮罩 */}
      <div
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={handleClose}
      />

      {/* 抽屉面板 */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[60%] lg:w-[45%] lg:max-w-[640px] lg:min-w-[400px] bg-white shadow-xl z-50 flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <svg className={`w-5 h-5 shrink-0 ${TYPE_ICON_COLORS[asset.type]}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={TYPE_ICON_PATHS[asset.type]} />
            </svg>
            {isEditingName ? (
              <input
                type="text"
                value={editState.name}
                onChange={(e) => handleChange('name', e.target.value)}
                onBlur={() => setIsEditingName(false)}
                onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingName(false); }}
                autoFocus
                className="text-base font-semibold text-gray-800 border-b-2 border-purple-400 outline-none bg-transparent w-full"
              />
            ) : (
              <span
                onClick={() => setIsEditingName(true)}
                className="text-base font-semibold text-gray-800 truncate cursor-pointer hover:text-purple-600 transition-colors duration-150"
              >
                {cleanAssetName(editState.name)}
              </span>
            )}
            <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${TYPE_COLORS[asset.type]}`}>
              {TYPE_LABELS[asset.type]}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* 更多菜单 */}
            <div className="relative" ref={moreMenuRef}>
              <button
                onClick={() => setShowMoreMenu(prev => !prev)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-150"
              >
                <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="5" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="12" cy="19" r="1.5" />
                </svg>
              </button>
              {showMoreMenu && (
                <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1">
                  <button
                    onClick={() => { setShowMoreMenu(false); setShowDelete(true); }}
                    className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors duration-150"
                  >
                    删除资产
                  </button>
                </div>
              )}
            </div>
            {/* 关闭按钮 */}
            <button
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-150"
            >
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 可滚动内容区 */}
        <div className="flex-1 overflow-y-auto">
          {/* 图片预览区 */}
          <div className="relative w-full bg-gray-900 min-h-[200px]">
            {imageUrl && asset.state === 'success' ? (
              <>
                <img src={imageUrl} alt={asset.name} className="w-full max-h-[360px] object-contain" />
                {/* 右下角操作按钮 */}
                <div className="absolute bottom-3 right-3 flex gap-1.5">
                  <button
                    onClick={() => setLightboxOpen(true)}
                    className="w-8 h-8 flex items-center justify-center bg-white/80 backdrop-blur-sm hover:bg-white rounded-lg text-gray-600 hover:text-gray-800 transition shadow-sm"
                    title="全屏查看"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  </button>
                  <button
                    onClick={handleDownload}
                    className="w-8 h-8 flex items-center justify-center bg-white/80 backdrop-blur-sm hover:bg-white rounded-lg text-gray-600 hover:text-gray-800 transition shadow-sm"
                    title="下载"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                </div>
              </>
            ) : asset.state === 'generating' && asset.updatedAt && (Date.now() - new Date(asset.updatedAt).getTime()) > 30 * 60 * 1000 ? (
              <div className="w-full min-h-[200px] bg-gray-50 flex flex-col items-center justify-center gap-3">
                <svg className="w-10 h-10 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm text-amber-600">生成超时</span>
                <span className="text-xs text-gray-400">请点击下方「重新生成」重试</span>
              </div>
            ) : asset.state === 'generating' ? (
              <div className="w-full min-h-[200px] bg-gray-50 flex flex-col items-center justify-center gap-3">
                <div className="w-10 h-10 border-2 border-purple-200 border-t-purple-500 rounded-full animate-spin" />
                <span className="text-sm text-gray-500">图片生成中...</span>
                <span className="text-xs text-gray-400">通常需要 30-60 秒</span>
              </div>
            ) : asset.state === 'failed' ? (
              <div className="w-full min-h-[200px] bg-red-50/50 flex flex-col items-center justify-center gap-2">
                <svg className="w-10 h-10 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm text-red-500">生成失败</span>
                {asset.error && <span className="text-xs text-red-400 max-w-[80%] text-center">{asset.error}</span>}
              </div>
            ) : (
              <div className="w-full min-h-[200px] bg-gray-50 flex flex-col items-center justify-center gap-3">
                <svg className={`w-12 h-12 text-gray-200`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d={TYPE_ICON_PATHS[asset.type]} />
                </svg>
                <span className="text-sm text-gray-400 font-medium">尚未生成参考图</span>
                <span className="text-xs text-gray-300">填写提示词后点击「重新生成」</span>
              </div>
            )}
          </div>

          {/* 编辑区 */}
          <AssetEditForm
            asset={asset}
            editState={editState}
            onChange={handleChange}
            imageModels={imageModels}
          />

          {/* 元信息行 */}
          <div className="px-6 py-3">
            <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${stateDisplay.className}`}>
                {stateDisplay.label}
              </span>
              {(asset.versionCount || 0) > 0 && (
                <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px]">
                  v{asset.canonicalVersionNo || '?'} / {asset.versionCount} 版
                </span>
              )}
              {asset.promptState === 'generating' && (
                <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[10px]">
                  提示词生成中
                </span>
              )}
              {asset.promptState === 'failed' && (
                <span className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded text-[10px]" title={asset.promptError || ''}>
                  提示词失败
                </span>
              )}
              {asset.sourceEpisode && (
                <>
                  <span className="text-gray-200">·</span>
                  <span>来源 {formatEpisodeRef(asset.sourceEpisode)}</span>
                </>
              )}
              <span className="text-gray-200">·</span>
              <span className="font-mono text-gray-300">{asset.id}</span>
            </div>
          </div>

          <AssetVersionDrawer
            asset={asset}
            encodedName={encodedName}
            onChanged={onSaved}
          />
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center gap-3 px-6 py-3 border-t border-gray-100 shrink-0 bg-white">
          <button
            onClick={handlePolish}
            disabled={polishing || !editState.prompt}
            className="flex-1 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {polishing ? (
              <>
                <span className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                润色中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
                AI 润色
              </>
            )}
          </button>
          <button
            onClick={handleRegenerate}
            disabled={regenerating || !editState.prompt}
            className="flex-1 py-2 text-sm font-medium rounded-lg bg-gray-800 hover:bg-gray-900 text-white transition inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {regenerating ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                重新生成
              </>
            )}
          </button>
        </div>
      </div>

      {/* 删除确认 */}
      <DeleteConfirmDialog
        isOpen={showDelete}
        assetName={asset.name}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
        loading={deleting}
      />

      {/* 全屏图片查看器 */}
      {lightboxOpen && imageUrl && (
        <ImageLightbox src={imageUrl} alt={asset.name} onClose={() => setLightboxOpen(false)} />
      )}
    </>
  );
}
