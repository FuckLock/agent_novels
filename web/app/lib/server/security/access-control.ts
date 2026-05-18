import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getServerEnv, ToonflowAccessMode } from '../env';
import { ensureSchema } from '../db/migrate';
import { getSqlite } from '../db/client';

interface AccessCredentialRow {
  id: string;
  operator_id: string;
  access_mode: ToonflowAccessMode;
  token_hash: string;
  enabled: number;
}

export interface RequestAccessContext {
  allowed: boolean;
  local: boolean;
  host: string;
  accessMode: ToonflowAccessMode;
  operatorId: string | null;
  credentialId: string | null;
  reason?: string;
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

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

function getRequestHost(request: Request) {
  const headers = request.headers;
  const forwardedHost = headers.get('x-forwarded-host');
  const hostHeader = headers.get('host');
  const urlHost = new URL(request.url).hostname;
  return normalizeHost(forwardedHost || hostHeader || urlHost);
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || request.headers.get('x-toonflow-access-token')?.trim() || '';
}

async function findCredential(token: string) {
  const tokenHash = hashToken(token);
  const rows = getSqlite()
    .prepare('SELECT * FROM access_credentials WHERE enabled = 1')
    .all() as AccessCredentialRow[];
  return rows.find((row) => safeEqual(row.token_hash, tokenHash)) || null;
}

export async function getRequestAccessContext(request: Request): Promise<RequestAccessContext> {
  await ensureSchema();
  const env = getServerEnv();
  const host = getRequestHost(request);
  const local = isLocalHost(host);

  if (local) {
    return {
      allowed: true,
      local: true,
      host,
      accessMode: env.accessMode,
      operatorId: 'local-owner',
      credentialId: null,
    };
  }

  const token = getBearerToken(request);
  if (!token) {
    return {
      allowed: false,
      local: false,
      host,
      accessMode: env.accessMode,
      operatorId: null,
      credentialId: null,
      reason: '非 localhost 访问需要访问凭据',
    };
  }

  const credential = await findCredential(token);
  if (!credential) {
    return {
      allowed: false,
      local: false,
      host,
      accessMode: env.accessMode,
      operatorId: null,
      credentialId: null,
      reason: '访问凭据无效或已停用',
    };
  }

  const now = Date.now();
  getSqlite()
    .prepare('UPDATE access_credentials SET last_used_at = ?, updated_at = ? WHERE id = ?')
    .run(now, now, credential.id);

  return {
    allowed: true,
    local: false,
    host,
    accessMode: env.accessMode,
    operatorId: credential.operator_id,
    credentialId: credential.id,
  };
}

export async function enforceAccess(request: Request) {
  const context = await getRequestAccessContext(request);
  if (context.allowed) return null;

  return NextResponse.json(
    {
      error: context.reason || '访问被拒绝',
      accessMode: context.accessMode,
      host: context.host,
    },
    { status: 401 },
  );
}
