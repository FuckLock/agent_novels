import { NextResponse } from 'next/server';
import {
  getGlobalSkeleton,
  updateGlobalSkeleton,
  getEpisodeSkeleton,
  updateEpisodeSkeleton,
  listEpisodeSkeletons,
} from '@/app/lib/novels';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import {
  getCombinedStoryOutline,
  getLatestStoryOutline,
  listStoryOutlineVersions,
  lockStoryOutline,
  rollbackStoryOutline,
  saveStoryOutline,
} from '@/app/lib/server/script/text-artifact-service';

async function getLayeredSkeletonContent(name: string) {
  const globalContent = await getGlobalSkeleton(name);
  const episodes = await listEpisodeSkeletons(name);
  const parts = [globalContent];
  for (const item of episodes) {
    const content = await getEpisodeSkeleton(name, item.episode);
    if (content) parts.push(`## 第${item.episode}集骨架\n\n${content}`);
  }
  return parts.filter(Boolean).join('\n\n---\n\n');
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  const url = new URL(request.url);
  const scope = url.searchParams.get('scope');
  const history = url.searchParams.get('history');
  const episodeStr = url.searchParams.get('episode');

  try {
    const noCacheHeaders = { 'Cache-Control': 'no-store' };
    if (history === '1' || scope === 'versions') {
      const episode = episodeStr ? parseInt(episodeStr, 10) : undefined;
      const versions = await listStoryOutlineVersions(name, scope && scope !== 'versions' ? scope : undefined, episode);
      return NextResponse.json({ versions }, { headers: noCacheHeaders });
    }

    if (scope === 'global') {
      const content = (await getLatestStoryOutline(name, 'global')) || await getGlobalSkeleton(name);
      return NextResponse.json({ content }, { headers: noCacheHeaders });
    }

    if (scope === 'episode' && episodeStr) {
      const episode = parseInt(episodeStr, 10);
      if (isNaN(episode)) {
        return NextResponse.json({ error: '无效的集号' }, { status: 400 });
      }
      const content = (await getLatestStoryOutline(name, 'episode', episode)) || await getEpisodeSkeleton(name, episode);
      return NextResponse.json({ content }, { headers: noCacheHeaders });
    }

    if (scope === 'list') {
      const episodes = await listEpisodeSkeletons(name);
      return NextResponse.json({ episodes }, { headers: noCacheHeaders });
    }

    // 默认：只读拼接视图，编辑必须通过 scope=global 或 scope=episode 指定目标
    const content = (await getCombinedStoryOutline(name)) || await getLayeredSkeletonContent(name);
    return NextResponse.json({ content }, { headers: noCacheHeaders });
  } catch {
    return NextResponse.json({ content: '' });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  try {
    const body = await request.json();
    const { content, scope, episode } = body;

    if (scope === 'global') {
      await updateGlobalSkeleton(name, content);
      await saveStoryOutline(name, { content, title: '全局故事骨架', scope: 'global' });
      return NextResponse.json({ success: true });
    }

    if (scope === 'episode' && episode != null) {
      const epNum = typeof episode === 'number' ? episode : parseInt(episode, 10);
      if (isNaN(epNum)) {
        return NextResponse.json({ error: '无效的集号' }, { status: 400 });
      }
      await updateEpisodeSkeleton(name, epNum, content);
      await saveStoryOutline(name, { content, title: `第${epNum}集故事骨架`, scope: 'episode', episodeIndex: epNum });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: '更新故事骨架必须指定 scope=global 或 scope=episode' }, { status: 400 });
  } catch (error) {
    console.error('更新故事骨架失败:', error);
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  try {
    const body = await request.json();
    if (body.action === 'rollback') {
      if (!body.versionId) return NextResponse.json({ error: '缺少 versionId' }, { status: 400 });
      return NextResponse.json(await rollbackStoryOutline(name, String(body.versionId)));
    }
    if (body.action === 'lock') {
      return NextResponse.json(await lockStoryOutline(name, body.waiverReason, body.scope, body.episode));
    }
    return NextResponse.json({ error: '无效操作' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '故事骨架版本操作失败' },
      { status: 400 },
    );
  }
}
