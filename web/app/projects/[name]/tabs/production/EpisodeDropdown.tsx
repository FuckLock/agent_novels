'use client';

import { useState, useRef, useEffect } from 'react';

export interface EpisodeOption {
  episode: number;
  name: string;
}

interface EpisodeDropdownProps {
  projectName: string;
  episodes: EpisodeOption[];
  selectedEpisode: number | null;
  onSelect: (episode: number) => void;
  runningEpisodes?: number[];
}

export default function EpisodeDropdown({
  projectName,
  episodes,
  selectedEpisode,
  onSelect,
  runningEpisodes = [],
}: EpisodeDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = episodes.find((e) => e.episode === selectedEpisode);
  const epLabel = selected ? `EP${String(selected.episode).padStart(2, '0')}` : '';
  const rawName = selected?.name || '';
  // 去掉 name 中已有的项目名和集号前缀，避免重复显示
  const cleanName = rawName
    .replace(new RegExp(`^${projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`), '')
    .replace(/^EP?\d+[：:\s]*/i, '')
    .trim();
  const displayText = selected
    ? `《${projectName}》${epLabel}: ${cleanName || `第${selected.episode}集`}`
    : '选择集数';

  // 是否有非当前选中集正在运行
  const hasOtherRunning = runningEpisodes.some((ep) => ep !== selectedEpisode);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:ring-1 focus:ring-purple-300 min-w-[280px] max-w-[400px] text-left"
      >
        {/* 角标：有其他集在运行时显示紫色脉冲圆点 */}
        {hasOtherRunning && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-purple-500 animate-pulse rounded-full" />
        )}
        {/* 剧本图标 */}
        <svg
          className="w-4 h-4 text-gray-500 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <span className="truncate flex-1 text-gray-700">{displayText}</span>
        {/* 展开箭头 */}
        <svg
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 下拉菜单 */}
      {open && (
        <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 max-h-[300px] overflow-y-auto">
          {episodes.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">暂无剧本</div>
          ) : (
            episodes.map((ep) => {
              const isEpRunning = runningEpisodes.includes(ep.episode);
              return (
                <button
                  key={ep.episode}
                  onClick={() => {
                    onSelect(ep.episode);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm transition flex items-center justify-between ${
                    ep.episode === selectedEpisode
                      ? 'text-purple-700 bg-purple-50 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span>EP{String(ep.episode).padStart(2, '0')}: {ep.name || `第${ep.episode}集`}</span>
                  {isEpRunning && (
                    <span className="w-2 h-2 bg-purple-500 animate-pulse rounded-full shrink-0 ml-2" />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
