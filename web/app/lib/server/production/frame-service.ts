// runtime: nodejs
// frame-service: 制作 Frame（首帧 / 尾帧 / 关键帧 / 承接帧）CRUD + 锁定
//
// 4 帧类型（spec L222 + L274 + Phase 8 策略对应）：
//   - start_frame:    首帧（视频起点）
//   - end_frame:      尾帧（视频终点）
//   - keyframe:       关键帧（中间锚点）
//   - continuation:   承接帧（上一段尾帧抽取）
//   - anchor:         锚点帧（其他用途，预留）
//
// 抽帧能力（D5）：extractContinuationFrame 占位 — 实际帧抽取算法 Phase 10 接入

import { randomUUID } from 'node:crypto';
import { ensureSchema } from '../db/migrate';
import { getSqlite } from '../db/client';
import { writeArtifact, type ArtifactRecord } from '../artifacts/store';

export type FrameType = 'start_frame' | 'end_frame' | 'keyframe' | 'continuation' | 'anchor';
export type FrameSource = 'generated' | 'uploaded' | 'extracted';

export interface ProductionFrameRecord {
  id: string;
  trackId: string;
  projectId: string;
  frameType: FrameType;
  artifactId: string | null;
  source: FrameSource;
  orderIndex: number;
  timestampMs: number;
  locked: boolean;
  lockedAt: number | null;
  notes: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

interface ProductionFrameRow {
  id: string;
  track_id: string;
  project_id: string;
  frame_type: string;
  artifact_id: string | null;
  source: string;
  order_index: number;
  timestamp_ms: number;
  locked: number;
  locked_at: number | null;
  notes: string;
  metadata_json: string;
  created_at: number;
  updated_at: number;
}

function parseMetadata(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function mapRow(row: ProductionFrameRow): ProductionFrameRecord {
  return {
    id: row.id,
    trackId: row.track_id,
    projectId: row.project_id,
    frameType: row.frame_type as FrameType,
    artifactId: row.artifact_id,
    source: row.source as FrameSource,
    orderIndex: row.order_index,
    timestampMs: row.timestamp_ms,
    locked: Boolean(row.locked),
    lockedAt: row.locked_at,
    notes: row.notes,
    metadata: parseMetadata(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 列出某 Track 的所有 Frame（按 frameType + orderIndex 排序）
 */
export async function listFrames(trackId: string): Promise<ProductionFrameRecord[]> {
  await ensureSchema();
  const rows = getSqlite()
    .prepare(
      `SELECT * FROM production_frames
       WHERE track_id = ?
       ORDER BY frame_type ASC, order_index ASC, created_at ASC`,
    )
    .all(trackId) as ProductionFrameRow[];
  return rows.map(mapRow);
}

export const getProductionFrames = listFrames;

/**
 * 按 frameType 过滤 Frame
 */
export async function listFramesByType(
  trackId: string,
  frameType: FrameType,
): Promise<ProductionFrameRecord[]> {
  await ensureSchema();
  const rows = getSqlite()
    .prepare(
      `SELECT * FROM production_frames
       WHERE track_id = ? AND frame_type = ?
       ORDER BY order_index ASC, created_at ASC`,
    )
    .all(trackId, frameType) as ProductionFrameRow[];
  return rows.map(mapRow);
}

interface CreateFrameInput {
  trackId: string;
  projectId: string;
  frameType: FrameType;
  source: FrameSource;
  artifactId?: string;
  orderIndex?: number;
  timestampMs?: number;
  notes?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 创建 Frame（不上传图片；只是登记一条 production_frames 记录）
 */
export async function createFrame(input: CreateFrameInput): Promise<ProductionFrameRecord> {
  await ensureSchema();
  const id = randomUUID();
  const now = Date.now();
  const db = getSqlite();
  let orderIndex = input.orderIndex;
  if (typeof orderIndex !== 'number') {
    const maxRow = db
      .prepare(
        `SELECT MAX(order_index) AS max_idx FROM production_frames
         WHERE track_id = ? AND frame_type = ?`,
      )
      .get(input.trackId, input.frameType) as { max_idx: number | null };
    orderIndex = (maxRow.max_idx ?? -1) + 1;
  }

  db.prepare(
    `INSERT INTO production_frames
      (id, track_id, project_id, frame_type, artifact_id, source, order_index,
       timestamp_ms, locked, locked_at, notes, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?)`,
  ).run(
    id,
    input.trackId,
    input.projectId,
    input.frameType,
    input.artifactId || null,
    input.source,
    orderIndex,
    input.timestampMs || 0,
    input.notes || '',
    JSON.stringify(input.metadata || {}),
    now,
    now,
  );

  const row = db.prepare('SELECT * FROM production_frames WHERE id = ?').get(id) as ProductionFrameRow;
  return mapRow(row);
}

interface UploadFrameInput {
  trackId: string;
  projectId: string;
  frameType: FrameType;
  content: Buffer | Uint8Array | string;
  mimeType: string;
  originalName?: string;
  source?: FrameSource;
  orderIndex?: number;
  timestampMs?: number;
  notes?: string;
}

/**
 * 上传图片 → 写 Artifact → 登记 Frame 记录
 * spec L274：用户可上传首帧 / 尾帧
 */
export async function uploadFrame(input: UploadFrameInput): Promise<{ frame: ProductionFrameRecord; artifact: ArtifactRecord }> {
  const artifact = await writeArtifact({
    content: input.content,
    mimeType: input.mimeType,
    sourceType: 'uploaded',
    originalName: input.originalName,
    objectType: 'production_frame',
  });
  const frame = await createFrame({
    trackId: input.trackId,
    projectId: input.projectId,
    frameType: input.frameType,
    source: input.source || 'uploaded',
    artifactId: artifact.id,
    orderIndex: input.orderIndex,
    timestampMs: input.timestampMs,
    notes: input.notes,
    metadata: { mimeType: input.mimeType, sizeBytes: artifact.sizeBytes },
  });
  return { frame, artifact };
}

/**
 * 生成 Frame — 由视频任务回填（source='generated'）
 */
export async function generateFrame(input: CreateFrameInput): Promise<ProductionFrameRecord> {
  return createFrame({ ...input, source: input.source || 'generated' });
}

/**
 * 锁定 Frame — 锁定后不可修改 / 删除
 * spec L334：D 阶段需用户确认 + 锁定
 */
export async function lockFrame(frameId: string): Promise<ProductionFrameRecord> {
  await ensureSchema();
  const now = Date.now();
  const db = getSqlite();
  db.prepare(
    `UPDATE production_frames SET locked = 1, locked_at = ?, updated_at = ? WHERE id = ?`,
  ).run(now, now, frameId);
  const row = db.prepare('SELECT * FROM production_frames WHERE id = ?').get(frameId) as ProductionFrameRow | undefined;
  if (!row) throw new Error('Frame 不存在');
  return mapRow(row);
}

export const sealFrame = lockFrame;

/**
 * 设置锁定状态（同时支持解锁）
 */
export async function setLocked(frameId: string, locked: boolean): Promise<void> {
  await ensureSchema();
  const now = Date.now();
  getSqlite()
    .prepare(`UPDATE production_frames SET locked = ?, locked_at = ?, updated_at = ? WHERE id = ?`)
    .run(locked ? 1 : 0, locked ? now : null, now, frameId);
}

/**
 * 抽帧 — 从上一段 Take 抽取尾帧作为本段 continuation Frame
 * spec L223 continue_from_previous 策略所需
 *
 * 占位实现：暂不调用 ffmpeg / 视频帧抽取库；仅在 metadata 标记需 Phase 10 接入
 * TODO: Phase 10 接入 真实 ffmpeg 帧抽取
 */
export async function extractContinuationFrame(input: {
  trackId: string;
  projectId: string;
  sourceTakeId: string;
  sourceArtifactId?: string;
  timestampMs?: number;
}): Promise<ProductionFrameRecord> {
  // 占位 — Phase 10 接入 ffmpeg 实际帧抽取算法
  // 当前：仅登记一条 frame 记录，artifactId 为空，等真实抽帧落地后再回填
  return createFrame({
    trackId: input.trackId,
    projectId: input.projectId,
    frameType: 'continuation',
    source: 'extracted',
    timestampMs: input.timestampMs || 0,
    notes: 'Phase 10 接入 真实抽帧算法（ffmpeg）',
    metadata: {
      sourceTakeId: input.sourceTakeId,
      sourceArtifactId: input.sourceArtifactId || null,
      extractionPending: true,
      todoPhase: 10,
    },
  });
}

/** 别名 — extractEndFrame */
export const extractEndFrame = extractContinuationFrame;

/**
 * 删除 Frame（仅未锁定时允许）
 */
export async function deleteFrame(frameId: string): Promise<void> {
  await ensureSchema();
  const db = getSqlite();
  const row = db.prepare('SELECT locked FROM production_frames WHERE id = ?').get(frameId) as
    | { locked: number }
    | undefined;
  if (!row) return;
  if (row.locked) throw new Error('Frame 已锁定，不可删除');
  db.prepare('DELETE FROM production_frames WHERE id = ?').run(frameId);
}
