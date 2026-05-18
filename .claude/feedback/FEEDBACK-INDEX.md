# Feedback Index

> 经验教训索引。新建或更新 feedback 文件后，同步更新此索引。
> 格式：每条一行，`- [标题](文件名.md) — 一句话描述`
> 模板：templates/feedback-topic-template.md

## product-spec-builder

- [product-spec-builder 越界：在 Spec 阶段做 V1/V2 交付切分](product-spec-scope-boundary.md) — Spec 阶段误问 V1/V2 分期，侵入 dev-planner 职责，应只描述完整产品形态

## CLAUDE.md / 路由逻辑

- [CLAUDE.md [项目旅程] 状态检测表与线性旅程不一致](claude-md-journey-inconsistent.md) — 状态检测表让 Spec 完成后直跳 /dev-planner，线性旅程里"可选设计阶段"永远不可达，UI-heavy 产品丢失设计分叉

## design-maker

- [design-maker 未覆盖 Pencil MCP batch_design 的 4 类技术陷阱](design-maker-pencil-mcp-pitfalls.md) — parent 参数不认 binding / 单 batch 内新 id 不可引用 / 特殊字符破坏解析 / get_screenshot 对大容器返回白板缩略图

## harness 演化 / skill-builder

- [AI 持续低估 CLAUDE.md 高频上下文成本，倾向写文档体而非运行时手册](harness-context-cost-evaluation-missing.md) — 【occurrences=3，重复模式 + 整体级元判断】v4.2 别名表 + v4.3 判定准则 + v4.4 整体精简 35%（432→283 行）连续被用户撤销/砍——前两次缺"内容白名单"门（塞错内容），第 3 次缺"手册体写作硬规则"门（白名单内容也写得啰嗦），用户元判断从"删某段"升级到"整个文件还有废话"
- [v4 改造一致性传导漏洞：大规模重构后局部引用未更新](harness-v4-reference-propagation-gap.md) — dev-planner call_mode 改为 via_agent(planner) 后，[Skill 注册表] 主条目已改，但 [项目旅程] 阶段路由表 4 处 + [线性旅程] 1 处旧引用未同步——大规模重构需做"引用一致性传导扫描"
