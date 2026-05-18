# 剧本 + Seedance Agent/Skill 外置化 + 桌面应用对接计划

> **状态：✅ 已锁定并已完成主体落地；2026-04-27 二次修订模型配置策略** | 工期 13.5-15 天（原计划） | 详见 §0.6 + 附录 F
>
> **2026-04-27 重要修订：模型来源收敛为“用户当前选择的模型”。** `stage-bindings.json` 不再作为模型解析来源；Claude Code CLI / `claude-cli` 不再作为内置模型路径。后续统一通过官方 API / OpenAI 兼容 API 的模型配置调用。

> **本计划只做 1 件事：外置 + 桌面应用对接**
>
> - **应用形态**：Electron 桌面应用（`Toonflow.app`），用户绝不接触 Claude Code/终端/命令行
> - **物理外置**：剧本和 Seedance 的全部 Agent/Skill 从 `.claude/` 迁到 `/skills/` 与 `/agents/`；`.claude/` 只剩 Web 开发用（19 个 web-* Skill + 7 个 web-* Agent + skill-builder）
> - **桌面应用对接**：新增 `skill-loader.ts` + `agent-runtime.ts` + `seedance-executor.ts`；应用本地后端读文件 → 组装 prompt → 注入 LLM；任何已配置的官方 API / OpenAI 兼容 API 模型都能跑；用户在工作台或生产面板选择模型即可决定本次调用
> - **新功能（Q1=A 决定的）**：Seedance 五阶段在桌面应用里编排，用户点按钮跑通 A→B→C1→C2→C3→D，无需切到终端
>
> **不做（v2 留作）**：5 种 mode（Q2=B）、vendor 热加载（Q5=B）、agentic loop、记忆系统、自评进化、跨模型 tool-call 兼容（v1 用 XML 输出合约绕开 tool-call 依赖）

---

## 0. 背景与目标

### 0.1 当前两套并行路径（必须收敛为一套）

```
路径 A — Claude Code 驱动（现状）：
  Claude Code 自动扫描 .claude/agents/ + .claude/skills/
  → 通过 sub-agent 派发执行业务
  → prompt 在 .claude/agents/scriptAgent-*.md 等
  
路径 B — Web UI 驱动（现状）：
  POST /api/execute
  → web/app/lib/agent/executor.ts（950 行）
  → buildSkeletonPrompt() / buildAdaptationPrompt() / ...（prompt 硬编码在 prompts.ts 482 行）
  → callModelStream() → 官方 API / OpenAI 兼容 API
```

**问题：** 同一业务（如生成骨架）prompt 写在两处，独立维护已出现漂移。

**改造目标：路径 A 退役（Claude Code 不再驱动业务），路径 B 升级为读文件模式**

```
唯一路径（Web UI 驱动 + 文件即真源）：
  POST /api/execute
  → executor.ts
  → runAgent({ agentName: 'scriptAgent-skeleton', packet: {...} })
  → agent-runtime.ts:
      - 读 /agents/scriptAgent-skeleton.md（Agent 6 节）
      - 读 /skills/script-skeleton.md（Skill 9 要素）
      - 读 /skills/art-styles/<style>/* （画风资源，按需）
      - 组装 system prompt
  → callModelStream(model, messages) → 任何 LLM
  → 解析 <skeleton>...</skeleton> XML 输出 + meta 注释
```

### 0.2 严格范围（数字已核对磁盘 2026-04-25）


| 类型                  | 数量        | 处理                                                                                                                                                                                |
| ------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 业务 Agent            | **8**     | scriptAgent-{main, skeleton, adaptation, script, supervisor} + seedance-main + director + storyboard-artist → 迁到 `/agents/`                                                       |
| 已废弃 Agent           | **1**     | art-designer.md → 删除                                                                                                                                                              |
| Seedance 现有 Skill   | **14**    | director-skill / seedance-asset / seedance-director-plan / seedance-storyboard-table / seedance-storyboard-skill / seedance-video / 4 个 asset-helper / 4 个 review → 迁到 `/skills/` |
| 剧本 Skill（新建）        | **4**     | script-skeleton / script-adaptation / script-writing / script-supervision（从 prompts.ts + .claude/agents/ + Toonflow data/skills/ 三方合并）                                            |
| 已废弃 Skill           | **3**     | art-design-skill / seedance-art-skill / seedance-image → 删除                                                                                                                       |
| Web 硬编码 prompt      | **3 文件**  | prompts.ts(482) / review-prompts.ts(190) / novels.ts(部分常量) → 迁到 Skill                                                                                                             |
| 画风资源                | **9 套**   | Toonflow `data/skills/art_skills/` 下 9 个画风全部迁入 `/skills/art-styles/`（3d-guoman 沿用 + 8 个 Toonflow 画风补全）                                                                            |
| 故事类型资源              | **12 套**  | Toonflow `data/skills/story_skills/` 下 12 个故事类型全部迁入 `/skills/story-genres/`（v1 启用，不再是空目录）                                                                                         |
| 共享制作技法              | **2 套**   | Toonflow `data/skills/production_skills/` 下 storyboard_prompt_techniques.md(322行) + storyboard_table_techniques.md(158行) → `/skills/shared/`                                      |
| Seedance 衍生资产能力     | **1 节增补** | Toonflow `production_execution_derive_assets.md` 的"衍生资产识别"逻辑融入 `/skills/seedance-asset.md`（不新建独立 Skill）                                                                           |
| `.claude/CLAUDE.md` | **1**     | 瘦身只保留 Web 开发规则                                                                                                                                                                    |


**保留 / 兼容 / 不改业务数据：**

- `.claude/skills/web-*/`（19 个）+ `.claude/skills/skill-builder/`（1 个）→ 给 Claude Code 做 Web 开发助理用
- `.claude/agents/web-*.md`（7 个）→ 同上
- `config/models/`（模型配置 JSON）→ Web 模型管理沿用
- `config/stage-bindings.json`（阶段→模型绑定）→ 旧方案兼容占位，已清空为 `{}`，不再参与模型解析
- `web/app/lib/agent/stream-model.ts`（LLM 调用层）→ 修订为 API-only，移除 Claude CLI 分支
- `web/app/lib/agent/decision.ts`（意图分类）→ 不动
- `web/app/lib/agent/executor.ts` 的业务编排逻辑（review 循环、SSE 进度、数据写入）→ 不动，只替换 `buildXxxPrompt → runAgent`，并确保当前选择 modelId 透传
- `novels/` 数据层 → 0 改动

### 0.3 最终交付物清单


| #   | 交付物                                      | 路径                                         | 状态                                                                                  |
| --- | ---------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| 1   | 业务 Skill 22 个                            | `/skills/`                                 | 新建（11 平铺 + 4 review + 3 shared + 4 asset-helpers），其中 seedance-asset.md 增补衍生资产识别规则   |
| 2a  | 画风包 9 个                                  | `/skills/art-styles/{9 个画风}/`              | 1 个沿用 + 8 个从 Toonflow 批量迁入；每个含 prefix.md + art_prompt/（7 份） + director_skills/（3 份） |
| 2b  | 故事类型包 12 个                               | `/skills/story-genres/{12 个类型}/`           | 全部从 Toonflow 批量迁入；每个含 README.md + director_skills/（2 份）                             |
| 3   | 业务 Agent 8 个                             | `/agents/`                                 | 新建（含 scriptAgent-main 决策 prompt 内嵌）                                                 |
| 4   | Skill 加载器                                | `web/app/lib/skill-loader.ts`              | 新建（约 200 行）                                                                         |
| 5   | Agent 运行时                                | `web/app/lib/agent-runtime.ts`             | 新建（约 200 行）                                                                         |
| 6   | executor.ts 改造（剧本链）                      | `web/app/lib/agent/executor.ts`            | 改造（仅替换 buildXxx → runAgent）                                                         |
| 7   | prompts.ts 清空                            | `web/app/lib/agent/prompts.ts`             | 函数体改 wrapper（一个月灰度后删除）                                                              |
| 8   | review-prompts.ts 清空                     | `web/app/lib/review-prompts.ts`            | 同上                                                                                  |
| 9a  | seedance-executor.ts（**新增，Q1 选"是"才做**）   | `web/app/lib/agent/seedance-executor.ts`   | 新建约 600 行，5 阶段编排                                                                    |
| 9b  | Seedance API 路由（**新增，Q1 选"是"才做**）        | `web/app/api/seedance/{start,status,fix}/` | 新建 3 个 API 路由                                                                       |
| 9c  | novels.ts Seedance setter（**Q1 选"是"才做**） | `web/app/lib/novels.ts`                    | 增补 5 个 saveSeedance* 函数                                                             |
| 10  | `.claude/` 瘦身                            | `.claude/`                                 | 删除业务文件 + CLAUDE.md 瘦身                                                               |
| 11  | 文档更新                                     | `docs/*.md`                                | 路径引用更新                                                                              |


### 0.4 ⚠️ 现状真相（开工前必须先看清楚）

> **修订前发现的关键事实（2026-04-25 实地审视 web/app/lib/）：**
>
> 之前的计划假设"业务逻辑 0 重构"对所有业务都成立，但实地审视 `web/app/lib/agent/executor.ts`（950 行）后发现，Web 后端实际只跑通了一部分业务，另一部分根本没实现。**这两类业务的"外置"是完全不同的工程性质 — 一个是 prompt 搬家，一个是新功能开发。**


| 业务                                                                           | Web 后端是否已实现                                         | 本计划属于            |
| ---------------------------------------------------------------------------- | --------------------------------------------------- | ---------------- |
| **剧本链 — 配置收集**                                                               | ✅ executeConfigCollection（buildExtractParamsPrompt） | A 真外置（prompt 搬家） |
| **剧本链 — 闲聊**                                                                 | ✅ executeChat（buildChatPrompt）                      | A 真外置            |
| **剧本链 — 骨架生成**                                                               | ✅ executeSkeleton（buildSkeletonPrompt）              | A 真外置            |
| **剧本链 — 改编策略**                                                               | ✅ executeAdaptation（buildAdaptationPrompt）          | A 真外置            |
| **剧本链 — 剧本编写**                                                               | ✅ executeScript（buildScriptPrompt）                  | A 真外置            |
| **剧本链 — 自动审核**                                                               | ✅ executeFixByType + buildXxxReviewPrompt           | A 真外置            |
| **剧本链 — fix 循环 2 轮限制**                                                       | ❌ 当前是无限循环（无轮数计数）                                    | C 留 v2 评估        |
| **剧本链 — 4 种 mode（full/extend/revise_episode/revise_global/rewrite_episode）** | ❌ 完全不存在；当前只有 generate_*/fix_* 4 种 action            | C 留 v2 评估        |
| **Seedance — A 导演分析**                                                        | ❌ 仅 .claude/agents 有定义；Web 端无 executor              | **B 新功能开发**      |
| **Seedance — B 资产管理**                                                        | ❌ 仅 novels.ts 有读取函数；Web 端无生成逻辑                      | **B 新功能开发**      |
| **Seedance — C1 导演规划**                                                       | ❌ 同上                                                | **B 新功能开发**      |
| **Seedance — C2 分镜表**                                                        | ❌ 同上                                                | **B 新功能开发**      |
| **Seedance — C3 分镜提示词**                                                      | ❌ 同上                                                | **B 新功能开发**      |
| **Seedance — D 视频生成**                                                        | ❌ 已有视频模型配置但 Web 编排未调用                         | **B 新功能开发**      |


### 0.5 修正后的核心承诺

**A 范围（剧本链）— 真"业务逻辑 0 重构"：**

- 6 个 prompts.ts 函数 + 4 个 review-prompts.ts 函数的硬编码 prompt → 搬到 `/skills/script-*.md` + `/agents/scriptAgent-*.md`
- executor.ts 的 `executeChat / executeSkeleton / executeAdaptation / executeScript / executeFixByType` 5 个函数体内部，把 `buildXxxPrompt(...)` + `callModelStream(...)` 两步替换为单步 `runAgent({ agentName, packet })`
- 业务编排逻辑（fix 重试、SSE 进度、数据写入）保持原样
- **承诺：相同输入产出 novels/ 文件数量、路径、Schema 完全等价**

**B 范围（Seedance 链）— 实质是新功能开发：**

- **不能套"0 重构"承诺** — Web 端本来就没有 Seedance 编排，本计划要在 Web 后端实现这个能力
- 新增 `web/app/lib/agent/seedance-executor.ts`（约 600 行，参照 Toonflow `productionAgent/index.ts` 238 行结构 + .claude/agents/seedance-main.md 5 阶段编排逻辑）
- 编排顺序：A 导演分析 → B 资产 → C1 → C2 → C3 → D 视频
- 每个阶段调用 `runAgent({ agentName: 'director' / 'seedance-main' / 'storyboard-artist', packet: {...} })`
- 新增 API 路由 `web/app/api/seedance/`：start / status / fix / next-stage
- 新增 UI 页面 `web/app/projects/[name]/seedance/page.tsx`（视情况，可放下个迭代）
- **承诺：v1 实现五阶段全链路；用户在 Web UI 点按钮即可跑通（替代旧的终端脚本路径）**

**C 范围（v2 评估）— 本计划不做：**

- 4 种 mode 在 Web 端实现（full/extend/revise_episode/revise_global/rewrite_episode）
- review fix 循环 2 轮限制（当前无限循环）
- per-Agent / per-stage 静态模型绑定（v1 采用“用户当前选择模型”作为唯一运行时来源）
- vendor 热加载（当前 stream-model.ts 以官方 API / OpenAI 兼容 API 为主）

**跨范围共同承诺：**

- **生成结果结构等价**：A 范围相同输入产出 novels/ 文件数量/路径/Schema 完全一致；B 范围首版产出与旧终端链路产物结构等价
- **用户操作无感**：A 范围完全无感；B 范围用户从"必须用 Claude Code CLI"升级为"Web UI 点按钮"
- **跨模型 100% 兼容**：v1 用预组装 prompt + XML 输出合约，不依赖 function calling；模型统一来自用户当前选择的官方 API / OpenAI 兼容 API 配置

### 0.6 已锁定的开工前决策（2026-04-26 确认）

> **本计划已进入"已确认"状态可以开工。** 以下是用户拍板后的最终决策，所有 Phase 按此执行。

#### 应用形态前提（铁律）

- **应用形态：** Electron 桌面应用（`Toonflow.app` / `Toonflow.exe`），非浏览器
- **用户接触面：** 仅桌面应用窗口；**用户绝不接触 Claude Code、终端、命令行**
- `**.claude/` 业务部分定位：** 历史遗留代码，Phase 3 彻底删除，**没有"切回 CLI"的兜底路径**
- **Claude CLI 去除策略（2026-04-27 修订）：** 不再作为桌面应用模型选项；移除 `authMode='cli'`、`claude-cli` 内置注入、`cli-status` 检测和 `spawn claude -p` 调用路径
- **Settings 模型配置定位：** 只保留 API 配置；Claude / OpenAI / DeepSeek / Kimi 等均按官方 API 或 OpenAI 兼容 API 配置，不再依赖本机 Claude Code 登录态

#### 6 个决策问题的最终答案


| #      | 问题                         | 决策                       | 理由                                                                                                                        |
| ------ | -------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **Q1** | Seedance 在桌面应用里编排是否在 v1 做？ | ✅ **A 是**                | 桌面应用不接触 CLI 是铁律，Seedance 必须进窗口。**注意：这不是简单的 prompt 搬家，而是新增 ~600 行 seedance-executor.ts 的实质新功能开发，工期已在 Phase 4b 单独评估为 3 天。** |
| **Q2** | 5 种 mode 在桌面应用里支持是否在 v1 做？ | ✅ **B 否**                | Toonflow 也没做（实地查证），与 Toonflow 一致；v1 主线不受影响；v2 视用户反馈再加                                                                     |
| **Q3** | review fix 循环是否加 2 轮限制？    | ✅ **A 是**                | 10 行代码改动，防 LLM 死循环烧 token                                                                                                 |
| **Q4** | 故事类型在剧本骨架/改编/剧本阶段是否加载？     | ✅ **A 是**                | 我们的扩展（Toonflow 仅在 Seedance C 阶段用），剧本叙事节奏受故事类型影响显著，越早注入越好                                                                  |
| **Q5** | vendor 热加载是否在 v1 做？        | ✅ **B 否**                | 官方 API / OpenAI 兼容 API 已覆盖主流模型；v2 用户提需求时再照搬 Toonflow vm.ts（VM2 替换为 isolated-vm）                                  |
| **Q6** | 测试 novel + 国产模型？           | ✅ **造化之门 + DeepSeek-R1** | 造化之门数据完整度 100%（含 seedance/ 目录）；3D 国漫 × 玄幻组合刚好覆盖画风+故事类型抽样测试                                                                |


#### 最终范围确认


| 范围                          | 是否做        | 工期                  | 备注                                                                |
| --------------------------- | ---------- | ------------------- | ----------------------------------------------------------------- |
| **A 真外置（剧本链）**              | ✅ 必做       | Phase 4a 含 2 天      | prompts.ts/review-prompts.ts 搬家 + executor.ts buildXxx → runAgent |
| **B 新功能开发（Seedance Web 端）** | ✅ 必做（Q1=A） | Phase 4b 含 3 天      | 新增 seedance-executor.ts + 3 个 API 路由 + 5 个 saveSeedance setter    |
| **C v2 评估项**                | ❌ v1 不做    | —                   | 5 mode（Q2=B）、vendor 热加载（Q5=B）、agent-bindings 细粒度                  |
| **修复改进**                    | ✅ 必做       | Phase 4a 含 0.2 天    | review fix 循环加 2 轮限制（Q3=A）                                        |
| **扩展（Toonflow 没做）**         | ✅ 必做       | 不增工期（融入 Phase 1B+2） | 剧本三阶段加载故事类型 director_skills（Q4=A）                                 |


**最终工期：13.5-15 天**（含 Phase 4b Seedance Web 端编排，Q1=A 决定）

---

---

## 1. 业务流程合理性总验证

> **本节核心：在动手前，先逐项审视当前业务流程是否真的合理 — 不合理的流程不能被外置成永久依赖。**

### 1.1 剧本三阶段流程审视

```
项目初始化（确认参数：6 项 config）
    ↓
阶段 1：故事骨架生成（scriptAgent-skeleton）
    - 输入：novels/{name}/原文、config、description
    - 产出：novels/{name}/skeleton/global.md（全局三幕） + episodes/ep-N.md（逐集）
    - 监督：scriptAgent-supervisor 6 维度评审 → 不通过则 fix（最多 2 轮）
    ↓
阶段 2：改编策略生成（scriptAgent-adaptation）
    - 输入：骨架 + 原文 + config
    - 产出：novels/{name}/adaptation/global.md + episodes/ep-N.md + continuity.json
    - 监督：5 维度评审 → fix 循环
    ↓
阶段 3：剧本编写（scriptAgent-script，逐集生成）
    - 输入：骨架 + 改编策略 + 原文 + continuity 上下文
    - 产出：novels/{name}/scripts/ep-N.md（场景化剧本）
    - 监督：6 维度评审 → fix 循环
```

**逐项合理性 Q&A：**


| Q                                                                                               | A                                                                                                                                              | 处理                                           |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Q1：阶段 1 → 阶段 2 → 阶段 3 是否必须串行？                                                                   | 是。骨架定三幕和分集，改编策略定连贯性约束（continuity），剧本依赖前两者具体落地                                                                                                  | ✅ 流程合理，保留                                    |
| Q2：scriptAgent-main 是否必要？                                                                       | 必要。决策层负责"用户在闲聊还是要执行"的意图分类 + 项目配置参数收集；不能把这两件事强行塞进执行 Agent                                                                                       | ✅ 保留，但决策 prompt 内嵌 Agent 文件，不建独立 Skill       |
| Q3：4 种 mode（full/extend/revise_episode/revise_global）每个阶段都需要支持吗？                                | 是。骨架可能要全量重写（revise_global）或增量补集（extend）；改编/剧本同理                                                                                                | ✅ 4 mode 分支保留在每个 Skill 的 [工作流程] 节内           |
| Q4：scriptAgent-supervisor 一个 Agent 审 5 种内容（骨架/改编/故事线/大纲/剧本）会不会太重？                               | 不会。5 种审核共享"6 维度评分 + 评分等级 ABCD + JSON 输出格式"骨架，差异在维度名和权重；适合用一个 Skill（script-supervision）按 packet.action 分派子流程                                    | ✅ 保留单一 supervisor + script-supervision Skill |
| Q5：审核 fix 循环最多 2 轮是否合理？                                                                         | 合理。一是控制 token 成本；二是 2 轮还过不去说明 prompt/数据本身有问题，需人工介入                                                                                             | ✅ executor.ts 现有循环不动                         |
| Q6：项目配置 6 个参数（totalEpisodes / episodeDuration / chapterRange / platform / style / paywall）是否完整？ | 完整。剧本生成必需的所有显式参数都覆盖了；wordsPerEpisode 是衍生值（=episodeDuration × 150）                                                                              | ✅ 保留                                         |
| Q7：description 文本（含画风、影片比例、小说类型）从哪里读？                                                           | novels/{name}/description（纯文本）。executor.ts 通过 inferConfigFromDescription() 正则解析 platform/style；agent-runtime 同样从这里提取 artStyle 用于 loadSkillPack | ✅ 数据源唯一                                      |


**结论：剧本三阶段流程经过合理性验证，结构稳定，可作为外置基础。** 唯一需要改造的是"prompt 在哪里" — 从代码硬编码搬到 `/skills/` 文件。

### 1.2 Seedance 五阶段流程审视

```
A 导演分析（director.action='analyze'）
    - 输入：novels/{name}/scripts/ep-N.md
    - 产出：novels/{name}/seedance/ep{N}/01-director.md（讲戏本 + 人物清单 + 场景清单 + 道具清单）
    ↓
B 资产管理（seedance-main + seedance-asset）
    - 输入：导演分析 + artStyle
    - 产出：novels/{name}/assets/manifest.json + 角色/场景/道具图片
    - 调用 asset-helpers/{polish, generate-image, save, batch} 4 个子 Skill
    ↓
C1 导演规划（seedance-director-plan）
    - 输入：导演分析 + 资产清单
    - 产出：novels/{name}/seedance/ep{N}/02-director-plan.json（六维度规划）
    ↓
C2 分镜表（seedance-storyboard-table）
    - 输入：C1 + 资产
    - 产出：novels/{name}/seedance/ep{N}/03-storyboard-table.json（12 列 + trackId）
    ↓
C3 分镜提示词（storyboard-artist + seedance-storyboard-prompt）
    - 输入：C1 + C2 + shared/storyboard-prompt-techniques + shared/emotion-face-mapping
    - 产出：novels/{name}/seedance/ep{N}/04-prompts.md（Seedance 2.0 格式动态提示词）
    ↓
D 视频生成（seedance-video）
    - 输入：C3 + 资产参考图
    - 产出：novels/{name}/seedance/ep{N}/videos/*.mp4
```

**逐项合理性 Q&A：**


| Q                                                                            | A                                                                                                                       | 处理                       |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Q1：5 个阶段是否必须串行？                                                              | 是。每阶段产出是下阶段的硬依赖（A→B 提取资产清单；B→C1 规划用资产；C1→C2 表用规划；C2→C3 提示词用表；C3→D 视频用提示词）                                               | ✅ 保留                     |
| Q2：seedance-main 一个 Agent 调度 5 阶段会不会过重？                                      | 不会。它就是制片人角色，业务由 5 个独立 Skill 承担，main 只做编排。executor.ts 现有 5 阶段调用就是 seedance-main 的实质                                      | ✅ 保留                     |
| Q3：director 双职责（A 阶段分析 + 全阶段审核）合理吗？                                          | 合理。导演本就同时是创作者和审核者；通过 packet.action 分派（analyze / review_*）保持单入口语义                                                        | ✅ 保留，[工作流程] 写明 action 路由 |
| Q4：C3 的提示词由独立 storyboard-artist Agent 而非 seedance-main 直接调用，多一层是否冗余？         | 不冗余。C3 涉及大量画风技法（shared/storyboard-prompt-techniques + emotion-face-mapping 两份共享 Skill），调用模式与其他阶段不同；隔离一个专门 Agent 便于维护    | ✅ 保留                     |
| Q5：4 个 review/* Skill 由 director 持有合理吗？还是该归 supervisor？                      | 由 director 持有合理。审核维度（剧本分析/服化道/Seedance 提示词/合规）属于"导演工作"语义；scriptAgent-supervisor 只审剧本三阶段，不跨域                             | ✅ 保留                     |
| Q6：asset-helpers 的 4 个小 Skill（polish / generate-image / save / batch）是否值得独立？ | 值得。每个职责单一（提示词润色 / 图片 API 调用 / 下载到本地 / 批量串联），且未来可能被复用（如新增视频资产生成时）                                                        | ✅ 保留独立                   |
| Q7：seedance-storyboard-skill 原 500 行单文件是不是反模式？                               | 是。违反 skill-builder 规范第 11 条（单 Skill 过大）。拆分后：主 Skill `seedance-storyboard-prompt.md` 走 9 要素；3 份方法论资源抽到 `/skills/shared/` | ✅ 拆分                     |


**结论：Seedance 五阶段流程经过合理性验证，结构稳定。**

### 1.2.5 对照 Toonflow 发现的 Seedance 流程关键完善点

> 关键发现：我们当前 Seedance 流程相对 Toonflow 缺少几个能力，这些是 Toonflow 已经验证好的、对生成质量有显著影响的环节。本节明确把它们补进来。

#### 完善点 1：衍生资产（Derive Asset）的识别与管理

**问题：** 当前 `seedance-asset` 只做"读取剧本提取主资产"（一个角色 = 一个资产），但实际剧情中：

- 同一角色有多套服装（常服 / 礼服 / 战袍 / 校服）
- 同一道具有不同状态（完好 / 破损 / 发光激活）
- 同一场景有不同氛围变体（晴天 / 雨天 / 战后废墟）

**Toonflow 解决方案（`production_execution_derive_assets.md`）：** 主资产视为基础态，衍生资产是"父资产名·状态名"的视觉变体。识别规则：

- 只衍生**图片模型无法仅凭提示词稳定处理、且能在多个镜头复用的资产级视觉差异**
- 表情/情绪/局部特写/瞬时动作 → 不衍生（提示词解决）
- 服装变体 / 结构性外形改变 / 道具状态变化 / 场景氛围变体 → 衍生
- 角色默认基准态 = 基础打底（白色背心+内裤），剧本中出现明确穿着时补"服装类衍生"

**我们的处理：** 把 Toonflow `production_execution_derive_assets.md` 的"提取规则 + 衍生类型参考表 + 强制约束"融入 `/skills/seedance-asset.md` 的 [核心知识层] 和 [工作流程]，**不新建独立 Skill**（保持 Agent/Skill 数量稳定）。novels/ 目录中 `assets/manifest.json` 增加 `derive` 数组字段（每个父资产下挂衍生）。

**⚠️ 数据层 Schema 冻结（Phase 4b 前置必做，2026-04-26 补充）：**

实地审视 `web/app/lib/novels.ts:getSeedanceAssets()` 发现当前 `manifest.json` 的 schema **没有 derive 字段**。Phase 4b 开工前必须冻结新 schema：

```typescript
// novels/{name}/assets/manifest.json 完整 schema
{
  "version": "2.0",
  "characters": [{
    "id": "role-001",
    "name": "林动",
    "type": "role",
    "desc": "...",
    "baseImage": "characters/role-001.png",       // 基础态图
    "derive": [                                    // ⭐ 新增字段
      { "id": "role-001-formal", "name": "礼服态", "desc": "白衣礼服...", "image": "characters/role-001-formal.png" }
    ]
  }],
  "scenes": [/* 同结构 */],
  "props":  [/* 同结构 */]
}
```

**实施位置：**

- Phase 4b-3 增补 `saveSeedanceManifest(name, ep, manifest)` setter，按上述 schema 写入
- Phase 4b-3 增补 `getSeedanceManifest(name, ep)` getter（**当前不存在**，仅有 getSeedanceAssets 读 assets.json，路径不同）
- 衍生资产图片生成：复用 `asset-helpers/generate-image.md` 调用，写入 `characters/{id}-{deriveId}.png`

#### 完善点 2：分镜图生成（Storyboard Image Gen）

**问题：** 我们当前 Seedance 阶段产出顺序是 A→B→C1→C2→C3→D，**B 阶段产出的资产参考图直接用于 D 阶段视频生成**。但缺少"按分镜逐镜生成参考图"的中间步骤。

**Toonflow 解决方案（`production_execution_storyboard_gen.md`）：** 在分镜面板写入完成后、视频生成前，独立调用 `generate_storyboard_images` 按分镜 ID 列表生成图片。每张图基于分镜描述（特定景别 + 角色姿态 + 场景氛围），作为视频生成的"首帧参考"。

**我们的处理：** **v1 不新增独立阶段**。理由：

1. 我们当前分镜提示词（C3）已经按 Seedance 2.0 格式包含完整的 prompt 描述，视频模型可直接生成
2. 部分视频模型（如 Seedance 2.0 自带 imageReference）支持基于资产参考图直接生成视频
3. 加分镜图生成会改变 D 阶段输入合约，违反"业务逻辑 0 重构"承诺

**v2 评估：** 当用户反馈"视频角色一致性差"时，再考虑加 C2.5 阶段（分镜图生成）作为视频生成的首帧锚定。

#### 完善点 3：画风技法的导演级渗透

**问题：** 我们之前的计划只迁了 3d-guoman 一个画风目录的资产提示词模板（`art_prompt/art_*.md`），**但完全忽略了画风的导演技法子目录 `driector_skills/`**（Toonflow 拼写如此，我们改正为 `director_skills/`）。

**Toonflow 解决方案：** 每个画风目录除了 `art_prompt/` 外，还有 `driector_skills/`（3 个文件）：

- `director_planning_style.md` — 导演规划阶段（C1）的画风专属技法（光影方案 / 构图偏好 / 镜头运动节奏的画风变体）
- `director_storyboard.md` — 分镜阶段的画风渲染特征
- `director_storyboard_table_style.md` — 分镜表阶段的画风时长/景别偏好

**作用：** 同一份 `seedance-director-plan.md` 主 Skill 在加载 3D 国漫画风时引入"飞檐翘角侧光偏暖"，加载 2D 平面设计画风时引入"克莱因蓝硬阴影硬切"，输出不同质感的规划。

**我们的处理：** 全 9 个画风的 `director_skills/` 子目录全部迁入，作为画风包内的"导演技法资源"。skill-loader 的 `loadSkillPack({ artStyle })` 递归加载子目录所有 md 文件。Seedance C1/C2/C3 的 Skill 在 [工作流程] 第 1 步明确"如有画风资源则优先采用画风的 director_* 技法"。

#### 完善点 4：故事类型的叙事手法渗透

**问题：** 我们之前 v1 把 `story-genres/` 列为空目录（推到 v2）。**但 Toonflow 已经有 12 个完整故事类型**，每个都包含"叙事规划手法 + 分镜表叙事手法"两份导演技法 md 文件，这是 Toonflow 验证好的存量资源。

**Toonflow 解决方案（举例 Sweet_romance_novel）：**

- `director_planning_narrative.md`（叙事规划手法）— 主题立意 / 情感节奏 / 场景情绪 / 声音方向
- `director_storyboard_table_narrative.md`（分镜表叙事手法）— 景别递进 / 运镜节奏 / 镜头合并 / 转场逻辑

**作用：** 同一份骨架 + 改编生成的同一段剧本，加载"甜宠言情"叙事手法时强调推拉节奏 + 留白沉默；加载"热血动作"时强调景别快切 + 强光对比。

**我们的处理（含一个对 Toonflow 的明确扩展）：**

- v1 直接启用 `story-genres/`，全 12 个故事类型批量迁入
- skill-loader 的 `loadSkillPack({ storyGenre })` 加载（与 artStyle 同级别）
- 从 `novels/{name}/description` 提取"小说类型"字段映射到目录名（如"甜宠"→`Sweet_romance_novel`）

**⚠️ 我们对 Toonflow 的扩展（明确说明这是设计决策，不是照搬）：**

> 实地审视 Toonflow 源码（`src/agents/scriptAgent/index.ts` 全文）发现：**Toonflow 的 scriptAgent 完全不加载 art_skills 和 story_skills**，只有 productionAgent 才加载。这意味着 Toonflow 的剧本生成阶段没有故事类型约束。
>
> **我们的扩展：在剧本骨架/改编/剧本三阶段也加载故事类型 director_skills（与 Seedance C 阶段同级别）。**
>
> **理由：**
>
> 1. 剧本叙事节奏受故事类型影响显著（甜宠的推拉节奏 vs 热血的强冲击节奏 vs 悬疑的信息控制节奏 — 这些应在骨架/分集时即定调，而不是到分镜阶段才补救）
> 2. 早期注入比后期补救质量更高（骨架不对，后续分镜再精也救不回来）
> 3. 用户 Q4 拍板"是"后启用，否则保持与 Toonflow 一致（仅 Seedance 阶段加载）
>
> **实施细节：** scriptAgent-skeleton / scriptAgent-adaptation / scriptAgent-script 三个 Agent 的 `[工作流程]` 第 1 步明确"如有故事类型资源则采用其叙事节奏建议"。

**结论：** Seedance 流程在原 5 阶段框架基础上，通过画风+故事类型的"双层导演技法资源"（共 9×3 + 12×2 = **51 份导演技法 md 文件**）显著强化生成质感；剧本流程通过加载故事类型 director_skills（共 12×2 = 24 份，但与 Seedance 共享同一份，无新增物理文件）强化叙事节奏 — 但所有流程结构本身不改。

### 1.3 跨流程的合理性


| Q                             | A                                                                     | 处理             |
| ----------------------------- | --------------------------------------------------------------------- | -------------- |
| Q：剧本流程和 Seedance 流程之间的衔接对吗？   | 对。Seedance 阶段 A 输入的是 `novels/{name}/scripts/ep-N.md`（剧本阶段 3 的产出），单向依赖 | ✅ 保留           |
| Q：Q&A 的"流程合理"结论需不需要在改造过程中再验证？ | 需要。Phase 6 端到端回归就是验证：改造前后同一 novel 的同一集，跑完所有阶段，产出文件结构等价                | ✅ Phase 6 强制验证 |


### 1.4 改造不改的事情（红线）

- ❌ 不改阶段顺序、阶段产出格式、阶段间依赖
- ❌ 不改 review fix 循环（最多 2 轮）
- ❌ 不改 4 种 mode 的语义
- ❌ 不改 continuity.json 的字段
- ❌ 不改 novels/ 目录结构
- ❌ 不改 SSE 事件类型（status / text / content_saved / error / done）

**只改 prompt 在哪里 + 谁来读它。**

---

## 2. 最终架构

### 2.1 整体目录布局

```
agent_novels/
│
├── .claude/                                ← 仅 Claude Code 给开发者做本项目 Web 开发用
│   ├── skills/
│   │   ├── web-*/                          ← 保留（19 个开发 Skill）
│   │   └── skill-builder/                  ← 保留（元 Skill）
│   ├── agents/
│   │   └── web-*.md                        ← 保留（7 个开发 Agent）
│   └── CLAUDE.md                           ← 瘦身：只含 Web 开发流程
│
├── skills/                                 ← 业务 Skill 真源（22 个 + 画风包）
│   │
│   ├── 平铺层（11 个主技能）
│   ├── script-skeleton.md                  ← scriptAgent-skeleton 用
│   ├── script-adaptation.md                ← scriptAgent-adaptation 用
│   ├── script-writing.md                   ← scriptAgent-script 用
│   ├── script-supervision.md               ← scriptAgent-supervisor 用（6 维度审核合一）
│   ├── seedance-main.md                    ← seedance-main 用（制片人决策）
│   ├── seedance-director-analysis.md       ← director(action=analyze)
│   ├── seedance-asset.md                   ← seedance-main(B 阶段)
│   ├── seedance-director-plan.md           ← seedance-main(C1)
│   ├── seedance-storyboard-table.md        ← seedance-main(C2)
│   ├── seedance-storyboard-prompt.md       ← storyboard-artist(C3)
│   └── seedance-video.md                   ← seedance-main(D)
│   │
│   │   注：scriptAgent-main 决策 prompt 内嵌 Agent 文件，不建独立 Skill
│   │
│   ├── review/                             （4 个，跨流程审核）
│   │   ├── script-analysis.md
│   │   ├── art-direction.md
│   │   ├── seedance-prompt.md
│   │   └── compliance.md
│   │
│   ├── shared/                             （3 个共享技法）
│   │   ├── storyboard-prompt-techniques.md
│   │   ├── storyboard-table-techniques.md
│   │   └── emotion-face-mapping.md
│   │
│   ├── asset-helpers/                      （4 个资产小 Skill）
│   │   ├── polish.md
│   │   ├── generate-image.md
│   │   ├── save.md
│   │   └── batch.md
│   │
│   ├── art-styles/                         （画风包，9 个画风全部迁入）
│   │   ├── 3d-guoman/                      ← 已迁入 skills/art-styles/3d-guoman/（兼容现有项目数据）
│   │   ├── 3D_chinese_traditional/         ← Toonflow data/skills/art_skills/ 迁入
│   │   ├── 3D_anime_render/                ← 同上
│   │   ├── 3D_clay_stopmotion/             ← 同上（黏土定格）
│   │   ├── 2D_chinese_guofeng/             ← 同上（国风二次元新国潮）
│   │   ├── 2D_90s_japanese_anime/          ← 同上（90 年代日漫）
│   │   ├── 2D_flat_design/                 ← 同上（平面设计）
│   │   ├── 2D_mature_urban_romance/        ← 同上（都市言情写实2D）
│   │   ├── realpeople_ancient_chinese/     ← 同上（古装真人）
│   │   └── realpeople_urban_modern/        ← 同上（都市真人）
│   │   │
│   │   每个画风目录统一结构（照搬 Toonflow）：
│   │   {style}/
│   │   ├── README.md                       ← 画风简介
│   │   ├── prefix.md                       ← 全局美学基础（风格基因 / 色盘 / 约束规则）
│   │   ├── images/                         ← 参考图
│   │   ├── art_prompt/                     ← 资产提示词模板（B 阶段用）
│   │   │   ├── art_character.md
│   │   │   ├── art_character_derivative.md ← 衍生资产（完善点 1）
│   │   │   ├── art_scene.md
│   │   │   ├── art_scene_derivative.md
│   │   │   ├── art_prop.md
│   │   │   ├── art_prop_derivative.md
│   │   │   └── art_storyboard_video.md     ← 分镜视频提示词（C3/D 阶段用）
│   │   └── director_skills/                ← 画风导演技法（Toonflow 拼写为 driector_skills，我们改正）
│   │       ├── director_planning_style.md  ← C1 导演规划画风变体
│   │       ├── director_storyboard.md      ← C2 分镜画风变体
│   │       └── director_storyboard_table_style.md ← C2 分镜表画风变体
│   │
│   └── story-genres/                       （故事类型包，12 个全部迁入，v1 启用）
│       ├── Sweet_romance_novel/            ← 甜宠言情
│       ├── Xianxia_fantasy/                ← 仙侠奇幻
│       ├── Urban_workplace_drama/          ← 都市职场
│       ├── Hot_blooded_action/             ← 热血动作
│       ├── Mystery_thriller/               ← 悬疑惊悚
│       ├── Horror_supernatural/            ← 恐怖超自然
│       ├── Comedy_humor/                   ← 喜剧幽默
│       ├── Family_warmth/                  ← 家庭温情
│       ├── Coming_of_age/                  ← 青春成长
│       ├── Historical_epic/                ← 历史史诗
│       ├── Psychological_drama/            ← 心理剧
│       └── Scifi_post_apocalypse/          ← 科幻末日
│       │
│       每个故事类型目录统一结构（照搬 Toonflow）：
│       {genre}/
│       ├── README.md                       ← 故事类型简介
│       ├── images/                         ← 参考图
│       └── director_skills/                ← 叙事导演技法
│           ├── director_planning_narrative.md       ← C1 叙事规划手法
│           └── director_storyboard_table_narrative.md ← C2 分镜表叙事手法
│
├── agents/                                 ← 业务 Agent 真源（8 个 md）
│   ├── scriptAgent-main.md                 （决策 prompt 内嵌）
│   ├── scriptAgent-skeleton.md
│   ├── scriptAgent-adaptation.md
│   ├── scriptAgent-script.md
│   ├── scriptAgent-supervisor.md
│   ├── seedance-main.md
│   ├── director.md
│   └── storyboard-artist.md
│
├── web/app/lib/
│   ├── skill-loader.ts                     ← 🆕 扫描 /skills/ + 按名加载 + loadSkillPack
│   ├── agent-runtime.ts                    ← 🆕 读 /agents/<name>.md + 编排 LLM 调用
│   └── agent/
│       ├── executor.ts                     ← 🔁 buildXxxPrompt → runAgent (替换 5-10 处)
│       ├── prompts.ts                      ← 🔁 函数体改 runAgent wrapper（灰度后删）
│       ├── decision.ts                     ← 不动（意图分类工具）
│       └── stream-model.ts                 ← 🔁 API-only，移除 Claude CLI 分支
│
├── config/
│   ├── art-styles/                         ← 🗑️ 迁完后删除
│   ├── models/                             ← 不动（模型配置 JSON）
│   ├── banana.json                         ← 不动（图片 API 配置）
│   └── stage-bindings.json                 ← 旧方案遗留，不再作为运行时模型来源
│
└── novels/                                 ← 数据层（0 改动）
```

### 2.2 业务 Skill 组织（22 个 + 画风包）


| 层级             | 数量       | 命名规则                                                                        |
| -------------- | -------- | --------------------------------------------------------------------------- |
| 平铺层            | 11       | `<domain>-<role>.md`，domain ∈ {script, seedance}                            |
| review/        | 4        | `<area>.md`（script-analysis / art-direction / seedance-prompt / compliance） |
| shared/        | 3        | `<technique>.md`，被多个平铺 Skill 引用                                             |
| asset-helpers/ | 4        | `<verb>.md`（polish / generate-image / save / batch），seedance-asset 内部使用     |
| art-styles/    | **9 套**  | 子目录 = 画风名（3d-guoman + Toonflow 8 个），按 description 中"影片画风"字段动态加载             |
| story-genres/  | **12 套** | 子目录 = 故事类型（Toonflow 12 个），按 description 中"小说类型"字段动态加载，v1 启用                 |


**Skill 文件形态：单文件 md**（照抄 Toonflow-app 风格，不用目录+SKILL.md）

**frontmatter（必备字段）：**

```yaml
---
name: script-skeleton              # kebab-case，文件名一致
version: 1.0.0
description: 触发时机（≤150 字）
metaData: script_skills            # 分类：script_skills | seedance_skills | review_skills | shared_skills | asset_skills | art_skills
depends_on: []                     # 依赖的其他 Skill 名字（如 [shared/emotion-face-mapping]）
output_tag: skeleton               # XML 输出标签名（必填，与 [输出格式] 节一致）
---
```

**节内结构（9 要素，必备）：**

1. `[任务与边界]` — 做 / 不做 / 完成标准
2. `[第一性原则]` — 3-5 条底线，按优先级排序
3. `[依赖检测]` — 业务数据前提（要读哪些 novels/ 文件）+ 失败话术
4. `[核心知识层]` — 维度 / 规则 / 策略（按 Skill 类型选择节名）
5. `[工作流程]` — 第 1 步 → 第 N 步
6. `[输出格式]` — 固定模板，必须包含 XML 包裹示例（与 frontmatter `output_tag` 一致）+ meta 注释
7. `[输出风格]` — 语态、反例
8. `[初始化]` — 入场协议（Web runtime 下作为 system prompt 头部给 LLM）

### 2.3 业务 Agent 组织（8 个 md）

**文件形态：** 单文件 md，放在 `/agents/<name>.md`

**frontmatter（必备字段）：**

```yaml
---
name: scriptAgent-skeleton
version: 1.0.0
description: 触发时机
skills: [script-skeleton]          # 主 Skill（必填数组；scriptAgent-main 可为空）
attached_skills: []                # v1 不读取，预留 v2
tools: [Read, Write, Edit, Glob]   # v1 仅作文档；v2 切 agentic 时变物理约束
color: blue
memory: project                    # v1 不读取，预留 v2
---
```

**6 节结构：**

1. `[任务]` — 使命（2-3 句），禁写业务流程
2. `[角色]` — 人设 + 铁律 + 边界
3. `[前置条件]` — caller 必传 packet 字段 + 校验规则 + 失败话术
4. `[工作流程]` — 签收 → 校验 → 调 Skill → 异常（唯一入口）
5. `[输出规范]` — 机器字段（status / stage_reached / failure_count）+ 格式 + 完成标准

**[前置条件] vs Skill [依赖检测] 分工：**


| 节            | 内容                                                         | 校验者                  |
| ------------ | ---------------------------------------------------------- | -------------------- |
| Agent [前置条件] | packet 字段（projectName / episode / mode / action / history） | agent-runtime 代码硬校验  |
| Skill [依赖检测] | 业务数据前提（novels/ 文件存在性）                                      | LLM 在 [工作流程] 第 1 步自查 |


**packet 标准字段：**

```typescript
interface AgentPacket {
  projectName: string;              // 必填，所有 Agent 都需要
  action?: string;                  // 用于 Agent 内部分派（如 director.action='analyze'/'review_*'）
  episode?: number;                 // 集级别 Agent 必填
  mode?: 'full' | 'extend' | 'revise_episode' | 'revise_global' | 'rewrite_episode';
  range?: [number, number];         // extend 模式必填
  history?: ChatMessage[];          // chat 场景（scriptAgent-main 的 chat action）
  modelOverride?: string;           // 当前 UI 选择的模型；兼容旧字段名，语义不再是覆盖阶段绑定
  [k: string]: any;                 // 其他 Agent 特定字段
}
```

### 2.4 Web 后端加载层

#### 2.4.1 `web/app/lib/skill-loader.ts`（约 200 行）

**参照：** Toonflow-app `src/utils/agent/skillsTools.ts`（274 行）的 `parseFrontmatter` + `useSkill` + `scanSkills`

**v1 核心 API（不实现 activate_skill / read_skill_file tool — 留 v2）：**

```typescript
interface SkillFrontmatter {
  name: string;
  version: string;
  description: string;
  metaData: 'script_skills' | 'seedance_skills' | 'review_skills' | 'shared_skills' | 'asset_skills' | 'art_skills';
  depends_on: string[];
  output_tag: string;
}

interface Skill {
  frontmatter: SkillFrontmatter;
  body: string;            // 去 frontmatter 后的正文
  filePath: string;
}

// 启动时全量扫描 + 内存缓存
async function loadAllSkills(): Promise<Map<string, Skill>>;

// 按名加载单个 Skill（含 depends_on 递归）
async function loadSkill(name: string): Promise<{
  main: Skill;
  resolved: Skill[];     // depends_on 全链路解析
}>;

// 按 metaData 标签筛选
async function listSkillsByMeta(tag: string): Promise<Skill[]>;

// 按画风/故事类型动态装配
async function loadSkillPack(opts: {
  artStyle?: string;
  storyGenre?: string;
  stage?: 'C1' | 'C2' | 'C3' | 'B';   // 控制按阶段筛选画风/故事类型的子目录文件
}): Promise<{
  prefix: string;                       // 画风 prefix.md 内容
  artPromptResources: Array<{ name: string; content: string }>;     // art_prompt/*.md（B 阶段资产用）
  artDirectorResources: Array<{ name: string; content: string }>;   // 画风 director_skills/*.md（C 阶段用）
  storyDirectorResources: Array<{ name: string; content: string }>; // 故事类型 director_skills/*.md（C 阶段用）
}>;
```

**实现策略：**

- 用 `gray-matter` 解析 frontmatter（不自写，避免 YAML 边界坑）
- 用 `fast-glob` 扫描 `/skills/**/*.md`
- 启动时一次性扫描，结果缓存到 `Map<name, Skill>`；提供 `invalidateCache()` 给开发模式 hot reload
- `loadSkillPack` 递归读取 `/skills/art-styles/{artStyle}/**/*.md` 和 `/skills/story-genres/{genre}/**/*.md`，按子目录分类返回（art_prompt vs director_skills）
- 按 `stage` 筛选：B 阶段只用 art_prompt；C1/C2/C3 阶段加载两边的 director_skills
- 路径越界保护：`isPathInside(filePath, skillsRoot)`

#### 2.4.2 `web/app/lib/agent-runtime.ts`（约 200 行）

**参照：** Toonflow-app `src/agents/scriptAgent/index.ts`（238 行）的 `runDecisionAI` + `createSubAgent` + `consumeFullStream`

**v1 核心 API（一次性预组装 prompt，不走 agentic loop）：**

```typescript
interface AgentConfig {
  frontmatter: {
    name: string;
    version: string;
    skills: string[];
    attached_skills: string[];
    tools: string[];
    color: string;
  };
  body: string;          // 6 节正文
}

async function loadAgent(name: string): Promise<AgentConfig>;

interface RunAgentResult {
  status: 'passed' | 'stage1_blocked' | 'stage2_blocked' | 'skill_failed';
  stage_reached: number;
  failure_count: Record<string, number>;
  output: string;        // extractXml(raw, output_tag) 提取的业务正文
  raw: string;           // LLM 完整返回
}

async function* runAgent(params: {
  agentName: string;
  packet: AgentPacket;
  signal?: AbortSignal;
}): AsyncGenerator<
  { type: 'status'; data: string } |
  { type: 'text'; data: string } |
  { type: 'done'; result: RunAgentResult }
>;
```

**runAgent 内部流程（v1 严格次序）：**

1. `loadAgent(agentName)` → 读 `/agents/<name>.md`
2. 校验 packet 是否满足 Agent [前置条件]，缺则 yield `done` with `status: 'skill_failed'`
3. 模型解析：`packet.modelOverride / packet.modelId > 第一个启用语言模型`
  - `modelOverride` 仅作为旧字段名保留，值来自 UI 当前选择模型
  - `stageKey` 仍用于业务阶段识别和 SkillPack 加载，但不再参与模型绑定
4. 加载主 Skill：`loadSkill(agent.frontmatter.skills[0])` → 含 depends_on 递归
5. 加载画风+故事类型包（仅 Seedance 链）：
  - 从 `novels/{packet.projectName}/description` 正则提取：
    - `影片画风:` → 映射到 `/skills/art-styles/{artStyle}/`（如"3D国漫"→`3D_chinese_traditional` 或 `3d-guoman`）
    - `小说类型:` → 映射到 `/skills/story-genres/{genre}/`（如"甜宠"→`Sweet_romance_novel`）
  - 按当前 Skill 阶段调用 `loadSkillPack({ artStyle, storyGenre, stage })`
  - 阶段 B（资产）：只取 `art_prompt/*.md`
  - 阶段 C1/C2/C3（规划/分镜）：同时取画风 `director_skills/*.md` + 故事类型 `director_skills/*.md`
6. 组装 system prompt：
  ```
   {Agent.body 的 [任务] + [角色] + [工作流程] + [输出规范]}

   ---

   ## 主技能（{skill.name}）
   {主 Skill.body 9 要素}

   ## 共享技法
   {depends_on 解析的所有 shared/* 资源}

   ## 画风全局基础（如适用）
   {loadSkillPack 返回的 prefix.md（画风风格基因 + 色盘 + 约束规则）}

   ## 画风专属资源（如适用，按阶段）
   B 阶段：{art_prompt/*.md 的对应资产模板}
   C 阶段：{director_skills/*.md 的画风导演技法}

   ## 故事类型叙事手法（C 阶段适用）
   {story-genres/{genre}/director_skills/*.md}
  ```
7. 拼 user prompt：
  ```
   {packet 序列化 + 业务上下文（novels/ 关键文件内容）}
   {history 如有}
  ```
8. 调 `callModelStream(model, messages, signal)`（官方 API / OpenAI 兼容 API）
9. 流式 yield `text` 事件给 caller
10. 流结束后：
  - `extractXml(raw, agent.skills[0].output_tag)` → output 字段
    - 解析 `<!-- meta: {...} -->` 注释 → status / stage_reached / failure_count
    - yield `done` with RunAgentResult

#### 2.4.3 改造 `executor.ts`

**仅替换两处：**

1. `buildXxxPrompt(...)` → `runAgent({ agentName: '<对应Agent>', packet: {...} })`
2. `callModelStream(model, messages)` 调用从 executor 内部移到 agent-runtime 内部

**对照表（prompts.ts 6 函数）：**


| 原函数                             | 改造后调用                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| `buildChatPrompt(...)`          | `runAgent({ agentName: 'scriptAgent-main', packet: { action: 'chat', ... } })`           |
| `buildExtractParamsPrompt(...)` | `runAgent({ agentName: 'scriptAgent-main', packet: { action: 'extract_params', ... } })` |
| `buildSkeletonPrompt(...)`      | `runAgent({ agentName: 'scriptAgent-skeleton', packet: {...} })`                         |
| `buildAdaptationPrompt(...)`    | `runAgent({ agentName: 'scriptAgent-adaptation', packet: {...} })`                       |
| `buildScriptPrompt(...)`        | `runAgent({ agentName: 'scriptAgent-script', packet: {...} })`                           |
| `buildProgressSummary(...)`     | **不动**（工具函数，文本拼接）                                                                        |


**对照表（review-prompts.ts 5 函数）：**


| 原函数                                | 改造后调用                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `buildSkeletonReviewPrompt(...)`   | `runAgent({ agentName: 'scriptAgent-supervisor', packet: { action: 'review_skeleton', ... } })`   |
| `buildAdaptationReviewPrompt(...)` | `runAgent({ agentName: 'scriptAgent-supervisor', packet: { action: 'review_adaptation', ... } })` |
| `buildStorylineReviewPrompt(...)`  | `runAgent({ agentName: 'scriptAgent-supervisor', packet: { action: 'review_storyline', ... } })`  |
| `buildOutlineReviewPrompt(...)`    | `runAgent({ agentName: 'scriptAgent-supervisor', packet: { action: 'review_outline', ... } })`    |
| `buildScriptReviewPrompt(...)`     | `runAgent({ agentName: 'scriptAgent-supervisor', packet: { action: 'review_script', ... } })`     |


**executor.ts 保留不动：**

- `extractXml(text, tag)` / `extractScriptItem(text)` 工具函数 → agent-runtime 复用
- review fix 循环（最多 2 轮）
- 数据写入：updateSkeleton / updateAdaptation / updateScript / saveReviewResult / updateContinuity
- SSE 事件（status / text / content_saved / error / done）
- mode 判断、阶段切换、章节范围验证

---

## 3. 跨模型机制（核心保障）

### 3.1 当前模型管理（2026-04-27 修订：选择即调用）

**配置文件：**

- `config/models/{type}/{id}.json`：模型配置（modelId / name / type / provider / api / defaultParams）
- `config/stage-bindings.json`：旧方案遗留，已清空为 `{}`，不再作为运行时模型来源
- 现有 stage 列表仍用于业务流程、任务记录、SkillPack 加载和进度展示，但不再承担模型绑定职责

**前端 UI：**

- `web/app/settings/page.tsx` — 设置页
- `web/app/api/settings/models/` — 模型 CRUD
- 工作台模型选择器 — 选择本次剧本链 / 对话调用的语言模型
- 制作面板模型选择器 — 分别选择语言 / 图像 / 视频模型，并随请求传入 `languageModelId` / `imageModelId` / `videoModelId`
- `web/app/api/settings/stage-bindings/`、`web/app/api/settings/cli-status/` — 旧方案入口，已删除

**改造后用户操作流程：**

1. 用户在 `/settings` 页面 → 添加模型（Claude 官方 API / OpenAI / DeepSeek / Kimi / 国产 OpenAI 兼容模型等）
2. 用户在工作台或制作面板选择当前要使用的模型
3. 点"生成骨架" / "导演分析" / "分镜表" → 前端把选中的 modelId 放进请求体
4. 后端 `executor.ts / seedance-executor.ts → runAgent → resolveModel(selectedModelId)`，直接调用该模型
5. 未传 modelId 时，后端只兜底选择第一个 enabled 的同类型模型，并给出清晰错误提示

### 3.2 stage 与 Agent 的映射（仅保留业务语义）

**问题：** Toonflow-app 用 AgentKey 绑定模型（`scriptAgent:storySkeletonAgent`），旧方案用 stage 绑定模型（`storyline → modelId`）。两套都属于静态绑定，会和用户当前选择模型形成第二套状态源。

**v1 决策：废弃静态模型绑定。stage 只表示业务阶段，不再决定模型。**

**stage 仍然保留的用途：**

- 决定加载哪个业务 Skill / 画风包 / 故事类型包
- 记录任务进度（如 A/B/C1/C2/C3/D）
- 在 UI 中展示当前阶段和产物状态
- 不用于从 `stage-bindings.json` 查 modelId

**映射规则（在 agent-runtime 内部转换，仅用于业务语义）：**


| Agent                  | stage                                                                        |
| ---------------------- | ---------------------------------------------------------------------------- |
| scriptAgent-main       | chat                                                                         |
| scriptAgent-skeleton   | storyline                                                                    |
| scriptAgent-adaptation | outline                                                                      |
| scriptAgent-script     | script                                                                       |
| scriptAgent-supervisor | review（按 packet.action 分流：review-storyline / review-outline / review-script） |
| seedance-main          | seedance-director（B/C1/C2/D 阶段共享，按 packet.stage 细分到现有 stage key）             |
| director               | seedance-director（action=analyze）/ review（action=review_*）                   |
| storyboard-artist      | seedance-storyboard                                                          |


**实现位置：** `agent-runtime.ts` 内的 `resolveStageForAgent(agentName, packet.action)` 工具函数 — 一张静态映射表 + action 分流逻辑。

**v2 升级路径：** 如果以后确实需要“自动按任务选择不同模型”，也应做成显式策略配置（如模型路由规则），并与当前 UI 选择有清晰优先级；不恢复 `stage-bindings.json` 这种隐藏绑定。

### 3.3 跨模型 100% 兼容的关键设计

**v1 不依赖 function calling**（因为不是所有模型都支持 tool use）

**输出合约（XML + meta 注释）：**

每个 Skill 的 `[输出格式]` 节强制规定：

```
你必须严格按照如下格式输出（除此之外不输出任何其他 XML 或 JSON）：

<{output_tag}>
{业务正文}
</{output_tag}>

<!-- meta: {"status":"passed","stage_reached":N,"failure_count":{"critical":0,"high":0,"medium":0}} -->
```

**举例：**

- `script-skeleton`：`<skeleton>...</skeleton>` + `<!-- meta: {...} -->`
- `script-writing`：`<scriptItem name="EP01：xxx">...</scriptItem>` + meta
- `seedance-storyboard-table`：`<storyboardTable>...JSON...</storyboardTable>` + meta
- `script-supervision`：`<reviewReport>...JSON 评分...</reviewReport>` + meta

**解析（agent-runtime 内）：**

```typescript
const main = extractXml(raw, output_tag);                // 业务正文
const metaMatch = raw.match(/<!--\s*meta:\s*({.+?})\s*-->/s);
const meta = metaMatch ? JSON.parse(metaMatch[1]) : { status: 'passed', stage_reached: 1, failure_count: {} };
```

**异常合约：**


| 情况             | 处理                                                 |
| -------------- | -------------------------------------------------- |
| 缺主 XML 标签      | status = 'skill_failed'，output 空，原始 raw 入日志        |
| 缺 meta 注释      | status 默认 'passed'（容错）                             |
| meta JSON 解析失败 | status = 'skill_failed'，failure_count.critical = 1 |


**实测兼容性矩阵（必须全部跑通才算通过）：**


| 模型                    | 输出 XML | 输出 meta | 备注                |
| --------------------- | ------ | ------- | ----------------- |
| Claude Sonnet 4 (官方 API) | ✅      | ✅       | 通过 Anthropic Messages API 或兼容网关配置 |
| GPT-4o                | ✅      | ✅       |                   |
| DeepSeek-R1           | ✅      | ✅       | 思考模式需要 stripThink |
| Kimi K2               | ✅      | ✅       | temperature 固定为 1 |
| 通义千问 / 文心             | ✅      | ✅       | OpenAI 兼容模式       |


**Phase 6 必跑实测：** 至少用 2 个 API 模型（如 Claude 官方 API + DeepSeek/Kimi，或 DeepSeek + Kimi）跑完一次完整剧本三阶段 + Seedance 五阶段。

### 3.4 思考模式的处理（DeepSeek / Claude Reasoning）

部分模型返回 `<think>...</think>` 思考过程（DeepSeek R1）或 reasoning/reasoning_content 字段。

**历史风险（2026-04-26 实地查证）：** `web/app/lib/agent/stream-model.ts` 曾经没有处理 `<think>` 标签，API 流式 chunk 会让思考过程原样进入 raw 文本。

**风险：** Q6 决策选 DeepSeek-R1 作为跨模型测试国产模型 → DeepSeek-R1 输出含 `<think>...</think>` → executor.ts 的 `extractXml` 用宽松正则匹配可能命中 `<think>` 内的伪 XML 标签 → **XML 解析错乱、剧本/骨架内容混入思考片段、数据写入失败**。

**修正方案（必做，Phase 4a-2 阶段补）：**

**步骤 1：补 `web/app/lib/agent/strip-think.ts`（约 80 行）**

照搬 Toonflow `src/utils/stripThink.ts` 实现，含两个 API：

```typescript
// 非流式：一次性剥离
export function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

// 流式：chunk 级有状态过滤器（处理 <thi|nk> 跨 chunk 边界）
export function createThinkStreamFilter(): {
  push(chunk: string): string;          // 输入 chunk，输出已过滤片段（思考块内容不输出）
  flush(): string;                       // 流结束时刷出残留 buffer
};
```

**步骤 2：在 agent-runtime.ts 的 runAgent 流处理中接入**

```typescript
const thinkFilter = createThinkStreamFilter();
for await (const chunk of callModelStream(model, messages, signal)) {
  const filtered = thinkFilter.push(chunk);
  if (filtered) yield { type: 'text', data: filtered };
}
const tail = thinkFilter.flush();
if (tail) yield { type: 'text', data: tail };
```

**步骤 3：non-streaming 调用（如 buildExtractParamsPrompt）也用 stripThink 包一层**

**验证：** Phase 6.3 跨模型回归用 DeepSeek-R1 跑骨架生成，确认 raw 输出无 `<think>` 残留、extractXml 能正常提取业务正文。

**工期影响：** 0.3 天（含编码 + 单元测试 + 跨模型实测）

### 3.5 vendor 热加载评估（v1 不做，v2 触发条件明确）

**Toonflow 实现（参考价值）：**

- 用户在前端编辑 vendor TS 代码（`updateCode.ts`） → sucrase 转 JS → VM 沙盒执行（`utils/vm.ts` + `utils/vendor.ts`） → 持久化到 `data/vendor/{id}.ts`
- VM 沙盒暴露 `createOpenAI / createDeepSeek / createZhipu / createQwen / createAnthropic / createGoogleGenerativeAI / createMinimax / createOpenAICompatible` 等 SDK 工厂
- **零重启**：每次请求时动态读取 + 转译 + 执行；用户加新供应商不用改代码、不用重启

**我们当前方案（修订后保留）：**

- `web/app/lib/agent/stream-model.ts` 内置 API 调用模式：
  - **OpenAI 兼容 API**（`/v1/chat/completions` 协议）：覆盖 OpenAI、DeepSeek、Kimi、通义千问、文心一言、智谱 GLM 以及兼容网关
  - **官方 API 分发**（按 `provider` / `api.protocol` 决定）：用于 Claude 官方 API 等非 OpenAI-compatible 的模型

**v1 不做 vendor 热加载的理由：**

1. **覆盖度够用**：OpenAI 兼容 API 协议是事实标准，国产模型 90% 都兼容
2. **复杂度高**：VM2 已停更（Node.js 安全风险），照搬需切换到 Worker / WebAssembly 沙盒，有工期成本
3. **触发条件明确**：当用户提需求"我要接入 XX 国产模型，OpenAI 兼容协议覆盖不了"时再做 v2

**v2 触发条件清单：**

- ✋ 用户报告："X 模型不支持 `/v1/chat/completions` 协议"
- ✋ 用户报告："X 模型需要特殊鉴权（如阿里云 SDK / 腾讯云 SDK）"
- ✋ 用户希望前端可视化编辑 vendor 代码（不依赖工程师改 stream-model.ts）

**v2 实施路径（已明确）：** 直接照搬 Toonflow `src/utils/vm.ts`（187 行）+ `src/utils/vendor.ts`（43 行）+ `src/routes/setting/vendorConfig/`*（10 个 API 路由），但 VM2 替换为 isolated-vm 或 Worker（更安全）。

### 3.6 模型来源粒度（当前选择 vs 静态绑定）

**Toonflow 实现：** `o_agentDeploy` 表用 `key` 字段做粒度（如 `scriptAgent:storySkeletonAgent`），允许不同 sub-agent 用不同模型。

**旧方案：** `config/stage-bindings.json` 用 stage 粒度（如 `storyline / outline / script`），所有同 stage 的调用共用一个模型。

**修订后方案：** 模型来源以用户当前选择为准。选择器在请求体传入 `modelId / languageModelId / imageModelId / videoModelId`，运行时直接解析这个 modelId。

**对比：**


| 维度      | 静态绑定（per-Agent / per-stage） | 当前选择模型（修订后） |
| ------- | ---------------------------- | ---------------- |
| 状态来源    | 多处配置，容易与 UI 选择不一致             | 单一来源，用户所见即所用 |
| 灵活性     | 可预设不同阶段不同模型                  | 每次任务可即时切换      |
| 配置复杂度   | 需要额外绑定 UI / JSON               | 只需要模型配置和选择器    |
| 调试成本    | 排查“为什么没用我选的模型”困难             | 请求体里能直接看到 modelId |
| 适合场景    | 企业级自动路由                       | 当前桌面应用的人机协作流程  |


**v1 决策：** 删除 stage-bindings 作为运行时模型来源。保留 stage 仅作业务阶段。**v2 升级路径：** 如需自动路由模型，新增显式“模型路由策略”并在 UI 上可见，不能用隐藏 JSON 绑定覆盖用户选择。

---

## 4. Toonflow-app 对照分析

> 本节确认我们的设计与父项目兼容，避免设计偏移。

### 4.1 关键差异对照表


| 方面           | Toonflow-app                                                 | 我们 v1                                                                      | 备注                                       |
| ------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------- |
| Skill 文件形态   | 单文件 md + frontmatter                                         | **完全照抄**                                                                   | ✅                                        |
| Skill 组织     | 平铺主技能 + 分类子目录（art_skills / story_skills / production_skills） | **完全照抄**（review/ + shared/ + asset-helpers/ + art-styles/ + story-genres/） | ✅                                        |
| Skill 加载     | activate_skill tool（agentic）+ read_skill_file tool           | **预组装一次注入**（v1）→ activate_skill（v2）                                        | ⚠️ v1 简化但兼容更多模型                          |
| Agent 实现     | TS 隐式（scriptAgent/index.ts）                                  | **md 显式 + agent-runtime.ts 加载**                                            | ⚠️ 我们更通用，便于跨编排器复用                        |
| Sub-agent 调度 | 父 Agent 用 run_sub_agent_X tool 自主调度                          | **executor.ts 外部顺序编排**                                                     | ⚠️ v1 保持现有 executor 950 行编排，v2 切 agentic |
| 模型来源       | per AgentKey（o_agentDeploy 表）                                | **用户当前选择模型**（请求体传入 modelId）                                         | ✅ 用户所见即所用，避免隐藏绑定           |
| Vendor 实现    | TS 文件 + sucrase + VM 热加载                                     | **stream-model.ts 内置官方 API / OpenAI 兼容 API**                              | ⚠️ 不做热加载，加新 vendor 改 stream-model.ts 一处  |
| 数据存储         | SQLite（u.db）+ 文件（data/）                                      | **纯文件**（novels/ + config/）                                                 | ✅ 设计选择                                   |
| 记忆系统         | ONNX 本地向量 + 三层记忆                                             | **不做**（v2 评估）                                                              | ✅ 简化                                     |
| 流式           | socket.io                                                    | **SSE**（fetch ReadableStream）                                              | ✅ 现有设计                                   |


### 4.2 我们做了什么 Toonflow 没有的

1. **Agent 配置显式化**：Toonflow 把 Agent prompt 写在 TS 代码里，我们抽到 md，更通用，便于版本化和审查
2. **模型选择单一来源**：Toonflow 可按 AgentKey 配置模型，我们在桌面应用里以用户当前选择为准，避免 stage / agent 绑定与页面选择冲突
3. **节内结构规范（9 要素 + 6 节）**：Toonflow 的 md 是自由格式，我们强制 skill-builder 的节内规范，便于团队协作和质量审核

### 4.3 借鉴 Toonflow 但简化的

1. **不做 vendor 热加载**：当前 stream-model.ts 先支持官方 API / OpenAI 兼容 API，对主流文本模型场景够用；新增封闭协议（如混元 webhook 模式）再单独写
2. **不做记忆系统**：v1 用 chat history 简单 list；用户量起来后再评估 RAG
3. **不做 agentic loop**：v1 用 executor 外部编排 + 预组装 prompt；v2 在用户对"Agent 自主性"有明确需求时切换

### 4.4 关键照搬点

✅ Skill 文件形态  
✅ Skill 平铺 + 子目录组织  
✅ frontmatter 字段  
✅ scanSkills + parseFrontmatter 实现思路  
✅ 画风/故事类型按子目录扫描  
✅ Agent 调度 sub-Skill 的 system prompt 拼装方式

---

## 5. 改造路线图

**原则：一次一个文件，改完即跑端到端验证，再进下一个。**

### Phase 0：基建（0.5 天）


| 产出             | 路径                                                                  |
| -------------- | ------------------------------------------------------------------- |
| Agent 模板       | `.claude/skills/skill-builder/templates/agent-template.md`          |
| Skill 模板       | `.claude/skills/skill-builder/templates/skill-template.md`（已有，确认对齐） |
| 诊断 checklist   | `plans/skill-agent-diagnostic-checklist.md`                         |
| `/skills/` 子目录 | `review/` `shared/` `art-styles/` `story-genres/` `asset-helpers/`  |
| `/agents/` 目录  | 新建                                                                  |


**验证：** 模板按 skill-builder 自检（9 要素齐 + 反模式 0）。

### Phase 1：业务 Skill 迁移与规范化（2.5-3 天）

#### 1A：Seedance 现有 Skill 迁移（14 个）


| 批次   | 源                                                                                                                          | 目标                                                                                                                                                                                                                                                 | 动作                                                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1A-1 | `.claude/skills/director-skill/`                                                                                           | `/skills/seedance-director-analysis.md`                                                                                                                                                                                                            | 改名 + 单文件化 + 9 要素规范化                                                   |
| 1A-2 | `.claude/skills/seedance-asset/`                                                                                           | `/skills/seedance-asset.md`                                                                                                                                                                                                                        | references/ 内容合并到主 md                                                 |
| 1A-3 | `.claude/skills/asset-{polish, save, generate-image, batch}/`                                                              | `/skills/asset-helpers/{polish, save, generate-image, batch}.md`                                                                                                                                                                                   | 4 个迁入 + 规范化                                                           |
| 1A-4 | `.claude/skills/seedance-director-plan/`                                                                                   | `/skills/seedance-director-plan.md`                                                                                                                                                                                                                | 规范化                                                                   |
| 1A-5 | `.claude/skills/seedance-storyboard-table/`                                                                                | `/skills/seedance-storyboard-table.md`                                                                                                                                                                                                             | 规范化                                                                   |
| 1A-6 | `.claude/skills/seedance-storyboard-skill/`（500+ 行） + Toonflow `data/skills/production_skills/storyboard_*.md`（合计 480 行蓝本） | `/skills/seedance-storyboard-prompt.md`（主） + `/skills/shared/storyboard-prompt-techniques.md`（直接照搬 Toonflow 322 行）+ `/skills/shared/storyboard-table-techniques.md`（直接照搬 Toonflow 158 行）+ `/skills/shared/emotion-face-mapping.md`（从我们 .claude 抽出） | 拆分：主 Skill 走 9 要素；2 份方法论照搬 Toonflow 已有蓝本；emotion-face-mapping 从我们项目抽出 |
| 1A-7 | `.claude/skills/seedance-video/`                                                                                           | `/skills/seedance-video.md`                                                                                                                                                                                                                        | 规范化                                                                   |
| 1A-8 | `.claude/skills/{art-direction-review, script-analysis-review, seedance-prompt-review, compliance-review}-skill/`          | `/skills/review/{art-direction, script-analysis, seedance-prompt, compliance}.md`                                                                                                                                                                  | 4 个迁入 review/ + 规范化                                                   |


#### 1B：剧本链新建 Skill（4 个）

**三方合并源（关键：以 Toonflow data/skills 为基础蓝本，结合 .claude 业务和 prompts.ts 实际取并集）：**


| 新 Skill                         | 源 1：.claude/agents/                  | 源 2：prompts.ts/review-prompts.ts | 源 3：Toonflow 蓝本                            |
| ------------------------------- | ------------------------------------ | -------------------------------- | ------------------------------------------ |
| `/skills/script-skeleton.md`    | scriptAgent-skeleton.md（mode/格式/质量门） | buildSkeletonPrompt              | data/skills/script_execution_skeleton.md   |
| `/skills/script-adaptation.md`  | scriptAgent-adaptation.md            | buildAdaptationPrompt            | data/skills/script_execution_adaptation.md |
| `/skills/script-writing.md`     | scriptAgent-script.md                | buildScriptPrompt                | data/skills/script_execution_script.md     |
| `/skills/script-supervision.md` | scriptAgent-supervisor.md            | review-prompts.ts 全部 5 个函数       | data/skills/script_agent_supervision.md    |


**合并步骤（每个 Skill）：**

1. 读 Toonflow 对应 md 作为骨架
2. 对照 `.claude/agents/scriptAgent-*.md` 业务部分，把我们项目特有的（4 mode / continuity / 6 维度评分）补入
3. 对照 prompts.ts/review-prompts.ts 实际拼装的 prompt，确认 Web 端实际用的字段全部进入 Skill
4. 按 §2.2 规范整理 9 要素 + frontmatter
5. 写入 `/skills/script-*.md`

**严格范围（防时序混乱）：**

- ✅ 仅做：内容合并到 `/skills/`
- ❌ 不改 prompts.ts / review-prompts.ts 代码（函数体保持原样）
- ❌ 不删 `.claude/agents/scriptAgent-*.md`（Phase 3 才删）

**scriptAgent-main 决策 prompt 处理：** buildChatPrompt + buildExtractParamsPrompt + .claude/agents/scriptAgent-main.md 业务流程 → 直接内嵌到 `/agents/scriptAgent-main.md`（Phase 2-5），不建独立 Skill。

**1B-Q4：剧本 3 个 Skill 加"故事类型加载"逻辑（Q4=A 决策的实施位置）：**

按 §1.2.5 完善点 4 的扩展决策，在 `/skills/script-skeleton.md`、`/skills/script-adaptation.md`、`/skills/script-writing.md` 三个 Skill 文件中明确写入故事类型加载逻辑。

**具体写在每个 Skill 的 `[工作流程]` 第 1 步：**

```markdown
## [工作流程]

1. **加载叙事手法**（如有故事类型）：
   - agent-runtime 已通过 `loadSkillPack({ storyGenre })` 注入 `/skills/story-genres/{genre}/director_skills/director_planning_narrative.md`
   - 优先采用故事类型的"主题立意 / 情感节奏 / 场景情绪"建议
   - 如无故事类型（用户 description 未填"小说类型"字段），使用通用叙事节奏
2. **依赖检测**：...（原有内容）
3. ...
```

**对应的 Agent 配套修改（Phase 2 一并做）：** scriptAgent-skeleton / scriptAgent-adaptation / scriptAgent-script 三个 Agent 的 frontmatter 中增加：

```yaml
attached_skills: [story-genres/{用户选定故事类型}/director_skills/director_planning_narrative]
```

（v1 这是文档字段；agent-runtime.ts 在加载 Agent 时识别 storyGenre 后自动 loadSkillPack 注入）

#### 1C：画风包批量迁移（9 个画风，最关键扩充）

**1C-1：现有画风沿用（1 个）**

- 已迁入 `skills/art-styles/3d-guoman/`（保留与现有 novels/ 数据兼容性，已有项目继续可用）
- 给 prefix.md / art_character.md 等补 frontmatter（metaData: art_skills）
- 新建 director_skills/ 子目录（v1 可空，从 Toonflow 3D_chinese_traditional 复用作为初始内容）

**1C-2：从 Toonflow 批量迁入剩余 8 个画风**

```bash
# 从 Toonflow-app 批量复制
TOONFLOW_ART=/Users/baodongdong/Desktop/study/agent_novels/web/Toonflow-app/data/skills/art_skills

cp -r $TOONFLOW_ART/3D_chinese_traditional/    skills/art-styles/3D_chinese_traditional/
cp -r $TOONFLOW_ART/3D_anime_render/            skills/art-styles/3D_anime_render/
cp -r $TOONFLOW_ART/3D_clay_stopmotion/         skills/art-styles/3D_clay_stopmotion/
cp -r $TOONFLOW_ART/2D_chinese_guofeng/         skills/art-styles/2D_chinese_guofeng/
cp -r $TOONFLOW_ART/2D_90s_japanese_anime/      skills/art-styles/2D_90s_japanese_anime/
cp -r $TOONFLOW_ART/2D_flat_design/             skills/art-styles/2D_flat_design/
cp -r $TOONFLOW_ART/2D_mature_urban_romance/    skills/art-styles/2D_mature_urban_romance/
cp -r $TOONFLOW_ART/realpeople_ancient_chinese/ skills/art-styles/realpeople_ancient_chinese/
cp -r $TOONFLOW_ART/realpeople_urban_modern/    skills/art-styles/realpeople_urban_modern/
```

**1C-3：每个画风目录的统一规范化**

对每个画风目录（共 9 个）执行：

1. 修正拼写：`driector_skills/` → `director_skills/`（Toonflow 的拼写错误）
2. 给 prefix.md 补 frontmatter（metaData: art_skills, depends_on: []）
3. 给 art_prompt/ 下每个 md 补 frontmatter
4. 给 director_skills/ 下每个 md 补 frontmatter（metaData: art_skills, depends_on: []）
5. 验证 README.md 存在；不存在则从 prefix.md 头部提炼简介

**1C-4：Web 代码引用同步**

- Web 运行时代码统一读取 `skills/art-styles/`
- 前端在 description 中允许填写：3D国漫 / 国风二次元 / 90 年代日漫 / 平面设计 / 都市言情写实2D / 3D 动画 / 黏土定格 / 古装真人 / 都市真人
- 字符串到目录名的映射表写入 `web/app/lib/skill-loader.ts` 的 `mapArtStyleToDir(text: string): string` 函数
- 跑 Seedance 流程，至少用 2 个不同画风测试（如 3d-guoman + 3D_clay_stopmotion）确认资源加载无误

**1C-5：清理**

- 旧 config 画风目录已删除，画风模板统一维护在 `skills/art-styles/`

#### 1D：废弃 Skill 下架

```bash
rm -rf .claude/skills/{art-design-skill, seedance-art-skill, seedance-image}/
```

前置：grep 确认 `web/` 下无硬编码引用。

#### 1E：故事类型包批量迁入（12 个，新增阶段）

**1E-1：从 Toonflow 批量复制**

```bash
TOONFLOW_STORY=/Users/baodongdong/Desktop/study/agent_novels/web/Toonflow-app/data/skills/story_skills

cp -r $TOONFLOW_STORY/Sweet_romance_novel/      skills/story-genres/Sweet_romance_novel/
cp -r $TOONFLOW_STORY/Xianxia_fantasy/          skills/story-genres/Xianxia_fantasy/
cp -r $TOONFLOW_STORY/Urban_workplace_drama/    skills/story-genres/Urban_workplace_drama/
cp -r $TOONFLOW_STORY/Hot_blooded_action/       skills/story-genres/Hot_blooded_action/
cp -r $TOONFLOW_STORY/Mystery_thriller/         skills/story-genres/Mystery_thriller/
cp -r $TOONFLOW_STORY/Horror_supernatural/      skills/story-genres/Horror_supernatural/
cp -r $TOONFLOW_STORY/Comedy_humor/             skills/story-genres/Comedy_humor/
cp -r $TOONFLOW_STORY/Family_warmth/            skills/story-genres/Family_warmth/
cp -r $TOONFLOW_STORY/Coming_of_age/            skills/story-genres/Coming_of_age/
cp -r $TOONFLOW_STORY/Historical_epic/          skills/story-genres/Historical_epic/
cp -r $TOONFLOW_STORY/Psychological_drama/      skills/story-genres/Psychological_drama/
cp -r $TOONFLOW_STORY/Scifi_post_apocalypse/    skills/story-genres/Scifi_post_apocalypse/
```

**1E-2：每个故事类型目录的规范化**

1. 修正拼写：`driector_skills/` → `director_skills/`
2. 给 director_skills/director_planning_narrative.md 补 frontmatter（metaData: story_skills, depends_on: []）
3. 给 director_skills/director_storyboard_table_narrative.md 补 frontmatter

**1E-3：字符串映射**

`web/app/lib/skill-loader.ts` 增加 `mapStoryGenreToDir(text: string): string`：

```typescript
const STORY_GENRE_MAP: Record<string, string> = {
  '甜宠': 'Sweet_romance_novel', '言情': 'Sweet_romance_novel', '甜宠言情': 'Sweet_romance_novel',
  '仙侠': 'Xianxia_fantasy', '玄幻': 'Xianxia_fantasy', '修仙': 'Xianxia_fantasy',
  '都市': 'Urban_workplace_drama', '职场': 'Urban_workplace_drama',
  '热血': 'Hot_blooded_action', '动作': 'Hot_blooded_action',
  '悬疑': 'Mystery_thriller', '推理': 'Mystery_thriller',
  '恐怖': 'Horror_supernatural', '灵异': 'Horror_supernatural',
  '喜剧': 'Comedy_humor', '搞笑': 'Comedy_humor',
  '家庭': 'Family_warmth', '亲情': 'Family_warmth',
  '青春': 'Coming_of_age', '校园': 'Coming_of_age', '成长': 'Coming_of_age',
  '历史': 'Historical_epic', '古风': 'Historical_epic',
  '心理': 'Psychological_drama',
  '科幻': 'Scifi_post_apocalypse', '末日': 'Scifi_post_apocalypse',
};
```

**1E-4：验证**

跑 Seedance 流程，用 2 个不同故事类型测试（如 Sweet_romance_novel + Hot_blooded_action）确认导演技法资源能正确加载到 system prompt。

#### 1F：seedance-asset Skill 增补「衍生资产」能力

**修改对象：** `/skills/seedance-asset.md`（Phase 1A-2 已完成主体迁移）

**修改内容：** 在 [核心知识层] 节增补「衍生资产识别规则」（直接照抄 Toonflow `production_execution_derive_assets.md` 的"提取规则"节）：

```markdown
### 衍生资产识别规则

> 衍生资产 = 父资产的视觉状态变体（"{父资产名}·{状态名}"），不是独立物件。
> 只衍生图片模型无法仅凭提示词稳定处理、且能在多个镜头复用的资产级视觉差异。

**衍生类型参考：**

| 资产类型 | 典型衍生 | 示例 |
|---------|---------|------|
| 角色 | 服装变体、结构性特征变体 | 常服→礼服、变身/异化、缺手/缺脚 |
| 道具 | 损坏、激活/发光、变形 | 破损断裂、发光激活、展开/碎裂 |
| 场景 | 时间变体、破坏状态、氛围变体 | 夜景版、战后废墟、雨天/雪天 |

**规则：**
- 角色默认基准态 = 基础打底（白色背心+内裤）；剧本中出现明确穿着时补"服装类衍生"
- 表情/情绪/局部特写/瞬时动作 → 不衍生（提示词解决）
- 服装变体 / 结构性外形改变 / 道具状态变化 / 场景氛围变体 → 衍生
- 每个父资产 1~5 个衍生，宁缺勿滥
```

在 [工作流程] 节增加步骤：

```markdown
3. 识别衍生资产：对每个主资产，按"衍生资产识别规则"提取 1~5 个衍生
4. 写入 manifest.json：每个父资产下挂 derive 数组
   - { id: 'role-001-formal', name: '白衣礼服', desc: '...', type: 'role-derive' }
```

**修改对象：** `web/app/lib/novels.ts` 中 `assets/manifest.json` 的类型定义增加 `derive: AssetDerive[]` 字段。

**修改对象：** 所有 9 个画风的 `art_prompt/` 下已有 `art_character_derivative.md` / `art_scene_derivative.md` / `art_prop_derivative.md`（Toonflow 已提供），seedance-asset 在生成衍生资产参考图时按 type 加载对应模板。

**1A/1B/1C 通用改造步骤：**

1. 读原文件（含所有源）
2. 按 §2.2 规范生成新 Skill md
3. 补 metaData / version / depends_on
4. 清理反模式（[硬约束] → [第一性原则]；[文件结构] 节并入 references）
5. 在 [输出格式] 节明确给出 XML 包裹示例 + meta 注释
6. 写入目标路径
7. 跑端到端：选一个 novel 一集，新 Skill 注入 LLM → 输出 novels/ 文件结构与原实现等价

### Phase 2：业务 Agent 迁移与规范化（1.5-2 天）


| 批次  | Agent                                      | 目标                                         | 备注                                       |
| --- | ------------------------------------------ | ------------------------------------------ | ---------------------------------------- |
| 2-1 | director / storyboard-artist               | `/agents/{director, storyboard-artist}.md` | 结构最接近规范，先动                               |
| 2-2 | scriptAgent-supervisor                     | `/agents/scriptAgent-supervisor.md`        | 监督层简单                                    |
| 2-3 | seedance-main                              | `/agents/seedance-main.md`                 | 决策层                                      |
| 2-4 | scriptAgent-{skeleton, adaptation, script} | `/agents/scriptAgent-*.md`                 | 业务最重，瘦身为薄壳（业务已迁到 Skill）                  |
| 2-5 | scriptAgent-main                           | `/agents/scriptAgent-main.md`              | 决策 prompt 内嵌（chat / extract_params / 调度） |


**改造步骤：**

1. 按 §2.3 规范生成 Agent md（6 节 + frontmatter）
2. [任务] — 提炼使命（2-3 句）
3. [角色] — 铁律 + 边界
4. [前置条件] — caller 必传 packet 字段
5. [工作流程] — 4 步骨架（签收 → 校验 → 调 Skill → 异常）
6. [输出规范] — status / stage_reached / failure_count 字段约定
7. frontmatter — version / skills / attached_skills / model / tools / color
8. 端到端验证

**特殊处理：**

- storyboard-artist.md 末尾的 Persistent Agent Memory 规范 → 删除
- scriptAgent-main：决策 prompt 内嵌（含 buildChatPrompt + buildExtractParamsPrompt + .claude/agents/scriptAgent-main.md 业务流程），按 packet.action 分派（chat / extract_params）
- director：[工作流程] 写明 packet.action 分派（analyze / review_script / review_art / review_prompt / review_compliance）

### Phase 3：`.claude/` 业务清理（0.5 天）

**前置检查（5 项必须全过）：**

1. ✅ Phase 1 完成：`/skills/` 22 个 + 画风包就位
2. ✅ Phase 2 完成：`/agents/` 8 个就位
3. ✅ Phase 4 完成：executor.ts 的 buildXxx → runAgent
4. ✅ 代码引用扫描清零：`grep -r "scriptAgent-\|director-skill\|seedance-asset\|\.claude/agents\|\.claude/skills" web/` 返回 0
5. ✅ 文档引用更新：docs/ 下所有 `.claude/agents/` `.claude/skills/` → `/agents/` `/skills/`

**删除：**

```bash
# 业务 Agent（9 个）
rm .claude/agents/{art-designer, scriptAgent-main, scriptAgent-skeleton, scriptAgent-adaptation, scriptAgent-script, scriptAgent-supervisor, director, storyboard-artist, seedance-main}.md

# 业务 Skill（17 个）
rm -rf .claude/skills/{director-skill, seedance-asset, seedance-director-plan, seedance-storyboard-table, seedance-storyboard-skill, seedance-video, asset-polish, asset-save, asset-generate-image, asset-batch, art-direction-review-skill, script-analysis-review-skill, seedance-prompt-review-skill, compliance-review-skill, art-design-skill, seedance-art-skill, seedance-image}
```

**验证：**

- `.claude/skills/` 剩 20 个（19 web-* + skill-builder）
- `.claude/agents/` 剩 7 个 web-*
- Web UI 跑剧本三阶段 + Seedance 五阶段全通过

### Phase 4：Web 后端加载层开发（拆 4a / 4b / 4c）

> **重要：** Phase 4 原本被笼统描述为"Web 后端加载层"。基于 §0.4 现状真相，必须拆为三个性质不同的子阶段：
>
> - **4a** — 加载层基建 + 剧本链 buildXxx → runAgent 替换（A 真外置）
> - **4b** — Seedance 在 Web 端编排实现（B 新功能开发，依赖 Q1 用户决策为"是"）
> - **4c** — v2 评估项落实（C 范围，本计划不实做）

#### Phase 4a：加载层基建 + 剧本链替换（2.5 天，含 stripThink）

##### 4a-1：实现 `skill-loader.ts`（约 200 行）

**关键依赖：**

```bash
cd web && npm install gray-matter is-path-inside fast-glob
```

**实现：**

- `loadAllSkills()`：启动时 `fast-glob('/skills/**/*.md')`，解析 frontmatter，构建 `Map<name, Skill>`
- `loadSkill(name)`：按名查 Map，递归解析 depends_on
- `listSkillsByMeta(tag)`：按 metaData 筛选
- `loadSkillPack({ artStyle, storyGenre, stage })`：按阶段筛选画风/故事类型资源
- `mapArtStyleToDir(text: string)`：description 中文 → 目录名映射（10 个画风）
- `mapStoryGenreToDir(text: string)`：description 中文 → 目录名映射（12 个故事类型）
- 路径越界保护：`isPathInside(filePath, skillsRoot)`

**验证：** 写 unit test，覆盖 22 个 Skill + 9 画风 + 12 故事类型全部能加载 + frontmatter 解析正确 + depends_on 递归无环。

##### 4a-2：实现 `agent-runtime.ts`（约 200 行） + `strip-think.ts`（约 80 行）

**实现 agent-runtime.ts：**

- `loadAgent(name)`：读 `/agents/<name>.md`，解析 frontmatter + 6 节
- `resolveStageForAgent(agentName, action)`：静态映射表 + action 分流
- `runAgent({ agentName, packet, signal })`：按 §2.4.2 流程实现
- 在流处理中**必须接入 createThinkStreamFilter**（防 DeepSeek R1 等思考模型输出污染）

**实现 strip-think.ts（新增，对应 §3.4 修正方案）：**

- 照搬 Toonflow `src/utils/stripThink.ts`
- 提供 `stripThink(text)` 非流式 API
- 提供 `createThinkStreamFilter()` 流式有状态过滤器（处理 chunk 边界切断 `<think>` 标签）

**验证：**

- 写 unit test，覆盖 8 个 Agent 全部能加载 + packet 校验正确 + stage 映射正确
- strip-think.ts 单元测试：完整 think 块 / 跨 chunk 边界 / 嵌套 / 残留 buffer 4 种场景
- 集成测试：mock DeepSeek R1 风格输出（含 `<think>...</think>`），runAgent 返回的 output 无残留

##### 4a-3：改造剧本链 `executor.ts`

**先行验证：** 先改 `scriptAgent-skeleton` 一个样板：

1. 找到 `executeSkeleton` 函数中的 `buildSkeletonPrompt(...)` 调用
2. 替换为 `runAgent({ agentName: 'scriptAgent-skeleton', packet: {...} })`
3. 跑端到端，确认 novels/{name}/skeleton/ 产出与改造前结构等价
4. 等价后再展开剩余调用

**剧本链完整替换（共 10 处）：**

- `executeChat` → scriptAgent-main(action=chat)
- `executeConfigCollection` → scriptAgent-main(action=extract_params)
- `executeSkeleton` → scriptAgent-skeleton
- `executeAdaptation` → scriptAgent-adaptation
- `executeScript` → scriptAgent-script
- `runReview('skeleton', ...)` → scriptAgent-supervisor(action=review_skeleton)
- `runReview('adaptation', ...)` → scriptAgent-supervisor(action=review_adaptation)
- `runReview('storyline', ...)` → scriptAgent-supervisor(action=review_storyline)
- `runReview('outline', ...)` → scriptAgent-supervisor(action=review_outline)
- `runReview('script', ...)` → scriptAgent-supervisor(action=review_script)

**executor.ts 保留不动：** fix 重试循环、数据写入、SSE 事件、mode 判断、章节范围验证、extractXml/extractScriptItem。

##### 4a-4：清空 prompts.ts 和 review-prompts.ts

**第一步（推荐）：保留 wrapper 一个月灰度**

```typescript
// prompts.ts
export async function buildSkeletonPrompt(...) {
  console.warn('[deprecated] buildSkeletonPrompt is replaced by runAgent');
  return [...]; // 兼容签名，executor.ts 已不再调用
}
```

**第二步：一个月稳定后**直接删除两个文件。

##### 4a-5：补 review fix 循环 2 轮限制（Q3=A 必做，0.2 天）

**实地查证：** `web/app/lib/agent/executor.ts:executeFixByType` 当前**没有轮数计数**，每次用户点"修复"按钮都会无限重跑。

**实施方案 A（推荐）：在 executor 内加计数器**

- 计数文件：`novels/{name}/reviews/fix-count.json`，schema：`{ "skeleton": 0, "adaptation": 0, "script-ep1": 0, ... }`
- executeFixByType 调用前读取计数，超过 2 轮则 `send({ type: 'error', data: '已达修复轮数上限（2 轮），请人工介入或调整 prompt' })` 并 return
- 每次 fix 成功后计数 +1
- review 通过（status='pass'）时清零

**实施位置：** `web/app/lib/agent/executor.ts:executeFixByType` 函数体首行加 8 行检查代码 + 末尾 4 行计数更新。

#### Phase 4b：Seedance 在桌面应用里编排实现（新功能，3.3 天）

> **依赖 Q1 用户拍板为"是"。如果 Q1 选"否"，则跳过整个 Phase 4b，本计划只外置 Seedance Skill 文件，不实现 Web 端五阶段编排。**

##### 4b-1：新增 `web/app/lib/agent/seedance-executor.ts`（约 600 行）

**参照来源：**

- Toonflow `src/agents/productionAgent/index.ts`（238 行）— 5 个 sub-agent 串行调度框架
- `.claude/agents/seedance-main.md`（现有 245 行）— 5 阶段编排业务逻辑
- 当前 `web/app/lib/agent/executor.ts` 的 SSE 事件 + 数据写入风格 — 保持一致

**核心结构：**

```typescript
export async function* executeSeedanceFlow(params: {
  projectName: string;
  episode: number;
  fromStage: 'A' | 'B' | 'C1' | 'C2' | 'C3' | 'D';  // 从哪个阶段开始
  toStage: 'A' | 'B' | 'C1' | 'C2' | 'C3' | 'D';    // 到哪个阶段停止
  languageModelId?: string;                          // 当前 UI 选择的语言模型
  imageModelId?: string;                             // 当前 UI 选择的图像模型
  videoModelId?: string;                             // 当前 UI 选择的视频模型
  signal?: AbortSignal;
}): AsyncGenerator<SSEEvent> {

  // A 阶段：导演分析
  if (shouldRun('A', fromStage, toStage)) {
    yield { type: 'status', data: 'A 阶段：导演分析中...', agentLabel: '导演' };
    const result = await runAgent({
      agentName: 'director',
      packet: { projectName, episode, action: 'analyze', modelOverride: languageModelId },
      signal,
    });
    if (result.status !== 'passed') { yield { type: 'error', data: ... }; return; }
    await saveSeedanceDirector(projectName, episode, result.output);
    yield { type: 'content_saved', data: JSON.stringify({ type: 'seedance-director', episode }) };
  }

  // B 阶段：资产管理（含衍生资产识别）
  if (shouldRun('B', fromStage, toStage)) {
    yield { type: 'status', data: 'B 阶段：资产提取中...' };
    const result = await runAgent({ agentName: 'seedance-main', packet: { ..., stage: 'B' } });
    // ... 调用 asset-helpers/{polish, generate-image, save, batch}
    await saveSeedanceManifest(projectName, episode, result.output);
  }

  // C1 阶段：导演规划
  if (shouldRun('C1', fromStage, toStage)) { ... }
  // C2 阶段：分镜表
  if (shouldRun('C2', fromStage, toStage)) { ... }
  // C3 阶段：分镜提示词
  if (shouldRun('C3', fromStage, toStage)) { ... }
  // D 阶段：视频生成
  if (shouldRun('D', fromStage, toStage)) { ... }
}
```

##### 4b-2：新增 API 路由 `web/app/api/seedance/`


| 路由                     | 方法   | 功能                                                                     |
| ---------------------- | ---- | ---------------------------------------------------------------------- |
| `/api/seedance/start`  | POST | 入参：projectName/episode/fromStage/toStage；返回 SSE 流（executeSeedanceFlow） |
| `/api/seedance/status` | GET  | 入参：projectName/episode；返回当前各阶段完成状态                                     |
| `/api/seedance/fix`    | POST | 入参：projectName/episode/stage/feedback；重跑指定阶段                           |


##### 4b-3：novels.ts 增强（含 manifest schema 冻结）

**前置（必做）：** 按 §1.2.5 完善点 1 末尾「数据层 Schema 冻结」定义的 manifest.json 新 schema 实施（含 derive 数组字段）。

补充 setter / getter 函数：

- `saveSeedanceDirector(name, ep, content)` 写入 `seedance/ep{N}/01-director.md`
- `saveSeedanceManifest(name, ep, manifest)` 写入 `seedance/ep{N}/manifest.json`（**新 schema：含 derive 数组**）
- `getSeedanceManifest(name, ep)` 读 `seedance/ep{N}/manifest.json`（**当前不存在，新增；getSeedanceAssets 读的是 assets.json，路径不同**）
- `saveSeedanceDirectorPlan(name, ep, plan)` 写入 `seedance/ep{N}/02-director-plan.json`
- `saveSeedanceStoryboardTable(name, ep, table)` 写入 `seedance/ep{N}/03-storyboard-table.json`
- `saveSeedancePrompts(name, ep, prompts)` 写入 `seedance/ep{N}/04-prompts.md`

##### 4b-3.5：Seedance 任务记录 tasks.jsonl（参照 Toonflow taskRecord，0.3 天）

**问题：** Phase 4b 五阶段串行编排（A→B→C1→C2→C3→D）需要"展示进度条 / 失败重试 / 错误溯源"能力。Toonflow 用 `o_task` 表记录每次 AI 调用，我们当前 novels/ 下无此能力。

**实施：** 新增 `web/app/lib/agent/task-record.ts`（约 80 行），追加写 `novels/{name}/seedance/ep{N}/tasks.jsonl`：

```jsonl
{"id":"t-001","stage":"A","agent":"director","action":"analyze","model":"deepseek-v4-pro","status":"complete","startTime":1714123456,"endTime":1714123502,"durationMs":46000}
{"id":"t-002","stage":"B","agent":"seedance-main","action":"asset","model":"deepseek-v4-pro","status":"failed","reason":"API_TIMEOUT","retryAttempt":1}
{"id":"t-003","stage":"B","agent":"seedance-main","action":"asset","model":"deepseek-v4-pro","status":"complete","retryAttempt":2}
```

**用途：**

- Phase 4b API `/api/seedance/status` 直接读 tasks.jsonl 返回进度
- Phase 4b API `/api/seedance/fix` 读最近一条失败任务的 stage，重跑该 stage
- 用户在桌面应用看到的"哪一阶段卡住了/失败了/正在跑"

##### 4b-4：D 阶段视频生成对接

- `web/app/lib/agent/seedance-video.ts` — 调用当前 UI 选择的视频模型配置（`videoModelId`），缺省时使用第一个启用视频模型
- 参照 Toonflow 的 vendor 模式，但简化：直接 fetch 调用，不做 vendor 热加载
- 任务异步：发起后返回 task_id，定期 poll 状态写入 `seedance/ep{N}/videos/{shotId}.mp4`

##### 4b-5：UI 入口（可放下个迭代）

v1 可以先用 API 调用 + curl 测试通过，UI 入口（projects/[name]/seedance/page.tsx）放在内容生成层稳定后再做。

##### 4b-6：验证

- 取一个现有 novels/{name}/scripts/ep1.md 完整数据
- 调 `/api/seedance/start` from='A' to='C3'，跑通 A→B→C1→C2→C3 五阶段
- 对比 Web 端产出结构，确认 A/B/C1/C2/C3 文件齐全、Schema 合规、下游可继续执行
- D 阶段视频生成单独验证（依赖 seedance-2.0 API key）

#### Phase 4d：模型选择单一来源清理（2026-04-27 修订，0.5 天）

**问题（2026-04-27 用户确认）：** 当前产品交互已经是“用户在页面选择模型”。继续保留 `stage-bindings.json` 会形成第二套状态源：用户选择了 A 模型，但运行时可能按 stage 绑定调用 B 模型，体验不可解释。

**实施：**

- 移除 settings 中的阶段绑定面板，不再引导用户维护 stage → modelId
- 移除 `/api/settings/stage-bindings` 前后端入口，`config/stage-bindings.json` 保留为空对象作为废弃占位
- `resolveModel(stage, override)` 改为 `resolveModel(_, selectedModelId)`：只解析请求传入的当前选择模型，未传时取第一个 enabled 语言模型
- `ContentWorkbench`、`ProductionChatPanel`、资产批量润色/生成、Seedance A/C 阶段都必须把当前选择的 modelId 传入后端
- 图像 / 视频阶段同理通过 `imageModelId` / `videoModelId` 传入，不通过 stage 名查配置

**2026-04-27 执行结果：**

- 已删除 settings 阶段绑定组件、阶段绑定 API、CLI 状态组件、CLI 状态 API
- 已移除 `claude-cli` 内置注入、`streamCLI` / `spawn claude -p` 调用路径、Agent frontmatter/template 中的默认模型字段
- `config/stage-bindings.json` 已清空为 `{}`，避免历史 stage → modelId 值继续误导运行时或人工排查
- 语言模型流式调用保留 API 单一路径，并补充 Anthropic Messages API 与 OpenAI 兼容协议分流

**为什么必做：** “任意模型切换”的产品承诺应该由用户当前选择直接兑现，而不是隐藏 JSON。减少一个状态源后，调试、测试、用户理解都会简单很多。

#### Phase 4e：v2 评估项（本计划不实做，仅文档化）


| 项目                            | 实做工期    | 触发条件                                 |
| ----------------------------- | ------- | ------------------------------------ |
| 5 种 mode 在桌面应用支持              | 1.5-2 天 | 用户提需求"我想增量改某一集"或"全量重写故事线"            |
| 显式模型路由策略                       | 0.5-1 天 | 用户提需求"不同任务自动选择不同模型"，且需要覆盖当前选择 |
| vendor 热加载（照搬 Toonflow vm.ts） | 2 天     | 用户提需求"我想接入新的国产模型供应商，OpenAI 兼容协议覆盖不了" |
| Memory 三层持久化（短期+摘要+RAG）       | 1.5 天   | 用户反馈"AI 不记得上次说过的事"                   |


### Phase 5：CLAUDE.md 瘦身（0.5 天）

**目标：** `.claude/CLAUDE.md` 只管 Web 项目的开发流程，不含任何业务注册表。

**节结构：**

```
[角色]              — Claude Code 主助手身份（Web 开发助理）
[任务]              — 把用户 Web 开发需求变成可运行代码
[全局原则]          — 中文 / 不假完成 / 不沉默 / 禁直接编辑 web/ 下代码
[Web Skill 注册表]  — 19 个 web-* Skill + skill-builder
[Web Agent 注册表]  — 7 个 web-* Agent
[Web 任务路由]      — 新功能 / Bug 修复 / 例外
[业务入口指针]      — 一句话：业务在 /skills/ /agents/，由 Web UI 驱动
[初始化流程]        — 一致性检查 + 开场白
```

**关键删除：**

- ❌ Seedance 任务路由
- ❌ 剧本三阶段说明
- ❌ ~sd 指令列表
- ❌ 业务 Agent / Skill 注册表
- ❌ Hook 契约（项目无 Hook）

### Phase 6：回归 + 文档（1 天）

#### 6.1 剧本全链路回归

新建测试 novel：

1. 项目初始化（确认 6 个参数）
2. 阶段 1：骨架 → 审核（A 等级）→ 通过
3. 阶段 2：改编策略 → 审核 → 通过
4. 阶段 3：剧本编写（1 集）→ 审核 → 通过
5. 验证 novels/{name}/ 下文件结构

#### 6.2 Seedance 全链路回归

同 novel：

1. Web 制作面板选择语言 / 图像 / 视频模型 → A → B → C1 → C2 → C3 → D
2. 验证 novels/{name}/seedance/ep1/ 下产出齐全

#### 6.3 跨模型回归（核心）

1. 在工作台模型选择器中切换到 `deepseek-r1`（或 Kimi / Claude 官方 API 模型）
2. 跑骨架生成（核心阶段）
3. 确认 LLM 输出 XML 包裹 + meta 注释能正确解析
4. 切换到第二个 API 模型，对比结构等价

#### 6.4 画风 + 故事类型组合抽样回归（新增）

新建 4 个测试 novel，覆盖典型组合：


| 测试 # | 画风                      | 故事类型                  | 验证重点               |
| ---- | ----------------------- | --------------------- | ------------------ |
| 1    | 3D_chinese_traditional  | Xianxia_fantasy       | 仙侠 3D 主流组合         |
| 2    | 2D_chinese_guofeng      | Sweet_romance_novel   | 国风 2D + 甜宠（不同风格组合） |
| 3    | realpeople_urban_modern | Urban_workplace_drama | 真人都市职场（无幻想元素）      |
| 4    | 3D_clay_stopmotion      | Comedy_humor          | 黏土喜剧（小众组合验证健壮性）    |


**验证标准：**

- skill-loader 能正确从 description 字段解析画风和故事类型 → 映射到目录
- agent-runtime 在 C1/C2/C3 阶段加载到画风的 director_skills/ + 故事类型的 director_skills/
- 生成的 seedance-director-plan / storyboard-table / storyboard-prompt 的 LLM 输出中能看到画风/故事类型技法的影响（如 Sweet_romance 输出多"留白"、Hot_blooded 输出多"快切"）
- 切换画风/故事类型后再生成同集，输出风格有可观察的差异

#### 6.4 文档更新


| 文档                          | 更新内容                                                 |
| --------------------------- | ---------------------------------------------------- |
| `docs/content-pipeline.md`  | 路径引用改 `/skills/` `/agents/`                          |
| `docs/seedance-pipeline.md` | 同上                                                   |
| `docs/data-layer.md`        | 补充"生成用的 Skill 源在 /skills/，画风资源在 /skills/art-styles/" |
| `docs/web-pipeline.md`      | Web 开发 CLAUDE.md 新格式说明                               |


#### 6.5 skill-builder 补规则

`.claude/skills/skill-builder/SKILL.md` 增加：

> 创建新业务 Skill 时必须放在 `/skills/`（不是 `.claude/skills/`），并按 9 要素规范 + frontmatter 字段约定。

---

## 6. 工作量估算


| Phase                                                   | 工作量       | 可并行      | 必做 / 可选         |
| ------------------------------------------------------- | --------- | -------- | --------------- |
| 0 基建                                                    | 0.5 天     | 否        | 必做              |
| **1 Skill 迁移（合计 4 天）**                                  |           |          |                 |
| ├─ 1A Seedance 现有 Skill 迁移（14 个）                        | 1 天       | 批次内可并行   | 必做              |
| ├─ 1B 剧本 Skill 三方合并新建（4 个）+ Q4 故事类型加载                   | 1 天       | 否        | 必做              |
| ├─ 1C 画风包批量迁移（9 个）                                      | 1 天       | 9 个画风可并行 | 必做              |
| ├─ 1D 废弃 Skill 下架                                       | 0.2 天     | —        | 必做              |
| ├─ 1E 故事类型包批量迁移（12 个）                                   | 0.5 天     | 12 个并行   | 必做              |
| └─ 1F seedance-asset 衍生资产能力增补                           | 0.3 天     | 否        | 必做              |
| 2 Agent 迁移（8 个）                                         | 2 天       | 不建议      | 必做              |
| **4a 加载层基建 + 剧本链替换 + stripThink + fix 2 轮限制**           | **2.5 天** | 否        | **必做（A 真外置）**   |
| **4b Seedance 桌面应用编排（含 manifest schema + tasks.jsonl）** | **3.3 天** | 否        | **必做（Q1=A 决定）** |
| **4d 模型选择单一来源清理**                                | **0.5 天** | 否        | **必做（2026-04-27 修订）** |
| 4e v2 评估项                                               | —         | —        | 不实做             |
| 3 `.claude/` 业务清理（**移到 4 之后**）                          | 0.5 天     | 否        | 必做              |
| 5 CLAUDE.md 瘦身                                          | 0.5 天     | 否        | 必做              |
| 6 回归 + 文档（含 9 画风 × 12 故事类型抽样）                           | 1.5 天     | 否        | 必做              |


**Phase 顺序修正（重要！）：** Phase 3（`.claude/` 业务清理）原本放在 Phase 2 之后，但其前置条件 5 项要求"Phase 4 已完成 buildXxx → runAgent 替换 + Web grep 引用清零"。**因此 Phase 3 必须移到 Phase 4d 之后**（Phase 4 全跑通且代码引用确认清零后才能动 `.claude/`）。

**最终工期合计：**

```
0.5 + 4 (Phase 1) + 2 (Phase 2) + 2.5 (Phase 4a) + 3.3 (Phase 4b) + 0.5 (Phase 4d) + 0.5 (Phase 3) + 0.5 (Phase 5) + 1.5 (Phase 6)
= 15.3 天
```

**最终工期：约 15 天（含全部修正）**

> 比第一版估算（13.5-15 天）增加 0.3 天，主要来自：stripThink 补充（+0.3 天，已并入 Phase 4a）、tasks.jsonl 任务记录（+0.3 天，已并入 Phase 4b）、模型选择单一来源清理（+0.5 天 = Phase 4d）、fix 2 轮限制（+0.2 天，已并入 Phase 4a）。**Phase 4d 已从 stage-bindings UI 改为去绑定化清理。**

---

## 7. 风险与缓解


| 风险                                 | 缓解                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| 业务行为等价性破坏                          | 每个 Skill/Agent 改完立即端到端跑；保留 git diff 3 分钟回滚                                                      |
| prompt 合并漏要点（三方合并易丢字段）             | 每个 1B Skill 用"diff 对照表"逐字段核对 Toonflow / .claude / prompts.ts 三方源                                |
| seedance-storyboard-skill 拆分出错     | 先写 outline 分离方法论/红线/映射；再按 outline 切文件；保留原文件作为 references                                        |
| Web 后端 runAgent 接口不稳               | Phase 4-3 先做 scriptAgent-skeleton 一个样板，跑通端到端再展开                                                 |
| 画风模板迁移后 Web 代码硬编码失效 | Phase 1C 执行前 grep；改完 Seedance 流程跑通确认                                                            |
| prompts.ts 清空后其他地方引用失败             | Phase 4-4 保留 wrapper 一个月灰度；监控报错后再删                                                              |
| 跨模型 XML 输出不稳定（小模型可能输出格式错）          | Phase 6.3 实测；Skill [输出格式] 节加强约束（"严格按格式，不输出额外内容"）；agent-runtime 容错处理                             |
| 国产模型思考模式 token 暴涨                  | stream-model.ts 已有 stripThink 处理；必要时在模型选择器中选择非思考版本或在模型配置中关闭 reasoning |


---

## 8. 验证标准（端到端"通过"的定义）

LLM 输出天然不稳定，**不能比字节**。验证口径：


| 维度        | 标准                                             |
| --------- | ---------------------------------------------- |
| 文件结构      | novels/{name}/ 下文件数量、路径、命名 — 与改造前一致            |
| Schema 合规 | md 文件含规定元信息字段；JSON 文件通过 schema 校验              |
| 内容长度      | 同类产出文件长度在 ±30% 区间内（骨架 ~200 字、全局 ~500 字等）       |
| 关键段落      | 剧本开头有集名、集末有钩子；骨架三幕结构存在；审核报告含 6 维度评分            |
| 无功能丢失     | Web UI 能正常显示产出；下游能继续跑下一阶段                      |
| 跨模型       | 至少 2 个 API 模型（如 Claude 官方 API + DeepSeek/Kimi，或 DeepSeek + Kimi）完整跑通骨架 |


**验证通过 ≠ 内容相同**，只验证**结构等价**。

---

## 9. 改造完成的标志

- ✅ `/skills/` 22 个业务 Skill（11 平铺 + 4 review + 3 shared + 4 asset-helpers），其中 seedance-asset 已增补衍生资产识别能力
- ✅ `/skills/art-styles/` **9 个画风**（3d-guoman 沿用 + Toonflow 8 个）共 99 份资源 md
- ✅ `/skills/story-genres/` **12 个故事类型**（全部 Toonflow 迁入）共 36 份资源 md
- ✅ `/skills/shared/` 3 个共享技法（其中 storyboard-prompt-techniques + storyboard-table-techniques 直接照搬 Toonflow 480 行蓝本）
- ✅ `/agents/` 8 个业务 Agent（scriptAgent-main 决策 prompt 内嵌）
- ✅ `.claude/skills/` 只剩 20 个（19 web-* + skill-builder）
- ✅ `.claude/agents/` 只剩 7 个 web-*
- ✅ `.claude/CLAUDE.md` 瘦身完成（8 节 + 2 张 Web 注册表）
- ✅ Web 后端 `skill-loader.ts`（含 mapArtStyleToDir + mapStoryGenreToDir）+ `agent-runtime.ts` 就位
- ✅ `executor.ts` 11 处 `buildXxx` 全部改为 `runAgent`
- ✅ `prompts.ts` / `review-prompts.ts` wrapper 化（一个月后视稳定性删除）
- ✅ 旧 config 画风目录删除（迁入 `/skills/art-styles/`）
- ✅ 剧本三阶段 + Seedance 五阶段端到端回归通过
- ✅ 跨模型实测：至少 2 个 API 模型（Claude 官方 API / DeepSeek / Kimi 等组合）通过
- ✅ 画风 × 故事类型组合抽样回归通过（4 个典型组合：仙侠 3D / 国风甜宠 / 真人都市 / 黏土喜剧）

---

## 附录 A：业务 Skill 完整清单（22 个 + 画风包）

### 平铺层（11 个）


| 文件                                      | metaData        | output_tag        | 对应 Agent                 | 内容来源                                                                                                                  |
| --------------------------------------- | --------------- | ----------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `/skills/script-skeleton.md`            | script_skills   | skeleton          | scriptAgent-skeleton     | `.claude/agents/scriptAgent-skeleton.md` + `prompts.ts:buildSkeletonPrompt` + Toonflow `script_execution_skeleton.md` |
| `/skills/script-adaptation.md`          | script_skills   | adaptation        | scriptAgent-adaptation   | 同上三方合并                                                                                                                |
| `/skills/script-writing.md`             | script_skills   | scriptItem        | scriptAgent-script       | 同上三方合并                                                                                                                |
| `/skills/script-supervision.md`         | script_skills   | reviewReport      | scriptAgent-supervisor   | `.claude/agents/scriptAgent-supervisor.md` + `review-prompts.ts` 全部 5 函数 + Toonflow `script_agent_supervision.md`     |
| `/skills/seedance-main.md`              | seedance_skills | productionPlan    | seedance-main            | `.claude/agents/seedance-main.md`                                                                                     |
| `/skills/seedance-director-analysis.md` | seedance_skills | directorAnalysis  | director(action=analyze) | `.claude/skills/director-skill/SKILL.md`                                                                              |
| `/skills/seedance-asset.md`             | seedance_skills | assetManifest     | seedance-main(B)         | `.claude/skills/seedance-asset/SKILL.md` + references                                                                 |
| `/skills/seedance-director-plan.md`     | seedance_skills | directorPlan      | seedance-main(C1)        | `.claude/skills/seedance-director-plan/SKILL.md`                                                                      |
| `/skills/seedance-storyboard-table.md`  | seedance_skills | storyboardTable   | seedance-main(C2)        | `.claude/skills/seedance-storyboard-table/SKILL.md`                                                                   |
| `/skills/seedance-storyboard-prompt.md` | seedance_skills | storyboardPrompts | storyboard-artist(C3)    | `.claude/skills/seedance-storyboard-skill/SKILL.md`（拆出 3 份 shared）                                                    |
| `/skills/seedance-video.md`             | seedance_skills | videoTask         | seedance-main(D)         | `.claude/skills/seedance-video/SKILL.md`                                                                              |


### review/（4 个）


| 文件                                  | metaData      | output_tag   | 用途             |
| ----------------------------------- | ------------- | ------------ | -------------- |
| `/skills/review/script-analysis.md` | review_skills | reviewReport | 剧本分析审核         |
| `/skills/review/art-direction.md`   | review_skills | reviewReport | 服化道审核          |
| `/skills/review/seedance-prompt.md` | review_skills | reviewReport | Seedance 提示词审核 |
| `/skills/review/compliance.md`      | review_skills | reviewReport | 平台合规审核         |


### shared/（3 个）


| 文件                                               | metaData      | 用途       |
| ------------------------------------------------ | ------------- | -------- |
| `/skills/shared/storyboard-prompt-techniques.md` | shared_skills | 提示词方法论   |
| `/skills/shared/storyboard-table-techniques.md`  | shared_skills | 分镜表技法    |
| `/skills/shared/emotion-face-mapping.md`         | shared_skills | 情绪→面部映射表 |


### asset-helpers/（4 个）


| 文件                                        | metaData     | output_tag     | 用途       |
| ----------------------------------------- | ------------ | -------------- | -------- |
| `/skills/asset-helpers/polish.md`         | asset_skills | polishedPrompt | 提示词润色    |
| `/skills/asset-helpers/generate-image.md` | asset_skills | imageTask      | 图片生成 API |
| `/skills/asset-helpers/save.md`           | asset_skills | saveResult     | 下载保存     |
| `/skills/asset-helpers/batch.md`          | asset_skills | batchResult    | 批量串联     |


### art-styles/（画风包，9 个）


| 目录                            | 来源                                | 用户填写 description 时映射      |
| ----------------------------- | --------------------------------- | ------------------------- |
| `3d-guoman/`                  | 已迁入 skills/art-styles            | "3D 国漫"、"3d-guoman"       |
| `3D_chinese_traditional/`     | Toonflow                          | "3D 国风传统"、"3D 仙侠"、"3D 古风" |
| `3D_anime_render/`            | Toonflow                          | "3D 动画"、"3D 渲染"、"3D 二次元"  |
| `3D_clay_stopmotion/`         | Toonflow                          | "黏土定格"、"3D 黏土"            |
| `2D_chinese_guofeng/`         | Toonflow                          | "国风二次元"、"新国潮"、"2D 国风"     |
| `2D_90s_japanese_anime/`      | Toonflow                          | "90 年代日漫"、"复古日漫"          |
| `2D_flat_design/`             | Toonflow                          | "平面设计"、"扁平风"              |
| `2D_mature_urban_romance/`    | Toonflow                          | "都市言情写实 2D"               |
| `realpeople_ancient_chinese/` | Toonflow                          | "古装真人"、"真人古装"             |
| `realpeople_urban_modern/`    | Toonflow                          | "都市真人"、"现代真人"             |


每个画风目录统一结构（**共 12 份 md**）：

```
{style}/
├── README.md                      ← 1 份
├── prefix.md                      ← 1 份；metaData: art_skills（全局风格基础）
├── images/                        ← 参考图（非 md 资源）
├── art_prompt/                    ← 7 份；B 阶段（资产生成）用
│   ├── art_character.md
│   ├── art_character_derivative.md
│   ├── art_scene.md
│   ├── art_scene_derivative.md
│   ├── art_prop.md
│   ├── art_prop_derivative.md
│   └── art_storyboard_video.md    ← C3/D 阶段（分镜视频提示词）用
└── director_skills/               ← 3 份；C 阶段用（修正 Toonflow 拼写错误）
    ├── director_planning_style.md
    ├── director_storyboard.md
    └── director_storyboard_table_style.md
```

合计：**9 画风 × 12 份 md = 108 份画风资源 md**。

### story-genres/（故事类型包，12 个）


| 目录                       | 用户填写 description 时映射 |
| ------------------------ | -------------------- |
| `Sweet_romance_novel/`   | "甜宠"、"言情"、"甜宠言情"     |
| `Xianxia_fantasy/`       | "仙侠"、"玄幻"、"修仙"       |
| `Urban_workplace_drama/` | "都市"、"职场"            |
| `Hot_blooded_action/`    | "热血"、"动作"            |
| `Mystery_thriller/`      | "悬疑"、"推理"            |
| `Horror_supernatural/`   | "恐怖"、"灵异"            |
| `Comedy_humor/`          | "喜剧"、"搞笑"            |
| `Family_warmth/`         | "家庭"、"亲情"            |
| `Coming_of_age/`         | "青春"、"校园"、"成长"       |
| `Historical_epic/`       | "历史"、"古风"            |
| `Psychological_drama/`   | "心理"                 |
| `Scifi_post_apocalypse/` | "科幻"、"末日"            |


每个故事类型目录统一结构（**共 3 份 md**）：

```
{genre}/
├── README.md
├── images/                                            ← 参考图
└── director_skills/                                   ← C 阶段用
    ├── director_planning_narrative.md                 ← 叙事规划手法
    └── director_storyboard_table_narrative.md         ← 分镜表叙事手法
```

合计：**12 故事类型 × 3 份 md = 36 份故事类型资源 md**。

**全部 art-styles + story-genres 合计：108 + 36 = 144 份资源 md**（全部从 Toonflow 已验证内容迁入，几乎零创作工作量）。

---

## 附录 B：业务 Agent 完整清单（8 个）


| 文件                                  | version | skills                       | attached_skills                                                                           | tools                                 | color  | stage 映射                                 |
| ----------------------------------- | ------- | ---------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------- | ------ | ---------------------------------------- |
| `/agents/scriptAgent-main.md`       | 1.0.0   | []                           | []                                                                                        | [Read, Write, Edit, Glob, Grep, Bash] | purple | chat                                     |
| `/agents/scriptAgent-skeleton.md`   | 1.0.0   | [script-skeleton]            | []                                                                                        | [Read, Write, Edit, Glob, Grep]       | blue   | storyline                                |
| `/agents/scriptAgent-adaptation.md` | 1.0.0   | [script-adaptation]          | []                                                                                        | [Read, Write, Edit, Glob, Grep]       | cyan   | outline                                  |
| `/agents/scriptAgent-script.md`     | 1.0.0   | [script-writing]             | []                                                                                        | [Read, Write, Edit, Glob, Grep]       | green  | script                                   |
| `/agents/scriptAgent-supervisor.md` | 1.0.0   | [script-supervision]         | []                                                                                        | [Read, Glob, Grep]                    | orange | review-* (按 action 分流)                   |
| `/agents/seedance-main.md`          | 1.0.0   | [seedance-main]              | [seedance-asset, seedance-director-plan, seedance-storyboard-table, seedance-video]       | [Read, Write, Edit, Glob, Grep, Bash] | cyan   | seedance-*                               |
| `/agents/director.md`               | 1.0.0   | [seedance-director-analysis] | [review/script-analysis, review/art-direction, review/seedance-prompt, review/compliance] | [Read, Write, Edit, Glob, Grep]       | blue   | seedance-director / review (按 action 分流) |
| `/agents/storyboard-artist.md`      | 1.0.0   | [seedance-storyboard-prompt] | [shared/storyboard-prompt-techniques, shared/emotion-face-mapping]                        | [Read, Write, Edit, Glob, Grep]       | red    | seedance-storyboard                      |


**attached_skills 语义：**

- v1：agent-runtime 把 attached_skills 在组装 prompt 时一次性预拼入（director 的 review/* 全部预拼，LLM 按 action 选用）
- v2：注册为 `activate_skill(name)` tool 候选

---

## 附录 C：Web 代码 prompt 迁移清单

### C.1 `web/app/lib/agent/prompts.ts`（482 行 → wrapper → 删除）


| 函数                         | 迁到                               | 备注                            |
| -------------------------- | -------------------------------- | ----------------------------- |
| `buildChatPrompt`          | `/agents/scriptAgent-main.md` 内嵌 | 决策 prompt（含 configSection 逻辑） |
| `buildExtractParamsPrompt` | `/agents/scriptAgent-main.md` 内嵌 | 参数提取（走 action=extract_params） |
| `buildSkeletonPrompt`      | `/skills/script-skeleton.md`     | 三方合并                          |
| `buildAdaptationPrompt`    | `/skills/script-adaptation.md`   | 三方合并                          |
| `buildScriptPrompt`        | `/skills/script-writing.md`      | 三方合并                          |
| `buildProgressSummary`     | **不迁（工具函数）**                     | 仅文本拼接                         |


### C.2 `web/app/lib/review-prompts.ts`（190 行 → wrapper → 删除）


| 函数                            | 迁到                                      |
| ----------------------------- | --------------------------------------- |
| `buildSkeletonReviewPrompt`   | `/skills/script-supervision.md`（骨架审核段）  |
| `buildAdaptationReviewPrompt` | `/skills/script-supervision.md`（改编审核段）  |
| `buildStorylineReviewPrompt`  | `/skills/script-supervision.md`（故事线审核段） |
| `buildOutlineReviewPrompt`    | `/skills/script-supervision.md`（大纲审核段）  |
| `buildScriptReviewPrompt`     | `/skills/script-supervision.md`（剧本审核段）  |


### C.3 `web/app/lib/novels.ts`（2106 行）

只迁业务规则常量部分。grep `prompt` / `systemPrompt` / `指令` / `规则` 定位：

- 业务规则 → 迁到对应 Skill
- 数据读写逻辑 → 保留

### C.4 画风模板统一到 `/skills/art-styles/`


| 模板类型 | 统一路径 |
| --- | --- |
| 全局前缀 | `/skills/art-styles/{style}/prefix.md` |
| 资产提示词 | `/skills/art-styles/{style}/art_prompt/*.md` |
| 导演技法 | `/skills/art-styles/{style}/director_skills/*.md` |


Web 引用位置：`web/app/lib/novels.ts:2000-2020` 约 5-10 处。

---

## 附录 D：诊断 checklist 模板

```
文件：[path]
类型：[Skill | Agent | CLAUDE.md]
改造前版本：[v?]
改造后版本：v1.0.0

=== 规范符合度 ===
[ ] frontmatter 必备字段齐全
[ ] 9 要素（Skill）/ 6 节（Agent）齐全
[ ] 无反模式命中（Skill 12 条 / Agent 6 条）
[ ] depends_on 与 [依赖检测] 同步
[ ] tools 白名单（Agent）
[ ] status 机器字段（Agent [输出规范]）
[ ] caller-agnostic（Agent）
[ ] 单入口（Agent：只有 [工作流程] 写"按顺序执行"）
[ ] metaData 字段正确分类
[ ] output_tag 与 [输出格式] 一致

=== 内容等价性 ===
[ ] 原文件业务知识完整迁移（无丢失）
[ ] 业务流程 100% 位于 Skill，Agent 内 0 业务细节
[ ] 端到端跑通：novels/ 产出结构与改造前一致

=== Web 对接 ===
[x] 画风模板引用统一到 skills/art-styles
[ ] executor.ts 的 buildXxx 调用已替换为 runAgent（Phase 4 后）
[ ] LLM 调用能正确解析 status / stage_reached（Phase 4 后）
[ ] 跨模型测试通过（至少 2 个 API 模型，Phase 6 后）

改造人：
改造日期：
```

---

## 附录 E：Toonflow-app 关键文件参照清单


| Toonflow-app 文件                                                        | 我们对应文件                                                   | 借鉴内容                                                                                 |
| ---------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/utils/agent/skillsTools.ts`（274 行）                                | `web/app/lib/skill-loader.ts`                            | parseFrontmatter / scanSkills / useSkill 实现思路；activate_skill / read_skill_file v2 再用 |
| `src/agents/scriptAgent/index.ts`（238 行）                               | `web/app/lib/agent-runtime.ts`                           | runAgent + consumeFullStream 框架；createSubAgent v2 再用                                 |
| `data/skills/script_execution_skeleton.md`                             | `/skills/script-skeleton.md`                             | 9 要素骨架 + 内容蓝本                                                                        |
| `data/skills/script_execution_adaptation.md`                           | `/skills/script-adaptation.md`                           | 同上                                                                                   |
| `data/skills/script_execution_script.md`                               | `/skills/script-writing.md`                              | 同上                                                                                   |
| `data/skills/script_agent_supervision.md`                              | `/skills/script-supervision.md`                          | 6 维度评审骨架                                                                             |
| `data/skills/production_agent_decision.md`（274 行）                      | `/skills/seedance-main.md` 蓝本                            | 制片人决策层 prompt                                                                        |
| `data/skills/production_agent_supervision.md`（345 行）                   | `/skills/review/seedance-prompt.md` + `compliance.md` 蓝本 | 监督层评分逻辑（director Agent 持有）                                                           |
| `data/skills/production_execution_derive_assets.md`（97 行）              | `**/skills/seedance-asset.md` 增补节**                      | 衍生资产识别规则（Phase 1F 增补，不新建独立 Skill）                                                    |
| `data/skills/production_execution_director_plan.md`（132 行）             | `/skills/seedance-director-plan.md` 蓝本                   | C1 导演规划六维度                                                                           |
| `data/skills/production_execution_storyboard_table.md`（73 行）           | `/skills/seedance-storyboard-table.md` 蓝本                | C2 分镜表逻辑                                                                             |
| `data/skills/production_execution_storyboard_panel.md`（83 行）           | `/skills/seedance-storyboard-prompt.md` 蓝本               | C3 分镜面板/提示词                                                                          |
| `data/skills/production_execution_generate_assets.md`（36 行）            | `/skills/asset-helpers/generate-image.md` 蓝本             | B 阶段图片生成                                                                             |
| `data/skills/production_execution_storyboard_gen.md`（38 行）             | **v2 评估**（v1 不引入独立分镜图生成阶段）                               | 见 §1.2.5 完善点 2                                                                       |
| `data/skills/production_skills/storyboard_prompt_techniques.md`（322 行） | `/skills/shared/storyboard-prompt-techniques.md`         | **直接照搬**                                                                             |
| `data/skills/production_skills/storyboard_table_techniques.md`（158 行）  | `/skills/shared/storyboard-table-techniques.md`          | **直接照搬**                                                                             |
| `data/skills/art_skills/`（9 个画风目录）                                     | `/skills/art-styles/`（9 个画风目录）                           | **目录批量复制**（含 prefix.md / art_prompt/ / director_skills/）                             |
| `data/skills/story_skills/`（12 个故事类型目录）                                | `/skills/story-genres/`（12 个故事类型目录）                      | **目录批量复制**（含 director_skills/ 下 2 份导演技法）                                             |


---

**改造完成的判定：本附录所有清单 ✅，附录 D 诊断 checklist 全部 ✅，附录 A/B/C 全部产出就位，§8 验证标准全部通过。**

---

## 附录 F：开工前必读总清单

> **本计划已于 2026-04-26 用户拍板，进入"已确认"状态可以开工。**

### F.1 用户决策点（已最终锁定）


| #   | 问题                         | 决策                                     |
| --- | -------------------------- | -------------------------------------- |
| Q1  | Seedance 在桌面应用里编排是否在 v1 做？ | ✅ **A 是**                              |
| Q2  | 5 种 mode 在桌面应用里支持是否在 v1 做？ | ✅ **B 否**（与 Toonflow 一致，留 v2）          |
| Q3  | review fix 循环是否加 2 轮限制？    | ✅ **A 是**                              |
| Q4  | 故事类型在剧本骨架/改编/剧本阶段是否加载？     | ✅ **A 是**（对 Toonflow 的扩展）              |
| Q5  | vendor 热加载是否在 v1 做？        | ✅ **B 否**（官方 API / OpenAI 兼容协议覆盖主流模型，留 v2） |
| Q6  | 测试 novel + 国产模型？           | ✅ **造化之门 + DeepSeek-R1**               |


**配套铁律：**

- 应用形态：Electron 桌面应用（非浏览器）
- 用户接触面：仅桌面应用窗口（绝不接触 Claude Code、终端、命令行）
- 模型来源以用户当前选择为准；不再保留 Claude CLI / `claude-cli` 作为模型选项
- `.claude/` 业务部分 Phase 3 彻底删除，无 CLI 兜底路径

### F.2 现状真相确认

实施者必须实地验证以下事实（否则计划假设可能失效）：

- `web/app/lib/agent/executor.ts` 实际只跑通了"配置→骨架→改编→剧本"3 步流水线
- Seedance 5 阶段在 Web 后端**完全没实现**（只有 novels.ts 的读取函数）
- 4 种 mode（full/extend/revise_episode/revise_global/rewrite_episode）在 Web 后端不存在
- review fix 循环**没有 2 轮限制**（理论无限）
- `.claude/agents/` 8 个业务 Agent 在 Web 后端 **0 处调用**

### F.3 Toonflow 对照确认

实施者必须看过以下 Toonflow 文件后再开工：

- `src/utils/agent/skillsTools.ts`（274 行）— skill-loader 实现参照
- `src/agents/scriptAgent/index.ts`（238 行）— 剧本链 agent-runtime 实现参照
- `src/agents/productionAgent/index.ts`（550 行）— Seedance（如 Q1=是） seedance-executor.ts 实现参照
- `data/skills/script_execution_skeleton.md` 等 5 份剧本 Skill — 剧本链 Skill 蓝本
- `data/skills/production_execution_*.md` 8 份 — Seedance Skill 蓝本
- `data/skills/art_skills/{9 个}/` + `data/skills/story_skills/{12 个}/` — 画风+故事类型批量复制源

### F.4 红线（违反必停工）

- ❌ 不改 `novels/` 数据格式（用户已有数据必须能继续用）
- ❌ 不直接破坏用户已有模型配置；`config/stage-bindings.json` 仅保留空对象占位，运行时不再读取
- ❌ 不改 `.claude/skills/web-`* 和 `.claude/agents/web-*`（Claude Code 给开发者用的，本计划范围外）
- ❌ 不删除 `.claude/agents/scriptAgent-*.md` 直到 Phase 3 前置检查 5 项全过
- ❌ 不在跨模型测试通过前删除 prompts.ts / review-prompts.ts（保留 wrapper 一个月灰度）

### F.5 风险预警（开工前必须知道）


| 风险                                             | 对策                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| ⚠️ Skill prompt 三方合并漏要点                        | Phase 1B 每个 Skill 用"diff 对照表"逐字段核对 Toonflow / .claude / prompts.ts 三方源                |
| ⚠️ Seedance 在 Web 实现是新功能（不是改造）                 | Phase 4b 必须先用一个 ep 数据做端到端联调，跑通 A→B→C1→C2→C3，确认 Web 产出结构完整后再展开 |
| ⚠️ 跨模型 XML 输出不稳定                               | Phase 6.3 实测；Skill `[输出格式]` 节加强约束（"严格按格式不输出额外内容"）                                     |
| ⚠️ Toonflow VM2 已停更（vendor 热加载 v2 实施时）         | v2 切换到 isolated-vm 或 Worker；本 v1 不涉及                                                  |
| ⚠️ 思考模型（DeepSeek R1）流式 chunk 边界切断 `<think>` 标签 | Phase 0 验证 stream-model.ts 是否处理；不处理则照搬 Toonflow stripThink 的 chunk 级有状态过滤器            |


### F.6 开工流程（已确认，按此顺序执行）

1. ✅ F.1 用户决策已拍板（2026-04-26）
2. ⏳ 实施者按 F.2 实地验证现状（每个 Phase 开始前各自验证一次）
3. ⏳ 实施者按 F.3 看过 Toonflow 关键文件
4. ⏳ 按 §5 改造路线图执行：

```
Phase 0  基建（0.5 天）
  ↓
Phase 1  Skill 迁移（共 4 天）
  ├─ 1A Seedance 现有 Skill 迁移（14 个，1 天）
  ├─ 1B 剧本 Skill 三方合并新建（4 个，1 天）+ 1B-Q4 剧本 3 Skill 加故事类型加载逻辑
  ├─ 1C 画风包批量迁移（9 个，1 天，共 108 份资源 md）
  ├─ 1D 废弃 Skill 下架（0.2 天）
  ├─ 1E 故事类型包批量迁移（12 个，0.5 天，共 36 份资源 md）
  └─ 1F seedance-asset 衍生资产能力增补 + manifest schema 冻结（0.3 天）
  ↓
Phase 2  Agent 迁移（8 个，2 天）
  ├─ scriptAgent-{main,skeleton,adaptation,script,supervisor}（5 个）
  ├─ seedance-main / director / storyboard-artist（3 个）
  └─ 配套 1B-Q4：3 个剧本 Agent 的 frontmatter 加 attached_skills 故事类型字段
  ↓
Phase 4a 加载层基建 + 剧本链替换（2.5 天）
  ├─ 4a-1 实现 skill-loader.ts（含 mapArtStyleToDir + mapStoryGenreToDir）
  ├─ 4a-2 实现 agent-runtime.ts + ⭐ strip-think.ts（防 DeepSeek R1 思考标签污染）
  ├─ 4a-3 改造剧本链 executor.ts（10 处 buildXxx → runAgent）
  ├─ 4a-4 prompts.ts / review-prompts.ts wrapper 化
  └─ 4a-5 ⭐ review fix 2 轮限制（Q3=A 必做，0.2 天）
  ↓
Phase 4b Seedance 在桌面应用里编排（Q1=A 必做，3.3 天）
  ├─ 4b-1 新增 seedance-executor.ts（约 600 行）
  ├─ 4b-2 新增 API 路由 /api/seedance/{start,status,fix}
  ├─ 4b-3 novels.ts 增补 5 个 saveSeedance setter（按 manifest 新 schema）
  ├─ 4b-3.5 ⭐ tasks.jsonl 任务记录（参照 Toonflow taskRecord，0.3 天）
  ├─ 4b-4 D 阶段视频生成对接
  └─ 4b-5 端到端验证（造化之门 ep1 走完 A→B→C1→C2→C3）
  ↓
Phase 4d ⭐ 模型选择单一来源清理（必做，0.5 天）
  ├─ 移除 settings 阶段绑定入口和 CLI 状态入口
  ├─ 移除 claude-cli 内置注入 / streamCLI 调用分支
  └─ 确认所有生成入口都传入当前选择的 modelId
  ↓
Phase 3  .claude/ 业务清理（0.5 天）
  ⚠️ 前置 5 项检查必须在 Phase 4d 后才能满足！
  └─ Phase 3 必须移到 Phase 4d 之后（已修正）
  ↓
Phase 5  CLAUDE.md 瘦身（0.5 天）
  ↓
Phase 6  回归 + 文档（1.5 天）
  ├─ 6.1 剧本全链路回归（造化之门）
  ├─ 6.2 Seedance 全链路回归（造化之门）
  ├─ 6.3 跨模型回归（至少 2 个 API 模型，⭐ 重点验证 strip-think 效果）
  ├─ 6.4 画风+故事类型组合抽样回归（造化之门已覆盖 3D国漫×玄幻）
  └─ 6.5 文档更新

合计：约 15 天（含 2026-04-26/27 修订增加的 stripThink + tasks.jsonl + 模型选择单一来源清理 + fix 2 轮）
```

1. 每个 Phase 完成后用附录 D 诊断 checklist 自检
2. 全部完成后按 §9「改造完成的标志」逐项验证

### F.7 执行原则（防偏离计划）

- ⚠️ **每个 Phase 开始前，先看一遍计划书**（特别是 §0.4 现状真相、§0.6 已锁定决策）
- ⚠️ **每个 Phase 完成后，更新计划书底部的「执行进度日志」**（见 F.8）
- ⚠️ **遇到与计划不符的情况，立即停下来更新计划，再继续执行** — 不要"先做了再说"
- ⚠️ **决策已锁定的问题（Q1-Q6），中途不要回头讨论**，除非发现客观事实推翻原决策

### F.8 执行进度日志（开工后填写）


| Phase                                       | 预计完成  | 实际完成             | 关键风险/调整                                                                                                                                     |
| ------------------------------------------- | ----- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 基建                                        | 0.5 天 | **2026-04-26 ✅** | 发现 skill-template.md frontmatter 缺 metaData + output_tag 字段已补；新建 agent-template.md（计划书 §2.3 6 节骨架）；诊断 checklist 含 Skill/Agent/画风故事类型包 3 套模板 |
| 1A Seedance Skill 迁移（14 个）                  | —     | —                | —                                                                                                                                           |
| 1B 剧本 Skill 新建（4 个）+ Q4 故事类型加载              | —     | —                | —                                                                                                                                           |
| 1C 画风包迁移（9 个，108 份 md）                      | —     | —                | —                                                                                                                                           |
| 1D 废弃 Skill 下架                              | —     | —                | —                                                                                                                                           |
| 1E 故事类型包迁移（12 个，36 份 md）                    | —     | —                | —                                                                                                                                           |
| 1F seedance-asset 衍生资产 + manifest schema 冻结 | —     | —                | —                                                                                                                                           |
| 2 Agent 迁移（8 个）+ 配套 attached_skills         | —     | —                | —                                                                                                                                           |
| 4a 加载层 + stripThink + 剧本链替换 + fix 2 轮       | —     | **2026-04-27 ✅** | executor.ts 剧本链 + 手动审核 API 已切到 runAgent；prompts/review-prompts 已降级 wrapper；fix-count.json 2 轮限制已加；`tsc`、`npm run lint`、`npm run build` 均已通过 |
| 4b Seedance 桌面应用编排 + tasks.jsonl            | —     | **2026-04-27 ✅** | 新增 `seedance-executor.ts`、`task-record.ts`、`seedance-video.ts` 与 `/api/seedance/{start,status,fix}`；制作面板已接入“继续/全部生成/视频任务”；`造化之门 ep1` 已通过真实视频模型生成 T01-T09 共 9 个 mp4，`videos=completed` |
| 4d 模型选择单一来源清理                         | —     | **2026-04-27 ✅** | 已废弃 stage-bindings 运行时来源，移除 settings 阶段绑定入口、CLI 状态入口、`claude-cli` 内置注入、Agent 默认模型字段和 `streamCLI` 调用分支；`config/stage-bindings.json` 已清空为 `{}` |
| 3 .claude/ 业务清理（移到 4d 之后）                   | —     | **2026-04-27 ✅** | 已删除 `.claude` 下业务 Agent/Skill；保留 7 个 web Agent + 19 个 web Skill + skill-builder；docs/web 旧 `.claude` 与旧 config 画风目录路径引用已清零 |
| 5 CLAUDE.md 瘦身                              | —     | **2026-04-27 ✅** | `.claude/CLAUDE.md` 已瘦身为 Web 开发协作规则 + Web Agent/Skill 注册表，业务 Agent/Skill 指向根目录 `/agents` 和 `/skills` |
| 6 回归 + 文档（含跨模型 stripThink 验证）               | —     | **2026-04-27 ✅** | Web/Electron TypeScript 检查通过；`npm run lint`、`npm run build` 通过；`造化之门 ep1` Seedance A→D 全 completed 且 D 出片 9/9；`Phase6回归测试` 用 `kimi-k2.5` + DeepSeek API 模型跑通骨架→改编→第 1 集剧本，骨架/改编/剧本审核分别 82/92/85 分通过；产物无 `<think>`；`stripThink` 跨 chunk 开/闭标签过滤已通过专项验证 |


### F.9 计划修订记录


| 日期         | 修订项                                        | 原因                                                     |
| ---------- | ------------------------------------------ | ------------------------------------------------------ |
| 2026-04-25 | 初版                                         | 第一轮提案                                                  |
| 2026-04-25 | 增补画风/故事类型批量迁移（9+12）                        | 用户提醒"是否把 Toonflow 画风都迁过来"                              |
| 2026-04-25 | 拆 Phase 4 为 4a/4b/4c                       | 现状审视发现 Seedance 在 Web 端不存在                             |
| 2026-04-26 | 锁定 6 个用户决策                                 | Q1=A / Q2=B / Q3=A / Q4=A / Q5=B / Q6=造化之门+DeepSeek-R1 |
| 2026-04-26 | 明确 Electron 桌面应用形态                         | 用户确认"用户绝不接触终端"铁律                                       |
| 2026-04-26 | **补 stripThink（Phase 4a-2）**               | DeepSeek R1 输出含 `<think>`，extractXml 会污染               |
| 2026-04-26 | **冻结 manifest.json 新 schema（含 derive 数组）** | Phase 4b 数据层断裂风险                                       |
| 2026-04-26 | **加 tasks.jsonl 任务记录（Phase 4b-3.5）**       | Seedance 进度条 / 失败重试需要                                  |
| 2026-04-26 | **新增 Phase 4d stage-bindings UI 面板**       | 旧方案修订，已被 2026-04-27“用户当前选择模型”决策覆盖                        |
| 2026-04-26 | **加 review fix 2 轮限制（Phase 4a-5）**         | Q3=A 决定，防 LLM 死循环烧 token                               |
| 2026-04-26 | **Phase 3 移到 Phase 4d 之后**                 | 修正前置条件死局（Phase 3 检查项要求 Phase 4 完成）                     |
| 2026-04-26 | 修正资源 md 数量（11→12 / 99→108）                 | 包含 README.md 漏算                                        |
| 2026-04-26 | 总工期更新为约 15 天                               | 含上述所有修订增加的子项                                           |
| 2026-04-27 | **模型来源改为用户当前选择**                         | 用户确认 stage-bindings 不需要；废弃 `stage-bindings.json` 运行时模型来源，移除 Claude CLI / `claude-cli` 内置模型路径 |


**填写规则：**

- "实际完成"日期由实施者填，注明 yyyy-mm-dd
- "关键风险/调整"列：发现与计划不符的事实、做的决策调整、临时绕过的问题等
- 每完成一个 Phase 立刻填，不要等全部完成再补

**计划已锁定，可以开工。** Phase 0 起，实施者按本计划执行。
