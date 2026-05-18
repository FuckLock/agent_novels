import { z } from 'zod';
import {
  createSeedanceAsset,
  deleteSeedanceAsset,
  updateSeedanceAsset,
} from '@/app/lib/novels';
import type { SeedanceAsset } from '@/app/projects/[name]/types';
import { getSqlite, runInTransaction } from '../db/client';
import { ensureSchema } from '../db/migrate';
import { getProject } from '../projects/project-service';
import {
  findAssetRow,
  syncProjectAssets,
  type ProjectRef,
  type VersionedSeedanceAsset,
} from './asset-sync-service';

export type { VersionedSeedanceAsset };

export class AssetServiceError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

const AssetCreateSchema = z.object({
  name: z.string().trim().min(1, '资产名称不能为空').max(120, '资产名称最多 120 个字符'),
  type: z.enum(['character', 'scene', 'prop', 'costume', 'makeup']),
  description: z.string().trim().min(1, '资产描述不能为空').max(4000, '资产描述最多 4000 个字符'),
  identityAnchor: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
});

const AssetUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(4000).optional(),
  identityAnchor: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  prompt: z.string().max(12000).optional(),
  modelId: z.string().max(160).optional(),
  resolution: z.string().max(80).optional(),
  promptState: z.enum(['pending', 'generating', 'completed', 'failed']).optional(),
});

function normalizeIdentifier(identifier: string) {
  try {
    return decodeURIComponent(identifier);
  } catch {
    return identifier;
  }
}

export async function resolveAssetProject(identifier: string): Promise<ProjectRef> {
  await ensureSchema();
  const project = await getProject(normalizeIdentifier(identifier));
  if (!project) throw new AssetServiceError('项目不存在', 404);
  return { id: project.id, name: project.name };
}

function duplicateName(projectId: string, type: string, name: string, excludedId = '') {
  return getSqlite()
    .prepare(
      `SELECT id FROM assets
       WHERE project_id = ? AND type = ? AND lower(name) = lower(?) AND id <> ? AND deleted_at IS NULL
       LIMIT 1`,
    )
    .get(projectId, type, name, excludedId);
}

export async function listAssets(projectIdentifier: string): Promise<VersionedSeedanceAsset[]> {
  const project = await resolveAssetProject(projectIdentifier);
  return syncProjectAssets(project);
}

export async function createAsset(projectIdentifier: string, rawInput: unknown) {
  const project = await resolveAssetProject(projectIdentifier);
  await syncProjectAssets(project);
  const input = AssetCreateSchema.parse(rawInput);
  if (duplicateName(project.id, input.type, input.name)) {
    throw new AssetServiceError('同类型资产已存在同名项，请改名或编辑已有资产', 409);
  }

  const created = await createSeedanceAsset(project.name, input);
  const synced = await syncProjectAssets(project);
  return synced.find((asset) => asset.id === created.id) || created;
}

export async function updateAsset(projectIdentifier: string, assetId: string, rawInput: unknown) {
  const project = await resolveAssetProject(projectIdentifier);
  await syncProjectAssets(project);
  const input = AssetUpdateSchema.parse(rawInput);
  if (input.name) {
    const row = findAssetRow(getSqlite(), project.id, assetId);
    if (duplicateName(project.id, row?.type ?? '', input.name, row?.id ?? '')) {
      throw new AssetServiceError('同类型资产已存在同名项，请改名后重试', 409);
    }
  }

  let updated: SeedanceAsset;
  try {
    updated = await updateSeedanceAsset(project.name, assetId, input);
  } catch (error) {
    if (error instanceof Error && error.message === '资产不存在') {
      throw new AssetServiceError('资产不存在', 404);
    }
    throw error;
  }

  const synced = await syncProjectAssets(project);
  return synced.find((asset) => asset.id === updated.id) || updated;
}

export async function softDeleteAsset(projectIdentifier: string, assetId: string) {
  const project = await resolveAssetProject(projectIdentifier);
  try {
    await deleteSeedanceAsset(project.name, assetId);
  } catch (error) {
    if (error instanceof Error && error.message === '资产不存在') {
      throw new AssetServiceError('资产不存在', 404);
    }
    throw error;
  }
  const now = Date.now();
  runInTransaction((db) => {
    db.prepare("UPDATE assets SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE project_id = ? AND legacy_id = ?")
      .run(now, now, project.id, assetId);
  });
  return { success: true };
}

export function assetErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) return { message: error.issues[0]?.message || '资产参数错误', status: 400 };
  if (error instanceof AssetServiceError) return { message: error.message, status: error.status };
  return { message: '资产操作失败', status: 500 };
}
