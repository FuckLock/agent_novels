import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ensureSchema } from '../db/migrate';
import { getSqlite, runInTransaction } from '../db/client';
import { decryptSecret, encryptSecret } from '../security/secret-store';
import type { ModelConfig } from '@/app/lib/novels';

type ModelType = 'language' | 'video' | 'image';
type ModelConfigMap = Record<ModelType, ModelConfig[]>;

const SECRET_PLACEHOLDER = '__TOONFLOW_SECRET_SET__';
const MODEL_TYPES: ModelType[] = ['language', 'video', 'image'];
const ModelConfigSchema = z.object({
  modelId: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9_.-]+$/, '模型 ID 格式错误'),
  name: z.string().trim().min(1).max(120),
  type: z.enum(MODEL_TYPES),
  enabled: z.boolean().default(true),
  isDefault: z.boolean().optional(),
  mode: z.string().optional(),
  provider: z.string().optional(),
  adapter: z.enum(['openai-images', 'grsai-task-polling', 'custom-http']).optional(),
  api: z.record(z.string(), z.unknown()).default({}),
  defaultParams: z.record(z.string(), z.unknown()).optional(),
  capabilities: z.record(z.string(), z.unknown()).optional(),
  requestTemplate: z.record(z.string(), z.unknown()).optional(),
});

interface ModelRow {
  id: string;
  model_id: string;
  type: ModelType;
  name: string;
  mode: string | null;
  adapter: ModelConfig['adapter'] | null;
  enabled: number;
  is_default: number;
  api_json: string;
  default_params_json: string;
  capabilities_json: string;
  request_template_json: string;
  provider_name: string;
  secret_ciphertext: string | null;
}

interface ProviderRow {
  id: string;
  secret_ref_id: string | null;
}

function hashSecret(secret: string) {
  return createHash('sha256').update(secret).digest('hex');
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function getProviderName(config: z.infer<typeof ModelConfigSchema>) {
  return (config.provider || config.adapter || `${config.type}-provider`).trim();
}

function getProviderBaseUrl(config: z.infer<typeof ModelConfigSchema>) {
  const endpoint = config.api.baseUrl || config.api.submitUrl || config.api.pollUrl || '';
  return typeof endpoint === 'string' ? endpoint.trim() : '';
}

function getSecretInput(api: Record<string, unknown>) {
  const value = typeof api.apiKey === 'string' ? api.apiKey.trim() : '';
  if (!value || value === SECRET_PLACEHOLDER) return '';
  return value;
}

function secretPreview(secret: string) {
  if (!secret) return '';
  if (secret.length <= 8) return '*'.repeat(secret.length);
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

function apiWithoutSecret(api: Record<string, unknown>) {
  const clean = { ...api };
  delete clean.apiKey;
  return clean;
}

function assertType(type: string): asserts type is ModelType {
  if (!MODEL_TYPES.includes(type as ModelType)) {
    throw new Error('模型类型不支持');
  }
}

function emptyConfigMap(): ModelConfigMap {
  return { language: [], video: [], image: [] };
}

function mapRow(row: ModelRow, includeSecrets: boolean): ModelConfig {
  const api = parseJsonObject(row.api_json) as ModelConfig['api'];
  const secretValue = includeSecrets ? decryptSecret(row.secret_ciphertext || '') : row.secret_ciphertext || '';
  if (secretValue) {
    api.apiKey = includeSecrets ? secretValue : SECRET_PLACEHOLDER;
  }

  return {
    modelId: row.model_id,
    name: row.name,
    type: row.type,
    mode: row.mode || undefined,
    enabled: Boolean(row.enabled),
    isDefault: Boolean(row.is_default),
    authMode: row.type === 'language' ? 'api' : undefined,
    provider: row.provider_name,
    adapter: row.adapter || undefined,
    api,
    defaultParams: parseJsonObject(row.default_params_json),
    capabilities: parseJsonObject(row.capabilities_json) as ModelConfig['capabilities'],
    requestTemplate: parseJsonObject(row.request_template_json),
  };
}

async function readModels(includeSecrets: boolean) {
  await ensureSchema();
  const rows = getSqlite()
    .prepare(
      `SELECT
        m.*,
        p.name AS provider_name,
        s.secret_ciphertext AS secret_ciphertext
       FROM model_configs m
       JOIN provider_configs p ON p.id = m.provider_id
       LEFT JOIN secret_refs s ON s.id = p.secret_ref_id
       ORDER BY m.is_default DESC, m.name ASC, m.model_id ASC`,
    )
    .all() as ModelRow[];

  const configs = emptyConfigMap();
  for (const row of rows) configs[row.type].push(mapRow(row, includeSecrets));
  return configs;
}

function upsertSecretRef(provider: string, existingSecretRefId: string | null, secret: string) {
  if (!secret) return existingSecretRefId;
  const now = Date.now();
  const digest = hashSecret(secret);
  const preview = secretPreview(secret);
  const id = existingSecretRefId || randomUUID();

  if (existingSecretRefId) {
    getSqlite()
      .prepare(
        `UPDATE secret_refs
         SET provider = ?, scope = 'model_api_key', label = ?, secret_preview = ?,
             secret_digest = ?, secret_ciphertext = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(provider, `${provider} API Key`, preview, digest, encryptSecret(secret), now, id);
    return id;
  }

  getSqlite()
    .prepare(
      `INSERT INTO secret_refs
        (id, provider, scope, label, secret_preview, secret_digest, secret_ciphertext, created_at, updated_at)
       VALUES (?, ?, 'model_api_key', ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, provider, `${provider} API Key`, preview, digest, encryptSecret(secret), now, now);
  return id;
}

function upsertProvider(config: z.infer<typeof ModelConfigSchema>, existingProviderId?: string) {
  const providerName = getProviderName(config);
  const baseUrl = getProviderBaseUrl(config);
  const secret = getSecretInput(config.api);
  const db = getSqlite();
  const existing = (existingProviderId
    ? db.prepare('SELECT id, secret_ref_id FROM provider_configs WHERE id = ?').get(existingProviderId)
    : db.prepare('SELECT id, secret_ref_id FROM provider_configs WHERE name = ? AND type = ? AND base_url = ?').get(providerName, config.type, baseUrl)) as ProviderRow | undefined;
  const secretRefId = upsertSecretRef(providerName, existing?.secret_ref_id || null, secret);
  const now = Date.now();

  if (existing) {
    db.prepare(
      `UPDATE provider_configs
       SET name = ?, type = ?, base_url = ?, enabled = ?, secret_ref_id = ?, updated_at = ?
       WHERE id = ?`,
    ).run(providerName, config.type, baseUrl, config.enabled ? 1 : 0, secretRefId, now, existing.id);
    return existing.id;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO provider_configs
      (id, name, type, base_url, enabled, status, secret_ref_id, capabilities_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'capability_unknown', ?, '{}', ?, ?)`,
  ).run(id, providerName, config.type, baseUrl, config.enabled ? 1 : 0, secretRefId, now, now);
  return id;
}

export async function getModelConfigs() {
  return readModels(false);
}

export async function getModelConfigsForServer() {
  return readModels(true);
}

export async function saveModelConfig(type: string, id: string, rawConfig: unknown) {
  await ensureSchema();
  assertType(type);
  const config = ModelConfigSchema.parse(rawConfig);
  if (config.type !== type) throw new Error('模型类型不匹配');
  if (config.modelId !== id) throw new Error('模型 ID 不匹配');

  return runInTransaction((db) => {
    const duplicate = db
      .prepare('SELECT type FROM model_configs WHERE model_id = ? AND type <> ? LIMIT 1')
      .get(id, type) as { type: string } | undefined;
    if (duplicate) throw new Error(`模型 ID 已被 ${duplicate.type} 模型占用`);

    const existing = db
      .prepare('SELECT id, provider_id FROM model_configs WHERE type = ? AND model_id = ? LIMIT 1')
      .get(type, id) as { id: string; provider_id: string } | undefined;
    const providerId = upsertProvider(config, existing?.provider_id);
    const now = Date.now();
    const values = [
      providerId,
      config.modelId,
      config.type,
      config.name,
      config.mode || null,
      config.adapter || null,
      config.enabled ? 1 : 0,
      config.isDefault ? 1 : 0,
      JSON.stringify(apiWithoutSecret(config.api)),
      JSON.stringify(config.defaultParams || {}),
      JSON.stringify(config.capabilities || {}),
      JSON.stringify(config.requestTemplate || {}),
      now,
    ];

    if (existing) {
      db.prepare(
        `UPDATE model_configs
         SET provider_id = ?, model_id = ?, type = ?, name = ?, mode = ?, adapter = ?,
             enabled = ?, is_default = ?, api_json = ?, default_params_json = ?,
             capabilities_json = ?, request_template_json = ?, updated_at = ?
         WHERE id = ?`,
      ).run(...values, existing.id);
      return { success: true };
    }

    db.prepare(
      `INSERT INTO model_configs
        (id, provider_id, model_id, type, name, mode, adapter, enabled, is_default,
         api_json, default_params_json, capabilities_json, request_template_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), ...values, now);
    return { success: true };
  });
}

export async function deleteModelConfig(type: string, id: string) {
  await ensureSchema();
  assertType(type);
  getSqlite().prepare('DELETE FROM model_configs WHERE type = ? AND model_id = ?').run(type, id);
}
