import { randomUUID } from 'node:crypto';
import type { ScriptAssetsData } from '@/app/lib/novels';
import { getSqlite, runInTransaction } from '../db/client';
import { ensureSchema } from '../db/migrate';
import { getProject } from '../projects/project-service';
import { AssetServiceError, listAssets } from './asset-service';

type AssetGroup = keyof ScriptAssetsData;

interface ProjectRef {
  id: string;
  name: string;
}

interface LinkRow {
  id: string;
  asset_id: string;
  asset_version_id: string;
  episode_index: number;
  role: string;
  source: string;
  asset_name: string;
  legacy_id: string;
  asset_type: string;
  canonical_version_id: string | null;
  version_no: number;
}

interface TimelineEntry {
  id: string;
  assetId: string;
  assetRecordId: string;
  assetVersionId: string;
  episodeIndex: number;
  appearanceType: string;
  riskLevel: string;
  summary: string;
  asset: {
    id: string;
    name: string;
    type: string;
    canonicalVersionId: string | null;
  };
  versionNo: number;
  flags: string[];
  trackReferences: Array<{ episodeIndex: number; role: string; source: string }>;
}

const GROUP_TO_TYPE: Record<AssetGroup, string> = {
  characters: 'character',
  scenes: 'scene',
  props: 'prop',
  costumes: 'costume',
  makeup: 'makeup',
};

function normalizeIdentifier(identifier: string) {
  try {
    return decodeURIComponent(identifier);
  } catch {
    return identifier;
  }
}

async function resolveProject(identifier: string): Promise<ProjectRef> {
  await ensureSchema();
  const project = await getProject(normalizeIdentifier(identifier));
  if (!project) throw new AssetServiceError('项目不存在', 404);
  return { id: project.id, name: project.name };
}

function latestScriptVersionId(projectId: string, episode: number) {
  const row = getSqlite()
    .prepare(
      `SELECT id FROM script_versions
       WHERE project_id = ? AND episode_index = ? AND deleted_at IS NULL
       ORDER BY version_no DESC
       LIMIT 1`,
    )
    .get(projectId, episode) as { id: string } | undefined;
  return row?.id ?? null;
}

function assetSummaryForLinks(links: Array<{ group: AssetGroup; name: string; assetId: string; assetVersionId: string }>) {
  return {
    characters: links.filter((link) => link.group === 'characters'),
    scenes: links.filter((link) => link.group === 'scenes'),
    props: links.filter((link) => link.group === 'props'),
    costumes: links.filter((link) => link.group === 'costumes'),
    makeup: links.filter((link) => link.group === 'makeup'),
  };
}

export async function syncScriptAssetLinks(projectIdentifier: string, episode: number, assets: ScriptAssetsData) {
  const project = await resolveProject(projectIdentifier);
  const versionedAssets = await listAssets(project.name);
  const scriptVersionId = latestScriptVersionId(project.id, episode);
  const links: Array<{ group: AssetGroup; name: string; assetId: string; assetVersionId: string }> = [];

  for (const group of Object.keys(GROUP_TO_TYPE) as AssetGroup[]) {
    const type = GROUP_TO_TYPE[group];
    for (const name of assets[group] || []) {
      const asset = versionedAssets.find((item) => item.type === type && item.name === name);
      const assetId = asset?.assetRecordId;
      const assetVersionId = asset?.canonicalVersionId;
      if (!assetId || !assetVersionId) continue;
      links.push({ group, name, assetId, assetVersionId });
    }
  }

  runInTransaction((db) => {
    const now = Date.now();
    db.prepare('DELETE FROM script_asset_links WHERE project_id = ? AND episode_index = ?').run(project.id, episode);
    const insert = db.prepare(
      `INSERT INTO script_asset_links
        (id, project_id, script_version_id, asset_id, asset_version_id, episode_index,
         role, source, confidence, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'reference', 'manual_script_assets', 1, ?, ?)`,
    );
    for (const link of links) {
      insert.run(randomUUID(), project.id, scriptVersionId, link.assetId, link.assetVersionId, episode, now, now);
    }
    if (scriptVersionId) {
      db.prepare('UPDATE script_versions SET asset_summary_json = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(assetSummaryForLinks(links)), now, scriptVersionId);
    }
  });

  return { success: true, linked: links.length };
}

function readLinkRows(projectId: string) {
  return getSqlite()
    .prepare(
      `SELECT l.*, a.name AS asset_name, a.legacy_id, a.type AS asset_type,
              a.canonical_version_id, v.version_no
       FROM script_asset_links l
       JOIN assets a ON a.id = l.asset_id
       JOIN asset_versions v ON v.id = l.asset_version_id
       WHERE l.project_id = ? AND a.deleted_at IS NULL
       ORDER BY a.type ASC, a.name ASC, l.episode_index ASC`,
    )
    .all(projectId) as LinkRow[];
}

function classify(row: LinkRow, previousVersionId: string | null, isFirst: boolean) {
  const flags: string[] = [];
  let appearanceType = isFirst ? 'new' : 'reuse';
  let riskLevel = 'low';
  if (!isFirst && previousVersionId !== row.asset_version_id) {
    const isVisualContinuitySensitive = ['character', 'costume', 'makeup'].includes(row.asset_type);
    appearanceType = isVisualContinuitySensitive ? 'drift_risk' : 'variant';
    flags.push('variant');
    if (isVisualContinuitySensitive) flags.push('drift_risk');
    riskLevel = isVisualContinuitySensitive ? 'high' : 'medium';
  }
  if (row.canonical_version_id && row.asset_version_id !== row.canonical_version_id) {
    appearanceType = 'canonical_mismatch';
    flags.push('canonical_mismatch');
    riskLevel = 'high';
  }
  return { appearanceType, riskLevel, flags };
}

function summarize(row: LinkRow, appearanceType: string) {
  const version = `v${row.version_no}`;
  if (appearanceType === 'new') return `第 ${row.episode_index} 集首次使用 ${row.asset_name} ${version}`;
  if (appearanceType === 'reuse') return `第 ${row.episode_index} 集复用 ${row.asset_name} ${version}`;
  if (appearanceType === 'variant') return `第 ${row.episode_index} 集使用 ${row.asset_name} 的不同版本 ${version}`;
  if (appearanceType === 'drift_risk') return `第 ${row.episode_index} 集使用 ${row.asset_name} 的不同人物/造型版本 ${version}，存在视觉漂移风险`;
  return `第 ${row.episode_index} 集引用版本不是当前正片版本，需复核 ${row.asset_name} ${version}`;
}

export async function buildIpTimeline(projectIdentifier: string) {
  const project = await resolveProject(projectIdentifier);
  await listAssets(project.name);
  const rows = readLinkRows(project.id);
  const entries: TimelineEntry[] = [];
  const byAsset = new Map<string, LinkRow[]>();

  for (const row of rows) {
    const list = byAsset.get(row.asset_id) || [];
    list.push(row);
    byAsset.set(row.asset_id, list);
  }

  for (const assetRows of byAsset.values()) {
    let previousVersionId: string | null = null;
    assetRows.forEach((row, index) => {
      const classified = classify(row, previousVersionId, index === 0);
      previousVersionId = row.asset_version_id;
      const summary = summarize(row, classified.appearanceType);
      entries.push({
        id: randomUUID(),
        assetId: row.legacy_id || row.asset_id,
        assetRecordId: row.asset_id,
        assetVersionId: row.asset_version_id,
        episodeIndex: row.episode_index,
        appearanceType: classified.appearanceType,
        riskLevel: classified.riskLevel,
        summary,
        asset: {
          id: row.legacy_id || row.asset_id,
          name: row.asset_name,
          type: row.asset_type,
          canonicalVersionId: row.canonical_version_id,
        },
        versionNo: row.version_no,
        flags: classified.flags,
        trackReferences: [{ episodeIndex: row.episode_index, role: row.role, source: row.source }],
      });
    });
  }

  persistTimeline(project.id, entries);
  return {
    project: { id: project.id, name: project.name },
    entries: entries.sort((a, b) => a.episodeIndex - b.episodeIndex || a.asset.name.localeCompare(b.asset.name)),
    summary: {
      total: entries.length,
      reuse: entries.filter((entry) => entry.appearanceType === 'reuse').length,
      variants: entries.filter((entry) => entry.appearanceType === 'variant').length,
      driftRisks: entries.filter((entry) => entry.appearanceType === 'drift_risk').length,
      canonicalMismatches: entries.filter((entry) => entry.appearanceType === 'canonical_mismatch').length,
    },
  };
}

function persistTimeline(projectId: string, entries: TimelineEntry[]) {
  runInTransaction((db) => {
    const now = Date.now();
    db.prepare('DELETE FROM ip_asset_timeline_entries WHERE project_id = ?').run(projectId);
    const insert = db.prepare(
      `INSERT INTO ip_asset_timeline_entries
        (id, project_id, asset_id, asset_version_id, episode_index, appearance_type,
         risk_level, summary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const entry of entries) {
      insert.run(
        entry.id,
        projectId,
        entry.assetRecordId,
        entry.assetVersionId,
        entry.episodeIndex,
        entry.appearanceType,
        entry.riskLevel,
        entry.summary,
        now,
        now,
      );
    }
  });
}
