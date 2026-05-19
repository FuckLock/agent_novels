// Phase 11 EpisodeDeliveryPackage Service —— 单集交付包 manifest 生成
//
// 核心硬约束：
//   1. manifest 6 件清单（criteria D3 + spec L605）：
//      - 粗剪视频引用（rough_cut_id / rough_cut_artifact）
//      - locked take 清单（locked_takes）
//      - AudioSubtitlePlan 引用（audio_subtitle_plan_id / artifact）
//      - 素材清单（assets / artifacts）
//      - 剪辑工程清单（project_manifest）
//      - manifest 元数据（schema_version / db_revision / generated_at）
//      + 缺失项检查（missing_check）
//   2. 只读 locked take（criteria D4 — 与 B3 同源；委托 roughcut-service）
//   3. manifest 落盘（criteria D5 — writeArtifact + INSERT INTO）
//   4. **边界硬约束（criteria E1）**：
//      本文件不允许 import / 引用整工程迁移包类型 —— 与 E 段交付物分离
//      整工程迁移包是设置降级页面的迁移包（spec L611），
//      EpisodeDeliveryPackage 是路径 4 主 Tab 的单集交付包
//
// MVP 说明：
//   - 真实 zip 打包由 Phase 12+ 接入；本 MVP 返回 manifest JSON + Artifact 引用清单
//   - ffmpeg 真实视频拼接由 Phase 13+ 接入（roughcut-service 同样降级）

import { randomUUID } from 'node:crypto';
import { getSqlite } from '../db/client';
import { ensureSchema, CURRENT_SCHEMA_VERSION } from '../db/migrate';
import { writeArtifact } from '../artifacts/store';
import { getRoughCutById } from './roughcut-service';
import { getLatestAudioSubtitlePlan, getAudioSubtitlePlanById } from './audio-subtitle-plan-service';

export type EpisodeDeliveryStatus = 'partial' | 'complete' | 'incomplete' | 'sealed';

/**
 * EpisodeDeliveryPackage manifest 6 件清单（spec L605）
 */
export interface EpisodeDeliveryManifest {
  // 元数据
  schemaVersion: number;
  dbRevision: number;
  generatedAt: number;
  // 引用
  projectId: string;
  episodeIndex: number;
  // 1. 粗剪视频引用（rough_cut）
  roughCut: {
    roughCutId: string;
    version: number;
    artifactId: string | null;
    videoArtifactRef: string | null;
    totalDurationSeconds: number;
  };
  // 2. locked take 清单（lockedTakes）
  lockedTakes: Array<{
    takeId: string;
    trackId: string;
    artifactId: string | null;
  }>;
  // 3. AudioSubtitlePlan 引用
  audioSubtitlePlan: {
    audioSubtitlePlanId: string | null;
    version: number | null;
    artifactId: string | null;
    dimensionsCovered: number;
  };
  // 4. 素材清单（asset manifest）— Artifact 引用列表
  assets: Array<{
    artifactId: string;
    role: string; // 'rough_cut_video' / 'locked_take_video' / 'audio_plan' / 'asset' 等
    objectType: string | null;
    objectId: string | null;
  }>;
  // 5. 剪辑工程清单
  projectManifest: {
    projectId: string;
    episodeIndex: number;
    trackPlanId: string | null;
    trackCount: number;
    lockedTakeCount: number;
    missingTrackCount: number;
  };
  // 6. 缺失检查
  missingCheck: {
    hasMissingTracks: boolean;
    missingTrackIds: string[];
    missingArtifacts: string[];
    status: 'ok' | 'has_gaps' | 'failed';
  };
}

export interface EpisodeDeliveryPackageRecord {
  id: string;
  roughCutId: string;
  projectId: string;
  episodeIndex: number;
  audioSubtitlePlanId: string | null;
  status: EpisodeDeliveryStatus;
  manifest: EpisodeDeliveryManifest;
  artifactId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface AssembleDeliveryPackageInput {
  roughCutId: string;
  audioSubtitlePlanId?: string;
}

/**
 * 取 locked take 关联的 artifacts（直接读 artifacts 表）
 *
 * 注意：本函数同样校验 locked=1 + quality_status — criteria D4
 * （直接 SQL 校验 — 与 roughcut-service.B3 同源）
 */
function listLockedTakeArtifacts(
  trackIds: string[],
): Array<{ takeId: string; artifactId: string | null; qualityStatus: string }> {
  if (trackIds.length === 0) return [];
  const db = getSqlite();
  const placeholders = trackIds.map(() => '?').join(',');
  // D4 硬约束：直接 SQL 校验 locked=1 + quality_status
  const rows = db
    .prepare(
      `SELECT id, artifact_id, quality_status FROM takes
       WHERE track_id IN (${placeholders})
         AND quality_status IN ('passed','waived') AND locked = 1`,
    )
    .all(...trackIds) as Array<{ id: string; artifact_id: string | null; quality_status: string }>;
  return rows.map((r) => ({ takeId: r.id, artifactId: r.artifact_id, qualityStatus: r.quality_status }));
}

/**
 * 缺失检查：检查每个 Artifact 是否还存在（artifacts 表 missing = 0）
 *
 * MVP 简化版：只校验 artifact id 在 artifacts 表中存在且 missing=0
 */
function checkMissingArtifacts(artifactIds: string[]): string[] {
  if (artifactIds.length === 0) return [];
  const db = getSqlite();
  const placeholders = artifactIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT id, missing FROM artifacts WHERE id IN (${placeholders})`)
    .all(...artifactIds) as Array<{ id: string; missing: number }>;
  const seen = new Set(rows.filter((r) => r.missing === 0).map((r) => r.id));
  return artifactIds.filter((id) => !seen.has(id));
}

/**
 * 组装 EpisodeDeliveryPackage —— 入口函数
 *
 * 流程（criteria D2-D5）：
 *   1. 取 RoughCut（含 locked_takes / missing_tracks）
 *   2. 取 AudioSubtitlePlan（指定 id 或最新）
 *   3. 收集所有 Artifact 引用（rough_cut artifact + locked take artifacts + plan artifact）
 *   4. 缺失检查（artifacts.missing = 0）
 *   5. 选 status：缺口或缺失 > 0 → 'partial'；否则 'complete'
 *   6. writeArtifact 落 manifest JSON
 *   7. INSERT INTO episode_delivery_packages
 *
 * 边界（criteria E1）：本函数不 import / 引用整工程迁移包类型
 */
export async function assembleDeliveryPackage(
  input: AssembleDeliveryPackageInput,
): Promise<EpisodeDeliveryPackageRecord> {
  await ensureSchema();
  const db = getSqlite();

  const roughCut = getRoughCutById(input.roughCutId);
  if (!roughCut) {
    throw new Error(`RoughCut 不存在：${input.roughCutId}`);
  }

  // 取 AudioSubtitlePlan（指定或最新）
  const audioSubtitlePlanRecord = input.audioSubtitlePlanId
    ? getAudioSubtitlePlanById(input.audioSubtitlePlanId)
    : getLatestAudioSubtitlePlan(roughCut.id);

  // 收集 Artifact 引用
  const trackIds = roughCut.tracks.map((t) => t.trackId);
  const lockedTakeArtifacts = listLockedTakeArtifacts(trackIds);
  const lockedTakeArtifactIds = lockedTakeArtifacts
    .map((t) => t.artifactId)
    .filter((id): id is string => !!id);

  // assets 列表：rough_cut artifact + locked take artifacts + plan artifact
  const assets: EpisodeDeliveryManifest['assets'] = [];
  if (roughCut.artifactId) {
    assets.push({
      artifactId: roughCut.artifactId,
      role: 'rough_cut_manifest',
      objectType: 'rough_cut',
      objectId: roughCut.id,
    });
  }
  for (const lt of lockedTakeArtifacts) {
    if (lt.artifactId) {
      assets.push({
        artifactId: lt.artifactId,
        role: 'locked_take_video',
        objectType: 'take',
        objectId: lt.takeId,
      });
    }
  }
  if (audioSubtitlePlanRecord?.artifactId) {
    assets.push({
      artifactId: audioSubtitlePlanRecord.artifactId,
      role: 'audio_subtitle_plan',
      objectType: 'audio_subtitle_plan',
      objectId: audioSubtitlePlanRecord.id,
    });
  }

  // 缺失检查
  const candidateArtifactIds = assets.map((a) => a.artifactId);
  const missingArtifacts = checkMissingArtifacts(candidateArtifactIds);
  const missingTrackIds = roughCut.missingTracks.map((m) => m.trackId);

  const hasMissingTracks = missingTrackIds.length > 0;
  const hasMissingArtifacts = missingArtifacts.length > 0;
  const status: EpisodeDeliveryStatus = hasMissingTracks || hasMissingArtifacts ? 'partial' : 'complete';
  const missingStatus: 'ok' | 'has_gaps' | 'failed' = hasMissingArtifacts
    ? 'failed'
    : hasMissingTracks
      ? 'has_gaps'
      : 'ok';

  const now = Date.now();
  const id = randomUUID();

  const manifest: EpisodeDeliveryManifest = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    dbRevision: CURRENT_SCHEMA_VERSION,
    generatedAt: now,
    projectId: roughCut.projectId,
    episodeIndex: roughCut.episodeIndex,
    // 1. 粗剪视频引用
    roughCut: {
      roughCutId: roughCut.id,
      version: roughCut.version,
      artifactId: roughCut.artifactId,
      videoArtifactRef: roughCut.manifest.videoArtifactRef ?? null,
      totalDurationSeconds: roughCut.totalDurationSeconds,
    },
    // 2. locked take 清单
    lockedTakes: roughCut.lockedTakes,
    // 3. AudioSubtitlePlan 引用
    audioSubtitlePlan: {
      audioSubtitlePlanId: audioSubtitlePlanRecord?.id ?? null,
      version: audioSubtitlePlanRecord?.version ?? null,
      artifactId: audioSubtitlePlanRecord?.artifactId ?? null,
      dimensionsCovered: audioSubtitlePlanRecord?.plan.dimensions.length ?? 0,
    },
    // 4. 素材清单
    assets,
    // 5. 剪辑工程清单
    projectManifest: {
      projectId: roughCut.projectId,
      episodeIndex: roughCut.episodeIndex,
      trackPlanId: roughCut.trackPlanId,
      trackCount: roughCut.tracks.length,
      lockedTakeCount: roughCut.lockedTakes.length,
      missingTrackCount: roughCut.missingTracks.length,
    },
    // 6. 缺失检查
    missingCheck: {
      hasMissingTracks,
      missingTrackIds,
      missingArtifacts,
      status: missingStatus,
    },
  };

  // writeArtifact 落 manifest（criteria D5）
  const artifact = await writeArtifact({
    content: JSON.stringify(manifest, null, 2),
    mimeType: 'application/json',
    sourceType: 'generated',
    objectType: 'episode_delivery_package',
    objectId: id,
    originalName: `episode-delivery-package-${roughCut.episodeIndex}-v${roughCut.version}.json`,
  });

  // INSERT INTO episode_delivery_packages
  db.prepare(
    `INSERT INTO episode_delivery_packages
      (id, rough_cut_id, project_id, episode_index, audio_subtitle_plan_id, status,
       manifest_json, missing_check_json, schema_version, db_revision, artifact_id,
       created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?,
             ?, ?, ?, ?, ?,
             ?, ?, NULL)`,
  ).run(
    id,
    roughCut.id,
    roughCut.projectId,
    roughCut.episodeIndex,
    audioSubtitlePlanRecord?.id ?? null,
    status,
    JSON.stringify(manifest),
    JSON.stringify(manifest.missingCheck),
    CURRENT_SCHEMA_VERSION,
    CURRENT_SCHEMA_VERSION,
    artifact.id,
    now,
    now,
  );

  return {
    id,
    roughCutId: roughCut.id,
    projectId: roughCut.projectId,
    episodeIndex: roughCut.episodeIndex,
    audioSubtitlePlanId: audioSubtitlePlanRecord?.id ?? null,
    status,
    manifest,
    artifactId: artifact.id,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 列出 RoughCut 关联的所有 EpisodeDeliveryPackage 版本
 */
export function listDeliveryPackages(roughCutId: string): EpisodeDeliveryPackageRecord[] {
  const db = getSqlite();
  const rows = db
    .prepare(
      `SELECT * FROM episode_delivery_packages
       WHERE rough_cut_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC`,
    )
    .all(roughCutId) as Array<{
    id: string;
    rough_cut_id: string;
    project_id: string;
    episode_index: number;
    audio_subtitle_plan_id: string | null;
    status: string;
    manifest_json: string;
    artifact_id: string | null;
    created_at: number;
    updated_at: number;
  }>;
  return rows.map((row) => {
    let manifest: EpisodeDeliveryManifest;
    try {
      manifest = JSON.parse(row.manifest_json) as EpisodeDeliveryManifest;
    } catch {
      manifest = {} as EpisodeDeliveryManifest;
    }
    return {
      id: row.id,
      roughCutId: row.rough_cut_id,
      projectId: row.project_id,
      episodeIndex: row.episode_index,
      audioSubtitlePlanId: row.audio_subtitle_plan_id,
      status: row.status as EpisodeDeliveryStatus,
      manifest,
      artifactId: row.artifact_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

/**
 * 取最新 EpisodeDeliveryPackage
 */
export function getLatestDeliveryPackage(roughCutId: string): EpisodeDeliveryPackageRecord | null {
  const list = listDeliveryPackages(roughCutId);
  return list[0] ?? null;
}

/**
 * 取指定 id 的 EpisodeDeliveryPackage
 */
export function getDeliveryPackageById(id: string): EpisodeDeliveryPackageRecord | null {
  const db = getSqlite();
  const row = db
    .prepare(
      `SELECT * FROM episode_delivery_packages
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .get(id) as
    | {
        id: string;
        rough_cut_id: string;
        project_id: string;
        episode_index: number;
        audio_subtitle_plan_id: string | null;
        status: string;
        manifest_json: string;
        artifact_id: string | null;
        created_at: number;
        updated_at: number;
      }
    | undefined;
  if (!row) return null;
  let manifest: EpisodeDeliveryManifest;
  try {
    manifest = JSON.parse(row.manifest_json) as EpisodeDeliveryManifest;
  } catch {
    manifest = {} as EpisodeDeliveryManifest;
  }
  return {
    id: row.id,
    roughCutId: row.rough_cut_id,
    projectId: row.project_id,
    episodeIndex: row.episode_index,
    audioSubtitlePlanId: row.audio_subtitle_plan_id,
    status: row.status as EpisodeDeliveryStatus,
    manifest,
    artifactId: row.artifact_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
