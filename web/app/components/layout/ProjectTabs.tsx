'use client';

import { Bot, BookOpen, Clapperboard, FileText, Palette, Scissors } from 'lucide-react';
import type { ComponentType } from 'react';

export type ProjectTabId = 'chapters' | 'workbench' | 'scripts' | 'assets' | 'production' | 'delivery';

interface ProjectTabsProps {
  activeTab: ProjectTabId;
  onTabChange: (tab: ProjectTabId) => void;
  className?: string;
}

const tabs: { id: ProjectTabId; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'chapters', label: '小说原文', icon: BookOpen },
  { id: 'workbench', label: '剧本 Agent', icon: Bot },
  { id: 'scripts', label: '剧本管理', icon: FileText },
  { id: 'assets', label: '塑造', icon: Palette },
  { id: 'production', label: '制作工作台', icon: Clapperboard },
  { id: 'delivery', label: 'Take/粗剪交付', icon: Scissors },
];

export default function ProjectTabs({ activeTab, onTabChange, className = '' }: ProjectTabsProps) {
  return (
    <div
      className={`flex min-h-12 items-center gap-1 overflow-x-auto border-b border-[var(--tf-border-subtle)] bg-[var(--tf-bg-panel)] px-6 toonflow-scrollbar ${className}`}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            title={tab.label}
            onClick={() => onTabChange(tab.id)}
            className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-[var(--tf-radius-sm)] px-3 text-sm font-medium transition ${
              isActive
                ? 'bg-[var(--tf-bg-inverse)] text-[var(--tf-text-inverse)]'
                : 'text-[var(--tf-text-secondary)] hover:bg-[var(--tf-bg-raised)] hover:text-[var(--tf-text-primary)]'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
