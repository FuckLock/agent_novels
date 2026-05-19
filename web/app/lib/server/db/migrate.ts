import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { getServerEnv } from '../env';
import { getSqlite } from './client';
import { phase2Migrations } from './migrations/phase2';
import { phase3Migrations } from './migrations/phase3';
import { phase4Migrations } from './migrations/phase4';
import { phase5Migrations } from './migrations/phase5';
import { phase5bMigrations } from './migrations/phase5b';
import { phase5cMigrations } from './migrations/phase5c';
import { phase6Migrations } from './migrations/phase6';
import { phase8Migrations } from './migrations/phase8';

export const CURRENT_SCHEMA_VERSION = 8;

const migrations = [
  ...phase2Migrations,
  ...phase3Migrations,
  ...phase4Migrations,
  ...phase5Migrations,
  ...phase5bMigrations,
  ...phase5cMigrations,
  ...phase6Migrations,
  ...phase8Migrations,
];

interface MigrationRow {
  schema_version: number;
  status: string;
}

function hasColumn(db: ReturnType<typeof getSqlite>, table: string, column: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function ensureCompatibilityColumns(db: ReturnType<typeof getSqlite>) {
  const hasSecretRefs = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get('secret_refs');
  if (hasSecretRefs && !hasColumn(db, 'secret_refs', 'secret_ciphertext')) {
    db.exec("ALTER TABLE secret_refs ADD COLUMN secret_ciphertext TEXT NOT NULL DEFAULT ''");
  }
}

function execMigrationStatement(db: ReturnType<typeof getSqlite>, statement: string) {
  const addColumn = statement
    .trim()
    .match(/^ALTER\s+TABLE\s+([A-Za-z0-9_]+)\s+ADD\s+COLUMN\s+([A-Za-z0-9_]+)/i);
  if (addColumn && hasColumn(db, addColumn[1], addColumn[2])) return;
  db.exec(statement);
}

export async function ensureSchema() {
  const env = getServerEnv();
  await fs.mkdir(env.dataRoot, { recursive: true });
  await fs.mkdir(env.artifactsRoot, { recursive: true });

  const db = getSqlite();
  db.exec(
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
  );
  db.transaction(() => {
    for (const migration of migrations) {
      const existing = db
        .prepare('SELECT schema_version, status FROM schema_migrations WHERE migration_id = ?')
        .get(migration.id) as MigrationRow | undefined;

      if (existing?.status === 'applied') {
        ensureCompatibilityColumns(db);
        continue;
      }

      for (const statement of migration.statements) execMigrationStatement(db, statement);
      ensureCompatibilityColumns(db);

      if (!existing) {
        const now = Date.now();
        db.prepare(
          `INSERT INTO schema_migrations
            (id, migration_id, schema_version, status, details_json, applied_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          randomUUID(),
          migration.id,
          migration.version,
          'applied',
          JSON.stringify({ statements: migration.statements.length }),
          now,
          now,
          now,
        );
      } else {
        const now = Date.now();
        db.prepare(
          `UPDATE schema_migrations
           SET schema_version = ?, status = ?, details_json = ?, applied_at = ?, updated_at = ?
           WHERE migration_id = ?`,
        ).run(
          migration.version,
          'applied',
          JSON.stringify({ statements: migration.statements.length }),
          now,
          now,
          migration.id,
        );
      }
    }
  })();

  return getMigrationStatus();
}

export function getMigrationStatus() {
  const env = getServerEnv();
  const rows = getSqlite()
    .prepare('SELECT migration_id, schema_version, status, applied_at FROM schema_migrations ORDER BY applied_at ASC')
    .all() as Array<{ migration_id: string; schema_version: number; status: string; applied_at: number }>;

  const schemaVersion = rows.reduce((max, row) => Math.max(max, row.schema_version), 0);
  return {
    schemaVersion,
    currentSchemaVersion: CURRENT_SCHEMA_VERSION,
    pending: schemaVersion < CURRENT_SCHEMA_VERSION,
    databasePath: env.databasePath,
    migrations: rows,
  };
}
