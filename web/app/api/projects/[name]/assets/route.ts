import { NextResponse } from 'next/server';
import { getAssets, getSeedanceManifest } from '@/app/lib/novels';
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
    const [legacyAssets, seedanceAssets, seedanceManifest] = await Promise.all([
      getAssets(name),
      listAssets(name),
      getSeedanceManifest(name).catch(() => null),
    ]);

    return NextResponse.json({
      assets: legacyAssets,
      seedanceAssets,
      seedanceManifest,
    });
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
    const asset = await createAsset(name, await request.json());
    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    const response = assetErrorResponse(error);
    console.error('创建资产失败:', error);
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
