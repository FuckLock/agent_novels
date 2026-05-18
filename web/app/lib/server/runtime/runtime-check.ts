import fs, { statfs } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getServerEnv } from '../env';
import { getSqlite } from '../db/client';
import { ensureSchema, getMigrationStatus } from '../db/migrate';
import { checkArtifactRepository } from '../artifacts/store';
import { registerDefaultSkillVersions } from '../skills/skill-registry';

const execFileAsync = promisify(execFile);

export type RuntimeCheckStatus = 'passed' | 'warning' | 'failed';

export interface RuntimeCheckItem {
  key: string;
  label: string;
  status: RuntimeCheckStatus;
  message: string;
  details?: Record<string, string | number | boolean>;
}

export interface RuntimeCheckResult {
  id: string;
  status: RuntimeCheckStatus;
  trigger: string;
  dataRoot: string;
  databasePath: string;
  artifactsRoot: string;
  checks: RuntimeCheckItem[];
  summary: Record<RuntimeCheckStatus, number>;
  startedAt: number;
  completedAt: number;
}

function summarize(checks: RuntimeCheckItem[]) {
  return checks.reduce<Record<RuntimeCheckStatus, number>>(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    { passed: 0, warning: 0, failed: 0 },
  );
}

function overall(summary: Record<RuntimeCheckStatus, number>): RuntimeCheckStatus {
  if (summary.failed > 0) return 'failed';
  if (summary.warning > 0) return 'warning';
  return 'passed';
}

async function checkDataRoot(): Promise<RuntimeCheckItem> {
  const env = getServerEnv();
  await fs.mkdir(env.dataRoot, { recursive: true });
  const tempPath = path.join(env.dataRoot, '.runtime-write-check');
  await fs.writeFile(tempPath, String(Date.now()));
  await fs.unlink(tempPath);
  return {
    key: 'data_root',
    label: '数据目录',
    status: 'passed',
    message: 'dataRoot 可写',
    details: { path: env.dataRoot },
  };
}

async function checkDatabase(): Promise<RuntimeCheckItem> {
  const status = await ensureSchema();
  return {
    key: 'database',
    label: '数据库迁移',
    status: status.pending ? 'warning' : 'passed',
    message: status.pending ? '存在待执行 migration' : `schemaVersion ${status.schemaVersion} 已就绪`,
    details: { path: status.databasePath, schemaVersion: status.schemaVersion },
  };
}

async function checkDisk(): Promise<RuntimeCheckItem> {
  const env = getServerEnv();
  const disk = await statfs(env.dataRoot);
  const freeBytes = Number(disk.bavail) * Number(disk.bsize);
  const freeGb = freeBytes / 1024 / 1024 / 1024;
  return {
    key: 'disk',
    label: '磁盘空间',
    status: freeGb < 5 ? 'warning' : 'passed',
    message: `${freeGb.toFixed(1)} GB 可用`,
    details: { freeBytes },
  };
}

async function checkArtifacts(): Promise<RuntimeCheckItem> {
  const repo = await checkArtifactRepository();
  return {
    key: 'artifacts',
    label: 'Artifact 仓库',
    status: repo.missingCount > 0 ? 'warning' : 'passed',
    message: repo.missingCount > 0 ? `${repo.missingCount} 个 Artifact 缺失` : 'Artifact 仓库可写',
    details: {
      path: repo.root,
      artifactCount: repo.artifactCount,
      sizeBytes: repo.sizeBytes,
      missingCount: repo.missingCount,
    },
  };
}

async function checkFfmpeg(): Promise<RuntimeCheckItem> {
  try {
    const { stdout } = await execFileAsync('ffmpeg', ['-version'], { timeout: 2500 });
    const firstLine = stdout.split('\n')[0] || 'ffmpeg available';
    return { key: 'ffmpeg', label: 'ffmpeg', status: 'passed', message: firstLine };
  } catch {
    return {
      key: 'ffmpeg',
      label: 'ffmpeg',
      status: 'warning',
      message: '未检测到 ffmpeg，粗剪导出前需要安装',
    };
  }
}

async function checkModelRegistry(): Promise<RuntimeCheckItem> {
  await ensureSchema();
  const row = getSqlite()
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM provider_configs) AS provider_count,
        (SELECT COUNT(*) FROM model_configs) AS model_count`,
    )
    .get() as { provider_count: number; model_count: number };

  return {
    key: 'model_connection',
    label: '模型连接',
    status: row.model_count > 0 ? 'passed' : 'warning',
    message: row.model_count > 0 ? `${row.model_count} 个模型配置可测试` : '尚未配置模型，设置页可新增并测试连接',
    details: { providerCount: row.provider_count, modelCount: row.model_count },
  };
}

async function checkSkillRegistry(): Promise<RuntimeCheckItem> {
  const result = await registerDefaultSkillVersions();
  return {
    key: 'skill_registry',
    label: 'Skill 注册',
    status: result.registered > 0 ? 'passed' : 'warning',
    message: result.registered > 0 ? `${result.registered} 个 Skill 已注册` : '未发现可注册 Skill',
  };
}

function checkDeferredCapabilities(): RuntimeCheckItem[] {
  return [
    {
      key: 'video_range',
      label: '视频 Range 请求',
      status: 'warning',
      message: '视频 Artifact 预览 API 尚未接入',
    },
    {
      key: 'task_queue',
      label: '任务队列',
      status: 'passed',
      message: '本地 API 进程可用；持久任务队列在 Phase 9 接入',
    },
  ];
}

async function capture(key: string, label: string, fn: () => Promise<RuntimeCheckItem>): Promise<RuntimeCheckItem> {
  try {
    return await fn();
  } catch (error: unknown) {
    return {
      key,
      label,
      status: 'failed',
      message: error instanceof Error ? error.message : '检查失败',
    };
  }
}

export async function runRuntimeCheck(trigger = 'manual'): Promise<RuntimeCheckResult> {
  const startedAt = Date.now();
  const env = getServerEnv();
  const checks = [
    await capture('data_root', '数据目录', checkDataRoot),
    await capture('database', '数据库迁移', checkDatabase),
    await capture('artifacts', 'Artifact 仓库', checkArtifacts),
    await capture('disk', '磁盘空间', checkDisk),
    await capture('ffmpeg', 'ffmpeg', checkFfmpeg),
    await capture('model_connection', '模型连接', checkModelRegistry),
    await capture('skill_registry', 'Skill 注册', checkSkillRegistry),
    ...checkDeferredCapabilities(),
  ];
  const summary = summarize(checks);
  const completedAt = Date.now();
  const result: RuntimeCheckResult = {
    id: randomUUID(),
    status: overall(summary),
    trigger,
    dataRoot: env.dataRoot,
    databasePath: env.databasePath,
    artifactsRoot: env.artifactsRoot,
    checks,
    summary,
    startedAt,
    completedAt,
  };

  await ensureSchema();
  getSqlite()
    .prepare(
      `INSERT INTO runtime_checks
        (id, status, trigger, data_root, database_path, artifacts_root, checks_json, summary_json,
         started_at, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      result.id,
      result.status,
      trigger,
      result.dataRoot,
      result.databasePath,
      result.artifactsRoot,
      JSON.stringify(result.checks),
      JSON.stringify(result.summary),
      startedAt,
      completedAt,
      startedAt,
      completedAt,
    );

  return result;
}

export async function getRuntimeSnapshot() {
  await ensureSchema();
  return {
    env: getServerEnv(),
    migration: getMigrationStatus(),
  };
}
