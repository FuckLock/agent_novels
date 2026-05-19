import type { Migration } from './types';

// Phase 8 migration: D 阶段 TrackPlan + 策略系统 + 视频能力矩阵
//
// 新建 4 张表：
//   - track_plans         一个 episode 对应一份 TrackPlan
//   - tracks              单段 Track（含策略 / 时长 / 资源引用）
//   - track_segments      Track 内时间段细分（0-2s / 2-6s 等，spec L271）
//   - video_capabilities  策略 × 模型能力矩阵（DB 缓存层；默认值由代码常量提供）
//
// 所有表用 CREATE TABLE IF NOT EXISTS（沿用 Phase 4+ 幂等模式）

export const phase8Migrations: Migration[] = [
  {
    id: '0008_phase8_track_plan_strategy',
    version: 8,
    statements: [
      // ============================================================
      // 1. track_plans —— 单 episode 对应一份 TrackPlan
      // ============================================================
      `CREATE TABLE IF NOT EXISTS track_plans (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        episode_id TEXT,
        episode_index INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'draft',
        revision INTEGER NOT NULL DEFAULT 1,
        strategy_summary_json TEXT NOT NULL DEFAULT '{}',
        budget_estimate_json TEXT NOT NULL DEFAULT '{}',
        locked_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )`,
      'CREATE INDEX IF NOT EXISTS track_plans_project_idx ON track_plans (project_id, episode_index, deleted_at)',

      // ============================================================
      // 2. tracks —— 单段 Track（spec L222 / L271）
      // ============================================================
      `CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY,
        track_plan_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        episode_id TEXT,
        order_index INTEGER NOT NULL DEFAULT 0,
        objective TEXT NOT NULL DEFAULT '',
        motion TEXT NOT NULL DEFAULT '',
        shot TEXT NOT NULL DEFAULT '',
        lip_sync TEXT NOT NULL DEFAULT '',
        mood TEXT NOT NULL DEFAULT '',
        reference_assets_json TEXT NOT NULL DEFAULT '[]',
        duration_seconds REAL NOT NULL DEFAULT 0,
        strategy TEXT NOT NULL DEFAULT 'start_frame',
        strategy_reason TEXT NOT NULL DEFAULT '',
        dependency_status TEXT NOT NULL DEFAULT 'blocked',
        dependency_missing_json TEXT NOT NULL DEFAULT '[]',
        revision INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'draft',
        locked_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        FOREIGN KEY (track_plan_id) REFERENCES track_plans(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )`,
      'CREATE INDEX IF NOT EXISTS tracks_plan_order_idx ON tracks (track_plan_id, order_index, deleted_at)',
      'CREATE INDEX IF NOT EXISTS tracks_project_idx ON tracks (project_id, status, deleted_at)',
      'CREATE INDEX IF NOT EXISTS tracks_strategy_idx ON tracks (strategy, dependency_status)',

      // ============================================================
      // 3. track_segments —— Track 内时间段细分（spec L271，0-2s / 2-6s 等）
      // ============================================================
      `CREATE TABLE IF NOT EXISTS track_segments (
        id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        segment_order INTEGER NOT NULL DEFAULT 0,
        start_time_ms INTEGER NOT NULL DEFAULT 0,
        end_time_ms INTEGER NOT NULL DEFAULT 0,
        objective TEXT NOT NULL DEFAULT '',
        motion TEXT NOT NULL DEFAULT '',
        shot TEXT NOT NULL DEFAULT '',
        lip_sync TEXT NOT NULL DEFAULT '',
        mood TEXT NOT NULL DEFAULT '',
        reference_assets_json TEXT NOT NULL DEFAULT '[]',
        properties_json TEXT NOT NULL DEFAULT '{}',
        revision INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )`,
      'CREATE INDEX IF NOT EXISTS track_segments_track_order_idx ON track_segments (track_id, segment_order, deleted_at)',

      // ============================================================
      // 4. video_capabilities —— 模型 × 策略能力矩阵（spec L325，DB 缓存层）
      // ============================================================
      `CREATE TABLE IF NOT EXISTS video_capabilities (
        id TEXT PRIMARY KEY,
        model_id TEXT NOT NULL,
        strategy TEXT NOT NULL,
        supported INTEGER NOT NULL DEFAULT 0,
        max_references INTEGER NOT NULL DEFAULT 0,
        max_duration_seconds REAL NOT NULL DEFAULT 0,
        max_resolution TEXT NOT NULL DEFAULT '',
        aspect_ratios_json TEXT NOT NULL DEFAULT '[]',
        notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      'CREATE UNIQUE INDEX IF NOT EXISTS video_capabilities_model_strategy_idx ON video_capabilities (model_id, strategy)',
      'CREATE INDEX IF NOT EXISTS video_capabilities_strategy_idx ON video_capabilities (strategy, supported)',
    ],
  },
];
