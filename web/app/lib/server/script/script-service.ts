import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ensureSchema } from '../db/migrate';
import { getSqlite, runInTransaction } from '../db/client';
import { writeArtifact } from '../artifacts/store';
import { getProject } from '../projects/project-service';
import { attachAgentRunOutput } from '../agent/agent-run-service';
import { recordTextImpact } from '../dependencies/impact-service';
import {
  deleteScript as deleteLegacyScript,
  getScriptContent as getLegacyScriptContent,
  getScripts as getLegacyScripts,
  updateScript as updateLegacyScript,
} from '@/app/lib/novels';

const SaveScriptSchema = z.object({
  content: z.string().min(1, '剧本内容不能为空').max(2_000_000, '单集剧本最多 200 万字符'),
  source: z.enum(['agent_generated', 'manual_edit', 'imported', 'rollback']).default('manual_edit'),
  status: z.enum(['draft', 'reviewed', 'locked']).default('draft'),
  agentRunId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface ProjectRef {
  id: string;
  name: string;
  scriptCount: number;
}

interface ScriptVersionRow {
  id: string;
  episode_id: string;
  episode_index: number;
  title: string;
  content: string;
  status: string;
  revision: number;
  version_no: number;
  quality_status: string;
  created_at: number;
  updated_at: number;
}

export interface ScriptSummary {
  id?: string;
  episode: number;
  filename: string;
  name: string;
  charCount: number;
  sceneCount: number;
  status?: string;
  revision?: number;
  versionNo?: number;
  qualityStatus?: string;
  updatedAt?: string;
}

export interface ScriptVersionDetail extends ScriptSummary {
  content: string;
  createdAt: string;
}

function normalizeIdentifier(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function countScenes(content: string) {
  return content.split('\n').filter((line) => {
    const trimmed = line.trim();
    return /^S\d+\s+.+\s+(日|夜|晨|昏|午)\//.test(trimmed)
      || /^\d+\s+.+\s+(日|夜|晨|昏|午)\/(内|外|内外)/.test(trimmed);
  }).length;
}

function extractScriptTitle(content: string, episode: number) {
  const heading = content.split('\n').find((line) => line.trim().startsWith('#'));
  return heading ? heading.replace(/^#+\s*/, '').trim() : `第${episode}集`;
}

function mapScript(row: ScriptVersionRow): ScriptSummary {
  return {
    id: row.id,
    episode: row.episode_index,
    filename: `episode-${row.episode_index}.txt`,
    name: row.title,
    charCount: row.content.length,
    sceneCount: countScenes(row.content),
    status: row.status,
    revision: row.revision,
    versionNo: row.version_no,
    qualityStatus: row.quality_status,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapScriptDetail(row: ScriptVersionRow): ScriptVersionDetail {
  return {
    ...mapScript(row),
    content: row.content,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function resolveProject(identifier: string): Promise<ProjectRef | null> {
  await ensureSchema();
  const normalized = normalizeIdentifier(identifier);
  const project = await getProject(normalized);
  return project ? { id: project.id, name: project.name, scriptCount: project.scriptCount } : null;
}

function getLatestRow(projectId: string, episode: number) {
  return getSqlite()
    .prepare(
      `SELECT * FROM script_versions
       WHERE project_id = ? AND episode_index = ? AND deleted_at IS NULL
       ORDER BY version_no DESC, updated_at DESC
       LIMIT 1`,
    )
    .get(projectId, episode) as ScriptVersionRow | undefined;
}

function ensureEpisode(projectId: string, episode: number, title: string) {
  const db = getSqlite();
  const existing = db
    .prepare('SELECT id FROM episodes WHERE project_id = ? AND episode_index = ? LIMIT 1')
    .get(projectId, episode) as { id: string } | undefined;
  if (existing) return existing.id;

  const now = Date.now();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO episodes
      (id, project_id, episode_index, title, status, revision, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'draft', 1, ?, ?)`,
  ).run(id, projectId, episode, title, now, now);
  return id;
}

function nextVersionNo(projectId: string, episode: number) {
  const row = getSqlite()
    .prepare('SELECT COALESCE(MAX(version_no), 0) AS max_version FROM script_versions WHERE project_id = ? AND episode_index = ?')
    .get(projectId, episode) as { max_version: number };
  return row.max_version + 1;
}

function refreshScriptCount(projectId: string) {
  const row = getSqlite()
    .prepare('SELECT COUNT(DISTINCT episode_index) AS count FROM script_versions WHERE project_id = ? AND deleted_at IS NULL')
    .get(projectId) as { count: number };
  getSqlite()
    .prepare('UPDATE projects SET script_count = ?, revision = revision + 1, updated_at = ? WHERE id = ?')
    .run(row.count, Date.now(), projectId);
}

export async function listScriptVersions(projectIdentifier: string): Promise<ScriptSummary[]> {
  const project = await resolveProject(projectIdentifier);
  if (!project) return getLegacyScripts(normalizeIdentifier(projectIdentifier));

  const rows = getSqlite()
    .prepare(
      `SELECT sv.* FROM script_versions sv
       JOIN (
         SELECT episode_index, MAX(version_no) AS version_no
         FROM script_versions
         WHERE project_id = ? AND deleted_at IS NULL
         GROUP BY episode_index
       ) latest
         ON latest.episode_index = sv.episode_index AND latest.version_no = sv.version_no
       WHERE sv.project_id = ? AND sv.deleted_at IS NULL
       ORDER BY sv.episode_index ASC`,
    )
    .all(project.id, project.id) as ScriptVersionRow[];

  if (rows.length > 0) return rows.map(mapScript);
  return getLegacyScripts(project.name).catch(() => []);
}

export async function getLatestScriptContent(projectIdentifier: string, episode: number) {
  const project = await resolveProject(projectIdentifier);
  if (!project) return getLegacyScriptContent(normalizeIdentifier(projectIdentifier), episode);

  const row = getLatestRow(project.id, episode);
  if (row) return row.content;
  return getLegacyScriptContent(project.name, episode);
}

export async function listScriptVersionHistory(projectIdentifier: string, episode: number): Promise<ScriptVersionDetail[]> {
  const project = await resolveProject(projectIdentifier);
  if (!project) return [];

  const rows = getSqlite()
    .prepare(
      `SELECT * FROM script_versions
       WHERE project_id = ? AND episode_index = ? AND deleted_at IS NULL
       ORDER BY version_no DESC, updated_at DESC`,
    )
    .all(project.id, episode) as ScriptVersionRow[];
  return rows.map(mapScriptDetail);
}

export async function saveScriptVersion(projectIdentifier: string, episode: number, rawInput: unknown) {
  const project = await resolveProject(projectIdentifier);
  const input = typeof rawInput === 'string'
    ? SaveScriptSchema.parse({ content: rawInput })
    : SaveScriptSchema.parse(rawInput);

  if (!project) {
    await updateLegacyScript(normalizeIdentifier(projectIdentifier), episode, input.content);
    return null;
  }

  const title = extractScriptTitle(input.content, episode);
  const scriptId = randomUUID();
  const artifact = await writeArtifact({
    content: input.content,
    mimeType: 'text/markdown',
    sourceType: input.source === 'agent_generated' ? 'generated' : 'imported',
    originalName: `episode-${episode}.md`,
    objectType: 'script_version',
    objectId: scriptId,
  });

  const saved = runInTransaction((db) => {
    const now = Date.now();
    const episodeId = ensureEpisode(project.id, episode, title);
    const versionNo = nextVersionNo(project.id, episode);

    db.prepare(
      `INSERT INTO script_versions
        (id, project_id, episode_id, episode_index, title, content, artifact_id, source,
         status, revision, version_no, quality_status, agent_run_id, metadata_json,
         locked_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'unchecked', ?, ?, NULL, ?, ?)`,
    ).run(
      scriptId,
      project.id,
      episodeId,
      episode,
      title,
      input.content,
      artifact.id,
      input.source,
      input.status,
      versionNo,
      input.agentRunId || null,
      JSON.stringify(input.metadata || {}),
      now,
      now,
    );

    refreshScriptCount(project.id);
    return mapScript(db.prepare('SELECT * FROM script_versions WHERE id = ?').get(scriptId) as ScriptVersionRow);
  });
  await attachAgentRunOutput(input.agentRunId, { artifactId: artifact.id, objectType: 'script_version', objectId: scriptId });
  await recordTextImpact(project.id, 'script_version', scriptId, input.source === 'rollback' ? 'script_version_rolled_back' : 'script_version_updated');
  return saved;
}

export async function rollbackScriptVersion(projectIdentifier: string, episode: number, versionId: string) {
  const project = await resolveProject(projectIdentifier);
  if (!project) throw new Error('项目不存在');

  const row = getSqlite()
    .prepare(
      `SELECT * FROM script_versions
       WHERE project_id = ? AND episode_index = ? AND id = ? AND deleted_at IS NULL
       LIMIT 1`,
    )
    .get(project.id, episode, versionId) as ScriptVersionRow | undefined;
  if (!row) throw new Error('剧本版本不存在');

  return saveScriptVersion(project.id, episode, {
    content: row.content,
    source: 'rollback',
    metadata: { rollbackFromVersionId: versionId, rollbackFromVersionNo: row.version_no },
  });
}

export async function lockLatestScriptVersion(projectIdentifier: string, episode: number, waiverReason?: string) {
  const project = await resolveProject(projectIdentifier);
  if (!project) throw new Error('项目不存在');

  const latest = getLatestRow(project.id, episode);
  if (!latest) throw new Error('剧本不存在');
  if (latest.quality_status !== 'passed' && !waiverReason?.trim()) {
    throw new Error('锁定前必须通过文本质量检查，或填写人工豁免原因');
  }

  const now = Date.now();
  const nextQualityStatus = latest.quality_status === 'passed' ? 'passed' : 'waived';
  getSqlite()
    .prepare(
      `UPDATE script_versions
       SET status = 'locked', quality_status = ?, locked_at = ?,
           metadata_json = json_set(metadata_json, '$.waiverReason', ?), updated_at = ?
       WHERE id = ?`,
    )
    .run(nextQualityStatus, now, waiverReason?.trim() || '', now, latest.id);

  if (nextQualityStatus === 'waived') {
    getSqlite()
      .prepare(
        `INSERT INTO quality_gates
          (id, project_id, object_type, object_id, metric, status, scope_json,
           denominator, passed_count, failed_items_json, confidence, sampling_rule,
           review_source, operator_decision, waiver_reason, created_at, updated_at)
         VALUES (?, ?, 'script', ?, 'text_quality', 'waived', ?, 0, 0, '[]', 0,
          '人工豁免锁定', 'manual_review', 'waived', ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        project.id,
        latest.id,
        JSON.stringify({ type: 'script', episode }),
        waiverReason?.trim() || '',
        now,
        now,
      );
  }
  return mapScript(getLatestRow(project.id, episode) as ScriptVersionRow);
}

export async function deleteScriptVersions(projectIdentifier: string, episode: number) {
  const project = await resolveProject(projectIdentifier);
  if (!project) {
    await deleteLegacyScript(normalizeIdentifier(projectIdentifier), episode);
    return { success: true };
  }

  const latest = getLatestRow(project.id, episode);
  if (!latest) {
    await deleteLegacyScript(project.name, episode).catch(() => {});
    return { success: true };
  }

  const now = Date.now();
  getSqlite()
    .prepare('UPDATE script_versions SET deleted_at = ?, status = ?, updated_at = ? WHERE project_id = ? AND episode_index = ?')
    .run(now, 'archived', now, project.id, episode);
  refreshScriptCount(project.id);
  return { success: true };
}
