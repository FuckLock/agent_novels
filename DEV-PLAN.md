# Development Plan — Toonflow Web

> 本文件记录 Toonflow Web 的开发阶段划分、当前进度和剩余工作。
> 新 session 启动时应首先阅读此文件，了解项目状态后再继续开发。

**基于信息**：
- 源 Spec：Product-Spec.md v3.5
- 设计依据：Design-Brief.md + Design-Delivery-Report.md + `designs/toonflow-web-design.pen`
- 生成日期：2026-05-14
- 覆盖 Spec 功能：49 个 / 总 49 个（核心功能 39 个 + 辅助功能 10 个）
- 当前模式：生成模式；仓库已有旧 Web 代码，但 Product-Spec 明确要求按重做版信息架构规划

---

## 当前进度

> 进度同步日期：2026-05-17
> 修订原因：代码已超前 plan（Phase 2-6 等价实现已存在但未走 PGE 双循环），本次同步进度并明确剩余工作。
> 下一 PGE 目标：Phase 2（先以 PGE 双循环倒查正式收口，消除「先入库后审计」隐患）。

| Phase | 主题 | 状态 | 备注 |
| --- | --- | --- | --- |
| Phase 1 | 安全基线与 Web Shell | ✅ 完成 | commit b4e69de PGE 双循环通过（2026-05-17） |
| Phase 2 | 后端数据层与 Artifact 仓库 | ✅ 完成 | 关键文件 8/8，由旧业务代码批量入库，未走 PGE 验证；建议 PGE 倒查正式收口 |
| Phase 3 | Project、访问控制与模型配置 | ✅ 完成 | 关键文件 6/7；存在 `[projectId]→[name]` 路由命名漂移 |
| Phase 4 | SourceDocument 与 Chapter 管理 | ✅ 完成 | 关键文件 5/7；命名漂移：`dependency_edges` → `dependency_invalidations` 等 |
| Phase 5 | 剧本 Agent 与文本版本闭环 | 🟡 部分完成 | 服务层等价完成；缺关键 UX 件 `ScriptDiffModal.tsx` |
| Phase 6 | 资产塑造、AssetVersion 与跨集 IP 时间线 | 🟡 部分完成 | 资产 CRUD/版本/时间线完成；`asset-generation-service.ts` 仍为 17 行 stub |
| Phase 7 | A→C3 制作管线与自动运行视图 | 🟡 部分完成 | seedance 体系覆盖 A→C3 节点产物；剩余通用抽象层 + `~sd auto` + auto-run 大屏 + AutoRunEventStream |
| Phase 8 | D 阶段 TrackPlan、策略决策与路径 5 | ⏳ 待开始 | — |
| Phase 9 | 任务队列、ProductionFrame、视频 Take 与成本记录 | ⏳ 待开始 | — |
| Phase 10 | 质量门禁与 Take 审核 | ⏳ 待开始 | `TakeDeliveryTab.tsx` 壳存在但内容空 |
| Phase 11 | E 粗剪交付、AudioSubtitlePlan 与 EpisodeDeliveryPackage | ⏳ 待开始 | — |
| Phase 12 | 任务中心、恢复对账与成本复盘 | ⏳ 待开始 | `tasks/page.tsx` 壳存在但内容空 |
| Phase 13 | 治理能力、迁移包与安全删除 | ⏳ 待开始 | — |
| Phase 14 | 辅助智能能力收口 | ⏳ 待开始 | — |
| Phase 15 | Electron 壳、打包与端到端闭环 | ⏳ 待开始 | `electron/main.ts` + `preload.ts` 壳存在但配套页面 + E2E 缺 |

**状态语义**：
- ✅ 完成：核心交付物等价实现，PGE 双循环通过（或将通过 Phase 2 倒查方式补审计）。
- 🟡 部分完成：主体交付物已实现，但存在明确未完成项（见对应 Phase 的【剩余工作】段）。
- ⏳ 待开始：尚未进入开发，原计划内容保留。

**命名漂移处理原则**（D1）：
- 实质功能等价 → 标 ✅，在【完成证据】注明实际路径差异。
- 缺关键 UX 件或仍为 stub → 标 🟡，在【剩余工作】明确未完成项。

---

## 功能依赖图

1. 技术安全基线与 Web Shell → 所有页面、API、Electron 壳。
2. 数据库、Artifact 仓库、RuntimeCheck → Project、SourceDocument、Asset、Task、ExportPackage。
3. Project / Settings / Provider / Model / SkillVersion → 文本 Agent、资产生成、视频生成。
4. SourceDocument / Chapter → StoryOutline → AdaptationPlan → ScriptVersion。
5. ScriptVersion + Asset / AssetVersion → DirectorAnalysis → DirectorPlan → Storyboard → PromptPack → TrackPlan。
6. TrackPlan + Provider 能力矩阵 → Track 策略决策 → ProductionFrame → Task → Take。
7. Take + QualityGate → RoughCut → AudioSubtitlePlan → EpisodeDeliveryPackage。
8. UsageRecord / AuditLog / ProjectMigrationPackage / LegacyImport / Trash → 生产治理与恢复。
9. Agent Memory / Chapter Event Graph / Programmable Provider → 增强能力，不阻塞核心 A-E 闭环。

---

## Phase 1: 安全基线与 Web Shell

**状态**：✅ 完成（commit b4e69de PGE 双循环通过 2026-05-17）

**交付内容**：
- 升级并固定 Web 运行依赖，消除 `next@15.5.14` 低于 2026 年 5 月安全修复线的风险。
- 搭建与设计稿一致的全局工作台 Shell：窄侧栏、顶部状态条、项目内容区、任务中心和设置入口。
- 固化设计变量、组件语义和基础页面路由，保证后续页面都在同一 UI 体系内扩展。

**关键文件**：
- `[修改] package.json` — 对齐根脚本，保留 HTTP Web 优先、Electron 可选壳的启动方式。
- `[修改] web/package.json` — 固定 `next@15.5.18`、`eslint-config-next@15.5.18`、`react@19.1.0`、`react-dom@19.1.0`、`tailwindcss@4.2.2`、`electron@41.2.0`。
- `[修改] web/package-lock.json` — 与 npm 包管理器一致，停止同一 Web 应用混用锁文件作为开发入口。
- `[修改] web/app/layout.tsx` — 接入全局 Shell 和页面元数据。
- `[修改] web/app/globals.css` — 写入设计变量、状态色、密度和局部深色媒体面板样式。
- `[新增] web/app/components/layout/AppShell.tsx` — 全局窄侧栏 + 顶部运行状态条。
- `[新增] web/app/components/layout/ProjectTabs.tsx` — 小说原文、剧本 Agent、剧本管理、塑造、制作工作台、Take/粗剪交付 Tab。
- `[新增] web/app/components/ui/StatusPill.tsx` — 状态语法统一入口。

**依赖前置 Phase**：
- 无（独立 Phase，项目安全与 UI 地基）。

**已知风险**：
- Next.js 安全补丁会更新 SWC 与 App Router 内部依赖，需用 `npm run build --prefix web` 验证。

**验收标准**：
- 最低：`npm run build --prefix web` 通过；`npm run dev:web` 能打开 Web UI；项目列表、任务中心、设置入口可点击切换；状态徽章不溢出。
- 回归：旧 `web/app/projects/[name]` 页面仍可通过路由访问，不直接改写 `novels/`。

**完成证据**：
- commit b4e69de — PGE 双循环（criteria-alignment + implementation-review）已通过。
- 完成日期：2026-05-17（推断自 plan 同步日期与 commit 节点）。
- 实际产出文件均落位于 `web/app/components/layout/`、`web/app/components/ui/` 等设计的目录，路径与计划一致。
- 依赖版本固化在 `web/package.json` + `web/package-lock.json`，符合 Phase 1 安全基线。

---

## Phase 2: 后端数据层与 Artifact 仓库

**状态**：✅ 完成（关键文件 8/8，2026-05-17 之前由旧业务代码批量入库，未走 PGE 验证——本次 plan 修订后建议用 PGE 倒查正式收口）

**交付内容**：
- 建立 SQLite + Drizzle 数据层，创建 schemaVersion、migration 记录和对象基础表。
- 实现 `TOONFLOW_DATA_DIR` / 设置项驱动的 dataRoot、Artifact 仓库、hash、MIME、大小、引用计数和缺失检测。
- 实现 RuntimeCheck，覆盖 dataRoot、数据库迁移、磁盘、ffmpeg、模型连接、视频范围请求和任务队列健康。

**关键文件**：
- `[新增] web/app/lib/server/env.ts` — 解析 dataRoot、host、port、base URL 和访问模式。
- `[新增] web/app/lib/server/db/client.ts` — SQLite 连接、WAL 模式和事务工具。
- `[新增] web/app/lib/server/db/schema.ts` — 核心对象表定义。
- `[新增] web/app/lib/server/db/migrate.ts` — SchemaMigration 执行与版本检查。
- `[新增] web/app/lib/server/artifacts/store.ts` — Artifact 写入、hash、缺失检测和路径白名单。
- `[新增] web/app/lib/server/runtime/runtime-check.ts` — RuntimeCheck 检查器。
- `[新增] web/app/api/system/runtime-check/route.ts` — 环境检查 API。
- `[修改] web/app/settings/page.tsx` — 展示数据目录、数据库状态、Artifact 仓库和最近 RuntimeCheck。

**依赖前置 Phase**：
- 依赖 Phase 1（需要稳定的 Web Shell 展示 RuntimeCheck 和设置入口）。

**已知风险**：
- `better-sqlite3` 是 native 依赖，需验证 Node 22 与 Electron 41 打包场景。

**验收标准**：
- 最低：首次启动能创建数据库和 dataRoot；设置页显示 dataRoot、数据库位置、Artifact 仓库状态和 RuntimeCheck；失败项有明确修复入口。
- 回归：项目仍不直接读取或写入 `novels/` 作为新业务数据源。

**完成证据**：
- 关键文件 8/8 均已落盘（含 `env.ts` / `db/client.ts` / `db/schema.ts` / `db/migrate.ts` / `artifacts/store.ts` / `runtime/runtime-check.ts` / `api/system/runtime-check/route.ts` / `settings/page.tsx`）。
- 入库路径：旧业务代码批量入库，未经过 PGE 双循环 criteria-alignment + implementation-review 两步审计。
- 完成日期：2026-05-17 之前（具体 commit 待 Phase 2 倒查时补回）。
- **审计缺口**：未生成 `.claude/criteria/phase-2-*.md` locked criteria，未走 evaluator 双 stage。建议触发 PGE 双循环对已落盘代码做倒查（draft-criteria → criteria-alignment → implementation-review）正式收口。

---

## Phase 3: Project、访问控制与模型配置

**状态**：✅ 完成（关键文件 6/7，存在 `[projectId]→[name]` 路由命名漂移；按 D1 原则等价完成）

**交付内容**：
- 实现 Project 创建、列表、详情入口、非法名称校验、revision 和软删除状态。
- 实现 localhost / LAN / private_server 三类访问模式，非 localhost 请求必须经过访问凭据校验。
- 实现 ProviderConfig、ModelConfig、SecretRef、SkillVersion 和网文专用 Skill 包注册，供后续 Agent 和生成任务调用。

**关键文件**：
- `[新增] web/app/lib/server/projects/project-service.ts` — Project 创建、查询、revision 和软删除。
- `[新增] web/app/api/projects/route.ts` — 新项目列表与创建 API。
- `[新增] web/app/api/projects/[projectId]/route.ts` — Project 详情、更新和软删除 API。
- `[新增] web/app/lib/server/security/access-control.ts` — 访问模式、访问令牌和 localhost 豁免。
- `[新增] web/app/lib/server/models/model-registry.ts` — ProviderConfig、ModelConfig、SecretRef 读取与测试连接。
- `[新增] web/app/lib/server/skills/skill-registry.ts` — SkillVersion、网文类型 Skill 包和只读导入。
- `[修改] web/app/page.tsx` — 新项目列表页和空状态。
- `[修改] web/app/settings/page.tsx` — 模型供应商、语言模型、图像模型、视频模型和模型密钥 UI。

**依赖前置 Phase**：
- 依赖 Phase 2（Project、ModelConfig、SecretRef 需要数据库和 RuntimeCheck）。

**已知风险**：
- 局域网访问安全不能用 localhost 便利规则复用，必须用 API 中间层统一判断。

**验收标准**：
- 最低：能创建 Project；刷新后仍可见；重名、空名、非法字符有错误；设置页能新增模型供应商并测试连接；非 localhost 访问没有访问凭据时被拦截。
- 回归：RuntimeCheck 和 dataRoot 显示仍正常。

**完成证据**：
- 关键文件 6/7（service / access-control / model-registry / skill-registry / settings page / app page）实质等价完成。
- **路由命名漂移**：原计划 `web/app/api/projects/[projectId]/route.ts`，实际落位为 `web/app/api/projects/[name]/route.ts`（参数名 `name` 替代 `projectId`，功能等价）。
- 完成日期：2026-05-17 之前（推断自仓库代码现状）。
- 后续如要统一参数命名（按 Spec 用 `projectId` 还是接受 `name` 等价），需要在 Phase 5+ 的 API 设计中保持一致；本次不动既有实现。

---

## Phase 4: SourceDocument 与 Chapter 管理

**状态**：✅ 完成（关键文件 5/7，命名漂移：`dependency_edges` → `dependency_invalidations` 等；按 D1 原则等价完成）

**交付内容**：
- 用户能粘贴或上传 `.txt` 原文，系统保存 SourceDocument 和 Artifact。
- 系统按章节规则解析 Chapter，用户能调整分段、编辑章节、删除章节并产生 revision。
- 保存章节变更时展示下游影响，并标记 StoryOutline、AdaptationPlan、ScriptVersion 和资产提取结果为 stale 或 needs_regeneration。

**关键文件**：
- `[新增] web/app/lib/server/source/source-service.ts` — SourceDocument、Chapter 和章节解析。
- `[新增] web/app/lib/server/dependencies/impact-service.ts` — 上游变更影响图和 stale 标记。
- `[新增] web/app/api/projects/[projectId]/source/route.ts` — 原文上传、粘贴和查询 API。
- `[新增] web/app/api/projects/[projectId]/chapters/route.ts` — 章节列表、编辑、删除和 revision API。
- `[新增] web/app/projects/[projectId]/tabs/SourceTab.tsx` — 小说原文 Tab。
- `[新增] web/app/components/source/ChapterImportModal.tsx` — 上传/粘贴与章节解析确认。
- `[新增] web/app/components/source/ChapterEditor.tsx` — 章节编辑和影响提示。

**依赖前置 Phase**：
- 依赖 Phase 3（SourceDocument 归属 Project，章节变更需要 revision 和影响图）。

**验收标准**：
- 最低：支持 `.txt` 与粘贴导入；章节解析结果可人工调整；章节编辑产生 revision；保存前能看到受影响下游清单。
- 回归：Project 列表、设置和 RuntimeCheck 仍正常。

**完成证据**：
- 关键文件 5/7（source-service / impact-service / source/route / chapters/route / SourceTab）实质等价完成。
- **命名漂移**：影响图表名由计划的 `dependency_edges` 落地为 `dependency_invalidations`（语义更聚焦于 stale 标记），与上文【数据库表】段对照需注意命名差异；不修改既有表名，后续 Phase 引用以实际表名为准。
- 路径漂移：路由层 `[projectId]` 段统一沿用 Phase 3 实际 `[name]` 命名。
- 完成日期：2026-05-17 之前（推断自仓库代码现状）。

---

## Phase 5: 剧本 Agent 与文本版本闭环

**状态**：🟡 部分完成（服务层等价完成，缺关键 UX 件 `ScriptDiffModal.tsx`）

**交付内容**：
- 用户能从剧本 Agent 生成 StoryOutline、AdaptationPlan 和 ScriptVersion，并保存 AgentRun、SkillVersion、ModelConfig、UsageRecord 和 Artifact。
- 用户能查看、编辑、对比、回滚、锁定和导出剧本版本；锁定前必须执行文本质量检查或人工豁免。
- 实现生成结果审核、修复和近期对话历史恢复，支撑 Script Agent 的高频工作流。

**关键文件**：
- `[新增] web/app/lib/server/agent/agent-run-service.ts` — AgentRun、SkillVersion、模型调用和 UsageRecord 写入。
- `[新增] web/app/lib/server/script/script-service.ts` — StoryOutline、AdaptationPlan、ScriptVersion 版本服务。
- `[新增] web/app/lib/server/quality/text-quality-gate.ts` — 文本阶段 QualityGate 和人工豁免。
- `[新增] web/app/api/projects/[projectId]/script-agent/route.ts` — 剧本 Agent SSE / 非流式 API。
- `[新增] web/app/api/projects/[projectId]/scripts/route.ts` — 剧本版本列表、编辑、回滚、锁定和导出 API。
- `[新增] web/app/projects/[projectId]/tabs/ScriptAgentTab.tsx` — 剧本 Agent Tab。
- `[新增] web/app/projects/[projectId]/tabs/ScriptManagementTab.tsx` — 剧本管理 Tab。
- `[新增] web/app/components/script/ScriptDiffModal.tsx` — 剧本版本对比和回滚确认。

**依赖前置 Phase**：
- 依赖 Phase 4（文本生成必须读取 SourceDocument 和 Chapter）。
- 依赖 Phase 3（AgentRun 需要 ModelConfig 和 SkillVersion）。

**已知风险**：
- 流式输出与保存版本必须事务化，避免 UI 显示完成但数据库缺少 AgentRun。

**验收标准**：
- 最低：能生成故事骨架、改编策略和分集剧本；每次生成都形成版本记录；能编辑、对比、回滚和锁定；审核失败能修复或人工豁免。
- 回归：章节修改仍能触发剧本下游影响检查。

**已完成证据**：
- `script-service.ts` / `agent-run-service.ts` / `text-artifact-service.ts` 实质等价完成 ✅。
- AgentRun + UsageRecord 链路通过 `lib/agent/executor.ts` 等价接入 ✅。
- StoryOutline / AdaptationPlan / ScriptVersion 版本闭环已存在并可运行。

**剩余工作**：
- **缺失关键 UX 件**：`web/app/components/script/ScriptDiffModal.tsx` 尚未实现 → 版本对比 + 回滚确认的用户体验链路未关闭。
- 需补齐：剧本版本 Diff 视图（左右对照 / inline diff）、回滚操作的二次确认与影响清单提示。
- 完成口径：补齐 ScriptDiffModal 并接入 ScriptManagementTab，使「对比 / 回滚」按钮可达到 Spec 描述的交互效果后，Phase 5 可转为 ✅ 完成。

---

## Phase 6: 资产塑造、AssetVersion 与跨集 IP 时间线

**状态**：🟡 部分完成（资产 CRUD / 版本 / 跨集时间线已完成，`asset-generation-service.ts` 仍为 17 行 stub）

**交付内容**：
- 用户能管理角色、场景、道具、服装/妆造资产，支持搜索、类型筛选、新增、详情编辑、软删除和同名去重提示。
- 每次上传、生成、抽帧或替换都形成 AssetVersion；用户能选择 canonicalVersion，Track 只能引用确定 AssetVersion。
- 用户能在项目级跨集 IP 资产时间线查看复用、变体、新增、canonical 不一致和视觉漂移风险。

**关键文件**：
- `[新增] web/app/lib/server/assets/asset-service.ts` — Asset、AssetVersion、canonicalVersion 和引用查询。
- `[新增] web/app/lib/server/assets/asset-generation-service.ts` — 提示词润色、图片任务提交和 AssetVersion 候选创建。
- `[新增] web/app/api/projects/[projectId]/assets/route.ts` — 资产列表、新增、批量操作 API。
- `[新增] web/app/api/projects/[projectId]/assets/[assetId]/versions/route.ts` — 版本画廊、canonical 选择、归档 API。
- `[新增] web/app/api/projects/[projectId]/ip-timeline/route.ts` — 跨集资产时间线 API。
- `[新增] web/app/projects/[projectId]/tabs/AssetsTab.tsx` — 塑造 Tab。
- `[新增] web/app/projects/[projectId]/ip-timeline/page.tsx` — 跨集 IP 资产时间线独立大屏。
- `[新增] web/app/components/assets/AssetVersionDrawer.tsx` — 版本详情、来源、授权和 Track 引用。

**依赖前置 Phase**：
- 依赖 Phase 5（资产可从剧本和大纲提取）。
- 依赖 Phase 2（图片、视频帧和授权信息写入 Artifact）。

**验收标准**：
- 最低：资产支持新增、筛选、详情编辑、软删除；每次上传或生成都形成 AssetVersion；canonicalVersion 由用户确认；跨集时间线能按类型、集数和一致性状态筛选。
- 回归：剧本详情里的资产关联仍能保存并触发下游影响检查。

**已完成证据**：
- 资产 CRUD / AssetVersion / canonicalVersion 选择已完成 ✅。
- 跨集 IP 资产时间线 API 与独立大屏页面已落盘 ✅。
- AssetsTab + AssetVersionDrawer 已具备基本展示能力 ✅。

**剩余工作**：
- **`web/app/lib/server/assets/asset-generation-service.ts` 仅 17 行 stub**，未真实接入提示词润色 / 图片任务提交 / AssetVersion 候选写回链路。
- 两种收口路径（择一执行）：
  1. **真实化路径**：在 `asset-generation-service.ts` 内实现完整提示词模板 + 图片任务投递 + 版本候选回写 + AgentRun / UsageRecord 写入。
  2. **抽取路径**：显式将 `seedance/assets/*` 的资产生成逻辑抽取到通用 `generation-service` 抽象层（与 Phase 7 通用抽象层共享），由 `asset-generation-service.ts` 作为 thin wrapper 调用。
- 完成口径：任一路径落地、并经 PGE 双循环 implementation-review 通过后，Phase 6 转为 ✅ 完成。

---

## Phase 7: A→C3 制作管线与自动运行视图

**状态**：🟡 部分完成（seedance 体系已覆盖 A→C3 节点产物，剩余通用抽象层 + `~sd auto` 编排 + auto-run 大屏 5 种模式 + AutoRunEventStream）

**交付内容**：
- 用户能在制作工作台查看 A/B/C1/C2/C3/D/E 七节点状态，并查看 DirectorAnalysis、DirectorPlan、Storyboard、PromptPack、TrackPlan 产物。
- 用户能启动 `~sd auto`，系统按 A→B→C1→C2→C3 顺序执行，失败或 blocked 时暂停并给出修复入口。
- 自动管线运行视图以 5 种模式展示阶段进度、产物摘要、Agent 日志、Token/成本统计和人工介入面板。

**关键文件**：
- `[新增] web/app/lib/server/pipeline/pipeline-service.ts` — A-E 节点状态机和产物索引。
- `[新增] web/app/lib/server/pipeline/auto-run-service.ts` — `~sd auto` 编排、暂停、恢复、跳过和终止。
- `[新增] web/app/lib/server/pipeline/pipeline-artifacts.ts` — DirectorAnalysis、DirectorPlan、Storyboard、PromptPack、TrackPlan Artifact 写入。
- `[新增] web/app/api/projects/[projectId]/pipeline/route.ts` — 管线状态与节点产物 API。
- `[新增] web/app/api/projects/[projectId]/auto-run/route.ts` — 自动运行启动、暂停、恢复、终止 API。
- `[新增] web/app/projects/[projectId]/tabs/ProductionTab.tsx` — 制作工作台 Tab。
- `[新增] web/app/projects/[projectId]/auto-run/page.tsx` — 自动管线运行视图。
- `[新增] web/app/components/pipeline/AutoRunEventStream.tsx` — Agent 日志和任务事件流。

**依赖前置 Phase**：
- 依赖 Phase 5（A/C 文本产物依赖剧本版本）。
- 依赖 Phase 6（B 阶段依赖资产与 AssetVersion）。

**已知风险**：
- 自动运行不能把 D 视频生成纳入 `~sd auto`，C3 完成后必须进入用户确认。

**验收标准**：
- 最低：A→C3 能顺序执行并写入对象和 Artifact；blocked/failed 自动暂停；自动管线运行视图能显示模式 1-5；C3 完成后出现 D 提交确认入口。
- 回归：制作工作台手动逐阶段入口仍可用。

**已完成证据**：
- seedance 体系已覆盖 A→C3 各节点产物（DirectorAnalysis / DirectorPlan / Storyboard / PromptPack / TrackPlan）的具体实现 ✅。
- 各节点产物可经由 seedance 流程产出 Artifact 与对象记录 ✅。
- 制作工作台手动逐阶段入口在 ProductionTab 中有基础呈现 ✅。

**剩余工作**：
- **通用 pipeline-service 抽象层缺失**：seedance 各节点目前散落、缺少统一的 `web/app/lib/server/pipeline/pipeline-service.ts` 抽象（A-E 节点状态机 + 产物索引）。
- **`~sd auto` 编排器缺失**：缺 `web/app/lib/server/pipeline/auto-run-service.ts`（A→B→C1→C2→C3 顺序执行 + 暂停 / 恢复 / 跳过 / 终止）。
- **auto-run 独立大屏缺失**：缺 `web/app/projects/[name]/auto-run/page.tsx`（5 种模式展示 / 阶段进度 / 产物摘要 / Agent 日志 / Token 成本 / 人工介入面板）。
- **`AutoRunEventStream` 组件缺失**：缺 `web/app/components/pipeline/AutoRunEventStream.tsx`（Agent 日志与任务事件流）。
- 完成口径：以上 4 项落地，配合 `api/projects/[name]/pipeline/route.ts` + `auto-run/route.ts` 经 PGE 双循环 implementation-review 通过后，Phase 7 转为 ✅ 完成。
- 注：可考虑与 Phase 6【剩余工作】中的「抽取路径」共享 generation-service 抽象层。

---

## Phase 8: D 阶段 TrackPlan、策略决策与路径 5

**状态**：⏳ 待开始

**交付内容**：
- 用户能展开 Track 和 TrackSegment，编辑时间段、画面目标、动作、镜头、嘴型、情绪和参考资产。
- 系统按 Track 内容和多视频供应商能力矩阵自动决策生成策略，并显示策略理由和不兼容处理。
- 路径 5 在 D 阶段提交前展示 Track 策略、依赖检查、模型能力、预算、并发上限和批量提交确认。

**关键文件**：
- `[新增] web/app/lib/server/tracks/track-plan-service.ts` — TrackPlan、Track、TrackSegment CRUD 和锁定。
- `[新增] web/app/lib/server/tracks/strategy-decision.ts` — 5 种策略决策规则和解释文本。
- `[新增] web/app/lib/server/models/video-capability-matrix.ts` — 策略 × 视频模型能力矩阵。
- `[新增] web/app/lib/server/production/dependency-check.ts` — 策略依赖清单和 ready/blocked 状态。
- `[新增] web/app/api/projects/[projectId]/tracks/route.ts` — Track 列表、编辑、拆分和锁定 API。
- `[新增] web/app/api/projects/[projectId]/path5/route.ts` — D 提交确认、预算和批量提交 API。
- `[新增] web/app/projects/[projectId]/path5/page.tsx` — 路径 5 D 提交确认页。
- `[新增] web/app/components/tracks/TrackExpandedRow.tsx` — TrackSegment、策略、依赖和质量状态展开行。

**依赖前置 Phase**：
- 依赖 Phase 7（TrackPlan 来自 C2/C3 产物）。
- 依赖 Phase 3（策略决策需要 ModelConfig 和能力矩阵）。

**验收标准**：
- 最低：TrackSegment 可编辑、拆分、锁定；系统自动给出策略和理由；不兼容模型不静默降级；路径 5 缺依赖时禁用提交并指向修复入口。
- 回归：A→C3 自动运行完成后能正确跳转路径 5。

---

## Phase 9: 任务队列、ProductionFrame、视频 Take 与成本记录

**状态**：⏳ 待开始

**交付内容**：
- 系统能按策略生成或复用首帧、尾帧、多关键帧和上一段尾帧，形成 ProductionFrame 并锁定引用。
- 系统能批量提交视频 Task，保存 providerJobId、idempotencyKey、attemptNo、requestHash、成本估算和实际 UsageRecord。
- 用户能在 D 任务模式查看 Track 任务网格、缩略图、耗时、失败原因、重试入口和 duplicate_blocked。

**关键文件**：
- `[新增] web/app/lib/server/tasks/task-queue.ts` — Task 状态、依赖 DAG、暂停、取消、重试和恢复。
- `[新增] web/app/lib/server/tasks/idempotency.ts` — requestHash、providerJobId 和重复任务拦截。
- `[新增] web/app/lib/server/production/frame-service.ts` — ProductionFrame 生成、上传、抽帧和锁定。
- `[新增] web/app/lib/server/production/video-task-service.ts` — 视频任务提交、轮询和 Artifact 保存。
- `[新增] web/app/lib/server/usage/usage-service.ts` — 估算、实际、失败和重试成本记录。
- `[新增] web/app/api/tasks/route.ts` — 全局任务查询、暂停、恢复和取消 API。
- `[新增] web/app/api/projects/[projectId]/takes/route.ts` — Take 创建、列表、问题标记和父 take 血缘 API。
- `[新增] web/app/components/tasks/TrackTaskGrid.tsx` — D 阶段任务网格。

**依赖前置 Phase**：
- 依赖 Phase 8（视频任务必须读取 Track 策略和依赖检查结果）。
- 依赖 Phase 2（ProductionFrame、Take 和视频文件需要 Artifact 仓库）。

**已知风险**：
- 视频供应商轮询和本地任务状态必须能在服务重启后对账，不能只靠内存状态。

**验收标准**：
- 最低：依赖 ready 后能提交视频任务；Take 保存输入、策略、模型、参数、prompt、成本和 providerJobId；重复点击不会重复扣费；任务刷新后可恢复状态。
- 回归：路径 5 预算和批量提交状态与任务中心数据一致。

---

## Phase 10: 质量门禁与 Take 审核

**状态**：⏳ 待开始（`TakeDeliveryTab.tsx` 壳存在但内容空）

**交付内容**：
- QualityGate 覆盖 ScriptVersion、AssetVersion、ProductionFrame、Take 和 RoughCut，记录 metric、scope、denominator、passedCount、failedItems、confidence、samplingRule、reviewSource、operatorDecision 和 waiverReason。
- 用户能在 Take 审核面板预览多个 take，按动作不对、角色漂移、构图不对、嘴型不对、时长不对、道具缺失、合规失败发起重试。
- 只有通过质量门禁或人工豁免的 locked take 能进入 RoughCut。

**关键文件**：
- `[新增] web/app/lib/server/quality/quality-gate-service.ts` — 质量指标、抽样规则、人工决策和豁免记录。
- `[新增] web/app/lib/server/quality/video-quality-protocol.ts` — 角色一致、构图、动作、嘴型、连续性、合规检查协议。
- `[新增] web/app/api/projects/[projectId]/quality-gates/route.ts` — 质量门禁查询、通过、驳回、豁免 API。
- `[新增] web/app/api/projects/[projectId]/takes/[takeId]/route.ts` — Take 接受、重试、替换、锁定和问题标记 API。
- `[新增] web/app/projects/[projectId]/tabs/TakeDeliveryTab.tsx` — Take/粗剪交付 Tab。
- `[新增] web/app/components/takes/TakeReviewPanel.tsx` — 深色媒体预览、take 候选和重试按钮。
- `[新增] web/app/components/quality/QualityGatePanel.tsx` — 门禁结果、分母、失败项和豁免说明。

**依赖前置 Phase**：
- 依赖 Phase 9（Take 和 ProductionFrame 是质量门禁对象）。

**已知风险**：
- P0 允许 AI 初筛 + 人工确认组合，但结构化记录不能省略。

**验收标准**：
- 最低：Take 列表支持接受、重试、替换、标记问题和锁定；质量门禁失败时不能锁定；人工豁免必须记录 Operator、原因、影响范围和时间。
- 回归：D 任务网格里 take 状态与审核面板一致。

---

## Phase 11: E 粗剪交付、AudioSubtitlePlan 与 EpisodeDeliveryPackage

**状态**：⏳ 待开始

**交付内容**：
- 系统只读取 locked take 组装 RoughCut，未锁定 Track 显示为缺口。
- 系统按 TrackSegment 生成 AudioSubtitlePlan，记录旁白、台词、嘴型、音效、字幕时间段和后续导出入口。
- 系统生成 EpisodeDeliveryPackage，包含粗剪视频、locked take 清单、AudioSubtitlePlan、素材清单、剪辑工程清单、manifest 和缺失检查。

**关键文件**：
- `[新增] web/app/lib/server/delivery/roughcut-service.ts` — RoughCut 组装、版本、缺口列表和预览。
- `[新增] web/app/lib/server/delivery/audio-subtitle-plan-service.ts` — TrackSegment 到音频字幕计划的转换。
- `[新增] web/app/lib/server/delivery/episode-package-service.ts` — EpisodeDeliveryPackage manifest、Artifact 清单和导出。
- `[新增] web/app/api/projects/[projectId]/roughcuts/route.ts` — 粗剪生成、预览和锁定 API。
- `[新增] web/app/api/projects/[projectId]/audio-subtitle-plan/route.ts` — 音频字幕计划 API。
- `[新增] web/app/api/projects/[projectId]/episode-delivery-package/route.ts` — 单集交付包生成和下载 API。
- `[新增] web/app/components/delivery/RoughCutTimeline.tsx` — 粗剪时间线、缺口和质量门禁。
- `[新增] web/app/components/delivery/AudioSubtitlePlanPanel.tsx` — 旁白、台词、嘴型、音效和字幕计划。

**依赖前置 Phase**：
- 依赖 Phase 10（只有 locked take 和 RoughCut QualityGate 通过后才能交付）。

**验收标准**：
- 最低：RoughCut 只读取 locked take；缺失 Track 显示缺口；AudioSubtitlePlan 与 RoughCut 版本关联；EpisodeDeliveryPackage 能导出 manifest 和素材清单。
- 回归：ProjectMigrationPackage 不出现在 E 阶段，EpisodeDeliveryPackage 不出现在设置降级页。

---

## Phase 12: 任务中心、恢复对账与成本复盘

**状态**：⏳ 待开始（`tasks/page.tsx` 壳存在但内容空）

**交付内容**：
- 用户能在任务中心查看本地 Task、远端 providerJobId、恢复状态、重试次数、成本、失败原因和操作入口。
- 系统能根据 Task、providerJobId 和 Artifact 状态恢复远端任务结果，标记 orphaned、reconciled、failed、reconciling 和 duplicate_blocked。
- 用户能按项目、单集、Track、模型、策略维度查看 UsageRecord 汇总、失败成本、重试成本和供应商账单对账状态。

**关键文件**：
- `[新增] web/app/lib/server/tasks/reconcile-service.ts` — 远端任务恢复、孤儿结果和对账状态。
- `[新增] web/app/lib/server/usage/cost-report-service.ts` — 成本聚合和估算偏差统计。
- `[新增] web/app/api/tasks/reconcile/route.ts` — 任务对账 API。
- `[新增] web/app/api/usage/route.ts` — UsageRecord 汇总 API。
- `[新增] web/app/tasks/page.tsx` — 任务中心页面。
- `[新增] web/app/components/tasks/TaskTable.tsx` — 任务表格、恢复、取消、重试和对账操作。
- `[新增] web/app/components/usage/CostReviewPanel.tsx` — 成本复盘面板。

**依赖前置 Phase**：
- 依赖 Phase 9（任务与 UsageRecord 已写入）。
- 依赖 Phase 11（导出任务与 RoughCut 成本也进入汇总）。

**验收标准**：
- 最低：任务中心能显示 queued/running/paused/cancelled/retrying/succeeded/failed/reconciling/duplicate_blocked；重启后可对账；成本复盘能按策略和模型聚合。
- 回归：D 阶段任务网格与任务中心对同一 Task 显示一致。

---

## Phase 13: 治理能力、迁移包与安全删除

**状态**：⏳ 待开始

**交付内容**：
- 用户能只读扫描旧 `novels/`，预览章节、配置、脚本、资产、review、seedance 产物和任务记录，确认后导入为新对象记录。
- 用户能导出和恢复 ProjectMigrationPackage，导出使用一致性快照，manifest 记录 DB revision、schemaVersion、Artifact hash、缺失项、运行中任务和敏感配置排除项。
- 用户能使用回收站、安全删除和审计日志，删除、解锁、豁免、导入、导出、密钥变更都写入 AuditLog。

**关键文件**：
- `[新增] web/app/lib/server/legacy-import/legacy-import-service.ts` — 旧 `novels/` 只读扫描、映射、导入和校验。
- `[新增] web/app/lib/server/export/project-migration-package-service.ts` — 项目迁移包一致性快照和恢复。
- `[新增] web/app/lib/server/trash/trash-service.ts` — 软删除、恢复、硬删除影响清单和 Artifact 清理。
- `[新增] web/app/lib/server/audit/audit-log-service.ts` — 敏感操作审计。
- `[新增] web/app/settings/legacy-import/page.tsx` — 旧项目导入向导。
- `[新增] web/app/settings/project-migration-package/page.tsx` — ProjectMigrationPackage 导出检查页。
- `[新增] web/app/settings/trash/page.tsx` — 回收站和安全删除页。
- `[新增] web/app/settings/audit-log/page.tsx` — 操作记录页。

**依赖前置 Phase**：
- 依赖 Phase 2（导入、迁移和回收都依赖数据库与 Artifact 仓库）。
- 依赖 Phase 3（敏感配置和访问凭据需要审计主体）。

**验收标准**：
- 最低：Legacy Import 不覆盖、不删除旧目录；ProjectMigrationPackage 默认排除 SecretRef；回收站能恢复关键对象；硬删除前展示数据库记录和 Artifact 清理影响；AuditLog 可按对象、操作人、时间和类型筛选。
- 回归：EpisodeDeliveryPackage 与 ProjectMigrationPackage 的 UI 入口和 manifest 类型保持分离。

---

## Phase 14: 辅助智能能力收口

**状态**：⏳ 待开始

**交付内容**：
- 实现 Agent 记忆查看、确认、清空和近期上下文恢复，不让导入文本越权成为系统指令。
- 实现章节事件图谱提取和召回，用于剧本改编时增强上下文，但不替代 SourceDocument / Chapter 主记录。
- 实现可编程供应商配置入口，支持私有网关模型列表、参数模板和能力探测，不影响默认 ProviderConfig / ModelConfig 主路径。

**关键文件**：
- `[新增] web/app/lib/server/agent-memory/memory-service.ts` — Agent 记忆记录、确认和清空。
- `[新增] web/app/lib/server/story-graph/event-graph-service.ts` — 章节事件、角色关系和召回查询。
- `[新增] web/app/lib/server/providers/programmatic-provider-service.ts` — 可编程供应商模板和能力探测。
- `[新增] web/app/settings/agent-memory/page.tsx` — Agent 记忆设置页。
- `[新增] web/app/settings/story-graph/page.tsx` — 章节事件图谱查看页。
- `[新增] web/app/settings/programmatic-providers/page.tsx` — 私有供应商配置页。

**依赖前置 Phase**：
- 依赖 Phase 5（AgentRun 和对话历史已存在）。
- 依赖 Phase 3（ProviderConfig 和 SkillVersion 已存在）。

**已知风险**：
- 这些能力是增强项，不能改变 A-E 主链路的完成定义。

**验收标准**：
- 最低：用户能查看和清空 Agent 记忆；剧本生成可选择事件图谱召回；可编程供应商能测试连接并写入能力探测结果。
- 回归：默认剧本 Agent、Production Agent 和视频任务在不启用增强项时仍按 Phase 5-12 的主流程运行。

---

## Phase 15: Electron 壳、打包与端到端闭环

**状态**：⏳ 待开始（`electron/main.ts` + `preload.ts` 壳存在但配套页面 + E2E 缺）

**交付内容**：
- Electron 只负责启动同一套 HTTP Web 服务和打开窗口，不形成独立业务逻辑或独立数据路径。
- 完成本机、局域网、私有服务器三种访问形态的启动提示、base URL 配置和安全提示。
- 完成一条端到端验收：新建项目 → 导入原文 → 生成剧本 → 塑造资产 → A→C3 自动运行 → 路径 5 → D 视频任务 → Take 锁定 → E 粗剪交付 → EpisodeDeliveryPackage 导出。

**关键文件**：
- `[修改] electron/main.ts` — 启动 Web 服务、端口探测、窗口加载和退出清理。
- `[修改] electron/preload.ts` — 只暴露启动状态和窗口控制，不暴露文件系统写接口。
- `[修改] package.json` — 打包脚本、资源清单和 Electron 版本对齐。
- `[新增] web/app/api/system/service-addresses/route.ts` — 当前 localhost、LAN、private_server 地址查询。
- `[新增] web/app/settings/access/page.tsx` — 访问地址、访问模式、风险提示和访问凭据。
- `[新增] docs/toonflow-e2e-acceptance.md` — 端到端验收路径和命令记录。

**依赖前置 Phase**：
- 依赖 Phase 1-13（端到端闭环需要 Web、数据层、生产链路、导出与治理能力）。

**已知风险**：
- Electron 打包时 native SQLite、Next standalone 和 Artifact 目录权限需要独立验证。

**验收标准**：
- 最低：`npm run build` 通过；Electron 打开同一 Web UI；浏览器直连 `localhost` 仍可用；端到端验收文档中的核心路径可以跑通并导出 EpisodeDeliveryPackage。
- 回归：非 Electron 浏览器访问不依赖桌面壳。

---

## 技术栈

| 层级 | 技术 | 版本 | 说明 |
| --- | --- | --- | --- |
| 运行时 | Node.js | 22.22.1 | 与当前开发机和既有 approved 命令一致；Node 22 仍处 LTS 支持窗口 |
| Web 框架 | Next.js App Router | 15.5.18 | 按 2026-05 Next.js 安全发布升级；现有 `15.5.14` 低于修复线 |
| UI | React / React DOM | 19.1.0 | 与现有项目一致；Next 15 peer range 支持 React 19 |
| 样式 | Tailwind CSS + PostCSS | 4.2.2 | 现有锁文件版本；设计变量写入 CSS-first 体系 |
| 图标 | lucide-react | 1.7.0 | 现有依赖，用于工具按钮和导航图标 |
| 数据库 | SQLite + better-sqlite3 | better-sqlite3 12.9.0 | 本地优先、同步事务、适合单机生产管线 |
| ORM / Migration | Drizzle ORM + Drizzle Kit | drizzle-orm 0.45.2 / drizzle-kit 0.31.10 | 类型化 schema、迁移和 SQLite 支持 |
| 校验 | Zod | 4.4.3 | API 输入、配置、Artifact manifest 和导出包校验 |
| 桌面壳 | Electron | 41.2.0 | 仅作为 HTTP Web 壳；与 web package 当前版本对齐 |
| 包管理 | npm | 10.x | 仓库已有 `package-lock.json` 与 npm scripts；Phase 1 固化为唯一执行入口 |
| 部署 | HTTP Web / 私有服务器 / Electron 壳 | 本地构建 | 浏览器直连优先，Electron 只封装同一 Web 服务 |

**技术验证依据**：
- Next.js 2026-05 安全发布要求 Next.js 15.x `<=15.5.17` 升级到 `15.5.18`。
- Next.js CVE-2025-66478 官方公告要求 App Router 用户升级到对应 patched release。
- React 官方 RSC 安全公告说明 React Server Components 漏洞和框架升级路径。
- Electron 官方 release 记录确认 `electron@41.2.0` 对应 Chromium 146 / Node 24.14.0 / V8 14.6。
- Tailwind 官方文档确认 v4 的 CSS-first 使用方式和零运行时扫描模型。
- Node.js Release Working Group 记录 Node 22 Maintenance LTS 支持到 2027-04-30。
- Drizzle 官方 SQLite 文档确认 Drizzle 支持 `better-sqlite3` 驱动。

## 数据库表

| 表名 | 创建 Phase | 修改记录 | 用途（含外键关系） |
| --- | --- | --- | --- |
| `schema_migrations` | Phase 2 | — | SchemaMigration 记录，保存 schemaVersion、migrationId、appliedAt 和回滚信息 |
| `artifacts` | Phase 2 | Phase 13 加导出快照字段 | 文件产物索引，供 SourceDocument、AssetVersion、ProductionFrame、Take、RoughCut、ExportPackage 引用 |
| `runtime_checks` | Phase 2 | — | RuntimeCheck 结果，关联触发对象和失败项 |
| `projects` | Phase 3 | Phase 13 加 trash 状态 | Project 主表，关联所有项目级对象 |
| `episodes` | Phase 3 | — | Episode 表，`episodes.project_id → projects.id` |
| `access_credentials` | Phase 3 | — | AccessCredential，非 localhost 访问控制和审计身份映射 |
| `operators` | Phase 3 | — | Operator，本地默认身份和私有服务器访问身份 |
| `provider_configs` | Phase 3 | Phase 14 加可编程模板引用 | ProviderConfig，`provider_configs.secret_ref_id → secret_refs.id` |
| `model_configs` | Phase 3 | Phase 8 加视频能力字段 | ModelConfig，`model_configs.provider_id → provider_configs.id` |
| `secret_refs` | Phase 3 | — | SecretRef 元数据，不保存可导出明文 |
| `skill_versions` | Phase 3 | Phase 14 加模板来源 | SkillVersion，供 AgentRun 追溯使用 |
| `source_documents` | Phase 4 | — | SourceDocument，`source_documents.project_id → projects.id`，`artifact_id → artifacts.id` |
| `chapters` | Phase 4 | Phase 14 加事件图谱索引 | Chapter，`chapters.source_document_id → source_documents.id` |
| `dependency_edges` | Phase 4 | Phase 8 加 Track 依赖 | 上下游影响图，记录 fromObject、toObject 和 invalidationRule |
| `story_outlines` | Phase 5 | — | StoryOutline 版本，关联 Project、Chapter revision、AgentRun |
| `adaptation_plans` | Phase 5 | — | AdaptationPlan 版本，关联 StoryOutline 和 AgentRun |
| `script_versions` | Phase 5 | Phase 6 加资产引用摘要 | ScriptVersion，`script_versions.episode_id → episodes.id` |
| `agent_runs` | Phase 5 | Phase 14 加 memoryContextId | AgentRun，关联 SkillVersion、ModelConfig、Task 和输出对象 |
| `quality_gates` | Phase 5 | Phase 10 加视频质量字段 | QualityGate，关联任意锁定对象、Operator 决策和豁免原因 |
| `agent_conversations` | Phase 5 | Phase 14 加 memory 状态 | 剧本 Agent 对话历史和近期上下文 |
| `assets` | Phase 6 | Phase 13 加 trash 状态 | Asset，`assets.project_id → projects.id` |
| `asset_versions` | Phase 6 | — | AssetVersion，`asset_versions.asset_id → assets.id`，`artifact_id → artifacts.id` |
| `script_asset_links` | Phase 6 | — | ScriptVersion 到 Asset 的确定引用 |
| `ip_asset_timeline_entries` | Phase 6 | — | 跨集资产出现、canonical、复用、变体和漂移风险 |
| `pipeline_runs` | Phase 7 | — | A-E 管线运行记录，关联 Project、Episode 和 AgentRun |
| `director_analyses` | Phase 7 | — | DirectorAnalysis，关联 Episode、ScriptVersion 和 Artifact |
| `director_plans` | Phase 7 | — | DirectorPlan，关联 DirectorAnalysis 和 Artifact |
| `storyboards` | Phase 7 | — | Storyboard，关联 DirectorPlan 和 Artifact |
| `prompt_packs` | Phase 7 | — | PromptPack，关联 Storyboard 和 Artifact |
| `track_plans` | Phase 7 | Phase 8 加策略摘要 | TrackPlan，关联 PromptPack 和 Episode |
| `auto_runs` | Phase 7 | — | `~sd auto` 运行状态、模式、阶段进度和日志索引 |
| `tracks` | Phase 8 | Phase 9 加视频任务摘要 | Track，`tracks.track_plan_id → track_plans.id` |
| `track_segments` | Phase 8 | — | TrackSegment，`track_segments.track_id → tracks.id` |
| `video_capabilities` | Phase 8 | — | 策略 × 视频模型能力矩阵，关联 ModelConfig |
| `production_frames` | Phase 9 | Phase 10 加质量状态 | ProductionFrame，关联 Track、AssetVersion 和 Artifact |
| `tasks` | Phase 9 | Phase 12 加 reconciliation 字段 | Task，记录 providerJobId、requestHash、attemptNo、状态和依赖 |
| `takes` | Phase 9 | Phase 10 加审核字段 | Take，`takes.track_id → tracks.id`，`artifact_id → artifacts.id`，`parent_take_id → takes.id` |
| `usage_records` | Phase 9 | Phase 12 加账单对账字段 | UsageRecord，关联 Task、ModelConfig、Project、Episode、Track |
| `rough_cuts` | Phase 11 | — | RoughCut，关联 Episode、locked Take 列表和 Artifact |
| `audio_subtitle_plans` | Phase 11 | — | AudioSubtitlePlan，关联 RoughCut、TrackSegment 和 Artifact |
| `export_packages` | Phase 11 | Phase 13 加 ProjectMigrationPackage 字段 | ExportPackage 基类，区分 EpisodeDeliveryPackage 和 ProjectMigrationPackage |
| `task_reconciliations` | Phase 12 | — | 任务恢复、远端对账和 orphaned 记录 |
| `legacy_imports` | Phase 13 | — | LegacyImport 扫描、映射、导入和校验记录 |
| `trash_entries` | Phase 13 | — | 回收站、软删除、恢复和硬删除影响清单 |
| `audit_logs` | Phase 13 | — | AuditLog，记录删除、解锁、豁免、导出、导入和密钥变更 |
| `agent_memories` | Phase 14 | — | Agent 记忆确认、清空和召回记录 |
| `chapter_events` | Phase 14 | — | 章节事件图谱，`chapter_events.chapter_id → chapters.id` |
| `programmatic_provider_templates` | Phase 14 | — | 私有供应商代码、参数模板和能力探测结果 |

## 开发规则

**项目特定规则**：
- 包管理器：npm；Phase 1 固化 `package-lock.json`，不把 `web/pnpm-lock.yaml` 作为开发入口。
- HTTP Web 是第一入口；Electron 只启动同一 Web 服务，不写第二套业务逻辑。
- 新产品数据不直接读写 `novels/`；旧 `path.join(process.cwd(), '..', 'novels')` 只用于 legacy import 只读扫描和旧兼容 API。
- 所有项目数据必须经 Next.js API Route、服务层、数据库事务和 Artifact 仓库写入。
- 所有 AI 生成产物必须记录 AgentRun、SkillVersion、ModelConfig、Task、UsageRecord 和 Artifact。
- 所有锁定对象只读；修改 locked take、ProductionFrame、RoughCut 或 ExportPackage 必须复制新版本或显式解锁并写 AuditLog。
- 非 localhost 访问必须开启访问凭据；private_server 或公网反代必须配置 HTTPS 或显示强风险提示。
- SecretRef 明文不进入前端响应、日志、ProjectMigrationPackage 或普通 Artifact。
- 视频任务提交必须使用 requestHash / idempotencyKey；重复提交进入 duplicate_blocked，不再次扣费。
- QualityGate 失败且无人工豁免时不能进入下游阶段，RoughCut 锁定必须满足 Spec 的 6 项成片质量指标记录。
- `EpisodeDeliveryPackage` 只属于 E 粗剪交付；`ProjectMigrationPackage` 只属于设置/迁移治理路径。
- 每个 Phase 完成后运行：`npm run build --prefix web`；涉及 Electron 的 Phase 同时运行 `npm run build:electron`。

**通用规则**（按 dev-builder [开发规则]）：
- 详细见 dev-builder SKILL.md，本文件不重复定义。
