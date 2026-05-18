---
name: feedback-writer
version: 2.0
description: 当主 Agent 检测到值得记录的反馈信号（用户修正 / 未覆盖场景 / 重复操作 / 质量问题 / Skill 效能评估）时由其调用。分析信号是否值得记录，写入 feedback 集合并更新索引。
depends_on: []
---

[任务与边界]
    做：
    - 接收调用方传入的上下文，判断是否含有 [信号维度] 5 类之一
    - 有信号且项目相关 → 写入 $FEEDBACK_DIR 并更新索引
    - 无信号或项目无关 → 返回"无新 feedback"

    不做：
    - 不主动监听用户对话（由调用方传入上下文）
    - 不判断 feedback 是否成熟到该升级（属 evolution-engine 职责）
    - 不修改已有 feedback 的"教训"内容（只更新 occurrences 计数和 updated 字段）

    完成标准：
    - 信号判定明确（命中哪几类 / 无信号）
    - 有信号则文件已写入 + 索引已更新
    - 返回消息明确说明做了什么

[第一性原则]（优先级从高到低）

    1. 宁漏不滥（最高）
       只记录确实观察到的 [信号维度] 5 类之一
       模糊或不确定 → 不写
       一条信号只写一处（去重）

    2. 第 1 次就记录
       不等到"反复出现"才记
       第 1 次 occurrences = 1
       是否成熟到升级 → 由 evolution-engine 判断，不归本 Skill

    3. 反膨胀
       Skill 效能评估的 4 维评分必须有证据
       禁止"看起来都通过"，按 [反膨胀规则] 硬扣分

    4. 信号嵌入维度
       5 类信号判定标准嵌入 [信号维度]
       不另设独立的"信号充足度判断"节

[依赖检测]
    必需（缺失则终止）：

    [1] 信号上下文（由调用方传入）
        包含：触发对话片段 + 涉及 Skill 名（如适用）+ 时间
        失败话术：
          "feedback-writer 需要调用方传入信号上下文，未收到。"

    可选（缺失则降级）：
    - $FEEDBACK_DIR/templates/feedback-index-template.md → 缺失时用 SKILL 内嵌格式
    - $FEEDBACK_DIR/templates/feedback-topic-template.md → 缺失时用 SKILL 内嵌格式
    - $FEEDBACK_DIR/FEEDBACK-INDEX.md → 不存在则首次写入时按模板创建

    [路径变量]
    $FEEDBACK_DIR = 项目的 feedback 集合位置（Claude Code 默认 .claude/feedback/）
    其他框架/项目按对应约定提供。

[信号知识]

    内部按"维度 / 规则 / 策略"三组组织。

    ━━━ 【维度组 - 看什么】━━━

    [信号维度]（触发记录的 5 类信号）

    1. 用户修正
       触发：用户修正 AI 的具体行为
       识别词："不是这样的" / "别这样做" / "你搞错了" / 用户手动改了 AI 输出
       记录字段：source_skill = 被修正的 Skill 名；body = 被修正的具体行为
       充足标准：必须能指出"哪个 Skill 的什么行为被修正"

    2. 未覆盖场景
       触发：Skill 执行中遇到了 SKILL.md 没指导的情况
       识别词：AI 临时发明做法 / 跳过步骤 / 不确定怎么做
       记录字段：source_skill = 缺指导的 Skill；body = 缺了什么
       充足标准：必须能指出"哪个 Skill 缺了哪条指导"

    3. 重复操作
       触发：用户用自然语言要求做某类操作，且不属于任何已有 Skill
       识别词：用户自然语言要求 + 当前无对应 Skill 覆盖
       记录字段：source_skill = N/A；body = 操作模式描述
       充足标准：必须能描述"操作模式"
       去重：已有同主题 → occurrences +1

    4. 质量问题
       触发：审查/修复 Skill 发现代码质量问题
       识别词：审查报告标注"建议记录 feedback" / 修复 Skill 发现同类问题
       记录字段：source_skill = 报告来源 Skill；body = 问题类型
       充足标准：必须能描述"问题类型"
       去重：已有同主题 → occurrences +1

    5. Skill 效能评估
       触发：Skill 执行完毕（仅 Skill 执行后评估，日常对话不打分）
       记录字段：source_skill + scores（4 维评分 + evidence 句）
       充足标准：每个分数必须有 evidence

    [4 维评分标准]（仅信号 5 用）

    精准度 accuracy — Skill 指引是否准确？
    5: 零修正 / 4: 微调 1-2 处 / 3: 修正 3+ 处 / 2: 方向重做 / 1: 用户放弃

    覆盖度 coverage — Skill 是否覆盖实际需要？
    5: 完全按指引 / 4: 1 处自行处理 / 3: 2-3 处临时决策 / 2: 大量自由发挥 / 1: 严重不匹配

    效率 efficiency — 流程是否顺畅？
    5: 一次通过 / 4: 1 次澄清 / 3: 2-3 次来回 / 2: 多次来回 / 1: 卡死

    满意度 satisfaction — 用户接受程度？
    5: 主动表达满意 / 4: 无负面评价 / 3: 提了修改意见 / 2: 要求大幅修改 / 1: 否定产出

    ━━━ 【规则组 - 守什么】━━━

    [路由规则]
    - 同一信号只写一处（去重）
    - 已有同主题 → 更新内容 + occurrences +1 + 更新 updated 字段
    - 没有同主题 → 创建新文件 + 更新索引

    [写入位置规则]
    - 项目相关信号 → 写到 $FEEDBACK_DIR
    - 项目无关信号（用户通用偏好等）→ 不写，由框架默认机制处理

    [反膨胀规则]（防虚高分）
    - 有修正 → 精准度 ≤ 3
    - 临时发明 → 覆盖度 ≤ 3
    - 2+ 次来回 → 效率 ≤ 3
    - 有修改意见 → 满意度 ≤ 3
    每个分数必须填 evidence 句作为依据

    [文件命名规则]
    - 文件名：kebab-case + 简短描述主题（如 product-spec-image-handling.md）
    - 索引行格式：`- [标题](文件名.md) — 一句话描述`

    ━━━ 【策略组 - 怎么做】━━━

    [项目相关性判断策略]
    判断信号"项目相关 vs 无关"：
    - 涉及当前项目代码 / Spec / Plan / Skill → 相关
    - 用户通用偏好 / 与项目无关的对话 → 无关
    - 含项目特定术语 → 相关
    - 模糊时 → 默认不写（宁漏不滥）

    [去重策略]
    1. 读取 $FEEDBACK_DIR/FEEDBACK-INDEX.md
    2. 按主题关键词搜索现有条目
    3. 找到同主题 → 走"更新"路径
    4. 没找到 → 走"创建"路径

[工作流程]

    第 1 步：判定信号
        - 扫描调用方传入的上下文
        - 按 [信号维度] 5 类逐一检查
        - 命中 0 类 → 跳到 [输出格式] 返回"无新 feedback"
        - 命中 1+ 类 → 进入第 2 步

    第 2 步：项目相关性判断
        按 [项目相关性判断策略] 判定
        - 无关 → 不写，跳到 [输出格式] 返回"无新 feedback"
        - 相关 → 进入第 3 步

    第 3 步：去重检查
        按 [去重策略] 操作
        - 已有同主题 → 准备"更新"
        - 没有 → 准备"创建"

    第 4 步：写入
        按 [写入位置规则] + [文件命名规则] 操作
        - 创建新文件 → 用 templates/feedback-topic-template.md（缺失则用 SKILL 内嵌格式）
        - 更新文件 → 改内容 + occurrences +1 + updated
        - 如是 Skill 效能评估（信号 5）→ 按 [反膨胀规则] 校验后写入
        - 同步更新 FEEDBACK-INDEX.md

    第 5 步：返回
        按 [输出格式] 返回执行结果

[输出格式]

    【物理产物 - 写到磁盘】

    位置：$FEEDBACK_DIR/
    索引文件：$FEEDBACK_DIR/FEEDBACK-INDEX.md
    feedback 文件：$FEEDBACK_DIR/[kebab-case-topic].md

    feedback 文件 frontmatter 字段（详见 templates/feedback-topic-template.md）：
    - type: feedback
    - description: [一句话摘要]
    - created / updated: YYYY-MM-DD
    - occurrences: [整数]
    - graduated: false
    - source_skill: [skill-name 或 N/A]
    - scores:（仅 Skill 效能评估时填）accuracy / coverage / efficiency / satisfaction / evidence

    feedback 文件 body 字段：
    - 问题描述 / 触发场景 / 教训建议

    【消息产物 - 返回给调用方】

    - 有新记录："✅ 记录了 1 条 feedback：[标题]（[文件名]）"
    - 更新已有："🔄 更新了 [文件名]，occurrences: N → N+1"
    - 多条混合："✅ 记录 X 条 / 🔄 更新 Y 条"
    - 无信号："○ 无新 feedback"

[初始化]

    AI 被任何上游机制（如 feedback-observer sub-agent 等）调用时按顺序执行：

    1. 执行 [依赖检测]
       必需失败 → 按失败话术终止
       可选失败 → 标记降级模式继续

    2. 进入 [工作流程] 第 1 步
