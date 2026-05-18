import type { Migration } from './types';

export const phase2Migrations: Migration[] = [
  {
    id: '0001_phase2_foundation',
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        migration_id TEXT NOT NULL UNIQUE,
        schema_version INTEGER NOT NULL,
        status TEXT NOT NULL,
        details_json TEXT NOT NULL,
        applied_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        relative_path TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        source_type TEXT NOT NULL,
        object_type TEXT,
        object_id TEXT,
        reference_count INTEGER NOT NULL DEFAULT 0,
        missing INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS artifacts_sha256_idx ON artifacts (sha256)',
      'CREATE INDEX IF NOT EXISTS artifacts_object_idx ON artifacts (object_type, object_id)',
      `CREATE TABLE IF NOT EXISTS runtime_checks (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        trigger TEXT NOT NULL,
        data_root TEXT NOT NULL,
        database_path TEXT NOT NULL,
        artifacts_root TEXT NOT NULL,
        checks_json TEXT NOT NULL,
        summary_json TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS runtime_checks_status_idx ON runtime_checks (status)',
      'CREATE INDEX IF NOT EXISTS runtime_checks_completed_at_idx ON runtime_checks (completed_at)',
    ],
  },
];
