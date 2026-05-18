import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getProject } from '../projects/project-service';
import { ensureSchema } from '../db/migrate';
import { getSqlite, runInTransaction } from '../db/client';
import { writeArtifact } from '../artifacts/store';
import { previewTextImpact, recordTextImpact, ImpactItem } from '../dependencies/impact-service';

const ImportSchema = z.object({
  title: z.string().trim().max(120).optional(),
  filename: z.string().trim().max(160).optional(),
  content: z.string().min(1, '原文内容不能为空').max(5_000_000, '单次导入最多 500 万字符'),
  sourceType: z.enum(['paste', 'upload']).default('paste'),
});

const ChapterSaveSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().trim().max(160).optional(),
  content: z.string().min(1).max(1_000_000),
  revision: z.number().int().positive().optional(),
});

export interface ParsedChapter {
  number: number;
  title: string;
  content: string;
  preview: string;
  charCount: number;
}

interface ChapterRow {
  id: string;
  chapter_number: number;
  title: string;
  content: string;
  preview: string;
  char_count: number;
  revision: number;
  updated_at: number;
}

interface SourceDocumentRow {
  id: string;
  title: string;
  source_type: string;
  filename: string | null;
  char_count: number;
  revision: number;
  created_at: number;
  updated_at: number;
}

function normalizeIdentifier(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function chineseNumToArabic(raw: string) {
  if (/^\d+$/.test(raw)) return Number(raw);
  const digits: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
  let result = 0;
  let section = 0;
  let number = 0;
  for (const char of raw) {
    if (digits[char]) number = digits[char];
    if (units[char]) {
      const unit = units[char];
      section += (number || 1) * unit;
      number = 0;
      if (unit === 10000) {
        result += section;
        section = 0;
      }
    }
  }
  return result + section + number || 1;
}

function preview(content: string) {
  return content.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function mapChapter(row: ChapterRow) {
  return {
    id: row.id,
    number: row.chapter_number,
    filename: `chapter-${row.chapter_number}.txt`,
    title: row.title,
    content: row.content,
    preview: row.preview,
    charCount: row.char_count,
    revision: row.revision,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function parseChapters(content: string, startNumber = 1): ParsedChapter[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const chapters: ParsedChapter[] = [];
  const headingPattern = /^第([一二三四五六七八九十百千万\d]+)[章回节卷][\s:：、.-]*(.*)$/;
  let currentNumber = startNumber;
  let currentTitle = '';
  let currentLines: string[] = [];

  const flush = () => {
    const text = currentLines.join('\n').trim();
    if (!text) return;
    chapters.push({
      number: currentNumber,
      title: currentTitle || `第${currentNumber}章`,
      content: text,
      preview: preview(text),
      charCount: text.length,
    });
  };

  for (const line of lines) {
    const match = line.trim().match(headingPattern);
    if (match) {
      flush();
      currentNumber = chineseNumToArabic(match[1]);
      currentTitle = line.trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }
  flush();

  if (chapters.length > 0) return chapters;
  const text = content.trim();
  return text ? [{ number: startNumber, title: `第${startNumber}章`, content: text, preview: preview(text), charCount: text.length }] : [];
}

async function resolveProject(identifier: string) {
  const project = await getProject(normalizeIdentifier(identifier));
  if (!project) throw new Error('项目不存在');
  return project;
}

export async function listChapters(projectIdentifier: string) {
  await ensureSchema();
  const project = await resolveProject(projectIdentifier);
  const rows = getSqlite()
    .prepare(
      `SELECT * FROM chapters
       WHERE project_id = ? AND deleted_at IS NULL
       ORDER BY chapter_number ASC`,
    )
    .all(project.id) as ChapterRow[];
  return rows.map(mapChapter);
}

export async function listSourceDocuments(projectIdentifier: string) {
  await ensureSchema();
  const project = await resolveProject(projectIdentifier);
  const rows = getSqlite()
    .prepare(
      `SELECT id, title, source_type, filename, char_count, revision, created_at, updated_at
       FROM source_documents
       WHERE project_id = ? AND deleted_at IS NULL
       ORDER BY updated_at DESC`,
    )
    .all(project.id) as SourceDocumentRow[];
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    sourceType: row.source_type,
    filename: row.filename,
    charCount: row.char_count,
    revision: row.revision,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }));
}

export async function getChapter(projectIdentifier: string, chapterNumber: number) {
  await ensureSchema();
  const project = await resolveProject(projectIdentifier);
  const row = getSqlite()
    .prepare('SELECT * FROM chapters WHERE project_id = ? AND chapter_number = ? AND deleted_at IS NULL')
    .get(project.id, chapterNumber) as ChapterRow | undefined;
  if (!row) return null;
  return mapChapter(row);
}

function upsertChapter(projectId: string, sourceDocumentId: string | null, chapter: ParsedChapter) {
  const db = getSqlite();
  const existing = db
    .prepare('SELECT id, revision FROM chapters WHERE project_id = ? AND chapter_number = ?')
    .get(projectId, chapter.number) as { id: string; revision: number } | undefined;
  const now = Date.now();

  if (existing) {
    db.prepare(
      `UPDATE chapters
       SET source_document_id = ?, title = ?, content = ?, preview = ?, char_count = ?,
           status = 'active', revision = revision + 1, stale_reason = '', updated_at = ?, deleted_at = NULL
       WHERE id = ?`,
    ).run(sourceDocumentId, chapter.title, chapter.content, chapter.preview, chapter.charCount, now, existing.id);
    return existing.id;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO chapters
      (id, project_id, source_document_id, chapter_number, title, content, preview, char_count,
       status, revision, stale_reason, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, '', ?, ?)`,
  ).run(id, projectId, sourceDocumentId, chapter.number, chapter.title, chapter.content, chapter.preview, chapter.charCount, now, now);
  return id;
}

function refreshProjectChapterCount(projectId: string) {
  const row = getSqlite()
    .prepare('SELECT COUNT(*) AS count FROM chapters WHERE project_id = ? AND deleted_at IS NULL')
    .get(projectId) as { count: number };
  getSqlite()
    .prepare('UPDATE projects SET chapter_count = ?, revision = revision + 1, updated_at = ? WHERE id = ?')
    .run(row.count, Date.now(), projectId);
}

export async function importSourceDocument(projectIdentifier: string, rawInput: unknown, dryRun = false) {
  await ensureSchema();
  const project = await resolveProject(projectIdentifier);
  const input = ImportSchema.parse(rawInput);
  const existingChapters = await listChapters(project.id);
  const startNumber = existingChapters.length > 0 ? Math.max(...existingChapters.map((item) => item.number)) + 1 : 1;
  const chapters = parseChapters(input.content, startNumber);
  const impact = previewTextImpact('原文导入会影响文本派生结果');
  if (dryRun) return { chapters, impact };

  const artifact = await writeArtifact({
    content: input.content,
    mimeType: 'text/plain',
    sourceType: input.sourceType === 'upload' ? 'uploaded' : 'imported',
    originalName: input.filename || `${project.name}.txt`,
    objectType: 'source_document',
    objectId: project.id,
  });

  const sourceDocumentId = randomUUID();
  runInTransaction((db) => {
    const now = Date.now();
    db.prepare(
      `INSERT INTO source_documents
        (id, project_id, artifact_id, title, source_type, filename, mime_type, char_count,
         revision, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'text/plain', ?, 1, 'active', ?, ?)`,
    ).run(sourceDocumentId, project.id, artifact.id, input.title || input.filename || project.name, input.sourceType, input.filename || null, input.content.length, now, now);

    for (const chapter of chapters) upsertChapter(project.id, sourceDocumentId, chapter);
    refreshProjectChapterCount(project.id);
  });

  const recordedImpact = await recordTextImpact(project.id, 'source_document', sourceDocumentId, 'source_document_imported');
  return { sourceDocumentId, artifactId: artifact.id, chapters, impact: recordedImpact };
}

export async function saveChapter(projectIdentifier: string, rawInput: unknown) {
  await ensureSchema();
  const project = await resolveProject(projectIdentifier);
  const input = ChapterSaveSchema.parse(rawInput);
  const current = await getChapter(project.id, input.number);
  if (input.revision && current && input.revision !== current.revision) {
    throw new Error('章节已被其他窗口更新，请刷新后重试');
  }
  const title = input.title || input.content.split('\n')[0]?.trim() || `第${input.number}章`;
  const chapter = { number: input.number, title, content: input.content, preview: preview(input.content), charCount: input.content.length };
  const chapterId = runInTransaction(() => {
    const id = upsertChapter(project.id, null, chapter);
    refreshProjectChapterCount(project.id);
    return id;
  });
  const impact = await recordTextImpact(project.id, 'chapter', chapterId, 'chapter_updated');
  return { chapter: await getChapter(project.id, input.number), impact };
}

export async function deleteChapter(projectIdentifier: string, chapterNumber: number) {
  await ensureSchema();
  const project = await resolveProject(projectIdentifier);
  const current = await getChapter(project.id, chapterNumber);
  if (!current) throw new Error('章节不存在');
  const now = Date.now();
  getSqlite()
    .prepare("UPDATE chapters SET status = 'deleted', deleted_at = ?, revision = revision + 1, updated_at = ? WHERE id = ?")
    .run(now, now, current.id);
  refreshProjectChapterCount(project.id);
  const impact = await recordTextImpact(project.id, 'chapter', current.id, 'chapter_deleted');
  return { success: true, impact };
}

export function getImpactPreview(): ImpactItem[] {
  return previewTextImpact('章节变更会影响文本派生结果');
}
