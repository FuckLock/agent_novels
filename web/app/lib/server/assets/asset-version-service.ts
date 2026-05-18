import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSqlite, runInTransaction } from '../db/client';
import { AssetServiceError, resolveAssetProject } from './asset-service';
import {
  findAssetRow,
  json,
  latestVersion,
  setCanonicalRaw,
  syncProjectAssets,
  type VersionRow,
} from './asset-sync-service';

const VersionCreateSchema = z.object({
  source: z.enum(['manual', 'uploaded', 'generated', 'frame_extract', 'replacement', 'prompt_candidate']).optional(),
  prompt: z.string().max(12000).optional(),
  imagePath: z.string().max(1000).optional(),
  imageUrl: z.string().max(2000).optional(),
  modelId: z.string().max(160).optional(),
  resolution: z.string().max(80).optional(),
  status: z.enum(['candidate', 'canonical', 'locked', 'rejected', 'archived']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function safeJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function trackReferences(versionId: string) {
  return getSqlite()
    .prepare(
      `SELECT episode_index, role, source
       FROM script_asset_links
       WHERE asset_version_id = ?
       ORDER BY episode_index ASC`,
    )
    .all(versionId) as Array<{ episode_index: number; role: string; source: string }>;
}

async function resolveAsset(projectIdentifier: string, assetId: string) {
  const project = await resolveAssetProject(projectIdentifier);
  await syncProjectAssets(project);
  const row = findAssetRow(getSqlite(), project.id, assetId);
  if (!row) throw new AssetServiceError('资产不存在', 404);
  return { project, row };
}

export async function listAssetVersions(projectIdentifier: string, assetId: string) {
  const { row } = await resolveAsset(projectIdentifier, assetId);
  const versions = getSqlite()
    .prepare(
      `SELECT * FROM asset_versions
       WHERE asset_id = ? AND deleted_at IS NULL
       ORDER BY version_no DESC`,
    )
    .all(row.id) as VersionRow[];
  return {
    assetId: row.legacy_id || row.id,
    assetRecordId: row.id,
    canonicalVersionId: row.canonical_version_id,
    versions: versions.map((version) => ({
      id: version.id,
      versionNo: version.version_no,
      source: version.source,
      prompt: version.prompt,
      imagePath: version.image_path,
      imageUrl: version.image_url,
      modelId: version.model_id,
      resolution: version.resolution,
      status: version.id === row.canonical_version_id ? 'canonical' : version.status,
      metadata: safeJson(version.metadata_json),
      authorization: (safeJson(version.metadata_json) as { authorization?: string }).authorization || '未记录授权',
      trackReferences: trackReferences(version.id).map((link) => ({
        episodeIndex: link.episode_index,
        role: link.role,
        source: link.source,
      })),
      createdAt: new Date(version.created_at).toISOString(),
      updatedAt: new Date(version.updated_at).toISOString(),
    })),
  };
}

export async function createAssetVersion(projectIdentifier: string, assetId: string, rawInput: unknown) {
  const { project, row } = await resolveAsset(projectIdentifier, assetId);
  const input = VersionCreateSchema.parse(rawInput);
  const versionId = runInTransaction((db) => {
    const latest = latestVersion(db, row.id);
    const now = Date.now();
    const id = randomUUID();
    db.prepare(
      `INSERT INTO asset_versions
        (id, project_id, asset_id, version_no, source, prompt, image_path, image_url,
         model_id, resolution, status, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      project.id,
      row.id,
      latest ? latest.version_no + 1 : 1,
      input.source || 'manual',
      input.prompt || '',
      input.imagePath || '',
      input.imageUrl || '',
      input.modelId || '',
      input.resolution || '',
      input.status || 'candidate',
      json(input.metadata || {}),
      now,
      now,
    );
    if (input.status === 'canonical') setCanonicalRaw(db, row.id, id);
    return id;
  });
  return { success: true, versionId };
}

export async function setCanonicalVersion(projectIdentifier: string, assetId: string, versionId: string) {
  const { row } = await resolveAsset(projectIdentifier, assetId);
  const version = getSqlite()
    .prepare('SELECT id FROM asset_versions WHERE id = ? AND asset_id = ? AND deleted_at IS NULL')
    .get(versionId, row.id);
  if (!version) throw new AssetServiceError('资产版本不存在', 404);
  runInTransaction((db) => setCanonicalRaw(db, row.id, versionId));
  return { success: true, canonicalVersionId: versionId };
}

export async function archiveAssetVersion(projectIdentifier: string, assetId: string, versionId: string) {
  const { row } = await resolveAsset(projectIdentifier, assetId);
  if (row.canonical_version_id === versionId) throw new AssetServiceError('不能归档当前正片版本', 409);
  const now = Date.now();
  getSqlite()
    .prepare("UPDATE asset_versions SET status = 'archived', deleted_at = ?, updated_at = ? WHERE id = ? AND asset_id = ?")
    .run(now, now, versionId, row.id);
  return { success: true };
}
