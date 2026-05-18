'use client';

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { CheckCircle2, ChevronRight, Database, Server } from 'lucide-react';
import Sidebar from './Sidebar';
import StatusPill from '../ui/StatusPill';

interface AppShellProps {
  children: ReactNode;
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getRouteMeta(pathname: string) {
  if (pathname === '/settings') {
    return { title: '设置与治理', subtitle: '模型、供应商与本地运行参数' };
  }
  if (pathname === '/tasks') {
    return { title: '任务中心', subtitle: '跨项目生成、制作与导出任务' };
  }
  if (pathname.startsWith('/projects/')) {
    const [, , projectName] = pathname.split('/');
    return { title: safeDecode(projectName || '项目工作台'), subtitle: '短剧项目工作台' };
  }
  return { title: '项目列表', subtitle: '本地短剧项目与创作进度' };
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const meta = useMemo(() => getRouteMeta(pathname), [pathname]);

  return (
    <div className="h-screen min-h-0 bg-[var(--tf-bg-canvas)] text-[var(--tf-text-primary)]">
      <div className="flex h-full min-h-0">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-[68px] shrink-0 items-center justify-between gap-4 border-b border-[var(--tf-border-subtle)] bg-[var(--tf-bg-panel)] px-6 lg:px-8">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium text-[var(--tf-text-muted)]">
                <span>Toonflow</span>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="truncate">{meta.title}</span>
              </div>
              <div className="mt-1 flex min-w-0 items-baseline gap-3">
                <h1 className="truncate text-xl font-semibold text-[var(--tf-text-primary)]">{meta.title}</h1>
                <p className="hidden truncate text-xs text-[var(--tf-text-secondary)] sm:block">{meta.subtitle}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 overflow-hidden">
              <StatusPill variant="success" className="hidden sm:inline-flex">
                <Server className="mr-1.5 h-3.5 w-3.5" />
                HTTP Web
              </StatusPill>
              <StatusPill variant="info" className="hidden md:inline-flex">
                <Database className="mr-1.5 h-3.5 w-3.5" />
                local_project
              </StatusPill>
              <StatusPill variant="success">
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                Runtime passed
              </StatusPill>
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto toonflow-scrollbar">{children}</main>
        </div>
      </div>
    </div>
  );
}
