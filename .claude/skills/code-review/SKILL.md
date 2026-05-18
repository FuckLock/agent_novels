---
name: code-review
description: 当用户说要审查代码、检查质量、验证功能是否完整，或需要对照 spec 文档和设计稿验证代码实现时使用。输出结构化审查报告，每项结论附证据。
version: 2.2
depends_on:
  - product-spec-builder
---

[任务与边界]
    做（按 mode 分支，caller 传入 mode 字段决定）：
    - implementation-review（默认）：对照 spec 文档走 Stage 1/2 评审 → 每条结论 ✅/⚠️/❌/❓ + "文件:行号"证据
    - criteria-alignment：评估传入的 criteria 文件三维（可机器验证性 / 覆盖完整性 / spec 一致性）

    不做（两种 mode 通用）：
    - 不修改代码 / 不修改 criteria 文件
    - 不决定修复优先级 / 修订路径
    - 不重构架构
    - implementation-review 模式：不审查 spec 之外的代码（除非命中 [Spec 漂移检测]）

    完成标准：
    - implementation-review：
      - spec 每条功能都被覆盖（无遗漏 = 不合格）
      - 每个 ⚠️/❌ 附 spec 原文 + 代码证据
      - Stage 2 安全扫描全量跑过
      - 报告按 [输出格式] 模板（含开头总览行）
    - criteria-alignment：
      - 三维评估全部产出结论 + 每个失败维度附条目列表 + 建议修订
      - 输出 status: aligned | needs_revision | rejected

[第一性原则]（优先级从高到低，冲突时按序判）
    1. 不信任声明（最高）
       不接受"已实现"、"大致匹配"、"看起来正常"、"基本符合"这种话。
       要么给具体证据，要么标 ⚠️/❓。

    2. 证据为王
       说 ✅ 必须附：文件:行号 + 函数/组件名 + 验证方式
       说 ❌ 必须附：spec 原文 + 搜索范围（证明真的找过）
       说 🔴 必须附：文件:行号 + 匹配的危险模式

    3. 不放过
       spec 每条都要查。
       若 spec 条目数 > 50 → 允许按模块抽样，但必须：
       - 报告开头注明"本次抽样范围：X 模块（占 Y%）"
       - 被抽到的模块内所有条目仍然不放过

[依赖检测]
    必需（缺失则终止；话术只陈述事实，不跨 Skill 引导）：

    [1] spec 文档存在且 [功能需求] 章节非空
        检测：Read 文件 + Grep 搜索 "功能需求|Functional Requirements"
        失败话术："❌ spec 文档不存在或功能需求为空。"

    [2] 项目代码存在
        检测：Glob 项目入口文件（package.json / Cargo.toml / go.mod / requirements.txt / pyproject.toml / Gemfile / composer.json 等按项目类型）
        失败话术："❌ 未识别到项目代码。"

    可选（缺失则降级，不阻塞）：
    - 开发计划文档 → 有则对照当前 Phase 交付清单
    - 设计规范文档 → 有则对照视觉规范
    - 设计工具 MCP（Pencil / Figma 等）→ 有则提取设计数值精确比对
    - UI 自动化测试工具（如 Playwright）→ 有则做交互流程验证
    - git → 有则用 git diff 追溯变更范围

[审查维度]
    审查分两个 Stage：
    - Stage 1（功能 + UI + 漂移 + 交互）：先对错
    - Stage 2（代码质量 + 安全 + 性能 + a11y + i18n + 可测试性）：后优劣

    [Stage 门槛]
    Stage 1 出现以下任一 → 不进 Stage 2：
    - ❌ 未实现核心功能（≥ 1 项）
    - ⚠️ 部分实现条目数 ≥ 阈值：
        spec 条目 < 20 → 阈值 3
        spec 条目 20-50 → 阈值 5
        spec 条目 > 50 → 阈值 10

    例外：所有 Stage 1 问题集中在同一模块 → 该模块阻塞，其他模块继续 Stage 2。

    ────────────────── Stage 1 ──────────────────

    [功能完整性]
        检查什么：spec 文档每条功能是否有对应实现且行为正确
        怎么做：
            1. 读 spec 条目（按章节编号 1.1, 1.2, ...）
            2. Grep 搜关键词定位代码
            3. Read 验证行为
            4. 输出证据（文件:行号）
        Priority 规则：
            ❌ 未实现核心功能 → 🔴
            ❌ 未实现辅助功能 → 🟡
            ⚠️ 部分实现核心 → 🔴
            ⚠️ 部分实现辅助 → 🟡
            ✅ 完整实现 → 不打标
            ❓ spec 歧义 → 不打标，归入"待澄清"章节

    [UI 一致性]（如有设计稿）
        容忍度表：
            颜色：精确匹配（hex 完全相同）
            字号：精确匹配
            圆角：精确匹配
            间距：允许 ±2px（subpixel rendering 物理误差）
            布局：允许 ±2px
        超容忍 → ⚠️ 部分实现
        Priority 规则：
            颜色/字号偏离 → 🟡
            布局/间距偏离 → 🟡
            交互状态缺失（hover/active/disabled）→ 🔴

    [Spec 漂移检测]
        判定规则（用户可见面测试）：
            🟢 合理扩展：用户打开产品看不见
                例：日志、错误边界、缓存、CI/CD、连接池
            🔴 Scope Creep：用户在界面上看得见的新功能
                例：登录、支付、分享、深色模式（若 spec 未要求）
        Priority 规则：
            🟢 → 只记录，不打标
            🔴 → 🔴 High，单列警告

    [交互流程验证]（如有 UI 自动化测试工具如 Playwright，无则标 ⏭ 跳过）
        覆盖范围：spec 中标记 P0 的用户故事
        测试维度：
            1. 核心路径（创建/编辑/删除/查看）
            2. 错误场景（无效输入/网络错误）
            3. 状态变化（loading → loaded → empty）
            4. 导航（页面跳转/返回）
        Priority 规则：
            P0 路径失败 → 🔴
            错误场景未处理 → 🟡

    ────────────────── Stage 2 ──────────────────

    [代码质量]
        判定基线（按项目编码规范文档执行；无文档则按通用基线）：
        - 命名一致性：按项目语言主流约定（如 PascalCase / camelCase / snake_case 按语言定）
        - 类型安全：避免 escape hatches（any / @ts-ignore / interface{} / unwrap() / panic! 等）
        - 文件大小：按项目语言阈值（通用基线：源码 ≤ 300 行 / 动态类型语言酌情上浮）
        - 重复代码：≥ 3 处即标

        Priority 规则：
            超大文件 → 🟡
            类型 escape hatches → 🟡
            重复代码 ≥ 3 处 → 🟡

    [安全扫描]（规则源 - 唯一定义处，禁止他处复制）
        执行方式：用 Grep tool 搜索项目源码目录

        规则清单（命中即记录；正则按项目使用的 AI 服务 / 前端框架补充对应模式）：
        | # | 规则           | 正则模式                                              | Priority |
        |---|----------------|-------------------------------------------------------|----------|
        | 1 | 硬编码 AI Key  | `sk-ant-|sk-proj-|ANTHROPIC_API_KEY|OPENAI_API_KEY`   | 🔴       |
        | 2 | 硬编码密码     | `password\s*=\s*['"][^'"]{4,}`                        | 🔴       |
        | 3 | eval/Function  | `eval\(|new Function\(`                               | 🔴       |
        | 4 | XSS-prone      | `dangerouslySetInnerHTML|innerHTML\s*=`               | 🔴       |
        | 5 | SQL 字符串拼接 | `f"SELECT.*\{|\.execute\(.*\+`                        | 🔴       |
        | 6 | 路径泄露       | `/Users/|/home/|C:\\\\`                               | 🟡       |
        | 7 | 前端环境变量泄露 | `(VITE_|NEXT_PUBLIC_|REACT_APP_).*?(KEY|SECRET|TOKEN)` | 🔴       |
        | 8 | 依赖漏洞       | 执行 $AUDIT_CMD                                        | 取决 CVE |

        [条件性联网]（仅以下情况执行 WebSearch）：
        - Grep 命中模式不在上述清单内 → 联网确认是否已知漏洞
        - 用户明确问到具体 CVE → 联网查最新信息
        其他情况：按内置规则判，不联网

    [性能]（必须）
        前端检查项（按项目实际框架适配；以下以 React 为示例）：
            - 副作用依赖完整性（如 React useEffect 依赖数组）
            - 列表渲染 key 稳定性（不用 index）
            - 大列表虚拟化
            - 避免不必要的 re-render（缓存 / memo / useCallback）
        后端检查项：
            - N+1 查询（在循环里查 DB）
            - 同步 IO 阻塞事件循环
            - 缺索引的查询
        Priority 规则：
            N+1 查询 → 🟡
            列表缺 key / 重复渲染未缓存 → 🟡

    [可访问性 a11y]（必须；Web/移动 UI 适用，CLI/API 项目跳过）
        检查项（Web/HTML 示例；其他平台按对应 a11y 规范）：
            - <img> 是否有 alt
            - 交互元素是否有 aria-label / 可读文本
            - 用语义标签（<button> 而不是 <div onClick>）
            - 颜色对比度（依赖工具，无则跳过）
            - 键盘可达性（Tab 顺序合理）
        Priority 规则：
            缺 alt/aria-label → 🟡
            用 div 模拟按钮 → 🟡

    [国际化 i18n]（必须；多语言项目适用，单语言项目跳过）
        检查项：
            Grep 硬编码项目目标语言以外的字符串
              （中文项目示例正则：[\u4e00-\u9fa5]+；其他语言按需调整）
            确认是否在 i18n 函数内（t('...') 风格）或常量定义里
        Priority 规则：
            硬编码用户可见文案 → 🟡
            常量定义/日志 → 不打标

    [可测试性]（必须）
        检查项：
            - 是否存在测试目录（test/ tests/ spec/ __tests__ 等按项目约定）
            - 是否有测试配置（按项目技术栈：vitest.config / jest.config / pytest.ini / cargo test / go test 等）
        Priority 规则：
            无任何测试 → 🟡
            有测试目录但内容空 → 🟡

[工作流程]
    [第〇步] mode 判定
        读 caller 传入的 mode 字段：
        - mode=implementation-review（默认）→ 继续下文第一~五步
        - mode=criteria-alignment → 跳转到末尾 [criteria-alignment 分支]
        - mode 缺失或值无效 → 按"默认 implementation-review"处理

    [第一步] 加载基准 + 识别项目语言
        - 读 spec 文档 → 提取功能需求列表，按章节编号 1.1, 1.2, ...
        - 如有开发计划文档 → 读取当前 Phase / Task 的交付清单
        - 如有设计规范文档 → 读取视觉规范
        - 如有设计工具 MCP → 提取审查范围对应页面的精确数值
        - 识别项目语言 + 设定动态命令变量：

          | 检测文件                          | 语言       | $TYPECHECK_CMD     | $LINT_CMD       | $AUDIT_CMD          |
          |-----------------------------------|------------|--------------------|-----------------|--------------------|
          | tsconfig.json + package.json      | TypeScript | npx tsc --noEmit   | npx eslint .    | npm audit          |
          | package.json（无 ts）             | JavaScript | echo skip          | npx eslint .    | npm audit          |
          | Cargo.toml                        | Rust       | cargo check        | cargo clippy    | cargo audit        |
          | go.mod                            | Go         | go build ./...     | go vet ./...    | govulncheck ./...  |
          | pyproject.toml/requirements.txt   | Python     | mypy .             | ruff check .    | pip-audit          |
          | Gemfile                           | Ruby       | echo skip          | rubocop         | bundle audit       |
          | composer.json                     | PHP        | echo skip          | php -l          | composer audit     |
          | 都不匹配                          | 未知       | echo skip          | echo skip       | echo skip          |

          未知语言 → 报告开头警告："⚠️ 项目语言未识别，跳过编译/lint/audit 检查"

        - 确定审查范围（按 caller 传入的 review_scope 参数）：
            full → spec 所有功能
            phase → 当前 Phase 交付清单
            task → 当前 Task 交付清单

    [第二步] 扫描代码 → 产出代码地图
        - 遍历项目代码目录
        - 输出 Markdown 表格（格式见 [输出格式] 节的"代码地图（附录）"模板）
        - 同时记录"spec 之外的文件"用于 [Spec 漂移检测]

    [第三步] 执行 [审查维度] Stage 1
        - 按 Stage 1 各维度逐条核对
        - 遇到 spec 歧义 → 标 ❓ 不猜，记录到"待澄清"章节
        - 完成后判定 [Stage 门槛]：
            通过 → 进入第四步
            阻塞 → 跳到第五步输出报告，标注"Stage 2 未执行（原因）"

    [第四步] 执行 [审查维度] Stage 2
        - 执行 $TYPECHECK_CMD
            失败 → 记 🔴 "编译失败：[错误摘要]"，不阻塞继续
        - 按 Stage 2 各维度逐项检查
        - 工具不可用（Playwright/MCP 未连）→ 标 ⏭ 跳过 + 原因
            禁止：假装审查了

    [第五步] 输出报告
        按 [输出格式] 节定义的模板输出
        Priority 在每条结论生成时已打标（不在末尾重判）

[输出格式]

    [长度约束]
        每条结论 ≤ 50 字
        报告总长度建议 ≤ 用户能一屏看完总览

    [强制总览行]
        报告开头第一行：
        【✅ X  ⚠️ Y  ❌ Z  🔴 W  ❓ V  ⏭ U】/ 总 N

    [报告模板]

    📋 代码审查报告

    【✅ 23  ⚠️ 4  ❌ 2  🔴 1  ❓ 1  ⏭ 0】/ 总 30

    对照文档：spec 文档 [+ 开发计划 Phase N]
    项目语言：Python（识别自 requirements.txt）
    [若 spec 条目 > 50 抽样] 抽样范围：X 模块（占 Y%）

    ---

    🔴 安全问题（1 项）
    - 硬编码 API Key：config.py:12 — sk-ant-xxx 出现在源码

    ❌ 未实现（2 项）
    - 1.5 用户能导出数据：spec 原文 "用户能导出 CSV 格式"
      搜索范围：grep "export|csv" 全项目无匹配
    - 2.3 任务拖拽排序：spec 原文 "用户能拖拽排序任务"

    ⚠️ 部分实现（4 项）
    - 1.2 记住密码：缺持久化 cookie
      spec 原文 "下次自动登录"；代码：login.py:67 仅设置 session
    - UI 颜色：header 按钮 #4B91E3 偏离设计 #4A90E2（超容忍）
    - ...

    ❓ 待澄清（1 项）
    - 1.3 用户能删除任务
      歧义点：软删除还是硬删除？
      代码现状：硬删除（DELETE FROM tasks）

    ⏭ 跳过（0 项）

    ✅ 完整实现（23 项）
    - 1.1 用户登录：auth/login.py:45 — 验证 API /login 返回 200
    - ...

    ---

    📊 代码质量
    - 编译：mypy . 通过 / 失败 [摘要]
    - 超大文件：[列表 或 无]
    - 类型安全：[any/ts-ignore 数量]

    📊 性能 / a11y / i18n / 可测试性
    - N+1 查询：[数量 或 无]
    - 缺 alt：[数量]
    - 硬编码非 ASCII 文案：[数量]
    - 测试目录：[存在 / 不存在]

    ---

    📁 代码地图（附录）
    | # | spec 条目 | 涉及文件 |
    | 1.1 | 用户登录 | auth/login.py, components/LoginForm.tsx |
    | ... |

    🔍 spec 之外的文件
    | 文件 | 推测用途 | 判定 |
    | utils/logger.py | 日志 | 🟢 合理扩展 |

    ---

    Priority 汇总
    🔴 High: X 项
    🟡 Medium: Y 项
    🟢 Low: Z 项

    [反例 - 明文禁止]
    × "大部分功能已实现"        ✓ "23/30 项完整实现"
    × "看起来正常"              ✓ "已验证 <文件:行号> 的 <函数名>"
    × "基本符合 spec"           ✓ "✅ 23 项 / ⚠️ 4 项 / ❌ 2 项"
    × "代码质量尚可"            ✓ "编译通过 + 2 处 escape hatches + 无超大文件"
    × "其余功能未发现明显问题"  ✓ 列出每个未提及的 spec 条目

[criteria-alignment 分支]

    触发条件：mode=criteria-alignment

    输入（caller 传入）：
    - criteria_path：caller 上游产出的 criteria 文件（YAML frontmatter + 三类 criteria 体）
    - spec_path：spec 文档
    - plan_path：开发计划文档（用于覆盖完整性比对）

    评估三维：
    1. 可机器验证性：每条 criteria 是否能用 Read/Grep/Bash 实际执行验证
       - 通过：每条 criteria 注明验证手段
         （文件存在 / 函数返回 / HTTP 状态 / UI 选择器 / Grep 模式 / 编译输出）
       - 不通过示例："代码要漂亮" / "用户体验良好" / "性能可以接受"
    2. 覆盖完整性：phase 交付清单的每一项至少对应一条 criteria
       - 通过：开发计划文档中该 phase 交付清单 vs criteria 一一对应
       - 不通过示例：交付 3 项、criteria 只覆盖 2 项
    3. spec 一致性：criteria spec_refs 引用的 spec 章节实际存在且与 criteria 表达一致
       - 通过：每个 spec_ref 能在 spec 文档找到，且该章节描述与 criteria 一致
       - 不通过示例：criteria 写了 spec 没要求的行为；行为与 spec 冲突

    输出 status 映射：
    - 三维全通过 → aligned
    - 任一维度部分通过且可修订 → needs_revision + failure_count
    - 三维中 ≥2 维严重失败 / 第 3 轮仍不通过 → rejected
      （rejected 时附 rejection_reason，分类：spec_conflict / coverage_gap / unverifiable / ambiguous）

    输出模板：
    📋 criteria 对齐评估
    【evaluated_dimensions: verifiable=<bool>  coverage=<bool>  spec_consistency=<bool>】

    输入 criteria: <criteria_path>
    对照 spec: <criteria 文件 frontmatter 的 spec_refs 列表>
    对照 plan: <criteria 文件 frontmatter 的 plan_refs 列表>

    维度 1 - 可机器验证性: <pass | fail + 不通过条目列表 + 建议修订>
    维度 2 - 覆盖完整性: <pass | fail + 未覆盖 phase 交付项>
    维度 3 - spec 一致性: <pass | fail + 冲突详情>

    status: <aligned | needs_revision | rejected>
    failure_count: { unverifiable: N, coverage_gap: N, spec_conflict: N }
    [若 rejected] rejection_reason: <spec_conflict | coverage_gap | unverifiable | ambiguous>

    aligned 时报告末尾附提示：
    "✓ aligned，criteria 可由 caller 按约定流程锁定。"

    边界场景：判定规则未定义的灰区 → 标 ❓ 不猜，记入待澄清章节；
    criteria 文件不存在 → status: skill_failed + "criteria 文件不存在"。

[初始化]
    caller 调用本 skill 时按顺序执行：

    1. 输出开场："🔍 开始代码审查"

    2. 执行 [依赖检测]
       失败 → 按失败话术终止，不进入审查

    3. 依赖通过 → 输出已就绪的文档清单（spec / 开发计划 / 设计规范 / MCP / UI 自动化测试工具 等按实际命中）

    4. 进入 [工作流程] 第一步

