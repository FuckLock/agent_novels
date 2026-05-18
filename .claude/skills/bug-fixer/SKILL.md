---
name: bug-fixer
description: 当用户说'这个功能坏了'、'报错了'、'不正常'，或报告 bug、编译错误、运行时异常时使用。通过四阶段系统性调试定位根因并修复。
version: 2.0
depends_on: []
---

[任务与边界]
    做：
    - 通过系统性调试定位 bug 根因
    - 实施修复并验证
    - 一次只改一个逻辑点，每次修改前评估影响范围

    不做：
    - 不改需求范围（属于 product-spec-builder）
    - 不重构架构（不属于 bug 修复）
    - 不主动添加新功能
    - 不在没复现 bug 时凭报错信息猜测修复

    完成标准：
    - 根因明确（不是"看起来修好了"）
    - 编译通过（执行 $TYPECHECK_CMD 无错）
    - bug 不再复现（按复现步骤验证）
    - 相关功能回归验证通过

[第一性原则]（优先级从高到低）
    1. 反复失败就停（最高）
       连续 3 次修复同一 bug 失败 → 立即停止编码，重新审视：
       - 是不是架构问题（不是单点 bug）
       - 是不是环境问题（端口占用、依赖版本）
       - 是不是理解偏差（搞错了"修复"的目标）
       不允许第 4 次盲目尝试。

    2. 不猜不试
       没有证据就不下结论。
       先收集 → 先分析 → 先假设 → 再验证。

    3. 一次一个
       一次只改一个文件/逻辑点。
       改完验证，确认有效再继续。

    4. 修改纪律
       改之前评估影响范围。
       改之后回归验证（修 A 不能坏 B）。

[依赖检测]
    必需（缺失则终止）：

    [1] 项目代码存在
        检测：Glob "**/package.json|**/Cargo.toml|**/go.mod|**/requirements.txt|**/pyproject.toml"
        失败话术（一字不改）：
          "❌ 未识别到项目代码，请先 /dev-builder"

    [2] bug 描述
        检测：用户消息中包含具体症状或 code-review 报告中的失败项
        失败话术：
          "❌ 缺 bug 描述。请告诉我：
            - 错误信息或异常行为
            - 复现步骤
            - 期望行为 vs 实际行为"

    可选（缺失则降级）：
    - Product-Spec.md → 有则对照预期行为判断是 bug 还是 feature
    - DEV-PLAN.md → 有则定位相关 Phase 和文件
    - 设计工具 MCP → 有则对照设计判断 UI 是否正确
    - Playwright plugin → 有则自动化复现和验证
    - git → 有则用 git log/diff/blame 追溯变更

[调试策略]
    四阶段系统性调试法。

    [快速通道]（明显场景跳过 4 阶段）
    - 端口占用 → 执行 [环境清理]
    - 依赖缺失 → 装依赖
    - 编译路径错误 → 修路径
    其他场景走完整 4 阶段。

    [环境清理]（横切动作，任何阶段都可调）
        macOS/Linux：
          pkill -9 -f "next-server|node|uvicorn|gunicorn|main" 2>/dev/null
          kill -9 $(lsof -ti:$PORT) 2>/dev/null
          sleep 2
        Windows：
          taskkill /F /IM node.exe 2>nul
          taskkill /F /IM python.exe 2>nul
          netstat -ano | findstr :$PORT  ← 然后手动 taskkill PID

        $PORT 从 package.json/.env/uvicorn 启动参数读取

    第一阶段：收集证据
        收集什么：
        - 完整错误信息（不截断 stack trace）
        - 复现步骤（稳定 vs 偶发）
        - 环境信息（语言版本、OS——若相关）
        - 最近代码变更（git log --oneline -10、git diff）
        - 相关日志（console、网络请求、DB 查询）
        怎么做：
        - 读 stack trace 顶层定位代码
        - 追踪数据流（触发点 → 报错点）
        - 区分前端/API/数据库/第三方哪一层

    第二阶段：分析模式
        - 找正常工作的相似功能，对比差异
        - 识别可疑之处
        - 理解依赖关系
        - 如有 Product-Spec.md → 确认预期行为
        - 如有 git blame → 找出可疑变更的提交

    第三阶段：假设验证
        规则：
        - 每次最多 3 个假设，按可能性排序
        - 每个假设必须有验证方法
        - 先验证最可能的假设
        - 否定后记录原因，不重复验证
        - 3 个全否定 → 回第一阶段重新收集证据
        卡住时（条件性联网）：
        - 报错信息不熟悉 → WebSearch 报错 + 框架名
        - 怀疑第三方库 bug → WebSearch 库名 + 版本 + known issues
        - 怀疑框架兼容性 → WebSearch 框架 + 版本 + breaking changes

    第四阶段：实施修复
        规则：
        - 一次只改一个文件/逻辑点
        - 改前评估影响范围
        - 改后执行 $TYPECHECK_CMD（不硬编码 tsc）
        - 改后功能验证（bug 不再复现）
        - 改后回归验证（相关功能仍正常）
        - 修复失败 → 回退到第三阶段
        - 连续 3 次失败 → 触发 [第一性原则] 第 1 条"反复失败就停"

[工作流程]
    [第一步] 加载基准 + 识别项目语言
        - 收集 bug 信息（错误信息 / 复现步骤 / 期望 vs 实际）
        - 信息不足 → 追问用户补充
        - 加载上下文：Product-Spec.md / DEV-PLAN.md / 设计 MCP（如有）
        - 扫描项目代码 → 了解相关模块结构
        - 识别项目语言 + 设定 $TYPECHECK_CMD：
        
          | 检测文件                          | 语言       | $TYPECHECK_CMD     |
          |-----------------------------------|------------|--------------------|
          | tsconfig.json + package.json      | TypeScript | npx tsc --noEmit   |
          | Cargo.toml                        | Rust       | cargo check        |
          | go.mod                            | Go         | go build ./...     |
          | pyproject.toml/requirements.txt   | Python     | mypy .             |
          | 都不匹配                          | 未知       | echo skip          |

    [第二步] 执行 [调试策略] 四阶段
        - 每阶段后向用户简短汇报：
          第一阶段后："收集到证据：…… 初步判断在 XX 层"
          第三阶段后："假设是 XX，验证方法 XX，验证结果 XX"
          第四阶段后："已修复，修改 XX，编译通过，功能/回归验证通过"

    [第三步] 验证
        - 执行 $TYPECHECK_CMD（失败记录但不阻塞继续报告）
        - 功能验证：按复现步骤操作，bug 不再出现
        - 回归验证：相关功能仍正常工作
        - 如有 Playwright → 自动化验证核心交互流程

    [第四步] 输出报告
        按 [输出格式] 节定义的模板

[输出格式]

    [语态]
    像医生诊断：先问症状，再查体征，再下诊断，最后开药。
    每一步有依据，不说"可能是"，要说"根据 XX 证据判断是 XX"。

    [反例 - 明文禁止]
    × "我改改试试看"        ✓ "假设是 XX，验证方法是 XX"
    × "应该这里有问题"      ✓ "stack trace 显示问题在 chat-view.tsx:45"
    × "可能是这个原因"      ✓ "根据 git blame，问题引入于 commit abc123"
    × 同时改多处            ✓ 一次只改一处，验证有效再下一处

    [完成报告模板]

    🔧 Bug 已修复

    根因：[一句话说明]
    修复：[修改了哪些文件，做了什么改动]
    验证：
    - 编译：$TYPECHECK_CMD 零错误
    - 功能：[复现步骤] 不再触发 bug
    - 回归：[相关功能列表] 验证正常

    需要我 commit 吗？（commit message: fix: [问题描述]）
    还是还有其他问题要修？

[初始化]
    AI 被 /bug-fixer 调用时按顺序执行：

    1. 输出开场："🔧 开始系统性调试"

    2. 执行 [依赖检测]
       失败 → 按失败话术终止，不进入调试

    3. 依赖通过 → 输出：
       "✓ 依赖就绪：项目代码 + bug 描述 [+ Spec] [+ Plan] [+ MCP]"

    4. 进入 [工作流程] 第一步
