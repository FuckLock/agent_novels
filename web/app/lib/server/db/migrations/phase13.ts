import type { Migration } from './types';

// Phase 13 migration: 治理能力 + Legacy Import + ProjectMigrationPackage + Trash + AuditLog
//
// 新建 3 张表：
//   - audit_logs       敏感操作审计（7 类事件 + 4 维度筛选）
//   - legacy_imports   旧 novels/ 导入记录（只读扫描结果 + 映射规则 + 导入状态）
//   - trash_entries    回收站条目（软删除 + 影响清单 + 硬删除前预览）
//
// schemaVersion 升级：11 → 12
//
// 边界硬约束（spec L478 + L605 + DEV-PLAN L603）：
//   - trash_entries 与 Phase 11 episode_delivery_packages 不混淆（前者治理 / 后者交付）
//   - audit_logs 7 类事件（spec L168 + L585）：
//       deletion / unlock / waiver / legacy_import / migration_export / secret_change / artifact_operation
//   - legacy_imports：只读 novels/ 扫描记录（spec L155-157 — 不得原地改写旧目录）
//
// 所有表用 CREATE TABLE IF NOT EXISTS（沿用 Phase 4+ 幂等模式）

export const phase13Migrations: Migration[] = [
  {
    id: '0012_phase13_audit_legacy_trash',
    version: 12,
    statements: [
      // ============================================================
      // 1. audit_logs —— 敏感操作审计日志（spec L168 + L585 + L600 验收）
      // ============================================================
      // event_type 枚举（7 类，service 层 + 类型约束；DB 不强制 CHECK 以保兼容）：
      //   - 'deletion'           — 软删除 / 硬删除
      //   - 'unlock'             — 解锁 take / track 等
      //   - 'waiver'             — 缺口豁免 / 阻断豁免
      //   - 'legacy_import'      — 旧 novels/ 导入
      //   - 'migration_export'   — ProjectMigrationPackage 导出
      //   - 'secret_change'      — apiKey / token 变更
      //   - 'artifact_operation' — Artifact 创建 / 删除 / 引用变化
      //
      // 4 维度筛选（spec L585）：target_type+target_id / actor / created_at / event_type
      `CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        target_type TEXT NOT NULL DEFAULT '',
        target_id TEXT NOT NULL DEFAULT '',
        actor TEXT NOT NULL DEFAULT 'local-owner',
        project_id TEXT,
        action TEXT NOT NULL DEFAULT '',
        detail_json TEXT NOT NULL DEFAULT '{}',
        result TEXT NOT NULL DEFAULT 'ok',
        created_at INTEGER NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS audit_logs_event_type_idx ON audit_logs (event_type, created_at)',
      'CREATE INDEX IF NOT EXISTS audit_logs_target_idx ON audit_logs (target_type, target_id, created_at)',
      'CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs (actor, created_at)',
      'CREATE INDEX IF NOT EXISTS audit_logs_project_idx ON audit_logs (project_id, created_at)',

      // ============================================================
      // 2. legacy_imports —— 旧 novels/ 导入记录（spec L155-157 + L600 验收）
      // ============================================================
      // status 枚举（注释）:
      //   - 'scanning'   — 只读扫描中
      //   - 'previewing' — 预览中
      //   - 'mapping'    — 映射规则编辑中
      //   - 'importing'  — 导入新对象中
      //   - 'completed'  — 导入完成
      //   - 'failed'     — 导入失败
      //   - 'cancelled'  — 用户取消
      //
      // 关键字段：source_path（被扫描的 novels/ 子目录绝对路径，禁止写入）；preview_json（章节 /
      // 配置 / 脚本 / 资产 / review / seedance 6 类内容预览）；mapping_rules_json（手动映射规则
      // MVP — 不强制 AI 自动识别）；imported_object_ids_json（导入后新建的对象 ID 清单）
      `CREATE TABLE IF NOT EXISTS legacy_imports (
        id TEXT PRIMARY KEY,
        legacy_dir_name TEXT NOT NULL,
        source_path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'scanning',
        target_project_id TEXT,
        preview_json TEXT NOT NULL DEFAULT '{}',
        mapping_rules_json TEXT NOT NULL DEFAULT '{}',
        imported_object_ids_json TEXT NOT NULL DEFAULT '[]',
        statistics_json TEXT NOT NULL DEFAULT '{}',
        warnings_json TEXT NOT NULL DEFAULT '[]',
        actor TEXT NOT NULL DEFAULT 'local-owner',
        started_at INTEGER,
        finished_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS legacy_imports_status_idx ON legacy_imports (status, created_at)',
      'CREATE INDEX IF NOT EXISTS legacy_imports_target_idx ON legacy_imports (target_project_id)',

      // ============================================================
      // 3. trash_entries —— 回收站条目（spec L175 + L600 验收 + L170 Artifact 生命周期）
      // ============================================================
      // status 枚举（注释）:
      //   - 'soft_deleted' — 已软删除（可恢复）
      //   - 'restored'    — 已从回收站恢复
      //   - 'hard_deleted'— 已硬删除（不可逆）
      //
      // 影响清单字段（spec L175 — 硬删除前展示）：
      //   - record_count   — 关联数据库记录数
      //   - artifact_count — 关联 Artifact 引用数
      //   - file_size_total— Artifact 字节总和（辅助）
      //   - impact_json    — 详细影响列表
      `CREATE TABLE IF NOT EXISTS trash_entries (
        id TEXT PRIMARY KEY,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        project_id TEXT,
        status TEXT NOT NULL DEFAULT 'soft_deleted',
        title TEXT NOT NULL DEFAULT '',
        record_count INTEGER NOT NULL DEFAULT 0,
        artifact_count INTEGER NOT NULL DEFAULT 0,
        file_size_total INTEGER NOT NULL DEFAULT 0,
        impact_json TEXT NOT NULL DEFAULT '{}',
        snapshot_json TEXT NOT NULL DEFAULT '{}',
        soft_deleted_at INTEGER NOT NULL,
        restored_at INTEGER,
        hard_deleted_at INTEGER,
        actor TEXT NOT NULL DEFAULT 'local-owner',
        reason TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS trash_entries_target_idx ON trash_entries (target_type, target_id)',
      'CREATE INDEX IF NOT EXISTS trash_entries_status_idx ON trash_entries (status, soft_deleted_at)',
      'CREATE INDEX IF NOT EXISTS trash_entries_project_idx ON trash_entries (project_id, status)',
    ],
  },
];
