'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ProjectTabs, { ProjectTabId } from '@/app/components/layout/ProjectTabs';
import StatusPill from '@/app/components/StatusPill';
import { ProjectDetail } from './types';
import SourceTab from './tabs/SourceTab';
import ContentWorkbench from './tabs/ContentWorkbench';
import ScriptsTab from './tabs/ScriptsTab';
import AssetsTab from './tabs/AssetsTab';
import ProductionTab from './tabs/ProductionTab';
import TakeDeliveryTab from './tabs/TakeDeliveryTab';

export default function ProjectPage() {
  const params = useParams();
  const encodedName = params.name as string;
  const name = decodeURIComponent(encodedName);
  const [activeTab, setActiveTab] = useState<ProjectTabId>('workbench');
  const [project, setProject] = useState<ProjectDetail | null>(null);

  const loadProject = useCallback(async () => {
    const res = await fetch(`/api/projects/${encodedName}`);
    const data = await res.json();
    setProject(data);
  }, [encodedName]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  if (!project) return (
    <div className="flex h-full items-center justify-center">
      <div className="text-sm text-[var(--tf-text-muted)]">加载中...</div>
    </div>
  );

  return (
    <div className="flex min-h-full flex-col bg-[var(--tf-bg-canvas)]">
        <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--tf-border-subtle)] bg-[var(--tf-bg-panel)] px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--tf-radius-sm)] text-[var(--tf-text-secondary)] hover:bg-[var(--tf-bg-raised)] hover:text-[var(--tf-text-primary)]">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-[var(--tf-text-primary)]">{name}</h2>
              <p className="truncate text-xs text-[var(--tf-text-muted)]">项目工作流</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusPill variant="neutral">{project.chapters?.length ?? 0} 章</StatusPill>
            <StatusPill variant="neutral">{project.scripts?.length ?? 0} 集剧本</StatusPill>
          </div>
        </div>

        <ProjectTabs activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="flex-1 p-6">
          {/* ContentWorkbench 始终挂载（用 CSS 隐藏），避免 Tab 切换时 chatHistory 丢失 */}
          <div className={activeTab === 'workbench' ? '' : 'hidden'}>
            <ContentWorkbench project={project} encodedName={encodedName} name={name} onReload={loadProject} />
          </div>
          {activeTab === 'chapters' && (
            <SourceTab project={project} encodedName={encodedName} onReload={loadProject} />
          )}
          {activeTab === 'scripts' && (
            <ScriptsTab project={project} encodedName={encodedName} name={name} onReload={loadProject} onSwitchToProduction={() => setActiveTab('production')} />
          )}
          {activeTab === 'assets' && (
            <AssetsTab encodedName={encodedName} scripts={project.scripts} />
          )}
          {activeTab === 'production' && (
            <ProductionTab project={project} encodedName={encodedName} name={name} onReload={loadProject} />
          )}
          {activeTab === 'delivery' && (
            <TakeDeliveryTab project={project} />
          )}
        </div>
    </div>
  );
}
