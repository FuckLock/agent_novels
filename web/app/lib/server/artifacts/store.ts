import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import isPathInside from 'is-path-inside';
import { getServerEnv } from '../env';
import { getSqlite } from '../db/client';
import { ensureSchema } from '../db/migrate';

export type ArtifactSourceType = 'generated' | 'uploaded' | 'extracted' | 'imported' | 'reused' | 'system';

export interface ArtifactRecord {
  id: string;
  relativePath: string;
  sha256: string;
  mimeType: string;
  sizeBytes: number;
  sourceType: ArtifactSourceType;
  objectType: string | null;
  objectId: string | null;
  referenceCount: number;
  missing: boolean;
  createdAt: number;
  updatedAt: number;
}

interface WriteArtifactInput {
  content: Buffer | Uint8Array | string;
  mimeType: string;
  sourceType: ArtifactSourceType;
  originalName?: string;
  objectType?: string;
  objectId?: string;
}

const MIME_EXTENSIONS: Record<string, string> = {
  'application/json': '.json',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
};

function toBuffer(content: Buffer | Uint8Array | string) {
  if (typeof content === 'string') return Buffer.from(content, 'utf8');
  return Buffer.isBuffer(content) ? content : Buffer.from(content);
}

function getExtension(mimeType: string, originalName?: string) {
  const fromMime = MIME_EXTENSIONS[mimeType];
  if (fromMime) return fromMime;
  const fromName = originalName ? path.extname(originalName).toLowerCase() : '';
  return fromName && fromName.length <= 12 ? fromName : '.bin';
}

function assertInsideArtifactsRoot(filePath: string) {
  const root = getServerEnv().artifactsRoot;
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(filePath);
  if (resolvedPath !== resolvedRoot && !isPathInside(resolvedPath, resolvedRoot)) {
    throw new Error('Artifact path escaped artifactsRoot');
  }
}

export async function writeArtifact(input: WriteArtifactInput): Promise<ArtifactRecord> {
  await ensureSchema();

  const env = getServerEnv();
  const buffer = toBuffer(input.content);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const relativePath = path.join(sha256.slice(0, 2), `${sha256}${getExtension(input.mimeType, input.originalName)}`);
  const absolutePath = path.join(env.artifactsRoot, relativePath);
  assertInsideArtifactsRoot(absolutePath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer, { flag: 'wx' }).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') return;
    throw error;
  });

  const now = Date.now();
  const id = randomUUID();
  getSqlite()
    .prepare(
      `INSERT INTO artifacts
        (id, relative_path, sha256, mime_type, size_bytes, source_type, object_type, object_id,
         reference_count, missing, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      relativePath,
      sha256,
      input.mimeType,
      buffer.byteLength,
      input.sourceType,
      input.objectType || null,
      input.objectId || null,
      1,
      0,
      now,
      now,
    );

  return {
    id,
    relativePath,
    sha256,
    mimeType: input.mimeType,
    sizeBytes: buffer.byteLength,
    sourceType: input.sourceType,
    objectType: input.objectType || null,
    objectId: input.objectId || null,
    referenceCount: 1,
    missing: false,
    createdAt: now,
    updatedAt: now,
  };
}

export async function checkArtifactRepository() {
  await ensureSchema();
  const env = getServerEnv();
  await fs.mkdir(env.artifactsRoot, { recursive: true });

  const tempPath = path.join(env.artifactsRoot, '.runtime-write-check');
  assertInsideArtifactsRoot(tempPath);
  await fs.writeFile(tempPath, String(Date.now()));
  await fs.unlink(tempPath);

  const row = getSqlite()
    .prepare('SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes FROM artifacts')
    .get() as { count: number; bytes: number } | undefined;

  const artifacts = getSqlite()
    .prepare('SELECT id, relative_path FROM artifacts')
    .all() as Array<{ id: string; relative_path: string }>;
  const updateMissing = getSqlite().prepare('UPDATE artifacts SET missing = ?, updated_at = ? WHERE id = ?');

  let missingCount = 0;
  for (const artifact of artifacts) {
    const artifactPath = path.join(env.artifactsRoot, artifact.relative_path);
    assertInsideArtifactsRoot(artifactPath);
    const exists = await fs.access(artifactPath).then(() => true).catch(() => false);
    if (!exists) missingCount += 1;
    updateMissing.run(exists ? 0 : 1, Date.now(), artifact.id);
  }

  return {
    root: env.artifactsRoot,
    writable: true,
    artifactCount: row?.count ?? 0,
    sizeBytes: row?.bytes ?? 0,
    missingCount,
  };
}
