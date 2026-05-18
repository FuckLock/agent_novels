'use client';

import Link from 'next/link';
import { OutlineEpisode } from '../../types';

interface EpisodeTabBarProps {
  scripts: { episode: number }[];
  activeEpisode: number;
  outline?: OutlineEpisode[] | null;
  encodedName: string;
  onTabSwitch: (ep: number) => void;
}

export default function EpisodeTabBar({
  scripts,
  activeEpisode,
  outline,
  encodedName,
  onTabSwitch,
}: EpisodeTabBarProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="集数导航">
      {scripts.map(s => {
        const epOutline = outline?.find(o => o.episodeIndex === s.episode);
        const isActive = activeEpisode === s.episode;
        return (
          <div key={s.episode} className="flex flex-col items-center flex-shrink-0">
            <button
              role="tab"
              id={`tab-${s.episode}`}
              aria-selected={isActive}
              aria-controls={`panel-${s.episode}`}
              onClick={() => onTabSwitch(s.episode)}
              className={`px-4 py-2 text-sm rounded-lg transition whitespace-nowrap ${
                isActive
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50 shadow-sm'
              }`}
            >
              <span className="font-medium">第{s.episode}集</span>
              {epOutline?.title && (
                <span className={`ml-1.5 text-xs ${isActive ? 'text-white/80' : 'text-gray-400'}`}>
                  {epOutline.title.length > 8 ? epOutline.title.substring(0, 8) + '…' : epOutline.title}
                </span>
              )}
            </button>
            <Link
              href={`/projects/${encodedName}/scripts/${s.episode}`}
              className="text-xs text-purple-500 hover:text-purple-700 mt-0.5 block text-center"
            >
              查看详情
            </Link>
          </div>
        );
      })}
    </div>
  );
}
