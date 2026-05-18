import { NextResponse } from 'next/server';
import { getStoryline, updateStoryline } from '@/app/lib/novels';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  try {
    const content = await getStoryline(name);
    return NextResponse.json({ content });
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
    const { content } = await request.json();
    await updateStoryline(name, content);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('更新故事线失败:', error);
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}
