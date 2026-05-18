# Web 开发层（当前构建目标）

> Legacy 说明：本文描述旧 Web pipeline / Claude Code 兼容语境。Codex 侧 `.agents/skills/web-*` 与 `.codex/agents/web-*.toml` 已删除；新 Codex 默认路线以 `AGENTS.md` 和 `plans/codex-skill-refactor-inventory.md` 为准。

## 调用层级总览

```
用户
 └─► 主助手（逐步调度）
       │
       ├─► web-pm（产品经理）
       │     ├─ Skills：analyze-requirement / generate-prd
       │     └─ 产出：需求分析文档 / PRD.md
       │
       ├─► web-designer（UI/UX 设计师）
       │     ├─ Skills：design-spec / design-page
       │     └─ 产出：DESIGN_SPEC.md / 页面设计方案
       │
       ├─► web-architect（架构师 + 问题中转）
       │     ├─ Skills：design-architecture / tech-select / code-review
       │     └─ 产出：ARCHITECTURE.md / 代码审查报告 / 问题分配
       │
       ├─► web-developer（全栈开发）
       │     ├─ Skills：scaffold-project / implement-api / build-page / build-verify / fix-issues
       │     └─ 产出：web/ 骨架 / API Routes / 页面 .tsx / 修复代码
       │
       ├─► web-tester（功能测试员）
       │     ├─ Skills：api-verify / full-review / enforce-standard
       │     └─ 产出：接口验证 / 功能测试报告 / Bug 清单
       │
       └─► web-ui-reviewer（UI 审核专家）
             ├─ Skills：web-ui-review
             └─ 产出：原型图对比报告 / 视觉差异清单
```

## Agent → Skill 明细对应表

### web-pm
| Skill 文件 | 触发时机 | 产出 |
|-----------|---------|------|
| `web-analyze-requirement` | 收到新需求时 | 需求分析文档（用户画像、痛点、优先级） |
| `web-generate-prd` | 需求分析完成后 | `web/PRD.md`（P0/P1/P2 功能表） |

### web-designer
| Skill 文件 | 触发时机 | 产出 |
|-----------|---------|------|
| `web-design-spec` | PRD 确认后（项目级别） | `web/DESIGN_SPEC.md`（全局视觉系统） |
| `web-design-page` | 设计规范完成后（每页） | 页面详细设计方案 |

### web-architect
| Skill 文件 | 触发时机 | 产出 |
|-----------|---------|------|
| `web-design-architecture` | designer 设计方案完成后 | `web/ARCHITECTURE.md` |
| `web-tech-select` | developer 请求引入新 npm 包时 | 通过 or 拒绝 |
| `web-code-review` | developer 提交后 + 最终交付前 | 代码审查报告 |

### web-developer
| Skill 文件 | 触发时机 | 产出 |
|-----------|---------|------|
| `web-scaffold-project` | ARCHITECTURE.md 确认后 | `web/` Next.js 骨架 |
| `web-implement-api` | 骨架搭建完成后 | `web/app/api/` 所有接口 |
| `web-build-page` | 逐页开发阶段 | 页面 `.tsx` 文件 |
| `web-build-verify` | 每次写完代码后自测 | 编译结果 |
| `web-fix-issues` | architect 分配修复任务时 | 修复后的代码 |

### web-tester
| Skill 文件 | 触发时机 | 产出 |
|-----------|---------|------|
| `web-api-verify` | 骨架完成后接口冒烟 | 接口验证结果 |
| `web-full-review` | architect 代码审查通过后 | 功能测试报告（Bug 清单） |
| `web-enforce-standard` | 某页第 3 次提交时 | 强制通过报告 |

### web-ui-reviewer
| Skill 文件 | 触发时机 | 产出 |
|-----------|---------|------|
| `web-ui-review` | tester 功能测试通过后 | 原型图对比报告（差异清单） |

### Skill 复用关系

| Skill | 主要使用者 | 说明 |
|-------|----------|------|
| `web-build-verify` | web-developer | developer 自测编译 |
| `web-design-page` | web-designer | ui-reviewer 审核时参照设计方案 |

### asset-generator
| Skill 文件 | 触发时机 | 产出 |
|-----------|---------|------|
| `asset-batch` | 接到生成任务，串联其余三个 Skill | 全部资产生成完成报告 |
| `asset-polish` | 对每个资产润色提示词 | 精炼中文图像提示词 |
| `asset-generate-image` | 调用 banana API 生成图片 | 图片 URL |
| `asset-save` | 下载图片存本地，更新记录 | `novels/{name}/assets/` 图片文件 + manifest.json |

### outlineScript-a3
| Skill 文件 | 触发时机 | 产出 |
|-----------|---------|------|
| `script-write` | 对每集大纲生成剧本 | `novels/{name}/scripts/episode-{N}.txt` |

## 任务类型判断

主助手收到 Web 相关任务时，先判断类型再选择对应流程：

| 任务类型 | 判断依据 | 走哪个流程 |
|---------|---------|-----------|
| 新功能 / 功能变更 | 新增页面、新增组件、修改交互逻辑、添加 API | 完整流程（5 Phase） |
| Bug 修复 | 用户报告报错、功能异常、数据不对 | Bug 修复流程（3 步） |
| 例外 | 用户说"直接改"、agent/文档文件修改 | 主助手直接处理 |

**核心规则：主助手是调度者，不是执行者。主助手禁止直接编辑 `web/` 下的代码文件。**

---

## Bug 修复流程

用户报告 Web 界面 bug 时走此简化流程（跳过 PM/设计阶段）：

```
① 主助手调用 web-architect → 分析定位 bug 根因，输出修复方案
② 主助手调用 web-developer → 按方案修复 + 编译自测（/web-fix-issues + /web-build-verify）
③ 主助手调用 web-architect → 代码审查修复结果
④ 主助手向用户汇报修复结果
```

---

## 完整开发工作流（新功能 / 功能变更）

新建项目或功能变更走此流程。

```
── Phase 1: 需求确认（用户参与）──
主助手 → 调用 web-pm
web-pm: /web-analyze-requirement → 需求分析
web-pm: /web-generate-prd → 输出/更新 PRD.md
  ↓ 主助手向用户汇报 → 用户确认需求

── Phase 2: UI 设计（用户参与）──
主助手 → 调用 web-designer（传入 PRD 产出）
web-designer: /web-design-spec → 输出/更新 DESIGN_SPEC.md
web-designer: /web-design-page → 受影响页面设计方案
  ↓ 主助手向用户汇报 → 用户确认设计

── Phase 3: 开发实施（自动）──
主助手 → 调用 web-architect（传入需求 + 设计文档）
web-architect: 评估技术影响 → 更新 ARCHITECTURE.md（如需）
主助手 → 调用 web-developer（传入设计 + 架构文档）
web-developer: 按文档实施 + /web-build-verify 编译自测
  ↓

── Phase 4: 质量审核（自动，主助手逐步调用）──
──────────── 逐页审核链 ────────────
① web-developer: /web-build-page + /web-build-verify
  ↓
② web-architect: /web-code-review → 代码质量审查
  ↓ FAIL → web-developer 修复 → 回到 ②
  ↓ PASS
③ web-tester: /web-full-review → 功能测试
  ↓ Bug → web-developer 修复 → 回到 ②
  ↓ PASS
④ web-ui-reviewer: /web-ui-review → 视觉对比
  ↓ 差异 → web-developer 修复 → 回到 ①
  ↓ PASS → 下一页
──────────── 循环结束 ────────────
  ↓

── Phase 5: 交付（用户参与）──
主助手向用户汇报最终交付
```

### 角色分工

| 角色 | 职责 |
|------|------|
| **主助手** | 顶层调度，逐步调用各 agent，在关键节点向用户汇报 |
| **web-pm** | 需求分析，输出/更新 PRD.md |
| **web-designer** | 输出/更新设计方案 |
| **web-architect** | 评估技术影响、代码审查、问题中转 |
| **web-developer** | 按文档实施代码、修复 Bug |
| **web-tester** | 功能测试，Bug 报告 |
| **web-ui-reviewer** | 视觉对比审核 |
