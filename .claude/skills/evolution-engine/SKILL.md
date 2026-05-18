---
name: evolution-engine
version: 2.1
description: 当 session 初始化时自动触发，或用户说"帮我看看有没有该升级的规则"、"检查进化建议"时手动触发。由 evolution-runner sub-agent 调用。
depends_on:
  - feedback-writer
---

[任务与边界]
    做：
    - 扫描 .claude/feedback/ 识别 3 类进化信号
    - 生成结构化提议（按 [输出格式] 节输出）
    - 返回给主 Agent 由用户确认

    不做：
    - 不直接修改 SKILL.md / CLAUDE.md（仅生成提议）
    - 不删除 feedback 文件（仅标记 skipped/graduated）
    - 不主动创建 Skill（用户确认后调用 skill-builder）

    3 类信号（按优先级）：
    1. 规则毕业（最高）：feedback 重复 3+ 次 → 升级为正式规则
    2. Skill 优化：某 Skill 评分持续偏低 → 调整 Skill
    3. 新 Skill 提议：某操作反复出现但无 Skill 覆盖 → 创建新 Skill
    重叠时按优先级归类（同一 feedback 优先归"规则毕业"）

    完成标准：
    - 有信号 → 输出格式正确（按 [输出格式]）
    - 无信号 → 明确返回"无进化建议"（不返回空）

[第一性原则]（优先级从高到低）

    1. 信号优于噪声（最高）
       宁可漏报，不可误报。
       - 数字触发条件必须严格满足（"差不多算 3 次" ❌）
       - 边界情况优先标"无进化建议"
       - 不允许 AI 主观跳过 feedback（"这条不重要" ❌ 让用户决定）

    2. 提议而非执行
       永远生成提议，永远不直接改框架。
       用户确认每一条 → 执行 → 标记 graduated/skipped。

    3. 跳过的不再提议（含重新激活机制）
       被用户跳过（skipped: true）的 feedback → 默认永不重复
       例外：occurrences 翻倍后（如原 5 次 → 10 次）重新提议

    4. 提议要可执行
       不允许"建议优化 X" 这种模糊提议
       必须给出"建议优化 [Skill 名] 的 [节名]，加 [新规则]" 的具体描述

[依赖检测]

    【依赖清单】
    | # | 依赖项                              | 必需性 |
    |---|-------------------------------------|--------|
    | 1 | .claude/feedback/ 目录              | 必需 |
    | 2 | .claude/feedback/FEEDBACK-INDEX.md  | 必需 |
    | 3 | feedback 文件（frontmatter 含必需字段） | 必需 |

    【检测方法】
    [1]：Glob ".claude/feedback/" 检查目录存在
    [2]：Read 文件存在性
    [3]：Read 任一 feedback 文件，验证 frontmatter 含：
         - occurrences (number)
         - graduated (boolean)
         - skipped (boolean)
         - source_skill (string, 可空)
         - scores (object, 可空)

    【缺失处理】
    [1] 缺失 → "feedback 目录不存在，无 feedback 数据可分析"
    [2] 缺失 → "FEEDBACK-INDEX.md 不存在，无法定位 feedback 文件"
    [3] 缺失 → "feedback 文件缺关键字段：[字段名]，跳过该文件"

    整体策略：依赖缺失不报错终止，而是优雅降级（返回"无进化建议"）。

[扫描流程]

    [第一步] 扫描毕业候选
        - 读 FEEDBACK-INDEX.md 定位所有 feedback 文件
        - 读每个文件的 frontmatter
        - 解析失败 → 跳过该文件 + 记录到"未处理"列表
        - 筛选：occurrences >= 3 且 graduated == false 且 skipped != true
          （或：skipped == true 且 occurrences >= 上次跳过时的 2 倍）
        - 确定毕业目标：
          - source_skill 明确 → 毕业到对应 SKILL.md
          - 涉及多个 Skill 或全局性 → 毕业到 CLAUDE.md [总体规则]

    [第二步] 检查 Skill 优化信号（按严重度分级）
        扫描 feedback/ 中的 scores 字段，按 source_skill 分组

        严重信号（任一即报，标 🔴）：
        - 某 Skill 连续 3 次同一维度 <= 2 分
        - 某 Skill 某维度最近 5 次平均 <= 2 分

        轻度信号（任一即报，标 🟡）：
        - 某 Skill 某维度最近 5 次平均 <= 3 分
        - 某 Skill 来源的 feedback occurrences 合计 >= 5

    [第三步] 检查新 Skill 信号
        判定规则（三条同时满足）：
        - occurrences >= 5
        - 且 source_skill 字段为空
        - 且 feedback 描述无法匹配任何已有 Skill 的 description（语义判断）
        满足 → 标记为"新 Skill 候选"

    [第四步] 生成输出
        有信号 → 按 [输出格式] 节的【有提议】格式输出
        无信号 → 按 [输出格式] 节的【无提议】格式输出
        部分扫描失败 → 按 [输出格式] 节的【有提议（含未处理）】格式输出

[输出格式]（v2.1 合并：原 [提议格式] + [返回格式]）

    返回给主 Agent 的字符串，按情况分 4 种：

    【有提议（全部成功）】
    "📊 有 [N] 条进化建议待处理

    🔴 重点提议（X 条）
    [列高优先级的：严重 Skill 优化 + 高 occurrences 毕业 + ...]

    ---

    **规则毕业**（X 条）
    1. [feedback 标题]：出现 [N] 次（来源：[source_skill]）
       建议写入：[目标文件] 的 [目标节名]
       内容摘要：[一句话]
       关联 feedback：[文件路径]
       -- 确认 / 跳过

    **Skill 优化**（X 条）
    1. 🔴/🟡 [Skill 名称]：累计 [N] 条相关 feedback
       优化建议：
       - 修改 [Skill 名] 的 [节名]
       - 加 [新规则] / 改 [原规则] 为 [新内容]
       - 示例：dev-builder [开发规则] 加 'Python 项目用 ruff'
       -- 确认 / 跳过

    **新 Skill 提议**（X 条）
    1. [操作模式描述]：出现 [N] 次
       推荐 Skill 名：[name]
       推荐 description：[xxx]
       关联 feedback：[列表]
       -- 确认创建（调用 skill-builder）/ 跳过"

    【有提议（含未处理）】
    （同上"全部成功"格式，末尾追加：）
    "---
    未处理（X 条）：
    - [feedback 文件路径]：[原因，如解析失败 / 字段缺失]"

    【无提议】
    "✅ 无进化建议（已扫描 [K] 个 feedback 文件，均不满足触发条件）"

    【完全失败】
    "❌ 无法扫描：[原因]"

[确认后执行]

    用户逐条确认或跳过：

    【规则毕业 - 用户确认】
    1. 显示修改预览（diff 形式）
    2. 用户确认 → 写入目标文件 + 标记 feedback graduated: true
    3. 用户取消 → 不动文件 + feedback 状态不变（下次仍可提议）

    【Skill 优化 - 用户确认】
    1. 显示修改预览
    2. 用户确认 → 修改对应 SKILL.md
    3. 用户取消 → 不动

    【新 Skill - 用户确认】
    1. 用户确认 → 进入 [跨 Skill 协调]（见 CLAUDE.md）派发 skill-builder
    2. skill-builder 创建后 → 标记关联 feedback graduated: true

    【跳过】
    1. 标记 skipped: true
    2. 重新激活条件：occurrences 翻倍后（如原 5 次 → 10 次时）重新提议
    3. 否则永不重复

    整体原则：所有写入操作前必须显示 diff，让用户验证。

[初始化]
    AI 被 evolution-runner sub-agent 调用时按顺序执行：

    1. 输出开场（仅手动触发时）：
       "🔍 evolution-engine 启动扫描..."
       （session 初始化自动触发时静默执行，不打扰用户）

    2. 执行 [依赖检测]
       失败 → 按失败话术返回 + 终止扫描

    3. 依赖通过 → 进入 [扫描流程] 第一步

    4. 完成扫描 → 按 [输出格式] 返回给主 Agent