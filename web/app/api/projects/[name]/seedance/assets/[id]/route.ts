import { NextResponse } from 'next/server';
import { assetErrorResponse, softDeleteAsset, updateAsset } from '@/app/lib/server/assets/asset-service';
import { enforceAccess } from '@/app/lib/server/security/access-control';

/** 校验资产 ID 格式：char-001 / scene-001 / prop-001 / costume-001 / makeup-001 */
function isValidAssetId(id: string): boolean {
  return /^(char|scene|prop|costume|makeup)-\d{3,}$/.test(id);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ name: string; id: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name, id } = await params;
  if (!isValidAssetId(id)) {
    return NextResponse.json({ error: '无效的资产 ID' }, { status: 400 });
  }
  try {
    const body = await request.json();
    const partial: Record<string, unknown> = {};
    if (body.name !== undefined) partial.name = body.name;
    if (body.description !== undefined) partial.description = body.description;
    if (body.identityAnchor !== undefined) partial.identityAnchor = body.identityAnchor;
    if (body.prompt !== undefined) partial.prompt = body.prompt;
    if (body.modelId !== undefined) partial.modelId = body.modelId;
    if (body.resolution !== undefined) partial.resolution = body.resolution;
    if (body.promptState !== undefined) partial.promptState = body.promptState;

    const updated = await updateAsset(name, id, partial);
    return NextResponse.json(updated);
  } catch (error) {
    const response = assetErrorResponse(error);
    console.error('更新资产失败:', error);
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ name: string; id: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name, id } = await params;
  if (!isValidAssetId(id)) {
    return NextResponse.json({ error: '无效的资产 ID' }, { status: 400 });
  }
  try {
    await softDeleteAsset(name, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const response = assetErrorResponse(error);
    console.error('删除资产失败:', error);
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
