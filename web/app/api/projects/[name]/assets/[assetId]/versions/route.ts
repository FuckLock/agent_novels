import { NextResponse } from 'next/server';
import { assetErrorResponse } from '@/app/lib/server/assets/asset-service';
import {
  archiveAssetVersion,
  createAssetVersion,
  listAssetVersions,
  setCanonicalVersion,
} from '@/app/lib/server/assets/asset-version-service';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string; assetId: string }> },
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name, assetId } = await params;
  try {
    return NextResponse.json(await listAssetVersions(name, assetId));
  } catch (error) {
    const response = assetErrorResponse(error);
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string; assetId: string }> },
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name, assetId } = await params;
  try {
    const body = await request.json();
    return NextResponse.json(await createAssetVersion(name, assetId, body), { status: 201 });
  } catch (error) {
    const response = assetErrorResponse(error);
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ name: string; assetId: string }> },
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name, assetId } = await params;
  try {
    const body = await request.json();
    if (body.action === 'archive') {
      return NextResponse.json(await archiveAssetVersion(name, assetId, String(body.versionId || '')));
    }
    return NextResponse.json(await setCanonicalVersion(name, assetId, String(body.versionId || body.canonicalVersionId || '')));
  } catch (error) {
    const response = assetErrorResponse(error);
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
