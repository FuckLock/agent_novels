import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { getServerEnv } from '../env';
import { schema } from './schema';

let sqlite: Database.Database | null = null;

export function getSqlite() {
  if (sqlite) return sqlite;

  const env = getServerEnv();
  fs.mkdirSync(path.dirname(env.databasePath), { recursive: true });

  sqlite = new Database(env.databasePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  return sqlite;
}

export function getDb() {
  return drizzle(getSqlite(), { schema });
}

export function runInTransaction<T>(fn: (db: Database.Database) => T): T {
  return getSqlite().transaction(fn)(getSqlite());
}

export function closeDatabase() {
  if (!sqlite) return;
  sqlite.close();
  sqlite = null;
}
