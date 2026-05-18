'use client';

interface ScriptHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearch: () => void;
  selectedCount: number;
  totalScripts: number;
  onSelectAll: () => void;
  onExportSelected: () => void;
  onStartProduction: () => void;
  onDeleteSelected: () => void;
  allSelected: boolean;
  hasScripts: boolean;
}

/** 剧本管理工具栏 -- 搜索 + 批量操作 */
export default function ScriptHeader({
  searchQuery,
  onSearchChange,
  onSearch,
  selectedCount,
  totalScripts,
  onSelectAll,
  onExportSelected,
  onStartProduction,
  onDeleteSelected,
  allSelected,
  hasScripts,
}: ScriptHeaderProps) {
  const hasSelection = selectedCount > 0;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* 左侧：搜索区 */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSearch();
          }}
          placeholder="搜索剧本名称..."
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 w-48 sm:w-56"
        />
        <button
          onClick={onSearch}
          className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800 transition"
        >
          搜索
        </button>
        <span className="text-xs text-gray-400 hidden sm:inline">
          共 {totalScripts} 集
        </span>
      </div>

      {/* 右侧：批量操作区 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onSelectAll}
          className={`border rounded-lg px-4 py-2 text-sm transition ${
            allSelected
              ? 'border-gray-900 bg-gray-900 text-white'
              : 'border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          {allSelected ? '取消全选' : '全选'}
        </button>
        <button
          onClick={onExportSelected}
          disabled={!hasSelection}
          className="border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          导出剧本{hasSelection ? ` (${selectedCount})` : ''}
        </button>
        <button
          onClick={onStartProduction}
          disabled={!hasScripts}
          className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 text-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          开始制作
        </button>
        <button
          onClick={onDeleteSelected}
          disabled={!hasSelection}
          className="border border-red-300 rounded-lg px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400"
        >
          批量删除剧本{hasSelection ? ` (${selectedCount})` : ''}
        </button>
      </div>
    </div>
  );
}
