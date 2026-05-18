'use client';

import { SeedanceAsset, SeedanceAssetType, BatchProgress } from '../../types';
import type { ModelConfig } from '@/app/lib/novels';

interface BatchPanelProps {
  assets: SeedanceAsset[];
  filteredAssets: SeedanceAsset[];
  selectedIds: Set<string>;
  visibleTypes: Set<SeedanceAssetType>;
  counts: Record<SeedanceAssetType, number>;
  batchProgress: BatchProgress | null;
  textModels: Array<{ modelId: string; name: string }>;
  imageModels: ModelConfig[];
  selectedTextModel: string;
  selectedImageModel: string;
  selectedResolution: string;
  onTextModelChange: (modelId: string) => void;
  onImageModelChange: (modelId: string) => void;
  onResolutionChange: (resolution: string) => void;
  onSelectByCondition: (predicate: (a: SeedanceAsset) => boolean) => void;
  onInvertSelection: () => void;
  onDeselectAll: () => void;
  onToggleTypeFilter: (type: SeedanceAssetType) => void;
  onBatchGeneratePrompts: () => void;
  onBatchGenerateImages: () => void;
  onReExtract: () => void;
}

const TYPE_FILTER_CONFIG: { type: SeedanceAssetType; label: string; textColor: string; dotColor: string }[] = [
  { type: 'character', label: '人物', textColor: 'text-orange-700', dotColor: 'bg-orange-400' },
  { type: 'scene', label: '场景', textColor: 'text-green-700', dotColor: 'bg-green-400' },
  { type: 'prop', label: '道具', textColor: 'text-purple-700', dotColor: 'bg-purple-400' },
  { type: 'costume', label: '服装', textColor: 'text-blue-700', dotColor: 'bg-blue-400' },
  { type: 'makeup', label: '妆发', textColor: 'text-pink-700', dotColor: 'bg-pink-400' },
];

function getResolutionOptions(model?: ModelConfig): { value: string; label: string }[] {
  if (!model) return [];
  const options = model.capabilities?.sizeOptions;
  if (options && options.length > 0) {
    return options.map((value) => ({ value, label: value }));
  }
  if (model.adapter === 'openai-images') {
    return ['auto', '1024x1024', '1536x1024', '1024x1536'].map((value) => ({ value, label: value }));
  }
  if (!model.capabilities && (model.defaultParams?.size || model.defaultParams?.imageSize)) {
    return ['1K', '2K', '4K'].map((value) => ({ value, label: value }));
  }
  return [];
}

/** 左侧批量操作面板 */
export default function BatchPanel({
  assets,
  filteredAssets,
  selectedIds,
  visibleTypes,
  counts,
  batchProgress,
  textModels,
  imageModels,
  selectedTextModel,
  selectedImageModel,
  selectedResolution,
  onTextModelChange,
  onImageModelChange,
  onResolutionChange,
  onSelectByCondition,
  onInvertSelection,
  onDeselectAll,
  onToggleTypeFilter,
  onBatchGeneratePrompts,
  onBatchGenerateImages,
  onReExtract,
}: BatchPanelProps) {
  const selectedCount = selectedIds.size;
  const totalCount = filteredAssets.length;
  const isBatchRunning = batchProgress !== null && !batchProgress.isComplete;

  // 计算按钮显示的数量
  const selectedAssets = assets.filter(a => selectedIds.has(a.id));
  const promptCount = selectedAssets.length;
  const imageCount = selectedAssets.filter(a => a.prompt).length;
  const selectedImageModelConfig = imageModels.find((m) => m.modelId === selectedImageModel);
  const resolutionOptions = getResolutionOptions(selectedImageModelConfig);

  const quickCommands: { label: string; action: () => void }[] = [
    { label: '选择：无提示词的', action: () => onSelectByCondition(a => !a.prompt) },
    { label: '选择：无图片的', action: () => onSelectByCondition(a => a.state === 'pending') },
    { label: '选择：已完成的', action: () => onSelectByCondition(a => a.state === 'success') },
    { label: '选择：生成失败的', action: () => onSelectByCondition(a => a.state === 'failed') },
    { label: '反选', action: onInvertSelection },
    { label: '取消选择', action: onDeselectAll },
    { label: '全选', action: () => onSelectByCondition(() => true) },
  ];

  const selectClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-purple-300 focus:border-purple-300 transition appearance-none pr-8';
  const selectDisabledClass = 'opacity-50 cursor-not-allowed';

  return (
    <aside className="w-[260px] shrink-0 bg-white border border-gray-200 rounded-xl p-4 space-y-5 self-start sticky top-4 overflow-y-auto max-h-[calc(100vh-120px)]">
      {/* 区域 1：快捷指令 */}
      <div className="border-b border-gray-100 pb-4">
        <h3 className="text-xs font-medium text-gray-500 mb-2">快捷选择</h3>
        <div className="flex flex-col gap-1">
          {quickCommands.map((cmd) => (
            <button
              key={cmd.label}
              onClick={cmd.action}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-600 rounded-md hover:bg-gray-50 hover:text-gray-800 transition cursor-pointer flex items-center justify-between"
            >
              <span>{cmd.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 区域 2：素材类型筛选 */}
      <div className="border-b border-gray-100 pb-4">
        <h3 className="text-xs font-medium text-gray-500 mb-2">素材类型筛选</h3>
        <div className="flex flex-col gap-2">
          {TYPE_FILTER_CONFIG.map(({ type, label, textColor, dotColor }) => (
            <label key={type} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={visibleTypes.has(type)}
                onChange={() => onToggleTypeFilter(type)}
                className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span className={`w-2 h-2 rounded-full ${dotColor}`} />
              <span className={`text-sm ${textColor}`}>{label}</span>
              <span className="text-xs text-gray-400">({counts[type] ?? 0})</span>
            </label>
          ))}
        </div>
      </div>

      {/* 区域 3：提示词生成 */}
      <div className="border-b border-gray-100 pb-4">
        <h3 className="text-xs font-medium text-gray-500 mb-2">提示词生成</h3>
        <div className="space-y-2">
          {/* 文字模型选择 */}
          <div className="relative">
            <select
              value={selectedTextModel}
              onChange={(e) => onTextModelChange(e.target.value)}
              disabled={textModels.length === 0}
              className={`${selectClass} ${textModels.length === 0 ? selectDisabledClass : ''}`}
            >
              {textModels.length === 0 ? (
                <option value="">请先在设置中配置文字模型</option>
              ) : (
                textModels.map((m) => (
                  <option key={m.modelId} value={m.modelId}>{m.name}</option>
                ))
              )}
            </select>
            <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* 批量生成提示词按钮 */}
          <button
            onClick={onBatchGeneratePrompts}
            disabled={selectedCount === 0 || isBatchRunning}
            className={`w-full py-2 text-sm font-medium rounded-lg transition ${
              selectedCount > 0 && !isBatchRunning
                ? 'text-white bg-purple-600 hover:bg-purple-700 cursor-pointer'
                : 'text-gray-400 bg-gray-100 cursor-not-allowed'
            }`}
          >
            批量生成提示词 ({promptCount})
          </button>

          {/* 提示词进度条 */}
          {batchProgress && !batchProgress.isComplete && batchProgress.type === 'polish' && (
            <div className="mt-1">
              <div className="text-xs text-purple-600 font-medium">
                提示词生成中 {batchProgress.completed}/{batchProgress.total}
              </div>
              <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden mt-1">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-300"
                  style={{ width: `${batchProgress.total > 0 ? (batchProgress.completed / batchProgress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 区域 4：图片生成 */}
      <div className="border-b border-gray-100 pb-4">
        <h3 className="text-xs font-medium text-gray-500 mb-2">图片生成</h3>
        <div className="space-y-2">
          {/* 图片模型选择 */}
          <div className="relative">
            <select
              value={selectedImageModel}
              onChange={(e) => onImageModelChange(e.target.value)}
              disabled={imageModels.length === 0}
              className={`${selectClass} ${imageModels.length === 0 ? selectDisabledClass : ''}`}
            >
              {imageModels.length === 0 ? (
                <option value="">请先在设置中配置图像模型</option>
              ) : (
                imageModels.map((m) => (
                  <option key={m.modelId} value={m.modelId}>{m.name}</option>
                ))
              )}
            </select>
            <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* 分辨率选择：仅模型支持尺寸参数时显示 */}
          {resolutionOptions.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {resolutionOptions.map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="batchResolution"
                    value={opt.value}
                    checked={selectedResolution === opt.value}
                    onChange={() => onResolutionChange(opt.value)}
                    className="w-4 h-4 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>
          )}

          {/* 批量生成图片按钮 */}
          <button
            onClick={onBatchGenerateImages}
            disabled={selectedCount === 0 || isBatchRunning}
            className={`w-full py-2 text-sm font-medium rounded-lg transition ${
              selectedCount > 0 && !isBatchRunning
                ? 'text-white bg-gray-900 hover:bg-gray-800 cursor-pointer'
                : 'text-gray-400 bg-gray-100 cursor-not-allowed'
            }`}
          >
            批量生成图片 ({imageCount})
          </button>

          {/* 图片进度条 */}
          {batchProgress && !batchProgress.isComplete && batchProgress.type === 'generate' && (
            <div className="mt-1">
              <div className="text-xs text-purple-600 font-medium">
                图片生成中 {batchProgress.completed}/{batchProgress.total}
              </div>
              <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden mt-1">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-300"
                  style={{ width: `${batchProgress.total > 0 ? (batchProgress.completed / batchProgress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 底部统计 */}
      <div className="pt-3 mt-auto">
        <span className="text-xs text-gray-500">
          已选 {selectedCount} / 共 {totalCount} 个资产
        </span>
        <button
          onClick={onReExtract}
          className="mt-2 text-xs text-purple-500 hover:text-purple-700 transition-colors duration-150 cursor-pointer"
        >
          从大纲重新提取
        </button>
      </div>
    </aside>
  );
}
