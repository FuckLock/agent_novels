'use client';

interface AssetEmptyStateProps {
  type: 'global' | 'filtered';
  onExtract: () => void;
  onCreate: () => void;
}

/** 空状态展示（区分全局空和筛选空） */
export default function AssetEmptyState({ type, onExtract, onCreate }: AssetEmptyStateProps) {
  if (type === 'filtered') {
    return (
      <div className="py-12 flex flex-col items-center justify-center">
        <svg className="w-10 h-10 text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <p className="text-sm text-gray-500 mb-1">当前筛选条件下暂无资产</p>
        <p className="text-xs text-gray-400">尝试调整左侧的类型筛选或搜索关键词</p>
      </div>
    );
  }

  return (
    <div className="py-16 flex flex-col items-center justify-center">
      {/* Palette 图标 */}
      <svg className="w-12 h-12 text-gray-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
      </svg>
      <p className="text-sm text-gray-500 mb-1">暂无视觉资产</p>
      <p className="text-xs text-gray-400 mb-5 text-center max-w-xs">
        从大纲中提取角色、场景和道具，或手动创建资产开始塑造
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={onExtract}
          className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg border border-gray-200 transition-colors duration-150"
        >
          从大纲提取
        </button>
        <button
          onClick={onCreate}
          className="px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors duration-150"
        >
          + 新增资产
        </button>
      </div>
    </div>
  );
}
