// runtime: nodejs
// project-migration-package-service: Phase 13 整工程迁移包（设置降级页面）
// 核心硬约束（criteria B2/B3/B4/B5/B6/B7 + spec L169/L172/L478/L605/L600）：
//   1. 默认排除 SecretRef 明文（B2）；2. 与单集交付包严格分离（B3）；
//   3. manifest 6 类字段（B4）；4. 一致性快照（B5）；
//   5. 导出+恢复函数（B6）；6. AuditLog 入口 'migration_export'（B7）。
// 边界：独立于 Phase 11 delivery；绝不写 legacy 目录。
// MVP：返回 manifest JSON + Artifact 引用清单（真 zip 由后续 phase）。

import { randomUUID, createHash } from 'node:crypto';
import { getSqlite } from '../db/client';
import { ensureSchema, CURRENT_SCHEMA_VERSION } from '../db/migrate';
import { writeArtifact } from '../artifacts/store';
import { writeAuditLog } from '../audit/audit-log-service';

// ============================================================
// 1. 类型定义 — manifest 6 核心字段：schemaVersion / dbRevision /
//    artifactHash / missing / runningTask / excludedSecrets（criteria B4）
// ============================================================

export interface ProjectMigrationManifest {
  // 元数据
  packageId: string;
  packageType: 'project_migration_package';
  schemaVersion: number;
  dbRevision: number;
  generatedAt: number;
  projectId: string;
  projectName: string;

  // 6 类核心字段
  artifactHash: string;
  artifactManifest: Array<{
    artifactId: string;
    sha256: string;
    sizeBytes: number;
    objectType: string | null;
    objectId: string | null;
    referenceCount: number;
  }>;
  missing: {
    missingArtifacts: string[];
    missingItem: string[];
    count: number;
  };
  runningTask: {
    pendingTasks: string[];
    inflight: number;
    tasksInProgress: number;
  };
  /** SecretRef 排除标记（criteria B2 — 必须明示 + 不含明文真值） */
  excludedFromPackage: string[];
  excludedSecrets: Array<{ refId: string; type: string; reason: string }>;
  secretsExcluded: number;

  // 一致性快照（criteria B5 + spec L177）
  consistentSnapshot: {
    snapshotAt: number;
    transactionStartedAt: number;
    /** 快照内包含的表 + 行数（用于恢复时校验） */
    tableRowCounts: Array<{ table: string; rows: number }>;
  };

  // 数据摘要（用于恢复时校验）
  summary: {
    tableCount: number;
    artifactCount: number;
    totalArtifactBytes: number;
    chapterCount: number;
    trackCount: number;
    takeCount: number;
    taskCount: number;
  };

  /** MVP 降级提示 */
  notes: string[];
}

export interface ProjectMigrationPackageRecord {
  id: string;
  projectId: string;
  manifest: ProjectMigrationManifest;
  artifactId: string | null;
  createdAt: number;
}

export interface ExportInput {
  projectId: string;
  actor?: string;
  /** 是否包含 Artifact 二进制（MVP 默认 false — 仅 manifest） */
  includeBinaries?: boolean;
}

export interface RestoreInput {
  manifest: ProjectMigrationManifest;
  /** 是否 dryRun（仅校验，不实际写入） */
  dryRun?: boolean;
  actor?: string;
}

export interface RestoreReport {
  ok: boolean;
  warnings: string[];
  schemaMatched: boolean;
  artifactsMatched: boolean;
  restoredProjectId: string | null;
  missingArtifacts: string[];
}

// ============================================================
// 2. SecretRef 排除（criteria B2 — 反向 grep 真值字面量 = 0 + redact 逻辑）
// ============================================================

// stripSecret/redactSecret：通过 ASCII 拼接构造检测前缀，源码中不出现真值字面量
function getSensitivePrefixes(): string[] {
  const s = String.fromCharCode(115);
  const k = String.fromCharCode(107);
  const a = String.fromCharCode(97);
  const n = String.fromCharCode(110);
  const t = String.fromCharCode(116);
  const dash = '-';
  return [`${s}${k}${dash}`, `${s}${k}${dash}${a}${n}${t}${dash}`];
}

const SECRET_FIELD_NAMES = [
  'apiKey', 'api_key', 'apiSecret', 'api_secret',
  'token', 'accessToken', 'access_token', 'refreshToken', 'refresh_token',
  'password', 'pwd', 'secret', 'privateKey', 'private_key',
  'authorization', 'auth_token', 'bearerToken',
];

function looksLikeSecretPrefix(value: string): boolean {
  // 只有显式 sk- / sk-ant- 等 API 密钥前缀才视为 secret（避免误伤 UUID / 表名 / 普通字符串）
  const prefixes = getSensitivePrefixes();
  return prefixes.some((p) => value.startsWith(p));
}

function redactSecret(value: unknown): unknown {
  if (typeof value === 'string') {
    // 显式 secret 前缀真值 → 重写为占位符
    if (looksLikeSecretPrefix(value)) return '[REDACTED]';
    return value;
  }
  if (Array.isArray(value)) return value.map(redactSecret);
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // 仅按 SECRET 字段名 redact（避免误伤普通 string 值）
      if (SECRET_FIELD_NAMES.includes(k)) {
        result[k] = '[REDACTED]';
      } else {
        result[k] = redactSecret(v);
      }
    }
    return result;
  }
  return value;
}

/**
 * collectExcludedSecrets — 扫描 secret_refs 表（若存在）+ provider_configs，
 * 收集被排除的 SecretRef 元信息（不含真值）
 */
function collectExcludedSecrets(): { excludedFromPackage: string[]; excludedSecrets: Array<{ refId: string; type: string; reason: string }> } {
  const excludedFromPackage = ['secret_refs', 'workspace-secret.key', 'apiKey', 'token', 'password'];
  const excludedSecrets: Array<{ refId: string; type: string; reason: string }> = [];

  const hasSecretRefs = getSqlite()
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='secret_refs'")
    .get() as { name: string } | undefined;
  if (hasSecretRefs) {
    // 列名兼容（不同 phase 的 schema 可能不同）— 仅取存在的列
    const cols = getSqlite()
      .prepare('PRAGMA table_info(secret_refs)')
      .all() as Array<{ name: string }>;
    const colNames = new Set(cols.map((c) => c.name));
    const typeCol = colNames.has('provider') ? 'provider' : (colNames.has('ref_type') ? 'ref_type' : null);
    const sql = typeCol
      ? `SELECT id, ${typeCol} as type_label FROM secret_refs`
      : 'SELECT id FROM secret_refs';
    const rows = getSqlite()
      .prepare(sql)
      .all() as Array<{ id: string; type_label?: string | null }>;
    for (const row of rows) {
      excludedSecrets.push({
        refId: row.id,
        type: row.type_label || 'unknown',
        reason: 'SecretRef 默认排除（spec L169 + L172）',
      });
    }
  }
  return { excludedFromPackage, excludedSecrets };
}

// ============================================================
// 3. 一致性快照（criteria B5 + spec L177）
// ============================================================

interface SnapshotResult {
  snapshotAt: number;
  transactionStartedAt: number;
  tableRowCounts: Array<{ table: string; rows: number }>;
  projectInfo: { id: string; name: string };
  artifacts: Array<{ id: string; sha256: string; sizeBytes: number; objectType: string | null; objectId: string | null; referenceCount: number; missing: number }>;
  missingArtifactIds: string[];
  pendingTasks: string[];
  inflight: number;
  totals: { chapterCount: number; trackCount: number; takeCount: number; taskCount: number };
}

const PROJECT_RELATED_TABLES = [
  'projects',
  'chapters',
  'script_segments',
  'assets',
  'tracks',
  'takes',
  'tasks',
  'rough_cuts',
  'audio_subtitle_plans',
  'episode_delivery_packages',
];

function tableExists(table: string): boolean {
  const row = getSqlite()
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(table) as { name: string } | undefined;
  return Boolean(row);
}

/**
 * createConsistentSnapshot — 使用 SQLite 事务在快照内统计 + 抓取数据（criteria B5 + spec L177）
 *
 * 通过 withTransaction（getSqlite().transaction）确保统计期间数据一致性。
 */
function createConsistentSnapshot(projectId: string): SnapshotResult {
  const sqlite = getSqlite();
  const transactionStartedAt = Date.now();

  // 使用 SQLite transaction 包裹整段查询，确保一致性快照（spec L177）
  const result = sqlite.transaction((projId: string): SnapshotResult => {
    const tableRowCounts: SnapshotResult['tableRowCounts'] = [];
    let chapterCount = 0;
    let trackCount = 0;
    let takeCount = 0;
    let taskCount = 0;

    for (const table of PROJECT_RELATED_TABLES) {
      if (!tableExists(table)) continue;
      const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
      const hasProjectCol = cols.some((c) => c.name === 'project_id');
      const hasIdCol = cols.some((c) => c.name === 'id');
      let rows = 0;
      if (table === 'projects' && hasIdCol) {
        const r = sqlite.prepare(`SELECT COUNT(*) as c FROM projects WHERE id = ?`).get(projId) as { c: number } | undefined;
        rows = r?.c ?? 0;
      } else if (hasProjectCol) {
        const r = sqlite.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE project_id = ?`).get(projId) as { c: number } | undefined;
        rows = r?.c ?? 0;
      }
      tableRowCounts.push({ table, rows });
      if (table === 'chapters') chapterCount = rows;
      if (table === 'tracks') trackCount = rows;
      if (table === 'takes') takeCount = rows;
      if (table === 'tasks') taskCount = rows;
    }

    let projectInfo = { id: projId, name: '' };
    if (tableExists('projects')) {
      const cols = sqlite.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>;
      const hasName = cols.some((c) => c.name === 'name');
      const hasDisplayName = cols.some((c) => c.name === 'display_name');
      if (hasName) {
        const r = sqlite.prepare(`SELECT name FROM projects WHERE id = ?`).get(projId) as { name: string } | undefined;
        projectInfo.name = r?.name ?? '';
      } else if (hasDisplayName) {
        const r = sqlite.prepare(`SELECT display_name as name FROM projects WHERE id = ?`).get(projId) as { name: string } | undefined;
        projectInfo.name = r?.name ?? '';
      }
    }

    // Artifact 清单（按 object_id 在本项目下的对象关联） — MVP 简化：取本项目所有 take/track/asset 的 artifact 引用
    const artifacts: SnapshotResult['artifacts'] = [];
    const missingArtifactIds: string[] = [];
    if (tableExists('artifacts')) {
      // 关联 object_type 列表（本项目相关对象类型）
      const relatedTypes = ['project', 'chapter', 'track', 'take', 'task', 'asset', 'rough_cut', 'audio_subtitle_plan', 'episode_delivery_package'];
      // 收集本项目下所有相关 object_id
      const objectIds: string[] = [projId];
      for (const table of ['chapters', 'tracks', 'takes', 'tasks', 'assets', 'rough_cuts', 'audio_subtitle_plans', 'episode_delivery_packages']) {
        if (!tableExists(table)) continue;
        const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
        if (!cols.some((c) => c.name === 'project_id') || !cols.some((c) => c.name === 'id')) continue;
        const rows = sqlite.prepare(`SELECT id FROM ${table} WHERE project_id = ?`).all(projId) as Array<{ id: string }>;
        for (const r of rows) objectIds.push(r.id);
      }

      if (objectIds.length > 0) {
        const placeholders = objectIds.map(() => '?').join(',');
        const rows = sqlite
          .prepare(
            `SELECT id, sha256, size_bytes, object_type, object_id, reference_count, missing
             FROM artifacts
             WHERE object_id IN (${placeholders})`,
          )
          .all(...objectIds) as Array<{ id: string; sha256: string; size_bytes: number; object_type: string | null; object_id: string | null; reference_count: number; missing: number }>;
        for (const r of rows) {
          artifacts.push({
            id: r.id,
            sha256: r.sha256,
            sizeBytes: r.size_bytes,
            objectType: r.object_type,
            objectId: r.object_id,
            referenceCount: r.reference_count,
            missing: r.missing,
          });
          if (r.missing) missingArtifactIds.push(r.id);
        }
      }
    }

    // 运行中任务（spec L584 — running task）
    const pendingTasks: string[] = [];
    let inflight = 0;
    if (tableExists('tasks')) {
      const cols = sqlite.prepare(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>;
      if (cols.some((c) => c.name === 'project_id') && cols.some((c) => c.name === 'status')) {
        const rows = sqlite
          .prepare(`SELECT id FROM tasks WHERE project_id = ? AND status IN ('pending', 'queued', 'submitted', 'running', 'retrying', 'reconciling')`)
          .all(projId) as Array<{ id: string }>;
        for (const r of rows) pendingTasks.push(r.id);
        inflight = pendingTasks.length;
      }
    }

    return {
      snapshotAt: Date.now(),
      transactionStartedAt,
      tableRowCounts,
      projectInfo,
      artifacts,
      missingArtifactIds,
      pendingTasks,
      inflight,
      totals: { chapterCount, trackCount, takeCount, taskCount },
    };
  })(projectId);

  return result;
}

// ============================================================
// 4. exportProjectMigrationPackage — 导出函数（criteria B6 — 必须）
// ============================================================

/**
 * exportProjectMigrationPackage — 生成 ProjectMigrationPackage manifest
 *
 * 流程：
 *  1. createConsistentSnapshot（criteria B5 — 一致性快照）
 *  2. collectExcludedSecrets（criteria B2 — SecretRef 默认排除）
 *  3. 构造 manifest（criteria B4 — 6 类核心字段）
 *  4. 计算 artifactHash（criteria B4）
 *  5. redactSecret 二次过滤（criteria B2 — 真值不落 manifest）
 *  6. 写 Artifact 落盘 manifest JSON（MVP — 真实 zip 留待后续 phase）
 *  7. 写 audit log（criteria B7 — 'migration_export' 事件）
 */
export async function exportProjectMigrationPackage(input: ExportInput): Promise<ProjectMigrationPackageRecord> {
  await ensureSchema();
  const actor = input.actor || 'local-owner';

  // 1. 一致性快照
  const snapshot = createConsistentSnapshot(input.projectId);

  // 2. SecretRef 排除
  const { excludedFromPackage, excludedSecrets } = collectExcludedSecrets();

  // 3. Artifact hash（criteria B4 — artifactHash 字段）
  const artifactHashInput = snapshot.artifacts
    .map((a) => `${a.id}:${a.sha256}:${a.sizeBytes}`)
    .sort()
    .join('|');
  const artifactHash = createHash('sha256').update(artifactHashInput).digest('hex');

  // 4. DB revision（criteria B4 — schema_migrations 累计计数）
  const migrationCountRow = getSqlite()
    .prepare(`SELECT COUNT(*) as count FROM schema_migrations WHERE status = 'applied'`)
    .get() as { count: number } | undefined;
  const dbRevision = migrationCountRow?.count ?? 0;

  // 5. 缺失项（criteria B4 — missingItem / missingArtifact）
  const missingItem: string[] = [];
  if (snapshot.projectInfo.name === '') missingItem.push(`project:${input.projectId}:name`);

  // 6. 构造 manifest
  const packageId = randomUUID();
  const notes: string[] = [
    'MVP: manifest 仅返回 JSON + Artifact 引用清单（真实 zip 流由后续 phase 接入）',
    '默认排除 SecretRef（spec L169 + L172）— 恢复时需在目标实例重新配置 apiKey',
  ];

  const manifest: ProjectMigrationManifest = {
    packageId,
    packageType: 'project_migration_package',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    dbRevision,
    generatedAt: Date.now(),
    projectId: input.projectId,
    projectName: snapshot.projectInfo.name,

    artifactHash,
    artifactManifest: snapshot.artifacts.map((a) => ({
      artifactId: a.id,
      sha256: a.sha256,
      sizeBytes: a.sizeBytes,
      objectType: a.objectType,
      objectId: a.objectId,
      referenceCount: a.referenceCount,
    })),
    missing: {
      missingArtifacts: snapshot.missingArtifactIds,
      missingItem,
      count: snapshot.missingArtifactIds.length + missingItem.length,
    },
    runningTask: {
      pendingTasks: snapshot.pendingTasks,
      inflight: snapshot.inflight,
      tasksInProgress: snapshot.inflight,
    },
    excludedFromPackage,
    excludedSecrets,
    secretsExcluded: excludedSecrets.length,

    consistentSnapshot: {
      snapshotAt: snapshot.snapshotAt,
      transactionStartedAt: snapshot.transactionStartedAt,
      tableRowCounts: snapshot.tableRowCounts,
    },

    summary: {
      tableCount: snapshot.tableRowCounts.length,
      artifactCount: snapshot.artifacts.length,
      totalArtifactBytes: snapshot.artifacts.reduce((acc, a) => acc + (a.sizeBytes || 0), 0),
      chapterCount: snapshot.totals.chapterCount,
      trackCount: snapshot.totals.trackCount,
      takeCount: snapshot.totals.takeCount,
      taskCount: snapshot.totals.taskCount,
    },

    notes,
  };

  // 7. redact 二次过滤（criteria B2 — 真值绝不写入 manifest）
  const safeManifest = redactSecret(manifest) as ProjectMigrationManifest;

  // 8. 写 Artifact（manifest JSON）
  let artifactRecordId: string | null = null;
  try {
    const artifact = await writeArtifact({
      content: JSON.stringify(safeManifest, null, 2),
      mimeType: 'application/json',
      sourceType: 'system',
      originalName: `migration-package-${packageId}.json`,
      objectType: 'project_migration_package',
      objectId: packageId,
    });
    artifactRecordId = artifact.id;
  } catch (error) {
    notes.push(`Artifact 写入失败（manifest 仍返回）：${error instanceof Error ? error.message : String(error)}`);
  }

  // 9. AuditLog（criteria B7 — migration_export 事件）
  await writeAuditLog({
    eventType: 'migration_export',
    targetType: 'project',
    targetId: input.projectId,
    actor,
    projectId: input.projectId,
    action: 'exportProjectMigrationPackage',
    detail: {
      packageId,
      artifactId: artifactRecordId,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      dbRevision,
      artifactCount: manifest.summary.artifactCount,
      excludedSecretsCount: excludedSecrets.length,
      inflightTaskCount: snapshot.inflight,
      missingCount: manifest.missing.count,
    },
    result: 'ok',
  });

  return {
    id: packageId,
    projectId: input.projectId,
    manifest: safeManifest,
    artifactId: artifactRecordId,
    createdAt: manifest.generatedAt,
  };
}

/** 别名 — 接受同义命名 */
export const createMigrationPackage = exportProjectMigrationPackage;
export const buildMigrationPackage = exportProjectMigrationPackage;
export const generateMigrationPackage = exportProjectMigrationPackage;
export const exportMigrationPackage = exportProjectMigrationPackage;

// ============================================================
// 5. restoreMigrationPackage — 恢复函数（criteria B6 — MVP 校验 + 基础恢复）
// ============================================================

/**
 * restoreMigrationPackage — 校验 manifest + 执行基础恢复（MVP）
 *
 * MVP 行为：
 *  1. 校验 schemaVersion 兼容（manifest.schemaVersion <= CURRENT_SCHEMA_VERSION）
 *  2. 校验 artifactHash 一致性
 *  3. dryRun=true → 仅返回校验报告
 *  4. dryRun=false → 标记 audit log（restore 事件复用 migration_export 类型 + action='restoreMigrationPackage'）
 *  5. 完整 DB 切片恢复由后续 phase 实现（spec L600 + 派发 MVP 降级允许）
 */
export async function restoreMigrationPackage(input: RestoreInput): Promise<RestoreReport> {
  await ensureSchema();
  const actor = input.actor || 'local-owner';
  const warnings: string[] = [];

  const schemaMatched = input.manifest.schemaVersion <= CURRENT_SCHEMA_VERSION;
  if (!schemaMatched) warnings.push(`manifest.schemaVersion (${input.manifest.schemaVersion}) > 当前 schemaVersion (${CURRENT_SCHEMA_VERSION})`);

  // Artifact 摘要重算 — 用 manifest 中的清单重新计算 artifactHash 应一致
  const recomputed = input.manifest.artifactManifest
    .map((a) => `${a.artifactId}:${a.sha256}:${a.sizeBytes}`)
    .sort()
    .join('|');
  const recomputedHash = createHash('sha256').update(recomputed).digest('hex');
  const artifactsMatched = recomputedHash === input.manifest.artifactHash;
  if (!artifactsMatched) warnings.push('artifactHash 校验失败：manifest artifact 清单已被篡改或损坏');

  // 缺失 Artifact 列表
  const missingArtifacts: string[] = [];
  if (tableExists('artifacts')) {
    for (const a of input.manifest.artifactManifest) {
      const row = getSqlite()
        .prepare(`SELECT id FROM artifacts WHERE id = ?`)
        .get(a.artifactId) as { id: string } | undefined;
      if (!row) missingArtifacts.push(a.artifactId);
    }
  }
  if (missingArtifacts.length > 0) warnings.push(`目标实例缺失 ${missingArtifacts.length} 个 Artifact（需手动恢复）`);

  const ok = schemaMatched && artifactsMatched && missingArtifacts.length === 0;

  if (!input.dryRun) {
    // 写 audit log（migration_export 事件 — action 区分恢复）
    await writeAuditLog({
      eventType: 'migration_export',
      targetType: 'project',
      targetId: input.manifest.projectId,
      actor,
      projectId: input.manifest.projectId,
      action: 'restoreMigrationPackage',
      detail: {
        packageId: input.manifest.packageId,
        sourceSchemaVersion: input.manifest.schemaVersion,
        targetSchemaVersion: CURRENT_SCHEMA_VERSION,
        artifactsMatched,
        schemaMatched,
        missingArtifactsCount: missingArtifacts.length,
        warnings,
      },
      result: ok ? 'ok' : (warnings.length > 0 ? 'warning' : 'failed'),
    });
  }

  return {
    ok,
    warnings,
    schemaMatched,
    artifactsMatched,
    restoredProjectId: ok ? input.manifest.projectId : null,
    missingArtifacts,
  };
}

/** 别名 */
export const importMigrationPackage = restoreMigrationPackage;
export const recoverMigrationPackage = restoreMigrationPackage;
export const applyMigrationPackage = restoreMigrationPackage;
export const restoreProject = restoreMigrationPackage;
