import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ensureSchema } from '../db/migrate';
import { getSqlite } from '../db/client';
import { getProject } from '../projects/project-service';
import { writeArtifact } from '../artifacts/store';

const AgentRunSchema = z.object({
  action: z.string().trim().min(1),
  agentName: z.string().trim().min(1),
  status: z.enum(['queued', 'running', 'tool_waiting', 'succeeded', 'failed', 'cancelled']).default('succeeded'),
  modelId: z.string().trim().optional(),
  skillName: z.string().trim().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  usage: z.record(z.string(), z.unknown()).optional(),
  errorMessage: z.string().optional(),
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

function resolveSkillVersionId(skillName?: string) {
  if (!skillName) return null;
  const row = getSqlite()
    .prepare(
      `SELECT id FROM skill_versions
       WHERE name = ? AND status = 'active'
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(skillName) as { id: string } | undefined;
  return row?.id || null;
}

function resolveModelConfigId(modelId?: string) {
  if (!modelId) return null;
  const row = getSqlite()
    .prepare(
      `SELECT id FROM model_configs
       WHERE id = ? OR model_id = ?
       ORDER BY is_default DESC, updated_at DESC
       LIMIT 1`,
    )
    .get(modelId, modelId) as { id: string } | undefined;
  return row?.id || null;
}

function numberField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export async function recordAgentRun(projectIdentifier: string, rawInput: unknown) {
  const project = await resolveProject(projectIdentifier);
  if (!project) return null;

  const input = AgentRunSchema.parse(rawInput);
  const now = Date.now();
  const id = randomUUID();
  const completedAt = ['succeeded', 'failed', 'cancelled'].includes(input.status) ? now : null;
  const snapshot = await writeArtifact({
    content: JSON.stringify({ id, projectId: project.id, ...input, createdAt: now }, null, 2),
    mimeType: 'application/json',
    sourceType: 'system',
    originalName: `agent-run-${id}.json`,
    objectType: 'agent_run',
    objectId: id,
  });

  const modelConfigId = resolveModelConfigId(input.modelId);
  getSqlite()
    .prepare(
      `INSERT INTO agent_runs
        (id, project_id, episode_id, skill_version_id, model_config_id, action,
         status, input_json, snapshot_artifact_id, output_artifact_id,
         output_object_type, output_object_id, usage_json, error_message,
         started_at, completed_at, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, '', '', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      project.id,
      resolveSkillVersionId(input.skillName),
      modelConfigId,
      input.action,
      input.status,
      JSON.stringify({
        agentName: input.agentName,
        modelId: input.modelId || null,
        skillName: input.skillName || null,
        ...(input.input || {}),
      }),
      snapshot.id,
      JSON.stringify(input.usage || {}),
      input.errorMessage || '',
      now,
      completedAt,
      now,
      now,
    );

  return id;
}

export async function attachAgentRunOutput(
  agentRunId: string | null | undefined,
  output: { artifactId?: string | null; objectType: string; objectId?: string | null; usage?: Record<string, unknown> },
) {
  if (!agentRunId) return;
  await ensureSchema();
  const db = getSqlite();
  const row = db
    .prepare('SELECT project_id, model_config_id FROM agent_runs WHERE id = ?')
    .get(agentRunId) as { project_id: string; model_config_id: string | null } | undefined;
  if (!row) return;

  const now = Date.now();
  db.prepare(
    `UPDATE agent_runs
     SET output_artifact_id = COALESCE(?, output_artifact_id),
         output_object_type = ?,
         output_object_id = ?,
         status = 'succeeded',
         completed_at = COALESCE(completed_at, ?),
         updated_at = ?
     WHERE id = ?`,
  ).run(output.artifactId || null, output.objectType, output.objectId || '', now, now, agentRunId);

  const usage = output.usage || {};
  db.prepare(
    `INSERT INTO usage_records
      (id, project_id, agent_run_id, model_config_id, object_type, object_id, cost_status,
       prompt_tokens, completion_tokens, total_tokens, estimated_cost, actual_cost,
       details_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'estimated', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    row.project_id,
    agentRunId,
    row.model_config_id,
    output.objectType,
    output.objectId || null,
    numberField(usage, 'promptTokens'),
    numberField(usage, 'completionTokens'),
    numberField(usage, 'totalTokens'),
    numberField(usage, 'estimatedCost'),
    numberField(usage, 'actualCost'),
    JSON.stringify(usage),
    now,
    now,
  );
}
