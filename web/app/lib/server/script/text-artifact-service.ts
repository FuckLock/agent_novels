import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ensureSchema } from '../db/migrate';
import { getSqlite } from '../db/client';
import { writeArtifact } from '../artifacts/store';
import { getProject } from '../projects/project-service';
import { attachAgentRunOutput } from '../agent/agent-run-service';
import { recordTextImpact } from '../dependencies/impact-service';

const SaveTextSchema = z.object({
  content: z.string().min(1).max(2_000_000),
  title: z.string().trim().max(160).optional(),
  agentRunId: z.string().optional(),
  status: z.enum(['draft', 'reviewed', 'locked']).default('draft'),
  sourceDocumentId: z.string().optional(),
  storyOutlineId: z.string().optional(),
  waiverReason: z.string().optional(),
});

function normalizeIdentifier(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function resolveProject(identifier: string) {
  await ensureSchema();
  return getProject(normalizeIdentifier(identifier));
}

function nextVersion(
  table: 'story_outlines' | 'adaptation_plans',
  projectId: string,
  scope = 'global',
  episodeIndex?: number,
) {
  const where = episodeIndex === undefined
    ? 'project_id = ? AND scope = ? AND episode_index IS NULL'
    : 'project_id = ? AND scope = ? AND episode_index = ?';
  const args = episodeIndex === undefined ? [projectId, scope] : [projectId, scope, episodeIndex];
  const row = getSqlite()
    .prepare(`SELECT COALESCE(MAX(version_no), 0) AS max_version FROM ${table} WHERE ${where}`)
    .get(...args) as { max_version: number };
  return row.max_version + 1;
}

function latestSourceDocumentId(projectId: string) {
  const row = getSqlite()
    .prepare(
      `SELECT id FROM source_documents
       WHERE project_id = ? AND deleted_at IS NULL
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(projectId) as { id: string } | undefined;
  return row?.id || null;
}

function latestStoryOutlineId(projectId: string) {
  const row = getSqlite()
    .prepare(
      `SELECT id FROM story_outlines
       WHERE project_id = ? AND deleted_at IS NULL
       ORDER BY version_no DESC, updated_at DESC
       LIMIT 1`,
    )
    .get(projectId) as { id: string } | undefined;
  return row?.id || null;
}

function episodeId(projectId: string, episodeIndex?: number) {
  if (!episodeIndex) return null;
  const row = getSqlite()
    .prepare('SELECT id FROM episodes WHERE project_id = ? AND episode_index = ? LIMIT 1')
    .get(projectId, episodeIndex) as { id: string } | undefined;
  return row?.id || null;
}

function mapTextRow(row: {
  id: string;
  content: string;
  title?: string;
  status: string;
  revision: number;
  version_no: number;
  created_at: number;
  updated_at: number;
  scope?: string;
  episode_index?: number | null;
}) {
  return {
    id: row.id,
    title: row.title || '',
    content: row.content,
    status: row.status,
    revision: row.revision,
    versionNo: row.version_no,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    scope: row.scope || 'global',
    episodeIndex: row.episode_index || null,
  };
}

function estimateUsage(content: string, kind: string) {
  const estimatedTokens = Math.ceil(content.length / 2);
  return { totalTokens: estimatedTokens, completionTokens: estimatedTokens, estimatedCost: 0, kind };
}

export async function saveStoryOutline(projectIdentifier: string, rawInput: unknown) {
  const project = await resolveProject(projectIdentifier);
  if (!project) return null;
  const input = SaveTextSchema.extend({
    scope: z.enum(['global', 'episode']).default('global'),
    episodeIndex: z.number().int().positive().optional(),
  }).parse(rawInput);
  const id = randomUUID();
  const artifact = await writeArtifact({
    content: input.content,
    mimeType: 'text/markdown',
    sourceType: input.agentRunId ? 'generated' : 'imported',
    originalName: 'story-outline.md',
    objectType: 'story_outline',
    objectId: id,
  });
  const now = Date.now();
  getSqlite()
    .prepare(
      `INSERT INTO story_outlines
        (id, project_id, source_document_id, agent_run_id, title, content, artifact_id,
         status, revision, version_no, quality_gate_id, scope, episode_id, episode_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      project.id,
      input.sourceDocumentId || latestSourceDocumentId(project.id),
      input.agentRunId || null,
      input.title || '故事骨架',
      input.content,
      artifact.id,
      input.status,
      nextVersion('story_outlines', project.id, input.scope, input.episodeIndex),
      input.scope,
      episodeId(project.id, input.episodeIndex),
      input.episodeIndex || null,
      now,
      now,
    );
  await attachAgentRunOutput(input.agentRunId, {
    artifactId: artifact.id,
    objectType: 'story_outline',
    objectId: id,
    usage: estimateUsage(input.content, 'story_outline'),
  });
  await recordTextImpact(project.id, 'story_outline', id, 'story_outline_updated');
  return { id, artifactId: artifact.id };
}

export async function saveAdaptationPlan(projectIdentifier: string, rawInput: unknown) {
  const project = await resolveProject(projectIdentifier);
  if (!project) return null;
  const input = SaveTextSchema.extend({
    scope: z.enum(['global', 'episode']).default('global'),
    episodeIndex: z.number().int().positive().optional(),
  }).parse(rawInput);
  const id = randomUUID();
  const artifact = await writeArtifact({
    content: input.content,
    mimeType: 'text/markdown',
    sourceType: input.agentRunId ? 'generated' : 'imported',
    originalName: input.episodeIndex ? `adaptation-ep-${input.episodeIndex}.md` : 'adaptation-global.md',
    objectType: 'adaptation_plan',
    objectId: id,
  });
  const now = Date.now();
  getSqlite()
    .prepare(
      `INSERT INTO adaptation_plans
        (id, project_id, story_outline_id, agent_run_id, scope, episode_id, episode_index,
         title, content, artifact_id, status, revision, version_no, quality_gate_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, ?, ?)`,
    )
    .run(
      id,
      project.id,
      input.storyOutlineId || latestStoryOutlineId(project.id),
      input.agentRunId || null,
      input.scope,
      episodeId(project.id, input.episodeIndex),
      input.episodeIndex || null,
      input.title || (input.episodeIndex ? `第${input.episodeIndex}集改编策略` : '全局改编策略'),
      input.content,
      artifact.id,
      input.status,
      nextVersion('adaptation_plans', project.id, input.scope, input.episodeIndex),
      now,
      now,
    );
  await attachAgentRunOutput(input.agentRunId, {
    artifactId: artifact.id,
    objectType: 'adaptation_plan',
    objectId: id,
    usage: estimateUsage(input.content, 'adaptation_plan'),
  });
  await recordTextImpact(project.id, 'adaptation_plan', id, 'adaptation_plan_updated');
  return { id, artifactId: artifact.id };
}

export async function appendAgentConversation(projectIdentifier: string, role: string, content: string) {
  const project = await resolveProject(projectIdentifier);
  if (!project) return null;
  const now = Date.now();
  const id = randomUUID();
  getSqlite()
    .prepare(
      `INSERT INTO agent_conversations
        (id, project_id, role, content, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, '{}', ?, ?)`,
    )
    .run(id, project.id, role, content, now, now);
  return id;
}

export async function listAgentConversations(projectIdentifier: string) {
  const project = await resolveProject(projectIdentifier);
  if (!project) return [];
  const rows = getSqlite()
    .prepare(
      `SELECT role, content, created_at
       FROM agent_conversations
       WHERE project_id = ?
       ORDER BY created_at ASC
       LIMIT 50`,
    )
    .all(project.id) as Array<{ role: string; content: string; created_at: number }>;
  return rows.map((row) => ({ role: row.role, content: row.content, timestamp: row.created_at }));
}

export async function clearAgentConversations(projectIdentifier: string) {
  const project = await resolveProject(projectIdentifier);
  if (!project) return;
  getSqlite().prepare('DELETE FROM agent_conversations WHERE project_id = ?').run(project.id);
}

export async function getLatestStoryOutline(projectIdentifier: string, scope = 'global', episodeIndex?: number) {
  const project = await resolveProject(projectIdentifier);
  if (!project) return '';
  const where = episodeIndex === undefined
    ? 'project_id = ? AND scope = ? AND episode_index IS NULL'
    : 'project_id = ? AND scope = ? AND episode_index = ?';
  const args = episodeIndex === undefined ? [project.id, scope] : [project.id, scope, episodeIndex];
  const row = getSqlite()
    .prepare(
      `SELECT content FROM story_outlines
       WHERE ${where} AND deleted_at IS NULL
       ORDER BY version_no DESC, updated_at DESC
       LIMIT 1`,
    )
    .get(...args) as { content: string } | undefined;
  return row?.content || '';
}

export async function getCombinedStoryOutline(projectIdentifier: string) {
  const project = await resolveProject(projectIdentifier);
  if (!project) return '';
  const rows = getSqlite()
    .prepare(
      `SELECT so.scope, so.episode_index, so.content FROM story_outlines so
       JOIN (
         SELECT scope, COALESCE(episode_index, 0) AS episode_key, MAX(version_no) AS version_no
         FROM story_outlines
         WHERE project_id = ? AND deleted_at IS NULL
         GROUP BY scope, COALESCE(episode_index, 0)
       ) latest
         ON latest.scope = so.scope
        AND latest.episode_key = COALESCE(so.episode_index, 0)
        AND latest.version_no = so.version_no
       WHERE so.project_id = ? AND so.deleted_at IS NULL
       ORDER BY CASE so.scope WHEN 'global' THEN 0 ELSE 1 END, so.episode_index ASC`,
    )
    .all(project.id, project.id) as Array<{ scope: string; episode_index: number | null; content: string }>;
  return rows.map((row) => (
    row.scope === 'episode' && row.episode_index
      ? `## 第${row.episode_index}集骨架\n\n${row.content}`
      : row.content
  )).join('\n\n---\n\n');
}

export async function listStoryOutlineVersions(projectIdentifier: string, scope?: string, episodeIndex?: number) {
  const project = await resolveProject(projectIdentifier);
  if (!project) return [];
  const filters = ['project_id = ?', 'deleted_at IS NULL'];
  const args: Array<string | number> = [project.id];
  if (scope) {
    filters.push('scope = ?');
    args.push(scope);
  }
  if (episodeIndex !== undefined) {
    filters.push('episode_index = ?');
    args.push(episodeIndex);
  }
  const rows = getSqlite()
    .prepare(
      `SELECT id, title, content, status, revision, version_no, scope, episode_index, created_at, updated_at
       FROM story_outlines
       WHERE ${filters.join(' AND ')}
       ORDER BY version_no DESC, updated_at DESC`,
    )
    .all(...args) as Array<{
      id: string;
      title: string;
      content: string;
      status: string;
      revision: number;
      version_no: number;
      scope: string;
      episode_index: number | null;
      created_at: number;
      updated_at: number;
    }>;
  return rows.map(mapTextRow);
}

export async function rollbackStoryOutline(projectIdentifier: string, versionId: string) {
  const project = await resolveProject(projectIdentifier);
  if (!project) throw new Error('项目不存在');
  const row = getSqlite()
    .prepare('SELECT title, content, scope, episode_index FROM story_outlines WHERE project_id = ? AND id = ? AND deleted_at IS NULL')
    .get(project.id, versionId) as { title: string; content: string; scope: 'global' | 'episode'; episode_index: number | null } | undefined;
  if (!row) throw new Error('故事骨架版本不存在');
  return saveStoryOutline(project.id, {
    title: row.title,
    content: row.content,
    scope: row.scope,
    episodeIndex: row.episode_index || undefined,
  });
}

function latestQualityStatus(objectType: string, objectId: string) {
  const row = getSqlite()
    .prepare(
      `SELECT status FROM quality_gates
       WHERE object_type = ? AND object_id = ?
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(objectType, objectId) as { status: string } | undefined;
  return row?.status || 'unchecked';
}

export async function lockStoryOutline(projectIdentifier: string, waiverReason?: string, scope = 'global', episodeIndex?: number) {
  const project = await resolveProject(projectIdentifier);
  if (!project) throw new Error('项目不存在');
  const where = episodeIndex === undefined
    ? 'project_id = ? AND scope = ? AND episode_index IS NULL'
    : 'project_id = ? AND scope = ? AND episode_index = ?';
  const args = episodeIndex === undefined ? [project.id, scope] : [project.id, scope, episodeIndex];
  const row = getSqlite()
    .prepare(
      `SELECT id FROM story_outlines
       WHERE ${where} AND deleted_at IS NULL
       ORDER BY version_no DESC, updated_at DESC
       LIMIT 1`,
    )
    .get(...args) as { id: string } | undefined;
  if (!row) throw new Error('故事骨架不存在');
  const qualityStatus = latestQualityStatus('story_outline', row.id);
  const waiverReasonText = waiverReason?.trim() || '';
  if (qualityStatus !== 'passed' && !waiverReasonText) {
    throw new Error('锁定前必须通过文本质量检查，或填写人工豁免原因');
  }
  const now = Date.now();
  getSqlite()
    .prepare("UPDATE story_outlines SET status = 'locked', updated_at = ? WHERE id = ?")
    .run(now, row.id);
  if (qualityStatus !== 'passed') {
    getSqlite()
      .prepare(
        `INSERT INTO quality_gates
          (id, project_id, object_type, object_id, metric, status, scope_json,
           denominator, passed_count, failed_items_json, confidence, sampling_rule,
           review_source, operator_decision, waiver_reason, created_at, updated_at)
         VALUES (?, ?, 'story_outline', ?, 'text_quality', 'waived', '{}',
          0, 0, '[]', 0, '人工豁免锁定', 'manual_review', 'waived', ?, ?, ?)`,
      )
      .run(randomUUID(), project.id, row.id, waiverReasonText, now, now);
  }
  return { success: true, id: row.id };
}

export async function getLatestAdaptationPlan(projectIdentifier: string, scope = 'global', episodeIndex?: number) {
  const project = await resolveProject(projectIdentifier);
  if (!project) return '';
  const where = episodeIndex === undefined
    ? 'project_id = ? AND scope = ? AND episode_index IS NULL'
    : 'project_id = ? AND scope = ? AND episode_index = ?';
  const args = episodeIndex === undefined ? [project.id, scope] : [project.id, scope, episodeIndex];
  const row = getSqlite()
    .prepare(
      `SELECT content FROM adaptation_plans
       WHERE ${where} AND deleted_at IS NULL
       ORDER BY version_no DESC, updated_at DESC
       LIMIT 1`,
    )
    .get(...args) as { content: string } | undefined;
  return row?.content || '';
}

export async function getCombinedAdaptationPlan(projectIdentifier: string) {
  const project = await resolveProject(projectIdentifier);
  if (!project) return '';
  const rows = getSqlite()
    .prepare(
      `SELECT ap.scope, ap.episode_index, ap.content FROM adaptation_plans ap
       JOIN (
         SELECT scope, COALESCE(episode_index, 0) AS episode_key, MAX(version_no) AS version_no
         FROM adaptation_plans
         WHERE project_id = ? AND deleted_at IS NULL
         GROUP BY scope, COALESCE(episode_index, 0)
       ) latest
         ON latest.scope = ap.scope
        AND latest.episode_key = COALESCE(ap.episode_index, 0)
        AND latest.version_no = ap.version_no
       WHERE ap.project_id = ? AND ap.deleted_at IS NULL
       ORDER BY CASE ap.scope WHEN 'global' THEN 0 ELSE 1 END, ap.episode_index ASC`,
    )
    .all(project.id, project.id) as Array<{ scope: string; episode_index: number | null; content: string }>;
  return rows.map((row) => (
    row.scope === 'episode' && row.episode_index
      ? `## 第${row.episode_index}集改编策略\n\n${row.content}`
      : row.content
  )).join('\n\n---\n\n');
}

export async function listAdaptationPlanVersions(projectIdentifier: string, scope?: string, episodeIndex?: number) {
  const project = await resolveProject(projectIdentifier);
  if (!project) return [];
  const filters = ['project_id = ?', 'deleted_at IS NULL'];
  const args: Array<string | number> = [project.id];
  if (scope) {
    filters.push('scope = ?');
    args.push(scope);
  }
  if (episodeIndex !== undefined) {
    filters.push('episode_index = ?');
    args.push(episodeIndex);
  }
  const rows = getSqlite()
    .prepare(
      `SELECT id, title, content, status, revision, version_no, scope, episode_index, created_at, updated_at
       FROM adaptation_plans
       WHERE ${filters.join(' AND ')}
       ORDER BY version_no DESC, updated_at DESC`,
    )
    .all(...args) as Array<{
      id: string;
      title: string;
      content: string;
      status: string;
      revision: number;
      version_no: number;
      scope: string;
      episode_index: number | null;
      created_at: number;
      updated_at: number;
    }>;
  return rows.map((row) => mapTextRow(row));
}

export async function rollbackAdaptationPlan(projectIdentifier: string, versionId: string) {
  const project = await resolveProject(projectIdentifier);
  if (!project) throw new Error('项目不存在');
  const row = getSqlite()
    .prepare('SELECT title, content, scope, episode_index, story_outline_id FROM adaptation_plans WHERE project_id = ? AND id = ? AND deleted_at IS NULL')
    .get(project.id, versionId) as {
      title: string;
      content: string;
      scope: 'global' | 'episode';
      episode_index: number | null;
      story_outline_id: string | null;
    } | undefined;
  if (!row) throw new Error('改编策略版本不存在');
  return saveAdaptationPlan(project.id, {
    title: row.title,
    content: row.content,
    scope: row.scope,
    episodeIndex: row.episode_index || undefined,
    storyOutlineId: row.story_outline_id || undefined,
  });
}

export async function lockAdaptationPlan(projectIdentifier: string, waiverReason?: string, scope = 'global', episodeIndex?: number) {
  const project = await resolveProject(projectIdentifier);
  if (!project) throw new Error('项目不存在');
  const where = episodeIndex === undefined
    ? 'project_id = ? AND scope = ? AND episode_index IS NULL'
    : 'project_id = ? AND scope = ? AND episode_index = ?';
  const args = episodeIndex === undefined ? [project.id, scope] : [project.id, scope, episodeIndex];
  const row = getSqlite()
    .prepare(
      `SELECT id FROM adaptation_plans
       WHERE ${where} AND deleted_at IS NULL
       ORDER BY version_no DESC, updated_at DESC
       LIMIT 1`,
    )
    .get(...args) as { id: string } | undefined;
  if (!row) throw new Error('改编策略不存在');
  const qualityStatus = latestQualityStatus('adaptation_plan', row.id);
  const waiverReasonText = waiverReason?.trim() || '';
  if (qualityStatus !== 'passed' && !waiverReasonText) {
    throw new Error('锁定前必须通过文本质量检查，或填写人工豁免原因');
  }
  const now = Date.now();
  getSqlite()
    .prepare("UPDATE adaptation_plans SET status = 'locked', updated_at = ? WHERE id = ?")
    .run(now, row.id);
  if (qualityStatus !== 'passed') {
    getSqlite()
      .prepare(
        `INSERT INTO quality_gates
          (id, project_id, object_type, object_id, metric, status, scope_json,
           denominator, passed_count, failed_items_json, confidence, sampling_rule,
           review_source, operator_decision, waiver_reason, created_at, updated_at)
         VALUES (?, ?, 'adaptation_plan', ?, 'text_quality', 'waived', '{}',
          0, 0, '[]', 0, '人工豁免锁定', 'manual_review', 'waived', ?, ?, ?)`,
      )
      .run(randomUUID(), project.id, row.id, waiverReasonText, now, now);
  }
  return { success: true, id: row.id };
}
