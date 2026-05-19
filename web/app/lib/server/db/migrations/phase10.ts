import type { Migration } from './types';

// Phase 10 migration: QualityGate 视频质量协议 + Take 审核
//
// 主要变更：
//   1. quality_gates 表：加 take_id / track_id / episode_index / operator_id / task_id
//      （Phase 5 已有 object_type + object_id 通用关联；本 phase 添加专用字段加速查询）
//   2. takes 表：加 quality_status / locked / locked_at 字段
//      （Phase 9 已有 status TEXT DEFAULT 'draft'；quality_status 是独立的质量门禁状态）
//
// 注意：所有 ALTER TABLE 都依赖 execMigrationStatement 的 hasColumn 防御逻辑，
// 不会重复 ADD COLUMN。

export const phase10Migrations: Migration[] = [
  {
    id: '0010_phase10_quality_gates_takes_lock',
    version: 10,
    statements: [
      // ============================================================
      // 1. quality_gates 表扩展（spec L102 + L319 + L600）
      // ============================================================
      // Phase 5 已建 quality_gates，含 9 个核心字段（metric / scope_json /
      // denominator / passed_count / failed_items_json / confidence /
      // sampling_rule / review_source / operator_decision / waiver_reason）。
      // 本 phase 添加专用关联字段，方便按 take / track / episode 查询。
      `ALTER TABLE quality_gates ADD COLUMN take_id TEXT`,
      `ALTER TABLE quality_gates ADD COLUMN track_id TEXT`,
      `ALTER TABLE quality_gates ADD COLUMN episode_index INTEGER`,
      `ALTER TABLE quality_gates ADD COLUMN operator_id TEXT`,
      `ALTER TABLE quality_gates ADD COLUMN task_id TEXT`,
      'CREATE INDEX IF NOT EXISTS quality_gates_take_idx ON quality_gates (take_id, status)',
      'CREATE INDEX IF NOT EXISTS quality_gates_track_idx ON quality_gates (track_id, metric)',
      'CREATE INDEX IF NOT EXISTS quality_gates_episode_idx ON quality_gates (project_id, episode_index)',

      // ============================================================
      // 2. takes 表扩展（spec L600 + L608 — 锁定关键产物前必须经过 QualityGate）
      // ============================================================
      // Phase 9 takes 已有 status TEXT DEFAULT 'draft'，但缺独立的
      // quality_status / locked 字段。本 phase 补漏。
      //
      // quality_status 枚举（spec L851）：unchecked / passed / failed / waived
      // locked = 1 表示 take 已锁定（spec L600 锁定前必须有 QualityGate）
      `ALTER TABLE takes ADD COLUMN quality_status TEXT NOT NULL DEFAULT 'unchecked'`,
      `ALTER TABLE takes ADD COLUMN locked INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE takes ADD COLUMN locked_at INTEGER`,
      `ALTER TABLE takes ADD COLUMN locked_by TEXT`,
      'CREATE INDEX IF NOT EXISTS takes_quality_idx ON takes (project_id, quality_status, locked)',
    ],
  },
];
