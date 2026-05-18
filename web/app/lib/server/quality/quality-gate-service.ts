import { randomUUID } from 'node:crypto';
import { ensureSchema } from '../db/migrate';
import { getSqlite } from '../db/client';
import { getProject } from '../projects/project-service';
import type { ReviewResult } from '@/app/lib/novels';

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

function latestScriptId(projectId: string, episode: number) {
  const row = getSqlite()
    .prepare(
      `SELECT id FROM script_versions
       WHERE project_id = ? AND episode_index = ? AND deleted_at IS NULL
       ORDER BY version_no DESC, updated_at DESC
       LIMIT 1`,
    )
    .get(projectId, episode) as { id: string } | undefined;
  return row?.id || null;
}

function latestTextObject(projectId: string, result: ReviewResult) {
  const scope = result.scope === 'episode' ? 'episode' : 'global';
  const episodeIndex = scope === 'episode' ? result.episode : undefined;
  const where = episodeIndex === undefined
    ? 'project_id = ? AND scope = ? AND episode_index IS NULL'
    : 'project_id = ? AND scope = ? AND episode_index = ?';
  const args = episodeIndex === undefined ? [projectId, scope] : [projectId, scope, episodeIndex];

  if (result.type === 'skeleton') {
    const row = getSqlite()
      .prepare(
        `SELECT id FROM story_outlines
         WHERE ${where} AND deleted_at IS NULL
         ORDER BY version_no DESC, updated_at DESC
         LIMIT 1`,
      )
      .get(...args) as { id: string } | undefined;
    return row ? { objectType: 'story_outline', objectId: row.id, table: 'story_outlines' } : null;
  }
  if (result.type === 'adaptation') {
    const row = getSqlite()
      .prepare(
        `SELECT id FROM adaptation_plans
         WHERE ${where} AND deleted_at IS NULL
         ORDER BY version_no DESC, updated_at DESC
         LIMIT 1`,
      )
      .get(...args) as { id: string } | undefined;
    return row ? { objectType: 'adaptation_plan', objectId: row.id, table: 'adaptation_plans' } : null;
  }
  return null;
}

export async function recordQualityGateFromReview(projectIdentifier: string, result: ReviewResult) {
  const project = await resolveProject(projectIdentifier);
  if (!project) return null;

  const textObject = result.type === 'script' && result.episode
    ? { objectType: 'script', objectId: latestScriptId(project.id, result.episode), table: 'script_versions' }
    : latestTextObject(project.id, result);
  const objectId = textObject?.objectId;
  if (!objectId) return null;

  const now = Date.now();
  const id = randomUUID();
  const status = result.status === 'pass' ? 'passed' : 'failed';
  getSqlite()
    .prepare(
      `INSERT INTO quality_gates
        (id, project_id, object_type, object_id, metric, status, scope_json,
         denominator, passed_count, failed_items_json, confidence, sampling_rule,
         review_source, operator_decision, waiver_reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'agent_self_review', ?, '', ?, ?)`,
    )
    .run(
      id,
      project.id,
      textObject.objectType,
      objectId,
      'text_quality',
      status,
      JSON.stringify({ type: result.type, scope: result.scope || null, episode: result.episode || null }),
      result.dimensions.length,
      result.dimensions.filter((dimension) => dimension.score >= 80).length,
      JSON.stringify(result.status === 'pass' ? [] : result.suggestions),
      Math.max(0, Math.min(1, result.totalScore / 100)),
      '文本审核维度评分',
      status,
      now,
      now,
    );

  if (result.type === 'script' && result.episode) {
    getSqlite()
      .prepare(
        `UPDATE script_versions
         SET quality_status = ?, status = CASE WHEN ? = 'passed' THEN 'reviewed' ELSE status END, updated_at = ?
         WHERE id = ?`,
      )
      .run(status, status, now, objectId);
  } else if (textObject.table === 'story_outlines') {
    getSqlite()
      .prepare("UPDATE story_outlines SET quality_gate_id = ?, status = CASE WHEN ? = 'passed' THEN 'reviewed' ELSE status END, updated_at = ? WHERE id = ?")
      .run(id, status, now, objectId);
  } else if (textObject.table === 'adaptation_plans') {
    getSqlite()
      .prepare("UPDATE adaptation_plans SET quality_gate_id = ?, status = CASE WHEN ? = 'passed' THEN 'reviewed' ELSE status END, updated_at = ? WHERE id = ?")
      .run(id, status, now, objectId);
  }

  return id;
}
