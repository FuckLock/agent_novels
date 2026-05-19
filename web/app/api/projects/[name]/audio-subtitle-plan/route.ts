// runtime: nodejs
// /api/projects/[name]/audio-subtitle-plan —— Phase 11 AudioSubtitlePlan 生成 / 查询
// spec L603 + DEV-PLAN L534
//
// GET  ?roughCutId=...  —— 列出某 RoughCut 的所有 AudioSubtitlePlan 版本
// POST { roughCutId } —— 生成 AudioSubtitlePlan（5 维 + 占位文本，不调真实 AI）

import { NextResponse } from 'next/server';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import { ensureSchema } from '@/app/lib/server/db/migrate';
import { getProject } from '@/app/lib/server/projects/project-service';
import {
  generateAudioSubtitlePlan,
  listAudioSubtitlePlans,
  getLatestAudioSubtitlePlan,
} from '@/app/lib/server/delivery/audio-subtitle-plan-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function normalizeIdentifier(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * GET /api/projects/[name]/audio-subtitle-plan?roughCutId=...
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  try {
    const { name: rawName } = await params;
    const name = normalizeIdentifier(rawName);
    const project = await getProject(name);
    if (!project) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }

    const url = new URL(request.url);
    const roughCutId = url.searchParams.get('roughCutId') || '';
    if (!roughCutId) {
      return NextResponse.json({ error: '缺少 roughCutId 参数' }, { status: 400 });
    }

    await ensureSchema();
    const list = listAudioSubtitlePlans(roughCutId);
    const latest = getLatestAudioSubtitlePlan(roughCutId);

    return NextResponse.json({
      projectName: name,
      roughCutId,
      plans: list,
      latest,
      count: list.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `加载 AudioSubtitlePlan 失败：${message}` }, { status: 500 });
  }
}

/**
 * POST /api/projects/[name]/audio-subtitle-plan { roughCutId }
 *
 * 生成 AudioSubtitlePlan（MVP 协议定义 + 占位文案）
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'POST body 必须是 JSON' }, { status: 400 });
  }

  try {
    const { name: rawName } = await params;
    const name = normalizeIdentifier(rawName);
    const project = await getProject(name);
    if (!project) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }

    const roughCutId = String(body.roughCutId || '').trim();
    if (!roughCutId) {
      return NextResponse.json({ error: '缺少 roughCutId' }, { status: 400 });
    }

    await ensureSchema();
    const record = await generateAudioSubtitlePlan({ roughCutId });

    return NextResponse.json(
      {
        ok: true,
        audioSubtitlePlanId: record.id,
        roughCutId: record.roughCutId,
        version: record.version,
        dimensionsCovered: record.plan.dimensions.length,
        segmentCount: record.plan.segments.length,
        record,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json(
      { error: `生成 AudioSubtitlePlan 失败：${message}` },
      { status: 500 },
    );
  }
}
