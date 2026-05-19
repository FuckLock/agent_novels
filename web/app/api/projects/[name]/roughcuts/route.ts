// runtime: nodejs
// /api/projects/[name]/roughcuts —— Phase 11 粗剪生成 / 查询
// spec L601 + DEV-PLAN L533
//
// GET  ?episode=1  —— 列出某 episode 的 RoughCut 历史版本
// POST { episodeIndex } —— 组装 RoughCut（只读 locked take）

import { NextResponse } from 'next/server';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import { ensureSchema } from '@/app/lib/server/db/migrate';
import { getProject } from '@/app/lib/server/projects/project-service';
import {
  assembleRoughCut,
  listRoughCuts,
  getLatestRoughCut,
} from '@/app/lib/server/delivery/roughcut-service';

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
 * GET /api/projects/[name]/roughcuts?episode=1
 *
 * 列出某 episode 的 RoughCut 历史；不传 episode 默认 1
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
    const episode = Number.parseInt(url.searchParams.get('episode') || '1', 10);
    const includeLatest = url.searchParams.get('latest') === '1';

    await ensureSchema();
    const list = listRoughCuts(project.id, episode);
    const latest = includeLatest ? getLatestRoughCut(project.id, episode) : null;

    return NextResponse.json({
      projectName: name,
      episode,
      roughCuts: list,
      latest,
      count: list.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `加载 RoughCut 失败：${message}` }, { status: 500 });
  }
}

/**
 * POST /api/projects/[name]/roughcuts { episodeIndex }
 *
 * 组装一份新的 RoughCut（只读 locked take）
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

    const episodeIndex = Number.parseInt(String(body.episodeIndex || '1'), 10);
    if (!Number.isFinite(episodeIndex) || episodeIndex < 1) {
      return NextResponse.json({ error: 'episodeIndex 必须是正整数' }, { status: 400 });
    }

    await ensureSchema();
    const record = await assembleRoughCut({
      projectId: project.id,
      episodeIndex,
    });

    return NextResponse.json(
      {
        ok: true,
        roughCutId: record.id,
        status: record.status,
        version: record.version,
        missingTrackCount: record.missingTracks.length,
        lockedTakeCount: record.lockedTakes.length,
        totalDurationSeconds: record.totalDurationSeconds,
        record,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `组装 RoughCut 失败：${message}` }, { status: 500 });
  }
}
