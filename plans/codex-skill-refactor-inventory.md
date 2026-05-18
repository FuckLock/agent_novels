# Codex Skill 重构迁移清单

日期：2026-04-28

## 参考源

参考仓库：

```text
/Users/baodongdong/Desktop/study/agent_write_novels/.claude
```

本仓库 `.claude/` 只作为 Claude Code 兼容目录保留，不作为本次 Codex 新体系迁移来源。

## 第一批已迁移 Skill

| Skill | 来源 | 目标 |
| --- | --- | --- |
| `product-spec-builder` | `.claude/skills/product-spec-builder/` | `.agents/skills/product-spec-builder/` |
| `design-brief-builder` | `.claude/skills/design-brief-builder/` | `.agents/skills/design-brief-builder/` |
| `design-maker` | `.claude/skills/design-maker/` | `.agents/skills/design-maker/` |
| `dev-planner` | `.claude/skills/dev-planner/` | `.agents/skills/dev-planner/` |
| `dev-builder` | `.claude/skills/dev-builder/` | `.agents/skills/dev-builder/` |
| `code-review` | `.claude/skills/code-review/` | `.agents/skills/code-review/` |
| `bug-fixer` | `.claude/skills/bug-fixer/` | `.agents/skills/bug-fixer/` |

## 第一批已创建 Agent

| Agent | 来源 | 目标 |
| --- | --- | --- |
| `code-reviewer` | `.claude/agents/code-reviewer.md` | `.codex/agents/code-reviewer.toml` |
| `implementer` | `.claude/agents/implementer.md` | `.codex/agents/implementer.toml` |

## 已校准

- `.agents/skills/skill-builder/SKILL.md`
- `.agents/skills/skill-builder/templates/skill-template.md`
- `.agents/skills/skill-builder/templates/agent-template.md`
- `.agents/skills/skill-builder/templates/codex-agent-template.toml`

## Legacy 处理

Codex 侧旧 Web pipeline 已删除：

```text
.agents/skills/web-*            # 19 个 legacy Skill 目录
.codex/agents/web-*.toml        # 7 个 legacy Agent 文件
```

删除前曾为 19 个 legacy Skill 增加 `agents/openai.yaml` 并设置：

```yaml
policy:
  allow_implicit_invocation: false
```

Claude Code 兼容目录继续保留，不随 Codex 迁移删除：

```text
.claude/skills/web-*
.claude/agents/web-*.md
```

## 废弃判断补充

迁移完成后，旧 `web-*` 不应再被视为并行可选的新路线。Codex 侧可执行入口已删除，判断规则如下：

1. 新 Codex Skill 已覆盖职责的，旧 `web-*` 标记为 deprecated，仅保留历史参考、迁移映射和 Claude Code 兼容说明。
2. 新 Codex Skill 没有一对一名称但已被流程吸收的，不再新增同名迁移项。
3. 用户明确点名 `web-*` 或要求走旧 Web pipeline 时，Codex 应说明旧 Codex 入口已删除，并指向新默认入口；如只是查历史实现细节，可读取 `.claude/` 或 legacy 文档。
4. 默认自然语言路由必须进入新路线：`product-spec-builder` → `design-brief-builder` / `design-maker` → `dev-planner` → `dev-builder` → `code-review` / `bug-fixer`。

核心结论：

- `web-code-review` 已被 `code-review` 取代；后续“审查代码”“review”“验收实现”默认进入 `code-review`，需要隔离 Agent 时才显式派发 `code-reviewer`。
- `web-generate-prd` / `web-analyze-requirement` 已被 `product-spec-builder` 取代；后续统一输出 `Product-Spec.md`，不再默认输出 `web/PRD.md`。
- `web-task-decompose` 已被 `dev-planner` 取代；后续统一输出 `DEV-PLAN.md`，不再默认输出 `web/PLAN.md`。
- `web-scaffold-project` / `web-implement-api` / `web-build-page` / `web-build-verify` 已并入 `dev-builder` 的 Phase 实现与验证纪律。
- `web-fix-issues` 已被 `bug-fixer` 取代；review gate 失败或用户报告异常时，默认进入 `bug-fixer`，修复后回到 `code-review`。

## 新旧职责对照

| 原 Legacy Skill / Agent | 新默认入口 | 处置 |
| --- | --- | --- |
| `web-analyze-requirement` | `product-spec-builder` | Codex 已删除；需求分析并入 `Product-Spec.md` 采访与迭代模式 |
| `web-generate-prd` | `product-spec-builder` | Codex 已删除；`web/PRD.md` 不再是默认产物 |
| `web-design-spec` | `design-brief-builder` + `design-maker` | Codex 已删除；视觉方向先入 `Design-Brief.md`，具体设计交付由 `design-maker` 处理 |
| `web-design-page` | `design-maker` | Codex 已删除；页面/状态/组件设计并入设计交付 |
| `web-design-architecture` | `dev-planner` | Codex 已删除；技术拆分、依赖和架构约束进入 `DEV-PLAN.md` |
| `web-tech-select` | `dev-planner` / `dev-builder` | Codex 已删除；计划阶段列依赖，开发阶段按 SDK-First 联网核实 |
| `web-task-decompose` | `dev-planner` | Codex 已删除；`DEV-PLAN.md` 取代 `web/PLAN.md` |
| `web-progress-track` | `dev-builder` / 主控汇报 | Codex 已删除；进度以 `DEV-PLAN.md` Phase 状态和验证结果汇报 |
| `web-user-report` | 主控回复 | Codex 已删除；不再单独作为默认 Skill |
| `web-scaffold-project` | `dev-builder` | Codex 已删除；初始化模式覆盖骨架搭建 |
| `web-implement-api` | `dev-builder` | Codex 已删除；API 实现作为 Phase Task 执行 |
| `web-build-page` | `dev-builder` | Codex 已删除；页面实现作为 Phase Task 执行 |
| `web-build-verify` | `dev-builder` / `code-review` | Codex 已删除；验证命令作为开发与审查证据 |
| `web-code-review` | `code-review` / `code-reviewer` | Codex 已删除；新审查覆盖 Spec、Plan、Brief、代码质量和安全扫描 |
| `web-full-review` | `code-review` | Codex 已删除；功能测试维度并入 Stage 1 审查，必要时用浏览器/Playwright 验证 |
| `web-api-verify` | `dev-builder` / `code-review` | Codex 已删除；API 冒烟作为实现验证或审查证据 |
| `web-ui-review` | `code-review` | Codex 已删除；UI 对照并入 Design-Brief / 设计 MCP 证据审查 |
| `web-fix-issues` | `bug-fixer` | Codex 已删除；问题修复进入四阶段 bug 修复流程 |
| `web-enforce-standard` | 无默认替代 | Codex 已删除；新 review gate 不做“第 3 次强制通过”，阻断问题必须修复 |
| `.codex/agents/web-main.toml` | 主控 + AGENTS.md 路由 | Codex 已删除；由主控按 AGENTS.md 路由 |
| `.codex/agents/web-pm.toml` | `product-spec-builder` | Codex 已删除；不再默认派发 |
| `.codex/agents/web-designer.toml` | `design-brief-builder` / `design-maker` | Codex 已删除；不再默认派发 |
| `.codex/agents/web-architect.toml` | `dev-planner` / `code-review` / `code-reviewer` | Codex 已删除；不再默认派发 |
| `.codex/agents/web-developer.toml` | `dev-builder` / `implementer` | Codex 已删除；不再默认派发 |
| `.codex/agents/web-tester.toml` | `code-review` / `bug-fixer` | Codex 已删除；不再默认派发 |
| `.codex/agents/web-ui-reviewer.toml` | `code-review` | Codex 已删除；不再默认派发 |

## 后续收敛建议

Codex 侧旧入口已删除。为避免破坏 Claude Code 兼容和历史引用，`.claude/` 继续保留。后续可以继续做三层收敛：

1. **路由层**：确认 `.agents/skills/web-*` 与 `.codex/agents/web-*.toml` 不再存在，确保旧 `web-*` 不被自然语言命中。
2. **文档层**：所有新文档只引用新 Skill 名称；引用旧 `web-*` 时必须注明 `legacy`。
3. **归档层**：如果后续决定整理旧文档或 `.claude/` 兼容目录，先做引用扫描、列清单、说明替代入口和影响范围，再等待用户确认。

## 测试方案

删除旧 Skill / Agent 之前，至少跑三层测试：静态扫描、路由冒烟、删除预演。

### 1. 静态扫描

确认新 Skill / Agent 存在：

```bash
find .agents/skills -maxdepth 2 -name SKILL.md | sort
find .codex/agents -maxdepth 1 -type f | sort
```

若仍处于 Phase A 冻结阶段，可确认 legacy Skill 都禁止隐式触发：

```bash
find .agents/skills -path '*/agents/openai.yaml' -print0 \
  | xargs -0 rg --files-without-match 'allow_implicit_invocation: false'
```

期望结果：无输出；若有输出，说明某个 legacy Skill 还可能被自然语言命中。

Phase B 删除后，改用以下命令确认 Codex legacy 入口不存在：

```bash
find .agents/skills -maxdepth 1 -type d -name 'web-*' | sort
find .codex/agents -maxdepth 1 -type f -name 'web-*.toml' | sort
```

期望结果：两条命令均无输出。

扫描旧引用：

```bash
rg -n 'web-[a-z-]+|web-\*' AGENTS.md plans docs .agents .codex .claude \
  --glob '!.codex/hooks/logs/**'
```

判断标准：

- `AGENTS.md` / `plans/codex-skill-refactor-inventory.md` 中出现旧名可以接受，但必须标注 legacy / deprecated。
- `.claude/` 中出现旧名可以接受，因为它服务 Claude Code 兼容。
- `.codex/agents/web-*.toml` / `.agents/skills/web-*` 不应继续存在；若扫描到，说明 Codex legacy 入口未删干净。
- 新 Codex 默认路线文档里不应把 `web-*` 写成默认入口。

### 2. 路由冒烟

新开一个 Codex 会话，用以下提示测试默认路由。不要点名 `web-*`。

| 测试提示 | 期望入口 | 不应出现 |
| --- | --- | --- |
| “我想做一个新产品，帮我整理需求” | `product-spec-builder` | `web-analyze-requirement` / `web-generate-prd` |
| “帮我确定这个产品的设计风格” | `design-brief-builder` | `web-design-spec` |
| “根据 Brief 生成设计稿” | `design-maker` | `web-design-page` |
| “根据 Spec 规划开发阶段” | `dev-planner` | `web-task-decompose` |
| “开始开发下一个 Phase” | `dev-builder` | `web-scaffold-project` / `web-build-page` |
| “审一下代码” | `code-review` | `web-code-review` |
| “这个功能报错了，修一下” | `bug-fixer` | `web-fix-issues` |
| “派一个 Agent 审查代码” | `code-reviewer` | `web-architect` |
| “派一个 Agent 实现这个 Task” | `implementer` | `web-developer` |

反向测试：

| 测试提示 | 期望行为 |
| --- | --- |
| “明确使用旧 web-code-review” | 说明旧 Codex 入口已删除，并指向 `code-review` / `code-reviewer` |
| “走旧 Web pipeline” | 说明 Codex 旧入口已删除；如需 Claude Code 兼容，可参考 `.claude/` |
| “审查代码”但没有明确 Agent | 不派 `code-reviewer`，只走 direct `code-review` 并标注未经过隔离 Agent |

### 3. Hooks 冒烟

当前 `.codex/hooks.json` 是日志型冒烟，不做强门禁。测试方式：

```bash
tail -n 20 .codex/hooks/logs/events.jsonl
```

期望看到 `UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`Stop` 等事件记录。注意：hooks 只能证明事件被记录，不能单独证明路由正确。

## 分阶段删除方案

删除必须分阶段做，不建议一把梭。

### Phase A：冻结 legacy（已完成）

历史目标：旧 `web-*` 先冻结隐式触发，待确认后退出 Codex 可执行范围。Phase B 完成后，Codex 侧旧入口已从“冻结”升级为“删除”。

已完成项：

- `.agents/skills/web-*/agents/openai.yaml` 曾设置 `allow_implicit_invocation: false`
- `AGENTS.md` 标注旧 Codex `web-*` 可执行入口已删除
- 本文件记录新旧职责对照

### Phase B：删除 Codex legacy 入口（已完成）

已删除 Codex 侧旧入口，未动 Claude Code 兼容目录：

```text
.agents/skills/web-*
.codex/agents/web-*.toml
```

删除前清单命令：

```bash
find .agents/skills -maxdepth 1 -type d -name 'web-*' | sort
find .codex/agents -maxdepth 1 -type f -name 'web-*.toml' | sort
rg -n 'web-[a-z-]+|web-\*' AGENTS.md plans docs .agents .codex \
  --glob '!.codex/hooks/logs/**'
```

删除后验证命令：

```bash
find .agents/skills -maxdepth 1 -type d -name 'web-*' | sort
find .codex/agents -maxdepth 1 -type f -name 'web-*.toml' | sort
rg -n 'web-[a-z-]+|web-\*' AGENTS.md plans docs .agents .codex \
  --glob '!.codex/hooks/logs/**'
```

期望结果：

- 前两条 `find` 无输出。
- `rg` 只剩历史说明、迁移清单、legacy 说明，不再有可执行入口引用。
- 路由冒烟测试全部通过。

### Phase C：保留 `.claude/` 兼容目录

当前规则明确：为了迁移 Codex，不删除 `.claude/`。

继续保留：

```text
.claude/skills/web-*
.claude/agents/web-*.md
.claude/CLAUDE.md
```

原因：

- 它们服务 Claude Code，不属于 Codex 默认路线。
- 删除会破坏双栈兼容承诺。
- 若未来决定放弃 Claude Code，需要单独立项，而不是混在 Codex 迁移里删。

### Phase D：整理历史文档（可选）

如果 Phase B 通过，可以再整理旧文档：

- `docs/web-pipeline.md` 标注为 legacy 文档，或移动到 `docs/legacy/`
- `plans/*讲义.md` 中涉及 `web-*` 的内容保留为教学材料，但标题或开头注明历史语境
- `AGENTS.md` 保留一句“旧 Web pipeline 已归档，见迁移清单”

这一步不影响运行，但能减少后续阅读噪音。

## 推荐执行顺序

1. 已完成冻结：旧 `web-*` 不再默认触发。
2. 已完成 Codex 侧删除：`.agents/skills/web-*` 与 `.codex/agents/web-*.toml` 已移除。
3. 删除后重新跑扫描和路由冒烟。
4. 保留 `.claude/`；只在明确放弃 Claude Code 兼容时再讨论它。
5. 最后清理或归档 `docs/web-pipeline.md` 这类历史文档。
