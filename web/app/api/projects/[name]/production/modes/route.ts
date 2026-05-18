import { NextResponse } from 'next/server';
import { getProductionModes } from '@/app/lib/novels';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  try {
    const modes = await getProductionModes(name);
    return NextResponse.json(modes);
  } catch (error) {
    console.error(`获取制作模式失败:`, error);
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}
