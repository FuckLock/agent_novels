// runtime: nodejs
// API: /api/system/audit-log
// GET  → 按 4 维度（对象 / 操作人 / 时间 / 类型）筛选查询 audit log（criteria D4 + F7）

import { NextRequest, NextResponse } from 'next/server';
import { enforceAccess } from '../../../lib/server/security/access-control';
import { queryAuditLog, AUDIT_EVENT_TYPES, type AuditEvent } from '../../../lib/server/audit/audit-log-service';

export const runtime = 'nodejs';

function isAuditEvent(value: string): value is AuditEvent {
  return (AUDIT_EVENT_TYPES as readonly string[]).includes(value);
}

export async function GET(request: NextRequest) {
  const accessError = await enforceAccess(request);
  if (accessError) return accessError;

  try {
    const { searchParams } = new URL(request.url);
    const eventTypeRaw = searchParams.get('eventType');
    const targetType = searchParams.get('targetType') || undefined;
    const targetId = searchParams.get('targetId') || undefined;
    const actor = searchParams.get('actor') || undefined;
    const projectId = searchParams.get('projectId') || undefined;
    const startTime = searchParams.get('startTime');
    const endTime = searchParams.get('endTime');
    const limitRaw = searchParams.get('limit');
    const offsetRaw = searchParams.get('offset');

    const eventType = eventTypeRaw && isAuditEvent(eventTypeRaw) ? eventTypeRaw : undefined;

    const logs = await queryAuditLog({
      eventType,
      targetType,
      targetId,
      actor,
      projectId,
      startTime: startTime ? Number(startTime) : undefined,
      endTime: endTime ? Number(endTime) : undefined,
      limit: limitRaw ? Math.min(Math.max(Number(limitRaw), 1), 1000) : 200,
      offset: offsetRaw ? Math.max(Number(offsetRaw), 0) : 0,
    });

    return NextResponse.json({ logs, eventTypes: AUDIT_EVENT_TYPES });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'audit-log 查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
