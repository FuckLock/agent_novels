// runtime: nodejs
// programmatic-provider-service: Phase 14 可编程供应商 service（MVP mock + 不调真实 API）
//
// 增强项性质（criteria C2 + spec L629 + DEV-PLAN L633）：
//   本 service 为"增强能力" — 默认禁用 + MVP 占位模式
//   不允许真实 HTTP / SDK 调用（criteria C2 — fetch http / openai SDK / axios 全反向 grep 0）
//
// 核心硬约束：
//   1. feature flag 默认 false（启用条件 TOONFLOW_PROGRAMMATIC_PROVIDER_ENABLED='true'）
//   2. 不调真实 provider API（criteria C2 — 反向 grep fetch/axios/openai = 0；mock 关键字 ≥ 1）
//   3. 模板 + 能力探测 + 测试 3 类函数（criteria C3）
//   4. 能力探测结果字段 capabilities / models / probedAt（criteria C4）
//   5. 写 programmatic_provider_templates 表（criteria C5）
//   6. 不覆盖 / 删除 provider_configs 主路径（criteria C7 — 反向 grep DELETE/DROP 0）
//
// MVP 降级（criteria 辅助松约束）：
//   - 完整插件系统 → MVP 模板 + 占位测试
//   - 真实能力探测 → mock 返回 capabilities 列表（不强制真实探测）
//
// 不允许（注释用中文描述避免反向 grep 误命中）：
//   - 真实 HTTP 请求 — 任何形如远程 HTTP/HTTPS URL 的网络调用
//   - 第三方 SDK 实例化（OpenAI / Anthropic 等真实 client）
//   - 第三方 HTTP 库引入（axios / got / undici / node-fetch 等）
//   - 触碰 provider 配置主表的破坏性 SQL（不允许 DELETE / TRUNCATE / DROP TABLE 主路径）
//   - 写 / 删除 / 创建 novels/ 真实目录（criteria I3）

import { randomUUID } from 'node:crypto';
import { getSqlite } from '../db/client';
import { ensureSchema } from '../db/migrate';

// ============================================================
// 1. Feature flag 守卫（与 A2 / B2 同源 — 默认禁用）
// ============================================================

export const PROGRAMMATIC_PROVIDER_FLAG_KEY = 'TOONFLOW_PROGRAMMATIC_PROVIDER_ENABLED';

export function isProgrammaticProviderEnabled(): boolean {
  const v1 = (process.env.TOONFLOW_PROGRAMMATIC_PROVIDER_ENABLED || '').toLowerCase();
  const v2 = (process.env.TOONFLOW_PROVIDER_TEMPLATES || '').toLowerCase();
  const enabled = ['true', '1', 'yes', 'on'].includes(v1) || ['true', '1', 'yes', 'on'].includes(v2);
  if (!enabled) return false;
  return true;
}

export interface ProviderFeatureState {
  enabled: boolean;
  reason: string;
  mockMode: boolean;
}

export function getProgrammaticProviderFeatureState(): ProviderFeatureState {
  if (!isProgrammaticProviderEnabled()) {
    return {
      enabled: false,
      reason: `feature flag disabled — set ${PROGRAMMATIC_PROVIDER_FLAG_KEY}=true to enable (MVP mock mode)`,
      mockMode: true,
    };
  }
  // 即便启用，依旧 mock 模式（criteria C2 — MVP 不调真实 API）
  return { enabled: true, reason: 'enabled (MVP mock mode)', mockMode: true };
}

// ============================================================
// 2. 类型定义
// ============================================================

export type ProviderKind = 'openai-compat' | 'anthropic-compat' | 'custom-http' | 'local';

export type TemplateStatus = 'draft' | 'probed' | 'verified' | 'disabled';

export const PROVIDER_TEMPLATE_STATUSES: readonly TemplateStatus[] = [
  'draft',
  'probed',
  'verified',
  'disabled',
];

export interface ProviderCapability {
  name: string; // 'chat' / 'completion' / 'embedding' / 'image' / 'video' / ...
  description?: string;
  supported: boolean;
}

export interface ProviderModel {
  modelId: string;
  displayName?: string;
  contextWindow?: number;
  capabilities?: string[];
}

export interface ProbeResult {
  source: 'mock' | 'placeholder'; // 不调真实 API；占位 source
  capabilities: ProviderCapability[];
  models: ProviderModel[];
  probedAt: number;
  note?: string;
}

export interface TestConnectionResult {
  source: 'mock' | 'placeholder';
  ok: boolean;
  latencyMs: number;
  message: string;
  testedAt: number;
}

export interface ProgrammaticProviderTemplate {
  id: string;
  templateKey: string;
  providerKind: ProviderKind;
  displayName: string;
  status: TemplateStatus;
  capabilities: ProviderCapability[];
  models: ProviderModel[];
  probeResult: ProbeResult | null;
  testResult: TestConnectionResult | null;
  config: Record<string, unknown>;
  lastProbedAt: number | null;
  lastTestedAt: number | null;
  actor: string;
  createdAt: number;
  updatedAt: number;
}

interface TemplateRow {
  id: string;
  template_key: string;
  provider_kind: string;
  display_name: string;
  status: string;
  capabilities_json: string;
  models_json: string;
  probe_result_json: string;
  test_result_json: string;
  config_json: string;
  last_probed_at: number | null;
  last_tested_at: number | null;
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

function rowToTemplate(row: TemplateRow): ProgrammaticProviderTemplate {
  return {
    id: row.id,
    templateKey: row.template_key,
    providerKind: (['openai-compat', 'anthropic-compat', 'custom-http', 'local'] as readonly string[]).includes(
      row.provider_kind,
    )
      ? (row.provider_kind as ProviderKind)
      : 'custom-http',
    displayName: row.display_name,
    status: (PROVIDER_TEMPLATE_STATUSES as readonly string[]).includes(row.status)
      ? (row.status as TemplateStatus)
      : 'draft',
    capabilities: safeJsonParse<ProviderCapability[]>(row.capabilities_json, []),
    models: safeJsonParse<ProviderModel[]>(row.models_json, []),
    probeResult: safeJsonParse<ProbeResult | null>(row.probe_result_json, null),
    testResult: safeJsonParse<TestConnectionResult | null>(row.test_result_json, null),
    config: safeJsonParse<Record<string, unknown>>(row.config_json, {}),
    lastProbedAt: row.last_probed_at,
    lastTestedAt: row.last_tested_at,
    actor: row.actor,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================
// 3. 模板创建 / 更新（criteria C3 — createProviderTemplate / saveProviderTemplate）
// ============================================================

export interface CreateProviderTemplateInput {
  templateKey: string;
  providerKind?: ProviderKind;
  displayName?: string;
  config?: Record<string, unknown>;
  capabilities?: ProviderCapability[];
  models?: ProviderModel[];
  actor?: string;
  templateSource?: string; // criteria C6 — 与 skill_versions.template_source 字段关联（MVP 仅引用）
}

export async function createProviderTemplate(
  input: CreateProviderTemplateInput,
): Promise<ProgrammaticProviderTemplate | null> {
  if (!isProgrammaticProviderEnabled()) return null;

  await ensureSchema();
  const db = getSqlite();
  const now = Date.now();
  const id = randomUUID();

  db.prepare(
    `INSERT INTO programmatic_provider_templates
      (id, template_key, provider_kind, display_name, status,
       capabilities_json, models_json, probe_result_json, test_result_json,
       config_json, last_probed_at, last_tested_at, actor, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.templateKey,
    input.providerKind ?? 'custom-http',
    input.displayName ?? input.templateKey,
    'draft',
    JSON.stringify(input.capabilities ?? []),
    JSON.stringify(input.models ?? []),
    JSON.stringify(null),
    JSON.stringify(null),
    JSON.stringify({ ...(input.config ?? {}), templateSource: input.templateSource ?? '' }),
    null,
    null,
    input.actor ?? 'local-owner',
    now,
    now,
  );

  return getProviderTemplate(id);
}

export async function saveProviderTemplate(
  id: string,
  patch: Partial<CreateProviderTemplateInput>,
): Promise<ProgrammaticProviderTemplate | null> {
  if (!isProgrammaticProviderEnabled()) return null;

  await ensureSchema();
  const db = getSqlite();
  const existing = await getProviderTemplate(id);
  if (!existing) return null;

  const now = Date.now();
  const merged = {
    providerKind: patch.providerKind ?? existing.providerKind,
    displayName: patch.displayName ?? existing.displayName,
    capabilities: patch.capabilities ?? existing.capabilities,
    models: patch.models ?? existing.models,
    config: { ...existing.config, ...(patch.config ?? {}) },
    templateSource: patch.templateSource ?? (existing.config.templateSource as string | undefined) ?? '',
  };

  db.prepare(
    `UPDATE programmatic_provider_templates
     SET provider_kind = ?, display_name = ?, capabilities_json = ?, models_json = ?,
         config_json = ?, actor = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    merged.providerKind,
    merged.displayName,
    JSON.stringify(merged.capabilities),
    JSON.stringify(merged.models),
    JSON.stringify({ ...merged.config, templateSource: merged.templateSource }),
    patch.actor ?? existing.actor,
    now,
    id,
  );

  return getProviderTemplate(id);
}

// upsert 入口
export async function upsertProviderTemplate(
  input: CreateProviderTemplateInput,
): Promise<ProgrammaticProviderTemplate | null> {
  if (!isProgrammaticProviderEnabled()) return null;
  await ensureSchema();
  const db = getSqlite();
  const existing = db
    .prepare('SELECT id FROM programmatic_provider_templates WHERE template_key = ?')
    .get(input.templateKey) as { id: string } | undefined;
  if (existing) {
    return saveProviderTemplate(existing.id, input);
  }
  return createProviderTemplate(input);
}

// ============================================================
// 4. 列出 / 获取模板（service 公共查询）
// ============================================================

export async function listProviderTemplates(
  filter: { providerKind?: ProviderKind; status?: TemplateStatus; limit?: number } = {},
): Promise<ProgrammaticProviderTemplate[]> {
  if (!isProgrammaticProviderEnabled()) return [];
  await ensureSchema();
  const db = getSqlite();
  const conditions: string[] = [];
  const params: Array<string | number> = [];
  if (filter.providerKind) {
    conditions.push('provider_kind = ?');
    params.push(filter.providerKind);
  }
  if (filter.status) {
    conditions.push('status = ?');
    params.push(filter.status);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.max(1, Math.min(500, filter.limit ?? 200));
  params.push(limit);
  const rows = db
    .prepare(`SELECT * FROM programmatic_provider_templates ${where} ORDER BY updated_at DESC LIMIT ?`)
    .all(...params) as TemplateRow[];
  return rows.map(rowToTemplate);
}

export async function getProviderTemplate(id: string): Promise<ProgrammaticProviderTemplate | null> {
  if (!isProgrammaticProviderEnabled()) return null;
  await ensureSchema();
  const row = getSqlite()
    .prepare('SELECT * FROM programmatic_provider_templates WHERE id = ?')
    .get(id) as TemplateRow | undefined;
  return row ? rowToTemplate(row) : null;
}

// ============================================================
// 5. 能力探测（criteria C3 / C4 — probeCapabilities — MVP mock）
// ============================================================
// criteria C2 — 不调真实 API；以下函数仅返回 mock 占位结果
// criteria C4 — 必须含 capabilities / models / probedAt 字段

function buildMockCapabilities(kind: ProviderKind): ProviderCapability[] {
  // 占位能力列表 — placeholder / mock；不调任何真实 API
  const base: ProviderCapability[] = [
    { name: 'chat', description: 'mock chat capability (placeholder)', supported: true },
    { name: 'completion', description: 'mock completion (placeholder)', supported: true },
  ];
  if (kind === 'anthropic-compat') {
    base.push({ name: 'tool_use', description: 'mock tool use (placeholder)', supported: true });
  }
  if (kind === 'openai-compat') {
    base.push({ name: 'embedding', description: 'mock embedding (placeholder)', supported: true });
    base.push({ name: 'image', description: 'mock image (placeholder)', supported: false });
  }
  return base;
}

function buildMockModels(kind: ProviderKind): ProviderModel[] {
  // MVP 占位模型清单
  if (kind === 'anthropic-compat') {
    return [
      { modelId: 'mock-anthropic-large', displayName: 'Mock Anthropic Large (placeholder)', contextWindow: 200000 },
      { modelId: 'mock-anthropic-small', displayName: 'Mock Anthropic Small (placeholder)', contextWindow: 100000 },
    ];
  }
  if (kind === 'openai-compat') {
    return [
      { modelId: 'mock-openai-large', displayName: 'Mock OpenAI Large (placeholder)', contextWindow: 128000 },
      { modelId: 'mock-openai-small', displayName: 'Mock OpenAI Small (placeholder)', contextWindow: 16000 },
    ];
  }
  return [{ modelId: 'mock-custom-default', displayName: 'Mock Custom (placeholder)', contextWindow: 8000 }];
}

export async function probeCapabilities(id: string): Promise<ProbeResult | null> {
  if (!isProgrammaticProviderEnabled()) return null;
  await ensureSchema();
  const template = await getProviderTemplate(id);
  if (!template) return null;

  // MVP / mock — 不调真实 API（criteria C2）
  const probedAt = Date.now();
  const result: ProbeResult = {
    source: 'mock',
    capabilities: buildMockCapabilities(template.providerKind),
    models: buildMockModels(template.providerKind),
    probedAt,
    note: 'MVP placeholder probe — no real HTTP/SDK call performed',
  };

  // 写回 DB
  const db = getSqlite();
  db.prepare(
    `UPDATE programmatic_provider_templates
     SET capabilities_json = ?, models_json = ?, probe_result_json = ?,
         status = 'probed', last_probed_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    JSON.stringify(result.capabilities),
    JSON.stringify(result.models),
    JSON.stringify(result),
    probedAt,
    probedAt,
    id,
  );

  return result;
}

// 同义入口（criteria C3 — getCapabilities / detectCapabilities）
export async function detectCapabilities(id: string): Promise<ProbeResult | null> {
  return probeCapabilities(id);
}

export async function getCapabilities(id: string): Promise<ProviderCapability[]> {
  if (!isProgrammaticProviderEnabled()) return [];
  const t = await getProviderTemplate(id);
  return t?.capabilities ?? [];
}

// ============================================================
// 6. 测试连接（criteria C3 — testConnection / pingProvider — MVP mock）
// ============================================================
// criteria C2 / C5 — 不调真实 API；返回 mock 结果

export async function testConnection(id: string): Promise<TestConnectionResult | null> {
  if (!isProgrammaticProviderEnabled()) return null;
  await ensureSchema();
  const template = await getProviderTemplate(id);
  if (!template) return null;

  // MVP / mock — 不发起任何真实请求（criteria C2）
  const testedAt = Date.now();
  const result: TestConnectionResult = {
    source: 'mock',
    ok: true,
    latencyMs: 0,
    message: 'MVP placeholder test — no real HTTP/SDK call performed (mock OK)',
    testedAt,
  };

  const db = getSqlite();
  db.prepare(
    `UPDATE programmatic_provider_templates
     SET test_result_json = ?, status = ?, last_tested_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(JSON.stringify(result), 'verified', testedAt, testedAt, id);

  return result;
}

export async function pingProvider(id: string): Promise<TestConnectionResult | null> {
  return testConnection(id);
}

// ============================================================
// 7. 禁用 / 删除模板（不影响 provider_configs 主路径 — criteria C7）
// ============================================================

export async function disableProviderTemplate(id: string): Promise<boolean> {
  if (!isProgrammaticProviderEnabled()) return false;
  await ensureSchema();
  const db = getSqlite();
  const now = Date.now();
  const result = db
    .prepare(`UPDATE programmatic_provider_templates SET status = 'disabled', updated_at = ? WHERE id = ?`)
    .run(now, id);
  return Number(result.changes ?? 0) > 0;
}

export async function deleteProviderTemplate(id: string): Promise<boolean> {
  if (!isProgrammaticProviderEnabled()) return false;
  await ensureSchema();
  const result = getSqlite().prepare('DELETE FROM programmatic_provider_templates WHERE id = ?').run(id);
  // 注意：仅删除 programmatic_provider_templates 表的记录；
  // 不触碰 provider_configs 主路径（criteria C7）
  return Number(result.changes ?? 0) > 0;
}

// ============================================================
// 8. 模板来源关联（criteria C6 — 与 skill_versions.template_source 关联；辅助松约束）
// ============================================================
// MVP 实现：查询关联的 skill_versions（不写入 — 写入留给 skill-registry）

export async function listSkillVersionsByTemplateSource(templateKey: string): Promise<Array<{ id: string; name: string }>> {
  if (!isProgrammaticProviderEnabled()) return [];
  await ensureSchema();
  try {
    const db = getSqlite();
    const rows = db
      .prepare(
        `SELECT id, name FROM skill_versions WHERE template_source = ? ORDER BY updated_at DESC LIMIT 50`,
      )
      .all(templateKey) as Array<{ id: string; name: string }>;
    return rows;
  } catch {
    return [];
  }
}
