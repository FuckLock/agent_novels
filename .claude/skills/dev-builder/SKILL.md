---
name: dev-builder
description: 开发能力库：编码规则 / 完成度判断 / 输出风格 / 反偷懒清单 / 项目依赖检查清单。被 caller 文本引用规范段（不被直接执行）。
version: 3.0
depends_on:
  - product-spec-builder
  - dev-planner
  - design-brief-builder
---

[任务与边界]
    做（提供以下能力）：
    - 编码规范库：[第一性原则] / [开发规则] / [Phase 完成度判断] / [输出风格] / [反合理化清单]
    - 项目依赖检查清单：[依赖检测]

    不做：
    - 不被串行执行（library 性质，[工作流程] 是按需引用映射，不是步骤化执行）
    - 不编排 agent / 不协调流程（编排归 caller，不在本 skill）
    - 不主动修改任何文件（纯引用文档）

    完成标准（被引用时）：
    - 被引用段内容明确、可执行
    - 不含跨界编排逻辑

[第一性原则]
    1. 验证即证据（硬性门禁）：完成声明必须在同一消息中含刚执行的验证命令及其输出
       - "完成了" + 同一消息的编译输出 = 有效
       - "完成了" + "之前编译过了" / 无验证命令 = 无效

    2. 修改纪律：动手前评估影响范围（文件 / 功能）→ 动手后回归验证；不改坏已有功能

    3. 文档驱动 + SDK-First：优先用 Spec / Plan / Brief / SDK 已有能力；外部库/API 前 WebSearch 验证版本；不造轮子

    4. 文件精简：单文件 ≤ 300 行（超了按职责拆分）；三行简单代码好过一个过度抽象

    5. 设计参照纪律（仅 UI 产品）：
       - 有设计 MCP → 每次编码重读精确数值（不凭记忆 / 审美）
       - 无 MCP 有 Brief → 严格按 Brief 视觉方向推导
       - 无 MCP 无 Brief → 不允许写 UI 代码（停止 + 提示 /design-brief-builder）
       不允许 AI 想"差不多的颜色" / 凭训练数据决定布局

[反合理化清单]
    AI 容易用"合理"理由跳过规则。常见话术 → 正确应对：

    跳过验证 / 软性完成：
    - "我刚测过" / "应该没问题" / "看起来正确" / "大概率通过"
      → 当场运行 + 给证据；"没问题"需要证据，概率不是证据
    - "不可能出错" → 不可能的最容易出错
    - "编译过就行" → 编译 ≠ 功能正常，四步走每步都要

    虚化交付：
    - "实现时再想细节" → 动手前先想清楚（详见 [第一性原则].2 修改纪律）
    - "添加必要的错误处理" → 指明处理哪些 + 怎么处理

[依赖检测]
    依赖项：
    - Product-Spec.md  —— 必需（含 [功能需求] 章节）
    - DEV-PLAN.md      —— 必需（含 [技术栈表]）
    - 技术栈工具       —— 必需（按 DEV-PLAN.md [技术栈表]）
    - Design-Brief.md  —— UI 产品必需
    - 设计工具 MCP     —— UI 产品推荐
    - gh CLI / playwright —— 可选

    产品类型（读 DEV-PLAN.md [技术栈表]）：
    - 有 UI：React / Vue / Svelte / Next.js / Electron / Tauri / React Native / Vite + 前端框架等
    - 无 UI：纯后端（Node.js / Python / Go / Rust）/ CLI（Commander/Click/Cobra）/ API（Express/FastAPI/Gin）/ 数据脚本
    - 混合（API + 前端）→ 按"有 UI"处理

    缺失处理（话术只陈述事实，不跨 Skill 引导）：
    - 必需缺失（Spec / Plan / 技术栈工具）→ 终止："dev-builder 需要 [依赖名]，未找到。"
    - Design-Brief.md（UI 产品）缺失 → 终止："UI 产品（识别到：[框架名]）需要 Design-Brief.md，未找到。"
    - 设计 MCP（UI 产品）缺失 → 警告不阻塞，给选项：(a) 等待 (b) Brief-only 继续 (c) 跳过
    - gh CLI 缺失 → 降级"跳过 GitHub 集成"
    - playwright 缺失 → 降级"跳过 UI 自动化测试"

    系统工具安装（仅技术栈工具）：
    - node / python / go → 自主装（brew / apt / curl）
    - 需 sudo → 提示用户授权
    - 大型工具（Xcode）→ 提示用户手动装

[开发规则]

    【代码层面】
    - 命名规范（按语言）：
      TS/JS: 组件 PascalCase / 函数变量 camelCase / 文件 kebab-case / 常量 UPPER_SNAKE_CASE
      Python: 类 PascalCase / 函数变量文件 snake_case / 常量 UPPER_SNAKE_CASE
      Go: 导出 PascalCase / 包内 camelCase / 文件 snake_case
      Rust: 类型 PascalCase / 函数变量模块 snake_case
    - 类型安全：TS strict / 不用 any（用 unknown + 类型守卫）
    - 函数优先纯函数，副作用隔离到 hooks/API route
    - React 优先 function components + Hooks；样式优先 Tailwind
    - 不做无关重构 / 遵循已有风格 / YAGNI

    【模块设计】
    - 单一职责，明确对外接口
    - 拆分信号：文件大小触发 [第一性原则].4 / 一个函数或组件做 3 件以上不同的事 / 改一个功能要动 5 个以上文件
    - 不拆信号：内聚小代码 / 拆了反而要跳来跳去 / 只为美观

    【数据层面】
    - 表名/字段名 snake_case；每表必有 id / created_at / updated_at
    - migration 用 ALTER TABLE（先检查列/表存在）
    - 不写裸 SQL 拼接（用参数化查询）

    【安全层面】
    - VITE_ / NEXT_PUBLIC_ 暴露浏览器 → 不放 API Key
    - AI API 调用走服务端
    - .env.example 提交，.env.local 进 .gitignore
    - 不硬编码密钥/路径/个人信息

    【项目结构】
    通用原则：一起变的文件放一起、按功能聚合不按技术分层（具体目录树按技术栈约定）

    【流程层面】
    - Git：原子化 commit / Phase 内多次 commit OK / 编译通过才 commit / push 跟随
      Commit 前缀：phase-N: / fix: / feat: / refactor: / chore:
    - dev server 启动前 kill 端口占用 + sleep 2：
      Node: `pkill -9 -f "node|next-server"` | Python: `pkill -9 -f "uvicorn|manage.py"` | Electron: `pkill -9 -f "Electron"`
      `kill -9 $(lsof -ti:$PORT)`

    【质量门槛】（每个功能完成后）
    - ✅ Happy path / Error path / Loading state / Empty state / 基本输入校验 / 无敏感信息硬编码

[Phase 完成度判断]
    完成大自检（四步同消息内执行；中间改代码 → 重来）：

    1. 编译：$TYPECHECK_CMD 零错误 / 无缺失依赖
    2. 功能：dev server 启动无错 / 新功能可用 / 现有功能未破坏（回归）
       有 Playwright → 自动化测试；无 → curl + 关键路径验证
    3. 质量门槛：每个功能通过 [开发规则].【质量门槛】6 项
    4. 冒烟：npm audit 无 critical / 无暴露密钥（grep） / 进程正常（只 1 个 dev server）

    全部通过 → 完成（验收条件全部满足）/ 部分完成（仅部分验收条件通过）
    任一失败 → 当场修 ≤5 次；仍失败 → 标 blocked

[工作流程]
    caller 应用本 skill 的完整流程：

    第 1 步：前置检查
        按 [依赖检测] 确认依赖齐全 → 缺失走对应失败话术（终止 / 警告 / 降级）

    第 2 步：编码遵循规范
        按 [第一性原则] 决策；按 [开发规则] 写代码；按 [反合理化清单] 抗 AI 偷懒

    第 3 步：阶段完成自检
        按 [Phase 完成度判断] 走 4 步走（编译 / 功能 / 质量门槛 / 冒烟）

    第 4 步：汇报产出
        按 [输出风格] 组织报告

    本 skill 不直接产出文件——caller 应用规范后产出代码 / 报告等。

[输出风格]
    语态：资深工程师汇报（简洁、准确、有数据）

    表达原则：
    - 用具体数字替代模糊词（如"5 项全实现 / 零错误"，不说"基本完成 / 大致 OK"）
    - 用真实命令输出作为证据（typecheck / build / 测试），不凭"应该没问题"
    - 改动前指明影响范围（文件 + 受影响功能），不笼统说"改一下"
    - 错误诊断给具体定位（文件 + 错误码 / 堆栈），不说"可能哪里有问题"
    - SDK-First：先确认已有能力（WebSearch / 官方文档），不重复造轮子

    反例（禁止）：
    × "基本完成 / 大致 OK"（要具体数字）
    × "应该没问题"（要命令证据）
    × "可能哪里有问题"（要具体定位）

[初始化]
    caller 引用本 skill 时按顺序：

    1. 读 [任务与边界] 确认本 skill 能力 / 不做范围
    2. 执行 [依赖检测]（前置必需）
    3. 按 [工作流程] 4 步走逐步引用对应段

    本 skill 不自启动——所有引用动作由 caller 主动发起。
