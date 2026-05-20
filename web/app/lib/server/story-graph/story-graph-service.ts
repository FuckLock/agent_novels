// runtime: nodejs
// story-graph-service: Phase 14 章节事件图谱 service（增强项 + 默认禁用 + 可选召回）
//
// 增强项性质（criteria B2 + spec L629 + DEV-PLAN L633）：
//   本 service 为"增强能力" — 默认禁用（TOONFLOW_STORY_GRAPH_ENABLED 不为 'true' 时进入 disabled 分支）
//   剧本 Agent / 主链路 service 不强 import 本 service（criteria B6）
//
// 核心硬约束：
//   1. feature flag 默认 false（criteria B2）
//   2. 事件 / 角色 / 时序 3 类字段覆盖（criteria B3 — spec L299 + L358 + L649）
//   3. 抽取 + 召回 + 查询 函数（criteria B4）
//   4. 写 chapter_events 表（criteria B5）
//   5. 剧本 Agent 不强依赖（criteria B6 — 反向 grep）
//
// MVP 降级（criteria 辅助松约束）：
//   - NER + 关系抽取 → MVP 允许 'manual' 来源（用户在 UI 写入 events + relations，不强制 AI 抽取）
//   - 完整召回 → MVP 简单 SELECT 按 sequence_index 排序
//
// 不允许：
//   - 调用真实网络（fetch / openai / axios）
//   - 写 / 删除 / 创建 novels/ 真实目录（criteria I3）

import { randomUUID } from 'node:crypto';
import { getSqlite } from '../db/client';
import { ensureSchema } from '../db/migrate';

// ============================================================
// 1. Feature flag 守卫（criteria B2 — 默认禁用）
// ============================================================

export const STORY_GRAPH_FLAG_KEY = 'TOONFLOW_STORY_GRAPH_ENABLED';

export function isStoryGraphEnabled(): boolean {
  const v1 = (process.env.TOONFLOW_STORY_GRAPH_ENABLED || '').toLowerCase();
  const v2 = (process.env.TOONFLOW_EVENT_GRAPH || '').toLowerCase();
  const enabled = ['true', '1', 'yes', 'on'].includes(v1) || ['true', '1', 'yes', 'on'].includes(v2);
  if (!enabled) return false;
  return true;
}

export interface StoryGraphFeatureState {
  enabled: boolean;
  reason: string;
}

export function getStoryGraphFeatureState(): StoryGraphFeatureState {
  if (!isStoryGraphEnabled()) {
    return {
      enabled: false,
      reason: `feature flag disabled — set ${STORY_GRAPH_FLAG_KEY}=true to enable`,
    };
  }
  return { enabled: true, reason: 'enabled' };
}

// ============================================================
// 2. 类型定义（criteria B3 — 事件 / 角色 / 时序 3 类）
// ============================================================

export type ChapterEventType = 'plot' | 'character' | 'relation' | 'timeline' | 'setting';

export const CHAPTER_EVENT_TYPES: readonly ChapterEventType[] = [
  'plot',
  'character',
  'relation',
  'timeline',
  'setting',
];

export type ExtractionSource = 'manual' | 'ai_extracted' | 'user_confirmed';

export interface CharacterRef {
  name: string;
  role?: string;
  description?: string;
}

export interface RelationEdge {
  from: string;
  to: string;
  type: string; // 'friend' / 'rival' / 'family' / 'unknown' 等
  description?: string;
}

export interface TimelineMeta {
  chapterIndex?: number;
  episodeIndex?: number;
  sequence?: number;
  timestamp?: string; // ISO 字符串（可选）
  note?: string;
}

export interface ChapterEvent {
  id: string;
  chapterId: string;
  projectId: string;
  eventType: ChapterEventType;
  title: string;
  summary: string;
  sequenceIndex: number;
  characters: CharacterRef[];
  relations: RelationEdge[];
  timeline: TimelineMeta;
  extractionSource: ExtractionSource;
  confidence: number;
  actor: string;
  createdAt: number;
  updatedAt: number;
}

interface ChapterEventRow {
  id: string;
  chapter_id: string;
  project_id: string;
  event_type: string;
  title: string;
  summary: string;
  sequence_index: number;
  characters_json: string;
  relations_json: string;
  timeline_json: string;
  extraction_source: string;
  confidence: number;
  actor: string;
  created_at: number;
  updated_at: number;
}

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function rowToEvent(row: ChapterEventRow): ChapterEvent {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    projectId: row.project_id,
    eventType: (CHAPTER_EVENT_TYPES as readonly string[]).includes(row.event_type)
      ? (row.event_type as ChapterEventType)
      : 'plot',
    title: row.title,
    summary: row.summary,
    sequenceIndex: row.sequence_index,
    characters: safeJsonParse<CharacterRef[]>(row.characters_json, []),
    relations: safeJsonParse<RelationEdge[]>(row.relations_json, []),
    timeline: safeJsonParse<TimelineMeta>(row.timeline_json, {}),
    extractionSource: ['manual', 'ai_extracted', 'user_confirmed'].includes(row.extraction_source)
      ? (row.extraction_source as ExtractionSource)
      : 'manual',
    confidence: row.confidence,
    actor: row.actor,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================
// 3. 写入 / 抽取章节事件（criteria B4 — extractEvents / writeChapterEvents / saveChapterEvents）
// ============================================================
// MVP 实现：'manual' / 'user_confirmed' 来源 — UI 端结构化记录后写入
// 不强制 AI 抽取（spec L299 / L358 — 抽取结果可查看、修正、确认）

export interface WriteChapterEventInput {
  chapterId: string;
  projectId: string;
  eventType?: ChapterEventType;
  title?: string;
  summary?: string;
  sequenceIndex?: number;
  characters?: CharacterRef[];
  relations?: RelationEdge[];
  timeline?: TimelineMeta;
  extractionSource?: ExtractionSource;
  confidence?: number;
  actor?: string;
}

export async function writeChapterEvent(input: WriteChapterEventInput): Promise<ChapterEvent | null> {
  if (!isStoryGraphEnabled()) return null;

  await ensureSchema();
  const db = getSqlite();
  const now = Date.now();
  const id = randomUUID();

  db.prepare(
    `INSERT INTO chapter_events
      (id, chapter_id, project_id, event_type, title, summary, sequence_index,
       characters_json, relations_json, timeline_json, extraction_source,
       confidence, actor, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.chapterId,
    input.projectId,
    input.eventType ?? 'plot',
    input.title ?? '',
    input.summary ?? '',
    input.sequenceIndex ?? 0,
    JSON.stringify(input.characters ?? []),
    JSON.stringify(input.relations ?? []),
    JSON.stringify(input.timeline ?? {}),
    input.extractionSource ?? 'manual',
    input.confidence ?? 0,
    input.actor ?? 'local-owner',
    now,
    now,
  );

  return getChapterEvent(id);
}

// 批量抽取（MVP — 用户提交结构化列表后写入）
export async function extractChapterEvents(
  chapterId: string,
  projectId: string,
  events: Array<Omit<WriteChapterEventInput, 'chapterId' | 'projectId'>>,
  options: { source?: ExtractionSource; actor?: string } = {},
): Promise<ChapterEvent[]> {
  if (!isStoryGraphEnabled()) return [];
  const results: ChapterEvent[] = [];
  for (const ev of events) {
    const item = await writeChapterEvent({
      ...ev,
      chapterId,
      projectId,
      extractionSource: options.source ?? ev.extractionSource ?? 'manual',
      actor: options.actor ?? ev.actor,
    });
    if (item) results.push(item);
  }
  return results;
}

// ============================================================
// 4. 查询 / 召回事件（criteria B4 — queryEvents / listChapterEvents / getStoryGraph）
// ============================================================

export interface ListEventsFilter {
  chapterId?: string;
  projectId?: string;
  eventType?: ChapterEventType;
  limit?: number;
}

export async function listChapterEvents(filter: ListEventsFilter = {}): Promise<ChapterEvent[]> {
  if (!isStoryGraphEnabled()) return [];

  await ensureSchema();
  const db = getSqlite();
  const conditions: string[] = [];
  const params: Array<string | number> = [];
  if (filter.chapterId) {
    conditions.push('chapter_id = ?');
    params.push(filter.chapterId);
  }
  if (filter.projectId) {
    conditions.push('project_id = ?');
    params.push(filter.projectId);
  }
  if (filter.eventType) {
    conditions.push('event_type = ?');
    params.push(filter.eventType);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.max(1, Math.min(500, filter.limit ?? 200));
  const sql = `SELECT * FROM chapter_events ${where} ORDER BY sequence_index ASC, created_at DESC LIMIT ?`;
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as ChapterEventRow[];
  return rows.map(rowToEvent);
}

export async function getChapterEvent(id: string): Promise<ChapterEvent | null> {
  if (!isStoryGraphEnabled()) return null;
  await ensureSchema();
  const row = getSqlite().prepare('SELECT * FROM chapter_events WHERE id = ?').get(id) as ChapterEventRow | undefined;
  return row ? rowToEvent(row) : null;
}

export async function getStoryGraph(
  projectId: string,
  options: { limit?: number } = {},
): Promise<{
  events: ChapterEvent[];
  characters: CharacterRef[];
  relations: RelationEdge[];
  timeline: TimelineMeta[];
  enabled: boolean;
}> {
  if (!isStoryGraphEnabled()) {
    return { events: [], characters: [], relations: [], timeline: [], enabled: false };
  }
  const events = await listChapterEvents({ projectId, limit: options.limit });

  // 聚合角色（去重 by name）
  const charMap = new Map<string, CharacterRef>();
  events.forEach((ev) => {
    ev.characters.forEach((c) => {
      if (!charMap.has(c.name)) charMap.set(c.name, c);
    });
  });

  // 聚合关系
  const relations: RelationEdge[] = events.flatMap((ev) => ev.relations);

  // 时序节点（按 sequenceIndex 升序）
  const timeline: TimelineMeta[] = events
    .filter((ev) => ev.eventType === 'timeline' || ev.timeline.sequence !== undefined)
    .map((ev) => ({
      ...ev.timeline,
      sequence: ev.timeline.sequence ?? ev.sequenceIndex,
      note: ev.timeline.note ?? ev.title,
    }));

  return {
    events,
    characters: Array.from(charMap.values()),
    relations,
    timeline,
    enabled: true,
  };
}

// 召回（MVP — 按 projectId / chapterId 拉历史事件，简单时序排序）
export async function recallEvents(
  projectId: string,
  options: { chapterId?: string; limit?: number } = {},
): Promise<ChapterEvent[]> {
  if (!isStoryGraphEnabled()) return [];
  return listChapterEvents({ projectId, chapterId: options.chapterId, limit: options.limit });
}

// ============================================================
// 5. 删除事件（用户修正 / 重新抽取场景）
// ============================================================

export async function deleteChapterEvent(id: string): Promise<boolean> {
  if (!isStoryGraphEnabled()) return false;
  await ensureSchema();
  const result = getSqlite().prepare('DELETE FROM chapter_events WHERE id = ?').run(id);
  return Number(result.changes ?? 0) > 0;
}

export async function clearChapterEvents(
  filter: { chapterId?: string; projectId?: string } = {},
): Promise<{ deleted: number }> {
  if (!isStoryGraphEnabled()) return { deleted: 0 };
  await ensureSchema();
  const db = getSqlite();
  const conditions: string[] = [];
  const params: string[] = [];
  if (filter.chapterId) {
    conditions.push('chapter_id = ?');
    params.push(filter.chapterId);
  }
  if (filter.projectId) {
    conditions.push('project_id = ?');
    params.push(filter.projectId);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = db.prepare(`DELETE FROM chapter_events ${where}`).run(...params);
  return { deleted: Number(result.changes ?? 0) };
}

// ============================================================
// 6. 更新事件（修正 / 确认）
// ============================================================

export async function confirmChapterEvent(id: string, actor = 'local-owner'): Promise<ChapterEvent | null> {
  if (!isStoryGraphEnabled()) return null;
  await ensureSchema();
  const db = getSqlite();
  const now = Date.now();
  db.prepare(
    `UPDATE chapter_events SET extraction_source = 'user_confirmed', actor = ?, updated_at = ? WHERE id = ?`,
  ).run(actor, now, id);
  return getChapterEvent(id);
}
