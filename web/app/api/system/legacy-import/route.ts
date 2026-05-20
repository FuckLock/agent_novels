// runtime: nodejs
// API: /api/system/legacy-import
// GET  ?action=scan                       → 列出 legacy 目录候选
// GET  ?action=preview&legacyDirName=xxx  → 预览指定目录的 6 类内容
// POST { action: 'import', legacyDirName } → 执行导入（绝不写 legacy 目录）

import { NextRequest, NextResponse } from 'next/server';
import { enforceAccess } from '../../../lib/server/security/access-control';
import { scanLegacy, previewLegacy, importLegacy } from '../../../lib/server/legacy-import/legacy-import-service';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const accessError = await enforceAccess(request);
  if (accessError) return accessError;

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'scan';

    if (action === 'scan') {
      const result = await scanLegacy();
      return NextResponse.json(result);
    }
    if (action === 'preview') {
      const legacyDirName = searchParams.get('legacyDirName');
      if (!legacyDirName) return NextResponse.json({ error: '缺少 legacyDirName' }, { status: 400 });
      const preview = await previewLegacy({ legacyDirName });
      return NextResponse.json(preview);
    }
    return NextResponse.json({ error: `未知 action: ${action}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'legacy-import 处理失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const accessError = await enforceAccess(request);
  if (accessError) return accessError;

  try {
    const body = await request.json();
    const action = body.action;

    if (action === 'import') {
      if (!body.legacyDirName) return NextResponse.json({ error: '缺少 legacyDirName' }, { status: 400 });
      const record = await importLegacy({
        legacyDirName: body.legacyDirName,
        mappingRules: body.mappingRules || {},
        projectName: body.projectName,
      });
      return NextResponse.json(record);
    }
    return NextResponse.json({ error: `未知 action: ${action}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'legacy-import 导入失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
