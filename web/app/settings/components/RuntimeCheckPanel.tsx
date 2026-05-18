import { AlertTriangle, CheckCircle2, Database, FolderArchive, RefreshCw } from 'lucide-react';
import Button from '@/app/components/Button';
import Card from '@/app/components/Card';
import StatusPill, { StatusVariant } from '@/app/components/StatusPill';

type RuntimeStatus = 'passed' | 'warning' | 'failed';

export interface RuntimeCheckItem {
  key: string;
  label: string;
  status: RuntimeStatus;
  message: string;
  details?: Record<string, string | number | boolean>;
}

export interface RuntimeCheckResult {
  id: string;
  status: RuntimeStatus;
  dataRoot: string;
  databasePath: string;
  artifactsRoot: string;
  checks: RuntimeCheckItem[];
  summary: Record<RuntimeStatus, number>;
  completedAt: number;
}

interface RuntimeCheckPanelProps {
  runtimeCheck: RuntimeCheckResult | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
}

const statusVariant: Record<RuntimeStatus, StatusVariant> = {
  passed: 'success',
  warning: 'warning',
  failed: 'danger',
};

function formatTime(value?: number) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getFixHint(check: RuntimeCheckItem) {
  if (check.key === 'data_root') return '检查 TOONFLOW_DATA_DIR 权限，或切换到可写目录。';
  if (check.key === 'database') return '重启 Web 服务后重试 migration；仍失败时检查数据库文件权限。';
  if (check.key === 'ffmpeg') return '安装 ffmpeg，并确保命令在 PATH 中可执行。';
  if (check.key === 'model_connection') return '在下方模型设置中配置供应商和模型密钥。';
  if (check.key === 'video_range') return '视频 Artifact 预览会在制作阶段接入，当前仅提示风险。';
  if (check.key === 'artifacts') return '检查 Artifact 根目录是否可写，缺失文件需从备份恢复。';
  return '查看运行环境和权限配置。';
}

export default function RuntimeCheckPanel({ runtimeCheck, loading, error, onRefresh }: RuntimeCheckPanelProps) {
  const problemChecks = runtimeCheck?.checks.filter((check) => check.status !== 'passed') ?? [];

  return (
    <Card className="mb-8 overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--tf-border-subtle)] px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-[var(--tf-text-secondary)]" />
            <h2 className="text-sm font-semibold text-[var(--tf-text-primary)]">运行环境</h2>
            {runtimeCheck && <StatusPill variant={statusVariant[runtimeCheck.status]}>{runtimeCheck.status}</StatusPill>}
          </div>
          <p className="mt-1 text-xs text-[var(--tf-text-muted)]">
            最近检查 {formatTime(runtimeCheck?.completedAt)}
          </p>
          {runtimeCheck && (
            <p className="mt-1 text-xs text-[var(--tf-text-muted)]">
              通过 {runtimeCheck.summary.passed} · 提醒 {runtimeCheck.summary.warning} · 失败 {runtimeCheck.summary.failed}
            </p>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={onRefresh} loading={loading}>
          <RefreshCw className="h-4 w-4" />
          重新检查
        </Button>
      </div>

      {error ? (
        <div className="px-5 py-4 text-sm text-[var(--tf-danger)]">{error}</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-3">
            <div className="rounded-[var(--tf-radius-sm)] border border-[var(--tf-border-subtle)] bg-[var(--tf-bg-raised)] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--tf-text-primary)]">
                <FolderArchive className="h-4 w-4" />
                数据位置
              </div>
              <dl className="space-y-2 text-xs">
                <div>
                  <dt className="text-[var(--tf-text-muted)]">dataRoot</dt>
                  <dd className="break-all font-mono text-[var(--tf-text-primary)]">{runtimeCheck?.dataRoot || '-'}</dd>
                </div>
                <div>
                  <dt className="text-[var(--tf-text-muted)]">database</dt>
                  <dd className="break-all font-mono text-[var(--tf-text-primary)]">{runtimeCheck?.databasePath || '-'}</dd>
                </div>
                <div>
                  <dt className="text-[var(--tf-text-muted)]">artifacts</dt>
                  <dd className="break-all font-mono text-[var(--tf-text-primary)]">{runtimeCheck?.artifactsRoot || '-'}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="space-y-3">
            {(runtimeCheck?.checks ?? []).map((check) => (
              <div key={check.key} className="grid grid-cols-[1fr_auto] items-start gap-3 rounded-[var(--tf-radius-sm)] border border-[var(--tf-border-subtle)] p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--tf-text-primary)]">{check.label}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--tf-text-secondary)]">{check.message}</p>
                </div>
                <StatusPill variant={statusVariant[check.status]}>{check.status}</StatusPill>
              </div>
            ))}
          </div>
        </div>
      )}

      {problemChecks.length > 0 && (
        <div className="border-t border-[var(--tf-border-subtle)] bg-[var(--tf-warning-soft)] px-5 py-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--tf-warning)]">
            <AlertTriangle className="h-4 w-4" />
            修复入口
          </div>
          <div className="space-y-2">
            {problemChecks.map((check) => (
              <p key={check.key} className="text-xs leading-5 text-[var(--tf-text-secondary)]">
                <span className="font-semibold text-[var(--tf-text-primary)]">{check.label}：</span>
                {getFixHint(check)}
              </p>
            ))}
          </div>
        </div>
      )}

      {runtimeCheck && problemChecks.length === 0 && (
        <div className="border-t border-[var(--tf-border-subtle)] px-5 py-4 text-xs text-[var(--tf-success)]">
          <CheckCircle2 className="mr-1 inline h-4 w-4" />
          核心运行环境检查通过
        </div>
      )}
    </Card>
  );
}
