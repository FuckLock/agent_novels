---
type: feedback
description: product-spec-builder 在 Spec 阶段越界询问 V1/V2 交付阶段切分，侵入 dev-planner 职责
created: 2026-04-23
updated: 2026-04-23
occurrences: 1
graduated: true
source_skill: product-spec-builder
---

# product-spec-builder 越界：在 Spec 阶段做 V1/V2 交付切分

**问题描述**：
在 /product-spec-builder 流程收集"核心功能"维度时，AI 列出完整功能清单（A-G 七大模块）后，直接要求用户"① 标 V1 必做 ② 标 V2 再说 ③ 指出遗漏"，把"交付阶段切分"塞进了 Spec 阶段。

用户明确修正：
> "我觉得都做，首先你只是生成产品文档，作为生成产品，你产品肯定是要完整的，然后后面肯定一步步开发的。"

用户的观点可以拆成三条：
1. product-spec-builder 的产出是"完整产品 Spec"，应描述完整产品形态（what + why），不是裁剪后的最小集
2. "V1 / V2 拆分"属于开发阶段概念，应在 dev-planner 里做（何时交付）
3. Spec 阶段主动要求用户做 V1/V2 = 职责边界越界

**触发场景**：
- Skill：product-spec-builder
- 维度：[核心功能] 收集
- 具体动作：列出功能清单后追加"标 V1 必做 / V2 再说"的裁剪问题
- 用户直接拒绝这种切分，要求 Spec 保留完整范围

**教训/建议**：
1. product-spec-builder 的 [核心功能] 维度，只负责"产品完整范围 + 每个功能的 what/why"，不负责"什么时候做、分几期做"
2. Spec 阶段不主动提出"MVP / V1 / V2 / 分期"等交付节奏问题——那是 dev-planner 的领地
3. 若用户主动提分期诉求 → 记录为"用户偏好"，引导到 dev-planner 阶段处理，不在 Spec 里落地
4. 职责边界检查：product-spec-builder 的收集问题必须是"这个功能是什么 / 为什么要 / 用户怎么用"类，而不是"先做什么 / 后做什么"类
5. 可在 product-spec-builder SKILL.md 的 [核心功能] 维度加一条反模式警示："禁止询问 V1/V2 分期切分——那是 dev-planner 的职责"

---

## 实施记录

**2026-04-23** — 提前实施（未达 occurrences=3 毕业阈值但问题明显，属 caller 自主决策）：

主 Agent 在 `.claude/skills/product-spec-builder/SKILL.md` 的 [任务与边界] 章节"两种模式都不做"清单中加入一条具体约束：

> - 不切分交付阶段（V1 / V2 / MVP 分期属 dev-planner 的 Phase 拆分职责）

此前该章节只有"不规划开发（属 dev-planner）"一条泛约束，AI 执行时未把"V1/V2"识别为"规划开发"的具体形式。现在用具体关键词硬锁死，避免后续再犯。

**状态变更**：graduated: false → true（提前实施，属 caller 自主决策，不走 evolution 数据驱动毕业流程）
