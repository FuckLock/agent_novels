import type { Migration } from './types';

// Phase 9 migration: 任务队列 + ProductionFrame + 视频 Take + 成本记录
//
// 新建 4 张表：
//   - tasks               视频生成任务（含 request_hash / provider_job_id / DAG 依赖）
//   - takes               视频生成 Take（含血缘 parent_take_id + 问题标签）
//   - production_frames   制作 Frame（首帧 / 尾帧 / 关键帧 / 承接帧）
//   - usage_records_v2    Phase 9 扩展字段（estimated_amount / actual_amount / task_id 关联）
//
// usage_records 在 Phase 5b 已建表 + Phase 5+ 在用。本 phase ALTER TABLE 添加 task_id / episode /
// track_id / estimated_amount / actual_amount / failed_amount / retry_amount / provider_job_id /
// provider_billing_unit 字段（hasColumn 检查避免重复）

export const phase9Migrations: Migration[] = [
  {
    id: '0009_phase9_tasks_takes_frames_usage',
    version: 9,
    statements: [
      // ============================================================
      // 1. tasks —— 视频生成任务（spec L419 + L753 幂等 + L555 对账）
      // ============================================================
      `CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        track_id TEXT,
        episode INTEGER NOT NULL DEFAULT 1,
        task_type TEXT NOT NULL DEFAULT 'video',
        status TEXT NOT NULL DEFAULT 'pending',
        provider_job_id TEXT,
        request_hash TEXT NOT NULL,
        idempotency_key TEXT,
        attempt_no INTEGER NOT NULL DEFAULT 1,
        max_attempts INTEGER NOT NULL DEFAULT 2,
        model_config_id TEXT,
        strategy TEXT NOT NULL DEFAULT 'start_frame',
        cost_estimate REAL NOT NULL DEFAULT 0,
        cost_actual REAL NOT NULL DEFAULT 0,
        provider_status TEXT NOT NULL DEFAULT '',
        depends_on_task_id TEXT,
        paused_at INTEGER,
        cancelled_at INTEGER,
        failed_reason TEXT NOT NULL DEFAULT '',
        payload_json TEXT NOT NULL DEFAULT '{}',
        result_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE SET NULL,
        FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE SET NULL
      )`,
      // 状态枚举（仅注释，不强制 CHECK 以兼容现有 SQLite 行为，spec L185 + L852）：
      //   - 'pending'
      //   - 'queued'
      //   - 'submitted'
      //   - 'running'
      //   - 'paused'
      //   - 'cancelled'
      //   - 'retrying'
      //   - 'reconciling'
      //   - 'succeeded'
      //   - 'failed'
      //   - 'timeout'
      //   - 'duplicate_blocked'
      'CREATE INDEX IF NOT EXISTS tasks_project_status_idx ON tasks (project_id, status, created_at)',
      'CREATE INDEX IF NOT EXISTS tasks_request_hash_idx ON tasks (request_hash, status)',
      'CREATE INDEX IF NOT EXISTS tasks_provider_job_idx ON tasks (provider_job_id)',
      'CREATE INDEX IF NOT EXISTS tasks_track_idx ON tasks (track_id, status)',
      'CREATE INDEX IF NOT EXISTS tasks_depends_idx ON tasks (depends_on_task_id)',

      // ============================================================
      // 2. takes —— 视频生成 Take（spec L130 + L418 + L741）
      // ============================================================
      `CREATE TABLE IF NOT EXISTS takes (
        id TEXT PRIMARY KEY,
        task_id TEXT,
        track_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        artifact_id TEXT,
        parent_take_id TEXT,
        model_id TEXT NOT NULL DEFAULT '',
        strategy TEXT NOT NULL DEFAULT '',
        parameters_json TEXT NOT NULL DEFAULT '{}',
        prompt TEXT NOT NULL DEFAULT '',
        cost_estimate REAL NOT NULL DEFAULT 0,
        cost_actual REAL NOT NULL DEFAULT 0,
        provider_job_id TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        issue_tags TEXT NOT NULL DEFAULT '[]',
        review_note TEXT NOT NULL DEFAULT '',
        duration_seconds REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
        FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_take_id) REFERENCES takes(id) ON DELETE SET NULL,
        FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE SET NULL
      )`,
      'CREATE INDEX IF NOT EXISTS takes_track_idx ON takes (track_id, created_at)',
      'CREATE INDEX IF NOT EXISTS takes_task_idx ON takes (task_id)',
      'CREATE INDEX IF NOT EXISTS takes_parent_idx ON takes (parent_take_id)',
      'CREATE INDEX IF NOT EXISTS takes_project_idx ON takes (project_id, status, created_at)',

      // ============================================================
      // 3. production_frames —— 制作 Frame（spec L129 + L274 + L419 + L661）
      // ============================================================
      `CREATE TABLE IF NOT EXISTS production_frames (
        id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        frame_type TEXT NOT NULL DEFAULT 'start_frame',
        artifact_id TEXT,
        source TEXT NOT NULL DEFAULT 'generated',
        order_index INTEGER NOT NULL DEFAULT 0,
        timestamp_ms INTEGER NOT NULL DEFAULT 0,
        locked INTEGER NOT NULL DEFAULT 0,
        locked_at INTEGER,
        notes TEXT NOT NULL DEFAULT '',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE SET NULL
      )`,
      // frame_type 枚举（注释）: 'start_frame' / 'end_frame' / 'keyframe' / 'continuation' / 'anchor'
      // source 枚举（注释）: 'generated' / 'uploaded' / 'extracted'
      'CREATE INDEX IF NOT EXISTS production_frames_track_idx ON production_frames (track_id, frame_type, order_index)',
      'CREATE INDEX IF NOT EXISTS production_frames_project_idx ON production_frames (project_id, frame_type)',

      // ============================================================
      // 4. usage_records —— Phase 9 估算 vs 实际 vs 失败 vs 重试（spec L742 + L828 + L844）
      // ============================================================
      // usage_records 表在 Phase 5b 已建（含基础 cost_status 字段）。
      // 本 phase 用 IF NOT EXISTS 防御性确保表存在，并添加 Phase 9 专用字段
      //
      // cost_status 枚举（任 1）：
      //   - 'estimated' — 任务提交时写一条（estimated_amount）
      //   - 'actual'    — 任务 succeeded 时写一条（actual_amount）
      //   - 'failed'    — 任务 failed 时写一条（failed_amount）
      //   - 'reconciled'— 服务重启对账后回填
      //   - 'disputed'  — 用户对账质疑
      //   - 'retry'     — 重试单独记账（retry_amount）
      `CREATE TABLE IF NOT EXISTS usage_records (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        agent_run_id TEXT,
        model_config_id TEXT,
        object_type TEXT NOT NULL,
        object_id TEXT,
        cost_status TEXT NOT NULL DEFAULT 'estimated',
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        estimated_cost REAL NOT NULL DEFAULT 0,
        actual_cost REAL NOT NULL DEFAULT 0,
        details_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      // 本 phase 添加 Phase 9 专用字段：task_id / episode / track_id /
      //   estimated_amount / actual_amount / failed_amount / retry_amount /
      //   provider_job_id / provider_billing_unit
      // 使用 ALTER TABLE（execMigrationStatement 在 hasColumn 时跳过避免重复）
      `ALTER TABLE usage_records ADD COLUMN task_id TEXT`,
      `ALTER TABLE usage_records ADD COLUMN episode INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE usage_records ADD COLUMN track_id TEXT`,
      `ALTER TABLE usage_records ADD COLUMN estimated_amount REAL NOT NULL DEFAULT 0`,
      `ALTER TABLE usage_records ADD COLUMN actual_amount REAL NOT NULL DEFAULT 0`,
      `ALTER TABLE usage_records ADD COLUMN failed_amount REAL NOT NULL DEFAULT 0`,
      `ALTER TABLE usage_records ADD COLUMN retry_amount REAL NOT NULL DEFAULT 0`,
      `ALTER TABLE usage_records ADD COLUMN provider_job_id TEXT`,
      `ALTER TABLE usage_records ADD COLUMN provider_billing_unit TEXT NOT NULL DEFAULT ''`,
      'CREATE INDEX IF NOT EXISTS usage_records_task_idx ON usage_records (task_id, cost_status)',
      'CREATE INDEX IF NOT EXISTS usage_records_track_idx ON usage_records (track_id, cost_status, created_at)',
      'CREATE INDEX IF NOT EXISTS usage_records_provider_job_idx ON usage_records (provider_job_id)',
    ],
  },
];
