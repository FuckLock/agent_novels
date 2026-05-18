'use client';

import { ReviewResult } from '@/app/lib/novels';
import { OutlineEpisode } from '../../types';

export type StageType = 'storyline' | 'outline' | 'script';

interface PipelineNavProps {
  storyline?: string;
  outline?: OutlineEpisode[] | null;
  scripts?: { episode: number }[];
  reviews: Record<string, ReviewResult>;
  activeStage: StageType;
  onStageChange: (stage: StageType) => void;
}

function StepNode({ step, done, active }: { step: number; done: boolean; active: boolean }) {
  const base = 'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all';
  if (active) return <div className={`${base} bg-purple-500 text-white ring-2 ring-purple-300/40`}>{done ? '✓' : step}</div>;
  if (done) return <div className={`${base} bg-purple-500 text-white`}>✓</div>;
  return <div className={`${base} bg-white/10 text-[#9b8ec4]`}>{step}</div>;
}

export default function PipelineNav({
  storyline,
  outline,
  scripts,
  reviews,
  activeStage,
  onStageChange,
}: PipelineNavProps) {
  const hasStoryline = !!storyline;
  const episodes = outline || [];
  const scriptEps = scripts || [];
  const totalEps = episodes.length;
  const storylineReview = reviews['storyline'];

  const stages: { id: StageType; step: number; label: string; done: boolean; info: string }[] = [
    {
      id: 'storyline',
      step: 1,
      label: '故事线',
      done: hasStoryline,
      info: storylineReview ? `${storylineReview.totalScore}分` : (hasStoryline ? '已生成' : '未生成'),
    },
    {
      id: 'outline',
      step: 2,
      label: '大纲',
      done: totalEps > 0,
      info: totalEps > 0 ? `${totalEps}集` : '未生成',
    },
    {
      id: 'script',
      step: 3,
      label: '剧本',
      done: scriptEps.length > 0,
      info: scriptEps.length > 0 ? `${scriptEps.length}/${totalEps}集` : '未生成',
    },
  ];

  return (
    <nav className="bg-[#1e1b2e] rounded-2xl p-4 shadow-xl w-52 shrink-0 flex flex-col">
      {/* 顶部标签 */}
      <div className="text-[10px] text-[#6b5fa6] uppercase tracking-widest mb-4">创作流水线</div>

      {stages.map((stage, i) => (
        <div key={stage.id}>
          {/* 阶段按钮 */}
          <button
            onClick={() => onStageChange(stage.id)}
            className={`w-full flex items-center gap-2.5 px-2 py-2.5 text-left transition-all ${
              activeStage === stage.id
                ? 'bg-purple-600/20 border border-purple-500/30 rounded-xl'
                : 'hover:bg-white/5 rounded-xl'
            }`}
          >
            <StepNode step={stage.step} done={stage.done} active={activeStage === stage.id} />
            <div className="min-w-0">
              <div className={`text-sm font-medium ${activeStage === stage.id ? 'text-white' : 'text-[#9b8ec4]'}`}>
                {stage.label}
              </div>
              <div className={`text-[11px] ${stage.done ? 'text-[#9b8ec4]' : 'text-[#6b5fa6]'}`}>
                {stage.info}
              </div>
            </div>
          </button>

          {/* 连接线 */}
          {i < stages.length - 1 && (
            <div className="flex justify-start pl-[22px] py-0.5">
              <div className={`w-px h-6 ${stage.done ? 'bg-purple-500/50' : 'bg-white/10'}`} />
            </div>
          )}
        </div>
      ))}

      {/* 底部水印 */}
      <div className="text-[10px] text-[#3d3560] mt-auto pt-6">TOONFLOW AI</div>
    </nav>
  );
}
