'use client';

import { useState, useEffect, useCallback } from 'react';

interface DirectorAnalysisBarProps {
  encodedName: string;
  scripts: { episode: number; name: string }[];
  onComplete: () => void;
}

type AnalysisStatus = 'idle' | 'loading' | 'success' | 'error';

export default function DirectorAnalysisBar({ encodedName, scripts, onComplete }: DirectorAnalysisBarProps) {
  const [selectedEpisode, setSelectedEpisode] = useState<number>(
    scripts.length > 0 ? scripts[0].episode : 1
  );
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [statusText, setStatusText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // 切换集数时检查是否已有导演分析
  const checkStatus = useCallback(async (ep: number) => {
    try {
      const res = await fetch(`/api/projects/${encodedName}/seedance/${ep}/director`);
      if (res.ok) {
        const data = await res.json();
        if (data.content && data.content.trim()) {
          setStatus('success');
          setStatusText('已完成');
          return;
        }
      }
      setStatus('idle');
      setStatusText('未分析');
    } catch {
      setStatus('idle');
      setStatusText('未分析');
    }
  }, [encodedName]);

  useEffect(() => {
    checkStatus(selectedEpisode);
  }, [selectedEpisode, checkStatus]);

  const handleGenerate = async () => {
    setStatus('loading');
    setStatusText('分析中...');
    setErrorMsg('');

    try {
      const res = await fetch(`/api/projects/${encodedName}/seedance/${selectedEpisode}/director`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: '请求失败' }));
        throw new Error(data.error || '生成导演分析失败');
      }

      setStatus('success');
      setStatusText('已完成');
      onComplete();
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : '分析失败');
      setStatusText('分析失败');
    }
  };

  if (scripts.length === 0) return null;

  const isLoading = status === 'loading';
  const isSuccess = status === 'success';
  const isError = status === 'error';

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-4">
      {/* 标签 */}
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider shrink-0">
        导演讲戏
      </span>

      {/* 集数选择器 */}
      <select
        value={selectedEpisode}
        onChange={(e) => setSelectedEpisode(Number(e.target.value))}
        disabled={isLoading}
        className="w-[120px] px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:ring-1 focus:ring-purple-300 focus:outline-none appearance-none pr-8 disabled:opacity-50"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
          backgroundPosition: 'right 0.5rem center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '1.25rem 1.25rem',
        }}
      >
        {scripts.map(s => (
          <option key={s.episode} value={s.episode}>
            第{s.episode}集
          </option>
        ))}
      </select>

      {/* 生成按钮 */}
      <button
        onClick={handleGenerate}
        disabled={isLoading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      >
        {isLoading ? (
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.868V15.13a1 1 0 01-1.447.899L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
        {isSuccess ? '重新分析' : isError ? '重试' : '生成导演分析'}
      </button>

      {/* 状态指示 */}
      <span className={`text-xs shrink-0 ${
        isLoading ? 'text-purple-600 animate-pulse' :
        isSuccess ? 'text-green-600' :
        isError ? 'text-red-500' :
        'text-gray-400'
      }`}>
        {isError ? errorMsg : statusText}
      </span>
    </div>
  );
}
