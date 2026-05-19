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

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/projects/[name]/path5
 *
 * GET  ?episode=N    路径 5 当前状态：reachedC3 / Track 列表 / 依赖 / 预算预估 / 并发上限
 * POST {episode}     批量提交（缺依赖 → 4xx 拒绝；不调用 Phase 9 视频任务服务，仅写 AgentRun 占位）
 *
 * 边界：D 阶段视频任务**Phase 9 接入**，本 phase 严禁调用 Phase 9 视频任务服务。
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
 * POST 批量提交（path5-submit）
 *
 * **严禁**调用 Phase 9 视频任务服务 / 视频任务提交接口（Phase 9 落地）
 *     这是 Phase 9 接入范围；本 phase 只创建 AgentRun 占位，spec 硬约束。
 *
 * 行为：
 *   1. 加载 TrackPlan + 依赖检查
 *   2. 缺依赖（blocked）→ 返回 422 + 修复入口清单（spec L482 / L546）
 *   3. 依赖 ready → 锁定 TrackPlan + 记录 AgentRun（action: 'path5-submit'）
 *   4. 返回 { ok: true, agentRunId, message: 'Phase 9 接入真实视频任务' }
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

    // 4. 记录 AgentRun 占位（**不调用** Phase 9 视频任务服务 / 视频任务提交接口（Phase 9 落地）
    //    — 这是 Phase 9 接入范围，本 phase 严禁烧钱）
    const agentRunId = await recordAgentRun(name, {
      action: 'path5-submit',
      agentName: 'path5-batch-submitter',
      status: 'succeeded',
      input: {
        episode,
        trackPlanId: lockedPlan.id,
        trackIds: lockedPlan.tracks.map((t) => t.id),
        strategies: lockedPlan.tracks.map((t) => ({ trackId: t.id, strategy: t.strategy })),
        budgetEstimate: {
          trackCount: lockedPlan.tracks.length,
          estimatedTokens: lockedPlan.tracks.length * DEFAULT_TOKEN_PER_TRACK,
          estimatedCostUsd: lockedPlan.tracks.length * DEFAULT_USD_PER_TRACK,
        },
        note: 'Phase 8 占位（TODO: Phase 9 接入真实视频任务）',
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
        message:
          'D 阶段 TrackPlan 已锁定（path5-submit 占位）。Phase 9 接入真实视频任务后才会真正发出 video task。',
        phase9Pending: true,
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
