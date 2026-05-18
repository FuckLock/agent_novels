---
name: dev-plan-template
description: DEV-PLAN.md 输出模板。分析 Product Spec 后，按此模板结构填充内容，输出为 DEV-PLAN.md，供 dev-builder 按 Phase 逐步开发。
version: 2.0
---

# DEV-PLAN 输出模板

本模板用于生成分阶段开发计划。
- 输入：Product-Spec.md（功能需求）+ Design-Brief.md（如有 UI 产品）
- 输出：DEV-PLAN.md（项目根目录）
- 下游：dev-builder 按 Phase 逐步实现代码

迭代模式约定：已完成 Phase 在标题后加 ✅ 标记，dev-planner 不修改 ✅ Phase。

---

## 模板结构

**文件命名**：DEV-PLAN.md（放在项目根目录）

---

```markdown
# Development Plan — [项目名称]

> 本文件记录项目的开发阶段划分、当前进度和剩余工作。
> 新 session 启动时应首先阅读此文件，了解项目状态后再继续开发。

**基于信息**：
- 源 Spec：Product-Spec.md v[版本号]
- 生成日期：[YYYY-MM-DD]
- 覆盖 Spec 功能：X 个 / 总 Y 个

---

## Phase 1: [功能名称]

**交付内容**（1-3 项核心交付，超过 3 项考虑拆分）：
- [用动词开头，描述交付物1——用户能做什么 / 系统做什么]
- [交付物2]

**关键文件**（3-8 个，超过考虑拆 Phase）：
- `[新增] src/path/to/file1.tsx` — [用途说明]
- `[修改] src/path/to/file2.ts` — [用途说明]

**依赖前置 Phase**：
- 依赖 Phase N（[原因，如：本 Phase 的聊天 UI 依赖 Phase N 的消息数据库]）
- 无依赖 → 写"无（独立 Phase）"

**已知风险**（可选，无则省略本字段）：
- [描述预期的技术风险或限制]

**验收标准**：
- 最低：能编译 + 能启动 + [新功能可用的具体表现]
- 回归：[列出本 Phase 可能影响的现有功能，确认仍正常]

---

## Phase 2: [功能名称]

...（同上结构）

---

<根据实际功能数量动态增减 Phase>

---

## 技术栈

**填写规则**：
- 层级 + 技术 + 版本 必填
- 说明 可选（写选择理由或用途）
- 版本号必须经 WebSearch 验证（不允许 "latest" 这种模糊值）

**推荐层级**：运行时 / 框架 / UI / 数据库 / 状态管理 / 包管理 / 部署 / AI 引擎（如有）

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| [层级名] | [技术名] | [版本号] | [选择理由或用途] |

## 数据库表（如有）

| 表名 | 创建 Phase | 修改记录 | 用途（含外键关系）|
|------|-----------|---------|------|
| `table_name` | Phase N | — | [用途说明] |
| `table_with_modifications` | Phase 2 | Phase 5 加 X 列 | [用途] |

## 开发规则

**项目特定规则**（dev-builder 通用规则之外的项目约定）：
- 包管理器：[pnpm / npm / yarn / pip / cargo]
- [其他项目特定规则，如：所有 API 用 tRPC / 所有组件支持 i18n / 所有数据库操作用事务]

**通用规则**（按 dev-builder [开发规则]）：
- 详细见 dev-builder SKILL.md，本文件不重复定义
```

---

## 完整示例

**本示例特点**：Desktop / Electron / SQLite / 多 Phase（10+）/ AI 集成

**其他类型项目调整指南**：
- Web SaaS → Phase 1 改 "Next.js 骨架 + Vercel 部署配置"，数据库改 PostgreSQL/Supabase
- CLI 工具 → 删除 UI Phase，Phase 1 改 "Commander 命令行解析"
- API only → 删 UI Phase，加 "OpenAPI 规范" Phase
- Mobile → Phase 1 改 "React Native + Expo 骨架"，数据库改 expo-sqlite

以下是「Forge — 本地 AI 桌面代理」项目的 DEV-PLAN 片段，供参考：

```markdown
# Development Plan — Forge

> 本文件记录 Forge 项目的开发阶段划分、当前进度和剩余工作。
> 新 session 启动时应首先阅读此文件，了解项目状态后再继续开发。

**基于信息**：
- 源 Spec：Product-Spec.md v1.0
- 生成日期：2026-04-19
- 覆盖 Spec 功能：18 个 / 总 18 个

---

## Phase 1: Electron + Next.js 骨架

**交付内容**：
- Electron 主进程 + Next.js 渲染器基础框架
- 三区布局：左侧栏（可折叠）+ 主内容区 + 右侧栏（可折叠）
- 标题栏组件 + 导航图标栏
- 深色/浅色/跟随系统主题切换

**关键文件**：
- `[新增] src/components/layout/app-layout.tsx` — 主布局
- `[新增] src/components/layout/left-sidebar.tsx` — 左侧栏
- `[新增] src/components/layout/right-sidebar.tsx` — 右侧栏
- `[新增] src/components/layout/title-bar.tsx` — 标题栏
- `[新增] src/components/providers/theme-provider.tsx` — 主题
- `[新增] src/app/globals.css` — 色彩变量定义

**依赖前置 Phase**：
- 无（独立 Phase，项目骨架）

**已知风险**：
- Electron 40 + Next.js 15 兼容性需验证

**验收标准**：
- 最低：TypeScript 编译无错误 + Electron 窗口可启动 + 显示三区布局 + 主题切换正常
- 回归：无（首个 Phase）

---

## Phase 2: 聊天核心 + SQLite 持久化

**交付内容**：
- SQLite 数据库初始化（better-sqlite3，WAL 模式）+ 三张表
- 会话 CRUD API + 聊天 API（Claude 流式调用 + SSE）
- 前端聊天界面（流式渲染）+ 会话列表

**关键文件**：
- `[新增] src/lib/db.ts` — 数据库初始化 + 表创建
- `[新增] src/app/api/chat/route.ts` — 聊天 API
- `[新增] src/hooks/use-chat.ts` — 聊天状态管理
- `[新增] src/hooks/use-sessions.ts` — 会话管理
- `[新增] src/components/views/chat-view.tsx` — 聊天视图

**依赖前置 Phase**：
- 依赖 Phase 1（需要主布局承载聊天视图）

**已知风险**：
- Claude API 流式响应处理 + SSE 在 Electron 环境的兼容性

**验收标准**：
- 最低：能创建会话 + 发送消息 + 收到 Claude 流式回复
- 回归：Phase 1 的布局 / 主题切换仍正常

---

## 技术栈

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 桌面框架 | Electron | 40.x | 跨平台桌面壳 |
| 前端 | Next.js + React | 15.x | 全栈框架 |
| UI | Tailwind CSS | 4.x | 工具类 CSS |
| AI 引擎 | Claude API (@anthropic-ai/sdk) | latest | 核心 AI 能力 |
| 数据库 | SQLite (better-sqlite3) | latest | 本地持久化，WAL 模式 |
| 包管理 | pnpm | 10.x | 快速、磁盘高效 |

## 数据库表

| 表名 | 创建 Phase | 修改记录 | 用途（含外键关系）|
|------|-----------|---------|------|
| `sessions` | Phase 2 | — | 会话元数据 |
| `messages` | Phase 2 | — | 消息内容（messages.session_id → sessions.id）|
| `settings` | Phase 2 | — | 全局 key-value 设置 |
| `skills` | Phase 3 | — | Skill 定义 |
| ... | ... | ... | ... |

## 开发规则

**项目特定规则**：
- 包管理器：pnpm
- AI API 调用必须走主进程或 Next.js API route，不在 renderer 直接调
- 所有数据库操作必须用 better-sqlite3 的同步 API

**通用规则**（按 dev-builder [开发规则]）：
- 详细见 dev-builder SKILL.md
```

---

## 写作要点

1. **Phase 命名**：用功能名称（"聊天核心 + SQLite 持久化"），不用编号序列（"Phase 2"）
2. **交付内容**：用动词开头 / 1-3 项 / 基础设施 Phase 写"XX 表 + CRUD API" / 业务 Phase 写"用户能做什么"
3. **关键文件**：完整路径 + [新增/修改] 标记 + 用途说明 / 3-8 个 / 不列测试和配置文件
4. **依赖前置 Phase**：必填字段，无依赖写"无（独立 Phase）"
5. **已知风险**：可选字段，标注预期的技术风险或限制
6. **验收标准**：最低（编译+启动+功能）+ 回归（现有功能未破坏）
7. **技术栈表**：版本号必填且经 WebSearch 验证（不允许 "latest" 模糊值）
8. **数据库表**：标注创建 Phase + 修改记录 + 外键关系（在用途列）
9. **Phase 顺序**：基础设施（骨架/数据库/路由）→ 核心功能 → 辅助功能 → 收尾（i18n/打包/部署）
10. **Spec 校验**：每个 Phase 必须对应 Spec 中的某些功能（DEV-PLAN 总覆盖 ≥ Spec 核心功能）
11. **无占位符**：禁 TBD / TODO / 待补充 / "类似 Phase N" / "添加适当的错误处理" / "实现相关功能"
12. **不重复 dev-builder 规则**：开发规则只写项目特定，通用规则引用 dev-builder
13. **整体原则**：给 dev-builder 看的，具体到能直接执行（不需要再问 Spec）
