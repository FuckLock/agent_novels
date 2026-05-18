import { NextResponse } from 'next/server';
import { assetErrorResponse, createAsset, listAssets } from '@/app/lib/server/assets/asset-service';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  try {
    const assets = await listAssets(name);
    return NextResponse.json(assets);
  } catch (error) {
    const response = assetErrorResponse(error);
    console.error('获取资产列表失败:', error);
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  try {
    const body = await request.json();
    const { name: assetName, type, description, identityAnchor } = body;

    if (!assetName || !type || !description) {
      return NextResponse.json(
        { error: '缺少必填字段：name, type, description' },
        { status: 400 }
      );
    }

    if (!['character', 'scene', 'prop', 'costume', 'makeup'].includes(type)) {
      return NextResponse.json(
        { error: '无效的资产类型，必须为 character、scene、prop、costume 或 makeup' },
        { status: 400 }
      );
    }

    const asset = await createAsset(name, {
      name: assetName,
      type,
      description,
      identityAnchor,
    });
    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    const response = assetErrorResponse(error);
    console.error('创建资产失败:', error);
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
