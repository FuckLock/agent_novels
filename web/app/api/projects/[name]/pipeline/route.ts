import { NextResponse } from 'next/server';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import { getPipelineState, buildPipelineState, describePipeline } from '@/app/lib/server/pipeline/pipeline-service';
import { getAutoRunState } from '@/app/lib/server/pipeline/auto-run-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
  const detail = url.searchParams.get('detail') === '1';

  if (!episodeParam) {
    return NextResponse.json({ error: '缺少 episode 参数' }, { status: 400 });
  }
  const episode = Number.parseInt(episodeParam, 10);
  if (!Number.isFinite(episode) || episode < 1) {
    return NextResponse.json({ error: '无效的 episode 参数' }, { status: 400 });
  }

  try {
    const snapshot = detail
      ? await buildPipelineState(name, episode)
      : await getPipelineState(name, episode);
    const desc = describePipeline(snapshot);
    const autoRun = getAutoRunState(name, episode);
    return NextResponse.json({
      projectName: name,
      episode,
      snapshot,
      description: desc,
      autoRun,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `获取管线状态失败：${message}` }, { status: 500 });
  }
}
