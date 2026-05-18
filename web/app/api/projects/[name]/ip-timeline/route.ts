import { NextResponse } from 'next/server';
import { assetErrorResponse } from '@/app/lib/server/assets/asset-service';
import { buildIpTimeline } from '@/app/lib/server/assets/asset-timeline-service';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  try {
    return NextResponse.json(await buildIpTimeline(name));
  } catch (error) {
    const response = assetErrorResponse(error);
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
