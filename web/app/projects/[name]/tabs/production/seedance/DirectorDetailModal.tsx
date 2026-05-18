'use client';
import { useEffect, useState } from 'react';

interface DirectorDetailModalProps {
  title: string;
  fullTable: Record<string, string>;
  onClose: () => void;
}

export default function DirectorDetailModal({ title, fullTable, onClose }: DirectorDetailModalProps) {
  const [isVisible, setIsVisible] = useState(false);

  // 进入动画：挂载后延一帧触发
  useEffect(() => {
    const timer = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const entries = Object.entries(fullTable);

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center transition-opacity duration-150 ${
        isVisible ? 'bg-black/40 opacity-100' : 'bg-black/0 opacity-0'
      }`}
      onClick={onClose}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`bg-white rounded-xl shadow-md max-w-lg w-full mx-4 max-h-[70vh] overflow-y-auto transition-all duration-150 ${
          isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          <button
            onClick={onClose}
            autoFocus
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容 */}
        <div className="p-5">
          {entries.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">暂无详细信息</p>
          ) : (
            <div className="divide-y">
              {entries.map(([key, value]) => (
                <div key={key} className="py-2.5 flex gap-3">
                  <span className="text-xs text-gray-500 font-medium w-20 flex-shrink-0 pt-0.5">{key}</span>
                  <span className="text-xs text-gray-700 flex-1">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
