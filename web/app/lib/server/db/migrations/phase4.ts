import type { Migration } from './types';

export const phase4Migrations: Migration[] = [
  {
    id: '0003_phase4_source_chapters',
    version: 3,
    statements: [
      `CREATE TABLE IF NOT EXISTS source_documents (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        artifact_id TEXT,
        title TEXT NOT NULL,
        source_type TEXT NOT NULL,
        filename TEXT,
        mime_type TEXT NOT NULL DEFAULT 'text/plain',
        char_count INTEGER NOT NULL DEFAULT 0,
        revision INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE SET NULL
      )`,
      'CREATE INDEX IF NOT EXISTS source_documents_project_idx ON source_documents (project_id, deleted_at)',
      `CREATE TABLE IF NOT EXISTS chapters (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        source_document_id TEXT,
        chapter_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        preview TEXT NOT NULL DEFAULT '',
        char_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        revision INTEGER NOT NULL DEFAULT 1,
        stale_reason TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (source_document_id) REFERENCES source_documents(id) ON DELETE SET NULL
      )`,
      'CREATE UNIQUE INDEX IF NOT EXISTS chapters_project_number_idx ON chapters (project_id, chapter_number)',
      'CREATE INDEX IF NOT EXISTS chapters_project_active_idx ON chapters (project_id, deleted_at, chapter_number)',
      `CREATE TABLE IF NOT EXISTS dependency_invalidations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT,
        status TEXT NOT NULL DEFAULT 'needs_regeneration',
        reason TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )`,
      'CREATE INDEX IF NOT EXISTS dependency_invalidations_project_idx ON dependency_invalidations (project_id, source_type, source_id)',
    ],
  },
];
