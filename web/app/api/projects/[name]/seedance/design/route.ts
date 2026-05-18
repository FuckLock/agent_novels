import { NextResponse } from 'next/server';
import { getSeedanceDesign } from '@/app/lib/novels';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  try {
    const design = await getSeedanceDesign(name);
    return NextResponse.json(design);
  } catch (error) {
    console.error(`获取服化道设计失败:`, error);
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}
