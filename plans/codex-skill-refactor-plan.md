# Codex Skill 重构与迁移计划书

日期：2026-04-28

执行状态（2026-04-28）：

| 项 | 当前状态 |
| --- | --- |
| 第一批产品旅程 + review/fix 最小闭环 | 已迁移到 `.agents/skills/` 与 `.codex/agents/` |
| Codex hooks | 已接入日志型冒烟配置，不作为唯一门禁 |
| 旧 Codex `web-*` Skill | `.agents/skills/web-*` 已删除 |
| 旧 Codex `web-*` Agent | `.codex/agents/web-*.toml` 已删除 |
| Claude Code 兼容层 | `.claude/skills/web-*` 与 `.claude/agents/web-*.md` 保留 |

本文是迁移计划书，也保留部分执行前分析。凡涉及旧 `web-*` 的后续判断，以 `AGENTS.md` 和 `plans/codex-skill-refactor-inventory.md` 的当前状态为准。

参考源：`/Users/baodongdong/Desktop/study/agent_write_novels/.claude`

## 0. 结论先行

这次不再只迁移“产品旅程 5 件套”。你给的参考 `.claude` 已经是一套更完整的协作系统，包含：

- 产品旅程：`product-spec-builder`、`design-brief-builder`、`design-maker`、`dev-planner`、`dev-builder`
- 质量闭环：`code-review`、`bug-fixer`、`code-reviewer`、`implementer`
- 交付闭环：`release-builder`
- 反馈进化：`feedback-writer`、`evolution-engine`、`feedback-observer`、`evolution-runner`
- Hook 契约：feedback 检测、进化提醒、review 标脏、stop gate、commit 前检查、commit 后 push

因此，Codex 侧正确路线是：

1. `.claude/` 保持不动，当前仓库自己的 `.claude/` 继续服务 Claude Code。
2. 以 `agent_write_novels/.claude` 为参考源，迁移到 Codex 官方路径：
   - `AGENTS.md`
   - `.agents/skills/`
   - `.codex/agents/`
   - `.codex/config.toml`、`.codex/hooks.json`、`.codex/hooks/` 用于 Codex hooks 启用与脚本；`.codex/scripts/` 仅保留给手动辅助脚本。
   - 第一轮可以开启最小日志型 Codex hooks 做事件冒烟验证；通过验证前不把 hooks 当作唯一闭环门禁。
3. 从“先迁 5 件套、以后再补 review 栈”改为“三条线成套迁移”：
   - 第一批迁移产品旅程 + review/fix 最小闭环。
   - 第二批迁移 feedback/evolution 治理闭环。
   - 第三批迁移 release。
   - 第四批处理旧 Codex `web-*` 可执行入口；本项已提前执行为“删除 Codex 侧旧入口，保留 `.claude/` 兼容层”。
4. 旧 Codex `web-*` Skill / Agent 不再保留在 `.agents/skills/` 和 `.codex/agents/`。后续如需查旧实现，只能从 `.claude/` 兼容目录或 legacy 文档读取，不能再作为 Codex 默认路线调用。
5. Hook 语义必须重写为 Codex hooks + Codex 控制器守则。Claude hook 脚本可以参考，但不能把 `.claude/settings.json` 原样搬成 Codex 配置；必须按官方 `.codex/config.toml` + `.codex/hooks.json` 形态重写，并先做事件覆盖验证。

一句话：参考项目提供的是“完整协作操作系统”，Codex 侧要迁移的是架构与契约，不是机械复制目录。

## 0.1 执行前硬修正

下面这些是执行计划前必须先吸收的修正点，避免“文档看起来对，执行时踩空”。

### 修正 1：Codex hooks 可以开启，但要先验证覆盖

当前结论不是“Codex 没有 hooks”，而是：

- Codex hooks 是真实能力，但需要当前运行环境启用 `[features].codex_hooks = true`。
- 官方当前文档已列出 `SessionStart`、`UserPromptSubmit`、`Stop`、`PreToolUse`、`PostToolUse` 等事件，并说明 `PreToolUse` / `PostToolUse` matcher 可覆盖 `Bash`、`apply_patch`、`Edit|Write`、MCP 工具名等。
- 但 hooks 仍属于运行时配置能力：是否启用、当前 App/CLI/IDE 版本是否加载、repo-local 脚本路径是否稳定，都必须实测。
- 本项目可以在 Phase 0.5 创建 `.codex/config.toml` 和最小 `.codex/hooks.json`，先只记录事件，不改变行为。
- 事件冒烟通过后，才把 review 标脏、commit 前检查、Stop gate、feedback 检测逐步接入 hooks。
- 即使 hooks 接入成功，`AGENTS.md` 主控规则仍保留为兜底；hooks 是强辅助，不是唯一闭环依据。

因此，第一轮可以启用 hooks，但所有 gate 仍必须能在“hooks 未触发 / 未加载 / 被工具路径绕过”时成立：靠 `AGENTS.md` 主控规则、显式脚本、状态文件和人工可见验证兜底。

### 修正 2：新增 Skill / Agent 后可能需要重启会话

Codex 官方说明 Skill 变更通常会自动检测；如果更新没出现，需要重启 Codex。`AGENTS.md` 指令链则是在每次 run / TUI session 开始时构建，当前会话不能假设会自动重读。`.codex/agents/` custom agent 的可见性也要以当前运行时实际发现为准。

因此执行迁移后，不能把“同一条正在运行的会话立刻看到新 Skill / Agent”作为硬前提。

验收分两层：

1. 文件层验收：目录、frontmatter、依赖、残留扫描全部通过。
2. 运行层验收：重启 Codex 或新开会话后，确认新 Skill / Agent 出现在可用能力里。

第一轮迁移不要把“刚写完文件就马上派新 Agent 成功”作为唯一验收标准。

### 修正 3：`via_agent` 不能和 Codex 派发权限冲突

Codex 的实际 sub-agent 派发受当前运行环境、工具策略和用户授权影响。官方当前文档明确：Codex 只会在用户显式要求时 spawn subagent。本计划里的 `via_agent(code-reviewer)` 应理解为“该模块设计上适合隔离执行与结构化回报”，不是“主控可在任何自然语言意图下自动派发”。

执行规则：

- 用户明确说“用 Agent / 派 code-reviewer / 多 Agent 并行 / 按这个计划执行完整 Agent 闭环”时，才可按计划派发。
- 普通自然语言如“审一下代码”只能进入 review gate；若需要隔离审查，主控应说明需要 `code-reviewer` 授权，或在已授权的开发闭环中执行。
- 如果当前会话不允许派发 sub-agent，主控必须明确报告“无法派发对应 Agent”，不要静默降级成 direct。
- 如果临时由主控按同一 Skill 审查，必须在结果里标明“未经过 code-reviewer 隔离 Agent”，不能宣称 via_agent 闭环已完成。
- 路由冒烟测试里凡是期望 spawn Agent 的样例，prompt 必须显式包含“用/派 Agent”。

### 修正 4：`skill-builder` 模板必须先校准

当前 `.agents/skills/skill-builder/templates/skill-template.md` 仍带有业务运行时字段，例如 `metaData`、`output_tag`、XML 输出合约；`.agents/skills/skill-builder/templates/agent-template.md` 也是面向根目录 `/agents/` 业务 Agent 的 Markdown 模板，不是 Codex `.toml` Agent 模板。

Phase 1 迁移前必须处理：

- 用参考源的 Codex/Claude 通用 `skill-template.md` 校准当前 Skill 模板。
- Codex 官方触发只依赖 `name + description`；`version + depends_on` 可以作为本项目自检约定保留，但不能假设 Codex 运行时会读取或强制执行。
- 模板 frontmatter 禁止继续保留 `metaData`、`output_tag`、XML 输出合约等业务运行时字段。
- 新增或替换 Codex Agent 模板，例如 `templates/codex-agent-template.toml`。
- 旧的业务运行时 Agent 模板如需保留，必须明确标注“仅供根目录 `/agents/` 业务运行时使用，不用于 `.codex/agents/`”。

否则后续用 `skill-builder` 生成的新 Skill / Agent 会混入业务 runtime 约定，污染 Codex 协作框架。

### 修正 5：当前 git 基线不干净

当前目录是 git worktree，但 `git status --short` 显示大量文件处于 untracked 状态。只创建分支并不能保护未跟踪文件的历史。

执行迁移前必须二选一：

1. 用户确认后创建一次基线提交。
2. 或者先复制关键目录作为本地备份清单，再执行迁移。

不能在“全仓 untracked”状态下做大规模复制、覆盖或归档。

### 修正 6：残留扫描要分范围

计划里的 Codex 化残留扫描只适用于“新迁移的 Codex 运行文件”。当前已有 legacy 文件、计划文档、双栈说明、参考路径说明会合法出现 `.claude/`、`tools:` 等字样。

执行时要分三类扫描：

1. 新迁移运行文件：严格 0 容忍。
2. legacy `web-*` 和历史模板：Codex 侧可执行入口已删除；`.claude/` 兼容目录与历史文档只记录，不参与 Codex 运行扫描。
3. 计划文档 / 双栈说明：允许出现参考路径，但不能写成 Codex 运行路径。

### 修正 7：旧 `web-*` 不能只靠 `AGENTS.md` 降级

Codex 会扫描 `.agents/skills/` 下可发现的 Skill。即使 `AGENTS.md` 不再把 `web-*` 放进默认路由，只要这些 Skill 仍可被隐式触发，就可能继续干扰新体系。

因此旧 Codex `web-*` 退出必须二选一或组合执行：

1. 冻结阶段：为每个旧 `web-*` 增加 `agents/openai.yaml`，设置 `policy.allow_implicit_invocation: false`，只作为临时过渡。
2. 退出阶段：删除 `.agents/skills/web-*` 与 `.codex/agents/web-*.toml`，从文件系统层面移出 Codex 可发现范围。
3. 若选择归档到 `_deprecated` 而不是删除，必须实测 Codex 是否仍递归扫描其中的 `SKILL.md`；不能只靠目录名推断“不会触发”。

本仓库当前已采用第 2 种：Codex 侧旧 `web-*` 可执行入口已删除。`.claude/` 目录保留是 Claude Code 兼容，不属于 Codex 可执行入口。

### 修正 8：`AGENTS.md` 不能等到 Phase 2 才生效

Codex 在 run / session 开始时读取 `AGENTS.md`，且项目指令默认有大小限制。`AGENTS.md` 应只放控制器规则、注册表、路由和硬护栏，不承载完整 Skill 正文。

执行顺序必须调整为：

1. Phase 1 创建或校准一批真实存在的 Skill / Agent 文件。
2. 同一批立即更新 `AGENTS.md` 的最小可用注册表，只注册已经存在的文件。
3. Phase 2 只做控制器补强、legacy 降级、路由细化和文档瘦身，不再作为“第一次接入 AGENTS.md”的阶段。

否则 Phase 1 文件虽然写好了，但 Codex 主控仍会按旧 Web pipeline 路由。

### 修正 9：状态文件和 feedback 的持久化策略要先定

`.codex/state/needs-review` 是运行时临时状态，不应作为长期项目知识提交。建议：

- 新增根级 `.gitignore` 或项目约定，忽略 `.codex/state/`。
- 忽略 `.codex/hooks/logs/`，hook 冒烟日志只作本机验证证据。
- 如需保留空目录，用 `.codex/state/.gitkeep`，但不要提交 `needs-review` 的实时值。

`.codex/feedback/` 是项目经验池，是否入库需要用户确认：

- 若提交到仓库，必须先做隐私/敏感信息审查。
- 若仅作本机状态，应加入忽略规则，并在 `docs/codex-skill-system.md` 说明。

第一轮不能在未定策略时自动提交 feedback 或 state 文件。

### 修正 10：Claude `dev-builder` 的自动行为必须降级

参考源里存在适合 Claude Code hook 环境的行为，例如：

- “完成标准 = Git 已 commit + push”
- “push 跟随 commit”
- 启动 dev server 前自动 `kill -9` 端口进程
- 系统工具由 Agent 自主安装

迁到 Codex 时必须改写：

- commit 不是默认完成标准，只在用户要求提交时执行。
- push / deploy / publish 必须用户明确授权。
- 不做隐式 `kill -9`；先检查端口，占用时说明并换端口或请求确认。
- 全局安装、系统工具安装、新生产依赖引入必须先说明影响并获得确认。

### 修正 11：当前 `.claude` 状态描述必须按实际校正

当前仓库自己的 `.claude/skills/` 实际只有旧 `web-*` 与 `skill-builder`，没有产品旅程 5 件套。产品旅程 5 件套来自参考仓库：

```text
/Users/baodongdong/Desktop/study/agent_write_novels/.claude/skills/
```

执行迁移时必须以实际文件清单为准：

- 当前仓库 `.claude/`：保留，不作为新体系来源。
- 参考仓库 `agent_write_novels/.claude`：作为迁移蓝本。
- 不能在报告里写成“当前仓库已有产品旅程 5 件套”。

### 修正 12：repo-local `.codex/` 生效依赖项目 trust

Codex repo-local `.codex/config.toml`、`.codex/hooks.json`、`.codex/rules/` 等项目层配置只有在项目 `.codex/` layer 被信任时才会加载。执行 Phase 0.5 前必须验证当前项目是 trusted 状态。

验证要求：

- 新开会话或重启后确认 `.codex/config.toml` 被加载。
- 若 hooks 没有日志，先排查 project trust，再排查 hook 脚本。
- 不能只因为文件存在就宣称 repo-local hooks / rules 已生效。

### 修正 13：hook matcher 只匹配工具名，命令细分在脚本里做

Codex hooks 的 `matcher` 匹配的是工具名或工具别名，例如 `Bash`、`apply_patch`、`Edit`、`Write`、MCP 工具名。它不负责匹配 `git commit*`、`git push*`、`pnpm dev*` 这类 shell 命令细节。

因此执行时：

- `.codex/hooks.json` 里只按工具名匹配，如 `Bash|apply_patch|Edit|Write`。
- `git commit`、`git push`、`npm publish`、`pnpm dev` 等判断必须在 hook 脚本中读取 stdin JSON 的 `tool_input.command` 后解析。
- 不使用 Claude Code 的 `if: Bash(git commit*)` 语义。

### 修正 14：Stop hook 日志脚本必须输出合法 JSON

Codex `Stop` hook 在 exit 0 时要求 stdout 是 JSON。最小日志脚本不能只把 stdin 写入日志后静默退出。

日志型 hook 脚本要求：

- 所有事件都把 stdin 追加到 `.codex/hooks/logs/events.jsonl`。
- stdout 输出最小 JSON，例如 `{}`。
- 后续 gate 型 `Stop` hook 才输出 `{"decision":"block","reason":"..."}`。

### 修正 15：Bash / unified exec 拦截覆盖必须单独验收

官方当前说明 shell 拦截并非覆盖所有 shell 调用，尤其 unified exec 场景仍可能存在拦截不完整。Phase 0.5 不能只验证“有一个 Bash 日志”，还要验证本项目实际使用的命令路径。

验收时至少区分：

- 普通 shell 命令是否触发 `PreToolUse` / `PostToolUse`。
- 当前 Codex 桌面 App 使用的 exec 路径是否被识别为 `Bash`。
- `apply_patch` 是否以 `apply_patch` / `Edit` / `Write` matcher 命中。
- MCP 写入类工具是否以 MCP 工具名命中。

未覆盖的路径一律不能只靠 hooks 做 gate。

### 修正 16：legacy Skill 会挤占 Codex 初始 Skill 列表预算

执行前 `.agents/skills/` 下旧 `web-*` 很多。Codex 初始上下文里的 Skill 列表有预算限制；旧 Skill 即使从 `AGENTS.md` 默认路由降级，也可能继续占用可发现列表空间，影响新 Skill 被看到。

执行策略与当前状态：

- 第一批后必须验证新 Skill 是否出现在可用 Skill 列表。
- `agents/openai.yaml` 的 `allow_implicit_invocation: false` 主要防隐式触发，不应假设它一定减少列表预算。
- 本仓库已删除 `.agents/skills/web-*`，因此旧 Codex Web Skill 不再占用 Codex repo Skill 列表预算。
- 仍需新开 Codex 会话做运行层发现验证，因为当前会话可能缓存旧注册表。

## 1. 范围边界

### 本次要动的范围

- `plans/codex-skill-refactor-plan.md`
- 后续执行时会动：
  - `AGENTS.md`
  - `.agents/skills/`
  - `.codex/agents/`
  - `.codex/config.toml`、`.codex/hooks.json`、`.codex/hooks/`
  - 可选：`.codex/scripts/`、根级 `.gitignore`、`docs/codex-skill-system.md`

### 本次不动的范围

- 当前仓库 `.claude/`
- 参考仓库 `/Users/baodongdong/Desktop/study/agent_write_novels/.claude`
- `novels/`
- 根目录 `/agents/`、`/skills/` 的业务链文件
- Web 应用代码，除非后续用户明确进入开发任务

### 双栈原则

当前项目同时兼容 Claude Code 与 Codex：

- Claude Code 使用 `.claude/CLAUDE.md`、`.claude/agents/`、`.claude/skills/`、`.claude/settings.json`
- Codex 使用 `AGENTS.md`、`.agents/skills/`、`.codex/agents/`

禁止为了“迁移到 Codex”删除 `.claude/`。参考 `.claude` 的内容只能作为迁移蓝本，不能直接替代 Codex 运行路径。

## 2. 参考源盘点

### 参考 `.claude` 的完整模块

| 类型 | 名称 | 参考路径 | Codex 处理 |
| --- | --- | --- | --- |
| 控制器 | `CLAUDE.md` | `.claude/CLAUDE.md` | 提炼为 `AGENTS.md` 控制器规则 |
| 说明 | `EVOLUTION.md` | `.claude/EVOLUTION.md` | 提炼为 feedback/evolution 设计说明 |
| Agent | `code-reviewer` | `.claude/agents/code-reviewer.md` | 改写为 `.codex/agents/code-reviewer.toml` |
| Agent | `implementer` | `.claude/agents/implementer.md` | 改写为 `.codex/agents/implementer.toml` |
| Agent | `feedback-observer` | `.claude/agents/feedback-observer.md` | 改写为 `.codex/agents/feedback-observer.toml` |
| Agent | `evolution-runner` | `.claude/agents/evolution-runner.md` | 改写为 `.codex/agents/evolution-runner.toml` |
| Skill | `product-spec-builder` | `.claude/skills/product-spec-builder/` | 迁移到 `.agents/skills/` |
| Skill | `design-brief-builder` | `.claude/skills/design-brief-builder/` | 迁移到 `.agents/skills/` |
| Skill | `design-maker` | `.claude/skills/design-maker/` | 迁移到 `.agents/skills/`，适配 Pencil MCP |
| Skill | `dev-planner` | `.claude/skills/dev-planner/` | 迁移到 `.agents/skills/` |
| Skill | `dev-builder` | `.claude/skills/dev-builder/` | 迁移到 `.agents/skills/`，绑定 review gate |
| Skill | `code-review` | `.claude/skills/code-review/` | 迁移到 `.agents/skills/` |
| Skill | `bug-fixer` | `.claude/skills/bug-fixer/` | 迁移到 `.agents/skills/` |
| Skill | `release-builder` | `.claude/skills/release-builder/` | 迁移到 `.agents/skills/` |
| Skill | `feedback-writer` | `.claude/skills/feedback-writer/` | 迁移到 `.agents/skills/` |
| Skill | `evolution-engine` | `.claude/skills/evolution-engine/` | 迁移到 `.agents/skills/` |
| Skill | `skill-builder` | `.claude/skills/skill-builder/` | 与当前 `.agents/skills/skill-builder` 合并校准 |
| Feedback | `feedback/` | `.claude/feedback/` | Codex 侧建议使用 `.codex/feedback/` |
| Hook 脚本 | `hooks/*.sh` | `.claude/hooks/` | 改写为 `.codex/hooks/` 下的 Codex hook 脚本；先做日志验证，再接 gate |
| Hook 配置 | `settings.json` | `.claude/settings.json` | 只参考契约，不直接复制；Codex 使用 `.codex/config.toml` + `.codex/hooks.json` |

### 当前仓库 Codex 侧状态

| 类型 | 路径 | 状态 |
| --- | --- | --- |
| 主控制规则 | `AGENTS.md` | 已切到新 Codex 默认路线 |
| Skill | `.agents/skills/skill-builder/SKILL.md` | 已存在 |
| 旧 Web Skill | `.agents/skills/web-*` | 已删除 |
| 旧 Web Agent | `.codex/agents/web-*.toml` | 已删除 |
| 新产品旅程 Skill | `.agents/skills/product-spec-builder` 等 | 已存在第一批 |
| 通用闭环 Skill | `code-review`、`bug-fixer` | 已存在第一批 |
| 通用 Sub-Agent | `code-reviewer`、`implementer` | 已存在第一批 |
| Claude Code 兼容层 | `.claude/skills/web-*`、`.claude/agents/web-*.md` | 保留，不归入 Codex 默认路线 |

### 关键漂移

1. 当前计划原先把 `code-review`、`bug-fixer`、`release-builder`、`feedback-writer`、`evolution-engine` 当“缺失模块”，但参考 `.claude` 里它们已经存在。
2. 当前仓库 `.claude` 实际只有旧 `web-*` 与 `skill-builder`，没有产品旅程 5 件套；产品旅程 5 件套与完整治理闭环来自参考仓库 `agent_write_novels/.claude`。
3. Codex 侧 `.agents/skills/` 已有第一批新体系，但 feedback/evolution/release 仍未迁移。
4. Codex 侧 `.codex/agents/` 已只保留通用 Agent：`code-reviewer`、`implementer`。
5. Codex hooks 官方支持，但不能按 Claude Code `.claude/settings.json` 直接继承；当前只做日志型冒烟，未升级为唯一 gate。

## 3. 目标架构

### 三层结构

| 层 | Codex 位置 | 责任 |
| --- | --- | --- |
| 控制器 | `AGENTS.md` | 判断意图、阶段、路由、闭环、验证、汇报 |
| Skill | `.agents/skills/[name]/SKILL.md` | 具体流程、检查清单、产物规范 |
| Sub-Agent | `.codex/agents/[name].toml` | 隔离任务、参数校验、结构化返回 |

根目录 `/agents/` 和 `/skills/` 属于桌面应用后端业务运行时，不并入 Codex 协作框架。

### Codex 目标 Skill 注册表

| Skill | 目标路径 | call_mode | 首批状态 | 迁移策略 |
| --- | --- | --- | --- | --- |
| `product-spec-builder` | `.agents/skills/product-spec-builder/SKILL.md` | direct | 第一批 | 从参考源迁移并 Codex 化 |
| `design-brief-builder` | `.agents/skills/design-brief-builder/SKILL.md` | direct | 第一批 | 从参考源迁移并 Codex 化 |
| `design-maker` | `.agents/skills/design-maker/SKILL.md` | direct | 第一批 | 适配 Pencil MCP；Figma 只作为可选 |
| `dev-planner` | `.agents/skills/dev-planner/SKILL.md` | direct | 第一批 | 从参考源迁移并 Codex 化 |
| `dev-builder` | `.agents/skills/dev-builder/SKILL.md` | direct + via_agent(implementer) | 第一批 | 和 review/fix gate 同批迁移 |
| `code-review` | `.agents/skills/code-review/SKILL.md` | via_agent(code-reviewer) | 第一批 | 从参考源迁移，移除 Claude 失败话术 |
| `bug-fixer` | `.agents/skills/bug-fixer/SKILL.md` | direct | 第一批 | 从参考源迁移，保留四阶段调试 |
| `skill-builder` | `.agents/skills/skill-builder/SKILL.md` | direct | 第一批校准 | 与参考源模板/规则合并 |
| `feedback-writer` | `.agents/skills/feedback-writer/SKILL.md` | via_agent(feedback-observer) | 第二批 | 默认写 `.codex/feedback/` |
| `evolution-engine` | `.agents/skills/evolution-engine/SKILL.md` | via_agent(evolution-runner) | 第二批 | 读取 `.codex/feedback/` 与 `.agents/skills/` |
| `release-builder` | `.agents/skills/release-builder/SKILL.md` | direct | 第三批 | 发布前隐私审计和冒烟测试 |
| `web-*` | `.agents/skills/web-*` | legacy | 已删除 | 已被新路线取代；历史参考在 `.claude/` 和 legacy 文档 |

硬规则：注册表里出现的 Skill，文件必须存在；文件不存在就不能注册。

说明：

- `call_mode` 是设计意图，不等于 Codex 自动执行权限。
- `via_agent(X)` 只有在用户显式授权 subagent / Agent 派发时才执行；否则进入对应 gate，但不能宣称完成了隔离 Agent 闭环。
- `depends_on` 是本项目自检字段，不是 Codex 官方自动依赖解析机制；必须用静态脚本或人工检查验证闭合。

### Codex 目标 Sub-Agent 注册表

| Agent | 目标路径 | 绑定 Skill | 首批状态 | 迁移策略 |
| --- | --- | --- | --- | --- |
| `code-reviewer` | `.codex/agents/code-reviewer.toml` | `code-review` | 第一批 | 从 `.claude/agents/code-reviewer.md` 改写 |
| `implementer` | `.codex/agents/implementer.toml` | `dev-builder` | 第一批 | 从 `.claude/agents/implementer.md` 改写 |
| `feedback-observer` | `.codex/agents/feedback-observer.toml` | `feedback-writer` | 第二批 | 从 `.claude/agents/feedback-observer.md` 改写 |
| `evolution-runner` | `.codex/agents/evolution-runner.toml` | `evolution-engine` | 第二批 | 从 `.claude/agents/evolution-runner.md` 改写 |
| `web-*` | `.codex/agents/web-*.toml` | `web-*` | legacy | 已删除；不再作为 Codex sub-agent |

Codex `.toml` 不直接复制 Claude Agent frontmatter。迁移时只保留：

- 角色边界
- 必填参数
- 拒单条件
- 输出机器字段
- 禁止越权项
- 对应 Skill 名称

`tools`、`model: opus`、`color` 等 Claude Code 字段不作为 Codex 必要字段。Codex custom agent 的核心字段至少应包含 `name`、`description`、`developer_instructions`；可按需使用 `model`、`model_reasoning_effort`、`sandbox_mode`、`nickname_candidates`、`mcp_servers`、`skills.config` 等 Codex 支持字段。

## 4. Claude Hook 契约的 Codex 落地策略

结论：本项目可以开启 Codex hooks。参考 `.claude/settings.json` 里有 6 类 Hook，Codex 侧不再只把它们提炼成手动守则，而是按官方 Codex hooks 机制落地：先开最小日志 hook 验证事件覆盖，再逐步把稳定事件接入 gate。

官方参考：`https://developers.openai.com/codex/hooks`

补充事实：

- Codex hooks 需要显式开启 `[features].codex_hooks = true`。
- 当前官方文档列出了 `SessionStart`、`UserPromptSubmit`、`Stop`、`PreToolUse`、`PostToolUse`、`PermissionRequest` 等事件。
- 当前官方文档说明 `PreToolUse` / `PostToolUse` matcher 可覆盖 `Bash`、`apply_patch`、`Edit|Write`、MCP 工具名等。
- 即便如此，repo-local hook 脚本路径、客户端版本、App/CLI/IDE 差异和实际编辑路径仍必须在本机实测。

所以，hooks 在本计划中属于“可启用的项目能力”，但不是“未验证即可依赖的唯一闭环”。

因此，Codex 侧的落地方式分三层：

1. `.codex/config.toml` 开启 `[features].codex_hooks = true`。
2. `.codex/hooks.json` 注册事件，脚本放 `.codex/hooks/`，命令优先用 `$(git rev-parse --show-toplevel)` 定位 repo root。
3. `AGENTS.md` 保留主控兜底规则；hooks 未触发或覆盖不足时，主控仍主动执行 gate。

第一轮可以创建最小 `.codex/hooks.json`，但只做日志记录和事件冒烟，不直接阻断、不自动修改项目状态。冒烟通过后，再接入真实 gate。

| Claude Hook | 参考脚本 | 原语义 | Codex 迁移 |
| --- | --- | --- | --- |
| `UserPromptSubmit` | `detect-feedback-signal.sh` | 检测用户修正信号并注入上下文 | `AGENTS.md` 写成“处理完主请求后评估是否记录 feedback” |
| `SessionStart` | `check-evolution.sh` | 检查 feedback 池并提醒 evolution | 主控在会话开始或接到任务时主动检查 `.codex/feedback/FEEDBACK-INDEX.md` |
| `PreToolUse Bash git commit*` | `pre-commit-check.sh` | commit 前跑 TypeScript 检查 | commit 前主动跑项目类型对应验证，不限 TS |
| `PreToolUse Bash pnpm dev*` | settings 内联命令 | 自动杀端口 | 不做隐式 kill；启动前检查端口，占用时说明并换端口或询问 |
| `PostToolUse Bash git commit*` | `auto-push.sh` | commit 成功后尝试 push | Codex 默认不自动 push；仅用户明确要求时 push |
| `PostToolUse Edit|Write` | `mark-review-needed.sh` | 代码改动标记 `.needs-review` | 控制器在代码改动后设置 review_pending，建议用 `.codex/state/needs-review` |
| `Stop` | `stop-gate.sh` | review 未完成时阻止停止 | 最终回复前主动检查 review_pending，未审查则继续 review 或明确阻塞 |

### Phase 0.5：Codex hooks 启用与冒烟验证

在 Phase 1 迁移 Skill / Agent 前执行，目标是确认当前 Codex 桌面 App / CLI 在本项目能发现并触发 hooks。

验证步骤：

1. 创建 `.codex/config.toml`，写入：

   ```toml
   [features]
   codex_hooks = true
   ```

2. 创建 `.codex/hooks.json`，只注册日志型 hook，不做阻断。
3. 创建 `.codex/hooks/log-event.sh` 或等价脚本，把 stdin JSON 追加到 `.codex/hooks/logs/events.jsonl`。
4. 确认当前项目 `.codex/` layer 是 trusted，repo-local `.codex/config.toml` 与 `.codex/hooks.json` 会被加载。
5. 重启 Codex 或新开会话。
6. 验证这些事件至少可观测：
   - `SessionStart`
   - `UserPromptSubmit`
   - `PreToolUse` / `PostToolUse` for `Bash`
   - `PreToolUse` / `PostToolUse` for `apply_patch` / `Edit|Write`
   - `Stop`
7. 单独验证 MCP 写入类工具（如后续使用 Pencil / filesystem MCP）是否进入 hook 日志。
8. 若任何主要编辑路径未触发 hook，则该路径不能只依赖 hooks 做 review gate，必须保留主控兜底。

最小 `.codex/hooks.json` 形态建议：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$(git rev-parse --show-toplevel)\"/.codex/hooks/log-event.sh",
            "timeout": 5
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$(git rev-parse --show-toplevel)\"/.codex/hooks/log-event.sh",
            "timeout": 5
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash|apply_patch|Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "\"$(git rev-parse --show-toplevel)\"/.codex/hooks/log-event.sh",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash|apply_patch|Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "\"$(git rev-parse --show-toplevel)\"/.codex/hooks/log-event.sh",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$(git rev-parse --show-toplevel)\"/.codex/hooks/log-event.sh",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

日志文件建议：

```text
.codex/hooks/logs/events.jsonl
```

该日志属于本机验证产物，默认不提交。

`log-event.sh` 的最小行为要求：

- 读取 stdin 原文并追加到 `.codex/hooks/logs/events.jsonl`。
- 即使只做日志，也要向 stdout 输出 `{}`，保证 `Stop` hook exit 0 时是合法 JSON。
- 不在日志阶段输出 `decision:block`，避免冒烟阶段改变 Codex 行为。

验收失败时回退到 `AGENTS.md` 主控守则 + `.codex/scripts/` 手动脚本。

### Phase 0.6：稳定 hook gate 接入

只有 Phase 0.5 冒烟通过后才执行。

优先接入顺序：

1. `PostToolUse apply_patch|Edit|Write`：代码文件改动后写 `.codex/state/needs-review = needs_review`。
2. `PreToolUse Bash`：脚本读取 stdin 的 `tool_input.command`，拦截明显危险命令和未经确认的 `git push` / `npm publish` / 部署命令。
3. `PreToolUse Bash`：脚本识别 `git commit*`，commit 前提示或执行项目验证。
4. `Stop`：若 `.codex/state/needs-review` 未 clean，输出 warning / stopReason，提醒继续 review。
5. `UserPromptSubmit`：检测用户纠错信号，追加 feedback 候选，不自动写入敏感内容。

明确不接入：

- 不自动 push。
- 不自动 `kill -9` 端口。
- 不自动安装全局工具或生产依赖。
- 不把 feedback 未审查内容直接提交到仓库。

### Codex review gate 建议

Codex 侧新增状态文件：

```text
.codex/state/needs-review
```

取值：

- `needs_review`：代码改动后进入 review_pending
- `clean`：`code-reviewer` 通过后写入，最终清理或保留最近状态

规则：

1. 只要本轮修改代码文件，就进入 `needs_review`。
2. Markdown、文档、配置说明类修改可不触发 review gate，但影响运行行为的配置要触发。
3. `dev-builder`、`implementer`、`bug-fixer` 完成后必须进入 review gate。
4. 如果用户已显式授权 subagent，则派 `code-reviewer`；否则主控必须说明需要授权，或执行 direct review 并标注“未经过 code-reviewer 隔离 Agent”。
5. `code-reviewer` 通过，或 direct review 明确通过且已标注非隔离审查后，才能把状态置为 `clean`。
6. 未 `clean` 前不说“开发闭环完成”。

### feedback/evolution 路径建议

不要让 Codex 写 `.claude/feedback/`，避免污染 Claude Code 侧状态。Codex 默认使用：

```text
.codex/feedback/
  FEEDBACK-INDEX.md
  templates/
  *.md
```

如果未来希望 Claude Code 与 Codex 共用 feedback 池，需要单独设计共享位置，例如：

```text
.agents/feedback/
```

该调整涉及双栈语义，执行前需另行确认。

## 5. Codex 化修正清单

迁移所有 Skill / Agent 时必须做这些替换。

| 源内容 | Codex 化处理 |
| --- | --- |
| `.claude/skills/` | `.agents/skills/` |
| `.claude/agents/` | `.codex/agents/` |
| `.claude/feedback/` | `.codex/feedback/`，除非用户另定共享池 |
| `.claude/.needs-review` | `.codex/state/needs-review` |
| `CLAUDE.md` | `AGENTS.md` |
| `TaskCreate` / `TaskUpdate` | Codex 可用的计划更新机制或主控手动 checklist |
| `WebSearch` | 涉及外部库/API/版本时使用可用联网能力核实 |
| `Pencil / Figma` 泛称 | Codex 优先 Pencil MCP；Figma 仅在实际接入后启用 |
| “请先 /xxx” 失败话术 | 改为缺失依赖说明 + 建议下一步，不依赖 slash 机制 |
| Claude Hook 自动语义 | 改为 Codex hooks + `AGENTS.md` 控制器兜底 |
| `model: opus`、`tools: [...]` | 转为 Codex Agent 的职责和边界描述 |
| `metaData`、`output_tag`、XML 输出合约 | 从 Codex Skill 模板移除；如业务 runtime 仍需，保留在根 `/skills` 体系 |
| “Git 已 commit + push” | 改为“代码已实现并验证”；commit/push 只在用户明确要求时做 |
| 自动 `kill -9` / 自动系统安装 | 改为先检查、说明影响、必要时请求用户确认 |
| `.Codex/` | 禁止出现，统一 `.codex/` |

Slash 名称可以保留为用户可读入口标签，例如 `/dev-builder`，但不能假设 Codex 原生 slash 路由会自动调用对应 Skill。

## 6. 重构路线

### Phase 0：冻结和盘点

目标：固定事实来源，避免边迁移边漂。

动作：

1. 不动当前仓库 `.claude/`。
2. 不动参考仓库 `agent_write_novels/.claude`。
3. 记录三张清单：
   - 参考源完整 Skill / Agent / Hook 清单。
   - 当前 Codex 侧 `.agents/skills` / `.codex/agents` 清单。
   - 当前 `AGENTS.md` 中旧 Web pipeline 注册表。
4. 明确 `/agents`、`/skills` 是桌面应用业务运行时，不参与 Codex Skill 注册。

验收：

- 本计划更新完成。
- 没有修改 `.claude/`。
- 没有删除任何旧 Skill。

### Phase 1：迁移最小可闭环开发系统

目标：不是只迁 5 件套，而是让“规划 -> 实现 -> review -> fix”能闭环。

Phase 1 必须包含一次最小 `AGENTS.md` 改写：在文件创建并通过静态检查后，立即把已存在的新 Skill / Agent 注册进去，并把不存在的 feedback / release 模块留到后续批次。不能等到 Phase 2 才让 Codex 控制器知道新链路。

新增或校准：

```text
.agents/skills/product-spec-builder/
.agents/skills/design-brief-builder/
.agents/skills/design-maker/
.agents/skills/dev-planner/
.agents/skills/dev-builder/
.agents/skills/code-review/
.agents/skills/bug-fixer/
.agents/skills/skill-builder/

.codex/agents/code-reviewer.toml
.codex/agents/implementer.toml
```

模板同步与校准：

```text
.agents/skills/product-spec-builder/templates/product-spec-template.md
.agents/skills/product-spec-builder/templates/changelog-template.md
.agents/skills/design-brief-builder/templates/design-brief-template.md
.agents/skills/dev-planner/templates/dev-plan-template.md
.agents/skills/skill-builder/templates/skill-template.md
.agents/skills/skill-builder/templates/codex-agent-template.toml
```

特别注意：

- `skill-builder/templates/skill-template.md` 必须去掉 `metaData`、`output_tag`、XML 输出合约等业务运行时字段。
- `skill-builder/templates/agent-template.md` 当前是根目录 `/agents/` 业务 Agent 模板，不是 Codex `.toml` Agent 模板；要么标 legacy，要么新增独立 `codex-agent-template.toml`。
- Phase 1 不修改根目录 `/agents/`、`/skills/` 的业务运行时模板。

Phase 1 完成后允许的主流程：

```text
需求收集 -> Product-Spec.md
设计方向 -> Design-Brief.md
设计稿 -> Pencil 设计交付物
开发计划 -> DEV-PLAN.md
开发实现 -> 代码改动 + review_pending
代码审查 -> passed 或进入 bug-fixer
Bug 修复 -> 再 review
```

验收：

1. 上述 Skill 和 Agent 文件都存在。
2. `depends_on` 全部指向真实存在的 `.agents/skills/`。
3. `dev-builder` 不再引用不存在的 `code-reviewer`。
4. `code-review` 在用户显式授权 Agent 派发时由 `code-reviewer` 执行；无授权时不宣称 via_agent 闭环。
5. `bug-fixer` 修复后必须回到 `code-review`。
6. `AGENTS.md` 已更新为最小 Codex 控制器，且只注册本批真实存在的文件。
7. 新文件中不出现 `.claude/skills/`、`TaskCreate`、`TaskUpdate`、`.Codex/`、`metaData`、`output_tag`。
8. 重启 Codex 或新开会话后确认新 Skill / Agent 被运行时发现。

### Phase 2：补强 `AGENTS.md` 控制器

目标：在 Phase 1 最小控制器基础上，把参考 `CLAUDE.md` 的“大东控制器”进一步迁到 Codex 语义。Phase 2 不是首次接入 `AGENTS.md`，而是补齐路由、legacy 降级、hook 替代守则和文档瘦身。

`AGENTS.md` 应包含：

1. 角色：项目协调人，负责路由、上下文补齐、闭环、汇报。
2. 全局原则：中文、用户意见优先、不假完成、不静默降级。
3. 双栈定位：`.claude/` 不动，Codex 用 `.agents` 和 `.codex`。
4. Skill 注册表：只注册真实存在文件。
5. Sub-Agent 注册表：只注册真实存在文件。
6. 路由优先级：
   - 用户显式入口
   - review / feedback / evolution 等闭环必经步骤
   - 项目阶段
   - 自然语言意图
   - 仍不明确才追问
7. 项目旅程：
   - 无 `Product-Spec.md` -> `product-spec-builder`
   - 有 Spec，无 Brief/Plan/代码 -> 按产品类型建议 Brief 或 Plan
   - 有 Spec + Brief，无 Plan -> `design-maker` 或 `dev-planner`
   - 有 Spec + Plan，无代码 -> `dev-builder`
   - 有 Spec + Plan + 代码 -> 项目开发中
8. Codex 版 Hook 守则：
   - 不声称 Claude Hook 自动生效。
   - 代码改动后由控制器主动进入 review_pending。
   - commit 前主动跑类型/构建验证。
   - feedback/evolution 在模块存在后才注册并执行。
   - push 只在用户明确要求时执行。

要降级的旧内容：

- “所有新功能必须 web-pm -> web-designer -> web-architect -> web-developer -> web-architect -> web-tester -> web-ui-reviewer”的固定链路。
- `.codex/agents/web-*` 作为唯一团队的描述。
- 旧 `web-*` 作为自然语言默认路由。

legacy 技术处理：

- 旧 Codex `web-*` 已不再保留为可显式调用入口。
- `.agents/skills/web-*` 与 `.codex/agents/web-*.toml` 已删除，优先用文件系统退出可发现范围，而不是靠 `skills.config` 或目录命名规避扫描。
- `.claude/skills/web-*` 与 `.claude/agents/web-*.md` 只服务 Claude Code 兼容；Codex 需要查旧逻辑时可读作历史资料，但不能当作可调用入口。

必须保留：

- 不直接改 `novels/`。
- Web API 读取路径：`path.join(process.cwd(), '..', 'novels')`。
- Claude/Codex 双栈互不替代。
- 删除、覆盖、批量迁移前必须确认。

### Phase 3：迁移 feedback/evolution 治理闭环

目标：让用户修正和项目经验能沉淀，不只停留在对话里。

新增：

```text
.agents/skills/feedback-writer/
.agents/skills/evolution-engine/

.codex/agents/feedback-observer.toml
.codex/agents/evolution-runner.toml

.codex/feedback/
  FEEDBACK-INDEX.md
  templates/feedback-index-template.md
  templates/feedback-topic-template.md
```

Codex 语义：

1. 用户纠正 AI 行为时，主请求先处理完。
2. 然后主控评估是否派 `feedback-observer`。
3. `feedback-observer` 调 `feedback-writer` 写入 `.codex/feedback/`。
4. 会话开始或用户明确要求时，主控可派 `evolution-runner`。
5. `evolution-runner` 只提建议，不直接改 `AGENTS.md` 或 Skill。
6. 任何规则升级、Skill 修改、新 Skill 创建，都必须用户确认。
7. feedback 是否提交到仓库必须先做隐私审查；未确认前只作为本机状态处理。

验收：

- `.codex/feedback/FEEDBACK-INDEX.md` 首次可创建。
- 重复 feedback 能更新 occurrences。
- evolution 没有达标信号时明确返回无建议。
- evolution 有建议时按条列出，等待用户确认。

### Phase 4：迁移 release-builder

目标：补齐“开发完成 -> 打包/部署/发布”的交付末端。

新增：

```text
.agents/skills/release-builder/SKILL.md
```

Codex 化重点：

1. 发布前必须确认用户目标：打包、部署、发布到 registry、上传 release 等。
2. 构建产物必须做隐私审计。
3. 不把 dev 模式跑通当成发布就绪。
4. 需要登录、证书、云平台权限时明确让用户操作。
5. 涉及部署工具、签名、公证、平台规则时先核实最新文档。
6. `git push`、生产部署、npm publish 等外部不可逆动作必须得到用户明确授权。

### Phase 5：旧 Codex `web-*` Skill / Agent 删除（已执行）

目标：减少双流程混乱，同时不破坏 Claude Code 兼容层。

已删除：

```text
.agents/skills/web-*
.codex/agents/web-*.toml
```

继续保留：

```text
.claude/skills/web-*
.claude/agents/web-*.md
docs/web-pipeline.md                 # legacy 文档，已标注
```

新旧职责替代：

| 旧模块 | 建议 |
| --- | --- |
| `web-analyze-requirement`、`web-generate-prd` | `product-spec-builder` |
| `web-design-spec`、`web-design-page` | `design-brief-builder` / `design-maker` |
| `web-task-decompose`、`web-design-architecture` | `dev-planner` |
| `web-scaffold-project`、`web-implement-api`、`web-build-page`、`web-build-verify` | `dev-builder` |
| `web-fix-issues` | `bug-fixer` |
| `web-code-review` | `code-review` / `code-reviewer` |
| `web-api-verify`、`web-full-review`、`web-ui-review` | `code-review` 的功能/UI/验证维度 |
| `web-enforce-standard` | 无默认替代；新 review gate 不做“第 3 次强制通过” |
| `web-progress-track`、`web-user-report` | 主控汇报 / DEV-PLAN Phase 状态 |
| `web-tech-select` | `dev-planner` / `dev-builder` 的依赖核实 |

验收口径：

1. `find .agents/skills -maxdepth 1 -type d -name 'web-*'` 无输出。
2. `find .codex/agents -maxdepth 1 -type f -name 'web-*.toml'` 无输出。
3. `rg 'web-[a-z-]+|web-\*' .agents .codex --glob '!.codex/hooks/logs/**'` 无匹配。
4. 新开 Codex 会话做路由冒烟；当前会话可能缓存旧注册表，不能作为最终运行层验收。

## 7. 一致性验证门禁

每轮迁移后都要跑检查。

### 文件存在性

检查对象：

- `AGENTS.md` Skill 注册表里的每个 `file`
- `AGENTS.md` Sub-Agent 注册表里的每个 `file`
- 每个 Agent 的 `skill` 是否能在 Skill 注册表找到

失败处理：

- 直接报错。
- 不继续路由。
- 不注册不存在模块。

### 依赖闭合

检查对象：

- 每个 `SKILL.md` 的 `depends_on`（本项目自检约定；Codex 官方触发不依赖该字段）

要求：

- `depends_on` 里的每一项都在 `.agents/skills/` 存在。
- 不允许依赖 `.claude/skills/`。
- 不允许依赖没有注册的 Skill。

### Codex 化残留扫描

迁移后的“新 Codex 运行文件”中应为 0 的内容：

```text
.claude/skills/
.claude/agents/
.claude/.needs-review
CLAUDE.md
TaskCreate
TaskUpdate
请先 /
.Codex/
model: opus
tools: [
metaData:
output_tag:
Git 已 commit + push
push 跟随 commit
kill -9 $(lsof
```

说明：

- `AGENTS.md` 可以出现 `.claude/` 的“双栈说明”。
- 计划文档可以出现 `.claude/` 的参考源说明。
- Codex 运行文件不能把 `.claude/skills` 当运行路径。
- legacy `web-*`、旧业务 runtime 模板、计划文档不纳入第一轮 0 容忍扫描，但要单独记录命中项。
- 对 `.codex/agents/*.toml`，`model: opus`、`tools: [` 这类 Claude Agent frontmatter 残留是 0 容忍；Codex TOML 可以使用 `model = "..."`、`sandbox_mode = "..."` 等 Codex 原生字段。
- 对 `skill-builder/templates/agent-template.md`，若保留为业务 runtime 模板，必须在文件顶部明确标注“不用于 `.codex/agents/`”。

### Hook gate 语义验证

用 6 个场景测试：

1. 用户纠正 AI：`UserPromptSubmit` 有日志；主请求完成后，应记录或明确不记录 feedback。
2. 修改代码：`PostToolUse apply_patch|Edit|Write` 有日志；进入 `.codex/state/needs-review = needs_review`。
3. review 通过：状态变为 `clean`。
4. commit 前：`PreToolUse Bash` 有日志，脚本从 `tool_input.command` 识别 `git commit*`；运行类型/构建/测试验证。
5. 用户未要求 push：`PreToolUse Bash` 有日志，脚本从 `tool_input.command` 识别 `git push*` 并提示或阻断；commit 后不自动 push。
6. 启动 dev server 前：若端口占用，不隐式 kill；换端口或请求确认。

### 新旅程冒烟测试

用 7 个模拟用户意图验证路由：

1. “我想做一个新产品” -> `product-spec-builder`
2. “我想定视觉方向” -> `design-brief-builder`
3. “帮我做设计稿” -> `design-maker`
4. “开始开发”：
   - 无 `Product-Spec.md` -> 先路由 Spec
   - 有 Spec 无 Plan -> `dev-planner`
   - 有 Plan -> `dev-builder`
5. “这个报错了” -> `bug-fixer`
6. “审一下代码” -> 进入 `code-review` gate；若未显式授权 Agent，不派发 subagent，不宣称 via_agent 闭环
7. “用 code-reviewer agent 审一下代码” -> `code-reviewer` -> `code-review`

### 删除前检查

任何删除前必须输出：

- 要删除的文件列表
- 当前引用扫描结果
- 替代模块
- 影响范围
- 等用户明确确认

## 8. 推荐执行顺序

第零批：执行前防踩空

1. 确认 git 基线策略：先做基线提交或备份，不能在全仓 untracked 状态下大规模迁移。
2. 固定参考源清单：保存 `agent_write_novels/.claude` 的 Skill / Agent / Hook 文件列表。
3. 校准 `skill-builder` 模板，先解决 `metaData`、`output_tag`、业务 Agent Markdown 模板混入 Codex 的问题。
4. 验证项目 `.codex/` layer trusted；否则 repo-local hooks / rules / config 可能不会加载。
5. 开启 Phase 0.5 Codex hooks 冒烟验证：创建 `.codex/config.toml`、最小 `.codex/hooks.json` 和日志脚本。
6. 明确 `.codex/state/` 与 `.codex/feedback/` 的提交/忽略策略。
7. 明确运行时验收需要重启 Codex 或新开会话。

第零点五批：Codex hooks 冒烟验证

1. 重启 Codex 或新开会话，让 `.codex/config.toml` 和 `.codex/hooks.json` 生效。
2. 用最小操作触发 `SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`Stop`。
3. 检查 `.codex/hooks/logs/events.jsonl` 是否记录事件，并确认 `Stop` hook stdout 是合法 JSON。
4. 单独验证当前 shell/exec 路径、`apply_patch`、MCP 写入工具是否命中预期 matcher。
5. 如果 `Bash`、`apply_patch`、`Edit|Write` 覆盖稳定，进入 Phase 0.6 接入真实 gate。
6. 如果覆盖不稳定，保留日志 hook，真实 gate 暂由 `AGENTS.md` 主控执行。

第一批：最小可闭环开发系统

1. ✅ 校准 `.agents/skills/skill-builder` 与模板，先让生成器不再产出业务 runtime 风格。
2. ✅ 从参考 `.claude/skills` 迁移产品旅程 5 件套。
3. ✅ 同批迁移 `code-review`、`bug-fixer`。
4. ✅ 创建 `.codex/agents/code-reviewer.toml`、`.codex/agents/implementer.toml`。
5. ✅ 更新 `AGENTS.md` 为最小 Codex 控制器，只注册真实存在模块。
6. ✅ 处理 legacy `web-*` 的隐式触发和 Skill 列表预算风险；最终采用删除 Codex 侧旧入口。
7. ✅ 跑文件层扫描，确认 `.agents` / `.codex` 中无旧 `web-*` 可执行入口。
8. ⏳ 重启 Codex 或新开会话，验证 Skill / Agent 发现。

第二批：feedback/evolution 治理闭环

1. 迁移 `feedback-writer`、`evolution-engine`。
2. 创建 `feedback-observer.toml`、`evolution-runner.toml`。
3. 创建 `.codex/feedback/` 模板和索引。
4. 在 `AGENTS.md` 加 feedback/evolution 路由。
5. 用用户修正信号做一次冒烟测试。

第三批：release 与交付

1. 迁移 `release-builder`。
2. 在 `AGENTS.md` 加发布路由和不可逆动作授权规则。
3. 验证构建、隐私审计、冒烟测试描述准确。

第四批：legacy Web 处理

1. ✅ 将旧 `web-*` 从默认路由移出。
2. ✅ 用户确认后删除 Codex 侧旧入口：`.agents/skills/web-*`、`.codex/agents/web-*.toml`。
3. ✅ 保留 `.claude/` Web 文件作为 Claude Code 兼容层。
4. ⏳ 新开 Codex 会话做路由冒烟，确认运行层不再暴露旧入口。

第五批：文档化

1. 新增 `docs/codex-skill-system.md`。
2. 记录 Skill 注册表、Agent 注册表、review gate、feedback/evolution 规则。
3. 记录 Claude/Codex 双栈边界。

第六批：Codex hooks gate 增强

1. 基于 Phase 0.5 / 0.6 的事件日志，确认哪些事件覆盖稳定。
2. 将已验证稳定的 gate 从“日志模式”提升为“提醒 / 阻断模式”。
3. 对高风险命令只做阻断或提示，不自动执行替代动作。
4. 每新增一个 hook gate，都要保留 `AGENTS.md` 主控兜底说明。

## 9. 风险和处理

### 风险 1：机械复制导致路径污染

处理：所有迁移文件做残留扫描。Codex 运行文件不能把 `.claude/skills`、`.claude/agents`、`.claude/.needs-review` 当运行路径。

### 风险 2：Hook 语义被误认为已经全量稳定

处理：本项目可以开启 Codex hooks，但第一步只做日志冒烟验证。`AGENTS.md` 仍写成“控制器主动守则 + hooks 辅助”，不写成“Hook 必然会做”。每个 hook gate 必须有事件日志证明覆盖当前实际工具路径。

### 风险 3：feedback 写错位置

处理：Codex 默认写 `.codex/feedback/`。是否与 Claude 共用 feedback 池，需要单独确认。

### 风险 4：`dev-builder` 没有 review gate 就宣称完成

处理：第一批就迁移 `code-review`、`bug-fixer`、`code-reviewer`、`implementer`。开发链路必须以 review clean 收口；若未获得 subagent 派发授权，只能标注为 direct review 通过，不能宣称 via_agent 闭环。

### 风险 5：旧 `web-*` 与新体系并存导致路由混乱

处理：`AGENTS.md` 只保留一个默认主流程。Codex 侧 `.agents/skills/web-*` 与 `.codex/agents/web-*.toml` 已删除，文件层不再并存；运行层仍需新开 Codex 会话验证，避免当前会话缓存旧注册表。

### 风险 6：release-builder 执行不可逆操作

处理：部署、发布、push、删除 release、npm publish、证书相关操作必须用户明确授权。

### 风险 7：当前仓库 `.claude` 与参考 `.claude` 不一致

处理：迁移时以 `agent_write_novels/.claude` 为参考源，以当前仓库 `.claude` 为保留对象。不要试图先同步两个 `.claude`。

### 风险 8：新文件写入后当前 Codex 会话不识别

处理：文件层验收和运行层验收分开。文件写完后先做静态检查；运行层必须重启 Codex 或新开会话再验证。

### 风险 9：`skill-builder` 继续生成业务 runtime 风格文件

处理：第一批开始前先校准 `skill-builder` 的 `skill-template.md` 和 Codex Agent 模板。没有校准前，不允许用它批量生成新 Skill / Agent。

### 风险 10：git 没有可回滚基线

处理：当前 worktree 大量 untracked。执行迁移前必须先做用户确认的基线提交或备份清单。

### 风险 11：`AGENTS.md` 过大或过细导致 Codex 指令失效

处理：`AGENTS.md` 只写控制器规则、注册表、路由和硬护栏；详细流程留在各 `SKILL.md` 或 `docs/codex-skill-system.md`。每次改写后检查文件大小，避免超过 Codex 项目指令预算。

### 风险 12：临时状态被提交或 feedback 泄露敏感信息

处理：`.codex/state/` 默认忽略；`.codex/feedback/` 是否入库必须先由用户确认，并做隐私审查。

### 风险 13：repo-local `.codex/` 没有被加载

处理：Phase 0.5 前验证项目 trust。若 `.codex/config.toml`、hooks、rules 不生效，不继续接入 gate；先修正信任状态或改用用户级配置。

### 风险 14：hook matcher 误写成 Claude Code 语义

处理：`.codex/hooks.json` 只匹配工具名。所有 `git commit*`、`git push*`、`pnpm dev*` 等命令细分都在 hook 脚本里解析 stdin 的 `tool_input.command`。

### 风险 15：Stop hook 或 unified exec 冒烟误判

处理：日志脚本对 `Stop` 输出 `{}`，并单独验证当前 shell/exec 路径是否触发 hook。未覆盖路径必须保留 `AGENTS.md` 主控兜底。

### 风险 16：旧 Skill 挤占新 Skill 可见性

处理：第一批后验证新 Skill 出现在可用列表。旧 `.agents/skills/web-*` 已删除，不再占用 repo Skill 列表预算；仍需新开 Codex 会话确认运行时发现结果。

## 10. 下一步建议

按当前执行状态，下一步应该做：

1. 新开 Codex 会话，做运行层 Skill / Agent 发现验证。
2. 做路由冒烟测试：需求、设计、计划、开发、审查、修 bug、显式派 Agent。
3. 若运行层仍看到旧 `web-*`，先判断是会话缓存、用户级插件缓存，还是其他目录残留。
4. 若运行层干净，再进入 feedback/evolution 第二批迁移。
5. release-builder 作为第三批单独迁移，不和 legacy Web 清理混在一起。
6. 最后整理历史文档，例如 `docs/web-pipeline.md` 是否移动到 `docs/legacy/`。

本计划的底线：

- 不动 `.claude/`。
- 不动 `novels/`。
- 不注册不存在的模块。
- 不让 `dev-builder` 假闭环。
- 可以开启 Codex hooks，但不假装未验证的 hook gate 已稳定生效。
- 不自动 push / deploy / publish。
- 不删除 `.claude/skills/web-*` 和 `.claude/agents/web-*.md`。
- 不让旧 Codex `web-*` 通过 `.agents/skills/` 或 `.codex/agents/` 继续作为可执行入口存在。
- 不在没有 git 基线的状态下大规模迁移。
- 不在未重启/未验证发现机制前宣称新 Skill / Agent 已运行可用。
- 不把 `depends_on` 当作 Codex 官方自动依赖机制。
- 不把 repo-local `.codex/` 文件存在误认为 hooks / rules / skills.config 已经生效。
