# Harness 改造计划书：用 planner-generator-evaluator 范式优化

> 来源：Anthropic 文章《Harness design for long-running apps》
> 状态：v4.3 CLAUDE.md 调用导向纯化
> 日期：v1 2026-05-15 / v2 补丁 2026-05-15 / v3 调整 2026-05-15 / v4 缺陷修复 2026-05-16 / v4.1 施工前修复 2026-05-16 / v4.2 施工完成 2026-05-16 / v4.3 调用导向纯化 2026-05-16
> v2 修订点：见文末 [v2 补丁修订] 章节（7 处补丁 + 实施节奏调整）
> v3 调整：补丁 5 撤回内部 TaskCreate 强制（generator 自主判断节奏）；新增补丁 8（criteria 文件格式定义）
> v4 缺陷修复：见文末 [v4 缺陷修复] 章节。一致性缺陷（重命名 13 处 + v3 撤回 TaskCreate + 补丁 4 撤销）已传导回 v1 原文；架构层 / 鲁棒性 / 轻微缺陷以补丁 9-11 集中承载
> v4.1 施工前修复：见文末 [v4.1 施工前修复] 节。4 项必修（别名表时序 / prev_draft_path 字段统一 / 共用规范段名 / mode 默认值）+ 4 项建议（统计修正 / spec_refs 格式 / 补丁 7 加注 / 硬规则补条）
> v4.2 施工完成 + 撤销别名表：施工已完整落地（窗口 1 + 窗口 2 + hook 排除清单修复）；用户反馈"重构完不应该有别名表，浪费上下文"——补丁 10.3 实际撤销（详见文末 [v4.2 调整]）
> v4.3 撤销 [判定准则] + CLAUDE.md 内容硬性边界：用户第 2 次纠正"CLAUDE.md 塞演化设计准则浪费上下文"——撤销补丁 9.1 在 CLAUDE.md 加的 [判定准则] 段，规则升级为"CLAUDE.md 仅作调用导向协调"（详见文末 [v4.3 调整]）

---

## Context

核心思想是 **planner → generator ↔ evaluator** 两次收敛循环：
1. **循环 A（pre-implementation）**：generator 提议"验收标准" → evaluator 反馈 → 修改 → 直到对齐
2. **循环 B（post-implementation）**：generator 提交实现 → evaluator 评估 → 反馈 → 直到通过

目标：把这个范式注入当前 harness，让开发链从"单向流水线"升级为"两次收敛"，并把"主 Agent 编排、三角色独立 context"做到对称。

---

## PGE 三角色映射（最终）

| 文章角色 | harness 实体 | 形态 | 备注 |
|---|---|---|---|
| **planner** | `planner` agent → 调 `dev-planner` skill | **agent**（新增） | 独立 context；首次返回决策点，主 Agent AskUserQuestion 后二次 dispatch 完成 plan |
| **generator** | `generator` agent（原 `implementer`）→ 引用 `dev-builder` skill 共用规范段 | agent（已有，重命名 + 工作单元升级） | 接 phase 级；`mode: draft-criteria \| implement`；调用关系详见补丁 9 |
| **evaluator** | `evaluator` agent（原 `code-reviewer`）→ 调 `code-review` skill | agent（已有，重命名 + 双 mode） | `mode: criteria-alignment \| implementation-review` |

**三角色都是 sub-agent，主 Agent 只编排，不做认知工作。**

---

## 判定准则：skill vs agent（PGE 范围内/外的总规则）

| 阶段特征 | 谁主导 | 模式 | 例子 |
|---|---|---|---|
| **PGE 内（必须三角色对称）** | — | **必须 agent** | planner / generator / evaluator |
| **对话式探索**（PGE 外） | 用户主导，AI 引导 | skill | product-spec-builder / design-brief-builder / bug-fixer / skill-builder |
| **分析式产出**（PGE 外） | AI 主导，少量决策点 | 按改造成本权衡 | design-maker / release-builder（暂留 skill） |
| **数据闭环**（PGE 外） | — | 已 via_agent | feedback-writer / evolution-engine |

**spec 阶段不在 PGE 范围内**——它是"把模糊想法变需求"的前置步骤，比 planner 更前。Anthropic 文章假设需求已存在，没画这一层。所以"spec 保留 skill"不是破坏对称性，是它本来不在那个对称里。

**这套准则也作为 harness 未来演化的标准**——新 skill 加入时按此判定 skill / agent 形态。

---

## 改造后完整角色编排

### Skills 清单（11 个，保留全部）

| Skill | 角色 | 调用方式 | 改动 |
|---|---|---|---|
| product-spec-builder | 需求文档（对话式） | 主 Agent direct | 无 |
| design-brief-builder | 设计规范（对话式） | 主 Agent direct | 无 |
| design-maker | 设计稿（分析式，暂留 skill） | 主 Agent direct | 无 |
| **dev-planner** | **planner 业务** | ✏️ `direct` → **`via_agent(planner)`** | 无（内部逻辑不变，仅调用方式变） |
| **dev-builder** | 开发编排（PGE 双循环） | 主 Agent direct | ✏️ **删【逐 Task 实现】段；拆"编排剧本 / 共用规范"两段（补丁 9）；改 phase PGE 双循环** |
| **code-review** | **evaluator 业务** | via_agent(evaluator) | ✏️ **加 mode 参数 + criteria-alignment 分支** |
| bug-fixer | 调试修复（对话式） | 主 Agent direct | 无 |
| release-builder | 发布（分析式，暂留 skill） | 主 Agent direct | 无 |
| feedback-writer | feedback 落盘 | via_agent(feedback-observer) | 无 |
| evolution-engine | 进化扫描 | via_agent(evolution-runner) | 无 |
| skill-builder | 创建 Skill（对话式） | 主 Agent direct | 无 |

### Sub-Agents 清单（5 个：4 个保留 + 1 个新增）

| Sub-Agent | 角色 | 调用方 | 改动 |
|---|---|---|---|
| 🆕 **planner** | **PGE planner** | 主 Agent 派 | **新增**：80~100 行；首次返回决策点，二次完成 plan |
| **generator**（原 implementer） | **PGE generator** | 主 Agent 派 | ✏️ 重命名；接 phase 级；加 mode；自检 3→5 次 |
| **evaluator**（原 code-reviewer） | **PGE evaluator** | 主 Agent 派 | ✏️ 重命名；加 mode |
| feedback-observer | feedback 信号采集 | 主 Agent 派 | 无 |
| evolution-runner | 进化提议生成 | 主 Agent 派 | 无 |

> 调用方修正：skill 不能派 agent，只能由主 Agent 按 skill 指令派——v1 表格中 "dev-builder 派" 实际语义是"主 Agent 按 dev-builder 编排剧本派"。这里统一收敛为"主 Agent 派"。

### Hooks 清单（6 个，全部不变）

detect-feedback-signal / check-evolution / mark-review-needed / stop-gate / pre-commit-check / auto-push

---

## 完整工作流（从用户提需求到产品交付）

```
[用户提需求]
    ↓
主 Agent 判断阶段（按 [项目旅程]）
    ↓
┌──────────────────────────────────────────────────────────────┐
│ 阶段 1：需求 + 设计（对话式，skill 在主 Agent context）        │
├──────────────────────────────────────────────────────────────┤
│ product-spec-builder skill            ───→ Product-Spec.md     │
│ design-brief-builder skill (可选)     ───→ Design-Brief.md     │
│ design-maker skill (可选, 暂留 skill) ───→ 设计稿 (MCP)        │
└──────────────────────────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────────────────────────┐
│ 阶段 2：规划 = planner（独立 context, agent）⭐ 新结构          │
├──────────────────────────────────────────────────────────────┤
│ 主 Agent 派 planner agent                                       │
│   ↓ 首次 dispatch (读 Spec + Brief, 内部分析)                   │
│   返回 status: needs_input + 决策点清单                         │
│   ↓                                                            │
│ 主 Agent 用 AskUserQuestion 一次性集中问用户                    │
│   ↓ 用户答复                                                    │
│ 主 Agent 二次 dispatch planner agent (带答复)                   │
│   ↓ planner 调 dev-planner skill 完成 plan                      │
│   返回 status: done + DEV-PLAN.md 路径                          │
└──────────────────────────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────────────────────────┐
│ 阶段 3：开发 = generator ↔ evaluator 双循环 ⭐ 新结构           │
├──────────────────────────────────────────────────────────────┤
│ dev-builder skill (主 Agent 编排)                               │
│                                                                │
│ for each phase in DEV-PLAN.md:                                 │
│                                                                │
│   🔁 循环 A：criteria 对齐 (pre-implementation)                 │
│   ├─ 派 generator (mode: draft-criteria)                       │
│   │    → 起草 phase 级 criteria                                │
│   │    → 落盘 <project>/.claude/criteria/<phase_id>.md         │
│   ├─ 派 evaluator (mode: criteria-alignment)                   │
│   │    评估 3 项：可机器验证性 / 覆盖完整性 / spec 一致性       │
│   │    → status: aligned | needs_revision | rejected           │
│   ├─ needs_revision → 回 generator 修订（≤3 轮，详见补丁 10）   │
│   ├─ rejected → 按反馈类型分支路由（补丁 10）                   │
│   └─ aligned → 主 Agent 改 criteria frontmatter status: locked  │
│       （状态切换责任见补丁 9）                                  │
│                                                                │
│   🔁 循环 B：实现评估 (post-implementation)                     │
│   ├─ 派 generator (mode: implement)                            │
│   │    → 读 locked criteria + phase 交付清单                   │
│   │    → 按交付清单自然推进 + 写代码 + 自检（≤5 次）            │
│   │    → status: done | done_with_concerns | blocked           │
│   ├─ 派 evaluator (mode: implementation-review)                │
│   │    输入 = spec + locked criteria（不再泛对 spec）          │
│   │    → status: passed | stage1_blocked | stage2_blocked      │
│   ├─ stage1_blocked → 回 generator 补实现（闭环 A）             │
│   ├─ stage2_blocked → 路由 bug-fixer（闭环 A）                  │
│   └─ passed → 主 Agent 写回 .needs-review=clean + commit        │
│                                                                │
│ [phase 完成] → 下一 phase                                       │
└──────────────────────────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────────────────────────┐
│ 阶段 4：发布（暂留 skill）                                     │
├──────────────────────────────────────────────────────────────┤
│ release-builder skill (direct) → 打包 / 部署 / 发布            │
└──────────────────────────────────────────────────────────────┘
    ↓
[产品交付]
```

---

## 所有闭环（5 个）

| 闭环 | 类型 | 触发 | 路径 | 改动 |
|---|---|---|---|---|
| **A. review→fix** | 功能 | evaluator 阶段失败 | evaluator → generator 补实现 / bug-fixer 调试 → 重审 | 保留（被循环 B 复用） |
| **B. feedback** | 数据 | 用户修正 / detect-feedback-signal hook | 主 Agent 完成请求 → 派 feedback-observer → 写入 .claude/feedback/ | 保留 |
| **C. evolution** | 数据 | /evolution-engine 或 SessionStart 提醒 | 派 evolution-runner → 返回提议 → 用户确认 → skill-builder 或主 Agent 改 SKILL/CLAUDE.md | 保留 |
| **D. 内容修订** | 业务 | 用户改需求/UI/功能 | spec → plan → 代码 → review | 保留 |
| **E. phase PGE 双循环** ⭐ | 业务 | dev-builder 处理 phase | 循环 A criteria 对齐 → 循环 B 实现评估 | **新增** |

---

## 改造前后对比

**改造前（流水线 + 主 Agent context 污染）**：
```
dev-planner skill (在主 Agent context 跑) → DEV-PLAN.md
   ↓
主 Agent 在 dev-builder 中拆 Task (dev-builder.SKILL.md【逐 Task 实现】段, 违反独立 context)
   ↓
派 implementer(单 task) → 派 code-reviewer → 下一 task → ...
```
> 注：改造前用的是当前实际文件名 implementer / code-reviewer；改造后重命名为 generator / evaluator（补丁 1）

**改造后（三角色 agent 对称 + PGE 双循环）**：
```
派 planner agent → 调 dev-planner skill → DEV-PLAN.md
   ↓
主 Agent 取 phase（不拆 task）
   ↓
循环 A：generator(draft-criteria) ⇄ evaluator(criteria-alignment)
   ↓ aligned
循环 B：generator(implement) ⇄ evaluator(implementation-review)
   ↓ passed
下一 phase
```

**5 个本质差异**：
1. **planner 独立 context**：从 skill 升级为 agent，主 Agent 不再被分析过程污染
2. **工作单元**：task → phase
3. **新增循环 A**：动手前先对齐验收标准
4. **task 降级**：从架构层降为 generator 内部判断——是否拆 task 由 generator 自主决定，外部不强制（v3 调整）
5. **evaluator 双 mode**：分别评估 criteria 和代码

---

## 改动文件清单（6 文件 + 1 新增 agent，约 280 行新增）

| 文件 | 改什么 | 行数 |
|---|---|---|
| 🆕 `.claude/agents/planner.md` | **新增 sub-agent**：调 dev-planner skill；支持 2 次 dispatch（首次返回决策点，二次完成 plan）；输出机器化 status | +80~100 |
| `.claude/agents/generator.md`（原 implementer.md）| **重命名**（补丁 1）+ `required_packet`: `task_id` → `phase_id`；加 `mode: draft-criteria \| implement`；自检 3→5 次；输出加 `status: criteria_drafted` | +30~50 |
| `.claude/skills/dev-builder/SKILL.md` | 拆"编排部分"与"共用规范部分"（补丁 9）；删【逐 Task 实现】段主 Agent 拆 Task（v3 后 generator 自主判断）；改为 phase PGE 双循环编排剧本 | +40~60 |
| `.claude/agents/evaluator.md`（原 code-reviewer.md）| **重命名**（补丁 1）+ 加 `mode: criteria-alignment \| implementation-review`；criteria 模式 status 映射为 `aligned \| needs_revision \| rejected` | +40~60 |
| `.claude/skills/code-review/SKILL.md` | 头部加 mode 入参；新增 criteria-alignment 分支（评估三项 + 输出模板） | +60~80 |
| `.claude/CLAUDE.md` | `[Skill 注册表]` dev-planner `call_mode` → `via_agent(planner)`；`[Sub-Agent 注册表]` 新增 planner 条目 + generator / evaluator 重命名 + 入参更新；`[跨 Skill / Hook 闭环]` 新增 E. phase PGE 双循环；附录加 skill/agent 判定准则 + 重命名别名表（补丁 11） | +50~60 |

**新建 artifact 目录**：`<project>/.claude/criteria/<phase_id>.md`（运行时按需创建）

### 向后兼容

- code-reviewer / implementer 不传 mode → 默认行为（implementation-review / implement），老调用方零改动
- DEV-PLAN.md 现有 phase 验收标准字段保留作粗粒度门禁
- 既有 review→fix 闭环、`.needs-review` Hook 状态机不破坏

---

## 验证方法

1. **冒烟测试**：完成改动后，在 agent_novels 项目跑一个 phase，应观察到：
   - 派 planner agent 产出 DEV-PLAN.md
   - 派 generator(draft-criteria) 产出 `.claude/criteria/<phase_id>.md`
   - 派 evaluator(criteria-alignment) 评估
   - aligned 后主 Agent 改 frontmatter status: locked（补丁 9）
   - locked 后才派 generator(implement) 开始编码
   - 编码后派 evaluator(implementation-review)，对照 locked criteria

2. **planner 二次 dispatch 路径**：故意让 Spec 有歧义（多个技术栈合理选项），验证 planner 首次返回 `needs_input`，主 Agent 用 AskUserQuestion 收齐答复，二次 dispatch 完成 plan

3. **needs_revision 路径**：故意起草含"代码要漂亮"这种不可机器验证的条款，验证 evaluator 返回 `needs_revision` + `failure_count.unverifiable`，且第二次派 generator 时主 Agent 传入 `prev_draft_path` + `reviewer_feedback`（补丁 9）

4. **rejected 路径分支化**（补丁 10）：
   - 故意写跟 spec 冲突的 phase 描述 → 验证 evaluator 返回 `rejected` + `rejection_reason: spec_conflict` → 主 Agent 路由 product-spec-builder
   - 故意写覆盖不全的 phase → 验证 `rejection_reason: coverage_gap` → 主 Agent 路由 dev-planner 重新规划 phase

5. **3 轮上限**：人为给烂草稿，验证第 3 轮后中止升级为 `rejected` + 按反馈类型分支路由

6. **既有闭环不破坏**：验证 `.needs-review` Hook 仍正常工作；A/B/C/D 闭环不受影响

7. **向后兼容**：
   - 别的项目里不传 mode 调 evaluator → 应按默认行为执行
   - 用户在 chat 里说"派 code-reviewer" → 主 Agent 按别名表（补丁 11）映射到 evaluator

8. **mode 默认值护栏**（补丁 9）：主 Agent 派 generator 时漏传 mode → generator 检测到无 locked criteria 应主动拒绝，返回 `status: needs_context` + 提示先跑循环 A

9. **draft-criteria 工具白名单**（补丁 9）：在 draft-criteria 模式下让 generator 尝试 Edit 非 criteria 文件 → 应拒绝并返回 `status: blocked`

10. **循环 A 中断恢复**（补丁 10）：循环 A 起草到一半用户打断 → 下次进 dev-builder 时检测到 status: drafting 的 criteria 文件 → 主 Agent 询问"继续 / 丢弃"

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| planner agent 二次 dispatch 重复读 Spec/Brief | dev-planner 低频（每产品周期 1-2 次），可接受；二次 dispatch 只读决策答复 + 已分析结果 |
| generator 接 phase 级工作量比 task 大 2-3 倍 | 自检 3→5 次；generator 自主形成"开发-自检-修-再自检"小循环（v3 后不强制 TaskCreate） |
| dev-builder【逐 Task 实现】段是破坏性改动 | 该段整段移除，phase 内部节奏由 generator 自主判断（v3 调整） |
| criteria 文件累积 | 作为产品演化历史档案进 git，不删除（补丁 4） |
| 边缘 skill（design-maker / release-builder）未按对称性 agent 化 | 按判定准则"按改造成本权衡"，先观察使用频率，未来按需升级 |
| 主 Agent 派 generator 漏传 mode 导致循环 A 被跳过 | generator 检测无 locked criteria 主动拒绝（补丁 9） |
| 重命名后旧名字调用失败 | CLAUDE.md 加别名表 + 主 Agent 路由层兼容（补丁 11） |
| 循环 A 中断后 drafting 状态文件残留 | 主 Agent 启动 dev-builder 时扫描残留并询问继续 / 丢弃（补丁 10） |

---

## 关键引用文件

- `.claude/CLAUDE.md`
- `.claude/agents/generator.md`（原 implementer.md，重命名见补丁 1）
- `.claude/agents/evaluator.md`（原 code-reviewer.md，重命名见补丁 1）
- `.claude/agents/planner.md`（新增）
- `.claude/skills/dev-builder/SKILL.md`
- `.claude/skills/code-review/SKILL.md`
- `.claude/skills/dev-planner/SKILL.md`（被 planner agent 调用）

可复用模式：generator 自检循环、evaluator 机器化 status 字段、`.needs-review` 状态机、现有 sub-agent 派发硬规则（fresh 实例、不继承 session）

---

## 实施顺序建议

按依赖关系分 3 批改动，每批改完跑一次冒烟测试：

**批次 0：重命名 + 别名表（补丁 1 + 10.3 零点动作）**——批次 1 启动前一次性完成
0a. implementer→generator / code-reviewer→evaluator 重命名 + 全量引用替换（按 grep 实际数量，参考补丁 1 的 ≈19 处估算）+ stop-gate.sh 文案
0b. CLAUDE.md [Sub-Agent 注册表] 后追加 [别名表] 段（补丁 10.3 内容）——与重命名同步生效，避免旧名调用断档

**批次 1：底层 evaluator 双 mode**（无依赖，先打通基础）
1. `.claude/skills/code-review/SKILL.md` 加 criteria-alignment 分支
2. `.claude/agents/evaluator.md` 加 mode 参数 + status 映射

**批次 2：generator + planner agent**（依赖批次 1 的 evaluator）
3. 🆕 `.claude/agents/planner.md` 新建 + caller_mode 传递（补丁 9）
4. `.claude/agents/generator.md` 改 phase 级 + mode + criteria 起草规则（补丁 8）+ 工具白名单（补丁 9）+ 修订模式 prev_draft 入参（补丁 9）

**批次 3：编排 + 注册表收口**（依赖批次 1-2 全部 agent 就绪）
5. `.claude/skills/dev-builder/SKILL.md` 拆"编排部分 / 共用规范部分"（补丁 9）+ 改 PGE 双循环编排剧本 + 加循环 A 中断恢复检测（补丁 10）
6. `.claude/CLAUDE.md` 注册表更新 + 闭环 E + 判定准则 + 重命名别名表（补丁 11）+ rejected 分支路由表（补丁 10）

> **批次 ↔ 窗口 ↔ 补丁的统一映射**（补丁 11 补充 + v4.1 修正）：
> | 窗口 | 批次 | 关联补丁 |
> |---|---|---|
> | 窗口 1（立刻）| 批次 0 + 批次 1 | 补丁 1 + 补丁 10.3（别名表，v4.1 上调）+ v1 批次 1 |
> | 窗口 2（按需）| 批次 2 + 批次 3 | 补丁 2/3/5/6/7/8/9/10.1/10.2/10.4/11 |
> | 始终 | 与窗口 2 同步 | 补丁 4 |

每批改完用「冒烟测试 + 向后兼容测试」验证，再进入下一批。

---

## v2 补丁修订

> 在 v1 计划基础上叠加。原计划骨架保留，本节集中承载落地前必须明确的细节。

### 补丁 1：agent 文件重命名为 PGE 三角色标准名

**问题**：原计划 implementer / code-reviewer 文件名反映"做什么"，但改造主旨是 PGE 三角色对称——文件名应与文章术语对齐。

**修订**：
| 旧文件 | 新文件 | 备注 |
|---|---|---|
| `.claude/agents/implementer.md` | `.claude/agents/generator.md` | PGE generator |
| `.claude/agents/code-reviewer.md` | `.claude/agents/evaluator.md` | PGE evaluator |
| —（新建） | `.claude/agents/planner.md` | PGE planner |
| `.claude/agents/feedback-observer.md` | 不变 | PGE 外 |
| `.claude/agents/evolution-runner.md` | 不变 | PGE 外 |

**Skill 名字保持不变**：dev-builder / code-review / dev-planner 反映"业务能力"，与 agent 反映"PGE 角色"是两个维度，不必合并。

**影响的引用（5 文件 ≈19 处，按 grep 实际数量替换 + 人工核对）**：
- `.claude/CLAUDE.md` — `[Sub-Agent 注册表]` 条目名 / `[Skill 注册表]` 硬规则 / `[跨 Skill / Hook 闭环]` 描述 / `[项目旅程]` 线性旅程行（≈13 处）
- `.claude/skills/dev-builder/SKILL.md` — "派发 code-reviewer" 字符串（1 处，且在批次 3 整段重写）
- `.claude/agents/implementer.md` / `code-reviewer.md` — 自身 frontmatter `name:` 字段 + 自我提示文本（≈4 处）
- `.claude/hooks/stop-gate.sh` — block reason 文案"请派发 code-reviewer sub-agent" → "请派发 evaluator sub-agent"（1 处）

> v4.1 修正：v2 原文写"18 处"是估算，与上述细项合计 19 不一致。施工时统一以 `grep -rn 'implementer\|code-reviewer' .claude/ 输出为准`，按实际命中数替换，不依赖此估算数字。

**落地动作**：批次 1 启动前一次性完成重命名 + 全量引用替换，作为批次 1 的零点动作（不算入批次 1 三步）。

---

### 补丁 2：planner agent 与 dev-planner skill 的"问用户"边界

**问题**：dev-planner.SKILL.md [分析策略].[确认策略] 现有"歧义时直接问用户"逻辑。planner agent 在 sub-agent context 跑，不能直接对用户讲话——需明确分工。

**修订**：planner.md 新增 [对话边界] 段：
```
- agent 内禁止任何对用户的直接提问
- dev-planner skill 检测到"需问用户"分支时，agent 不执行问询，而是：
  - status: needs_input
  - questions: [{ id, text, options? }]
  - 已分析的上下文以紧凑摘要返回，作为二次 dispatch 的 input
- caller（主 Agent）用 AskUserQuestion 收齐答复 → 二次 dispatch（带 answers + 摘要）
- 二次 dispatch 直接进 [工作流程] 第四步（输出），不重跑前三步
```

**dev-planner skill 兼容性**：[确认策略] 不动，由 planner agent 的"运行模式标志"（如 `caller_mode: agent`）决定 skill 内"问用户"分支是直接对话还是回传决策点。skill 顶部 [初始化] 处加：
```
若被 planner agent 调用（caller_mode=agent）→ [确认策略] 走"列决策点"分支
若被主 Agent direct 调用（caller_mode=direct）→ [确认策略] 走"直接问用户"分支（向后兼容）
```

---

### 补丁 3：dev-builder skill 改造后身份澄清

**问题**：改造后 dev-builder skill 内容退化为"主 Agent 怎么编排 phase 双循环的剧本"，实际编码全在 generator 里。与 dev-planner（skill 在 agent 内被调）形态不一致，文档若不澄清会让读者困惑。

**修订**：dev-builder.SKILL.md 顶部 [任务与边界] 之前新增 [身份声明] 段：
```
本 skill 是"主 Agent 的 phase 编排剧本"，不是"AI 直接执行编码的指南"。
- 编码逻辑：由 generator agent 接管（见 .claude/agents/generator.md）
- 编排逻辑：由主 Agent 按本 skill 的双循环流程派发 generator / evaluator
- 历史兼容：v1.x 的"AI 直接按本 skill 编码"路径已废弃；如需直接编码语义参照，generator.md 会引用本 skill 的【开发规则】【质量门槛】等共用规范段
```

**dev-builder skill 的"共用规范段"（开发规则、质量门槛、Phase 完成度判断）保留**——它们仍是 generator agent 编码时的事实标准。

---

### 补丁 4：criteria 文件应进 git，不加 .gitignore

**问题**：v1 风险表写"criteria 文件目录膨胀 → 加 .gitignore 规则"——方向反了。criteria 是 phase 的"验收契约"，丢失破坏可追溯性，团队成员之间也共享不到。

**修订**：
- criteria 文件**进 git**，路径仍是 `<project>/.claude/criteria/<phase_id>.md`
- 文件 frontmatter 含 `status: drafting | locked` 字段；locked 后主 Agent 在 commit 时连同代码一起提交
- 风险表"目录膨胀"问题缓解方式改为"phase 完成后 criteria 文件不会删除，作为产品演化历史档案"（不是问题，是特性）

**对应 v1 改动文件清单调整**：
- "新建 artifact 目录：`<project>/.claude/criteria/<phase_id>.md`（运行时按需创建）" 保留
- 删除"加 .gitignore 规则"那条风险缓解

---

### 补丁 5：generator（原 implementer）phase 级开发节奏

**问题**：v1 提"phase 工作量比 task 大 2-3 倍 → 自检 3→5 次 + 内部 TaskCreate 小步快跑"，但 implementer.md 现在没这段内容指引。

**修订（v3 调整：撤回 TaskCreate 强制）**：generator.md 新增 [phase 级开发节奏] 段（在 [工作流程] 第 2 步之前插入）：
```
派发后按以下节奏推进 phase：
1. 读 phase_id 对应的 locked criteria + DEV-PLAN.md phase 交付清单
2. 按 phase 交付清单自然推进，每完成一个交付项做"小自检"
   （$TYPECHECK_CMD + 该交付项功能验证）
3. 全部交付项完成后做"大自检"（phase 整体编译 + dev server 启动 + 回归）
4. 大自检通过 → 进入 [输出规范] 组装交付

节奏判断（v3 调整）：
- 是否使用 TaskCreate 工具列内部 task list 由 generator 自主判断——不强制
- 模型已经能在 phase 内部自然形成"开发-自检-修-再自检"的小循环
- 外部不强制内部结构；phase 是 generator 的完整工作单元
- 自检失败：当场修最多 5 次（v1 原 3 次升级），仍不通过 → blocked

向后兼容：mode=implement 且只有单个交付项时，跳过中间小自检，直接做大自检
```

**v3 调整理由**：
- 用户决策："模型已经很强大，phase 内部已经可以进行拆分开发闭环"
- 删除"TaskCreate 拆 task list"的强制步骤，避免重新引入 v1 已废弃的"task 级架构层"
- 与补丁 6"task 级闭环 A 历史行为已废弃"在语义上完全对齐

generator.md 同步把 [前置条件].required_packet 从 `task_id / task_description / deliverables / affected_files / project_context` 改为：
```
- phase_id：Phase 编号（如 "phase-2"）
- phase_description：Phase 描述（来自 DEV-PLAN.md）
- deliverables：Phase 交付清单（从 DEV-PLAN.md 抽出）
- affected_files：涉及的现有文件列表
- locked_criteria_path：循环 A 产出的 criteria 文件路径
- project_context：项目结构摘要 / 当前 Phase 状态
- mode: draft-criteria | implement
  ⚠️ v2 原默认 implement → v4 补丁 9.4 已撤回默认值
  必须由 caller 显式传入；缺失 → 拒单 status: needs_context
```

---

### 补丁 6：闭环 E 与闭环 A 的语义关系澄清

**问题**：v1 列 5 个闭环并列，但循环 B 失败回退（stage1 → generator 补实现 / stage2 → bug-fixer）本质就是闭环 A——容易让读者误以为 E 和 A 是平行结构。

**修订**：CLAUDE.md [跨 Skill / Hook 闭环] 章节 E 项改述为：
```
E. phase PGE 双循环（业务，新增）
   - 触发：dev-builder 处理 phase
   - 结构：
     - 循环 A（前置 criteria 对齐）：generator(draft-criteria) ⇄ evaluator(criteria-alignment)
     - 循环 B（实现评估）：generator(implement) ⇄ evaluator(implementation-review)
   - 循环 B 失败时回退至闭环 A（review→fix）——E 包含 A 在 phase 级别上的执行
   - 闭环 A 在 task 级别的历史行为已废弃，仅保留 phase 级别
```

闭环 A 自身定义同步收紧：仅 phase 级别触发，task 级别不再走 A。

---

### 补丁 7：CLAUDE.md 旧硬规则需要重写

> ⚠️ v4.1 加注：本节描述 CLAUDE.md 条目时仍用"code-reviewer 条目 / implementer 条目"——这些指**批次 0 重命名前**的称呼。批次 3 实施本补丁时，CLAUDE.md 中相应条目已被批次 0 重命名为 evaluator / generator——按新名找条目，按本节内容更新其内字段（required_packet / dispatch_when 等）。

**问题**：v1 改动文件清单提"CLAUDE.md 注册表更新"，但未明确删除以下已过期的硬规则：

CLAUDE.md [Skill 注册表] 的硬规则段：
```
- dev-builder 只有在"整条开发主流程"里才 direct；单 Task 隔离必须走 implementer
```

改造后没有"单 Task 隔离"概念了——task 已降级为 generator 内部判断（v3 调整后）。

**修订**（行号引用已按补丁 11.1 改为段落锚定）：
- 删除上述原硬规则
- 替换为新硬规则（v4.1 补第四条）：
```
- dev-builder skill 是主 Agent 的编排剧本，不允许"AI 直接按本 skill 编码"
- phase 级开发派发必须走 generator agent
- phase 双循环（A criteria 对齐 + B 实现评估）不可跳过、不可合并
- 派发 generator 必须显式传 mode（draft-criteria | implement），无默认值；
  缺失 → generator 按补丁 9.4 拒单 status: needs_context
```

CLAUDE.md [Sub-Agent 注册表] 中 code-reviewer 条目同步更新：
- 名字 → evaluator
- `required_packet` 加 `mode: criteria-alignment | implementation-review`（默认 implementation-review，且补丁 9.4 强制双层护栏）

CLAUDE.md [Sub-Agent 注册表] 中 implementer 条目同步更新：
- 名字 → generator
- `required_packet` 按补丁 5 改为 phase_id 级
- `dispatch_when` 改为 "phase PGE 双循环（A 草拟 criteria / B 实现）"

CLAUDE.md [Sub-Agent 注册表] 中 implementer 条目之后新增 planner 条目（v1 已列出，此处校对入注册表位置）。

---

### 补丁 8：criteria 文件格式定义（v3 新增）

**问题**：v1 和 v2 未规定 criteria 文件内容格式。若 generator 起草的 criteria 仅是 DEV-PLAN 交付清单的自然语言复述，循环 A 退化为空转——evaluator 评"可机器验证性"会失去具体判定标准。

**修订**：criteria 文件必须按以下结构组织，每条都是**可机器验证的测试条件**，而非交付清单的翻译。

**criteria 文件模板**（`<project>/.claude/criteria/<phase_id>.md`）：

> `spec_refs` 引用格式说明（v4.1 澄清）：用 Product-Spec.md [功能需求] 章节编号，与 code-review skill [审查维度] 章节"按章节编号 1.1, 1.2, ..."保持一致。不依赖 markdown header 锚点（当前 Product-Spec.md 未生成锚点）。

```yaml
---
phase_id: phase-2
status: drafting | aligned | locked
spec_refs: [Product-Spec.md#1.2, Product-Spec.md#1.3]   # 章节编号，非 markdown 锚点
plan_refs: [DEV-PLAN.md#phase-2]
---

[功能验证 criteria]
- 交付项：用户能 X
  验证条件：
    - 存在文件 path/to/Y.ts
    - 函数 Z(args) 返回 R
    - dev server 启动后访问 /route 返回 200
    - UI 渲染 <selector> 且文本含 "..."

[UI 一致性 criteria]（如有设计稿）
- 颜色：header 按钮 hex == 设计稿 #4A90E2（精确匹配）
- 字号：标题 18px（精确匹配）
- 间距：卡片 padding 16px ±2px

[非功能 criteria]
- $TYPECHECK_CMD 零错误
- 安全扫描（code-review skill 规则清单 1-7）无 🔴
- 文件大小不超 300 行（TS/JS）
```

**evaluator 评 criteria-alignment 三项的具体判定**：

| 评估维度 | 通过标准 | 不通过示例 |
|---|---|---|
| 可机器验证性 | 每条 criteria 能用 Read/Grep/Bash 实际执行验证 | "代码要优雅" / "用户体验良好" / "性能可以接受" |
| 覆盖完整性 | phase 交付清单的每一项至少对应一条 criteria | 交付有 3 项、criteria 只覆盖 2 项 |
| spec 一致性 | spec_refs 引用的 Spec 章节实际存在且与 criteria 表达一致 | criteria 写了 spec 没要求的行为；或行为与 spec 冲突 |

**generator 起草 criteria 时的硬规则**：
- 禁止：交付清单原文复述（必须翻译为可执行的验证条件）
- 禁止：不可机器验证的形容词（漂亮 / 优雅 / 流畅 / 合理 / 良好 / 可接受）
- 必须：每条 criteria 注明验证手段（文件存在 / 函数返回 / HTTP 状态 / UI 选择器 / Grep 模式 / 编译输出）

**影响文件**：
- `.claude/agents/generator.md` 新增 [criteria 起草规则] 段（约 +20 行）
- `.claude/agents/evaluator.md` 新增 [criteria-alignment 判定标准] 段（约 +15 行）
- `.claude/skills/code-review/SKILL.md` criteria-alignment 分支引用本模板（约 +10 行作为模板引用 + 不通过示例表）

**v3 调整理由**：
- 若无此补丁，循环 A 会退化为"generator 把 DEV-PLAN 交付清单复述一遍 → evaluator 评一下文字是否通顺" → 空转
- criteria 必须有可执行的验证手段，evaluator 才有具体判定标准，循环 A 才有真实价值
- 该格式与 code-review skill [审查维度] Stage 1 / Stage 2 的检查项天然对齐——evaluator 复用同一套判定逻辑

---

### 实施节奏修订

**v1 原节奏**：3 批一次性做完，每批冒烟。

**v2 修订**：分两个时间窗推进，避免改了用不上。

| 时间窗 | 范围 | 触发条件 | 验证场景 |
|---|---|---|---|
| **窗口 1（立刻）** | 补丁 1（重命名）+ 补丁 10.3（别名表，v4.1 上调）+ v1 批次 1（evaluator 双 mode 骨架）| 计划批准即开始 | 任何 review 场景（含 agent_novels 当前阶段如有 review 需求）|
| **窗口 2（按需）** | v1 批次 2-3 + 补丁 2/3/5/6/7/8/9/10.1/10.2/10.4/11（含 planner agent 新建 / generator phase 级 / dev-builder 编排剧本 / CLAUDE.md 闭环 E 与注册表 / criteria 文件格式与判定标准 / 架构与鲁棒性修复）| 用户即将开始 `/dev-builder` 第一个 phase 前 | 在 agent_novels 真实 phase 上端到端冒烟 |
| **始终** | 补丁 4（criteria 进 git） | 与窗口 2 同步落地 | 验证 criteria 文件正常进 git commit |

**补丁 8 归窗口 2 的理由**：criteria 文件格式定义需要 generator agent 能起草 criteria 才有用——而 generator 改造在窗口 2。窗口 1 只引入 evaluator 双 mode 骨架（criteria-alignment 分支的开关），具体判定标准与起草规则推迟到窗口 2 与 generator 改造同步落地。

**补丁 10.3 上调窗口 1 的理由**（v4.1 修复）：别名表必须与重命名同步落地——否则窗口 1 完成到窗口 2 启动之间，用户在 chat 里说旧名 implementer / code-reviewer 会失败。批次 0 重命名时一并把别名表写入 CLAUDE.md。

**理由**：
- 窗口 1 范围小、立刻见效——agent 命名一致性 + evaluator 双 mode 在任何 review 场景都生效
- 窗口 2 是真正的 PGE 编排改造——agent_novels 项目刚跑完 design-maker（pencil-welcome-desktop.pen），尚未进入 /dev-planner。批次 2-3 改完短期没真实 phase 验证，硬上线会积累"说明书与现实偏差"
- 等用户说"我要开始开发了"或主 Agent 检测到"项目进入 /dev-planner 阶段"时再启动窗口 2，这样改造的第一个 phase 即是真实业务验证

---

### v2 + v3 补丁影响行数估算

| 补丁 | 文件 | 新增/修改行数 |
|---|---|---|
| 1 | 5 文件 18 处（重命名 + 引用替换）| 净增 0，纯替换 |
| 2 | planner.md / dev-planner SKILL.md | +20~30 |
| 3 | dev-builder SKILL.md | +15~20 |
| 4 | HARNESS-REFACTOR-PLAN.md 风险表 + .gitignore 不加 | -5 |
| 5 | generator.md（原 implementer.md，v3 调整后无 TaskCreate 强制） | +20~30（v3 调整后比 v2 少 10 行，删除内部 task list 拆分指引） |
| 6 | CLAUDE.md [跨闭环] 章节 | +10~15 |
| 7 | CLAUDE.md 硬规则段 + 注册表 | +15~20 |
| 8 ⭐ v3 新增 | generator.md / evaluator.md / code-review SKILL.md（criteria 格式 + 判定标准） | +45~60 |

v1 原 280 行新增 + v2 补丁约 75~110 行（补丁 5 缩水）+ v3 补丁 8 约 45~60 行 = 改造总量 ~400~450 行。仍可控。

**v3 净变化 vs v2**：
- 补丁 5 行数下降（-10 行：删除 TaskCreate 工具引用 + 拆 task list 流程）
- 补丁 8 新增（+45~60 行：criteria 文件格式 + evaluator 判定标准 + generator 硬规则）
- 净增约 35~50 行

---

## v4 缺陷修复

> 在 v1/v2/v3 基础上叠加。审查发现 4 类缺陷共 23 处，分两批处理：
> 1. **一致性缺陷（已传导回 v1 原文）**：重命名 13 处、v3 撤回 TaskCreate 3 处、补丁 4 撤销 1 处——直接 Edit 修复，无需新补丁。
> 2. **架构 / 鲁棒性 / 轻微缺陷**：以补丁 9/10/11 集中承载，每个补丁解决一组相关缺陷。

### v4 一致性传导清单（已完成，无需后续动作）

| # | 位置 | 修复内容 |
|---|---|---|
| 1 | [PGE 三角色映射] 表 | implementer / code-reviewer → generator / evaluator + 调用关系标注 |
| 2 | [Sub-Agents 清单] 表 | 同上 + "dev-builder 派"修正为"主 Agent 派" |
| 3 | [完整工作流] 阶段 3 流程图 | 循环 A/B 内 4 处名字 + 删 "内部 TaskCreate 拆节奏" + locked 状态切换标注 |
| 4 | [改造前后对比] 图 | 改造前后图示 5 处名字 + 改造前加注 |
| 5 | [5 个本质差异] 第 4 条 | "task 降级"措辞按 v3 重写 |
| 6 | [改动文件清单] 表 | 6 行涉及 implementer / code-reviewer 的全部更名 + 注明补丁来源 |
| 7 | [验证方法] 章节 | 全部 7 条更名 + 新增 3 条（mode 默认值 / 工具白名单 / 中断恢复） |
| 8 | [风险与缓解] 表 | 5 条按 v3/补丁 4 重写 + 新增 3 条风险 |
| 9 | [关键引用文件] 列表 | 文件路径全部更名 + 加 planner.md + 可复用模式更名 |
| 10 | [实施顺序建议] | 加批次 0（重命名）+ 各批次文件名更新 + 批次/窗口/补丁映射表 |

### 补丁 9：架构层修复（涵盖 6 个架构缺陷）

#### 9.1 generator agent 与 dev-builder skill 调用关系澄清（缺陷 #1）

**问题**：PGE 三角色映射表说 "generator 调 dev-builder skill"，补丁 3 说 "dev-builder 是编排剧本，编码由 generator 接管"——若 generator frontmatter `skills: [dev-builder]` 不变，会形成"generator 调一份说'派 generator'的剧本"的循环引用。

**修订**（v4.1 调整：用 dev-builder.SKILL.md 现有段名引用，不另立"【共用规范】"段）：
- dev-builder skill 内容在角色上拆为两类段（保留原段名，不重命名）：
  - **编排剧本段**（主 Agent 读，要重写）：[任务与边界] / [反合理化清单] / [依赖检测] / [工作流程（初始化模式）] / [工作流程（持续开发模式）] / [初始化]
  - **共用规范段**（generator 引用，保留不动）：[第一性原则] / [开发规则] / [开发策略] / [Phase 完成度判断] / [输出风格]
- generator.md frontmatter `skills:` 字段**移除** `dev-builder`，改为在 agent 文本里写：
  ```
  [编码规范来源]
  本 agent 编码时遵循 .claude/skills/dev-builder/SKILL.md 中以下段：
  - [第一性原则]（验证即证据 / 修改纪律 / 文档驱动 / 文件精简 / 设计参照纪律）
  - [开发规则]（代码层面 / 模块设计 / 数据层面 / 安全层面 / 流程层面 / 质量门槛）
  - [开发策略]（Plan Mode / 设计稿参照 / 技术栈选择）
  - [Phase 完成度判断]（四步走 / 冒烟测试 / 验证时效性）
  - [输出风格]
  不读其 [任务与边界] / [工作流程] 等编排段——那是主 Agent 的职责。
  ```
- 主 Agent 调 dev-builder skill 时仅执行编排段部分，按剧本派发 generator / evaluator

**影响文件**：
- `.claude/agents/generator.md` frontmatter `skills:` 改动 + 新增 [编码规范来源] 段（约 +10 行）
- `.claude/skills/dev-builder/SKILL.md` 在 [身份声明] 段（补丁 3）后加分段标记（约 +5 行）：
  ```
  本 skill 包含两类段——
  - 共用规范段（保留不重写）：[第一性原则] / [开发规则] / [开发策略] / [Phase 完成度判断] / [输出风格]
  - 编排剧本段（按补丁 9.1 / 10.2 重写）：[任务与边界] / [反合理化清单] / [依赖检测] / [工作流程（初始化模式）] / [工作流程（持续开发模式）] / [初始化]
  ```

#### 9.2 循环 A 修订模式 prev_draft + reviewer_feedback 传入（缺陷 #2）

**问题**：generator 是 fresh 实例不继承 session。循环 A 第二/三轮修订时，前轮 draft + evaluator 反馈必须显式传入，但补丁 5 的 required_packet 没列。

**修订**：generator.md [前置条件].required_packet 加可选字段（修订模式必填）：
```
（mode=draft-criteria 且 round > 1 时必填）
- prev_draft_path：上一轮 criteria 草稿文件路径
- reviewer_feedback：上一轮 evaluator 的 needs_revision 反馈摘要
  （格式：{ unverifiable: [...], coverage_gap: [...], spec_conflict: [...] }）
- round：当前是第几轮（1 / 2 / 3）
```

主 Agent 编排剧本（dev-builder skill）相应加判断：循环 A 第二次及以后派发 generator 时，必须读上一轮 criteria 文件 + 上一轮 evaluator 报告，组装成 packet 一并传入。

#### 9.3 criteria 文件 locked 状态切换的责任主体（缺陷 #3）

**问题**：evaluator 输出 status: aligned 但无 Write 工具——谁把 criteria frontmatter 从 `aligned` 改为 `locked`？

**修订**：明确为**主 Agent 编排剧本职责**。dev-builder skill 编排部分加：
```
循环 A 收到 evaluator status: aligned →
  1. 主 Agent 用 Edit 工具修改 <project>/.claude/criteria/<phase_id>.md
     frontmatter，把 status: aligned 改为 status: locked
  2. 写完后才进入循环 B
  3. locked 后该文件被视为只读（generator implement 模式只读不改）
```

evaluator.md 输出报告里追加一行提示："✓ aligned，请 caller 改 frontmatter status: locked 后进入循环 B"。

#### 9.4 mode 默认值与"phase 双循环不可跳过"硬规则冲突（缺陷 #4）

**问题**：generator 默认 mode=implement → 主 Agent 漏传 mode 时循环 A 被悄悄跳过。

**修订**：双层护栏。
- 编排层：dev-builder skill 编排剧本明确"派发 generator 必须显式传 mode，无默认值"
- 执行层：generator.md [校验规则] 加：
  ```
  - mode=implement 但 locked_criteria_path 不存在或文件 frontmatter status≠locked
    → 拒单，返回 status: needs_context + "缺少 locked criteria，请先跑循环 A"
  - mode=draft-criteria 但 prev_draft_path 已存在且 status=locked
    → 拒单，返回 status: blocked + "criteria 已锁定，无法重新起草"
  ```

#### 9.5 draft-criteria 模式工具白名单（缺陷 #5）

**问题**：generator 的 tools 是 `[Read, Grep, Glob, Edit, Write, Bash]`——draft-criteria 模式下若误改代码文件会造成"还没对齐验收标准就改了代码"。

**修订**：generator.md [工作流程] 第 1 步签收后插入 mode 隔离检查：
```
mode=draft-criteria：
  - Edit/Write 仅允许目标路径在 <project>/.claude/criteria/ 下
  - 尝试写其他路径 → 拒绝执行 + 返回 status: blocked + "draft-criteria 模式不允许修改代码"
mode=implement：
  - Edit/Write 不允许目标路径在 <project>/.claude/criteria/ 下（locked 文件只读）
  - 其余路径正常
```

由于物理工具白名单受 frontmatter `tools:` 控制（不区分 mode），这个隔离只能在 agent 文本中作为执行纪律——但与 generator [核心人格] 已有的"只做分配给你的工作、不顺手改别的"一致，可执行。

#### 9.6 caller_mode 传递机制（缺陷 #6）

**问题**：补丁 2 说 dev-planner skill 按 `caller_mode: agent` 走"列决策点"分支，但 skill 调用没有"标志位"概念。

**修订**：planner.md [工作流程] 第 2 步（调 skill）显式 prompt：
```
调用 dev-planner skill 时，在 prompt 起始处写明：
  "caller_mode: agent。
   按 SKILL.md [确认策略] 的 caller_mode=agent 分支执行——
   遇到需问用户的决策点时，不直接对话，而是收集成
   { id, text, options? } 列表返回给我。"

dev-planner skill 检测 prompt 开头的 caller_mode 标记，分支执行。
```

dev-planner SKILL.md [初始化] 段加 prompt 起始扫描：
```
读 prompt 起始 5 行，若含 "caller_mode: agent" → 走 agent 分支
否则 → 走 direct 分支（向后兼容主 Agent 直调）
```

**影响文件汇总**（补丁 9 整体）：
- `.claude/agents/generator.md`：+30~40 行（编码规范来源段 + prev_draft 入参 + mode 隔离检查 + locked 文件保护）
- `.claude/agents/evaluator.md`：+5 行（aligned 报告加 locked 提示）
- `.claude/agents/planner.md`：+5 行（caller_mode 显式 prompt）
- `.claude/skills/dev-builder/SKILL.md`：+15~20 行（编排剧本 / 共用规范分段 + locked 切换流程）
- `.claude/skills/dev-planner/SKILL.md`：+5 行（prompt 扫描 caller_mode）

---

### 补丁 10：流程鲁棒性修复（涵盖 4 个鲁棒性缺陷）

#### 10.1 循环 A 3 轮上限 fallback 分支化（缺陷 #7）

**问题**：v1 写 `rejected → 路由 product-spec-builder（spec 不足）`——但 3 轮起草烂的根因可能在 generator / phase 定义 / spec 任一处，一刀切不准。

**修订**：evaluator.md criteria-alignment 模式 status: rejected 时必须附 `rejection_reason` 字段：
```
rejection_reason 枚举：
- spec_conflict：criteria 引用的 spec 内容与 spec 实际表达冲突
  → 主 Agent 路由 product-spec-builder（澄清 spec）
- coverage_gap：phase 交付清单某些项无 criteria 覆盖且 3 轮未补齐
  → 主 Agent 路由 dev-planner（重新规划 phase 拆分）
- unverifiable：generator 反复起草不可机器验证的条款
  → 主 Agent 路由 dev-planner（phase 拆分粒度可能过粗）+ 输出 generator 警告
- ambiguous：3 类原因都有，无明显主导
  → 主 Agent 用 AskUserQuestion 让用户决定路由方向
```

dev-builder skill 编排剧本对照此表分支路由。

#### 10.2 循环 A 中断恢复机制（缺陷 #8）

**问题**：用户在循环 A 进行中打断 → 残留 status: drafting 的 criteria 文件，下次怎么处理？

**修订**：dev-builder skill [初始化] 段加扫描：
```
启动时扫描 <project>/.claude/criteria/*.md：
- 若发现 status: drafting 文件 → 输出"⚠️ 检测到上次循环 A 未完成的 criteria 草稿：[文件路径]"
  并用 AskUserQuestion 询问：
    (a) 继续修订：派 generator(draft-criteria) + 传 prev_draft_path（补丁 9.2 字段）
    (b) 丢弃重来：删除该文件，重新派 generator
    (c) 跳过此 phase：仅适用于该 phase 已通过其他方式实现的场景
- 若发现 status: aligned 但未 locked 的文件 → 提示 "上次 criteria 已对齐但未锁定"，
  询问 (a) 立即锁定进循环 B / (b) 重新起草
- 若所有文件 status: locked → 正常进入循环 B
```

#### 10.3 重命名后向后兼容（缺陷 #9）

**问题**：用户在 chat 里习惯说"派 code-reviewer"、其他项目的 CLAUDE.md 仍用旧名字——重命名后会找不到 agent。

**修订**：CLAUDE.md [Sub-Agent 注册表] 后新增 [别名表]：
```
[别名表]（v4 引入，重命名兼容）
旧名 → 新名（主 Agent 路由层自动映射，用户感知不到差异）
- implementer → generator
- code-reviewer → evaluator

适用范围：
- 用户在 chat 里说旧名 → 主 Agent 按新名派
- 其他项目 CLAUDE.md 引用旧名 → 主 Agent 按新名派
- 不修改对方项目文件——只在派发层兼容

弃用计划：3 个产品周期后（约 2026 年底）移除别名表，要求所有引用更新为新名。
```

主 Agent 在派发前做名字归一化：派之前查别名表，把旧名替换为新名再执行 Agent tool。

#### 10.4 批次 / 窗口 / 补丁归属统一表（缺陷 #10）

**问题**：v1 三批与 v2 两窗口分两个章节描述，加上补丁 8/9/10/11 后没人能一眼看清"哪个补丁属于哪个批次哪个窗口"。

**修订**：在 [实施顺序建议] 章节末尾已加映射表（v1 原文一致性传导时完成）。此处补"补丁 → 批次"反向索引：

| 补丁 | 所属批次 | 所属窗口 | 备注 |
|---|---|---|---|
| 1 | 批次 0 | 窗口 1 | 零点动作（重命名） |
| 2 | 批次 2 | 窗口 2 | planner.md 新建时一并实现 |
| 3 | 批次 3 | 窗口 2 | dev-builder skill 改造时一并 |
| 4 | — | 始终 | criteria 进 git，与窗口 2 同步落地 |
| 5 | 批次 2 | 窗口 2 | generator.md 改造（v3 调整后） |
| 6 | 批次 3 | 窗口 2 | CLAUDE.md 闭环 E 撰写时 |
| 7 | 批次 3 | 窗口 2 | CLAUDE.md 硬规则段重写 |
| 8 | 批次 1 / 批次 2 | 窗口 2 | 跨文件：evaluator.md / code-review SKILL 在批次 1；generator.md 在批次 2 |
| 9 | 批次 2 / 批次 3 | 窗口 2 | 跨文件：generator/evaluator/planner 在批次 2；dev-builder/dev-planner SKILL 在批次 3 |
| 10.1 | 批次 3 | 窗口 2 | rejected 分支路由：dev-builder 编排剧本 + CLAUDE.md 路由表 |
| 10.2 | 批次 3 | 窗口 2 | 循环 A 中断恢复：dev-builder skill [初始化] 段扫描 |
| **10.3** ⭐ v4.1 上调 | **批次 0** | **窗口 1** | **别名表：与重命名同步落地，避免旧名调用断档** |
| 10.4 | 批次 3 | 窗口 2 | 补丁映射表本身（属文档而非代码） |
| 11 | 批次 3 | 窗口 2 | CLAUDE.md 行号引用替换 |

---

### 补丁 11：轻微缺陷 + 别名 + 行号引用（已在补丁 10.3 / 10.4 中部分承载）

#### 11.1 CLAUDE.md 行号引用 → 段落锚定（缺陷 #11）

**问题**：补丁 7 引用 CLAUDE.md L150 / L155-160 / L167-172——CLAUDE.md 后续修改后行号会漂移，引用失效。

**修订**：补丁 7 内文及全文中所有"L<数字>"引用改为段落锚定：
- "CLAUDE.md L150" → "CLAUDE.md [Skill 注册表] 的硬规则段"
- "CLAUDE.md L155-160" → "CLAUDE.md [Sub-Agent 注册表] 中 code-reviewer 条目"
- "CLAUDE.md L167-172" → "CLAUDE.md [Sub-Agent 注册表] 中 implementer 条目"
- "CLAUDE.md L168 后" → "CLAUDE.md [Sub-Agent 注册表] 中 implementer 条目之后"
- "dev-builder.SKILL.md L306-312" → "dev-builder.SKILL.md【逐 Task 实现】段"

此规则同样适用于本文档后续所有补丁——任何对其他文档行号的引用都用段落 / 章节标题代替。

---

### v4 补丁影响行数估算

| 补丁 | 文件 | 新增/修改行数 |
|---|---|---|
| 9（架构层）| generator.md / evaluator.md / planner.md / dev-builder SKILL / dev-planner SKILL（5 文件）| +60~75 |
| 10（鲁棒性）| evaluator.md / dev-builder SKILL / CLAUDE.md（3 文件）| +35~45 |
| 11（轻微）| CLAUDE.md + 本文档（行号替换 5 处）| +5~10 |

**v4 净增**：约 100~130 行。

**累计改造总量**：v1 280 行 + v2 75~110 行 + v3 45~60 行 + v4 100~130 行 = **~500~580 行**。

虽然量上升，但每个补丁解决的都是落地前必须确认的细节，否则批次 2/3 改完会出现"派 generator 不知道调哪个 skill / mode 默认值漏传 / 修订上下文不传 / locked 没人切"这类卡点。

---

### v4 修订后的最终自检清单

落地任意补丁前必须确认（任一不满足 → 暂停 + 修补丁）：

1. ✅ 三角色名字（planner / generator / evaluator）在全文一致
2. ✅ generator 调谁、调啥已说清（补丁 9.1，v4.1 按 dev-builder.SKILL.md 实际段名引用）
3. ✅ 循环 A 修订模式上下文传入机制已说清（补丁 9.2，字段名统一为 `prev_draft_path`）
4. ✅ locked 状态切换责任主体已说清（补丁 9.3）
5. ✅ mode 默认值的双层护栏已说清（补丁 9.4 + 补丁 7 硬规则第四条）
6. ✅ draft-criteria 工具隔离已说清（补丁 9.5）
7. ✅ caller_mode 传递机制已说清（补丁 9.6）
8. ✅ rejected fallback 已按反馈类型分支（补丁 10.1）
9. ✅ 循环 A 中断恢复机制已说清（补丁 10.2）
10. ✅ 重命名向后兼容方案已说清（补丁 10.3，v4.1 上调至窗口 1 与重命名同步落地）
11. ✅ 批次 / 窗口 / 补丁映射表已建立（补丁 10.4）
12. ✅ 行号引用已改段落锚定（补丁 11.1）
13. ✅ TaskCreate 强制已撤回（v3 + 一致性传导）
14. ✅ 风险表已按 v3 / 补丁 4 重写
15. ✅ spec_refs 引用格式与 Product-Spec.md 章节编号对齐（补丁 8，v4.1 澄清）
16. ✅ 补丁 7 旧条目名 / 旧统计数字加注（v4.1）

---

## v4.1 施工前修复

> 实施前最终一审。修复 4 项必修 + 4 项建议——保证施工时不撞墙。原 v1/v2/v3/v4 内容保留，本节集中承载 v4.1 调整点。

### 修复清单

| # | 严重度 | 缺陷 | 修复位置 |
|---|---|---|---|
| **R1** | 🔴 必修 | 别名表（补丁 10.3）原归窗口 2，但重命名归窗口 1——窗口间空档期旧名调用会断 | [实施节奏修订] 窗口表 + [批次 ↔ 窗口 ↔ 补丁映射] + [实施顺序建议] 批次 0 + 补丁 10.4 反向索引 |
| **R2** | 🔴 必修 | `prev_draft` vs `prev_draft_path` 字段名不一致 | 补丁 10.2 (a) 行字段名统一 |
| **R3** | 🔴 必修 | "【共用规范】"段在 dev-builder.SKILL.md 不存在 | 补丁 9.1 改为按实际段名（[第一性原则] / [开发规则] / [开发策略] / [Phase 完成度判断] / [输出风格]）引用 |
| **R4** | 🔴 必修 | mode 默认值在补丁 5（有默认）与补丁 9.4（无默认）矛盾 | 补丁 5 required_packet 加 ⚠️ 注释 + 补丁 7 硬规则补第四条 |
| **R5** | 🟠 建议 | 补丁 1 "18 处" 与细项合计 19 不一致 | 改为"按 grep 实际数量替换"，附 grep 命令 |
| **R6** | 🟠 建议 | criteria 模板 `spec_refs` 用 markdown 锚点格式，与 Product-Spec.md 现状（章节编号）不衔接 | 补丁 8 模板加引用格式说明 |
| **R7** | 🟠 建议 | 补丁 7 文字描述"code-reviewer 条目 / implementer 条目"——批次 3 实施时这些条目已被批次 0 重命名 | 补丁 7 顶部加 ⚠️ 注 |
| **R8** | 🟠 建议 | 补丁 7 硬规则三条没明示"必须显式传 mode" | 硬规则补第四条 |

### v4.1 行数估算

| 修复项 | 行数 |
|---|---|
| R1（5 处调整窗口归属）| +10~15 |
| R2（1 处字段名）| 0（替换） |
| R3（补丁 9.1 重写引用段）| +5~10 |
| R4（补丁 5 加注 + 补丁 7 加条）| +5 |
| R5（补丁 1 加 grep 命令）| +3 |
| R6（补丁 8 加引用格式说明）| +3 |
| R7（补丁 7 加 ⚠️ 注）| +3 |
| R8（补丁 7 第四条）| +3 |

**v4.1 净增**：约 30~40 行。

**累计改造总量**：~530~620 行。

### v4.1 后施工绿灯条件

施工启动前必须完成以下检查，全 ✅ 才进窗口 1：

- [ ] `git status` 干净（无未提交改动）
- [ ] `git tag pre-batch-0`（窗口 1 启动前打 tag，便于回滚）
- [ ] `grep -rn 'implementer\|code-reviewer' .claude/` 输出已 review，确认替换范围
- [ ] CLAUDE.md / dev-builder.SKILL.md / 各 agent.md 当前内容已读，心里有底
- [ ] 已确认窗口 1 范围：批次 0（重命名 + 别名表）+ 批次 1（evaluator 双 mode 骨架）
- [ ] 已确认窗口 2 触发条件：用户即将开始 `/dev-planner` 或 `/dev-builder`

绿灯条件满足 → 开干。

---

### v4.1 施工日志（窗口 1 进行中）

**2026-05-16 批次 0 完成时撞 hook 阻断**：
- 现象：Edit `.claude/hooks/stop-gate.sh`（.sh 文件）→ `mark-review-needed.sh` 把它标为 needs_review → stop-gate 阻止停止 → 要求派 evaluator
- 根因：`mark-review-needed.sh` 排除清单只覆盖 `.md / .json / .yaml ...` 等业务文件后缀，**没考虑 hook 脚本本身（.sh）也属于 harness 配置范畴**
- 修复（用户确认方案 B：最小范围）：`mark-review-needed.sh` 排除清单加 `*/.claude/hooks/*.sh`——仅 hook 脚本被排除，`.claude/` 下其他无后缀文件仍走 review
- 副作用：审计层面，hook 脚本本身的改动不再走 review——但 hook 脚本就那 6 个固定文件，改动频率低、范围可控
- 同步：本次撞墙也加进绿灯条件清单的隐性前提——"harness 改造涉及 hook 脚本编辑时，先确认排除清单是否覆盖 .sh"

**经验沉淀**：未来增加任何 harness 改造，第一步先 `grep -rn '<被改文件后缀>' .claude/hooks/mark-review-needed.sh`，确认是否在排除清单——不在则先扩排除清单。否则会陷入"改→撞 hook→修 hook→再撞 hook"的循环。

---

### v4.2 调整：撤销别名表（2026-05-16）

**用户反馈**：CLAUDE.md 重构完成后，[别名表] 段每次会话加载消耗 18 行上下文——浪费。

**原设计**（补丁 10.3）：保留别名表 3 个产品周期，给"用户在 chat 里说旧名"和"其他项目 CLAUDE.md 引用旧名"做兼容。

**为何撤销**：
- 本项目 .claude/ 下已经没有旧名残留（grep 已 0 命中），主 Agent 不会自己用旧名
- 跨项目引用是低频场景——即便偶尔遇到，主 Agent 可以临场推理"implementer 应该是 generator"，不需要每次会话都把 18 行规则加载到上下文
- CLAUDE.md 是每次会话必加载的高频文件，应严格控制 token 占用
- 别名表的"价值密度"远低于 CLAUDE.md 其他段（注册表 / Hook 契约 / 路由优先级 / 项目旅程）

**实际动作**：
- CLAUDE.md：[别名表] 段已整段删除
- PLAN.md：保留补丁 10.3 历史描述（这是决策过程记录）+ 本节标记"实际撤销"

**经验沉淀**：兼容性方案有"显式规则"和"隐式约定"两种——
- 显式规则（写进高频上下文）：成本是每次加载消耗 token
- 隐式约定（靠主 Agent 推理）：成本是偶尔出错时需要纠偏
- 当兼容场景频率很低、推理代价不高时，**隐式约定 > 显式规则**
- harness 框架文件（CLAUDE.md / 各 SKILL.md / 各 agent.md）必须按"上下文成本 vs 价值密度"严格筛选内容

**对后续 harness 演化的规则**：
- 任何拟加入 CLAUDE.md / SKILL.md 的"兼容性 / 临时性"内容，必须先回答：
  1. 这条规则的触发频率是多少？（每会话 / 每周 / 每季度？）
  2. 不加这条规则，主 Agent 临场推理能否处理？
  3. 加上这条规则，每次会话的 token 成本是多少？
- 三个问题答案中若"频率低 + 可推理 + 成本高"任二满足 → 不加入高频上下文，靠 evolution / feedback 处理偶发场景

---

### v4.3 调整：撤销 [判定准则] + CLAUDE.md 内容硬性边界（2026-05-16）

**用户反馈**（语气严厉）："判定准则 多余，我让你改，不要增加废话上下文规则。CLAUDE.md 就是 agent skill 调用导向协调"

**原设计**：CLAUDE.md [判定准则] 段（v4 补丁 9.1 引入）记录"未来新增 skill / agent 选型准则"——约 13 行。

**为何撤销 + 模式识别**：
- **连续 2 次** AI 在 CLAUDE.md 塞演化设计规则被用户纠正（v4.2 [别名表] → v4.3 [判定准则]）
- 用户的元规则反馈："CLAUDE.md 就是调用导向协调"——这条规则比单点删除更重要
- AI 累积倾向：把"看起来有用"的规则堆进 CLAUDE.md，没区分"运行时调用"vs"演化设计"

**CLAUDE.md 内容硬性边界**（v4.3 升级，对所有后续 harness 演化生效）：

白名单（运行时调用协调，可在 CLAUDE.md）：
- [角色] [任务] [全局原则]（运行时纪律）
- [Skill 注册表] [Sub-Agent 注册表]（调用导向核心）
- [Hook 契约]（运行时 hook 协议）
- [路由优先级]（调用决策）
- [项目旅程]（阶段路由）
- [跨 Skill / Hook 闭环]（运行时闭环）
- [初始化流程]（启动协议）

黑名单（不属于 CLAUDE.md）：
- 设计准则 / 选型规则（如"skill vs agent 怎么选"）→ PLAN.md / skill-builder 触发时再查
- 兼容性规则 / 别名表 / 旧名映射 → 主 Agent 临场推理 + feedback 偶发处理
- 历史决策注解 / 补丁说明 → PLAN.md（设计文档）
- 边缘场景例外 / "未来可能用到"的规则 → 等真用到再加

**实际动作**：
- CLAUDE.md：[判定准则] 段已整段删除（现 10 段，纯调用导向）
- PLAN.md：保留补丁 9.1 中"判定准则"的描述（PLAN.md 是 PGE 改造设计文档，留这里合适）+ 本节标记"CLAUDE.md 实际撤销"

**v4.3 比 v4.2 升级一层**：
- v4.2 学到的是"单点成本评估"——三问筛选（频率 / 可推理 / 成本）
- v4.3 学到的是"属性归类"——不属于本文件职责的内容直接不写，不做主观成本权衡
- 属性归类比成本评估更硬：成本评估留主观判断空间，属性归类是二值的

**对 evolution-engine 的输入**：
v4.2 + v4.3 已构成 AI 行为模式累积证据：
- 模式名："harness 框架文件设计上的过度防御 / 内容属性归类缺失"
- 累积证据：[别名表]（v4.2）+ [判定准则]（v4.3）
- 修正方向：编辑 CLAUDE.md / 各 SKILL.md / 各 agent.md 前先做"属性归类"——不属于本文件职责的内容直接不写
- 建议产出：skill-builder 加一条"内容属性归类"前置检查规则；任何写 CLAUDE.md 的动作前都做白名单 / 黑名单分类
