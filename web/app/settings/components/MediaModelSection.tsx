'use client';

import { useState } from 'react';
import { ModelConfig } from '@/app/lib/novels';
import Card from '@/app/components/Card';
import ModelCardGrid from './ModelCardGrid';
import ModelEmptyState from './ModelEmptyState';

type MediaTab = 'video' | 'image';

interface MediaModelSectionProps {
  videoModels: ModelConfig[];
  imageModels: ModelConfig[];
  onAdd: (type: MediaTab) => void;
  onEdit: (config: ModelConfig) => void;
  onDelete: (config: ModelConfig) => void;
  onToggleEnabled: (config: ModelConfig) => void;
}

const TAB_DESC: Record<MediaTab, string> = {
  video: '用于视频片段合成',
  image: '用于角色立绘和场景图',
};

export default function MediaModelSection({
  videoModels,
  imageModels,
  onAdd,
  onEdit,
  onDelete,
  onToggleEnabled,
}: MediaModelSectionProps) {
  const [activeTab, setActiveTab] = useState<MediaTab>('video');
  const currentModels = activeTab === 'video' ? videoModels : imageModels;

  return (
    <Card>
      {/* Tab 标签栏 */}
      <div className="flex gap-1 border-b border-gray-100 mb-4">
        <button
          onClick={() => setActiveTab('video')}
          className={`px-3 py-2 text-sm transition ${
            activeTab === 'video'
              ? 'font-medium text-purple-700 border-b-2 border-purple-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          视频
        </button>
        <button
          onClick={() => setActiveTab('image')}
          className={`px-3 py-2 text-sm transition ${
            activeTab === 'image'
              ? 'font-medium text-purple-700 border-b-2 border-purple-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          图像
        </button>
      </div>

      {/* 用途说明 */}
      <p className="text-xs text-gray-400 mt-1 mb-4">{TAB_DESC[activeTab]}</p>

      {/* 模型网格 */}
      <ModelCardGrid
        models={currentModels}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleEnabled={onToggleEnabled}
        emptyState={<ModelEmptyState type={activeTab} onAdd={() => onAdd(activeTab)} />}
      />

      {/* 添加按钮（有模型时显示） */}
      {currentModels.length > 0 && (
        <button
          onClick={() => onAdd(activeTab)}
          className="mt-3 w-full border border-dashed border-gray-300 rounded-lg py-3 text-center cursor-pointer hover:border-purple-300 hover:bg-purple-50/30 transition-colors duration-200 text-sm text-gray-400 hover:text-purple-600"
        >
          <svg className="w-3.5 h-3.5 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          添加{activeTab === 'video' ? '视频' : '图像'}模型
        </button>
      )}
    </Card>
  );
}
