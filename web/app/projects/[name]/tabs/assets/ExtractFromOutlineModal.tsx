'use client';

import { useState, useEffect, useCallback } from 'react';
import { ExtractPreview } from '../../types';

interface ExtractFromOutlineModalProps {
  isOpen: boolean;
  encodedName: string;
  onClose: () => void;
  onExtracted: () => void;
}

type Phase = 'loading' | 'preview' | 'nodata' | 'extracting';

/** 从大纲提取预览弹窗（两阶段交互） */
export default function ExtractFromOutlineModal({ isOpen, encodedName, onClose, onExtracted }: ExtractFromOutlineModalProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [preview, setPreview] = useState<ExtractPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 弹窗打开时自动获取预览
  useEffect(() => {
    if (!isOpen) return;
    setPhase('loading');
    setPreview(null);
    setError(null);

    const controller = new AbortController();

    fetch(`/api/projects/${encodedName}/seedance/assets/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preview: true }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.error?.includes('大纲') || data.error?.includes('outline') || res.status === 404) {
            setPhase('nodata');
            return;
          }
          throw new Error(data.error || '获取预览失败');
        }
        const data = await res.json();
        setPreview(data);
        const total = (data.characters?.length || 0) + (data.scenes?.length || 0) + (data.props?.length || 0);
        setPhase(total > 0 ? 'preview' : 'nodata');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err.message);
        setPhase('nodata');
      });

    return () => controller.abort();
  }, [isOpen, encodedName]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'extracting') onClose();
    },
    [onClose, phase]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  const handleExtract = async () => {
    setPhase('extracting');
    try {
      const res = await fetch(`/api/projects/${encodedName}/seedance/assets/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview: false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '提取失败');
      }
      onExtracted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '提取失败');
      setPhase('preview');
    }
  };

  if (!isOpen) return null;

  const charCount = preview?.characters?.length || 0;
  const sceneCount = preview?.scenes?.length || 0;
  const propCount = preview?.props?.length || 0;
  const total = charCount + sceneCount + propCount;
  const skipped = preview?.skipped || 0;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={() => { if (phase !== 'extracting') onClose(); }}
    >
      <div
        className="max-w-sm w-full mx-auto bg-white rounded-xl shadow-lg animate-[fadeIn_0.15s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">从大纲提取资产</h3>
          <button
            onClick={onClose}
            disabled={phase === 'extracting'}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容区 */}
        <div className="px-6 py-6">
          {/* 加载态 */}
          {phase === 'loading' && (
            <div className="flex flex-col items-center justify-center py-6">
              <svg className="w-8 h-8 text-purple-500 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm text-gray-500 mt-3">正在分析大纲数据...</p>
            </div>
          )}

          {/* 无数据态 */}
          {phase === 'nodata' && (
            <div className="flex flex-col items-center justify-center py-6">
              <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6" />
              </svg>
              <p className="text-sm text-gray-500 text-center">
                {error || '未找到大纲数据'}
              </p>
              <p className="text-xs text-gray-400 text-center mt-1">请先在剧本Agent中生成大纲</p>
            </div>
          )}

          {/* 预览态 / 提取中态 */}
          {(phase === 'preview' || phase === 'extracting') && preview && (
            <div>
              <p className="text-sm text-gray-600 mb-4">分析完成，将从大纲中提取：</p>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-gray-600 flex items-center gap-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">角色</span>
                  </span>
                  <span className="text-sm font-medium text-gray-800">{charCount} 个</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-gray-600 flex items-center gap-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">场景</span>
                  </span>
                  <span className="text-sm font-medium text-gray-800">{sceneCount} 个</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-gray-600 flex items-center gap-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">道具</span>
                  </span>
                  <span className="text-sm font-medium text-gray-800">{propCount} 个</span>
                </div>
                <div className="border-t border-gray-200 my-1.5" />
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-sm font-semibold text-gray-800">合计</span>
                  <span className="text-sm font-semibold text-gray-800">{total} 个</span>
                </div>
                {skipped > 0 && (
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-gray-400">重复跳过</span>
                    <span className="text-xs text-gray-400">{skipped} 个</span>
                  </div>
                )}
              </div>
              {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          {phase === 'nodata' && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors duration-150"
            >
              关闭
            </button>
          )}
          {(phase === 'preview' || phase === 'extracting') && (
            <>
              <button
                onClick={onClose}
                disabled={phase === 'extracting'}
                className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors duration-150 disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleExtract}
                disabled={phase === 'extracting'}
                className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors duration-150 disabled:opacity-75 inline-flex items-center gap-1.5"
              >
                {phase === 'extracting' && (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                确认提取
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
