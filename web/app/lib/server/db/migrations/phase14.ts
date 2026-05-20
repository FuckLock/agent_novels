import type { Migration } from './types';

// Phase 14 migration: 辅助智能能力收口 — Agent 记忆 + 章节事件图谱 + 可编程供应商
//
// 增强项性质（spec L104 + L206 + L923 + DEV-PLAN L607-633）：
//   本 phase 三能力均为"增强能力"，默认禁用，不阻塞 A-E 主链路
//
// 新建 3 张表：
//   - agent_memories                 Agent 记忆（spec L740 + DEV-PLAN L617）
//   - chapter_events                 章节事件图谱（spec L741 + DEV-PLAN L618）
//   - programmatic_provider_templates 可编程供应商模板（spec L742 + DEV-PLAN L619）
//
// 4 个 ALTER ADD COLUMN（spec L702 / L705 / L707 / L712 / L714）：
//   - agent_runs.memory_context_id    （spec L712 — Phase 14 加字段）
//   - agent_conversations.memory_state（spec L714 — Phase 14 加字段）
//   - chapters.story_graph_index      （spec L707 — Phase 14 加字段）
//   - skill_versions.template_source  （spec L705 — Phase 14 加字段）
//
// schemaVersion 升级：12 → 13
//
// 边界硬约束（criteria H5 + spec L629 + DEV-PLAN L633）：
//   - ALTER 仅 ADD COLUMN，不允许 DROP COLUMN / RENAME COLUMN
//   - 不允许 DROP TABLE 既有表（agent_runs / agent_conversations / chapters / skill_versions / provider_configs / model_configs）
//   - 现有读路径不被破坏（ALTER 新增字段允许 NULL — 未启用增强项也能写入）
//
// 所有表用 CREATE TABLE IF NOT EXISTS（沿用 Phase 4+ 幂等模式）
// 所有 ALTER 通过 migrate.ts.execMigrationStatement 兜底（已存在列时静默跳过）

export const phase14Migrations: Migration[] = [
  {
    id: '0013_phase14_agent_memory_story_graph_programmatic_provider',
    version: 13,
    statements: [
      // ============================================================
      // 1. agent_memories —— Agent 记忆（spec L740 + DEV-PLAN L617）
      // ============================================================
      // 类型枚举（service 层约束）:
      //   - 'long_term'   长期记忆（用户偏好 / IP 设定）
      //   - 'short_term'  短期记忆（最近会话上下文）
      //   - 'recall'      召回快照（每次 agent 运行的上下文集合）
      //
      // 关键字段：
      //   - context_id      与 agent_runs.memory_context_id 一一关联（外部 ID，不强制 FK）
      //   - agent_name      记忆所属 Agent
      //   - project_id      可空（全局记忆 / 项目级记忆）
      //   - content_json    记忆原文 + 元数据（结构化 JSON）
      //   - embedding_json  嵌入向量（spec L649 — MVP 留位，不强制写入）
      //   - source_run_id   记忆来自哪个 agent_run（可空）
      //   - tags_json       标签（角色 / 章节 / 时序）
      //   - last_recalled_at 最后召回时间（用于淘汰策略）
      `CREATE TABLE IF NOT EXISTS agent_memories (
        id TEXT PRIMARY KEY,
        context_id TEXT NOT NULL,
        agent_name TEXT NOT NULL DEFAULT '',
        project_id TEXT,
        memory_type TEXT NOT NULL DEFAULT 'short_term',
        title TEXT NOT NULL DEFAULT '',
        content_json TEXT NOT NULL DEFAULT '{}',
        embedding_json TEXT NOT NULL DEFAULT '[]',
        source_run_id TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]',
        last_recalled_at INTEGER,
        actor TEXT NOT NULL DEFAULT 'local-owner',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS agent_memories_context_idx ON agent_memories (context_id, created_at)',
      'CREATE INDEX IF NOT EXISTS agent_memories_agent_idx ON agent_memories (agent_name, memory_type, created_at)',
      'CREATE INDEX IF NOT EXISTS agent_memories_project_idx ON agent_memories (project_id, memory_type, created_at)',

      // ============================================================
      // 2. chapter_events —— 章节事件图谱（spec L741 + DEV-PLAN L618）
      // ============================================================
      // event_type 枚举（注释）:
      //   - 'plot'      情节事件
      //   - 'character' 角色出场 / 状态变化
      //   - 'relation'  关系变化
      //   - 'timeline'  时序节点
      //   - 'setting'   设定变化（地点 / 道具）
      //
      // 关键字段：
      //   - chapter_id        关联 chapters.id（外部 ID，不强制 FK 以保兼容）
      //   - project_id        关联 projects
      //   - sequence_index    时序索引（章节内顺序 — spec L299 / L358）
      //   - characters_json   涉及角色列表
      //   - relations_json    关系列表（A→B / B→C）
      //   - timeline_json     时序元数据（chapter_index / episode_index / timestamp）
      //   - extraction_source 'manual' | 'ai_extracted' | 'user_confirmed'（MVP 允许 manual）
      `CREATE TABLE IF NOT EXISTS chapter_events (
        id TEXT PRIMARY KEY,
        chapter_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        event_type TEXT NOT NULL DEFAULT 'plot',
        title TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        sequence_index INTEGER NOT NULL DEFAULT 0,
        characters_json TEXT NOT NULL DEFAULT '[]',
        relations_json TEXT NOT NULL DEFAULT '[]',
        timeline_json TEXT NOT NULL DEFAULT '{}',
        extraction_source TEXT NOT NULL DEFAULT 'manual',
        confidence REAL NOT NULL DEFAULT 0,
        actor TEXT NOT NULL DEFAULT 'local-owner',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS chapter_events_chapter_idx ON chapter_events (chapter_id, sequence_index)',
      'CREATE INDEX IF NOT EXISTS chapter_events_project_idx ON chapter_events (project_id, event_type, sequence_index)',
      'CREATE INDEX IF NOT EXISTS chapter_events_type_idx ON chapter_events (event_type, created_at)',

      // ============================================================
      // 3. programmatic_provider_templates —— 可编程供应商模板（spec L742 + DEV-PLAN L619）
      // ============================================================
      // status 枚举（注释）:
      //   - 'draft'      模板草稿
      //   - 'probed'     已能力探测
      //   - 'verified'   已测试连接（MVP mock 可视为 verified）
      //   - 'disabled'   已禁用
      //
      // 关键字段：
      //   - template_key       模板唯一键（如 'openai-compat-mvp'）
      //   - provider_kind      'openai' | 'anthropic' | 'custom-http' 等
      //   - capabilities_json  能力探测结果（spec L632 — capabilities / models / probedAt）
      //   - models_json        模型列表
      //   - probe_result_json  能力探测原始结果（mock 占位）
      //   - test_result_json   测试连接结果（mock 占位）
      //   - last_probed_at     最后探测时间
      //   - last_tested_at     最后测试时间
      `CREATE TABLE IF NOT EXISTS programmatic_provider_templates (
        id TEXT PRIMARY KEY,
        template_key TEXT NOT NULL UNIQUE,
        provider_kind TEXT NOT NULL DEFAULT 'custom-http',
        display_name TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft',
        capabilities_json TEXT NOT NULL DEFAULT '{}',
        models_json TEXT NOT NULL DEFAULT '[]',
        probe_result_json TEXT NOT NULL DEFAULT '{}',
        test_result_json TEXT NOT NULL DEFAULT '{}',
        config_json TEXT NOT NULL DEFAULT '{}',
        last_probed_at INTEGER,
        last_tested_at INTEGER,
        actor TEXT NOT NULL DEFAULT 'local-owner',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS programmatic_provider_templates_kind_idx ON programmatic_provider_templates (provider_kind, status)',
      'CREATE INDEX IF NOT EXISTS programmatic_provider_templates_status_idx ON programmatic_provider_templates (status, last_probed_at)',

      // ============================================================
      // 4. ALTER ADD COLUMN —— 4 个字段（spec L702 / L705 / L707 / L712 / L714）
      // ============================================================
      // 注意：migrate.ts.execMigrationStatement 已对 ALTER ADD COLUMN 做兜底
      // （已存在列时静默跳过），保证幂等。

      // agent_runs.memory_context_id（spec L712 + criteria A4 — 关联 agent_memories.context_id）
      `ALTER TABLE agent_runs ADD COLUMN memory_context_id TEXT`,

      // agent_conversations.memory_state（spec L714 — 会话级记忆状态快照 JSON）
      `ALTER TABLE agent_conversations ADD COLUMN memory_state TEXT NOT NULL DEFAULT '{}'`,

      // chapters.story_graph_index（spec L707 — 章节在事件图谱中的索引 JSON）
      `ALTER TABLE chapters ADD COLUMN story_graph_index TEXT NOT NULL DEFAULT '{}'`,

      // skill_versions.template_source（spec L705 + criteria C6 — 技能模板来源 — 关联 programmatic_provider_templates）
      `ALTER TABLE skill_versions ADD COLUMN template_source TEXT NOT NULL DEFAULT ''`,
    ],
  },
];
