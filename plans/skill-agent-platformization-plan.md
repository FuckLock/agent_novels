# Skill/Agent 平台化改造计划

## Summary

- 采用“分阶段平台化”：先把现有剧本/视频能力包成可导入、可绑定、可替换模型的 Skill Runtime，不重做业务功能。
- 核心原则：Skill 存理论和流程，代码只负责上下文组装、模型调用、工具执行、文件读写、Schema 校验。
- 模型来源统一为用户当前选择的 API 模型；Web 运行时不再保留本地命令行模型适配器。

## Key Changes

- 新增 `SkillRegistry + SkillRuntime`：
  - 支持导入 `.claude/skills/*/SKILL.md`、`web/Toonflow-app/data/skills/*.md`、本地文件夹/zip。
  - 解析 `name/description/version/stage/resources`，记录 md5、启用状态、绑定阶段。
  - 模型支持工具调用时使用 `activate_skill/read_skill_file`；不支持时由后端预加载选定 Skill 内容。
- 新增 `AgentRuntime`：
  - 定义 `decision/execution/supervision` 三类 Agent，但执行方式是后端 `runAgent()`，不是 Claude subagent。
  - 剧本管线绑定：故事骨架、改编策略、剧本、审核。
  - 制作管线绑定：导演分析、资产、导演规划、分镜表、分镜提示词、视频。
- 抽离硬编码 Prompt：
  - 从 `web/app/lib/agent/prompts.ts`、`web/app/lib/review-prompts.ts`、`web/app/lib/novels.ts` 中迁出创作理论。
  - 代码保留输入读取、输出保存、JSON/XML 解析、Schema 校验和错误处理。
- 统一模型层：
  - 扩展当前 `ModelConfig`，增加 `capabilities`: `streaming/tools/jsonSchema/vision/reasoning`。
  - 官方 API、OpenAI-compatible、DeepSeek、Kimi 都走同一 `ModelAdapter`。
  - 工作流阶段只记录 Agent + Skill Pack；模型由用户当前选择随请求传入，不再使用隐藏阶段绑定。

## Public Interfaces

- 新增 API：
  - `GET /api/settings/skills`：技能列表、状态、绑定关系。
  - `POST /api/settings/skills/import`：导入 Skill 包。
  - `GET/PUT /api/settings/skills/{id}`：查看/编辑技能内容。
  - `POST /api/settings/workflows/{workflow}/bindings`：绑定阶段使用的 Agent、Skill、Model。
- 新增核心类型：
  - `SkillManifest`: `id/name/description/version/entry/resources/stages/capabilities/hash/enabled`
  - `AgentDefinition`: `id/role/stages/defaultSkillIds/toolPolicy/outputSchema`
  - `WorkflowStage`: `id/inputRefs/outputRefs/schemaRef/agentId/skillIds/modelId`
- UI 增加“技能管理/工作流绑定”页：
  - 剧本工作流导入并启用“剧本 Skill Pack”。
  - Seedance 工作流导入并启用“制作 Skill Pack”。

## Migration Steps

- Phase 1：先实现 SkillRegistry，把现有硬编码 prompt 注册成内置 Skill，业务行为不变。
- Phase 2：把剧本生成链路切到 AgentRuntime，旧 `/chat` 和 `/execute` API 保持兼容。
- Phase 3：把 Seedance 制作链路切到 SkillRuntime，移除 `novels.ts` 内大段固定 system prompt。
- Phase 4：上线技能导入、编辑、绑定 UI。
- Phase 5：把 `.claude/agents` 作为导入来源保留，停止在 Web 运行时直接依赖 Claude subagent。

## Test Plan

- 单元测试：Skill frontmatter 解析、资源读取、阶段绑定、模型能力 fallback、输出 Schema 校验。
- 集成测试：同一剧本阶段分别用 DeepSeek、Kimi 等 API 模型跑 mock/小样本，确认不依赖工具原生 subagent。
- 回归测试：故事骨架、改编策略、剧本、导演规划、分镜表、分镜提示词的保存路径和前端展示不变。
- 安全检查：把当前模型配置里的明文 API Key 迁到环境变量或本地加密设置，避免继续写入仓库配置文件。

## Assumptions

- 先以当前 Next Web 项目为主线，不整体迁移 `web/Toonflow-app`。
- `web/Toonflow-app` 里的 `skillsTools.ts`、Agent/供应商抽象作为参考和可迁移代码。
- v1 不允许 Skill 执行任意脚本；Skill 只能提供指令和资源文件，工具能力由 Web 后端白名单提供。
