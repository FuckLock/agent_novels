import type { Migration } from './types';

// Phase 11 migration: E 粗剪交付 + AudioSubtitlePlan + EpisodeDeliveryPackage
//
// 新建 3 张表：
//   - rough_cuts                单集粗剪（只读 locked take 组装；missing_tracks 体现缺口）
//   - audio_subtitle_plans      AudioSubtitlePlan（5 维：旁白 / 台词 / 嘴型 / 音效 / 字幕时间段）
//   - episode_delivery_packages EpisodeDeliveryPackage manifest（6 件清单 + 缺失检查）
//
// 关键约束（spec L78 + L601 + L608）：
//   - rough_cuts.missing_tracks_json：缺口 JSON（未锁定 Track 列表）
//   - rough_cuts.status：枚举 'partial' / 'complete' / 'incomplete' / 'has_gaps' / 'sealed'
//     —— 缺口 > 0 时不能为 'complete' / 'sealed'（service 层强制）
//
// 边界约束（spec L611 + DEV-PLAN L544）：
//   - episode_delivery_packages ≠ 整工程迁移包
//     EpisodeDeliveryPackage 是路径 4 主 Tab 交付物；整工程迁移包仅在设置降级页
//
// 所有表用 CREATE TABLE IF NOT EXISTS（沿用 Phase 4+ 幂等模式）

export const phase11Migrations: Migration[] = [
  {
    id: '0011_phase11_rough_cut_audio_episode_delivery',
    version: 11,
    statements: [
      // ============================================================
      // 1. rough_cuts —— 单集粗剪（spec L131 + L601 + L608 + DEV-PLAN L731）
      // ============================================================
      // 一个 episode 对应一份粗剪；version 用于多次组装（每次新组装递增）
      // missing_tracks_json：未锁定 Track 列表（JSON 数组，含 trackId / orderIndex / objective / reason）
      // status 枚举（注释）：
      //   - 'partial'    —— 有缺口（missing_tracks_json.length > 0）
      //   - 'complete'   —— 全部 Track 锁定 take 齐备
      //   - 'incomplete' —— 同义 partial（兼容别名）
      //   - 'has_gaps'   —— 同义 partial
      //   - 'sealed'     —— 已封板（人工锁定，不允许再组装）
      `CREATE TABLE IF NOT EXISTS rough_cuts (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        episode_id TEXT,
        episode_index INTEGER NOT NULL DEFAULT 1,
        track_plan_id TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'partial',
        missing_tracks_json TEXT NOT NULL DEFAULT '[]',
        locked_takes_json TEXT NOT NULL DEFAULT '[]',
        total_duration_seconds REAL NOT NULL DEFAULT 0,
        manifest_json TEXT NOT NULL DEFAULT '{}',
        artifact_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (track_plan_id) REFERENCES track_plans(id) ON DELETE SET NULL,
        FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE SET NULL
      )`,
      'CREATE INDEX IF NOT EXISTS rough_cuts_project_episode_idx ON rough_cuts (project_id, episode_index, deleted_at)',
      'CREATE INDEX IF NOT EXISTS rough_cuts_status_idx ON rough_cuts (project_id, status, version)',
      'CREATE INDEX IF NOT EXISTS rough_cuts_track_plan_idx ON rough_cuts (track_plan_id, version)',

      // ============================================================
      // 2. audio_subtitle_plans —— 音频字幕计划（spec L132 + L338 + L603 + DEV-PLAN L732）
      // ============================================================
      // 与 RoughCut 版本关联（rough_cut_id）；plan_json 含 5 维度：
      //   - narration       旁白
      //   - dialogue        台词
      //   - lip_state       嘴型
      //   - sfx             音效
      //   - subtitle_timing 字幕时间段
      `CREATE TABLE IF NOT EXISTS audio_subtitle_plans (
        id TEXT PRIMARY KEY,
        rough_cut_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        episode_index INTEGER NOT NULL DEFAULT 1,
        version INTEGER NOT NULL DEFAULT 1,
        plan_json TEXT NOT NULL DEFAULT '{}',
        artifact_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        FOREIGN KEY (rough_cut_id) REFERENCES rough_cuts(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE SET NULL
      )`,
      'CREATE INDEX IF NOT EXISTS audio_subtitle_plans_rough_cut_idx ON audio_subtitle_plans (rough_cut_id, version)',
      'CREATE INDEX IF NOT EXISTS audio_subtitle_plans_project_episode_idx ON audio_subtitle_plans (project_id, episode_index, deleted_at)',

      // ============================================================
      // 3. episode_delivery_packages —— 单集交付包 manifest（spec L133 + L605 + DEV-PLAN L733）
      // ============================================================
      // EpisodeDeliveryPackage manifest 6 件清单（spec L605）：
      //   - 粗剪视频引用（rough_cut_id / rough_cut_artifact）
      //   - locked take 清单（locked_takes_json）
      //   - AudioSubtitlePlan 引用（audio_subtitle_plan_id / artifact）
      //   - 素材清单（assets_json / artifacts）
      //   - 剪辑工程清单（project_manifest_json）
      //   - manifest 元数据（schema_version / generated_at / db_revision）
      // 缺失检查（spec L605）：missing_check_json 含 missing_artifacts 列表
      //
      // 边界（spec L611）：本表不与整工程迁移包混淆，仅承载单集交付
      `CREATE TABLE IF NOT EXISTS episode_delivery_packages (
        id TEXT PRIMARY KEY,
        rough_cut_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        episode_index INTEGER NOT NULL DEFAULT 1,
        audio_subtitle_plan_id TEXT,
        status TEXT NOT NULL DEFAULT 'partial',
        manifest_json TEXT NOT NULL DEFAULT '{}',
        missing_check_json TEXT NOT NULL DEFAULT '{}',
        schema_version INTEGER NOT NULL DEFAULT 11,
        db_revision INTEGER NOT NULL DEFAULT 0,
        artifact_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        FOREIGN KEY (rough_cut_id) REFERENCES rough_cuts(id) ON DELETE CASCADE,
        FOREIGN KEY (audio_subtitle_plan_id) REFERENCES audio_subtitle_plans(id) ON DELETE SET NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE SET NULL
      )`,
      'CREATE INDEX IF NOT EXISTS episode_delivery_packages_rough_cut_idx ON episode_delivery_packages (rough_cut_id)',
      'CREATE INDEX IF NOT EXISTS episode_delivery_packages_project_idx ON episode_delivery_packages (project_id, episode_index, deleted_at)',
      'CREATE INDEX IF NOT EXISTS episode_delivery_packages_status_idx ON episode_delivery_packages (project_id, status, created_at)',
    ],
  },
];
