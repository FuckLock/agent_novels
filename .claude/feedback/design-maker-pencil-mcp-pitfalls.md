---
type: feedback
description: design-maker 未覆盖 Pencil MCP batch_design 的 4 类技术陷阱，主 Agent 多次回滚才跑通
created: 2026-04-23
updated: 2026-04-23
occurrences: 1
graduated: false
source_skill: design-maker
---

# design-maker 未覆盖 Pencil MCP batch_design 的 4 类技术陷阱

**问题描述**：

主 Agent 按 design-maker SKILL.md 流程调用 Pencil MCP 的 batch_design 为 AgentNovel 项目生成设计稿时，遭遇 4 个在 SKILL.md 和 Pencil MCP 自带 guidelines 里都未清晰警示的技术陷阱，连续回滚多次 batch_design 调用，消耗额外上下文才跑通。

**触发场景**：

执行 /design-maker，调用 Pencil MCP 的 batch_design 创建根 frame + 子元素的复合结构时。

**4 个具体陷阱**：

**坑 1：parent 参数不接受 binding 变量**
- 现象：`I(parent_binding, {...})` 的 parent 参数用 binding 变量不生效——binding 变量（如前一行 `root=I(document,{...})` 里的 `root`）不被解析为 parent id，新建子元素被插到文档顶层，而不是 binding 指向的父节点下。
- 例外：`document` 是预定义 binding，可直接使用。
- 规避：parent 参数必须用 string id。

**坑 2：同一 batch_design 内新建的节点不能立即作为后续操作的 parent**
- 现象：即使用 `{id: "my-id", ...}` 显式指定 id，同一批次的后续行用 `I("my-id", {...})` 也会报 `Can't find parent node with id 'my-id'`。
- 规避：
  - 方式 A：跨 batch_design 调用——前一次创建 → 拿到返回 id → 下一次用该 id。
  - 方式 B：用 `children: [...]` 数组在单次 `I()` 里嵌套整棵子树。

**坑 3：特殊 Unicode 字符和嵌套双引号破坏 operations 字符串解析**
- 现象：
  - 勾号 `U+2713`、部分 emoji 会让 MCP parser 报 `SyntaxError: Unexpected character`。
  - text content 里出现 `"` 双引号（如「"已配 API"」）会 break 外层字符串包裹。
- 规避：特殊字符用中文全角（如「」）或普通 ASCII 替代；嵌套引号用单引号或全角引号。

**坑 4：get_screenshot 对大尺寸嵌套顶级容器返回白板缩略图**
- 现象：实际 .pen 文件里渲染正常，但 `get_screenshot` 抓到的缩略图看起来像 frame 没填内容（其实 children 都在）。
- 规避：
  - 换用子节点 id 截取局部截图；
  - 信任 `batch_get` 的结构数据判断，不依赖缩略图做完成度判断。

**教训/建议**：

design-maker SKILL.md 应补充「Pencil MCP 实战避坑」章节，覆盖：
1. parent 参数规则：string id only，document 是唯一可用 binding。
2. 单 batch 内节点引用约束：新建节点 id 跨 batch 才可引用；单 batch 内嵌套请用 `children`。
3. operations 字符串的字符白名单 / 转义策略：避开非 ASCII 特殊符、嵌套双引号。
4. 完成度校验策略：优先用 `batch_get` 结构数据判断，截图仅作为辅助视觉检查。

这 4 条在 Pencil MCP 的 get_guidelines 输出里未清晰警示，应由 design-maker Skill 自身固化为"调用 Pencil MCP 前的 checklist"。
