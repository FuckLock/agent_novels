import { NextResponse } from 'next/server';
import {
  deleteScriptVersions,
  getLatestScriptContent,
  saveScriptVersion,
} from '@/app/lib/server/script/script-service';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string; episode: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name, episode } = await params;
  const ep = parseInt(episode, 10);
  try {
    const content = await getLatestScriptContent(name, ep);
    return NextResponse.json({ episode: ep, content }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: '剧本不存在' }, { status: 404 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ name: string; episode: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name, episode } = await params;
  const ep = parseInt(episode, 10);
  try {
    const { content } = await request.json();
    await saveScriptVersion(name, ep, { content, source: 'manual_edit' });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('更新剧本失败:', error);
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ name: string; episode: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name, episode } = await params;
  const ep = parseInt(episode, 10);
  try {
    await deleteScriptVersions(name, ep);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除剧本失败:', error);
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}
