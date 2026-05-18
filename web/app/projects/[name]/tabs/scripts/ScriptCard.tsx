'use client';

interface ScriptCardProps {
  episode: number;
  title: string;
  contentPreview: string;
  charCount?: number;
  sceneCount?: number;
  versionNo?: number;
  qualityStatus?: string;
  status?: string;
  assetTags?: string[];
  selected: boolean;
  onSelect: () => void;
  onClick: () => void;
  onDelete: () => void;
}

/** 剧本卡片组件 — 参考产品风格 */
export default function ScriptCard({
  episode,
  title,
  contentPreview,
  charCount = 0,
  sceneCount = 0,
  versionNo,
  qualityStatus,
  status,
  assetTags,
  selected,
  onSelect,
  onClick,
  onDelete,
}: ScriptCardProps) {
  const epLabel = `EP${String(episode).padStart(2, '0')}`;
  const displayTitle = title || `第${episode}集`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-action="select"]') || target.closest('[data-action="delete"]')) return;
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
      }}
      className={`relative bg-white rounded-lg border p-4 cursor-pointer transition-all duration-200 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-300 ${
        selected ? 'border-purple-300 bg-purple-50/30' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      {/* 标题 + checkbox */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-sm font-medium text-gray-800 leading-snug">
          {displayTitle}
        </h3>
        <label data-action="select" className="flex-shrink-0 cursor-pointer" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelect}
            className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
          />
        </label>
      </div>

      {/* 内容预览 */}
      {contentPreview && (
        <p className="text-xs text-gray-400 mb-3 line-clamp-2 leading-relaxed">
          {contentPreview}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 mb-3 text-[11px] text-gray-500">
        <span className="rounded bg-gray-100 px-2 py-0.5">{charCount} 字</span>
        <span className="rounded bg-gray-100 px-2 py-0.5">{sceneCount} 场</span>
        {versionNo ? <span className="rounded bg-gray-100 px-2 py-0.5">v{versionNo}</span> : null}
        {qualityStatus ? <span className="rounded bg-gray-100 px-2 py-0.5">{qualityStatus}</span> : null}
        {status ? <span className="rounded bg-gray-100 px-2 py-0.5">{status}</span> : null}
      </div>

      {/* 资产标签 — 仅在提取后显示 */}
      {assetTags && assetTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {assetTags.map((tag) => (
            <span key={tag} className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* 删除图标 */}
      <button
        data-action="delete"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute bottom-3 right-3 text-gray-300 hover:text-red-500 transition"
        aria-label={`删除 ${epLabel}`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}
