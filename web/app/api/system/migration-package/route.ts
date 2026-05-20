// runtime: nodejs
// API: /api/system/migration-package
// GET  ?action=list-projects  → 列出可导出的项目
// POST { action: 'export', projectId } → 导出 manifest（默认排除 SecretRef）
// POST { action: 'restore', manifest, dryRun? } → 恢复 manifest（MVP）
//
// 边界：本 API 不 import Phase 11 delivery 体系（criteria H3 同源）

import { NextRequest, NextResponse } from 'next/server';
import { enforceAccess } from '../../../lib/server/security/access-control';
import { getSqlite } from '../../../lib/server/db/client';
import { ensureSchema } from '../../../lib/server/db/migrate';
import {
  exportProjectMigrationPackage,
  restoreMigrationPackage,
} from '../../../lib/server/export/project-migration-package-service';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const accessError = await enforceAccess(request);
  if (accessError) return accessError;
  try {
    await ensureSchema();
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'list-projects';

    if (action === 'list-projects') {
      const hasTable = getSqlite()
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")
        .get() as { name: string } | undefined;
      if (!hasTable) return NextResponse.json({ projects: [] });

      const cols = getSqlite()
        .prepare('PRAGMA table_info(projects)')
        .all() as Array<{ name: string }>;
      const nameCol = cols.find((c) => c.name === 'name') ? 'name'
        : cols.find((c) => c.name === 'display_name') ? 'display_name'
        : "''";
      const rows = getSqlite()
        .prepare(`SELECT id, ${nameCol} as name FROM projects ORDER BY id LIMIT 200`)
        .all() as Array<{ id: string; name: string | null }>;
      return NextResponse.json({ projects: rows.map((r) => ({ id: r.id, name: r.name || r.id })) });
    }
    return NextResponse.json({ error: `未知 action: ${action}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'migration-package 处理失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const accessError = await enforceAccess(request);
  if (accessError) return accessError;
  try {
    const body = await request.json();
    const action = body.action;

    if (action === 'export') {
      if (!body.projectId) return NextResponse.json({ error: '缺少 projectId' }, { status: 400 });
      const result = await exportProjectMigrationPackage({ projectId: body.projectId });
      return NextResponse.json(result);
    }
    if (action === 'restore') {
      if (!body.manifest) return NextResponse.json({ error: '缺少 manifest' }, { status: 400 });
      const report = await restoreMigrationPackage({ manifest: body.manifest, dryRun: Boolean(body.dryRun) });
      return NextResponse.json(report);
    }
    return NextResponse.json({ error: `未知 action: ${action}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'migration-package 操作失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
