import { NextResponse } from 'next/server';
import { getOutline, updateOutline, deleteOutline } from '@/app/lib/novels';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  try {
    const data = await getOutline(name);
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
    const { data } = await request.json();
    await updateOutline(name, data);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('更新大纲失败:', error);
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  try {
    await deleteOutline(name);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除大纲失败:', error);
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}
