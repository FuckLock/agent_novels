# Skill / Agent 改造诊断 Checklist

> **使用方式：** 改造每一个 Skill 或 Agent 文件时复制本模板，逐项打勾。**任一项 ❌ 不得提交。**
>
> 配套计划书：`plans/skill-agent-standardization-plan.md`

---

## 模板一：Skill 改造诊断（22 个业务 Skill 用）

```
=========================================
文件：[/skills/xxx.md]
类型：Skill
改造前来源：[.claude/skills/xxx + prompts.ts:buildXxx + Toonflow data/skills/xxx]
改造后版本：v1.0.0
改造人：______
改造日期：____-__-__
=========================================

【1. Frontmatter 完整性（6 个必备字段）】

[ ] name        — kebab-case，与文件名一致
[ ] version     — 1.0.0（首版统一）
[ ] description — ≤150 字，描述触发时机
[ ] metaData    — ∈ {script_skills | seedance_skills | review_skills | shared_skills | asset_skills | art_skills | story_skills}
[ ] depends_on  — 依赖的其他 Skill 名字数组（无依赖填 []）
[ ] output_tag  — XML 输出标签名（与 [输出格式] 节一致）

【2. 9 要素节齐全】

[ ] [任务与边界]    — 做 / 不做 / 完成标准
[ ] [第一性原则]    — 3-5 条按优先级
[ ] [依赖检测]      — 业务数据前提 + 失败话术（不含"请先 /xxx"）
[ ] [核心知识层]    — 维度/规则/策略
[ ] [工作流程]      — 第 1 步 → 第 N 步
[ ] [输出格式]      — 含 XML 包裹示例（与 frontmatter.output_tag 一致）+ meta 注释
[ ] [输出风格]      — 语态 + 反例
[ ] [初始化]        — 入场协议（Web runtime 作为 system prompt 头部）

【3. 12 反模式扫描（任一命中均不合格）】

[ ] 不含 [文件结构] 单独成节
[ ] 不含 [技能] 与 [工作流程] 重复
[ ] 不含 [启动检查] 和 [初始化] 并存（统一用 [初始化]）
[ ] 不含 [提议格式] / [返回格式] 拆两节（合并 [输出格式]）
[ ] 不含 [信息充足度判断] 独立节（嵌入 [核心知识层] 子节）
[ ] 失败话术不含 "请先 /xxx"
[ ] 流程末尾不含 "接下来 /xxx"
[ ] 不含 [Skill 边界外] / [调用上下文]
[ ] "联网优先" 不作为第一性原则
[ ] depends_on 与 [依赖检测] 内容同步
[ ] 单文件不超 500 行（过大需拆 shared/）
[ ] 不含 [硬约束] / [禁忌规则] / [注意事项]（并入 [第一性原则]）

【4. 跨模型输出合约（v1 关键）】

[ ] [输出格式] 节明确写出 XML 包裹示例：<{output_tag}>...</{output_tag}>
[ ] [输出格式] 节末尾包含 meta 注释示例：<!-- meta: {"status":"passed","stage_reached":N,"failure_count":{}} -->
[ ] LLM 模拟测试：扔给 DeepSeek-R1，能正确产出包裹格式 + meta 注释（不输出 <think> 残留）

【5. 内容等价性（关键！）】

[ ] 原 .claude/skills/xxx 业务知识 100% 迁移（无丢失）
[ ] 原 prompts.ts:buildXxx 实际用到的所有字段进入 Skill
[ ] Toonflow 蓝本（如有）的核心逻辑已采纳
[ ] depends_on 引用的 shared/* 资源在 §2.2 清单中存在

【6. 端到端验证】

[ ] 用 novels/造化之门 完整数据，调用 runAgent 跑通本 Skill 对应阶段
[ ] 产出文件结构与改造前一致（路径 + 字段 schema）
[ ] 内容长度在 ±30% 区间
[ ] 关键段落齐全（如骨架的三幕结构、剧本的集名+集末钩子）

=========================================
最终判定：[ ] 通过 / [ ] 不通过
不通过原因：______
回滚动作：[git checkout HEAD -- /skills/xxx.md]
=========================================
```

---

## 模板二：Agent 改造诊断（8 个业务 Agent 用）

```
=========================================
文件：[/agents/xxx.md]
类型：Agent
改造前来源：[.claude/agents/xxx.md]
改造后版本：v1.0.0
改造人：______
改造日期：____-__-__
=========================================

【1. Frontmatter 完整性（7 个字段）】

[ ] name             — 与文件名一致
[ ] version          — 1.0.0
[ ] description      — ≤150 字
[ ] skills           — 主 Skill 数组（scriptAgent-main 可为 []）
[ ] attached_skills  — v1 文档字段（runtime 不读取）；剧本 3 个 Agent 含故事类型 director_skills（Q4=A 决定）
[ ] model            — 默认模型 fallback
[ ] tools            — v1 文档字段（[Read, Write, Edit, Glob, Grep] 等）
[ ] color            — UI 颜色

【2. 6 节结构齐全】

[ ] [任务]      — 使命 2-3 句，禁写业务流程
[ ] [角色]      — 人设 + 铁律 + 边界
[ ] [前置条件]  — caller 必传 packet 字段 + 校验规则 + 失败话术
[ ] [工作流程]  — 4 步骨架（签收 → 校验 → 调 Skill → 异常）
[ ] [输出规范]  — status / stage_reached / failure_count 机器字段约定

【3. 6 条 Agent 错位红线】

[ ] 不是 Markdown ## 标题混用（必须 [节名] 格式）
[ ] [前置条件] 是接口契约（packet 字段），不复制 Skill [依赖检测]（业务数据）
[ ] [工作流程] 是唯一写"按顺序执行"的节（单入口）
[ ] tools 白名单存在（v1 仅文档；v2 物理约束）
[ ] [任务] 不含业务流程细节（业务在 Skill）
[ ] caller-agnostic（写"由 caller 派发"，不绑死 caller 身份）

【4. 跨模型输出合约】

[ ] [输出规范] 节明确 status / stage_reached / failure_count JSON 字段约定
[ ] [输出规范] 复述 §6.3 的 meta 注释格式（与 Skill 一致）
[ ] [前置条件] 失败话术不含"请先 /xxx"

【5. 业务零复制】

[ ] [任务] 节不超 3 句话
[ ] [工作流程] 不含 mode 分支细节（业务在 Skill 内）
[ ] [工作流程] 不含具体维度评分细节（业务在 review/* Skill 内）
[ ] 检查原 .claude/agents/xxx.md 中所有业务规则已下沉到对应 /skills/xxx.md

【6. 端到端验证】

[ ] runAgent 加载本 Agent 成功（loadAgent 解析 frontmatter + 6 节）
[ ] packet 校验：缺关键字段返回失败话术
[ ] packet 完整：能正常加载主 Skill + attached_skills + 画风/故事类型包
[ ] LLM 调用产出 status='passed' 且 output_tag 包裹的业务正文非空

=========================================
最终判定：[ ] 通过 / [ ] 不通过
=========================================
```

---

## 模板三：画风/故事类型包诊断（迁入时用）

```
=========================================
目录：[/skills/{art-styles|story-genres}/{name}/]
类型：[Art Style | Story Genre]
来源：Toonflow data/skills/{art_skills|story_skills}/{name}/
=========================================

【1. 目录结构（画风：12 份 md / 故事类型：3 份 md）】

画风必检：
[ ] README.md
[ ] prefix.md（含 frontmatter）
[ ] images/
[ ] art_prompt/art_character.md
[ ] art_prompt/art_character_derivative.md
[ ] art_prompt/art_scene.md
[ ] art_prompt/art_scene_derivative.md
[ ] art_prompt/art_prop.md
[ ] art_prompt/art_prop_derivative.md
[ ] art_prompt/art_storyboard_video.md
[ ] director_skills/director_planning_style.md
[ ] director_skills/director_storyboard.md
[ ] director_skills/director_storyboard_table_style.md

故事类型必检：
[ ] README.md
[ ] images/
[ ] director_skills/director_planning_narrative.md
[ ] director_skills/director_storyboard_table_narrative.md

【2. 拼写修正】

[ ] Toonflow 原 driector_skills/ 已改名为 director_skills/

【3. Frontmatter 补充】

[ ] 每个 md 文件已添加 frontmatter（name + version + description + metaData）
[ ] metaData 字段正确（画风=art_skills / 故事类型=story_skills）

【4. skill-loader 加载验证】

[ ] loadSkillPack({ artStyle: 'xxx', stage: 'B' }) 返回 art_prompt/* 资源
[ ] loadSkillPack({ artStyle: 'xxx', stage: 'C1' }) 返回 director_skills/* 资源
[ ] mapArtStyleToDir / mapStoryGenreToDir 中文→目录名映射正确

=========================================
最终判定：[ ] 通过 / [ ] 不通过
=========================================
```

---

## 全局质量门（每个 Phase 完成后填写）

| Phase | 通过 Skill/Agent 数 | 不通过数 | 主要原因 | 计划书更新 |
|-------|---------------------|---------|---------|-----------|
| Phase 1A（14 个 Seedance Skill） | __ / 14 | __ | — | — |
| Phase 1B（4 个剧本 Skill） | __ / 4 | __ | — | — |
| Phase 1C（9 个画风包） | __ / 9 | __ | — | — |
| Phase 1E（12 个故事类型包） | __ / 12 | __ | — | — |
| Phase 2（8 个 Agent） | __ / 8 | __ | — | — |

**通过率 < 80% 时，停下来分析共性问题，更新规范后再批量整改。**
