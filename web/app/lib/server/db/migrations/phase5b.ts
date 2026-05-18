import type { Migration } from './types';

export const phase5bMigrations: Migration[] = [
  {
    id: '0005_phase5_usage_records',
    version: 5,
    statements: [
      `CREATE TABLE IF NOT EXISTS usage_records (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        agent_run_id TEXT,
        model_config_id TEXT,
        object_type TEXT NOT NULL,
        object_id TEXT,
        cost_status TEXT NOT NULL DEFAULT 'estimated',
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        estimated_cost REAL NOT NULL DEFAULT 0,
        actual_cost REAL NOT NULL DEFAULT 0,
        details_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE SET NULL,
        FOREIGN KEY (model_config_id) REFERENCES model_configs(id) ON DELETE SET NULL
      )`,
      'CREATE INDEX IF NOT EXISTS usage_records_project_idx ON usage_records (project_id, object_type, object_id)',
      'CREATE INDEX IF NOT EXISTS usage_records_agent_run_idx ON usage_records (agent_run_id)',
    ],
  },
];
