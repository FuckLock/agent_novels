import { NextResponse } from 'next/server';
import { getSeedanceDirectorPlan, runDirectorPlan } from '@/app/lib/novels';
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
    const data = await getSeedanceDirectorPlan(decodedName, epNum);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('获取导演规划失败:', error);
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
    const task = runDirectorPlan(decodedName, epNum, modelId).catch(err => {
      console.error('导演规划后台执行失败:', err);
    });
    registerBackgroundTask(`director-plan-${decodedName}-${epNum}`, task);
    return NextResponse.json({ started: true });
  } catch (error) {
    console.error('导演规划启动失败:', error);
    const msg = error instanceof Error ? error.message : '导演规划失败';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
