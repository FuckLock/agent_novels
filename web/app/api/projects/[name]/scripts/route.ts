import { NextResponse } from 'next/server';
import { listScriptVersions } from '@/app/lib/server/script/script-service';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(_request);
  if (denied) return denied;

  const { name } = await params;
  try {
    const scripts = await listScriptVersions(name);
    return NextResponse.json(scripts);
  } catch (error) {
    console.error('获取剧本列表失败:', error);
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}
