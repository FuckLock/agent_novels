import { NextResponse } from 'next/server';
import { getRunningEpisodes } from '@/app/lib/background-tasks';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  const decodedName = decodeURIComponent(name);
  const episodes = getRunningEpisodes(decodedName);
  return NextResponse.json({ episodes });
}
