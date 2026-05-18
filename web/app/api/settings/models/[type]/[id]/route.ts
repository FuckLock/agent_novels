import { NextResponse } from 'next/server';
import {
  deleteModelConfig,
  getModelConfigs,
  saveModelConfig,
} from '@/app/lib/server/models/model-registry';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { type, id } = await params;
  try {
    const config = await request.json();
    if (!config || typeof config !== 'object') {
      return NextResponse.json({ error: '配置格式错误' }, { status: 400 });
    }
    if (config.type !== type) {
      return NextResponse.json({ error: '模型类型不匹配' }, { status: 400 });
    }
    if (config.modelId !== id) {
      return NextResponse.json({ error: '模型 ID 不匹配' }, { status: 400 });
    }

    const configs = await getModelConfigs();
    const all = [...configs.language, ...configs.image, ...configs.video];
    const duplicated = all.find((item) => item.modelId === id && item.type !== type);
    if (duplicated) {
      return NextResponse.json({ error: `模型 ID 已被 ${duplicated.type} 模型占用` }, { status: 409 });
    }

    await saveModelConfig(type, id, config);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('保存模型配置失败:', error);
    const message = error instanceof Error ? error.message : '保存失败';
    const status = /占用|不匹配/.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { type, id } = await params;
  try {
    await deleteModelConfig(type, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除模型配置失败:', error);
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}
