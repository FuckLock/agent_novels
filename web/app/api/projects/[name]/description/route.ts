import { NextResponse } from 'next/server';
import { getProjectDescription, updateProjectDescription } from '@/app/lib/novels';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  try {
    const description = await getProjectDescription(name);
    return NextResponse.json({ description });
  } catch {
    return NextResponse.json({ error: '描述文件不存在' }, { status: 404 });
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
    const { description } = await request.json();
    await updateProjectDescription(name, description);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('更新描述失败:', error);
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}
