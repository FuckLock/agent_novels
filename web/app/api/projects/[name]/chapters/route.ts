import { NextResponse } from 'next/server';
import { getChapters } from '@/app/lib/novels';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import { getImpactPreview, listChapters, saveChapter } from '@/app/lib/server/source/source-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  try {
    const chapters = await listChapters(name);
    return NextResponse.json(chapters);
  } catch (error) {
    if (error instanceof Error && error.message === '项目不存在') {
      try {
        const chapters = await getChapters(name);
        return NextResponse.json(chapters);
      } catch {
        return NextResponse.json({ error: '项目不存在' }, { status: 404 });
      }
    }
    console.error('获取章节列表失败:', error);
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  let body: { previewImpact?: boolean; chapters?: Array<{ number: number; title?: string; content: string }>; number?: number; title?: string; content?: string } = {};
  try {
    body = await request.json();
    if (body.previewImpact) {
      return NextResponse.json({ impact: getImpactPreview() });
    }

    // 支持批量创建章节
    if (Array.isArray(body.chapters)) {
      const results = [];
      for (const ch of body.chapters) {
        results.push(await saveChapter(name, { number: ch.number, title: ch.title, content: ch.content }));
      }
      return NextResponse.json({ success: true, count: body.chapters.length, impact: results.at(-1)?.impact || [] });
    }

    // 单个章节创建
    const result = await saveChapter(name, body);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === '项目不存在') {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }
    console.error('创建章节失败:', error);
    const message = error instanceof Error ? error.message : '创建失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
