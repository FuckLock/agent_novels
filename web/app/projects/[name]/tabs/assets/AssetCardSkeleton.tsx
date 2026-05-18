'use client';

/** 卡片骨架屏（加载态占位），匹配增强版 AssetCard 高度 */
export default function AssetCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
      {/* 缩略图区域 */}
      <div className="aspect-[4/3] bg-gray-100 rounded-t-xl" />
      {/* 信息区域 */}
      <div className="p-3 space-y-1.5">
        {/* 第一行：名称 + 提示词状态 */}
        <div className="flex items-center justify-between">
          <div className="h-4 bg-gray-100 rounded w-[45%]" />
          <div className="h-4 bg-gray-100 rounded w-[30%]" />
        </div>
        {/* 第二行：类型标签 + 图片状态 */}
        <div className="flex items-center gap-1.5">
          <div className="h-4 bg-gray-100 rounded w-10" />
          <div className="h-4 bg-gray-100 rounded w-12" />
        </div>
        {/* 第三行：模型 + 分辨率 */}
        <div className="flex items-center gap-2">
          <div className="h-3 bg-gray-100 rounded w-[50%]" />
          <div className="h-3 bg-gray-100 rounded w-6" />
        </div>
        {/* 第四行：描述 */}
        <div className="space-y-1">
          <div className="h-3 bg-gray-100 rounded w-[85%]" />
          <div className="h-3 bg-gray-100 rounded w-[65%]" />
        </div>
      </div>
    </div>
  );
}
