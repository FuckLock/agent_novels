import { NextResponse } from 'next/server';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import { getPipelineState, describePipeline } from '@/app/lib/server/pipeline/pipeline-service';
import {
  loadTrackPlan,
  lockTrackPlan,
  buildTrackContext,
} from '@/app/lib/server/tracks/track-plan-service';
import {
  evaluateDependencies,
  summarizeDependencyCheck,
} from '@/app/lib/server/production/dependency-check';
import { recordAgentRun } from '@/app/lib/server/agent/agent-run-service';
import { submitVideoTask } from '@/app/lib/server/production/video-task-service';
import { computeRequestHash } from '@/app/lib/server/tasks/idempotency';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/projects/[name]/path5
 *
 * GET  ?episode=N    路径 5 当前状态：reachedC3 / Track 列表 / 依赖 / 预算预估 / 并发上限
 * POST {episode}     批量提交（缺依赖 → 4xx 拒绝；调用 video-task-service.submitVideoTask 真实接入 — Phase 9）
 *
 * Phase 9 接入：POST 'submit' 调用 submitVideoTask 真实提交视频任务（mock 模式保护下）
 * 兼容：AgentRun 'path5-submit' 仍保留作为 fallback / 留痕（Phase 8 沿用）
 */

function normalizeIdentifier(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const DEFAULT_CONCURRENCY_LIMIT = 4;
const DEFAULT_TOKEN_PER_TRACK = 800; // 单 Track 预估 prompt + 调度 tokens
const DEFAULT_USD_PER_TRACK = 0.18; // 单 Track 预估视频生成成本（占位，Phase 9 替换）

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name: rawName } = await params;
  const name = normalizeIdentifier(rawName);
  const url = new URL(request.url);
  const episode = Number.parseInt(url.searchParams.get('episode') || '1', 10);
  if (!Number.isFinite(episode) || episode < 1) {
    return NextResponse.json({ error: '无效的 episode 参数' }, { status: 400 });
  }

  try {
    const pipelineSnapshot = await getPipelineState(name, episode);
    const description = describePipeline(pipelineSnapshot);
    const plan = await loadTrackPlan(name, episode);

    // 依赖检查（批量）
    const contexts = plan.tracks.map((t) => buildTrackContext(t, { projectIdentifier: name }));
    const evaluation = evaluateDependencies(contexts);

    // 预算预估（占位 — Phase 9 替换为真实 token / 成本估算）
    const budgetEstimate = {
      trackCount: plan.tracks.length,
      readyCount: evaluation.ready.length,
      blockedCount: evaluation.blocked.length,
      estimatedTokens: plan.tracks.length * DEFAULT_TOKEN_PER_TRACK,
      estimatedCostUsd: plan.tracks.length * DEFAULT_USD_PER_TRACK,
      currency: 'USD',
      notes: 'Phase 8 占位预估（Phase 9 接入真实定价）',
    };
    const concurrency = {
      maxConcurrent: DEFAULT_CONCURRENCY_LIMIT,
      notes: '默认 4 并发（Phase 9 接入 Phase 9 视频任务服务 真实上限）',
    };

    return NextResponse.json({
      projectName: name,
      episode,
      reachedC3: description.reachedC3,
      needsDConfirm: description.needsDConfirm,
      plan,
      dependencyEvaluation: {
        overallStatus: evaluation.overallStatus,
        readyTrackIds: evaluation.ready.map((c) => c.trackId),
        blockedTrackIds: evaluation.blocked.map((b) => b.ctx.trackId),
        results: evaluation.results,
        summary: summarizeDependencyCheck(evaluation.results),
      },
      budgetEstimate,
      concurrency,
      warning: 'D 阶段视频生成最为烧钱，提交后不可撤销。Phase 9 接入真实视频任务。',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    if (message.includes('项目不存在')) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }
    return NextResponse.json({ error: `加载路径 5 状态失败：${message}` }, { status: 500 });
  }
}

/**
 * POST 批量提交（path5-submit） — **Phase 9 真实接入**
 *
 * 行为：
 *   1. 加载 TrackPlan + 依赖检查
 *   2. 缺依赖（blocked）→ 返回 422 + 修复入口清单（spec L482 / L546）
 *   3. 依赖 ready → 锁定 TrackPlan
 *   4. **新增**：逐 Track 调用 submitVideoTask（video-task-service） — 真实任务提交（mock 模式保护下）
 *   5. AgentRun 'path5-submit' 留痕（沿用 Phase 8 模式）
 *   6. 返回 { ok: true, agentRunId, taskIds, results, duplicateBlockedCount, requestHashes }
 *
 * 真实费用安全（spec L419 + 真实费用安全硬约束）：
 *   - video-task-service.submitVideoTask 内部判断 isMockMode() — mock 模式下零真实费用
 *   - 幂等性：computeRequestHash + checkDuplicate 防重复扣费 — duplicate_blocked 状态返回
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name: rawName } = await params;
  const name = normalizeIdentifier(rawName);

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'POST body 必须是 JSON' }, { status: 400 });
  }

  const episode = Number.parseInt(String(body.episode ?? '1'), 10);
  if (!Number.isFinite(episode) || episode < 1) {
    return NextResponse.json({ error: '无效的 episode 参数' }, { status: 400 });
  }

  try {
    // 1. 加载状态 + 依赖检查
    const pipelineSnapshot = await getPipelineState(name, episode);
    const description = describePipeline(pipelineSnapshot);
    if (!description.reachedC3) {
      return NextResponse.json(
        { error: '请先完成 C3 阶段（A→C3 未跑通）', reachedC3: false },
        { status: 422 },
      );
    }

    const plan = await loadTrackPlan(name, episode);
    if (plan.tracks.length === 0) {
      return NextResponse.json({ error: '当前 TrackPlan 没有 Track，请先生成' }, { status: 422 });
    }

    const contexts = plan.tracks.map((t) => buildTrackContext(t, { projectIdentifier: name }));
    const evaluation = evaluateDependencies(contexts);

    // 2. 缺依赖（blocked） → 拒绝提交（spec L482 / L546 硬约束）
    if (evaluation.overallStatus === 'blocked') {
      return NextResponse.json(
        {
          error: '部分 Track 缺依赖，无法提交。请先在资产页修复。',
          blocked: evaluation.blocked.map((b) => ({
            trackId: b.ctx.trackId,
            strategy: b.ctx.strategy,
            missing: b.result.missing,
          })),
          summary: summarizeDependencyCheck(evaluation.results),
        },
        { status: 422 },
      );
    }

    // 3. 依赖 ready → 锁定 TrackPlan
    const lockedPlan = await lockTrackPlan(name, plan.id);

    // 4. **Phase 9 真实接入**：逐 Track 调用 submitVideoTask
    //    幂等性（spec L419 + L753）：computeRequestHash + duplicate_blocked 拦截
    //    真实费用安全：video-task-service 内部 isMockMode() 判断 — mock 模式下零费用
    const submitResults: Array<{
      trackId: string;
      strategy: string;
      taskId: string;
      status: string;
      requestHash: string;
      providerJobId: string | null;
      existingStatus?: string;
      message?: string;
    }> = [];
    const requestHashes: string[] = [];
    let duplicateBlockedCount = 0;

    for (const track of lockedPlan.tracks) {
      const prompt = [track.objective, track.motion, track.shot].filter(Boolean).join(' / ');
      const modelId = String(track.strategy || 'default'); // MVP: 模型 ID 占位（实际由 model-registry 提供）
      const submitInput = {
        projectId: lockedPlan.projectId,
        trackId: track.id,
        episode,
        strategy: track.strategy,
        prompt,
        modelId,
        durationSeconds: track.durationSeconds || 0,
        estimatedCost: DEFAULT_USD_PER_TRACK,
        payload: {
          objective: track.objective,
          motion: track.motion,
          shot: track.shot,
          lipSync: track.lipSync,
          mood: track.mood,
          referenceAssets: track.referenceAssets,
        },
      };
      // computeRequestHash 显式调用（也内嵌于 submitVideoTask）— 供 path5 报告 + 留痕
      const requestHash = computeRequestHash({
        projectId: submitInput.projectId,
        trackId: submitInput.trackId,
        episode: submitInput.episode,
        strategy: submitInput.strategy,
        prompt: submitInput.prompt,
        modelId: submitInput.modelId,
        extra: { durationSeconds: submitInput.durationSeconds },
      });
      requestHashes.push(requestHash);

      const result = await submitVideoTask(submitInput);
      if (result.status === 'duplicate_blocked') duplicateBlockedCount += 1;
      submitResults.push({
        trackId: track.id,
        strategy: track.strategy,
        taskId: result.taskId,
        status: result.status,
        requestHash: result.requestHash,
        providerJobId: result.providerJobId,
        existingStatus: result.existingStatus,
        message: result.message,
      });
    }

    // 5. AgentRun 'path5-submit' 留痕（沿用 Phase 8）
    const agentRunId = await recordAgentRun(name, {
      action: 'path5-submit',
      agentName: 'path5-batch-submitter',
      status: 'succeeded',
      input: {
        episode,
        trackPlanId: lockedPlan.id,
        trackIds: lockedPlan.tracks.map((t) => t.id),
        strategies: lockedPlan.tracks.map((t) => ({ trackId: t.id, strategy: t.strategy })),
        submitResults,
        duplicateBlockedCount,
        budgetEstimate: {
          trackCount: lockedPlan.tracks.length,
          estimatedTokens: lockedPlan.tracks.length * DEFAULT_TOKEN_PER_TRACK,
          estimatedCostUsd: lockedPlan.tracks.length * DEFAULT_USD_PER_TRACK,
        },
        note: 'Phase 9 真实接入 — 调用 video-task-service.submitVideoTask（mock 模式保护下）',
      },
      usage: {
        promptTokens: lockedPlan.tracks.length * DEFAULT_TOKEN_PER_TRACK,
        completionTokens: 0,
        totalTokens: lockedPlan.tracks.length * DEFAULT_TOKEN_PER_TRACK,
        estimatedCost: lockedPlan.tracks.length * DEFAULT_USD_PER_TRACK,
        actualCost: 0,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        agentRunId,
        plan: lockedPlan,
        taskIds: submitResults.map((r) => r.taskId),
        trackResults: submitResults,
        requestHashes,
        duplicateBlockedCount,
        message:
          duplicateBlockedCount > 0
            ? `已提交，但 ${duplicateBlockedCount} 个 Track 因 duplicate_blocked 被拦截（防重复扣费）`
            : 'D 阶段 TrackPlan 已锁定 + 任务已提交（Phase 9 真实接入）',
      },
      { status: 202 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    if (message.includes('项目不存在')) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }
    return NextResponse.json({ error: `提交失败：${message}` }, { status: 500 });
  }
}
