// Phase 11 RoughCut Service —— 单集粗剪组装
//
// 核心硬约束（spec L78 + L450 + L601 + L608 + DEV-PLAN L525/L543）：
//   1. 只读 locked take —— SQL 强制 quality_status IN ('passed','waived') AND locked=1
//      绝不能读 'unchecked' 或 'failed' take（criteria B3）
//   2. 缺失 Track 显示缺口 —— missing_tracks 字段；缺口 ≥ 1 时 status = 'partial'
//      不能标 'complete' / 'sealed'（criteria B4）
//   3. manifest 落盘 —— writeArtifact 写 JSON manifest（criteria B5）
//
// 设计选择：
//   - assembleRoughCut(projectId, episodeIndex) 是入口函数
//   - 内部按 track_plans → tracks → takes(locked) 顺序查询
//   - 缺口检测：所有 tracks 中没有 locked take 的 → 加入 missing_tracks
//   - status 选择：缺口 > 0 → 'partial'；缺口 = 0 → 'complete'
//   - manifest 含 episodeIndex / trackPlanId / version / tracks / lockedTakes /
//     missingTracks / totalDurationSeconds / generatedAt / schemaVersion / dbRevision

import { randomUUID } from 'node:crypto';
import { getSqlite } from '../db/client';
import { ensureSchema, CURRENT_SCHEMA_VERSION } from '../db/migrate';
import { writeArtifact } from '../artifacts/store';

export interface RoughCutTrackEntry {
  trackId: string;
  orderIndex: number;
  objective: string;
  durationSeconds: number;
  takeId: string | null;
  artifactId: string | null;
  qualityStatus: string;
  lockedAt: number | null;
}

export interface RoughCutMissingTrack {
  trackId: string;
  orderIndex: number;
  objective: string;
  reason: string; // 缺口原因：'no_locked_take' / 'no_passed_quality' 等
}

export type RoughCutStatus = 'partial' | 'complete' | 'incomplete' | 'has_gaps' | 'sealed';

export interface RoughCutAssembleInput {
  projectId: string;
  episodeIndex?: number;
}

export interface RoughCutRecord {
  id: string;
  projectId: string;
  episodeIndex: number;
  trackPlanId: string | null;
  version: number;
  status: RoughCutStatus;
  tracks: RoughCutTrackEntry[];
  lockedTakes: Array<{ takeId: string; trackId: string; artifactId: string | null }>;
  missingTracks: RoughCutMissingTrack[];
  totalDurationSeconds: number;
  manifest: RoughCutManifest;
  artifactId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface RoughCutManifest {
  schemaVersion: number;
  dbRevision: number;
  generatedAt: number;
  projectId: string;
  episodeIndex: number;
  trackPlanId: string | null;
  version: number;
  status: RoughCutStatus;
  tracks: RoughCutTrackEntry[];
  lockedTakes: Array<{ takeId: string; trackId: string; artifactId: string | null }>;
  missingTracks: RoughCutMissingTrack[];
  totalDurationSeconds: number;
  // Phase 13+ 接入 ffmpeg 完整导出后填充
  videoArtifactRef: string | null;
}

interface TrackRow {
  id: string;
  track_plan_id: string;
  project_id: string;
  order_index: number;
  objective: string;
  duration_seconds: number;
  status: string;
}

interface LockedTakeRow {
  id: string;
  track_id: string;
  artifact_id: string | null;
  quality_status: string;
  locked: number;
  locked_at: number | null;
}

interface TrackPlanRow {
  id: string;
  project_id: string;
  episode_index: number;
}

/**
 * 找到指定 episode 的最新 TrackPlan
 */
function findLatestTrackPlan(projectId: string, episodeIndex: number): TrackPlanRow | null {
  const db = getSqlite();
  const row = db
    .prepare(
      `SELECT id, project_id, episode_index FROM track_plans
       WHERE project_id = ? AND episode_index = ? AND deleted_at IS NULL
       ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(projectId, episodeIndex) as TrackPlanRow | undefined;
  return row ?? null;
}

/**
 * 查 TrackPlan 下所有 Track（按 order_index 升序）
 */
function listTracks(trackPlanId: string): TrackRow[] {
  const db = getSqlite();
  const rows = db
    .prepare(
      `SELECT id, track_plan_id, project_id, order_index, objective, duration_seconds, status
       FROM tracks
       WHERE track_plan_id = ? AND deleted_at IS NULL
       ORDER BY order_index ASC`,
    )
    .all(trackPlanId) as TrackRow[];
  return rows;
}

/**
 * 只读 locked take —— B3 核心硬约束
 *
 * SQL: quality_status IN ('passed','waived') AND locked = 1
 * （spec L78 + L450 + L601 + L608 — 绝不能读 unchecked / failed take）
 *
 * 每个 Track 取最新的 locked take（按 locked_at desc）
 */
function findLockedTakeForTrack(trackId: string): LockedTakeRow | null {
  const db = getSqlite();
  // 严格只读 locked take（quality_status IN ('passed','waived') AND locked=1）
  // 双条件 AND；反向角度不允许读 unchecked / failed
  const row = db
    .prepare(
      `SELECT id, track_id, artifact_id, quality_status, locked, locked_at
       FROM takes
       WHERE track_id = ?
         AND quality_status IN ('passed','waived') AND locked = 1
       ORDER BY locked_at DESC, updated_at DESC
       LIMIT 1`,
    )
    .get(trackId) as LockedTakeRow | undefined;
  return row ?? null;
}

/**
 * 组装 RoughCut —— 入口函数
 *
 * 流程（spec L601 + DEV-PLAN L525/L543）：
 *   1. 找最新 TrackPlan（episode_index）
 *   2. 列出全部 Track（order_index 升序）
 *   3. 每个 Track 查 locked take（B3 SQL）
 *   4. 没有 locked take 的 Track → 加入 missing_tracks（B4 缺口语义）
 *   5. 选 status：缺口 > 0 → 'partial'；否则 'complete'
 *   6. writeArtifact 落 manifest JSON
 *   7. INSERT INTO rough_cuts
 */
export async function assembleRoughCut(input: RoughCutAssembleInput): Promise<RoughCutRecord> {
  await ensureSchema();
  const db = getSqlite();
  const projectId = input.projectId;
  const episodeIndex = input.episodeIndex ?? 1;

  const trackPlan = findLatestTrackPlan(projectId, episodeIndex);
  const tracks = trackPlan ? listTracks(trackPlan.id) : [];

  const trackEntries: RoughCutTrackEntry[] = [];
  const lockedTakes: Array<{ takeId: string; trackId: string; artifactId: string | null }> = [];
  const missingTracks: RoughCutMissingTrack[] = [];
  let totalDurationSeconds = 0;

  for (const track of tracks) {
    const lockedTake = findLockedTakeForTrack(track.id);
    if (lockedTake) {
      trackEntries.push({
        trackId: track.id,
        orderIndex: track.order_index,
        objective: track.objective,
        durationSeconds: track.duration_seconds,
        takeId: lockedTake.id,
        artifactId: lockedTake.artifact_id,
        qualityStatus: lockedTake.quality_status,
        lockedAt: lockedTake.locked_at,
      });
      lockedTakes.push({
        takeId: lockedTake.id,
        trackId: track.id,
        artifactId: lockedTake.artifact_id,
      });
      totalDurationSeconds += track.duration_seconds || 0;
    } else {
      // 缺口检测：Track 没有 locked take（criteria B4）
      missingTracks.push({
        trackId: track.id,
        orderIndex: track.order_index,
        objective: track.objective,
        reason: 'no_locked_take',
      });
      trackEntries.push({
        trackId: track.id,
        orderIndex: track.order_index,
        objective: track.objective,
        durationSeconds: track.duration_seconds,
        takeId: null,
        artifactId: null,
        qualityStatus: 'unchecked',
        lockedAt: null,
      });
    }
  }

  // status 选择（缺口 > 0 → 'partial'）
  // 不允许 missingTracks.length > 0 而 status = 'complete'/'sealed'（B4 硬约束）
  const hasGap = missingTracks.length > 0;
  const status: RoughCutStatus = hasGap ? 'partial' : 'complete';

  // 取下一个 version（同 episode 下递增）
  const versionRow = db
    .prepare(
      `SELECT MAX(version) as max_version FROM rough_cuts
       WHERE project_id = ? AND episode_index = ? AND deleted_at IS NULL`,
    )
    .get(projectId, episodeIndex) as { max_version: number | null } | undefined;
  const version = (versionRow?.max_version ?? 0) + 1;

  const now = Date.now();
  const id = randomUUID();

  const manifest: RoughCutManifest = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    dbRevision: CURRENT_SCHEMA_VERSION,
    generatedAt: now,
    projectId,
    episodeIndex,
    trackPlanId: trackPlan?.id ?? null,
    version,
    status,
    tracks: trackEntries,
    lockedTakes,
    missingTracks,
    totalDurationSeconds,
    // ffmpeg 真实视频拼接 — Phase 13+ 接入完整导出（MVP manifest-only）
    videoArtifactRef: null,
  };

  // writeArtifact 落盘 manifest JSON（criteria B5）
  // mimeType: 'application/json'
  const artifact = await writeArtifact({
    content: JSON.stringify(manifest, null, 2),
    mimeType: 'application/json',
    sourceType: 'generated',
    objectType: 'rough_cut',
    objectId: id,
    originalName: `rough-cut-episode-${episodeIndex}-v${version}.json`,
  });

  db.prepare(
    `INSERT INTO rough_cuts
      (id, project_id, episode_id, episode_index, track_plan_id, version, status,
       missing_tracks_json, locked_takes_json, total_duration_seconds, manifest_json, artifact_id,
       created_at, updated_at, deleted_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?,
             ?, ?, ?, ?, ?,
             ?, ?, NULL)`,
  ).run(
    id,
    projectId,
    episodeIndex,
    trackPlan?.id ?? null,
    version,
    status,
    JSON.stringify(missingTracks),
    JSON.stringify(lockedTakes),
    totalDurationSeconds,
    JSON.stringify(manifest),
    artifact.id,
    now,
    now,
  );

  return {
    id,
    projectId,
    episodeIndex,
    trackPlanId: trackPlan?.id ?? null,
    version,
    status,
    tracks: trackEntries,
    lockedTakes,
    missingTracks,
    totalDurationSeconds,
    manifest,
    artifactId: artifact.id,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 列出 episode 的 RoughCut 历史版本
 */
export function listRoughCuts(projectId: string, episodeIndex: number): RoughCutRecord[] {
  const db = getSqlite();
  const rows = db
    .prepare(
      `SELECT * FROM rough_cuts
       WHERE project_id = ? AND episode_index = ? AND deleted_at IS NULL
       ORDER BY version DESC`,
    )
    .all(projectId, episodeIndex) as Array<{
    id: string;
    project_id: string;
    episode_index: number;
    track_plan_id: string | null;
    version: number;
    status: string;
    missing_tracks_json: string;
    locked_takes_json: string;
    total_duration_seconds: number;
    manifest_json: string;
    artifact_id: string | null;
    created_at: number;
    updated_at: number;
  }>;

  return rows.map((row) => {
    let manifest: RoughCutManifest;
    try {
      manifest = JSON.parse(row.manifest_json) as RoughCutManifest;
    } catch {
      manifest = {} as RoughCutManifest;
    }
    let missingTracks: RoughCutMissingTrack[] = [];
    try {
      missingTracks = JSON.parse(row.missing_tracks_json) as RoughCutMissingTrack[];
    } catch {
      missingTracks = [];
    }
    let lockedTakes: Array<{ takeId: string; trackId: string; artifactId: string | null }> = [];
    try {
      lockedTakes = JSON.parse(row.locked_takes_json) as Array<{
        takeId: string;
        trackId: string;
        artifactId: string | null;
      }>;
    } catch {
      lockedTakes = [];
    }
    return {
      id: row.id,
      projectId: row.project_id,
      episodeIndex: row.episode_index,
      trackPlanId: row.track_plan_id,
      version: row.version,
      status: row.status as RoughCutStatus,
      tracks: manifest.tracks || [],
      lockedTakes,
      missingTracks,
      totalDurationSeconds: row.total_duration_seconds,
      manifest,
      artifactId: row.artifact_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

/**
 * 取最新一版 RoughCut（用于 EpisodeDeliveryPackage 组装）
 */
export function getLatestRoughCut(projectId: string, episodeIndex: number): RoughCutRecord | null {
  const list = listRoughCuts(projectId, episodeIndex);
  return list[0] ?? null;
}

/**
 * 取指定 id 的 RoughCut
 */
export function getRoughCutById(roughCutId: string): RoughCutRecord | null {
  const db = getSqlite();
  const row = db
    .prepare(
      `SELECT * FROM rough_cuts
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .get(roughCutId) as
    | {
        id: string;
        project_id: string;
        episode_index: number;
        track_plan_id: string | null;
        version: number;
        status: string;
        missing_tracks_json: string;
        locked_takes_json: string;
        total_duration_seconds: number;
        manifest_json: string;
        artifact_id: string | null;
        created_at: number;
        updated_at: number;
      }
    | undefined;
  if (!row) return null;
  let manifest: RoughCutManifest;
  try {
    manifest = JSON.parse(row.manifest_json) as RoughCutManifest;
  } catch {
    manifest = {} as RoughCutManifest;
  }
  let missingTracks: RoughCutMissingTrack[] = [];
  try {
    missingTracks = JSON.parse(row.missing_tracks_json) as RoughCutMissingTrack[];
  } catch {
    missingTracks = [];
  }
  let lockedTakes: Array<{ takeId: string; trackId: string; artifactId: string | null }> = [];
  try {
    lockedTakes = JSON.parse(row.locked_takes_json) as Array<{
      takeId: string;
      trackId: string;
      artifactId: string | null;
    }>;
  } catch {
    lockedTakes = [];
  }
  return {
    id: row.id,
    projectId: row.project_id,
    episodeIndex: row.episode_index,
    trackPlanId: row.track_plan_id,
    version: row.version,
    status: row.status as RoughCutStatus,
    tracks: manifest.tracks || [],
    lockedTakes,
    missingTracks,
    totalDurationSeconds: row.total_duration_seconds,
    manifest,
    artifactId: row.artifact_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
