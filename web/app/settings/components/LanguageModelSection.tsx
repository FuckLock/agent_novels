'use client';
import { ModelConfig } from '@/app/lib/novels';
import Card from '@/app/components/Card';
import ModelCardGrid from './ModelCardGrid';
import ModelEmptyState from './ModelEmptyState';

interface LanguageModelSectionProps {
  models: ModelConfig[];
  onAdd: () => void;
  onEdit: (config: ModelConfig) => void;
  onDelete: (config: ModelConfig) => void;
  onToggleEnabled: (config: ModelConfig) => void;
}

export default function LanguageModelSection({
  models,
  onAdd,
  onEdit,
  onDelete,
  onToggleEnabled,
}: LanguageModelSectionProps) {
  return (
    <Card>
      <div className="flex justify-between items-center mb-4">
        <p className="text-xs text-gray-400">通过官方 API 或 OpenAI 兼容 API 调用</p>
      </div>

      {/* 模型网格 */}
      <ModelCardGrid
        models={models}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleEnabled={onToggleEnabled}
        emptyState={<ModelEmptyState type="language" onAdd={onAdd} />}
      />

      {/* 添加按钮（有模型时显示） */}
      {models.length > 0 && (
        <button
          onClick={onAdd}
          className="mt-3 w-full border border-dashed border-gray-300 rounded-lg py-3 text-center cursor-pointer hover:border-purple-300 hover:bg-purple-50/30 transition-colors duration-200 text-sm text-gray-400 hover:text-purple-600"
        >
          <svg className="w-3.5 h-3.5 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          添加语言模型
        </button>
      )}
    </Card>
  );
}
