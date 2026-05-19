// runtime: nodejs
// /api/tasks - 全局任务 API（工作空间级，无项目维度）
// spec L416 + L555：服务重启对账入口；查询 + 暂停 / 恢复 / 取消 / 重试

import { NextResponse } from 'next/server';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import {
  listTasks,
  pauseTask,
  resumeTask,
  cancelTask,
  retryTask,
  recoverInflightTasks,
  getActiveTaskCount,
  type TaskStatus,
} from '@/app/lib/server/tasks/task-queue';
import { reconcilePendingTasks } from '@/app/lib/server/production/video-task-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/tasks?projectId=&status=&episode=&limit=
 *
 * 返回所有任务列表（支持过滤）+ 当前活跃计数
 */
export async function GET(request: Request) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId') || undefined;
    const statusParam = url.searchParams.get('status') || undefined;
    const episodeParam = url.searchParams.get('episode');
    const limitParam = url.searchParams.get('limit');
    const episode = episodeParam ? Number.parseInt(episodeParam, 10) : undefined;
    const limit = limitParam ? Number.parseInt(limitParam, 10) : 100;

    const tasks = await listTasks({
      projectId,
      episode,
      status: statusParam ? (statusParam.split(',') as TaskStatus[]) : undefined,
      limit,
    });
    const activeCount = await getActiveTaskCount(projectId);

    return NextResponse.json({
      tasks,
      activeCount,
      limit,
      filter: { projectId, episode, status: statusParam },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `加载任务失败：${message}` }, { status: 500 });
  }
}

/**
 * POST /api/tasks { action: 'pause' | 'resume' | 'cancel' | 'retry' | 'reconcile' | 'recover', taskId?: string }
 *
 * 服务重启对账 + 任务控制
 */
export async function POST(request: Request) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'POST body 必须是 JSON' }, { status: 400 });
  }

  const action = String(body.action || '').trim();
  const taskId = body.taskId ? String(body.taskId) : '';

  try {
    if (action === 'reconcile' || action === 'recover') {
      // 服务重启对账（spec L416 + L555）— 扫描 inflight tasks 后由 video-task-service 拉取远端状态
      const recoverResult = await recoverInflightTasks();
      const reconcileResult = await reconcilePendingTasks();
      return NextResponse.json({
        ok: true,
        recovered: recoverResult,
        reconciled: reconcileResult,
      });
    }

    if (!taskId) {
      return NextResponse.json({ error: '缺少 taskId 参数' }, { status: 400 });
    }

    if (action === 'pause') {
      await pauseTask(taskId);
      return NextResponse.json({ ok: true, taskId, action: 'paused' });
    }
    if (action === 'resume') {
      await resumeTask(taskId);
      return NextResponse.json({ ok: true, taskId, action: 'resumed' });
    }
    if (action === 'cancel') {
      await cancelTask(taskId);
      return NextResponse.json({ ok: true, taskId, action: 'cancelled' });
    }
    if (action === 'retry') {
      const result = await retryTask(taskId);
      if (result.status === 'blocked') {
        return NextResponse.json(
          { ok: false, taskId, ...result },
          { status: 422 },
        );
      }
      return NextResponse.json({ ok: true, taskId, ...result });
    }

    return NextResponse.json(
      { error: `不支持的 action：${action}（仅支持 pause / resume / cancel / retry / reconcile）` },
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `任务操作失败：${message}` }, { status: 500 });
  }
}

/**
 * PATCH /api/tasks { taskId, action } — 等价于 POST，便于 RESTful 风格
 */
export async function PATCH(request: Request) {
  return POST(request);
}
