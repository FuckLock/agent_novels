import { ArrowUpRight, Clapperboard, FileText, Image, ListChecks } from 'lucide-react';
import Card from '../components/Card';
import StatusPill from '../components/StatusPill';

const lanes = [
  { title: '文本生产', status: '待接入', icon: FileText, variant: 'warning' as const },
  { title: '资产塑造', status: '待接入', icon: Image, variant: 'info' as const },
  { title: '视频制作', status: '待接入', icon: Clapperboard, variant: 'neutral' as const },
];

const recentTasks = [
  { name: '分集大纲生成', project: '项目工作台', state: '排队中', variant: 'warning' as const },
  { name: '角色资产提示词', project: '塑造模块', state: '未开始', variant: 'neutral' as const },
  { name: 'Seedance 制作任务', project: '制作工作台', state: '未开始', variant: 'neutral' as const },
];

export default function TasksPage() {
  return (
    <div className="p-6 lg:p-10">
      <div className="mx-auto max-w-[1180px] space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--tf-text-primary)]">任务看板</h2>
            <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">3 条队列</p>
          </div>
          <StatusPill variant="info">Phase 1 入口</StatusPill>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {lanes.map((lane) => {
            const Icon = lane.icon;
            return (
              <Card key={lane.title} className="min-h-[150px]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[var(--tf-radius-md)] bg-[var(--tf-bg-raised)] text-[var(--tf-text-primary)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <StatusPill variant={lane.variant}>{lane.status}</StatusPill>
                </div>
                <div className="mt-5">
                  <h3 className="text-base font-semibold text-[var(--tf-text-primary)]">{lane.title}</h3>
                  <div className="mt-4 h-1.5 rounded-full bg-[var(--tf-bg-canvas)]">
                    <div className="h-full w-2 rounded-full bg-[var(--tf-border-strong)]" />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-[var(--tf-border-subtle)] px-5 py-4">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-[var(--tf-text-secondary)]" />
              <h3 className="text-sm font-semibold text-[var(--tf-text-primary)]">最近任务</h3>
            </div>
            <ArrowUpRight className="h-4 w-4 text-[var(--tf-text-muted)]" />
          </div>
          <div className="divide-y divide-[var(--tf-border-subtle)]">
            {recentTasks.map((task) => (
              <div key={task.name} className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--tf-text-primary)]">{task.name}</p>
                  <p className="mt-1 truncate text-xs text-[var(--tf-text-muted)]">{task.project}</p>
                </div>
                <StatusPill variant={task.variant}>{task.state}</StatusPill>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
