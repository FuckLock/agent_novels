import { NextResponse } from 'next/server';
import { getSeedancePrompts, runStoryboardPrompts } from '@/app/lib/novels';
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
  const epNum = parseInt(episode, 10);
  if (isNaN(epNum)) {
    return NextResponse.json({ error: '无效的集数' }, { status: 400 });
  }

  try {
    const content = await getSeedancePrompts(name, epNum);
    return NextResponse.json({ content });
  } catch (error) {
    console.error(`获取分镜提示词失败:`, error);
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
  } catch { /* empty body ok */ }

  const modelId = typeof body.modelId === 'string' ? body.modelId : undefined;

  try {
    const task = runStoryboardPrompts(decodedName, epNum, modelId).catch(err => {
      console.error('分镜提示词后台执行失败:', err);
    });
    registerBackgroundTask(`storyboard-prompts-${decodedName}-${epNum}`, task);
    return NextResponse.json({ started: true });
  } catch (error) {
    console.error('分镜提示词启动失败:', error);
    const msg = error instanceof Error ? error.message : '提示词生成失败';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
