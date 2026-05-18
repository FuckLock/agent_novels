import { NextResponse } from 'next/server';
import {
  listScriptVersionHistory,
  lockLatestScriptVersion,
  rollbackScriptVersion,
} from '@/app/lib/server/script/script-service';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string; episode: string }> },
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name, episode } = await params;
  const ep = parseInt(episode, 10);
  if (Number.isNaN(ep)) {
    return NextResponse.json({ error: '无效的集号' }, { status: 400 });
  }

  const versions = await listScriptVersionHistory(name, ep);
  return NextResponse.json({ versions }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string; episode: string }> },
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name, episode } = await params;
  const ep = parseInt(episode, 10);
  if (Number.isNaN(ep)) {
    return NextResponse.json({ error: '无效的集号' }, { status: 400 });
  }

  try {
    const body = await request.json();
    if (body.action === 'rollback') {
      if (!body.versionId) return NextResponse.json({ error: '缺少 versionId' }, { status: 400 });
      return NextResponse.json(await rollbackScriptVersion(name, ep, String(body.versionId)));
    }
    if (body.action === 'lock') {
      return NextResponse.json(await lockLatestScriptVersion(name, ep, body.waiverReason));
    }
    return NextResponse.json({ error: '无效操作' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '版本操作失败' },
      { status: 400 },
    );
  }
}
