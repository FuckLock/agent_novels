import { NextResponse } from 'next/server';
import { detectPipelineStatus } from '@/app/lib/novels';
import { isTaskRunning } from '@/app/lib/background-tasks';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string; episode: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name, episode } = await params;
  const decodedName = decodeURIComponent(name);
  const epNum = parseInt(episode, 10);
  if (isNaN(epNum) || epNum < 1) {
    return NextResponse.json({ error: '无效的集数' }, { status: 400 });
  }

  try {
    const status = await detectPipelineStatus(decodedName, epNum);

    // 叠加内存中运行的后台任务状态（无论文件是否已存在，任务在跑就是 running——支持重新生成）
    if (isTaskRunning(`director-${decodedName}-${epNum}`)) {
      status.director = 'running';
    }
    if (isTaskRunning(`director-plan-${decodedName}-${epNum}`)) {
      status.directorPlan = 'running';
    }
    if (isTaskRunning(`storyboard-table-${decodedName}-${epNum}`)) {
      status.storyboardTable = 'running';
    }
    if (isTaskRunning(`storyboard-prompts-${decodedName}-${epNum}`)) {
      (status as unknown as Record<string, string>).prompts = 'running';
    }

    return NextResponse.json({ episode: epNum, status });
  } catch (error) {
    console.error(`获取管线状态失败:`, error);
    return NextResponse.json({ error: '获取管线状态失败' }, { status: 500 });
  }
}
