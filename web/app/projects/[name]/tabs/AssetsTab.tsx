'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { SeedanceAsset, SeedanceAssetType, BatchProgress } from '../types';
import AssetCardGrid from './assets/AssetCardGrid';
import AssetCard from './assets/AssetCard';
import AssetCardSkeleton from './assets/AssetCardSkeleton';
import AssetEmptyState from './assets/AssetEmptyState';
import AssetDetailDrawer from './assets/AssetDetailDrawer';
import CreateAssetModal from './assets/CreateAssetModal';
import ExtractFromOutlineModal from './assets/ExtractFromOutlineModal';
import BatchPanel from './assets/BatchPanel';
import type { ModelConfig } from '@/app/lib/novels';


interface AssetsTabProps {
  encodedName: string;
  scripts?: { episode: number; name?: string }[];
}

/** 塑造 Tab 页面主入口（双栏布局） */
export default function AssetsTab({ encodedName, scripts = [] }: AssetsTabProps) {
  // 数据状态
  const [assets, setAssets] = useState<SeedanceAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 批量选择
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 类型筛选（多选复选框）
  const [visibleTypes, setVisibleTypes] = useState<Set<SeedanceAssetType>>(
    new Set(['character', 'scene', 'prop', 'costume', 'makeup'])
  );

  // 搜索
  const [searchQuery, setSearchQuery] = useState('');

  // 批量操作模型/分辨率
  const [batchModel, setBatchModel] = useState('');
  const [batchResolution, setBatchResolution] = useState('');

  // 模型列表
  const [imageModels, setImageModels] = useState<ModelConfig[]>([]);
  const [languageModels, setLanguageModels] = useState<Array<{ modelId: string; name: string }>>([]);
  const [batchTextModel, setBatchTextModel] = useState('');

  // 批量进度
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);

  // 弹窗/抽屉控制
  const [selectedAsset, setSelectedAsset] = useState<SeedanceAsset | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showExtract, setShowExtract] = useState(false);

  // 从最新 assets 列表中获取选中资产（避免旧快照问题）
  const currentSelectedAsset = useMemo(() => {
    if (!selectedAsset) return null;
    return assets.find(a => a.id === selectedAsset.id) || null;
  }, [assets, selectedAsset]);

  // 如果选中的资产已被删除，自动关闭抽屉
  useEffect(() => {
    if (selectedAsset && !currentSelectedAsset) {
      setSelectedAsset(null);
    }
  }, [selectedAsset, currentSelectedAsset]);

  // 轮询 interval ref
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 加载资产列表（silent=true 时静默刷新，不触发 loading 状态）
  const loadAssets = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch(`/api/projects/${encodedName}/seedance/assets`);
      if (!res.ok) throw new Error('加载失败');
      const data = await res.json();
      setAssets(Array.isArray(data) ? data : data.assets || []);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : '加载失败');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [encodedName]);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  // 加载可用模型（图片 + 语言）
  useEffect(() => {
    const getDefaultResolution = (model: ModelConfig): string => {
      const params = model.defaultParams || {};
      const sizeOptions = model.capabilities?.sizeOptions || [];
      return (params.imageSize as string)
        || (params.size as string)
        || sizeOptions[0]
        || '';
    };

    fetch('/api/settings/models')
      .then(res => res.json())
      .then(data => {
        const imgModels = (data.image || []).filter((m: ModelConfig) => m.enabled !== false);
        setImageModels(imgModels);
        if (imgModels.length > 0) {
          setBatchModel(prev => prev || imgModels[0].modelId);
          setBatchResolution(prev => prev || getDefaultResolution(imgModels[0]));
        }
        const langModels = (data.language || []).filter((m: { modelId: string; name: string; enabled?: boolean }) => m.enabled !== false);
        setLanguageModels(langModels);
        if (langModels.length > 0) {
          setBatchTextModel(prev => prev || langModels[0].modelId);
        }
      })
      .catch(() => {});
  }, []);

  const handleImageModelChange = useCallback((modelId: string) => {
    setBatchModel(modelId);
    const model = imageModels.find((m) => m.modelId === modelId);
    if (!model) return;
    const params = model.defaultParams || {};
    const nextResolution = (params.imageSize as string)
      || (params.size as string)
      || model.capabilities?.sizeOptions?.[0]
      || '';
    setBatchResolution(nextResolution);
  }, [imageModels]);

  // 组件卸载时清理轮询
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // 派生状态：筛选 + 搜索
  const filteredAssets = useMemo(() => {
    let result = assets;
    // 类型筛选
    if (visibleTypes.size > 0 && visibleTypes.size < 5) {
      result = result.filter(a => visibleTypes.has(a.type));
    }
    // 搜索
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(a => a.name.toLowerCase().includes(q));
    }
    return result;
  }, [assets, visibleTypes, searchQuery]);

  const counts = useMemo(() => ({
    character: assets.filter((a) => a.type === 'character').length,
    scene: assets.filter((a) => a.type === 'scene').length,
    prop: assets.filter((a) => a.type === 'prop').length,
    costume: assets.filter((a) => a.type === 'costume').length,
    makeup: assets.filter((a) => a.type === 'makeup').length,
  }), [assets]);

  // 选择操作函数
  const selectionActions = useMemo(() => ({
    selectByCondition: (predicate: (a: SeedanceAsset) => boolean) => {
      const ids = new Set(filteredAssets.filter(predicate).map(a => a.id));
      setSelectedIds(ids);
    },
    invertSelection: () => {
      const allFilteredIds = new Set(filteredAssets.map(a => a.id));
      setSelectedIds(prev => {
        const next = new Set<string>();
        allFilteredIds.forEach(id => { if (!prev.has(id)) next.add(id); });
        return next;
      });
    },
    deselectAll: () => setSelectedIds(new Set()),
    toggle: (id: string) => {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
  }), [filteredAssets]);

  // 类型切换处理
  const handleToggleTypeFilter = useCallback((type: SeedanceAssetType) => {
    setVisibleTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  // 轮询函数
  const startPolling = useCallback((batchId: string, type: 'polish' | 'generate') => {
    // 先清理旧轮询
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    const endpoint = type === 'polish' ? 'polish-status' : 'generate-status';

    // 超时保护：最大轮询 600 次（3s * 600 = 30 分钟）。
    // 单张图生成时 completed 会一直是 0，不能用“进度不变”判断停滞。
    const MAX_POLL_COUNT = 600;
    let pollCount = 0;

    pollingRef.current = setInterval(async () => {
      pollCount++;

      // 超过最大轮询次数，强制停止
      if (pollCount > MAX_POLL_COUNT) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        setBatchProgress(prev => prev ? { ...prev, isComplete: true } : null);
        loadAssets(true);
        return;
      }

      try {
        const res = await fetch(`/api/projects/${encodedName}/seedance/assets/${endpoint}?batchId=${batchId}`);
        if (!res.ok) return;
        const data = await res.json();

        setBatchProgress({
          batchId: data.batchId,
          type,
          total: data.total,
          completed: data.completed,
          succeeded: data.succeeded,
          failed: data.failed,
          isComplete: data.isComplete,
        });
        // 每次轮询都静默刷新资产列表
        loadAssets(true);
        if (data.isComplete) {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }
      } catch {
        // 轮询出错不停止
      }
    }, 3000);
  }, [encodedName, loadAssets]);

  // 批量生成提示词
  const handleBatchGeneratePrompts = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const res = await fetch(`/api/projects/${encodedName}/seedance/assets/batch-polish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetIds: ids, modelId: batchTextModel || undefined, overwrite: true }),
      });
      if (!res.ok) throw new Error('启动失败');
      const data = await res.json();
      setBatchProgress({
        batchId: data.batchId,
        type: 'polish',
        total: data.total,
        completed: 0,
        succeeded: 0,
        failed: 0,
        isComplete: false,
      });
      startPolling(data.batchId, 'polish');
    } catch (err) {
      console.error(err);
    }
  }, [selectedIds, encodedName, batchTextModel, startPolling]);

  // 批量生成图片（接受参数避免闭包旧值问题）
  const handleBatchGenerateImages = useCallback(async (model?: string, resolution?: string) => {
    const useModel = model || batchModel;
    const useResolution = resolution || batchResolution;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const res = await fetch(`/api/projects/${encodedName}/seedance/assets/batch-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetIds: ids, modelId: useModel, resolution: useResolution, overwrite: true }),
      });
      if (!res.ok) throw new Error('启动失败');
      const data = await res.json();
      setBatchProgress({
        batchId: data.batchId,
        type: 'generate',
        total: data.total,
        completed: 0,
        succeeded: 0,
        failed: 0,
        isComplete: false,
      });
      startPolling(data.batchId, 'generate');
    } catch (err) {
      console.error(err);
    }
  }, [selectedIds, encodedName, batchModel, batchResolution, startPolling]);

  // 抽屉关闭后清空选中
  const handleDrawerClose = useCallback(() => {
    setSelectedAsset(null);
  }, []);

  // 保存/删除后刷新列表
  const handleSaved = useCallback(() => {
    loadAssets();
  }, [loadAssets]);

  const handleDeleted = useCallback(() => {
    setSelectedAsset(null);
    loadAssets();
  }, [loadAssets]);

  const handleCreated = useCallback(() => {
    loadAssets();
  }, [loadAssets]);

  const handleExtracted = useCallback(() => {
    loadAssets();
  }, [loadAssets]);

  return (
    <div className="space-y-4">
      {/* 标题区 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">塑造</h2>
          <p className="text-sm text-gray-500">管理角色、场景、道具的视觉资产</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${encodedName}/ip-timeline`}
            className="px-3 py-1.5 text-sm border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors duration-150 inline-flex items-center gap-1.5"
          >
            时间线
          </Link>
          {/* 搜索框 */}
          <input
            type="text"
            placeholder="搜索资产..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300"
          />
          {/* 新增按钮 */}
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors duration-150 inline-flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新增
          </button>
        </div>
      </div>

      {/* 双栏布局 */}
      <div className="flex gap-4">
        {/* 左侧面板 */}
        <BatchPanel
          assets={assets}
          filteredAssets={filteredAssets}
          selectedIds={selectedIds}
          visibleTypes={visibleTypes}
          counts={counts}
          batchProgress={batchProgress}
          textModels={languageModels}
          imageModels={imageModels}
          selectedTextModel={batchTextModel}
          selectedImageModel={batchModel}
          selectedResolution={batchResolution}
          onTextModelChange={setBatchTextModel}
          onImageModelChange={handleImageModelChange}
          onResolutionChange={setBatchResolution}
          onSelectByCondition={selectionActions.selectByCondition}
          onInvertSelection={selectionActions.invertSelection}
          onDeselectAll={selectionActions.deselectAll}
          onToggleTypeFilter={handleToggleTypeFilter}
          onBatchGeneratePrompts={handleBatchGeneratePrompts}
          onBatchGenerateImages={() => handleBatchGenerateImages()}
          onReExtract={() => setShowExtract(true)}
        />

        {/* 右侧内容区 */}
        <div className="flex-1 min-w-0">
          {/* 错误提示 */}
          {error && !loading && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
              <div className="flex items-center">
                <svg className="w-4 h-4 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm text-red-600">加载资产数据失败</span>
              </div>
              <button onClick={() => loadAssets()} className="text-sm text-red-600 hover:text-red-700 font-medium cursor-pointer">
                重试
              </button>
            </div>
          )}

          {/* 加载中 -- 骨架屏 */}
          {loading && (
            <AssetCardGrid>
              {Array.from({ length: 8 }).map((_, i) => (
                <AssetCardSkeleton key={i} />
              ))}
            </AssetCardGrid>
          )}

          {/* 无资产 -- 全局空 */}
          {!loading && !error && assets.length === 0 && (
            <AssetEmptyState
              type="global"
              onExtract={() => setShowExtract(true)}
              onCreate={() => setShowCreate(true)}
            />
          )}

          {/* 有资产但筛选后为空 */}
          {!loading && !error && assets.length > 0 && filteredAssets.length === 0 && (
            <AssetEmptyState
              type="filtered"
              onExtract={() => setShowExtract(true)}
              onCreate={() => setShowCreate(true)}
            />
          )}

          {/* 卡片网格 */}
          {!loading && !error && filteredAssets.length > 0 && (
            <AssetCardGrid>
              {filteredAssets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  encodedName={encodedName}
                  isSelected={selectedIds.has(asset.id)}
                  onToggleSelect={selectionActions.toggle}
                  onClick={() => setSelectedAsset(asset)}
                />
              ))}
            </AssetCardGrid>
          )}
        </div>
      </div>

      {/* 详情抽屉 */}
      {currentSelectedAsset && (
        <AssetDetailDrawer
          asset={currentSelectedAsset}
          encodedName={encodedName}
          isOpen={!!currentSelectedAsset}
          onClose={handleDrawerClose}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onStartPolling={startPolling}
          imageModels={imageModels}
          defaultModelId={batchModel}
          defaultResolution={batchResolution}
        />
      )}

      {/* 新增弹窗 */}
      <CreateAssetModal
        isOpen={showCreate}
        encodedName={encodedName}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
      />

      {/* 提取弹窗 */}
      <ExtractFromOutlineModal
        isOpen={showExtract}
        encodedName={encodedName}
        onClose={() => setShowExtract(false)}
        onExtracted={handleExtracted}
      />
    </div>
  );
}
