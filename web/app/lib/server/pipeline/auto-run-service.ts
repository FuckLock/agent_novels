// runtime: nodejs
// auto-run-service: ~sd auto 编排器
//
// 核心规则（spec 硬约束）：
//   ~sd auto 顺序执行 A → B → C1 → C2 → C3，**不含 D 阶段**。
//   D 阶段（视频生成）成本最高，必须由用户在路径 5（D 提交确认）显式触发，
//   不允许 auto-run 自动进入。
//
// 控制接口：startAutoRun / pauseAutoRun / resumeAutoRun / skipStage / terminateAutoRun
// 状态枚举：idle / running / paused / blocked / failed / completed / terminated
// AgentRun 链路：每个阶段切换写 recordAgentRun（input 含 stage / episode / action）
//                被调用的 executeSeedanceFlow 内部仍走 task-record 写入

import { randomUUID } from 'node:crypto';
import { executeSeedanceFlow, getSeedanceFlowStatus } from '@/app/lib/agent/seedance-executor';
import type { SSEEvent } from '@/app/lib/agent/types';
import type { SeedanceStage } from '@/app/lib/agent/task-record';
import { recordAgentRun } from '@/app/lib/server/agent/agent-run-service';
import { getPipelineState, describePipeline, type PipelineNode } from './pipeline-service';

// ~sd auto 阶段顺序 — 不含 'D'：视频生成由用户在路径 5 确认（spec 硬约束）
export const AUTO_STAGES: SeedanceStage[] = ['A', 'B', 'C1', 'C2', 'C3'];

export type AutoRunStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'blocked'
  | 'failed'
  | 'completed'
  | 'terminated';

export interface AutoRunState {
  runId: string;
  projectName: string;
  episode: number;
  status: AutoRunStatus;
  currentStage: SeedanceStage | null;
  completedStages: SeedanceStage[];
  events: AutoRunEvent[];
  errorMessage?: string;
  startedAt: number;
  updatedAt: number;
  // C3 完成后 needsDConfirm = true，UI 需引导用户进入路径 5 D 提交确认
  needsDConfirm: boolean;
}

export interface AutoRunEvent {
  ts: number;
  level: 'info' | 'warn' | 'error';
  stage: SeedanceStage | null;
  message: string;
}

// 进程内 auto-run 注册表（按 projectName + episode 唯一）
const runs = new Map<string, AutoRunState>();

function key(projectName: string, episode: number) {
  return `${projectName}::ep${episode}`;
}

function pushEvent(state: AutoRunState, level: AutoRunEvent['level'], stage: SeedanceStage | null, message: string) {
  state.events.push({ ts: Date.now(), level, stage, message });
  // 限制事件流长度，防止内存膨胀
  if (state.events.length > 500) state.events.splice(0, state.events.length - 500);
  state.updatedAt = Date.now();
}

function transition(state: AutoRunState, status: AutoRunStatus, message?: string) {
  state.status = status;
  state.updatedAt = Date.now();
  if (message) pushEvent(state, status === 'failed' || status === 'blocked' ? 'error' : 'info', state.currentStage, message);
}

async function logAgentRunSafe(projectName: string, action: string, input: Record<string, unknown>) {
  try {
    await recordAgentRun(projectName, {
      action,
      agentName: 'auto-run-service',
      status: 'succeeded',
      input,
    });
  } catch (error) {
    // AgentRun 写入失败不应中断编排器
    console.warn('[auto-run] recordAgentRun 写入失败:', error);
  }
}

async function runStageOnce(
  state: AutoRunState,
  stage: SeedanceStage,
  modelId?: string,
): Promise<{ ok: boolean; lastError?: string }> {
  state.currentStage = stage;
  pushEvent(state, 'info', stage, `进入阶段 ${stage}`);
  await logAgentRunSafe(state.projectName, `auto-run.stage.${stage}`, {
    runId: state.runId,
    episode: state.episode,
    stage,
  });

  let lastError: string | undefined;
  let succeeded = false;

  const send = (event: SSEEvent) => {
    if (event.type === 'error') {
      lastError = String((event as { data?: unknown }).data || '阶段失败');
      pushEvent(state, 'error', stage, lastError);
    } else if (event.type === 'status') {
      pushEvent(state, 'info', stage, String((event as { data?: unknown }).data || ''));
    } else if (event.type === 'content_saved') {
      pushEvent(state, 'info', stage, `产物已保存 (${stage})`);
    } else if (event.type === 'done') {
      succeeded = true;
    }
  };

  try {
    // 包装 seedance-executor：从 stage 跑到 stage（单阶段推进）
    await executeSeedanceFlow(send, {
      projectName: state.projectName,
      episode: state.episode,
      fromStage: stage,
      toStage: stage,
      modelId,
    });
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    pushEvent(state, 'error', stage, `阶段 ${stage} 抛错：${lastError}`);
    return { ok: false, lastError };
  }

  // executeSeedanceFlow 在失败时通过 send({type:'error'}) 暴露失败 + 立即 return
  // 没有 lastError + 完成 STAGES 循环 = succeeded（即使没 done 事件也算成功）
  if (lastError) {
    return { ok: false, lastError };
  }
  if (!succeeded) {
    // 兜底：seedance-executor 仅在 toStage 完成时 send done；
    // 单阶段推进若中途出错通常已经走 error 分支，这里走 done check 仅做信号确认
    pushEvent(state, 'info', stage, `阶段 ${stage} 完成（未收到 done 信号，按 send 流推断成功）`);
  }
  state.completedStages.push(stage);
  pushEvent(state, 'info', stage, `阶段 ${stage} 完成`);
  return { ok: true };
}

async function autoLoop(state: AutoRunState, modelId?: string) {
  for (const stage of AUTO_STAGES) {
    // 推进前检查状态（暂停 / 终止 / 跳过 立即生效）
    if (state.status === 'paused') {
      pushEvent(state, 'info', stage, '编排器在暂停状态，停止推进');
      return;
    }
    if (state.status === 'terminated') {
      pushEvent(state, 'info', stage, '编排器已终止');
      return;
    }
    if (state.completedStages.includes(stage)) {
      continue; // resume / skip 后跳过已完成阶段
    }

    try {
      const result = await runStageOnce(state, stage, modelId);
      if (!result.ok) {
        // 单阶段失败 → 自动转入 blocked，等待用户决策（修复 / skip / terminate）
        state.errorMessage = result.lastError;
        transition(state, 'blocked', `阶段 ${stage} 失败，已自动暂停（blocked）：${result.lastError || '未知错误'}`);
        return;
      }
    } catch (error) {
      // 异常容错：编排器层永不抛
      const message = error instanceof Error ? error.message : String(error);
      state.errorMessage = message;
      transition(state, 'failed', `编排器异常：${message}`);
      return;
    }
  }

  // 全部 A→C3 完成
  state.currentStage = null;
  state.needsDConfirm = true;
  // D 阶段（视频生成）由用户在路径 5（path5）确认，~sd auto 不自动进入
  transition(state, 'completed', '✅ A→C3 完成，~sd auto 任务结束。D 阶段（视频生成）请进入路径 5 / D 提交确认。');
  await logAgentRunSafe(state.projectName, 'auto-run.completed', {
    runId: state.runId,
    episode: state.episode,
    completedStages: state.completedStages,
    notes: 'D 阶段由用户在路径 5 确认',
  });
}

// ============ 5 控制函数（导出） ============

/**
 * 启动 ~sd auto。
 * 若同 (project, episode) 已有 running/paused/blocked 状态 → 返回 conflict。
 */
export async function startAutoRun(
  projectName: string,
  episode: number,
  options?: { modelId?: string },
): Promise<{ ok: boolean; state?: AutoRunState; conflict?: string }> {
  const k = key(projectName, episode);
  const existing = runs.get(k);
  if (existing && ['running', 'paused', 'blocked'].includes(existing.status)) {
    return { ok: false, conflict: `已存在 ${existing.status} 状态的 auto-run（runId=${existing.runId}），请先暂停 / 终止`, state: existing };
  }

  // 读取当前管线快照（决定是否需要从头开始）
  let alreadyCompletedStages: SeedanceStage[] = [];
  try {
    const snapshot = await getPipelineState(projectName, episode);
    const desc = describePipeline(snapshot);
    if (desc.reachedC3) {
      // A→C3 全部完成 → 直接置为 completed + needsDConfirm
      const state: AutoRunState = {
        runId: randomUUID(),
        projectName,
        episode,
        status: 'completed',
        currentStage: null,
        completedStages: ['A', 'B', 'C1', 'C2', 'C3'],
        events: [
          {
            ts: Date.now(),
            level: 'info',
            stage: null,
            message: 'A→C3 已全部完成（来自现有产物），直接进入 D 提交确认。',
          },
        ],
        startedAt: Date.now(),
        updatedAt: Date.now(),
        needsDConfirm: true,
      };
      runs.set(k, state);
      return { ok: true, state };
    }
    // 已完成的前置阶段（基于产物探测）
    for (const node of AUTO_STAGES) {
      const nodeState = snapshot.nodes.find((n) => n.node === (node as PipelineNode));
      if (nodeState?.status === 'completed') {
        alreadyCompletedStages.push(node);
      } else {
        break; // 顺序推进：遇到第一个未完成阶段就停止
      }
    }
  } catch {
    alreadyCompletedStages = [];
  }

  const state: AutoRunState = {
    runId: randomUUID(),
    projectName,
    episode,
    status: 'running',
    currentStage: null,
    completedStages: alreadyCompletedStages,
    events: [
      {
        ts: Date.now(),
        level: 'info',
        stage: null,
        message: `~sd auto 启动 (project=${projectName}, episode=${episode})`,
      },
    ],
    startedAt: Date.now(),
    updatedAt: Date.now(),
    needsDConfirm: false,
  };
  runs.set(k, state);

  await logAgentRunSafe(projectName, 'auto-run.start', {
    runId: state.runId,
    episode,
    completedStages: alreadyCompletedStages,
  });

  // 异步推进，不阻塞 API 响应
  void autoLoop(state, options?.modelId).catch((error) => {
    state.errorMessage = error instanceof Error ? error.message : String(error);
    transition(state, 'failed', `自动循环异常：${state.errorMessage}`);
  });

  return { ok: true, state };
}

/** 暂停 auto-run。下一个阶段推进前会感知并停止。 */
export async function pauseAutoRun(projectName: string, episode: number) {
  const state = runs.get(key(projectName, episode));
  if (!state) return { ok: false, reason: 'auto-run 不存在' as const };
  if (state.status === 'paused') return { ok: true, state };
  if (!['running', 'blocked'].includes(state.status)) {
    return { ok: false, reason: `当前状态 ${state.status} 不能暂停` as const, state };
  }
  transition(state, 'paused', '收到暂停指令，已转入 paused 状态');
  await logAgentRunSafe(projectName, 'auto-run.pause', { runId: state.runId, episode });
  return { ok: true, state };
}

/** 恢复 auto-run。从下一个未完成阶段继续。 */
export async function resumeAutoRun(projectName: string, episode: number, options?: { modelId?: string }) {
  const state = runs.get(key(projectName, episode));
  if (!state) return { ok: false, reason: 'auto-run 不存在' as const };
  if (state.status === 'running') return { ok: true, state };
  if (!['paused', 'blocked'].includes(state.status)) {
    return { ok: false, reason: `当前状态 ${state.status} 不能恢复` as const, state };
  }
  transition(state, 'running', '收到恢复指令，继续推进剩余阶段');
  await logAgentRunSafe(projectName, 'auto-run.resume', { runId: state.runId, episode });
  void autoLoop(state, options?.modelId).catch((error) => {
    state.errorMessage = error instanceof Error ? error.message : String(error);
    transition(state, 'failed', `恢复后异常：${state.errorMessage}`);
  });
  return { ok: true, state };
}

/** 跳过当前阶段（视为完成，进入下一阶段）。慎用：会绕过该阶段的产物校验。 */
export async function skipStage(projectName: string, episode: number, stage: SeedanceStage) {
  const state = runs.get(key(projectName, episode));
  if (!state) return { ok: false, reason: 'auto-run 不存在' as const };
  if (!AUTO_STAGES.includes(stage)) {
    return { ok: false, reason: `阶段 ${stage} 不在 ~sd auto 范围内` as const, state };
  }
  if (!state.completedStages.includes(stage)) {
    state.completedStages.push(stage);
  }
  pushEvent(state, 'warn', stage, `阶段 ${stage} 被用户跳过（skip），后续阶段可能因前置产物缺失而失败`);
  await logAgentRunSafe(projectName, 'auto-run.skip', { runId: state.runId, episode, stage });
  return { ok: true, state };
}

/** 终止 auto-run。当前阶段会等待 send 流自然结束（不强杀）。 */
export async function terminateAutoRun(projectName: string, episode: number) {
  const state = runs.get(key(projectName, episode));
  if (!state) return { ok: false, reason: 'auto-run 不存在' as const };
  if (['completed', 'terminated'].includes(state.status)) return { ok: true, state };
  transition(state, 'terminated', '收到终止指令，编排器停止推进');
  await logAgentRunSafe(projectName, 'auto-run.terminate', { runId: state.runId, episode });
  return { ok: true, state };
}

// ============ 查询函数 ============

export function getAutoRunState(projectName: string, episode: number): AutoRunState | null {
  return runs.get(key(projectName, episode)) || null;
}

export async function getAutoRunSnapshot(projectName: string, episode: number) {
  const state = getAutoRunState(projectName, episode);
  const [pipeline, seedance] = await Promise.all([
    getPipelineState(projectName, episode).catch(() => null),
    getSeedanceFlowStatus(projectName, episode).catch(() => null),
  ]);
  return {
    autoRun: state,
    pipeline,
    seedanceTasks: seedance?.tasks || [],
  };
}

export function listAutoRuns() {
  return Array.from(runs.values());
}
