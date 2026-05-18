'use client';

import { ModelConfig } from '@/app/lib/novels';
import ModelConfigItem from './ModelConfigItem';

interface ModelCardGridProps {
  models: ModelConfig[];
  onEdit: (config: ModelConfig) => void;
  onDelete: (config: ModelConfig) => void;
  onToggleEnabled: (config: ModelConfig) => void;
  emptyState: React.ReactNode;
}

export default function ModelCardGrid({
  models,
  onEdit,
  onDelete,
  onToggleEnabled,
  emptyState,
}: ModelCardGridProps) {
  if (models.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {models.map((m) => (
        <ModelConfigItem
          key={m.modelId}
          config={m}
          onEdit={() => onEdit(m)}
          onDelete={() => onDelete(m)}
          onToggleEnabled={() => onToggleEnabled(m)}
        />
      ))}
    </div>
  );
}
