import { NextResponse } from 'next/server';
import { getScriptAssets, updateScriptAssets } from '@/app/lib/novels';
import { syncScriptAssetLinks } from '@/app/lib/server/assets/asset-timeline-service';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string; episode: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name, episode } = await params;
  const ep = parseInt(episode, 10);
  if (isNaN(ep) || ep < 1) {
    return NextResponse.json({ error: '无效的集数参数' }, { status: 400 });
  }
  try {
    const assets = await getScriptAssets(name, ep);
    return NextResponse.json(assets);
  } catch (error) {
    console.error('获取关联资产失败:', error);
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}

/** 过滤数组，只保留字符串类型元素 */
function filterStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((item): item is string => typeof item === 'string');
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ name: string; episode: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name, episode } = await params;
  const ep = parseInt(episode, 10);
  if (isNaN(ep) || ep < 1) {
    return NextResponse.json({ error: '无效的集数参数' }, { status: 400 });
  }
  try {
    const body = await request.json();
    const nextAssets = {
      characters: filterStringArray(body.characters),
      scenes: filterStringArray(body.scenes),
      props: filterStringArray(body.props),
      costumes: filterStringArray(body.costumes),
      makeup: filterStringArray(body.makeup),
    };
    await updateScriptAssets(name, ep, nextAssets);
    await syncScriptAssetLinks(name, ep, nextAssets);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('更新关联资产失败:', error);
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}
