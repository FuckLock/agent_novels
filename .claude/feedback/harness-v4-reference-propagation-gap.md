---
type: feedback
description: v4 改造时 dev-planner call_mode 改为 via_agent(planner) 后，CLAUDE.md 仅改 [Skill 注册表] 主条目，[项目旅程] 和 [线性旅程] 5 处旧引用未同步
created: 2026-05-16
updated: 2026-05-16
occurrences: 1
graduated: false
source_skill: N/A
---

# v4 改造一致性传导漏洞：大规模重构后局部引用未更新

**问题描述**：
v4 改造把 dev-planner skill 的 call_mode 从 direct 改为 via_agent(planner)，并在 [Skill 注册表] 主条目 + 硬规则段落完成更新；但 CLAUDE.md 同文件内另外两个引用区域被遗漏：
- [项目旅程] 阶段路由表 L342-347：4 处仍写 `/dev-planner`
- [线性旅程] 段 L354：1 处仍写 `dev-planner`

用户在阅读 [项目旅程] 时发现，用询问语气提醒："现在 dev-planner 应该由 planner agent 调用呢吧，这里是不是不合适呢？"

修正后：阶段路由表 + 线性旅程统一改为 `planner`（派发目标 agent 名）；[Skill 注册表] entry 字段中的 `/dev-planner` 保留——那是用户 slash 命令入口，不是 skill 直调引用。

**触发场景**：
- 大规模重构 / 架构升级（如 v3 → v4 PGE 双循环引入）
- 改造范围跨 CLAUDE.md 多个段落（[Skill 注册表] + [Sub-Agent 注册表] + [项目旅程] + [跨闭环] + 硬规则）
- AI 改造时只聚焦"主定义点"（注册表条目），忽视"次引用点"（项目旅程映射 / 线性流程描述 / 跨闭环段落里嵌入的 skill 名）
- v4 改造收尾期间，本次是第 3 次发现遗漏类问题

**教训/建议**：

1. **大规模重构必须做"引用一致性传导扫描"**
   改某个 skill 的 call_mode / agent 派发关系 / skill 名时，不能只改注册表条目；必须用 grep 扫描 CLAUDE.md 全文，确认所有出现该 skill 名 / agent 名的位置都已对齐。

2. **CLAUDE.md 内的"次引用点"清单（用于自检）**
   - [Skill 注册表] 主条目（已自然命中）
   - [Sub-Agent 注册表] 主条目（已自然命中）
   - 硬规则段（"X 一律先派 Y" 类）
   - [项目旅程] 阶段路由表（"阶段 → 建议入口" 映射）
   - [项目旅程] 线性旅程段
   - [跨 Skill / Hook 闭环] 各闭环描述里嵌入的 skill / agent 名
   - [初始化流程] / [路由优先级] 中引用的具体 skill 名
   改造前在改造计划里"逐节列出预期修改点"，比改完之后查漏更可靠。

3. **区分"用户 slash 入口"与"内部派发引用"**
   v4 改造后，`/dev-planner` 仍然是合法的用户 slash 命令入口（写在 entry 字段）；但任何"AI 路由 / 阶段映射 / 派发目标"语境下出现的 dev-planner 必须改成 planner。这两类引用语义不同，不能一刀切替换，需要分语境判断。

4. **与已有 feedback 的关系**
   `harness-context-cost-evaluation-missing.md`（occurrences=2）属"加了不该加的内容"——CLAUDE.md 内容属性边界问题。
   本条属"漏改了应该改的引用"——大规模重构的引用传导一致性问题。
   两者根因不同但有共性：都是"AI 对 CLAUDE.md 的处理在大规模改造时不到位"，未来若再次出现同类型问题，evolution-engine 可考虑把两条合并为更高层规则（如"CLAUDE.md 重构前必须先列改造影响面清单"）。
