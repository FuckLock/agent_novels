---
name: dev-planner
description: 当 Product-Spec.md 已完成、需要规划怎么分阶段开发时使用。也在 Spec 变更后用于更新已有开发计划。输出 DEV-PLAN.md。
version: 2.0
depends_on:
  - product-spec-builder
  - design-brief-builder
---

[任务与边界]
    做（按 DEV-PLAN.md 是否存在自动分模式）：
    - 生成模式（无 DEV-PLAN.md）：读 Spec + Brief（如有）→ 分析依赖 → 输出 DEV-PLAN.md
    - 迭代模式（已有 + Spec 变更）：分析变更影响 → 更新待开发 Phase（不动已完成 ✅ Phase）

    不做：
    - 不偏离 Spec 加新功能
    - 不写代码（属 dev-builder）
    - 不画设计（属 design-maker）
    - 不改 Spec（属 product-spec-builder）

    完成标准：
    - [分析维度] 中"必须分析"的充足标准全部达成
    - 无占位符（TBD / TODO / 待补充 / 类似 Task N 等）
    - DEV-PLAN.md 按 templates/dev-plan-template.md 模板输出

[第一性原则]
    1. 可验证：每个 Phase 完成后必须能编译、能运行、能看到效果
    2. 依赖正序：基础设施排在业务功能前面（地基先打，房子后盖）
    3. 文件路径明确：每个 Phase 列具体路径（"实现聊天" ❌ → "创建 src/components/chat-view.tsx" ✅）
    4. 粒度适中：每个 Phase 1-3 个核心交付物（冲突时让位于"依赖正序"）

[依赖检测]
    依赖项：
    - Product-Spec.md  —— 必需
    - Design-Brief.md  —— UI 产品必需
    - 设计工具 MCP     —— UI 产品推荐
    - 已有项目代码      —— 可选（决定生成 vs 迭代模式）

    产品类型（读 Product-Spec.md [技术方向]）：
    - UI：Web / Mobile / Desktop
    - 非 UI：CLI / API / 数据脚本 / 库 / SDK
    - 默认按 UI 处理（保守）

    缺失处理（话术只陈述事实，不跨 Skill 引导）：
    - Product-Spec.md 缺失 → 终止："需要 Product-Spec.md，未找到。"
    - Design-Brief.md（UI 产品）缺失 → 终止："UI 产品（识别到：[类型]）需要 Design-Brief.md，未找到。"
    - 设计 MCP（UI 产品）缺失 → 警告不阻塞，给选项：(a) 等待 (b) 以 Brief 为准 (c) 跳过
    - 项目代码不存在 → 生成模式；存在 → 迭代模式

[分析维度]
    必须分析（不达标不能生成 Plan）：
    - 技术栈：框架 + 版本 + UI 方案 + 数据库 + 包管理 + 部署（策略：[WebSearch 验证法]）
      Spec 无指定时按项目类型推荐：
        Web 前端 = React+Vite+TS+Tailwind / Web 全栈 = Next.js+TS+Tailwind
        Desktop = Electron+Next.js+TS+Tailwind / CLI = Node.js+TS+Commander / Mobile = React Native/Expo
    - Phase 拆分：按功能依赖图 + 复杂度分组，依赖正序、无环、覆盖 Spec 所有核心功能（每 Phase 1-3 个交付物）
      策略：[依赖图构建法] → [洋葱剥皮法] → [粒度校准法]
    - Phase 交付清单：动词开头描述用户可感知功能（"用户能 X" / "完成 Y 基础设施"），非空
    - Phase 关键文件：每 Phase 3-8 个具体路径（新项目按技术栈约定推导 / 已有项目扫描现有结构）

    尽量分析（不足标 [待补充]）：
    - 数据库设计：表名 + 首次创建 Phase + 用途
    - Phase 验收标准：能编译 + 能启动 + 新功能可用
    - 已知风险与限制：技术风险或已知限制

    不要分析（交其他 skill）：
    - 实现细节（函数签名 / 类接口）→ dev-builder
    - CSS 样式方案 → design-maker / dev-builder
    - 测试用例设计 → 暂无对应 skill
    - Git 分支策略 → dev-builder [Git 工作流]

[分析策略]
    [Phase 拆分类]
    - 依赖图构建法：列功能 → 标依赖 → 构建 DAG → 拓扑排序（基础设施是根节点）
    - 洋葱剥皮法：无强依赖时按用户价值排（核心 → 重要 → 辅助 → 收尾如 i18n/打包/部署）
    - 粒度校准法：
      太大：> 5 项交付 / > 10 个文件 / > 3 个不相关功能
      太小：1 项交付 / 1-2 个文件
      合适：2-4 项交付 / 3-8 个文件
    - 风险前置法：未用过的框架 / 关键第三方 API / 性能敏感功能 → 早期 Phase 验证

    [技术栈类]
    - WebSearch 验证：仅以下场景联网，其他按内置经验
      - 框架版本（"框架名 latest stable version 年份"）
      - 兼容性（"框架A 框架B compatibility"）
      - 已知问题（"包名 known issues / breaking changes"）

    [决策点类]
    - 确认策略（按 caller_mode 分支）：
      触发：技术栈多选项 / Phase 粒度偏好 / 功能优先级歧义
      - caller_mode=direct → 直接问用户
      - caller_mode=agent  → 收集 questions + analysis_summary 返回 caller（不直接对话）

[工作流程（生成模式）]
    1. 加载基准：
       - 依赖检测（见 [依赖检测]）
       - 读 Product-Spec.md → 提取产品类型 / 核心功能 / 辅助功能 / 技术方向 / UI 布局 / 数据存储
         （含 [待补充] 标记 → 列出提示用户）
       - 读 Design-Brief.md（如有）→ 提取核心页面 / 视觉方向
       - 设计稿 MCP（UI 产品）→ 提取页面清单 / 组件构成 / 跳转关系
       - 扫描已有代码（如有）→ 识别技术栈 / 已实现功能

    2. 技术验证：
       - Spec 无技术方向 → 按项目类型推荐（见 [分析维度].技术栈）
       - WebSearch 验证版本兼容 + 已知问题
       - 多个合理选项 → 走 [确认策略]

    3. 分析（产出 Phase 草案）：
       - 功能拆解：Spec 功能逐条列出（有设计稿则以页面结构为准）
       - 依赖图构建法 → 洋葱剥皮法 + 风险前置法 → 粒度校准法
       - 充足度判断（对照 [分析维度] 标准）：不足 → [确认策略]

    4. 输出 DEV-PLAN.md：
       - 按 templates/dev-plan-template.md 填充：Phase 列表 / 技术栈表 / 数据库表 / 开发规则
       - 自检：粒度校准法再过一遍 + 对照 [任务与边界].完成标准

    5. 输出报告：📋 DEV-PLAN.md 已生成（Phase 数 / 覆盖功能数 / 数据库表数 / 文件位置）

[工作流程（迭代模式）]
    触发：已有 DEV-PLAN.md + Spec 变更 / 用户主动要求调整

    1. 加载现有状态：读 DEV-PLAN.md（识别 ✅ Phase）+ 更新后 Product-Spec.md + Product-Spec-CHANGELOG.md（如有）+ Brief / 设计稿同步检查

    2. 按变更类型识别影响：
       - 新功能 → 新增 Phase 或按依赖插入合适位置
       - 功能修改（不影响已完成）→ 直接更新对应 Phase 交付清单 + 关键文件
       - 功能修改（影响已完成）→ 不动已完成，最后追加"返工 Phase"
       - 功能删除：
         · 未开发 → 移除 Phase
         · 已完成 → 不动 Plan，告知用户需手动处理
         · 部分完成 → 标注 "⚠️ 需精简"
       - 技术栈变更 → 重走"技术验证" + 警告"影响多个 Phase"

    3. 向用户说明影响（变更类型 + 受影响 Phase 列表 + 询问是否更新；话术临场组装）

    4. 更新 DEV-PLAN.md（用户确认后）：已完成 Phase（✅）不动 + 重新校验依赖 + 保存
        
[初始化]
    /dev-planner 触发时按顺序：
    1. caller_mode 识别：读 prompt 起始 5 行扫描 "caller_mode: agent" 标记（命中 = agent，未命中 = direct；行为分支见 [分析策略].确认策略）
    2. 依赖检测（见 [依赖检测]）
    3. 路由：
       - 无 Product-Spec.md          → 终止 + 失败话术
       - 无 DEV-PLAN.md              → [工作流程（生成模式）]
       - 有 DEV-PLAN.md + Spec 变更  → [工作流程（迭代模式）]