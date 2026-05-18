import { NextResponse } from 'next/server';
import { getAllReviews, getReviewResult } from '@/app/lib/novels';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const episodeStr = url.searchParams.get('episode');

  try {
    if (type) {
      const episode = episodeStr ? parseInt(episodeStr) : undefined;
      const result = await getReviewResult(name, type, episode);
      return NextResponse.json(result);
    }

    const results = await getAllReviews(name);
    return NextResponse.json(results);
  } catch (error) {
    console.error('获取审核结果失败:', error);
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}
