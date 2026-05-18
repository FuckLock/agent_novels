import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ensureSchema } from '../db/migrate';
import { getSqlite, runInTransaction } from '../db/client';

const PROJECT_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\s._-]{0,79}$/u;

const ProjectCreateSchema = z.object({
  name: z.string().trim().min(1, '项目名称不能为空').max(80, '项目名称最多 80 个字符'),
  type: z.string().trim().max(40).optional().default(''),
  style: z.string().trim().max(40).optional().default(''),
  ratio: z.string().trim().max(20).optional().default(''),
  summary: z.string().trim().max(3000).optional().default(''),
});

const ProjectUpdateSchema = ProjectCreateSchema.partial().extend({
  revision: z.number().int().positive().optional(),
  status: z.enum(['active', 'archived']).optional(),
});

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  type: string;
  style: string;
  ratio: string;
  summary: string;
  status: string;
  revision: number;
  chapter_count: number;
  script_count: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  type: string;
  style: string;
  ratio: string;
  summary: string;
  status: string;
  revision: number;
  chapterCount: number;
  scriptCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export class ProjectServiceError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

function validateProjectName(name: string) {
  if (!PROJECT_NAME_PATTERN.test(name)) {
    throw new ProjectServiceError('项目名称只能包含中英文、数字、空格、点、横线和下划线', 400);
  }
  if (name.includes('..') || /[\\/:\0]/.test(name)) {
    throw new ProjectServiceError('项目名称不能包含路径或特殊控制字符', 400);
  }
}

function buildDescription(input: z.infer<typeof ProjectCreateSchema>) {
  return [
    `项目名称:${input.name}`,
    `小说类型:${input.type}`,
    `影片画风:${input.style}`,
    `影片比例:${input.ratio}`,
    `小说简介:${input.summary}`,
  ].join('\n');
}

function mapProject(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    style: row.style,
    ratio: row.ratio,
    summary: row.summary,
    status: row.status,
    revision: row.revision,
    chapterCount: row.chapter_count,
    scriptCount: row.script_count,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
  };
}

export async function listProjects() {
  await ensureSchema();
  const rows = getSqlite()
    .prepare(
      `SELECT * FROM projects
       WHERE deleted_at IS NULL
       ORDER BY updated_at DESC, created_at DESC`,
    )
    .all() as ProjectRow[];

  return rows.map(mapProject);
}

export async function getProject(identifier: string) {
  await ensureSchema();
  const row = getSqlite()
    .prepare(
      `SELECT * FROM projects
       WHERE deleted_at IS NULL AND (id = ? OR name = ?)
       LIMIT 1`,
    )
    .get(identifier, identifier) as ProjectRow | undefined;

  return row ? mapProject(row) : null;
}

export async function createProject(rawInput: unknown) {
  await ensureSchema();
  const input = ProjectCreateSchema.parse(rawInput);
  validateProjectName(input.name);

  return runInTransaction((db) => {
    const existing = db.prepare('SELECT id FROM projects WHERE name = ? LIMIT 1').get(input.name);
    if (existing) throw new ProjectServiceError('项目名称已存在', 409);

    const now = Date.now();
    const id = randomUUID();
    const description = buildDescription(input);
    db.prepare(
      `INSERT INTO projects
        (id, name, description, type, style, ratio, summary, status, revision,
         chapter_count, script_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, 0, 0, ?, ?)`,
    ).run(id, input.name, description, input.type, input.style, input.ratio, input.summary, now, now);

    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow;
    return mapProject(row);
  });
}

export async function updateProject(identifier: string, rawInput: unknown) {
  await ensureSchema();
  const input = ProjectUpdateSchema.parse(rawInput);
  const existing = await getProject(identifier);
  if (!existing) throw new ProjectServiceError('项目不存在', 404);
  if (input.revision && input.revision !== existing.revision) {
    throw new ProjectServiceError('项目已被其他窗口更新，请刷新后重试', 409);
  }

  const next = {
    name: input.name?.trim() || existing.name,
    type: input.type?.trim() ?? existing.type,
    style: input.style?.trim() ?? existing.style,
    ratio: input.ratio?.trim() ?? existing.ratio,
    summary: input.summary?.trim() ?? existing.summary,
    status: input.status ?? existing.status,
  };
  validateProjectName(next.name);
  const description = buildDescription(next);

  return runInTransaction((db) => {
    const duplicate = db
      .prepare('SELECT id FROM projects WHERE name = ? AND id <> ? LIMIT 1')
      .get(next.name, existing.id);
    if (duplicate) throw new ProjectServiceError('项目名称已存在', 409);

    const now = Date.now();
    db.prepare(
      `UPDATE projects
       SET name = ?, description = ?, type = ?, style = ?, ratio = ?, summary = ?,
           status = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
    ).run(
      next.name,
      description,
      next.type,
      next.style,
      next.ratio,
      next.summary,
      next.status,
      now,
      existing.id,
    );

    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(existing.id) as ProjectRow;
    return mapProject(row);
  });
}

export async function softDeleteProject(identifier: string) {
  await ensureSchema();
  const project = await getProject(identifier);
  if (!project) throw new ProjectServiceError('项目不存在', 404);

  const now = Date.now();
  getSqlite()
    .prepare(
      `UPDATE projects
       SET status = 'deleted', deleted_at = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .run(now, now, project.id);

  return { success: true, id: project.id, name: project.name };
}

export function projectErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return { message: error.issues[0]?.message || '项目参数错误', status: 400 };
  }
  if (error instanceof ProjectServiceError) {
    return { message: error.message, status: error.status };
  }
  return { message: '项目操作失败', status: 500 };
}
