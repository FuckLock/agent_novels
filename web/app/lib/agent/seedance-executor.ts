// runtime: nodejs
import { SSEEvent } from './types';
import {
  detectPipelineStatus,
  getSeedanceAssets,
  parseDirectorToAssets,
  runDirectorAnalysis,
  runDirectorPlan,
  runStoryboardPrompts,
  runStoryboardTable,
} from '@/app/lib/novels';
import {
  finishSeedanceTask,
  readSeedanceTasks,
  startSeedanceTask,
  summarizeSeedanceTasks,
  getLastFailedSeedanceTask,
  type SeedanceStage,
} from './task-record';
import { prepareSeedanceVideoTasks } from './seedance-video';

type SendFn = (event: SSEEvent) => void;

const STAGES: SeedanceStage[] = ['A', 'B', 'C1', 'C2', 'C3', 'D'];

const STAGE_LABEL: Record<SeedanceStage, string> = {
  A: 'A 导演分析',
  B: 'B 资产管理',
  C1: 'C1 导演规划',
  C2: 'C2 分镜表',
  C3: 'C3 分镜提示词',
  D: 'D 视频任务',
};

const STAGE_AGENT: Record<SeedanceStage, { agent: string; action: string }> = {
  A: { agent: 'director', action: 'analyze' },
  B: { agent: 'seedance-main', action: 'asset' },
  C1: { agent: 'seedance-main', action: 'director-plan' },
  C2: { agent: 'seedance-main', action: 'storyboard-table' },
  C3: { agent: 'storyboard-artist', action: 'storyboard-prompt' },
  D: { agent: 'seedance-main', action: 'video' },
};

function stageIndex(stage: SeedanceStage): number {
  return STAGES.indexOf(stage);
}

function shouldRun(stage: SeedanceStage, fromStage: SeedanceStage, toStage: SeedanceStage): boolean {
  const idx = stageIndex(stage);
  return idx >= stageIndex(fromStage) && idx <= stageIndex(toStage);
}

async function runStage(
  send: SendFn,
  projectName: string,
  episode: number,
  stage: SeedanceStage,
  modelId?: string
): Promise<boolean> {
  const stageInfo = STAGE_AGENT[stage];
  const task = await startSeedanceTask({
    projectName,
    episode,
    stage,
    agent: stageInfo.agent,
    action: stageInfo.action,
    model: modelId,
  });

  send({ type: 'status', data: `${STAGE_LABEL[stage]}处理中...`, agentLabel: '制片' });

  try {
    if (stage === 'A') {
      const result = await runDirectorAnalysis(projectName, episode, modelId);
      send({
        type: 'content_saved',
        data: JSON.stringify({ type: 'seedance-director', episode, assetsCreated: result.assetsCreated }),
      });
    } else if (stage === 'B') {
      const assetsBefore = await getSeedanceAssets(projectName);
      const created = assetsBefore.length === 0 ? await parseDirectorToAssets(projectName, episode) : 0;
      const assetsAfter = await getSeedanceAssets(projectName);
      if (assetsAfter.length === 0) {
        throw new Error('资产提取后仍为空，请检查导演讲戏本格式');
      }
      send({
        type: 'content_saved',
        data: JSON.stringify({ type: 'seedance-assets', episode, assetsCreated: created, totalAssets: assetsAfter.length }),
      });
    } else if (stage === 'C1') {
      await runDirectorPlan(projectName, episode, modelId);
      send({ type: 'content_saved', data: JSON.stringify({ type: 'seedance-director-plan', episode }) });
    } else if (stage === 'C2') {
      await runStoryboardTable(projectName, episode, modelId);
      send({ type: 'content_saved', data: JSON.stringify({ type: 'seedance-storyboard-table', episode }) });
    } else if (stage === 'C3') {
      await runStoryboardPrompts(projectName, episode, modelId);
      send({ type: 'content_saved', data: JSON.stringify({ type: 'seedance-prompts', episode }) });
    } else if (stage === 'D') {
      const result = await prepareSeedanceVideoTasks(projectName, episode, modelId, (message) => {
        send({ type: 'status', data: message, agentLabel: '制片' });
      });
      task.model = result.modelId || task.model;
      send({
        type: 'content_saved',
        data: JSON.stringify({
          type: 'seedance-video-tasks',
          episode,
          taskCount: result.taskCount,
          submittedCount: result.submittedCount,
          successCount: result.successCount,
          failedCount: result.failedCount,
          filePath: result.filePath,
          modelId: result.modelId,
        }),
      });
    }

    await finishSeedanceTask(task, 'complete');
    send({ type: 'status', data: `${STAGE_LABEL[stage]}完成`, agentLabel: '制片' });
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : '未知错误';
    await finishSeedanceTask(task, 'failed', reason);
    send({ type: 'error', data: `${STAGE_LABEL[stage]}失败：${reason}` });
    return false;
  }
}

export async function executeSeedanceFlow(
  send: SendFn,
  params: {
    projectName: string;
    episode: number;
    fromStage?: SeedanceStage;
    toStage?: SeedanceStage;
    modelId?: string;
  }
): Promise<void> {
  const fromStage = params.fromStage || 'A';
  const toStage = params.toStage || 'C3';

  for (const stage of STAGES) {
    if (!shouldRun(stage, fromStage, toStage)) continue;
    const ok = await runStage(send, params.projectName, params.episode, stage, params.modelId);
    if (!ok) return;
  }

  send({ type: 'done', data: JSON.stringify({ projectName: params.projectName, episode: params.episode, fromStage, toStage }) });
}

export async function getSeedanceFlowStatus(projectName: string, episode: number) {
  const [pipeline, tasks] = await Promise.all([
    detectPipelineStatus(projectName, episode),
    readSeedanceTasks(projectName, episode),
  ]);
  return {
    projectName,
    episode,
    pipeline,
    tasks,
    latestByStage: summarizeSeedanceTasks(tasks),
  };
}

export async function fixSeedanceFlow(
  send: SendFn,
  params: {
    projectName: string;
    episode: number;
    stage?: SeedanceStage;
    feedback?: string;
    modelId?: string;
  }
): Promise<void> {
  const tasks = await readSeedanceTasks(params.projectName, params.episode);
  const failed = getLastFailedSeedanceTask(tasks);
  const stage = params.stage || failed?.stage;
  if (!stage) {
    send({ type: 'error', data: '未找到失败阶段，请指定 stage。' });
    return;
  }

  if (params.feedback) {
    send({ type: 'status', data: `收到修复反馈：${params.feedback}`, agentLabel: '制片' });
  }

  await runStage(send, params.projectName, params.episode, stage, params.modelId);
  send({ type: 'done', data: JSON.stringify({ projectName: params.projectName, episode: params.episode, stage }) });
}

export function isSeedanceStage(value: unknown): value is SeedanceStage {
  return typeof value === 'string' && STAGES.includes(value as SeedanceStage);
}
