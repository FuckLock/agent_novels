import { NextResponse } from 'next/server';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import {
  loadTrackPlan,
  listTracks,
  createTrack,
  updateTrack,
  splitTrack,
  lockTrack,
  updateTrackStrategy,
} from '@/app/lib/server/tracks/track-plan-service';
import type { StrategyId } from '@/app/lib/server/tracks/strategy-decision';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/projects/[name]/tracks
 *
 * GET  ?episode=N             加载 TrackPlan + 所有 Track
 * POST (create / split)       新建 Track 或拆分 Track
 * PATCH (update / lock)       更新单 Track 或锁定
 */

function normalizeIdentifier(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function mapErrorStatus(err: unknown): number {
  const message = err instanceof Error ? err.message : '';
  if (message.includes('不存在')) return 404;
  if (message.includes('已锁定') || message.includes('CONFLICT')) return 409;
  return 500;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name: rawName } = await params;
  const name = normalizeIdentifier(rawName);
  const url = new URL(request.url);
  const episodeParam = url.searchParams.get('episode') || '1';
  const episode = Number.parseInt(episodeParam, 10);
  if (!Number.isFinite(episode) || episode < 1) {
    return NextResponse.json({ error: '无效的 episode 参数' }, { status: 400 });
  }

  try {
    const plan = await loadTrackPlan(name, episode);
    return NextResponse.json({ projectName: name, episode, plan });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `加载 TrackPlan 失败：${message}` }, { status: mapErrorStatus(error) });
  }
}

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

  const action = String(body.action || 'create');

  try {
    if (action === 'split') {
      const tracks = await splitTrack(name, body);
      return NextResponse.json({ ok: true, action: 'split', tracks });
    }

    // 默认 create
    const trackPlanId = String(body.trackPlanId || '');
    if (!trackPlanId) {
      const episode = Number.parseInt(String(body.episode ?? '1'), 10);
      const plan = await loadTrackPlan(name, episode);
      const track = await createTrack(name, plan.id, body);
      return NextResponse.json({ ok: true, action: 'create', track }, { status: 201 });
    }
    const track = await createTrack(name, trackPlanId, body);
    return NextResponse.json({ ok: true, action: 'create', track }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `操作失败：${message}` }, { status: mapErrorStatus(error) });
  }
}

export async function PATCH(
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
    return NextResponse.json({ error: 'PATCH body 必须是 JSON' }, { status: 400 });
  }

  const action = String(body.action || 'update');
  const trackId = String(body.trackId || '');
  if (!trackId) {
    return NextResponse.json({ error: '缺少 trackId 参数' }, { status: 400 });
  }

  try {
    if (action === 'lock') {
      const revision = Number(body.revision || 0);
      if (!revision) return NextResponse.json({ error: 'lock 需要 revision 参数' }, { status: 400 });
      const track = await lockTrack(name, trackId, revision);
      return NextResponse.json({ ok: true, action: 'lock', track });
    }
    if (action === 'updateStrategy') {
      const strategy = String(body.strategy || '') as StrategyId;
      const reason = String(body.reason || '');
      const track = await updateTrackStrategy(name, trackId, strategy, reason);
      return NextResponse.json({ ok: true, action: 'updateStrategy', track });
    }

    const track = await updateTrack(name, trackId, body);
    // 列出该 plan 下其它 Track 以便 UI 刷新（可选）
    const tracks = await listTracks(name, track.trackPlanId);
    return NextResponse.json({ ok: true, action: 'update', track, tracks });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `更新失败：${message}` }, { status: mapErrorStatus(error) });
  }
}
