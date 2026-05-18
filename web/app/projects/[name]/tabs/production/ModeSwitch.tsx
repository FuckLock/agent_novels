'use client';
import { ProductionMode } from '../../types';

interface ModeSwitchProps {
  activeMode: ProductionMode;
  onModeChange: (mode: ProductionMode) => void;
  seedanceHasData: boolean;
}

export default function ModeSwitch({ activeMode, onModeChange, seedanceHasData }: ModeSwitchProps) {
  const modes: { id: ProductionMode; label: string; icon: string; hasData: boolean; desc: string }[] = [
    {
      id: 'seedance',
      label: 'Seedance 全能参考',
      icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
      hasData: seedanceHasData,
      desc: '多图参考，适合正式制作',
    },
  ];

  return (
    <div className="flex gap-2">
      {modes.map(mode => (
        <div key={mode.id} className="flex flex-col items-start">
          <button
            onClick={() => onModeChange(mode.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition border ${
              activeMode === mode.id
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300 hover:text-purple-600'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={mode.icon} />
            </svg>
            {mode.label}
            {mode.hasData && (
              <span className={`w-2 h-2 rounded-full ${activeMode === mode.id ? 'bg-white' : 'bg-green-500'}`} />
            )}
          </button>
          <span className="text-xs text-gray-400 mt-1 ml-1">{mode.desc}</span>
        </div>
      ))}
    </div>
  );
}
