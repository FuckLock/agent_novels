// runtime: nodejs
// API: /api/system/trash
// GET  ?status=soft_deleted              → 列出回收站条目
// GET  ?action=previewImpact&targetType=&targetId= → 影响清单预览（硬删除前必走）
// POST { action: 'softDelete', targetType, targetId, ... }
// POST { action: 'restore', trashEntryId }
// POST { action: 'hardDelete', trashEntryId, confirmed: true }  // 必须 confirmed=true

import { NextRequest, NextResponse } from 'next/server';
import { enforceAccess } from '../../../lib/server/security/access-control';
import {
  listTrash,
  softDelete,
  restore,
  hardDelete,
  previewImpact,
  type TrashTargetType,
  type TrashStatus,
} from '../../../lib/server/trash/trash-service';

export const runtime = 'nodejs';

const VALID_TARGET_TYPES: TrashTargetType[] = [
  'project', 'chapter', 'script_segment', 'asset',
  'track', 'take', 'task', 'rough_cut',
  'audio_subtitle_plan', 'episode_delivery_package', 'artifact',
];

function isValidTargetType(v: string): v is TrashTargetType {
  return (VALID_TARGET_TYPES as string[]).includes(v);
}

export async function GET(request: NextRequest) {
  const accessError = await enforceAccess(request);
  if (accessError) return accessError;
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'previewImpact') {
      const targetType = searchParams.get('targetType');
      const targetId = searchParams.get('targetId');
      if (!targetType || !targetId) return NextResponse.json({ error: '缺少 targetType / targetId' }, { status: 400 });
      if (!isValidTargetType(targetType)) return NextResponse.json({ error: `非法 targetType: ${targetType}` }, { status: 400 });
      const report = await previewImpact({ targetType, targetId });
      return NextResponse.json(report);
    }

    const statusRaw = searchParams.get('status') as TrashStatus | null;
    const validStatuses: TrashStatus[] = ['soft_deleted', 'restored', 'hard_deleted'];
    const status = statusRaw && validStatuses.includes(statusRaw) ? statusRaw : undefined;
    const projectId = searchParams.get('projectId') || undefined;

    const entries = await listTrash({ status, projectId });
    return NextResponse.json({ entries });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'trash 查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const accessError = await enforceAccess(request);
  if (accessError) return accessError;
  try {
    const body = await request.json();
    const action = body.action;

    if (action === 'softDelete') {
      if (!body.targetType || !body.targetId) return NextResponse.json({ error: '缺少 targetType / targetId' }, { status: 400 });
      if (!isValidTargetType(body.targetType)) return NextResponse.json({ error: `非法 targetType: ${body.targetType}` }, { status: 400 });
      const record = await softDelete({
        targetType: body.targetType,
        targetId: body.targetId,
        projectId: body.projectId,
        title: body.title,
        reason: body.reason,
        snapshot: body.snapshot,
      });
      return NextResponse.json(record);
    }

    if (action === 'restore') {
      if (!body.trashEntryId) return NextResponse.json({ error: '缺少 trashEntryId' }, { status: 400 });
      const record = await restore({ trashEntryId: body.trashEntryId });
      return NextResponse.json(record);
    }

    if (action === 'hardDelete') {
      if (!body.trashEntryId) return NextResponse.json({ error: '缺少 trashEntryId' }, { status: 400 });
      if (body.confirmed !== true) return NextResponse.json({ error: '硬删除必须 confirmed=true' }, { status: 400 });
      const record = await hardDelete({ trashEntryId: body.trashEntryId, confirmed: true });
      return NextResponse.json(record);
    }

    return NextResponse.json({ error: `未知 action: ${action}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'trash 操作失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
