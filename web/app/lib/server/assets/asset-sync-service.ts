import { createHash, randomUUID } from 'node:crypto';
import { getSeedanceAssets } from '@/app/lib/novels';
import type { SeedanceAsset, SeedanceAssetType } from '@/app/projects/[name]/types';
import { getSqlite, runInTransaction } from '../db/client';

export interface ProjectRef {
  id: string;
  name: string;
}

export interface AssetRow {
  id: string;
  project_id: string;
  legacy_id: string;
  type: SeedanceAssetType;
  name: string;
  canonical_version_id: string | null;
}

export interface VersionRow {
  id: string;
  version_no: number;
  source: string;
  prompt: string;
  image_path: string;
  image_url: string;
  model_id: string;
  resolution: string;
  status: string;
  metadata_json: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export type VersionedSeedanceAsset = SeedanceAsset & {
  assetRecordId?: string;
  canonicalVersionId?: string | null;
  latestVersionId?: string | null;
  canonicalVersionNo?: number | null;
  versionCount?: number;
  duplicateNameHint?: boolean;
};

export function json(value: unknown) {
  return JSON.stringify(value ?? {});
}

function versionSignature(asset: SeedanceAsset) {
  return createHash('sha256')
    .update(JSON.stringify({
      prompt: asset.prompt || '',
      artStyle: asset.artStyle || '',
      state: asset.state,
      imagePath: asset.imagePath || '',
      generatedAt: asset.generatedAt || '',
      modelId: asset.modelId || '',
      resolution: asset.resolution || '',
      apiTaskId: asset.apiTaskId || '',
    }))
    .digest('hex');
}

function versionSource(asset: SeedanceAsset): string {
  if (asset.state === 'success' && asset.imagePath) return 'generated';
  if (asset.prompt) return 'prompt_candidate';
  return 'manual';
}

function seedanceFields(asset: SeedanceAsset) {
  return {
    description: asset.description || '',
    identityAnchor: asset.identityAnchor || [],
    prompt: asset.prompt || '',
    artStyle: asset.artStyle || '',
    metadata: {
      sourceEpisode: asset.sourceEpisode || '',
      episodeRefs: asset.episodeRefs || [],
      seedanceState: asset.state,
      promptState: asset.promptState || '',
    },
  };
}

export function findAssetRow(db: ReturnType<typeof getSqlite>, projectId: string, assetId: string) {
  return db
    .prepare(
      `SELECT * FROM assets
       WHERE project_id = ? AND deleted_at IS NULL AND (id = ? OR legacy_id = ?)
       LIMIT 1`,
    )
    .get(projectId, assetId, assetId) as AssetRow | undefined;
}

export function latestVersion(db: ReturnType<typeof getSqlite>, assetId: string) {
  return db
    .prepare(
      `SELECT * FROM asset_versions
       WHERE asset_id = ? AND deleted_at IS NULL
       ORDER BY version_no DESC
       LIMIT 1`,
    )
    .get(assetId) as VersionRow | undefined;
}

function insertVersionFromSeedance(db: ReturnType<typeof getSqlite>, projectId: string, row: AssetRow, asset: SeedanceAsset) {
  const signature = versionSignature(asset);
  const latest = latestVersion(db, row.id);
  if (latest) {
    try {
      const metadata = JSON.parse(latest.metadata_json) as { signature?: string };
      if (metadata.signature === signature) return latest.id;
    } catch {
      // fall through and record a fresh version
    }
  }

  const now = Date.now();
  const versionNo = latest ? latest.version_no + 1 : 1;
  const versionId = randomUUID();
  db.prepare(
    `INSERT INTO asset_versions
      (id, project_id, asset_id, version_no, source, prompt, image_path, image_url,
       model_id, resolution, status, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)`,
  ).run(
    versionId,
    projectId,
    row.id,
    versionNo,
    versionSource(asset),
    asset.prompt || '',
    asset.imagePath || '',
    asset.modelId || '',
    asset.resolution || '',
    'candidate',
    json({
      signature,
      legacyId: asset.id,
      generatedAt: asset.generatedAt,
      apiTaskId: asset.apiTaskId,
      seedanceState: asset.state,
      error: asset.error || '',
    }),
    now,
    now,
  );
  return versionId;
}

function upsertSeedanceAsset(db: ReturnType<typeof getSqlite>, projectId: string, asset: SeedanceAsset) {
  const fields = seedanceFields(asset);
  const now = Date.now();
  let row = db
    .prepare('SELECT * FROM assets WHERE project_id = ? AND legacy_id = ? LIMIT 1')
    .get(projectId, asset.id) as AssetRow | undefined;

  if (!row) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO assets
        (id, project_id, legacy_id, type, name, description, identity_anchor_json,
         prompt, art_style, status, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    ).run(id, projectId, asset.id, asset.type, asset.name, fields.description, json(fields.identityAnchor),
      fields.prompt, fields.artStyle, json(fields.metadata), now, now);
    row = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as AssetRow;
  } else {
    db.prepare(
      `UPDATE assets
       SET type = ?, name = ?, description = ?, identity_anchor_json = ?, prompt = ?,
           art_style = ?, status = 'active', metadata_json = ?, deleted_at = NULL, updated_at = ?
       WHERE id = ?`,
    ).run(asset.type, asset.name, fields.description, json(fields.identityAnchor), fields.prompt,
      fields.artStyle, json(fields.metadata), now, row.id);
    row = db.prepare('SELECT * FROM assets WHERE id = ?').get(row.id) as AssetRow;
  }

  insertVersionFromSeedance(db, projectId, row, asset);
  return row;
}

function versionStats(db: ReturnType<typeof getSqlite>, row: AssetRow) {
  const stats = db
    .prepare('SELECT COUNT(*) AS count FROM asset_versions WHERE asset_id = ? AND deleted_at IS NULL')
    .get(row.id) as { count: number };
  const latest = latestVersion(db, row.id);
  const canonical = row.canonical_version_id
    ? db.prepare('SELECT * FROM asset_versions WHERE id = ?').get(row.canonical_version_id) as VersionRow | undefined
    : undefined;
  return { count: stats.count, latest, canonical };
}

function enrichAsset(db: ReturnType<typeof getSqlite>, projectId: string, asset: SeedanceAsset): VersionedSeedanceAsset {
  const row = findAssetRow(db, projectId, asset.id);
  if (!row) return asset;
  const stats = versionStats(db, row);
  return {
    ...asset,
    assetRecordId: row.id,
    canonicalVersionId: row.canonical_version_id,
    latestVersionId: stats.latest?.id ?? null,
    canonicalVersionNo: stats.canonical?.version_no ?? null,
    versionCount: stats.count,
  };
}

export async function syncProjectAssets(project: ProjectRef) {
  const assets = await getSeedanceAssets(project.name);
  runInTransaction((db) => {
    for (const asset of assets) upsertSeedanceAsset(db, project.id, asset);
  });
  const db = getSqlite();
  return assets.map((asset) => enrichAsset(db, project.id, asset));
}

export function setCanonicalRaw(db: ReturnType<typeof getSqlite>, assetId: string, versionId: string) {
  const now = Date.now();
  db.prepare("UPDATE asset_versions SET status = 'candidate', updated_at = ? WHERE asset_id = ? AND status = 'canonical'")
    .run(now, assetId);
  db.prepare("UPDATE asset_versions SET status = 'canonical', updated_at = ? WHERE id = ? AND asset_id = ?")
    .run(now, versionId, assetId);
  db.prepare('UPDATE assets SET canonical_version_id = ?, updated_at = ? WHERE id = ?')
    .run(versionId, now, assetId);
}
