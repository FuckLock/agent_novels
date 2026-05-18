'use client';

import { useEffect, useCallback } from 'react';

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  assetName: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

/** 删除确认对话框 */
export default function DeleteConfirmDialog({ isOpen, assetName, onConfirm, onCancel, loading }: DeleteConfirmDialogProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel();
    },
    [onCancel, loading]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center"
      onClick={() => { if (!loading) onCancel(); }}
    >
      <div
        className="max-w-sm w-full mx-auto bg-white rounded-xl shadow-lg animate-[fadeIn_0.15s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
          <svg className="w-5 h-5 text-orange-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <h3 className="text-base font-semibold text-gray-800">确认删除</h3>
        </div>

        {/* 正文 */}
        <div className="px-6 py-5 text-sm text-gray-600 leading-relaxed">
          确认删除资产「{assetName}」？删除后数据不可恢复，关联的图片文件将保留。
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors duration-150 disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-150 disabled:opacity-75 inline-flex items-center gap-1.5"
          >
            {loading && (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            删除
          </button>
        </div>
      </div>
    </div>
  );
}
