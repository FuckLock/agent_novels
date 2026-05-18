'use client';

import { SeedanceAsset } from '../../types';
import IdentityAnchorTags from './IdentityAnchorTags';
import type { ModelConfig } from '@/app/lib/novels';

interface AssetEditFormProps {
  asset: SeedanceAsset;
  editState: {
    name: string;
    identityAnchor: string[];
    prompt: string;
    modelId: string;
    resolution: string;
  };
  onChange: (field: string, value: string | string[]) => void;
  imageModels: ModelConfig[];
}

/** 抽屉内可编辑区（模型 + 分辨率 + 锚点 + 提示词） */
export default function AssetEditForm({ asset, editState, onChange, imageModels }: AssetEditFormProps) {
  const selectedModel = imageModels.find((m) => m.modelId === editState.modelId);
  const sizeOptions = selectedModel?.capabilities?.sizeOptions && selectedModel.capabilities.sizeOptions.length > 0
    ? selectedModel.capabilities.sizeOptions
    : selectedModel && !selectedModel.capabilities && (selectedModel.defaultParams?.size || selectedModel.defaultParams?.imageSize)
      ? ['1K', '2K', '4K']
      : selectedModel?.adapter === 'openai-images'
        ? ['auto', '1024x1024', '1536x1024', '1024x1536']
        : [];

  return (
    <div className="border-t border-gray-50">
      {/* 生成模型选择 */}
      <div className="px-6 py-3">
        <label className="text-xs font-medium text-gray-500 mb-1.5 block">生成模型</label>
        <div className="relative">
          <select
            value={editState.modelId}
            onChange={(e) => onChange('modelId', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:ring-1 focus:ring-purple-300 focus:border-purple-400 transition appearance-none pr-8"
          >
            <option value="">选择模型</option>
            {imageModels.map(m => (
              <option key={m.modelId} value={m.modelId}>{m.name}</option>
            ))}
          </select>
          <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* 分辨率选择 */}
      {sizeOptions.length > 0 && (
        <div className="px-6 py-3">
          <label className="text-xs font-medium text-gray-500 mb-1.5 block">分辨率</label>
          <div className="relative">
            <select
              value={editState.resolution}
              onChange={(e) => onChange('resolution', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:ring-1 focus:ring-purple-300 focus:border-purple-400 transition appearance-none pr-8"
            >
              <option value="">选择分辨率</option>
              {sizeOptions.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      )}

      {/* 视觉锚点（仅角色类型） */}
      {asset.type === 'character' && (
        <div className="px-6 py-3">
          <label className="text-xs font-medium text-gray-500 mb-1.5 block">视觉锚点</label>
          <IdentityAnchorTags
            tags={editState.identityAnchor}
            onChange={(tags) => onChange('identityAnchor', tags)}
          />
        </div>
      )}

      {/* 提示词 */}
      <div className="px-6 py-3">
        <label className="text-xs font-medium text-gray-500 mb-1.5 block">提示词</label>
        <div className="relative">
          <textarea
            value={editState.prompt}
            onChange={(e) => onChange('prompt', e.target.value)}
            disabled={asset.promptState === 'generating'}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 font-mono resize-y min-h-[200px] focus:ring-1 focus:ring-purple-300 focus:border-purple-400 transition-shadow duration-150 disabled:bg-gray-50 disabled:text-gray-400"
            placeholder="输入图片生成提示词..."
          />
          {asset.promptState === 'generating' && (
            <div className="absolute inset-0 bg-white/80 rounded-lg flex flex-col items-center justify-center gap-2">
              <div className="w-6 h-6 border-2 border-purple-200 border-t-purple-500 rounded-full animate-spin" />
              <span className="text-sm text-purple-600 font-medium">正在重新生成提示词...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
