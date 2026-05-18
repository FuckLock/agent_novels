import { NextRequest, NextResponse } from 'next/server';

function normalizeHost(value: string | null) {
  const raw = (value || '').split(',')[0]?.trim() || '';
  if (!raw) return '';
  if (raw.startsWith('[')) return raw.slice(1, raw.indexOf(']'));
  return raw.split(':')[0] || raw;
}

function isLocalHost(host: string) {
  const normalized = host.toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function hasAccessCredential(request: NextRequest) {
  const authorization = request.headers.get('authorization') || '';
  const hasBearer = /^Bearer\s+.+$/i.test(authorization);
  return hasBearer || Boolean(request.headers.get('x-toonflow-access-token')?.trim());
}

export function middleware(request: NextRequest) {
  const host = normalizeHost(
    request.headers.get('x-forwarded-host') ||
      request.headers.get('host') ||
      request.nextUrl.hostname,
  );

  if (isLocalHost(host) || hasAccessCredential(request)) {
    return NextResponse.next();
  }

  return NextResponse.json(
    {
      error: '非 localhost API 访问需要访问凭据',
      host,
    },
    { status: 401 },
  );
}

export const config = {
  matcher: ['/api/:path*'],
};
