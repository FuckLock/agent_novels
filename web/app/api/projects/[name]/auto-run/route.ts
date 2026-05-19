import { NextResponse } from 'next/server';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import {
  startAutoRun,
  pauseAutoRun,
  resumeAutoRun,
  skipStage,
  terminateAutoRun,
  getAutoRunSnapshot,
} from '@/app/lib/server/pipeline/auto-run-service';
import type { SeedanceStage } from '@/app/lib/agent/task-record';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 五种控制动作分发：
//   action === 'start'      → startAutoRun
//   action === 'pause'      → pauseAutoRun
//   action === 'resume'     → resumeAutoRun
//   action === 'skip'       → skipStage
//   action === 'terminate'  → terminateAutoRun
const VALID_ACTIONS = ['start', 'pause', 'resume', 'skip', 'terminate'] as const;
type AutoRunAction = (typeof VALID_ACTIONS)[number];

function normalizeIdentifier(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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
  const episodeParam = url.searchParams.get('episode');
  if (!episodeParam) {
    return NextResponse.json({ error: '缺少 episode 参数' }, { status: 400 });
  }
  const episode = Number.parseInt(episodeParam, 10);
  if (!Number.isFinite(episode) || episode < 1) {
    return NextResponse.json({ error: '无效的 episode 参数' }, { status: 400 });
  }

  try {
    const snapshot = await getAutoRunSnapshot(name, episode);
    return NextResponse.json({ projectName: name, episode, ...snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `查询 auto-run 失败：${message}` }, { status: 500 });
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

  const action = body.action as string | undefined;
  if (!action || !VALID_ACTIONS.includes(action as AutoRunAction)) {
    return NextResponse.json(
      { error: `action 必须是 ${VALID_ACTIONS.join(' / ')} 之一` },
      { status: 400 },
    );
  }
  const episode = Number.parseInt(String(body.episode ?? ''), 10);
  if (!Number.isFinite(episode) || episode < 1) {
    return NextResponse.json({ error: '无效的 episode 参数' }, { status: 400 });
  }

  try {
    switch (action as AutoRunAction) {
      case 'start': {
        const modelId = typeof body.modelId === 'string' ? body.modelId : undefined;
        const result = await startAutoRun(name, episode, { modelId });
        if (!result.ok) {
          return NextResponse.json(
            { error: result.conflict || '启动失败', state: result.state },
            { status: 409 },
          );
        }
        return NextResponse.json({ ok: true, state: result.state }, { status: 202 });
      }
      case 'pause': {
        const result = await pauseAutoRun(name, episode);
        if (!result.ok) {
          return NextResponse.json({ error: result.reason, state: result.state }, { status: 409 });
        }
        return NextResponse.json({ ok: true, state: result.state });
      }
      case 'resume': {
        const modelId = typeof body.modelId === 'string' ? body.modelId : undefined;
        const result = await resumeAutoRun(name, episode, { modelId });
        if (!result.ok) {
          return NextResponse.json({ error: result.reason, state: result.state }, { status: 409 });
        }
        return NextResponse.json({ ok: true, state: result.state });
      }
      case 'skip': {
        const stage = String(body.stage || '') as SeedanceStage;
        if (!stage) {
          return NextResponse.json({ error: 'skip 需要 stage 参数' }, { status: 400 });
        }
        const result = await skipStage(name, episode, stage);
        if (!result.ok) {
          return NextResponse.json({ error: result.reason, state: result.state }, { status: 409 });
        }
        return NextResponse.json({ ok: true, state: result.state });
      }
      case 'terminate': {
        const result = await terminateAutoRun(name, episode);
        if (!result.ok) {
          return NextResponse.json({ error: result.reason, state: result.state }, { status: 409 });
        }
        return NextResponse.json({ ok: true, state: result.state });
      }
      default:
        return NextResponse.json({ error: '未知 action' }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `auto-run 控制失败：${message}` }, { status: 500 });
  }
}
