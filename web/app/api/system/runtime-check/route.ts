import { NextResponse } from 'next/server';
import { runRuntimeCheck } from '@/app/lib/server/runtime/runtime-check';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const result = await runRuntimeCheck('settings');
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const result = await runRuntimeCheck('manual');
  return NextResponse.json(result);
}
