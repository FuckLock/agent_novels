import { NextResponse } from 'next/server';
import {
  getChapterContent,
} from '@/app/lib/novels';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import {
  deleteChapter,
  getChapter,
  getImpactPreview,
  saveChapter,
} from '@/app/lib/server/source/source-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string; id: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name, id } = await params;
  const chapterNum = parseInt(id, 10);
  try {
    const chapter = await getChapter(name, chapterNum);
    if (chapter) return NextResponse.json({ ...chapter, impact: getImpactPreview() });

    const content = await getChapterContent(name, chapterNum);
    return NextResponse.json({ number: chapterNum, content, impact: getImpactPreview() });
  } catch {
    return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ name: string; id: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name, id } = await params;
  const chapterNum = parseInt(id, 10);
  let body: { title?: string; content?: string; revision?: number } = {};
  try {
    body = await request.json();
    const result = await saveChapter(name, { ...body, number: chapterNum });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === '项目不存在') {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }
    console.error('更新章节失败:', error);
    const message = error instanceof Error ? error.message : '更新失败';
    return NextResponse.json({ error: message }, { status: message.includes('刷新') ? 409 : 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ name: string; id: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name, id } = await params;
  const chapterNum = parseInt(id, 10);
  try {
    const result = await deleteChapter(name, chapterNum);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === '项目不存在') {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }
    console.error('删除章节失败:', error);
    const message = error instanceof Error ? error.message : '删除失败';
    return NextResponse.json({ error: message }, { status: message === '章节不存在' ? 404 : 500 });
  }
}
