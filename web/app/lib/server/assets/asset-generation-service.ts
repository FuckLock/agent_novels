import { listAssets } from './asset-service';

export async function syncAssetVersions(projectIdentifier: string) {
  const assets = await listAssets(projectIdentifier);
  return {
    synced: assets.length,
    versioned: assets.filter((asset) => (asset.versionCount || 0) > 0).length,
  };
}

export async function recordAssetGenerationSnapshot(projectIdentifier: string) {
  return syncAssetVersions(projectIdentifier);
}

export async function recordAssetPromptSnapshot(projectIdentifier: string) {
  return syncAssetVersions(projectIdentifier);
}
