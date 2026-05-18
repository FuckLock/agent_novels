import { ReactNode } from 'react';

interface SectionCardProps {
  icon: ReactNode;
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  noPadding?: boolean;
}

export default function SectionCard({ icon, title, count, action, children, noPadding }: SectionCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          {icon} {title}
          {count != null && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">{count}</span>
          )}
        </h3>
        <div className="flex items-center gap-2">{action}</div>
      </div>
      <div className={noPadding ? '' : 'p-5'}>{children}</div>
    </div>
  );
}
