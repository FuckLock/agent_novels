// runtime: nodejs
// /api/usage — Phase 12 UsageRecord 汇总 API（5 维度 + 4 类成本）
// spec L420 + L532 + L742-743 + L665：路径 5 数据一致性 + 5 维度成本聚合 + 4 类成本字段

import { NextResponse } from 'next/server';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import {
  aggregateCostReport,
  computeEstimateDeviation,
  COST_DIMENSIONS,
  type CostDimension,
} from '@/app/lib/server/usage/cost-report-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/usage?dimension=&projectId=&episode=&trackId=&modelConfigId=&strategy=&costStatus=&limit=
 *
 * 返回数据：
 *   - report：按 dimension 维度聚合（5 维度任 1）
 *   - deviation：估算 vs 实际偏差（含 4 类成本字段汇总：estimated_amount / actual_amount / failed_amount / retry_amount）
 *   - dimensions：5 维度列表（供 UI 切换器）
 *
 * 路径 5 数据一致性：
 *   - estimated_amount / estimated_cost 字段与 /api/projects/[name]/path5 GET 同源（estimatedCostUsd 同一份估算）
 *   - aggregateCostReport / computeEstimateDeviation 内 SQL 都 JOIN tasks + usage_records
 */
export async function GET(request: Request) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const dimensionParam = (url.searchParams.get('dimension') || 'projectId').trim();
    const projectId = url.searchParams.get('projectId') || undefined;
    const episodeParam = url.searchParams.get('episode');
    const trackId = url.searchParams.get('trackId') || undefined;
    const modelConfigId = url.searchParams.get('modelConfigId') || undefined;
    const strategy = url.searchParams.get('strategy') || undefined;
    const costStatus = url.searchParams.get('costStatus') || undefined;
    const limitParam = url.searchParams.get('limit');

    if (!(COST_DIMENSIONS as string[]).includes(dimensionParam)) {
      return NextResponse.json(
        { error: `不支持的 dimension：${dimensionParam}（应为 ${COST_DIMENSIONS.join('/')}）` },
        { status: 400 },
      );
    }
    const dimension = dimensionParam as CostDimension;
    const episode = episodeParam ? Number.parseInt(episodeParam, 10) : undefined;
    const limit = limitParam ? Number.parseInt(limitParam, 10) : 100;

    const report = await aggregateCostReport({
      dimension,
      projectId,
      episode,
      trackId,
      modelConfigId,
      strategy,
      costStatus,
      limit,
    });

    // 估算 vs 实际偏差（路径 5 数据一致性 — 与 path5 GET budgetEstimate.estimatedCostUsd 同源）
    const deviation = await computeEstimateDeviation({
      projectId,
      episode,
    });

    return NextResponse.json({
      report,
      deviation,
      // 4 类成本字段（spec L742 + L828 硬约束 — 与 cost-report-service 同源）
      costFields: {
        estimated_amount: deviation.estimated,
        actual_amount: deviation.actual,
        failed_amount: deviation.failed,
        retry_amount: deviation.retry,
        // 同源字段 alias（与 path5 GET budgetEstimate.estimatedCostUsd / actual_cost 对齐）
        estimated_cost: deviation.estimated,
        actual_cost: deviation.actual,
      },
      dimensions: COST_DIMENSIONS,
      filter: {
        dimension,
        projectId,
        episode,
        trackId,
        modelConfigId,
        strategy,
        costStatus,
        limit,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `加载用量汇总失败：${message}` }, { status: 500 });
  }
}

/**
 * POST /api/usage { dimension, ... }
 *
 * 与 GET 等价（接受 JSON body，便于前端复杂筛选）
 */
export async function POST(request: Request) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'POST body 必须是 JSON' }, { status: 400 });
  }

  const dimensionParam = String(body.dimension || 'projectId').trim();
  if (!(COST_DIMENSIONS as string[]).includes(dimensionParam)) {
    return NextResponse.json(
      { error: `不支持的 dimension：${dimensionParam}（应为 ${COST_DIMENSIONS.join('/')}）` },
      { status: 400 },
    );
  }
  const dimension = dimensionParam as CostDimension;

  try {
    const report = await aggregateCostReport({
      dimension,
      projectId: body.projectId ? String(body.projectId) : undefined,
      episode: body.episode !== undefined ? Number(body.episode) : undefined,
      trackId: body.trackId ? String(body.trackId) : undefined,
      modelConfigId: body.modelConfigId ? String(body.modelConfigId) : undefined,
      strategy: body.strategy ? String(body.strategy) : undefined,
      costStatus: body.costStatus ? String(body.costStatus) : undefined,
      limit: body.limit !== undefined ? Number(body.limit) : 100,
    });
    const deviation = await computeEstimateDeviation({
      projectId: body.projectId ? String(body.projectId) : undefined,
      episode: body.episode !== undefined ? Number(body.episode) : undefined,
    });
    return NextResponse.json({ report, deviation, dimensions: COST_DIMENSIONS });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `加载用量汇总失败：${message}` }, { status: 500 });
  }
}
