'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FolderKanban, ListChecks, Settings } from 'lucide-react';

const navItems = [
  { href: '/', label: '项目', icon: FolderKanban },
  { href: '/tasks', label: '任务', icon: ListChecks },
  { href: '/settings', label: '设置', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/' || pathname.startsWith('/projects');
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside className="flex w-[72px] shrink-0 flex-col border-r border-[var(--tf-border-subtle)] bg-[var(--tf-bg-panel)]">
      <div className="flex h-[68px] items-center justify-center border-b border-[var(--tf-border-subtle)]">
        <Link
          href="/"
          aria-label="Toonflow 项目列表"
          className="flex h-10 w-10 items-center justify-center rounded-[var(--tf-radius-md)] bg-[var(--tf-bg-inverse)] text-[var(--tf-text-inverse)]"
        >
          <span className="text-sm font-semibold">TF</span>
        </Link>
      </div>
      <nav className="flex flex-1 flex-col items-center gap-2 py-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-current={active ? 'page' : undefined}
              className={`flex h-[54px] w-[54px] flex-col items-center justify-center gap-1 rounded-[var(--tf-radius-md)] text-[11px] font-medium transition ${
                active
                  ? 'bg-[var(--tf-accent-primary-soft)] text-[var(--tf-accent-primary)]'
                  : 'text-[var(--tf-text-secondary)] hover:bg-[var(--tf-bg-raised)] hover:text-[var(--tf-text-primary)]'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
