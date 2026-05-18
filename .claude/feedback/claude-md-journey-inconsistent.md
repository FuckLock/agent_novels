---
type: feedback
description: CLAUDE.md [项目旅程] 状态检测表与线性旅程不一致，设计阶段被永久跳过
created: 2026-04-23
updated: 2026-04-23
occurrences: 1
graduated: true
source_skill: N/A
---

# CLAUDE.md [项目旅程] 状态检测表与线性旅程不一致

**问题描述**：

CLAUDE.md [项目旅程] 章节存在内部矛盾——

1. 状态检测表映射：
   ```
   有 Spec，无 Plan，无代码 → /dev-planner
   ```
   直接跳过设计阶段。

2. 线性旅程声明：
   ```
   需求 → 设计规范（可选）→ 设计稿（可选）→ 开发计划 → 开发实现 → 发布
   ```
   设计阶段存在，只是"可选"。

结果：状态检测表从未反映"设计阶段"这个分叉。按状态检测逻辑，主 Agent 在 Spec 完成后会无条件直接推 /dev-planner，永远不会提示 /design-brief-builder 或 /design-maker。线性旅程里的"可选设计"成了一条死路径——文档里存在，路由上不可达。

**触发场景**：

用户在 /product-spec-builder 完成 AgentNovel（桌面 app，UI-heavy 产品）的 Spec 生成后，主 Agent 按状态检测表推荐了 /dev-planner 作为首选下一步，未提示设计路径选项。用户指出："CLAUDE.md [项目旅程]是不是有问题啊，产品生成呢，应该先进入设计吧？"

这不是主 Agent 独立判断错——是 CLAUDE.md 状态检测表本身的引导缺陷。

**实际影响**：

- 对 UI-heavy 产品（桌面 app / Web app / 移动 app），跳过 design-brief 导致 dev-planner 没有视觉依据 → 最终 dev-builder 做 UI 凭感觉
- 本项目（AgentNovel）UI 密度很高，本应在 Spec 完成后提示"要不要先定视觉方向"的路径分叉
- 当前 CLAUDE.md 的 UI/交互冲突优先级章节明确"无设计稿时 Design-Brief.md 定视觉方向"，但状态检测表又让这条路径无法被自然进入——自相矛盾

**额外发现（相关但非主要矛盾）**：

- 状态检测表只列了 Design-Brief.md 作为检测文件，未检测设计稿文件路径（design-maker 输出位置）
- 状态检测表缺少"UI 产品 vs 非 UI 产品"的判断维度——判断标准应该基于 Product-Spec.md [技术方向].产品类型 字段，但当前状态检测表对所有项目一视同仁

**教训/建议**：

1. 状态检测表必须与线性旅程保持结构一致——线性旅程里有的阶段，状态检测表必须给出进入该阶段的条件映射
2. "可选阶段"不应靠文档描述默认跳过，而应通过"项目类型判断"来分支：
   - UI-heavy 产品（桌面 / Web / 移动 app）→ 有 Spec 无 Brief → 建议先 /design-brief-builder（或至少提示分叉）
   - 非 UI 产品（CLI / SDK / 后端服务）→ 有 Spec → 直接 /dev-planner
3. 状态检测表应扩展产品类型维度，读 Product-Spec.md [技术方向].产品类型 字段决定路由
4. "可选"措辞误导——建议明确为"条件性"，并在状态检测表里写明触发条件
5. 若维持"默认直跳 /dev-planner"的简化行为，至少应在推荐时附带一句"如需先定视觉方向可 /design-brief-builder"的提示，不要让设计路径对用户不可见

---

## 实施记录

**2026-04-23** — 主 Agent 直接修改 CLAUDE.md [项目旅程]，修复内容：

1. 状态检测段后新增"产品类型判断（供路由决策用）"小节，基于 Product-Spec.md [技术方向].产品类型 字段判断 UI / 非 UI
2. "阶段 → 建议入口" 拆分"有 Spec，无 Design-Brief，无 Plan，无代码"为 UI / 非 UI 分支（UI 产品提示在 /design-brief-builder 与 /dev-planner 间选，推荐前者；非 UI 产品 → /dev-planner）
3. 新增"有 Spec + Design-Brief，无 Plan，无代码" 阶段映射到 /design-maker 或 /dev-planner
4. 加注"设计稿完成状态不由本地文件检测——design-maker 主要产出在设计 MCP 工具内（如 Pencil / Figma）"
5. 线性旅程第 3 行加"（在设计 MCP 工具内）"的说明

**验证方式**：本轮 AgentNovel 项目按新规则流转——Spec 完成后主 Agent 正确推荐 /design-brief-builder（而不是直接 /dev-planner），设计阶段被正确进入并完成 Design-Brief.md + pencil-welcome-desktop.pen 设计稿。

**状态变更**：graduated: false → true（问题已消除，规则已内化到 CLAUDE.md）
