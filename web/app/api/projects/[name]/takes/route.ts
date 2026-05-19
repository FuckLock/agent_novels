// runtime: nodejs
// /api/projects/[name]/takes - Take 列表 / 创建 / 问题标记 / 父血缘
// spec L130 + L418 + L741

import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import { ensureSchema } from '@/app/lib/server/db/migrate';
import { getSqlite } from '@/app/lib/server/db/client';
import { getProject } from '@/app/lib/server/projects/project-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function normalizeIdentifier(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

interface TakeRow {
  id: string;
  task_id: string | null;
  track_id: string;
  project_id: string;
  artifact_id: string | null;
  parent_take_id: string | null;
  model_id: string;
  strategy: string;
  parameters_json: string;
  prompt: string;
  cost_estimate: number;
  cost_actual: number;
  provider_job_id: string | null;
  status: string;
  issue_tags: string;
  review_note: string;
  duration_seconds: number;
  created_at: number;
  updated_at: number;
}

function mapTake(row: TakeRow) {
  let issueTags: string[] = [];
  try {
    issueTags = JSON.parse(row.issue_tags) as string[];
  } catch {
    issueTags = [];
  }
  return {
    id: row.id,
    taskId: row.task_id,
    trackId: row.track_id,
    projectId: row.project_id,
    artifactId: row.artifact_id,
    parentTakeId: row.parent_take_id,
    modelId: row.model_id,
    strategy: row.strategy,
    prompt: row.prompt,
    costEstimate: row.cost_estimate,
    costActual: row.cost_actual,
    providerJobId: row.provider_job_id,
    status: row.status,
    issueTags,
    reviewNote: row.review_note,
    durationSeconds: row.duration_seconds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * GET /api/projects/[name]/takes?trackId=&episode=
 *
 * 列出某 Track / 某 episode 下的所有 Take（按时间倒序）
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  try {
    const { name: rawName } = await params;
    const name = normalizeIdentifier(rawName);
    const project = await getProject(name);
    if (!project) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }

    const url = new URL(request.url);
    const trackId = url.searchParams.get('trackId') || '';
    const limit = Number.parseInt(url.searchParams.get('limit') || '100', 10);

    await ensureSchema();
    const db = getSqlite();
    let rows: TakeRow[];
    if (trackId) {
      rows = db
        .prepare(
          `SELECT * FROM takes WHERE project_id = ? AND track_id = ?
           ORDER BY created_at DESC LIMIT ?`,
        )
        .all(project.id, trackId, limit) as TakeRow[];
    } else {
      rows = db
        .prepare(
          `SELECT * FROM takes WHERE project_id = ?
           ORDER BY created_at DESC LIMIT ?`,
        )
        .all(project.id, limit) as TakeRow[];
    }

    return NextResponse.json({
      projectName: name,
      takes: rows.map(mapTake),
      count: rows.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `加载 Takes 失败：${message}` }, { status: 500 });
  }
}

/**
 * POST /api/projects/[name]/takes { trackId, strategy, prompt, parentTakeId? }
 *
 * 创建 Take 占位（实际 Take 由 video-task-service 完成视频后回填 artifact）
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'POST body 必须是 JSON' }, { status: 400 });
  }

  try {
    const { name: rawName } = await params;
    const name = normalizeIdentifier(rawName);
    const project = await getProject(name);
    if (!project) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }

    const trackId = String(body.trackId || '').trim();
    if (!trackId) {
      return NextResponse.json({ error: '缺少 trackId' }, { status: 400 });
    }

    await ensureSchema();
    const id = randomUUID();
    const now = Date.now();
    const db = getSqlite();
    db.prepare(
      `INSERT INTO takes
        (id, task_id, track_id, project_id, artifact_id, parent_take_id,
         model_id, strategy, parameters_json, prompt, cost_estimate, cost_actual,
         provider_job_id, status, issue_tags, review_note, duration_seconds,
         created_at, updated_at)
       VALUES (?, NULL, ?, ?, NULL, ?,
               ?, ?, ?, ?, 0, 0,
               NULL, 'draft', '[]', '', 0,
               ?, ?)`,
    ).run(
      id,
      trackId,
      project.id,
      body.parentTakeId ? String(body.parentTakeId) : null,
      String(body.modelId || ''),
      String(body.strategy || ''),
      JSON.stringify(body.parameters || {}),
      String(body.prompt || ''),
      now,
      now,
    );

    return NextResponse.json({ ok: true, takeId: id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `创建 Take 失败：${message}` }, { status: 500 });
  }
}

/**
 * PATCH /api/projects/[name]/takes { takeId, issueTags?, reviewNote? }
 *
 * 标记 Take 问题（spec L546 — 7 类问题任一）
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'POST body 必须是 JSON' }, { status: 400 });
  }

  try {
    const { name: rawName } = await params;
    const name = normalizeIdentifier(rawName);
    const project = await getProject(name);
    if (!project) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }
    const takeId = String(body.takeId || '').trim();
    if (!takeId) {
      return NextResponse.json({ error: '缺少 takeId' }, { status: 400 });
    }
    const issueTags = Array.isArray(body.issueTags) ? (body.issueTags as string[]) : null;
    const reviewNote = typeof body.reviewNote === 'string' ? body.reviewNote : null;
    if (issueTags === null && reviewNote === null) {
      return NextResponse.json({ error: '至少需要提供 issueTags 或 reviewNote' }, { status: 400 });
    }

    await ensureSchema();
    const now = Date.now();
    const db = getSqlite();
    const updates: string[] = [];
    const args: (string | number)[] = [];
    if (issueTags !== null) {
      updates.push('issue_tags = ?');
      args.push(JSON.stringify(issueTags));
    }
    if (reviewNote !== null) {
      updates.push('review_note = ?');
      args.push(reviewNote);
    }
    updates.push('updated_at = ?');
    args.push(now);
    db.prepare(
      `UPDATE takes SET ${updates.join(', ')} WHERE id = ? AND project_id = ?`,
    ).run(...args, takeId, project.id);

    return NextResponse.json({ ok: true, takeId });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: `更新 Take 失败：${message}` }, { status: 500 });
  }
}
