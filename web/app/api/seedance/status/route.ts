import { getSeedanceFlowStatus } from '@/app/lib/agent/seedance-executor';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectName = url.searchParams.get('projectName') || '';
  const episode = Number(url.searchParams.get('episode'));

  if (!projectName || !Number.isInteger(episode) || episode < 1) {
    return Response.json({ error: 'projectName 和 episode 必填' }, { status: 400 });
  }

  try {
    const status = await getSeedanceFlowStatus(projectName, episode);
    return Response.json(status);
  } catch (error) {
    console.error('获取 Seedance 状态失败:', error);
    return Response.json({ error: '获取 Seedance 状态失败' }, { status: 500 });
  }
}
