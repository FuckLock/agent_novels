'use client';

interface AssetCardGridProps {
  children: React.ReactNode;
}

/** 响应式卡片网格容器（适配左侧面板占 260px 后的布局） */
export default function AssetCardGrid({ children }: AssetCardGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {children}
    </div>
  );
}
