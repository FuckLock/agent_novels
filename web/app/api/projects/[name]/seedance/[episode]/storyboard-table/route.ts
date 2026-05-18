import { NextResponse } from 'next/server';
import { getSeedanceStoryboardTable, runStoryboardTable } from '@/app/lib/novels';
import { registerBackgroundTask } from '@/app/lib/background-tasks';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export const maxDuration = 300;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string; episode: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name, episode } = await params;
  const decodedName = decodeURIComponent(name);
  const epNum = parseInt(episode, 10);
  if (isNaN(epNum)) {
    return NextResponse.json({ error: '无效的集数' }, { status: 400 });
  }

  try {
    const data = await getSeedanceStoryboardTable(decodedName, epNum);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('获取分镜表失败:', error);
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string; episode: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name, episode } = await params;
  const decodedName = decodeURIComponent(name);
  const epNum = parseInt(episode, 10);
  if (isNaN(epNum)) {
    return NextResponse.json({ error: '无效的集数' }, { status: 400 });
  }

  let body: { modelId?: string } = {};
  try {
    body = await request.json();
  } catch {
    // 空 body 也可以
  }

  const modelId = typeof body.modelId === 'string' ? body.modelId : undefined;

  try {
    const task = runStoryboardTable(decodedName, epNum, modelId).catch(err => {
      console.error('分镜表后台执行失败:', err);
    });
    registerBackgroundTask(`storyboard-table-${decodedName}-${epNum}`, task);
    return NextResponse.json({ started: true });
  } catch (error) {
    console.error('分镜表启动失败:', error);
    const msg = error instanceof Error ? error.message : '分镜表生成失败';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
