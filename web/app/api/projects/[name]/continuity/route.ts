import { NextResponse } from 'next/server';
import { getContinuity, updateContinuity } from '@/app/lib/novels';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  try {
    const data = await getContinuity(name);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ data: null });
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
    await updateContinuity(name, body);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('更新连贯性数据失败:', error);
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}
