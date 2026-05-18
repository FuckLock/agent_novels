// runtime: nodejs
import fs from 'fs/promises';
import path from 'path';

export type SeedanceStage = 'A' | 'B' | 'C1' | 'C2' | 'C3' | 'D';
export type SeedanceTaskStatus = 'running' | 'complete' | 'failed' | 'skipped';

export interface SeedanceTaskRecord {
  id: string;
  projectName: string;
  episode: number;
  stage: SeedanceStage;
  agent: string;
  action: string;
  model?: string;
  status: SeedanceTaskStatus;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  reason?: string;
  retryAttempt?: number;
}

const NOVELS_ROOT = path.join(process.cwd(), '..', 'novels');

function safeName(name: string): string {
  const sanitized = path.basename(name);
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    throw new Error('非法的项目名称');
  }
  return sanitized;
}

function taskFilePath(projectName: string, episode: number): string {
  return path.join(NOVELS_ROOT, safeName(projectName), 'seedance', `ep${episode}`, 'tasks.jsonl');
}

function makeTaskId(stage: SeedanceStage): string {
  return `${stage}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function appendSeedanceTask(record: SeedanceTaskRecord): Promise<void> {
  const filePath = taskFilePath(record.projectName, record.episode);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf-8');
}

export async function startSeedanceTask(args: {
  projectName: string;
  episode: number;
  stage: SeedanceStage;
  agent: string;
  action: string;
  model?: string;
  retryAttempt?: number;
}): Promise<SeedanceTaskRecord> {
  const record: SeedanceTaskRecord = {
    id: makeTaskId(args.stage),
    projectName: args.projectName,
    episode: args.episode,
    stage: args.stage,
    agent: args.agent,
    action: args.action,
    model: args.model,
    retryAttempt: args.retryAttempt,
    status: 'running',
    startTime: new Date().toISOString(),
  };
  await appendSeedanceTask(record);
  return record;
}

export async function finishSeedanceTask(
  record: SeedanceTaskRecord,
  status: Exclude<SeedanceTaskStatus, 'running'>,
  reason?: string
): Promise<SeedanceTaskRecord> {
  const endTime = new Date();
  const startTime = new Date(record.startTime);
  const done: SeedanceTaskRecord = {
    ...record,
    status,
    endTime: endTime.toISOString(),
    durationMs: endTime.getTime() - startTime.getTime(),
    reason,
  };
  await appendSeedanceTask(done);
  return done;
}

export async function readSeedanceTasks(projectName: string, episode: number): Promise<SeedanceTaskRecord[]> {
  const filePath = taskFilePath(projectName, episode);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SeedanceTaskRecord);
  } catch {
    return [];
  }
}

export function summarizeSeedanceTasks(records: SeedanceTaskRecord[]) {
  const latestByStage: Partial<Record<SeedanceStage, SeedanceTaskRecord>> = {};
  for (const record of records) {
    latestByStage[record.stage] = record;
  }
  return latestByStage;
}

export function getLastFailedSeedanceTask(records: SeedanceTaskRecord[]): SeedanceTaskRecord | null {
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].status === 'failed') return records[i];
  }
  return null;
}
