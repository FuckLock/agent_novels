import { NextResponse } from 'next/server';
import { extractAssetsFromOutline } from '@/app/lib/novels';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const preview = body.preview === true;

    const result = await extractAssetsFromOutline(name, preview);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === '未找到大纲数据') {
      return NextResponse.json({ error: '未找到大纲数据' }, { status: 404 });
    }
    console.error('提取资产失败:', error);
    return NextResponse.json({ error: '提取资产失败' }, { status: 500 });
  }
}
