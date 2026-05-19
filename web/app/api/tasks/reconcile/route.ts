// runtime: nodejs
// /api/tasks/reconcile — Phase 12 任务对账触发 + 状态查询 API
// spec L416 + L555 + L853：服务重启对账 + 5 个 reconciliation 状态

import { NextResponse } from 'next/server';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import {
  reconcileAllTasks,
  listReconcileSnapshots,
  reconcileTask,
  detectOrphanedTasks,
  RECONCILIATION_STATUSES,
  type ReconciliationStatus,
} from '@/app/lib/server/tasks/reconcile-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/tasks/reconcile?projectId=&episode=&status=&limit=
 *
 * 列出当前所有任务的 reconciliation 快照（含 5 个 reconciliation 状态计数）
 */
export async function GET(request: Request) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId') || undefined;
    const episodeParam = url.searchParams.get('episode');
    const statusParam = url.searchParams.get('status') || undefined;
    const limitParam = url.searchParams.get('limit');
    const episode = episodeParam ? Number.parseInt(episodeParam, 10) : undefined;
    const limit = limitParam ? Number.parseInt(limitParam, 10) : 200;

    let reconciliationStatus: ReconciliationStatus | undefined;
    if (statusParam) {
      if ((RECONCILIATION_STATUSES as string[]).includes(statusParam)) {
        reconciliationStatus = statusParam as ReconciliationStatus;
      } else {
        return NextResponse.json(
          { error: `不支持的 reconciliation status：${statusParam}（应为 ${RECONCILIATION_STATUSES.join('/')}）` },
          { status: 400 },
        );
      }
    }

    const snapshots = await listReconcileSnapshots({
      projectId,
      episode,
      reconciliationStatus,
      limit,
    });
    const orphans = await detectOrphanedTasks();

    // 5 个 reconciliation 状态计数
    const counts: Record<ReconciliationStatus, number> = {
      normal: 0,
      reconnecting: 0,
      orphaned: 0,
      reconciled: 0,
      duplicate_blocked: 0,
    };
    for (const snap of snapshots) {
      counts[snap.reconciliationStatus] += 1;
    }

    return NextResponse.json({
      snapshots,
      counts,
      orphanedCount: orphans.length,
      reconciliationStatuses: RECONCILIATION_STATUSES,
      filter: { projectId, episode, status: statusParam, limit },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `加载对账快照失败：${message}` }, { status: 500 });
  }
}

/**
 * POST /api/tasks/reconcile { action?: 'all' | 'task', taskId?: string }
 *
 * 触发对账（默认全量 — 消费 Phase 9 recover/reconcile 别名）
 */
export async function POST(request: Request) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const action = String(body.action || 'all').trim();
  const taskId = body.taskId ? String(body.taskId) : '';

  try {
    if (action === 'task') {
      if (!taskId) {
        return NextResponse.json({ error: '缺少 taskId 参数（action=task）' }, { status: 400 });
      }
      const result = await reconcileTask(taskId);
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === 'all' || action === 'reconcile' || action === 'recover') {
      // 全量对账（消费 Phase 9 recoverInflightTasks + reconcilePendingTasks）
      const summary = await reconcileAllTasks();
      return NextResponse.json({ ok: true, summary });
    }

    return NextResponse.json(
      { error: `不支持的 action：${action}（仅支持 all / task / reconcile / recover）` },
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `对账失败：${message}` }, { status: 500 });
  }
}
