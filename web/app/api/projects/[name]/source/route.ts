import { NextResponse } from 'next/server';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import {
  importSourceDocument,
  listChapters,
  listSourceDocuments,
} from '@/app/lib/server/source/source-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function parseRequest(request: Request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) throw new Error('缺少 .txt 文件');
    if (!file.name.toLowerCase().endsWith('.txt')) throw new Error('仅支持 .txt 文件');
    return {
      title: String(formData.get('title') || file.name),
      filename: file.name,
      content: await file.text(),
      sourceType: 'upload',
      dryRun: formData.get('dryRun') === 'true',
    };
  }

  return request.json();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  try {
    const [documents, chapters] = await Promise.all([
      listSourceDocuments(name),
      listChapters(name),
    ]);
    return NextResponse.json({ documents, chapters });
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取原文失败';
    return NextResponse.json({ error: message }, { status: message === '项目不存在' ? 404 : 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  try {
    const body = await parseRequest(request);
    const result = await importSourceDocument(name, body, Boolean(body.dryRun));
    return NextResponse.json(result, { status: body.dryRun ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存原文失败';
    return NextResponse.json({ error: message }, { status: message === '项目不存在' ? 404 : 400 });
  }
}
