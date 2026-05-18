# PLAN: 项目页面 Tab 重构 + 大纲管理 Tab

> 生成时间：2026-04-08
> 任务：项目详情页 Tab 结构重构（4 Tab → 5 Tab）、新增大纲管理 Tab、重构剧本管理 Tab、新增资产管理 Tab

---

## 需求概要

将项目详情页从 4 Tab（项目概述 | 小说原文 | 内容工作台 | 制作管理）重构为 5 Tab（项目概览 | 小说原文 | 大纲管理 | 剧本管理 | 资产管理），新增大纲管理 Tab（含 AI 聊天面板 + 四个子页），重构剧本管理和资产管理 Tab。

## 现状分析

- **Tab 类型定义**：`types.tsx` 中 `Tab = 'overview' | 'chapters' | 'workbench' | 'production'`
- **现有 Tab 组件**：OverviewTab、ChaptersTab、ContentWorkbench、ProductionTab、ScriptsTab、OutlineTab
- **API 路由**：storyline / outline / skeleton / adaptation / scripts / assets 均已存在，无需新增后端
- **可复用组件**：MarkdownPreview、MarkdownEditorModal、ChatPanel（workbench 内）

## 技术约束

- 不修改后端 API Routes
- TypeScript + Tailwind CSS v4
- lucide-react 图标
- 复用现有 MarkdownPreview / MarkdownEditorModal 组件

---

## Phase 0: 准备阶段（用户参与）

| 步骤 | 负责 Agent | 任务 | 产出 |
|------|-----------|------|------|
| 0.1 | web-designer | 设计各 Tab 的 UI 方案（基于用户提供的产品说明截图描述） | 页面设计方案 |
| 0.2 | web-architect | 审核技术方案 + 组件复用策略 | 架构审查意见 |
| 0.3 | web-main | 汇报设计+架构方案 | 用户确认 |

## Phase 1: Tab 结构重构

| 步骤 | 负责 Agent | 任务 | 产出文件 |
|------|-----------|------|---------|
| 1.1 | web-developer | 修改 `types.tsx`：Tab 类型改为 5 Tab、更新 TAB_ICONS | `types.tsx` |
| 1.2 | web-developer | 修改 `page.tsx`：tabs 数组改为 5 Tab、引入新组件、更新渲染逻辑 | `page.tsx` |
| 1.3 | web-developer | 编译自测 | 编译结果 |
| 1.4 | web-architect | 代码审查 | 审查报告 |

**依赖**：Phase 0 用户确认

## Phase 2: 大纲管理 Tab（页面开发）

| 步骤 | 负责 Agent | 任务 | 产出文件 |
|------|-----------|------|---------|
| 2.1 | web-developer | 新建 `OutlineManageTab.tsx`：左侧 AI 聊天面板 + 右侧四子页（故事线/大纲/故事骨架/改编策略） | `tabs/OutlineManageTab.tsx` |
| 2.2 | web-developer | 编译自测 | 编译结果 |
| 2.3 | web-architect | 代码审查 | 审查报告（FAIL → developer 修复 → 回 2.3） |
| 2.4 | web-tester | 功能测试（API 调用、子页切换、编辑保存、空状态） | 测试报告（FAIL → architect 分配 → developer 修复 → 回 2.3） |
| 2.5 | web-ui-reviewer | 视觉对比（布局比例、配色、交互） | UI 审查报告（FAIL → architect 分配 → developer 修复 → 回 2.1） |

**数据接口（均已存在）**：
- 故事线：`GET/PUT /api/projects/${name}/storyline`
- 大纲：`GET /api/projects/${name}/outline`
- 故事骨架：`GET /api/projects/${name}/skeleton`
- 改编策略：`GET /api/projects/${name}/adaptation`

## Phase 3: 剧本管理 Tab 重构

| 步骤 | 负责 Agent | 任务 | 产出文件 |
|------|-----------|------|---------|
| 3.1 | web-developer | 重构 `ScriptsTab.tsx`：统计栏 + 集数切换 + 关联资产区 + 剧本内容区 + 空状态 | `tabs/ScriptsTab.tsx` 及子组件 |
| 3.2 | web-developer | 编译自测 | 编译结果 |
| 3.3 | web-architect | 代码审查 | 审查报告 |
| 3.4 | web-tester | 功能测试 | 测试报告 |
| 3.5 | web-ui-reviewer | 视觉对比 | UI 审查报告 |

## Phase 4: 资产管理 Tab

| 步骤 | 负责 Agent | 任务 | 产出文件 |
|------|-----------|------|---------|
| 4.1 | web-developer | 新建 `AssetsTab.tsx`：资产网格、卡片（缩略图+名称+标签）、集数筛选 | `tabs/AssetsTab.tsx` |
| 4.2 | web-developer | 编译自测 | 编译结果 |
| 4.3 | web-architect | 代码审查 | 审查报告 |
| 4.4 | web-tester | 功能测试 | 测试报告 |
| 4.5 | web-ui-reviewer | 视觉对比 | UI 审查报告 |

## Phase 5: 最终交付（用户参与）

| 步骤 | 负责 Agent | 任务 | 产出 |
|------|-----------|------|------|
| 5.1 | web-developer | 全量编译验证 `npm run build` | 编译结果 |
| 5.2 | web-architect | 全量代码审查（5 个 Tab 整体一致性） | 最终审查报告 |
| 5.3 | web-ui-reviewer | 全页面视觉对比 | 最终 UI 报告 |
| 5.4 | web-main | 最终交付汇报 | 用户验收 |

---

## 轮次规则

- 同一环节最多 2 轮修复，第 3 轮强制通过
- 阻断问题（编译报错/白屏/500/安全漏洞）永不强制通过

## 文件变更清单

| 文件 | 操作 | Phase |
|------|------|-------|
| `app/projects/[name]/types.tsx` | 修改 | 1 |
| `app/projects/[name]/page.tsx` | 修改 | 1 |
| `app/projects/[name]/tabs/OutlineManageTab.tsx` | 新建 | 2 |
| `app/projects/[name]/tabs/ScriptsTab.tsx` | 修改 | 3 |
| `app/projects/[name]/tabs/AssetsTab.tsx` | 新建 | 4 |

---

## 当前进度

- [x] Phase 0: 准备阶段
- [x] Phase 1: Tab 结构重构
- [x] Phase 2: 大纲管理 Tab
- [x] Phase 3: 剧本管理 Tab 重构
- [x] Phase 4: 资产管理 Tab
- [x] Phase 5: 最终交付

---
---

# PLAN: 重写 ChatPanel 组件 + 更新 DESIGN_SPEC.md

> 生成时间：2026-04-08
> 任务：将 AI 聊天面板从"空状态 + 禁用输入框"升级为"消息流 + 可用输入框"，对齐参考项目设计

---

## 需求概要

ChatPanel 当前只有空状态占位和禁用输入框。需要重写为：消息流（角色标签 + Markdown 气泡 + 操作按钮）+ 可交互输入框 + 在线指示。同步更新 DESIGN_SPEC.md 设计规范。

## 涉及文件

| 文件 | 操作 |
|------|------|
| `web/DESIGN_SPEC.md` (211-233 行) | 修改 -- 重写 AI 聊天面板设计规范 |
| `app/projects/[name]/tabs/workbench/ChatPanel.tsx` | 重写 -- 新接口 + 消息流 + 输入框 |
| `app/projects/[name]/tabs/ContentWorkbench.tsx` | 修改 -- 适配新 ChatPanel 接口 |

## Phase 1: 设计规范更新

| 步骤 | 负责 Agent | 任务 | 产出 |
|------|-----------|------|------|
| 1.1 | web-designer | 更新 DESIGN_SPEC.md 第四章 AI 聊天面板部分 | `web/DESIGN_SPEC.md` |

## Phase 2: 组件开发

| 步骤 | 负责 Agent | 任务 | 产出 |
|------|-----------|------|------|
| 2.1 | web-developer | 重写 ChatPanel.tsx（新接口 ChatMessage[]、消息流渲染、MarkdownPreview、可交互输入框） | `ChatPanel.tsx` |
| 2.2 | web-developer | 修改 ContentWorkbench.tsx（模拟消息列表、适配新接口） | `ContentWorkbench.tsx` |
| 2.3 | web-developer | 编译自测 `pnpm build` | 编译结果 |

**约束**：ChatPanel.tsx 必须保留 `StageType` 导出（WorkbenchPanel.tsx 依赖）

## Phase 3: 审核验证

| 步骤 | 负责 Agent | 任务 |
|------|-----------|------|
| 3.1 | web-architect | 代码审查（接口一致性、类型安全） |
| 3.2 | web-tester | 功能测试（消息渲染、输入发送、操作按钮、空状态） |
| 3.3 | web-ui-reviewer | 视觉对比（与参考截图对比） |

## 当前进度

- [ ] Phase 1: 设计规范更新
- [ ] Phase 2: 组件开发
- [ ] Phase 3: 审核验证
