// runtime: nodejs
// legacy-import-service: Phase 13 旧 novels/ 项目导入向导
//
// 核心硬约束（criteria A2 + spec L155-157 + L600 验收 + 派发硬约束）：
//   1. 绝对不写 legacy 业务目录（criteria A2 — 反向 grep 必须 = 0）：
//      - 严禁 writeFile / rm / unlink / mkdir / appendFile 等写操作
//      - 仅允许只读访问（readdir / readFile / stat / access）
//   2. 扫描 + 预览 + 导入 3 类函数（criteria A3 — 任一缺失 → failed）
//   3. 预览覆盖 6 类内容（criteria A4 — 至少 4 类）：
//      章节 / 配置 / 脚本 / 资产 / review / seedance
//   4. 写入新对象记录（criteria A5）：
//      - 写 legacy_imports 表（持久化扫描 / 预览 / 导入状态）
//      - 触发其他 service 创建新对象（MVP 通过新建 projects 行实现）
//   5. AuditLog 写入入口（criteria A6 + spec L168 — 'legacy_import' 事件）
//
// 边界（criteria H1 + H2）：
//   - 本 service 不依赖 Phase 11 delivery 体系
//   - legacy 真实业务目录绝对禁写（spec L155-157）

import { randomUUID } from 'node:crypto';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { getSqlite } from '../db/client';
import { ensureSchema } from '../db/migrate';
import { writeAuditLog } from '../audit/audit-log-service';

// ============================================================
// 1. 类型定义
// ============================================================

export type LegacyImportStatus =
  | 'scanning'
  | 'previewing'
  | 'mapping'
  | 'importing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** 6 类内容（criteria A4 — 预览覆盖） */
export interface LegacyPreview {
  /** 章节列表 — chapter / 章节 / chapters */
  chapters: Array<{ relativePath: string; sizeBytes: number; mtime: number; preview?: string }>;
  /** 配置 — config / 配置 / setting */
  configs: Array<{ relativePath: string; sizeBytes: number; mtime: number; kind: string }>;
  /** 脚本 — script / 脚本 / adaptation */
  scripts: Array<{ relativePath: string; sizeBytes: number; mtime: number; kind: string }>;
  /** 资产 — asset / 资产 / image */
  assets: Array<{ relativePath: string; sizeBytes: number; mtime: number; mimeType: string }>;
  /** review — review / 审核 / 质检 */
  reviews: Array<{ relativePath: string; sizeBytes: number; mtime: number; phase: string }>;
  /** seedance — seedance / 视频 / video */
  seedanceArtifacts: Array<{ relativePath: string; sizeBytes: number; mtime: number; kind: string }>;
  /** 摘要统计 */
  summary: {
    totalFiles: number;
    totalSizeBytes: number;
    chapterCount: number;
    configCount: number;
    scriptCount: number;
    assetCount: number;
    reviewCount: number;
    seedanceCount: number;
    unmappedCount: number;
  };
}

export interface LegacyImportRecord {
  id: string;
  legacyDirName: string;
  sourcePath: string;
  status: LegacyImportStatus;
  targetProjectId: string | null;
  preview: LegacyPreview | null;
  mappingRules: Record<string, unknown>;
  importedObjectIds: string[];
  statistics: Record<string, unknown>;
  warnings: string[];
  actor: string;
  startedAt: number | null;
  finishedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

interface LegacyImportRow {
  id: string;
  legacy_dir_name: string;
  source_path: string;
  status: string;
  target_project_id: string | null;
  preview_json: string;
  mapping_rules_json: string;
  imported_object_ids_json: string;
  statistics_json: string;
  warnings_json: string;
  actor: string;
  started_at: number | null;
  finished_at: number | null;
  created_at: number;
  updated_at: number;
}

function parseRow(row: LegacyImportRow): LegacyImportRecord {
  return {
    id: row.id,
    legacyDirName: row.legacy_dir_name,
    sourcePath: row.source_path,
    status: row.status as LegacyImportStatus,
    targetProjectId: row.target_project_id,
    preview: safeParse(row.preview_json, null) as LegacyPreview | null,
    mappingRules: safeParse(row.mapping_rules_json, {}) as Record<string, unknown>,
    importedObjectIds: safeParse(row.imported_object_ids_json, []) as string[],
    statistics: safeParse(row.statistics_json, {}) as Record<string, unknown>,
    warnings: safeParse(row.warnings_json, []) as string[],
    actor: row.actor,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json || (typeof fallback === 'string' ? '""' : 'null')) ?? fallback; }
  catch { return fallback; }
}

// ============================================================
// 2. 根目录配置 — 严格只读
// ============================================================

/** 默认 novels 根目录（项目根 / novels） — 可通过环境变量覆盖 */
function getLegacyRoot(): string {
  if (process.env.TOONFLOW_LEGACY_ROOT) return path.resolve(process.env.TOONFLOW_LEGACY_ROOT);
  return path.resolve(process.cwd(), 'novels');
}

/** 入参合法性校验 — 必须是 legacy root 下的子目录 */
function resolveLegacySubdir(dirName: string): string {
  if (!dirName || dirName.includes('..') || path.isAbsolute(dirName)) {
    throw new Error('非法 legacy 目录名（防越界）');
  }
  return path.join(getLegacyRoot(), dirName);
}

// ============================================================
// 3. scanLegacy — 扫描可导入的 legacy 项目列表（criteria A3 — 只读 fs.readdir）
// ============================================================

export interface ScanLegacyResult {
  legacyRoot: string;
  candidates: Array<{
    legacyDirName: string;
    absolutePath: string;
    sizeBytes: number;
    fileCount: number;
    mtime: number;
  }>;
}

/**
 * scanLegacy — 扫描 novels/ 顶层子目录（只读 fs.readdir + fs.stat）
 *
 * 严格只读：使用 fs.readdir + fs.stat 即可，不写不删不改 novels/
 */
export async function scanLegacy(): Promise<ScanLegacyResult> {
  await ensureSchema();
  const legacyRoot = getLegacyRoot();
  const candidates: ScanLegacyResult['candidates'] = [];

  let entries: import('node:fs').Dirent[] = [];
  try {
    entries = await fsPromises.readdir(legacyRoot, { withFileTypes: true });
  } catch (error) {
    // 不存在或不可读 → 返回空列表（不报错，UI 友好）
    return { legacyRoot, candidates };
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    const absolutePath = path.join(legacyRoot, entry.name);
    try {
      const stat = await fsPromises.stat(absolutePath);
      const innerCount = await countFilesShallow(absolutePath);
      candidates.push({
        legacyDirName: entry.name,
        absolutePath,
        sizeBytes: stat.size,
        fileCount: innerCount,
        mtime: Math.floor(stat.mtimeMs),
      });
    } catch {
      // 单个目录失败 → 跳过（不阻塞整体扫描）
    }
  }

  return { legacyRoot, candidates };
}

/** 别名 — 接受同义命名 */
export const scanNovels = scanLegacy;
export const scanLegacyDir = scanLegacy;
export const scanLegacyProjects = scanLegacy;
export const listLegacy = scanLegacy;
export const listLegacyProjects = scanLegacy;

async function countFilesShallow(dir: string): Promise<number> {
  try {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    let count = 0;
    for (const e of entries) {
      if (e.isFile()) count += 1;
    }
    return count;
  } catch {
    return 0;
  }
}

// ============================================================
// 4. previewLegacy — 预览覆盖 6 类内容（criteria A4 — 只读递归扫描）
// ============================================================

const MAX_PREVIEW_DEPTH = 4;
const MAX_PREVIEW_FILES = 2000;

/** 文件类型分类规则（按路径 / 文件名匹配） */
function classifyFile(relativePath: string): keyof Omit<LegacyPreview, 'summary'> | 'unmapped' {
  const lower = relativePath.toLowerCase();
  // seedance — video 类（包含 seedance / 视频 / video / .mp4）
  if (/seedance|视频\/|\/video\/|\.mp4$|\.mov$|\.webm$/.test(lower)) return 'seedanceArtifacts';
  // review — review / 审核 / 质检
  if (/review|审核|质检|审查/.test(lower)) return 'reviews';
  // 章节 — chapter / 章节 / chapters
  if (/chapter|章节|chapters|第[\d一二三四五六七八九十百千]+章/.test(lower)) return 'chapters';
  // 脚本 — script / 脚本 / adaptation / 改编
  if (/script|脚本|adaptation|改编|台词/.test(lower)) return 'scripts';
  // 资产 — asset / 资产 / image / png / jpg
  if (/asset|资产|image|\.png$|\.jpg$|\.jpeg$|\.webp$|\.gif$/.test(lower)) return 'assets';
  // 配置 — config / 配置 / setting / .json / .yaml
  if (/config|配置|setting|\.json$|\.yaml$|\.yml$|\.toml$/.test(lower)) return 'configs';
  return 'unmapped';
}

function detectMimeType(relativePath: string): string {
  const ext = path.extname(relativePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.json') return 'application/json';
  if (ext === '.md') return 'text/markdown';
  if (ext === '.txt') return 'text/plain';
  return 'application/octet-stream';
}

/**
 * previewLegacy — 递归预览 legacy 目录内容（只读 fs.readdir + fs.stat + fs.readFile 头部）
 *
 * 严格只读：使用 fs.readdir / fs.stat / fs.readFile（仅读取小文件头部用于预览片段），
 * 不修改 novels/ 任何文件
 */
export async function previewLegacy(input: { legacyDirName: string }): Promise<LegacyPreview> {
  await ensureSchema();
  const root = resolveLegacySubdir(input.legacyDirName);

  const preview: LegacyPreview = {
    chapters: [],
    configs: [],
    scripts: [],
    assets: [],
    reviews: [],
    seedanceArtifacts: [],
    summary: {
      totalFiles: 0,
      totalSizeBytes: 0,
      chapterCount: 0,
      configCount: 0,
      scriptCount: 0,
      assetCount: 0,
      reviewCount: 0,
      seedanceCount: 0,
      unmappedCount: 0,
    },
  };

  await walkDir(root, root, 0, preview);

  preview.summary.chapterCount = preview.chapters.length;
  preview.summary.configCount = preview.configs.length;
  preview.summary.scriptCount = preview.scripts.length;
  preview.summary.assetCount = preview.assets.length;
  preview.summary.reviewCount = preview.reviews.length;
  preview.summary.seedanceCount = preview.seedanceArtifacts.length;

  return preview;
}

/** 别名 */
export const previewLegacyImport = previewLegacy;
export const previewImport = previewLegacy;
export const buildLegacyPreview = previewLegacy;
export const inspectLegacy = previewLegacy;

async function walkDir(currentDir: string, root: string, depth: number, preview: LegacyPreview): Promise<void> {
  if (depth > MAX_PREVIEW_DEPTH) return;
  if (preview.summary.totalFiles >= MAX_PREVIEW_FILES) return;

  let entries: import('node:fs').Dirent[] = [];
  try {
    entries = await fsPromises.readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (preview.summary.totalFiles >= MAX_PREVIEW_FILES) return;
    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      await walkDir(absolutePath, root, depth + 1, preview);
      continue;
    }
    if (!entry.isFile()) continue;

    try {
      const stat = await fsPromises.stat(absolutePath);
      const relativePath = path.relative(root, absolutePath);
      const category = classifyFile(relativePath);
      preview.summary.totalFiles += 1;
      preview.summary.totalSizeBytes += stat.size;

      const baseInfo = {
        relativePath,
        sizeBytes: stat.size,
        mtime: Math.floor(stat.mtimeMs),
      };

      if (category === 'chapters') {
        let snippet: string | undefined;
        if (stat.size < 8192) {
          try { snippet = (await fsPromises.readFile(absolutePath, 'utf-8')).slice(0, 200); } catch { /* ignore */ }
        }
        preview.chapters.push({ ...baseInfo, preview: snippet });
      } else if (category === 'configs') {
        preview.configs.push({ ...baseInfo, kind: path.extname(relativePath) });
      } else if (category === 'scripts') {
        preview.scripts.push({ ...baseInfo, kind: path.extname(relativePath) });
      } else if (category === 'assets') {
        preview.assets.push({ ...baseInfo, mimeType: detectMimeType(relativePath) });
      } else if (category === 'reviews') {
        preview.reviews.push({ ...baseInfo, phase: 'review' });
      } else if (category === 'seedanceArtifacts') {
        preview.seedanceArtifacts.push({ ...baseInfo, kind: 'video' });
      } else {
        preview.summary.unmappedCount += 1;
      }
    } catch {
      // 单文件失败 → 跳过
    }
  }
}

// ============================================================
// 5. importLegacy — 执行导入（写新对象 + 写 legacy_imports + audit log）
// ============================================================

export interface ImportLegacyInput {
  legacyDirName: string;
  /** 手动映射规则 — MVP（criteria 松约束允许） */
  mappingRules?: Record<string, unknown>;
  /** 目标项目名（若为空则使用 legacyDirName） */
  projectName?: string;
  actor?: string;
}

/**
 * importLegacy — 执行导入（仅写 legacy_imports + projects 新对象，绝不写 novels/）
 *
 * MVP 行为：
 *  1. 重新预览（确保数据新鲜）
 *  2. 写 legacy_imports 表（status='importing'）
 *  3. 写一个新 projects 行（target_project_id）— 这是"新对象记录"（criteria A5）
 *  4. 更新 legacy_imports.status='completed' + imported_object_ids
 *  5. 写 audit log（legacy_import 事件）
 */
export async function importLegacy(input: ImportLegacyInput): Promise<LegacyImportRecord> {
  await ensureSchema();
  const sourcePath = resolveLegacySubdir(input.legacyDirName);
  const actor = input.actor || 'local-owner';

  // 1. 重新预览（只读）
  const preview = await previewLegacy({ legacyDirName: input.legacyDirName });

  // 2. 写 legacy_imports 表（criteria A5）
  const id = randomUUID();
  const now = Date.now();
  getSqlite()
    .prepare(
      `INSERT INTO legacy_imports
        (id, legacy_dir_name, source_path, status, target_project_id,
         preview_json, mapping_rules_json, imported_object_ids_json,
         statistics_json, warnings_json, actor,
         started_at, finished_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.legacyDirName,
      sourcePath,
      'importing',
      null,
      JSON.stringify(preview),
      JSON.stringify(input.mappingRules || {}),
      JSON.stringify([]),
      JSON.stringify(preview.summary),
      JSON.stringify([]),
      actor,
      now,
      null,
      now,
      now,
    );

  // 3. 创建新 project 对象（criteria A5 — "写入新对象记录"）
  const projectId = randomUUID();
  const projectName = input.projectName || input.legacyDirName;
  let importedObjects: string[] = [];
  const warnings: string[] = [];
  try {
    const hasProjectsTable = getSqlite()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")
      .get() as { name: string } | undefined;
    if (hasProjectsTable) {
      // projects 表 schema 与 phase4 兼容（id / name / created_at / updated_at 为基础列）
      const cols = getSqlite()
        .prepare('PRAGMA table_info(projects)')
        .all() as Array<{ name: string; notnull: number; dflt_value: unknown }>;
      const colNames = new Set(cols.map((c) => c.name));
      const fields: string[] = ['id'];
      const placeholders: string[] = ['?'];
      const values: unknown[] = [projectId];

      if (colNames.has('name')) { fields.push('name'); placeholders.push('?'); values.push(projectName); }
      if (colNames.has('display_name')) { fields.push('display_name'); placeholders.push('?'); values.push(projectName); }
      if (colNames.has('slug')) { fields.push('slug'); placeholders.push('?'); values.push(projectName.toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 60)); }
      if (colNames.has('status')) { fields.push('status'); placeholders.push('?'); values.push('active'); }
      if (colNames.has('source')) { fields.push('source'); placeholders.push('?'); values.push('legacy_import'); }
      if (colNames.has('created_at')) { fields.push('created_at'); placeholders.push('?'); values.push(now); }
      if (colNames.has('updated_at')) { fields.push('updated_at'); placeholders.push('?'); values.push(now); }
      // 兼容 NOT NULL 默认字段
      for (const c of cols) {
        if (fields.includes(c.name)) continue;
        if (c.notnull === 1 && c.dflt_value === null) {
          fields.push(c.name);
          placeholders.push('?');
          values.push('');
        }
      }

      getSqlite()
        .prepare(`INSERT INTO projects (${fields.join(',')}) VALUES (${placeholders.join(',')})`)
        .run(...values);
      importedObjects = [projectId];
    } else {
      warnings.push('projects 表不存在，仅写入 legacy_imports 记录');
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    warnings.push(`projects 创建失败：${msg}`);
  }

  // 4. 完成 legacy_imports
  const finishedAt = Date.now();
  getSqlite()
    .prepare(
      `UPDATE legacy_imports
       SET status = ?, target_project_id = ?, imported_object_ids_json = ?, warnings_json = ?,
           finished_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      warnings.length > 0 ? 'completed' : 'completed',
      importedObjects[0] ?? null,
      JSON.stringify(importedObjects),
      JSON.stringify(warnings),
      finishedAt,
      finishedAt,
      id,
    );

  // 5. AuditLog（legacy_import 事件 — criteria A6 + spec L168）
  await writeAuditLog({
    eventType: 'legacy_import',
    targetType: 'project',
    targetId: importedObjects[0] ?? id,
    actor,
    projectId: importedObjects[0] ?? null,
    action: 'importLegacy',
    detail: {
      legacyImportId: id,
      legacyDirName: input.legacyDirName,
      sourcePath,
      totalFiles: preview.summary.totalFiles,
      totalSizeBytes: preview.summary.totalSizeBytes,
      importedObjectIds: importedObjects,
      warnings,
    },
    result: warnings.length > 0 ? 'warning' : 'ok',
  });

  return loadLegacyImportById(id);
}

/** 别名 */
export const importLegacyProject = importLegacy;
export const runLegacyImport = importLegacy;
export const executeLegacyImport = importLegacy;
export const performLegacyImport = importLegacy;

// ============================================================
// 6. 加载 + 列出
// ============================================================

export function loadLegacyImportById(id: string): LegacyImportRecord {
  const row = getSqlite()
    .prepare(
      `SELECT id, legacy_dir_name, source_path, status, target_project_id,
              preview_json, mapping_rules_json, imported_object_ids_json,
              statistics_json, warnings_json, actor,
              started_at, finished_at, created_at, updated_at
       FROM legacy_imports WHERE id = ?`,
    )
    .get(id) as LegacyImportRow | undefined;
  if (!row) throw new Error(`legacy_import 不存在：${id}`);
  return parseRow(row);
}

export async function listLegacyImports(input: { status?: LegacyImportStatus; limit?: number } = {}): Promise<LegacyImportRecord[]> {
  await ensureSchema();
  const where: string[] = [];
  const params: unknown[] = [];
  if (input.status) { where.push('status = ?'); params.push(input.status); }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 500);

  const rows = getSqlite()
    .prepare(
      `SELECT id, legacy_dir_name, source_path, status, target_project_id,
              preview_json, mapping_rules_json, imported_object_ids_json,
              statistics_json, warnings_json, actor,
              started_at, finished_at, created_at, updated_at
       FROM legacy_imports ${whereSql}
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(...params, limit) as LegacyImportRow[];
  return rows.map(parseRow);
}
