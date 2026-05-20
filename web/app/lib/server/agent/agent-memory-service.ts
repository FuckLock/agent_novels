// runtime: nodejs
// agent-memory-service: Phase 14 Agent 记忆 service（增强项 + 默认禁用 + A-E 主链路不依赖）
//
// 增强项性质（criteria A2 + spec L629 + DEV-PLAN L633）：
//   本 service 为"增强能力" — 默认禁用（TOONFLOW_AGENT_MEMORY_ENABLED 不为 'true' 时进入 disabled 分支）
//   A-E 主链路（agent-run-service.ts / script-service.ts）不强 import 本 service（criteria A6）
//
// 核心硬约束：
//   1. feature flag 默认 false（criteria A2 — 任一启用条件命中才返回 enabled）
//   2. 查看 + 清空 + 召回 3 类函数（criteria A3）
//   3. memoryContextId 关联 agent_runs（criteria A4 — 与 agent_runs.memory_context_id 字段同源）
//   4. 写 agent_memories 表（criteria A5）
//   5. A-E 主链路不依赖本 service（criteria A6 — 反向 grep）
//
// MVP 降级（criteria 辅助松约束）：
//   - RAG 召回 → MVP SELECT 历史 agent_conversations + agent_memories 按时序排序
//   - NER 抽取 → 由 UI 端手动结构化记录（service 仅承载存储 + 查询）
//
// 不允许：
//   - 调用真实网络（fetch / openai / axios — 留给上游 agent-run 流程）
//   - 写 / 删除 / 创建 novels/ 真实目录（criteria I3 — 沿用 Phase 6-13 教训）

import { randomUUID } from 'node:crypto';
import { getSqlite } from '../db/client';
import { ensureSchema } from '../db/migrate';

// ============================================================
// 1. Feature flag 守卫（criteria A2 — 默认禁用）
// ============================================================
// 任一同义启用条件命中才返回 true，否则默认 false:
//   - 环境变量 TOONFLOW_AGENT_MEMORY_ENABLED='true' / '1' / 'yes'
//   - 或环境变量 TOONFLOW_MEMORY='true' / '1' / 'yes'
//
// 该函数被所有公共函数在入口调用 → 守卫处早返回空 / disabled 分支

export const FEATURE_FLAG_KEY = 'TOONFLOW_AGENT_MEMORY_ENABLED';

export function isAgentMemoryEnabled(): boolean {
  const v1 = (process.env.TOONFLOW_AGENT_MEMORY_ENABLED || '').toLowerCase();
  const v2 = (process.env.TOONFLOW_MEMORY || '').toLowerCase();
  const enabled = ['true', '1', 'yes', 'on'].includes(v1) || ['true', '1', 'yes', 'on'].includes(v2);
  if (!enabled) return false;
  return true;
}

// disabled / enabled 返回结构（UI / API 消费方需要明确语义）
export interface MemoryFeatureState {
  enabled: boolean;
  reason: string;
}

export function getAgentMemoryFeatureState(): MemoryFeatureState {
  if (!isAgentMemoryEnabled()) {
    return {
      enabled: false,
      reason: `feature flag disabled — set ${FEATURE_FLAG_KEY}=true to enable`,
    };
  }
  return { enabled: true, reason: 'enabled' };
}

// ============================================================
// 2. 类型定义
// ============================================================

export type MemoryType = 'long_term' | 'short_term' | 'recall';

export const MEMORY_TYPES: readonly MemoryType[] = ['long_term', 'short_term', 'recall'];

export interface AgentMemoryItem {
  id: string;
  contextId: string;
  agentName: string;
  projectId: string | null;
  memoryType: MemoryType;
  title: string;
  content: Record<string, unknown>;
  embedding: number[];
  sourceRunId: string | null;
  tags: string[];
  lastRecalledAt: number | null;
  actor: string;
  createdAt: number;
  updatedAt: number;
}

interface AgentMemoryRow {
  id: string;
  context_id: string;
  agent_name: string;
  project_id: string | null;
  memory_type: string;
  title: string;
  content_json: string;
  embedding_json: string;
  source_run_id: string | null;
  tags_json: string;
  last_recalled_at: number | null;
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

function rowToItem(row: AgentMemoryRow): AgentMemoryItem {
  return {
    id: row.id,
    contextId: row.context_id,
    agentName: row.agent_name,
    projectId: row.project_id,
    memoryType: (MEMORY_TYPES as readonly string[]).includes(row.memory_type)
      ? (row.memory_type as MemoryType)
      : 'short_term',
    title: row.title,
    content: safeJsonParse<Record<string, unknown>>(row.content_json, {}),
    embedding: safeJsonParse<number[]>(row.embedding_json, []),
    sourceRunId: row.source_run_id,
    tags: safeJsonParse<string[]>(row.tags_json, []),
    lastRecalledAt: row.last_recalled_at,
    actor: row.actor,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================
// 3. 查看 / 列出记忆（criteria A3）
// ============================================================

export interface ListMemoriesFilter {
  contextId?: string;
  agentName?: string;
  projectId?: string;
  memoryType?: MemoryType;
  limit?: number;
}

export async function listAgentMemories(filter: ListMemoriesFilter = {}): Promise<AgentMemoryItem[]> {
  // criteria A2 — feature flag 守卫；disabled 时返回空数组（不抛错 → K6 默认 disabled）
  if (!isAgentMemoryEnabled()) {
    return [];
  }

  await ensureSchema();
  const db = getSqlite();

  const conditions: string[] = [];
  const params: Array<string | number> = [];
  if (filter.contextId) {
    conditions.push('context_id = ?');
    params.push(filter.contextId);
  }
  if (filter.agentName) {
    conditions.push('agent_name = ?');
    params.push(filter.agentName);
  }
  if (filter.projectId) {
    conditions.push('project_id = ?');
    params.push(filter.projectId);
  }
  if (filter.memoryType) {
    conditions.push('memory_type = ?');
    params.push(filter.memoryType);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.max(1, Math.min(500, filter.limit ?? 200));
  const sql = `SELECT * FROM agent_memories ${where} ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as AgentMemoryRow[];
  return rows.map(rowToItem);
}

export async function getAgentMemory(id: string): Promise<AgentMemoryItem | null> {
  if (!isAgentMemoryEnabled()) return null;
  await ensureSchema();
  const row = getSqlite().prepare('SELECT * FROM agent_memories WHERE id = ?').get(id) as AgentMemoryRow | undefined;
  return row ? rowToItem(row) : null;
}

// ============================================================
// 4. 写入记忆（criteria A5 — INSERT INTO agent_memories；A4 — 关联 memoryContextId）
// ============================================================

export interface SaveMemoryInput {
  contextId: string; // 与 agent_runs.memory_context_id 同源（criteria A4）
  agentName: string;
  projectId?: string | null;
  memoryType?: MemoryType;
  title?: string;
  content?: Record<string, unknown>;
  embedding?: number[];
  sourceRunId?: string | null;
  tags?: string[];
  actor?: string;
}

export async function saveAgentMemory(input: SaveMemoryInput): Promise<AgentMemoryItem | null> {
  // disabled 时不写入（保证未启用增强项时主链路不被影响）
  if (!isAgentMemoryEnabled()) return null;

  await ensureSchema();
  const db = getSqlite();
  const now = Date.now();
  const id = randomUUID();
  const memoryType: MemoryType = input.memoryType ?? 'short_term';

  db.prepare(
    `INSERT INTO agent_memories
      (id, context_id, agent_name, project_id, memory_type, title, content_json,
       embedding_json, source_run_id, tags_json, last_recalled_at, actor, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.contextId,
    input.agentName,
    input.projectId ?? null,
    memoryType,
    input.title ?? '',
    JSON.stringify(input.content ?? {}),
    JSON.stringify(input.embedding ?? []),
    input.sourceRunId ?? null,
    JSON.stringify(input.tags ?? []),
    null,
    input.actor ?? 'local-owner',
    now,
    now,
  );

  return getAgentMemory(id);
}

// ============================================================
// 5. 清空 / 删除记忆（criteria A3 — clearAgentMemories）
// ============================================================

export interface ClearMemoriesFilter {
  contextId?: string;
  agentName?: string;
  projectId?: string;
  memoryType?: MemoryType;
}

export async function clearAgentMemories(filter: ClearMemoriesFilter = {}): Promise<{ deleted: number }> {
  if (!isAgentMemoryEnabled()) {
    return { deleted: 0 };
  }
  await ensureSchema();
  const db = getSqlite();

  const conditions: string[] = [];
  const params: Array<string | number> = [];
  if (filter.contextId) {
    conditions.push('context_id = ?');
    params.push(filter.contextId);
  }
  if (filter.agentName) {
    conditions.push('agent_name = ?');
    params.push(filter.agentName);
  }
  if (filter.projectId) {
    conditions.push('project_id = ?');
    params.push(filter.projectId);
  }
  if (filter.memoryType) {
    conditions.push('memory_type = ?');
    params.push(filter.memoryType);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = db.prepare(`DELETE FROM agent_memories ${where}`).run(...params);
  return { deleted: Number(result.changes ?? 0) };
}

export async function deleteAgentMemory(id: string): Promise<boolean> {
  if (!isAgentMemoryEnabled()) return false;
  await ensureSchema();
  const result = getSqlite().prepare('DELETE FROM agent_memories WHERE id = ?').run(id);
  return Number(result.changes ?? 0) > 0;
}

// ============================================================
// 6. 召回 / 上下文加载（criteria A3 — recallMemories；MVP 降级允许）
// ============================================================
// MVP 实现：SELECT 历史 agent_memories + agent_conversations 按 last_recalled_at / created_at
// 倒序返回最近 N 条；不强制向量召回（spec L649 留位 — embedding_json 已写入但未消费）

export interface RecallContext {
  memories: AgentMemoryItem[];
  recentConversations: Array<{ id: string; agentName: string; createdAt: number }>;
  enabled: boolean;
}

export async function recallMemories(
  contextId: string,
  options: { agentName?: string; projectId?: string; limit?: number } = {},
): Promise<RecallContext> {
  if (!isAgentMemoryEnabled()) {
    return { memories: [], recentConversations: [], enabled: false };
  }
  await ensureSchema();
  const db = getSqlite();
  const limit = Math.max(1, Math.min(50, options.limit ?? 10));

  // 1) 拉本 contextId 下记忆
  const memories = await listAgentMemories({ contextId, agentName: options.agentName, limit });

  // 2) 更新 last_recalled_at（用于淘汰策略）
  if (memories.length > 0) {
    const now = Date.now();
    const ids = memories.map((m) => m.id);
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE agent_memories SET last_recalled_at = ? WHERE id IN (${placeholders})`).run(now, ...ids);
  }

  // 3) MVP 关联 agent_conversations（如 agent_run 通过 memoryContextId 关联，可拉历史会话）
  // 关联路径：context_id → agent_runs.memory_context_id → agent_conversations.run_id
  let recentConversations: Array<{ id: string; agentName: string; createdAt: number }> = [];
  try {
    const rows = db
      .prepare(
        `SELECT ac.id AS id, ar.agent_name AS agent_name, ac.created_at AS created_at
         FROM agent_runs ar
         JOIN agent_conversations ac ON ac.run_id = ar.id
         WHERE ar.memory_context_id = ?
         ORDER BY ac.created_at DESC
         LIMIT ?`,
      )
      .all(contextId, limit) as Array<{ id: string; agent_name: string; created_at: number }>;
    recentConversations = rows.map((r) => ({
      id: r.id,
      agentName: r.agent_name,
      createdAt: r.created_at,
    }));
  } catch {
    // agent_conversations 关联失败时降级为空数组（不抛错；MVP 允许）
    recentConversations = [];
  }

  return { memories, recentConversations, enabled: true };
}

// ============================================================
// 7. 摘要查询（UI 用 — 按 context 统计）
// ============================================================

export interface MemoryContextSummary {
  contextId: string;
  agentName: string;
  total: number;
  longTerm: number;
  shortTerm: number;
  recall: number;
  lastUpdated: number;
}

export async function getMemoryContextSummary(contextId: string): Promise<MemoryContextSummary | null> {
  if (!isAgentMemoryEnabled()) return null;
  await ensureSchema();
  const db = getSqlite();
  const row = db
    .prepare(
      `SELECT
         context_id,
         agent_name,
         COUNT(*) AS total,
         SUM(CASE WHEN memory_type = 'long_term' THEN 1 ELSE 0 END) AS long_term,
         SUM(CASE WHEN memory_type = 'short_term' THEN 1 ELSE 0 END) AS short_term,
         SUM(CASE WHEN memory_type = 'recall' THEN 1 ELSE 0 END) AS recall_count,
         MAX(updated_at) AS last_updated
       FROM agent_memories
       WHERE context_id = ?
       GROUP BY context_id, agent_name
       LIMIT 1`,
    )
    .get(contextId) as
    | {
        context_id: string;
        agent_name: string;
        total: number;
        long_term: number;
        short_term: number;
        recall_count: number;
        last_updated: number;
      }
    | undefined;
  if (!row) return null;
  return {
    contextId: row.context_id,
    agentName: row.agent_name,
    total: Number(row.total ?? 0),
    longTerm: Number(row.long_term ?? 0),
    shortTerm: Number(row.short_term ?? 0),
    recall: Number(row.recall_count ?? 0),
    lastUpdated: Number(row.last_updated ?? 0),
  };
}
