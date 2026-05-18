'use client';

import { StageType } from './ChatPanel';
import SkeletonPanel from './SkeletonPanel';
import AdaptationPanel from './AdaptationPanel';
import ScriptCardList from './ScriptCardList';

interface ScriptItem {
  episode: number;
  name: string;
}

interface WorkbenchPanelProps {
  activeStage: StageType;
  onStageChange: (stage: StageType) => void;
  encodedName: string;
  scripts: ScriptItem[];
  onReload: () => void;
  refreshTrigger?: number;
}

const TAB_LIST: { id: StageType; label: string }[] = [
  { id: 'skeleton', label: '故事骨架' },
  { id: 'adaptation', label: '改编策略' },
  { id: 'script', label: '剧本' },
];

export default function WorkbenchPanel({
  activeStage,
  onStageChange,
  encodedName,
  scripts,
  onReload,
  refreshTrigger = 0,
}: WorkbenchPanelProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Tab 栏 */}
      <div className="px-6 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-6">
          {TAB_LIST.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => onStageChange(id)}
              className={`py-3 text-sm font-medium border-b-2 transition-all ${
                activeStage === id
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
        {activeStage === 'skeleton' && (
          <SkeletonPanel encodedName={encodedName} onReload={onReload} refreshTrigger={refreshTrigger} />
        )}
        {activeStage === 'adaptation' && (
          <AdaptationPanel encodedName={encodedName} onReload={onReload} refreshTrigger={refreshTrigger} />
        )}
        {activeStage === 'script' && (
          <ScriptCardList
            scripts={scripts}
            encodedName={encodedName}
            onReload={onReload}
            refreshTrigger={refreshTrigger}
          />
        )}
      </div>
    </div>
  );
}
