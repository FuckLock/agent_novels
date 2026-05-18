import { NextResponse } from 'next/server';
import { getModelConfigs } from '@/app/lib/server/models/model-registry';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  try {
    const configs = await getModelConfigs();
    return NextResponse.json(configs);
  } catch (error) {
    console.error('获取模型配置失败:', error);
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}
