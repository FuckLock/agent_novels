import type { Migration } from './types';

export const phase5cMigrations: Migration[] = [
  {
    id: '0006_phase5_text_scope_and_agent_snapshot',
    version: 6,
    statements: [
      "ALTER TABLE story_outlines ADD COLUMN scope TEXT NOT NULL DEFAULT 'global'",
      'ALTER TABLE story_outlines ADD COLUMN episode_id TEXT',
      'ALTER TABLE story_outlines ADD COLUMN episode_index INTEGER',
      "ALTER TABLE adaptation_plans ADD COLUMN title TEXT NOT NULL DEFAULT '改编策略'",
      'ALTER TABLE agent_runs ADD COLUMN snapshot_artifact_id TEXT',
      "ALTER TABLE agent_runs ADD COLUMN output_object_type TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE agent_runs ADD COLUMN output_object_id TEXT NOT NULL DEFAULT ''",
      'CREATE INDEX IF NOT EXISTS story_outlines_scope_idx ON story_outlines (project_id, scope, episode_index, deleted_at)',
      'CREATE INDEX IF NOT EXISTS adaptation_plans_scope_idx ON adaptation_plans (project_id, scope, episode_index, deleted_at)',
    ],
  },
];
