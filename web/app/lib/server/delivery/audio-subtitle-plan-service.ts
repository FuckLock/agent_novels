// Phase 11 AudioSubtitlePlan Service —— 音频字幕计划生成
//
// 核心硬约束（spec L132 + L338 + L603 + L648 + DEV-PLAN L526）：
//   1. 5 维覆盖（criteria C2）—— 旁白 narration / 台词 dialogue / 嘴型 lip_state /
//      音效 sfx / 字幕时间段 subtitle_timing
//   2. 与 RoughCut 版本关联（criteria C4）—— rough_cut_id 字段必含
//   3. 读 track_segments（criteria C5）—— 时间段来自 Phase 8 schema
//   4. **不调真实 AI**（criteria C6）—— MVP 阶段仅做协议定义 + 占位
//      不允许 HTTP fetch / 远程 LLM provider / HTTP client（C6 反向 grep = 0）
//
// MVP 说明（spec L648 提及 AI 增强由 Phase 11+ 接入）：
//   - 本 MVP 阶段做字段映射 + 占位文本（"Phase 11+ AI 增强" 注释允许）
//   - TrackSegment 的 objective / lip_sync / mood 用作占位生成各维度内容
//   - 真实 AI 文案生成留待 Phase 12+

import { randomUUID } from 'node:crypto';
import { getSqlite } from '../db/client';
import { ensureSchema, CURRENT_SCHEMA_VERSION } from '../db/migrate';
import { writeArtifact } from '../artifacts/store';
import { getRoughCutById } from './roughcut-service';

/**
 * 5 维度字面量常量
 * spec L132 + L338 + L603
 */
export const AUDIO_SUBTITLE_DIMENSIONS = {
  NARRATION: 'narration', // 旁白
  DIALOGUE: 'dialogue', // 台词 / 对白
  LIP_STATE: 'lip_state', // 嘴型
  SFX: 'sfx', // 音效 sound_effect
  SUBTITLE_TIMING: 'subtitle_timing', // 字幕时间段
} as const;

export type AudioSubtitleDimension = (typeof AUDIO_SUBTITLE_DIMENSIONS)[keyof typeof AUDIO_SUBTITLE_DIMENSIONS];

/**
 * 单个 AudioSubtitleSegment —— 与 TrackSegment 时间对齐
 * 含 5 维度内容
 */
export interface AudioSubtitleSegment {
  segmentId: string;
  trackId: string;
  trackSegmentId: string;
  orderIndex: number;
  startTimeMs: number;
  endTimeMs: number;
  // 5 维度内容
  narration: string; // 旁白文案（占位 — Phase 11+ AI 接入）
  dialogue: string; // 台词 / 对白（占位）
  lipState: string; // 嘴型描述（来自 track_segments.lip_sync）
  sfx: string; // 音效（占位）
  subtitleTiming: {
    startTimeMs: number;
    endTimeMs: number;
    text: string; // 字幕文本（占位）
  };
}

export interface AudioSubtitlePlan {
  schemaVersion: number;
  generatedAt: number;
  roughCutId: string;
  projectId: string;
  episodeIndex: number;
  version: number;
  dimensions: readonly AudioSubtitleDimension[]; // 5 维标识
  segments: AudioSubtitleSegment[];
  // MVP 阶段说明：真实 AI 文案生成由 Phase 11+ / Phase 12+ 接入
  mvpNote: string;
}

export interface AudioSubtitlePlanRecord {
  id: string;
  roughCutId: string;
  projectId: string;
  episodeIndex: number;
  version: number;
  plan: AudioSubtitlePlan;
  artifactId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface AudioSubtitlePlanInput {
  roughCutId: string;
}

interface TrackSegmentRow {
  id: string;
  track_id: string;
  segment_order: number;
  start_time_ms: number;
  end_time_ms: number;
  objective: string;
  motion: string;
  shot: string;
  lip_sync: string;
  mood: string;
}

/**
 * 取 RoughCut 包含的所有 Track 对应的 track_segments
 * 按 (track_id, segment_order) 顺序
 *
 * 读 track_segments 表（criteria C5）
 */
function listSegmentsForTracks(trackIds: string[]): TrackSegmentRow[] {
  if (trackIds.length === 0) return [];
  const db = getSqlite();
  const placeholders = trackIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT id, track_id, segment_order, start_time_ms, end_time_ms,
              objective, motion, shot, lip_sync, mood
       FROM track_segments
       WHERE track_id IN (${placeholders}) AND deleted_at IS NULL
       ORDER BY track_id ASC, segment_order ASC, start_time_ms ASC`,
    )
    .all(...trackIds) as TrackSegmentRow[];
  return rows;
}

/**
 * TrackSegment → AudioSubtitleSegment 映射
 *
 * MVP 占位策略（spec L648 — Phase 11+ AI 接入前）：
 *   - narration：objective 内容（"画面表现：{objective}"）
 *   - dialogue：mood 内容（"情绪：{mood}"，无台词时留空 — Phase 12+ AI 增强）
 *   - lipState：来自 track_segments.lip_sync
 *   - sfx：motion 关键词（"动作音效：{motion}"）
 *   - subtitleTiming：start/end + 占位字幕文本
 */
function mapTrackSegmentsToAudioPlan(seg: TrackSegmentRow): AudioSubtitleSegment {
  // MVP 占位 — Phase 11+ AI 增强
  const narration = seg.objective ? `画面表现：${seg.objective}` : '（待 Phase 11+ AI 旁白生成）';
  const dialogue = seg.mood ? `情绪：${seg.mood}` : '（待 Phase 12+ AI 对白生成）';
  const lipState = seg.lip_sync || 'closed';
  const sfx = seg.motion ? `动作音效：${seg.motion}` : '（待 Phase 12+ 音效库映射）';
  const subtitleText = seg.objective || '（字幕占位）';

  return {
    segmentId: randomUUID(),
    trackId: seg.track_id,
    trackSegmentId: seg.id,
    orderIndex: seg.segment_order,
    startTimeMs: seg.start_time_ms,
    endTimeMs: seg.end_time_ms,
    // 5 维度
    narration, // 旁白
    dialogue, // 台词
    lipState, // 嘴型
    sfx, // 音效
    subtitleTiming: {
      startTimeMs: seg.start_time_ms,
      endTimeMs: seg.end_time_ms,
      text: subtitleText,
    },
  };
}

/**
 * 生成 AudioSubtitlePlan —— 入口函数
 *
 * 流程（criteria C3 + C4 + C5）：
 *   1. 验证 RoughCut 存在 + 拿 rough_cut_id 关联
 *   2. 读 RoughCut 包含的 trackIds（含缺口 track）
 *   3. 查这些 trackId 下的 track_segments
 *   4. TrackSegment → AudioSubtitleSegment 映射（5 维）
 *   5. writeArtifact 落 plan JSON
 *   6. INSERT INTO audio_subtitle_plans（与 rough_cut_id 关联）
 *
 * MVP 不调真实 AI — 仅做协议定义 + 占位（criteria C6）
 */
export async function generateAudioSubtitlePlan(
  input: AudioSubtitlePlanInput,
): Promise<AudioSubtitlePlanRecord> {
  await ensureSchema();
  const db = getSqlite();

  const roughCut = getRoughCutById(input.roughCutId);
  if (!roughCut) {
    throw new Error(`RoughCut 不存在：${input.roughCutId}`);
  }

  // 收集 RoughCut 的 trackIds（含缺口的 + 含 locked 的）
  const trackIds = roughCut.tracks.map((t) => t.trackId).filter((id) => !!id);

  const segments = listSegmentsForTracks(trackIds);
  const audioSegments: AudioSubtitleSegment[] = segments.map(mapTrackSegmentsToAudioPlan);

  // 取下一个 version（同 rough_cut 下递增）
  const versionRow = db
    .prepare(
      `SELECT MAX(version) as max_version FROM audio_subtitle_plans
       WHERE rough_cut_id = ? AND deleted_at IS NULL`,
    )
    .get(roughCut.id) as { max_version: number | null } | undefined;
  const version = (versionRow?.max_version ?? 0) + 1;

  const now = Date.now();
  const id = randomUUID();

  const plan: AudioSubtitlePlan = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    generatedAt: now,
    roughCutId: roughCut.id,
    projectId: roughCut.projectId,
    episodeIndex: roughCut.episodeIndex,
    version,
    dimensions: [
      AUDIO_SUBTITLE_DIMENSIONS.NARRATION,
      AUDIO_SUBTITLE_DIMENSIONS.DIALOGUE,
      AUDIO_SUBTITLE_DIMENSIONS.LIP_STATE,
      AUDIO_SUBTITLE_DIMENSIONS.SFX,
      AUDIO_SUBTITLE_DIMENSIONS.SUBTITLE_TIMING,
    ],
    segments: audioSegments,
    mvpNote:
      'MVP 协议定义 only — 5 维占位文案由 track_segments 映射生成；真实 AI 旁白 / 对白 / 音效由 Phase 11+ / Phase 12+ 接入。',
  };

  // writeArtifact 落 plan JSON
  const artifact = await writeArtifact({
    content: JSON.stringify(plan, null, 2),
    mimeType: 'application/json',
    sourceType: 'generated',
    objectType: 'audio_subtitle_plan',
    objectId: id,
    originalName: `audio-subtitle-plan-episode-${roughCut.episodeIndex}-v${version}.json`,
  });

  // INSERT INTO audio_subtitle_plans —— rough_cut_id 关联（criteria C4）
  db.prepare(
    `INSERT INTO audio_subtitle_plans
      (id, rough_cut_id, project_id, episode_index, version, plan_json, artifact_id,
       created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?,
             ?, ?, NULL)`,
  ).run(
    id,
    roughCut.id,
    roughCut.projectId,
    roughCut.episodeIndex,
    version,
    JSON.stringify(plan),
    artifact.id,
    now,
    now,
  );

  return {
    id,
    roughCutId: roughCut.id,
    projectId: roughCut.projectId,
    episodeIndex: roughCut.episodeIndex,
    version,
    plan,
    artifactId: artifact.id,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 列出 RoughCut 关联的所有 AudioSubtitlePlan 版本
 */
export function listAudioSubtitlePlans(roughCutId: string): AudioSubtitlePlanRecord[] {
  const db = getSqlite();
  const rows = db
    .prepare(
      `SELECT * FROM audio_subtitle_plans
       WHERE rough_cut_id = ? AND deleted_at IS NULL
       ORDER BY version DESC`,
    )
    .all(roughCutId) as Array<{
    id: string;
    rough_cut_id: string;
    project_id: string;
    episode_index: number;
    version: number;
    plan_json: string;
    artifact_id: string | null;
    created_at: number;
    updated_at: number;
  }>;

  return rows.map((row) => {
    let plan: AudioSubtitlePlan;
    try {
      plan = JSON.parse(row.plan_json) as AudioSubtitlePlan;
    } catch {
      plan = {} as AudioSubtitlePlan;
    }
    return {
      id: row.id,
      roughCutId: row.rough_cut_id,
      projectId: row.project_id,
      episodeIndex: row.episode_index,
      version: row.version,
      plan,
      artifactId: row.artifact_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

/**
 * 取最新一版 AudioSubtitlePlan
 */
export function getLatestAudioSubtitlePlan(roughCutId: string): AudioSubtitlePlanRecord | null {
  const list = listAudioSubtitlePlans(roughCutId);
  return list[0] ?? null;
}

/**
 * 取指定 id 的 AudioSubtitlePlan
 */
export function getAudioSubtitlePlanById(id: string): AudioSubtitlePlanRecord | null {
  const db = getSqlite();
  const row = db
    .prepare(
      `SELECT * FROM audio_subtitle_plans
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .get(id) as
    | {
        id: string;
        rough_cut_id: string;
        project_id: string;
        episode_index: number;
        version: number;
        plan_json: string;
        artifact_id: string | null;
        created_at: number;
        updated_at: number;
      }
    | undefined;
  if (!row) return null;
  let plan: AudioSubtitlePlan;
  try {
    plan = JSON.parse(row.plan_json) as AudioSubtitlePlan;
  } catch {
    plan = {} as AudioSubtitlePlan;
  }
  return {
    id: row.id,
    roughCutId: row.rough_cut_id,
    projectId: row.project_id,
    episodeIndex: row.episode_index,
    version: row.version,
    plan,
    artifactId: row.artifact_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
