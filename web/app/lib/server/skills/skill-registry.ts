import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ensureSchema } from '../db/migrate';
import { getSqlite } from '../db/client';

interface SkillCandidate {
  name: string;
  category: 'novel-runtime' | 'codex-agent';
  version: string;
  path: string;
  checksum: string;
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function getRepoRoot() {
  const cwd = process.cwd();
  return path.basename(cwd) === 'web' ? path.dirname(cwd) : cwd;
}

function versionFromContent(content: string) {
  return content.match(/^version:\s*([^\n]+)/m)?.[1]?.trim() || '1.0.0';
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readSkillFile(filePath: string, category: SkillCandidate['category']) {
  const content = await fs.readFile(filePath, 'utf-8');
  const relativePath = path.relative(getRepoRoot(), filePath);
  const basename = path.basename(filePath, path.extname(filePath));
  const dirName = path.basename(path.dirname(filePath));
  const name = basename === 'SKILL' ? dirName : basename;
  return {
    name,
    category,
    version: versionFromContent(content),
    path: relativePath,
    checksum: hash(content),
  };
}

async function scanNovelRuntimeSkills(root: string) {
  if (!(await fileExists(root))) return [];
  const candidates: SkillCandidate[] = [];
  const walk = async (dir: string) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        candidates.push(await readSkillFile(entryPath, 'novel-runtime'));
      }
    }
  };

  await walk(root);
  return candidates;
}

async function scanCodexAgentSkills(root: string) {
  if (!(await fileExists(root))) return [];
  const candidates: SkillCandidate[] = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(root, entry.name, 'SKILL.md');
    if (await fileExists(skillPath)) {
      candidates.push(await readSkillFile(skillPath, 'codex-agent'));
    }
  }
  return candidates;
}

export async function registerDefaultSkillVersions() {
  await ensureSchema();
  const repoRoot = getRepoRoot();
  const [novelSkills, codexSkills] = await Promise.all([
    scanNovelRuntimeSkills(path.join(repoRoot, 'skills')),
    scanCodexAgentSkills(path.join(repoRoot, '.agents', 'skills')),
  ]);
  const skills = [...novelSkills, ...codexSkills];
  const now = Date.now();
  const db = getSqlite();

  db.transaction(() => {
    const statement = db.prepare(
      `INSERT INTO skill_versions
        (id, name, category, version, status, path, checksum, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
       ON CONFLICT(name, version, path) DO UPDATE SET
        category = excluded.category,
        status = 'active',
        checksum = excluded.checksum,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at`,
    );

    for (const skill of skills) {
      statement.run(
        hash(`${skill.category}:${skill.path}:${skill.version}`),
        skill.name,
        skill.category,
        skill.version,
        skill.path,
        skill.checksum,
        JSON.stringify({ source: skill.category }),
        now,
        now,
      );
    }
  })();

  return { registered: skills.length };
}
