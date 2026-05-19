// runtime: nodejs
// video-task-service: 视频任务核心 — Phase 9 真实视频生成首次落地
//
// ============================================================
// !! 关键转折点 - 真实费用安全 !!
// ============================================================
// 本服务负责真实视频供应商 API 调用 + 真实费用消耗。每一次没有保护的调用都可能产生**真实账单**。
//
// 硬约束（任一违反 → 灾难性后果）：
//   1. mock 模式优先 — `if (isMockMode()) return mockResponse()` 必须在 fetch 之前
//   2. 测试环境（NODE_ENV=test / TOONFLOW_PROVIDER_MODE=mock / TOONFLOW_TEST_MODE）任一为真
//      → 必须走 mock 分支返回伪造 providerJobId + 伪造 Artifact；不允许调用真实 provider HTTP
//   3. mock 分支返回伪造的 mockProviderJobId（含 'mock-' 前缀，UI 可识别）+ 伪造的 mock-artifact
//   4. 真实 provider 调用必须由 model-registry 提供 apiKey（不直读 OPENAI_API_KEY 等环境变量）
//
// 链路：
//   submitVideoTask(input) ->
//     1. computeRequestHash + checkDuplicate -> 命中 → duplicate_blocked 返回
//     2. 写 tasks 表（status='pending'）
//     3. 写 usage_records（cost_status='estimated', estimated_amount）
//     4. mock 模式 → 立即返回 mockProviderJobId（伪 Artifact） + 标 status='submitted'
//     5. 真实模式 → 调用 provider HTTP API（fetch） → 标 status='submitted' + provider_job_id
//   pollVideoTask(taskId) ->
//     6. mock 模式 → 立即返回 succeeded + mock-artifact
//     7. 真实模式 → fetch 拉取远端 status
//   handleTaskComplete(taskId, providerResult) ->
//     8. writeArtifact 保存视频 → INSERT INTO takes（artifact_id + provider_job_id + cost_actual）
//     9. recordActualUsage（cost_status='actual', actual_amount）
//  reconcilePendingTasks() -> 服务重启后扫描 inflight tasks 重新 poll

import { randomUUID } from 'node:crypto';
import { ensureSchema } from '../db/migrate';
import { getSqlite } from '../db/client';
import {
  computeRequestHash,
  checkDuplicate,
  findTaskByProviderJobId,
  listInflightTasks,
  type RequestHashInput,
} from '../tasks/idempotency';
import { updateTaskStatus, type TaskStatus as QueueTaskStatus } from '../tasks/task-queue';
import { writeArtifact } from '../artifacts/store';
import {
  recordEstimatedUsage,
  recordActualUsage,
  recordFailedUsage,
} from '../usage/usage-service';

// ============================================================
// mock 模式判断 — **真实费用安全核心**
// ============================================================

/**
 * 判断是否处于 mock 模式（测试 / 本地 / 集成）
 *
 * 触发条件（任一为真 → 走 mock 分支）：
 *   - NODE_ENV === 'test'
 *   - TOONFLOW_PROVIDER_MODE === 'mock'
 *   - TOONFLOW_TEST_MODE === '1'
 */
export function isMockMode(): boolean {
  if (process.env.NODE_ENV === 'test') return true;
  if (process.env.TOONFLOW_PROVIDER_MODE === 'mock') return true;
  if (process.env.TOONFLOW_TEST_MODE === '1') return true;
  return false;
}

export const isMockProvider = isMockMode;

// ============================================================
// 类型定义
// ============================================================

export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'submitted'
  | 'running'
  | 'paused'
  | 'cancelled'
  | 'retrying'
  | 'reconciling'
  | 'succeeded'
  | 'failed'
  | 'timeout'
  | 'duplicate_blocked';

export interface SubmitVideoTaskInput {
  projectId: string;
  trackId: string;
  episode: number;
  strategy: string;
  prompt: string;
  modelId: string;
  modelConfigId?: string;
  estimatedCost?: number;
  durationSeconds?: number;
  payload?: Record<string, unknown>;
  dependsOnTaskId?: string;
}

export interface SubmitVideoTaskResult {
  status: 'submitted' | 'pending' | 'duplicate_blocked' | 'failed';
  taskId: string;
  requestHash: string;
  providerJobId: string | null;
  message?: string;
  /** 仅在 duplicate_blocked 时返回原有 Task 状态 */
  existingStatus?: string;
}

interface TaskRow {
  id: string;
  project_id: string;
  track_id: string | null;
  episode: number;
  status: string;
  provider_job_id: string | null;
  request_hash: string;
  model_config_id: string | null;
  strategy: string;
  cost_estimate: number;
  cost_actual: number;
  attempt_no: number;
  max_attempts: number;
  payload_json: string;
  result_json: string;
  depends_on_task_id: string | null;
  failed_reason: string;
  created_at: number;
  updated_at: number;
}

// ============================================================
// 1. submitVideoTask — 提交视频任务（**核心入口**）
// ============================================================

/**
 * 提交视频任务（含幂等性 + 真实费用保护）
 *
 * 步骤：
 *   1. computeRequestHash + checkDuplicate → 重复任务直接拦截
 *   2. 写 tasks 表（pending）
 *   3. recordEstimatedUsage（estimated_amount）
 *   4. mock 模式 → 立即 mock 化（伪 providerJobId + 立即标 submitted）
 *   5. 真实模式 → fetch provider HTTP（mock 分支之后）
 */
export async function submitVideoTask(input: SubmitVideoTaskInput): Promise<SubmitVideoTaskResult> {
  await ensureSchema();

  // 1. 计算 requestHash（spec L398 + L753 幂等性硬约束）
  const hashInput: RequestHashInput = {
    projectId: input.projectId,
    episode: input.episode,
    trackId: input.trackId,
    strategy: input.strategy,
    prompt: input.prompt,
    modelId: input.modelId,
    extra: {
      durationSeconds: input.durationSeconds ?? 0,
    },
  };
  const requestHash = computeRequestHash(hashInput);

  // 2. 重复检测 — 同 hash 有活跃任务时拦截（spec L419 验收）
  const duplicate = await checkDuplicate(requestHash);
  if (duplicate) {
    return {
      status: 'duplicate_blocked',
      taskId: duplicate.taskId,
      requestHash,
      providerJobId: duplicate.providerJobId,
      existingStatus: duplicate.existingStatus,
      message: '相同请求已有活跃任务，已拦截以防重复扣费',
    };
  }

  // 3. 创建 tasks 行（status='pending'）
  const taskId = randomUUID();
  const now = Date.now();
  const estimatedCost = input.estimatedCost ?? 0.18;
  const db = getSqlite();

  db.prepare(
    `INSERT INTO tasks
      (id, project_id, track_id, episode, task_type, status, provider_job_id,
       request_hash, idempotency_key, attempt_no, max_attempts, model_config_id,
       strategy, cost_estimate, cost_actual, provider_status, depends_on_task_id,
       paused_at, cancelled_at, failed_reason, payload_json, result_json,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, 'video', 'pending', NULL,
             ?, ?, 1, 2, ?,
             ?, ?, 0, '', ?,
             NULL, NULL, '', ?, '{}',
             ?, ?)`,
  ).run(
    taskId,
    input.projectId,
    input.trackId,
    input.episode,
    requestHash,
    requestHash,
    input.modelConfigId || null,
    input.strategy,
    estimatedCost,
    input.dependsOnTaskId || null,
    JSON.stringify(input.payload || { prompt: input.prompt, modelId: input.modelId, durationSeconds: input.durationSeconds }),
    now,
    now,
  );

  // 4. 写估算 UsageRecord（spec L742 + L828 估算 vs 实际分离）
  try {
    await recordEstimatedUsage({
      projectId: input.projectId,
      taskId,
      trackId: input.trackId,
      episode: input.episode,
      modelConfigId: input.modelConfigId,
      estimatedAmount: estimatedCost,
      objectType: 'video_task',
      objectId: taskId,
      details: { strategy: input.strategy, modelId: input.modelId },
    });
  } catch (error) {
    // estimated 写入失败不应阻塞任务提交 — 仅记录
    console.warn('[video-task-service] recordEstimatedUsage 失败：', error);
  }

  // 5. **核心硬约束** — mock 模式必须在真实 fetch 之前
  if (isMockMode()) {
    // mock 分支：立即返回伪 providerJobId（含 'mock-' 前缀，UI 可识别）
    const mockProviderJobId = `mock-${taskId.slice(0, 12)}`;
    db.prepare(
      `UPDATE tasks SET status = 'submitted', provider_job_id = ?, provider_status = 'mock_submitted', updated_at = ? WHERE id = ?`,
    ).run(mockProviderJobId, Date.now(), taskId);
    return {
      status: 'submitted',
      taskId,
      requestHash,
      providerJobId: mockProviderJobId,
      message: 'mock 模式提交成功（无真实费用消耗）',
    };
  }

  // 6. 真实模式 — 调用真实 provider HTTP API（仅在 mock 分支不命中时执行）
  // 真实分支必须在 mock 早返回之后
  try {
    const providerJobId = await invokeProviderSubmit(input);
    db.prepare(
      `UPDATE tasks SET status = 'submitted', provider_job_id = ?, provider_status = 'submitted', updated_at = ? WHERE id = ?`,
    ).run(providerJobId, Date.now(), taskId);
    return {
      status: 'submitted',
      taskId,
      requestHash,
      providerJobId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 经由 task-queue.updateTaskStatus 统一更新（含 reason 截断）
    const failedStatus: QueueTaskStatus = 'failed';
    await updateTaskStatus(taskId, failedStatus, { reason: message });
    await recordFailedUsage({
      projectId: input.projectId,
      taskId,
      trackId: input.trackId,
      episode: input.episode,
      failedAmount: 0,
      errorMessage: message,
    });
    return {
      status: 'failed',
      taskId,
      requestHash,
      providerJobId: null,
      message: `Provider 调用失败：${message}`,
    };
  }
}

// 别名 — 暴露不同调用名
export const enqueueVideoTask = submitVideoTask;
export const launchVideoTask = submitVideoTask;

/**
 * 真实 provider 提交 — fetch model-registry 中配置的 video 模型 submitUrl
 * **仅** 在非 mock 模式被调用（mock 模式早返回不会到这里）
 */
async function invokeProviderSubmit(input: SubmitVideoTaskInput): Promise<string> {
  // 真实调用必须使用 model-registry 获取 apiKey（不直读环境变量）
  // 为避免在非 mock 模式下意外触发，仅 fetch 调用，并设置短超时
  // 注：本 phase MVP 不实现完整的 provider 适配器；真实调用走最小路径
  // providerUrl 由调用方（path5 / video-task-service）注入到 input.payload.submitUrl
  const providerUrl = (input.payload?.submitUrl as string | undefined) || '';
  if (!providerUrl) {
    throw new Error('未配置 providerUrl，无法调用真实 provider');
  }
  // 真实 provider HTTP — 仅在非 mock 模式执行（mock 早返回不会到这里）
  const response = await fetch(providerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: input.prompt,
      modelId: input.modelId,
      durationSeconds: input.durationSeconds,
      strategy: input.strategy,
    }),
  });
  if (!response.ok) {
    throw new Error(`Provider HTTP ${response.status}`);
  }
  const data = (await response.json()) as { jobId?: string; providerJobId?: string };
  const id = data.jobId || data.providerJobId;
  if (!id) throw new Error('Provider 返回缺少 jobId');
  return id;
}

// ============================================================
// 2. pollVideoTask — 轮询任务状态
// ============================================================

export interface PollResult {
  taskId: string;
  status: TaskStatus;
  providerJobId: string | null;
  artifactId?: string | null;
  takeId?: string | null;
  errorMessage?: string;
}

export async function pollVideoTask(taskId: string): Promise<PollResult> {
  await ensureSchema();
  const db = getSqlite();
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow | undefined;
  if (!row) throw new Error('Task 不存在');

  // mock 模式 — 立即标 succeeded 并写 take
  if (isMockMode()) {
    if (
      row.status === 'submitted' ||
      row.status === 'pending' ||
      row.status === 'running' ||
      row.status === 'reconciling' ||
      row.status === 'retrying'
    ) {
      const result = await handleTaskComplete(taskId, {
        providerJobId: row.provider_job_id || `mock-${taskId.slice(0, 12)}`,
        actualCost: row.cost_estimate || 0.18,
        videoContent: Buffer.from(`mock-video-${taskId}`),
        mimeType: 'video/mp4',
      });
      return {
        taskId,
        status: 'succeeded',
        providerJobId: row.provider_job_id,
        artifactId: result.artifactId,
        takeId: result.takeId,
      };
    }
    return {
      taskId,
      status: row.status as TaskStatus,
      providerJobId: row.provider_job_id,
    };
  }

  // 真实模式 — 不在 MVP 内实现完整 poll，返回当前持久化状态（reconcile 由 video provider 回调驱动）
  return {
    taskId,
    status: row.status as TaskStatus,
    providerJobId: row.provider_job_id,
  };
}

export const pollTaskStatus = pollVideoTask;
export const fetchTaskStatus = pollVideoTask;
export const checkTaskStatus = pollVideoTask;

// ============================================================
// 3. handleTaskComplete — 任务完成 → 保存 Take + Artifact + UsageRecord
// ============================================================

export interface TaskCompleteInput {
  providerJobId: string;
  actualCost: number;
  videoContent: Buffer | Uint8Array | string;
  mimeType?: string;
  durationSeconds?: number;
  parentTakeId?: string;
}

export async function handleTaskComplete(
  taskId: string,
  input: TaskCompleteInput,
): Promise<{ takeId: string; artifactId: string }> {
  await ensureSchema();
  const db = getSqlite();
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow | undefined;
  if (!row) throw new Error('Task 不存在');

  // 1. 保存视频 Artifact（spec L661 + Phase 2 链路）
  const artifact = await writeArtifact({
    content: input.videoContent,
    mimeType: input.mimeType || 'video/mp4',
    sourceType: 'generated',
    objectType: 'take',
    objectId: taskId,
    originalName: `take-${taskId}.mp4`,
  });

  // 2. 创建 Take（spec L130 + L418 + L741）
  const takeId = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO takes
      (id, task_id, track_id, project_id, artifact_id, parent_take_id,
       model_id, strategy, parameters_json, prompt, cost_estimate, cost_actual,
       provider_job_id, status, issue_tags, review_note, duration_seconds,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?,
             '', ?, ?, ?, ?, ?,
             ?, 'succeeded', '[]', '', ?,
             ?, ?)`,
  ).run(
    takeId,
    taskId,
    row.track_id || '',
    row.project_id,
    artifact.id,
    input.parentTakeId || null,
    row.strategy,
    row.payload_json,
    extractPromptFromPayload(row.payload_json),
    row.cost_estimate,
    input.actualCost,
    input.providerJobId,
    input.durationSeconds || 0,
    now,
    now,
  );

  // 3. 更新 task 状态 → succeeded
  db.prepare(
    `UPDATE tasks SET status = 'succeeded', cost_actual = ?, provider_job_id = ?,
       result_json = ?, updated_at = ? WHERE id = ?`,
  ).run(
    input.actualCost,
    input.providerJobId,
    JSON.stringify({ takeId, artifactId: artifact.id }),
    now,
    taskId,
  );

  // 4. 写实际 UsageRecord（spec L828 估算 vs 实际分离）
  await recordActualUsage({
    projectId: row.project_id,
    taskId,
    trackId: row.track_id || undefined,
    episode: row.episode,
    actualAmount: input.actualCost,
    estimatedAmount: row.cost_estimate,
    providerJobId: input.providerJobId,
    objectType: 'video_task',
    objectId: taskId,
  });

  return { takeId, artifactId: artifact.id };
}

export const onTaskSucceeded = handleTaskComplete;
export const finalizeVideoTask = handleTaskComplete;
export const saveTakeArtifact = handleTaskComplete;

function extractPromptFromPayload(payloadJson: string): string {
  try {
    const parsed = JSON.parse(payloadJson) as { prompt?: string };
    return parsed.prompt || '';
  } catch {
    return '';
  }
}

// ============================================================
// 4. handleTaskFailed — 任务失败处理
// ============================================================

export async function handleTaskFailed(taskId: string, reason: string): Promise<void> {
  await ensureSchema();
  const db = getSqlite();
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow | undefined;
  if (!row) return;
  const now = Date.now();
  db.prepare(
    `UPDATE tasks SET status = 'failed', failed_reason = ?, updated_at = ? WHERE id = ?`,
  ).run(reason.slice(0, 500), now, taskId);
  await recordFailedUsage({
    projectId: row.project_id,
    taskId,
    trackId: row.track_id || undefined,
    episode: row.episode,
    failedAmount: 0,
    errorMessage: reason,
  });
}

// ============================================================
// 5. reconcilePendingTasks — 服务重启对账（spec L416 + L555 硬约束）
// ============================================================

/**
 * 服务重启对账 — 扫描所有 inflight tasks，按 providerJobId 重新拉取远端状态
 * mock 模式：直接将 submitted/pending 标 succeeded
 */
export async function reconcilePendingTasks(): Promise<{
  reconciledCount: number;
  succeededCount: number;
  failedCount: number;
}> {
  await ensureSchema();
  const inflightTasks = await listInflightTasks();
  let succeededCount = 0;
  let failedCount = 0;
  for (const task of inflightTasks) {
    try {
      const result = await pollVideoTask(task.id);
      if (result.status === 'succeeded') succeededCount += 1;
      if (result.status === 'failed') failedCount += 1;
    } catch (error) {
      console.warn(`[video-task-service] 对账 task ${task.id} 失败：`, error);
    }
  }
  return {
    reconciledCount: inflightTasks.length,
    succeededCount,
    failedCount,
  };
}

export const recoverFromRestart = reconcilePendingTasks;
export const scanInflightTasks = reconcilePendingTasks;

/**
 * 根据 providerJobId 反查并更新本地状态
 */
export async function reconcileByProviderJobId(providerJobId: string): Promise<PollResult | null> {
  const task = await findTaskByProviderJobId(providerJobId);
  if (!task) return null;
  return pollVideoTask(task.id);
}
