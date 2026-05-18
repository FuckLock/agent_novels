---
name: seedance-main
version: 1.0.0
description: Seedance 五阶段制片调度 Skill。被 seedance-main Agent 使用，负责约束 A/B/C1/C2/C3/D 的阶段顺序、依赖检查、断点续作和阶段输出合约，本身不生成具体业务内容。
metaData: seedance_skills
depends_on: [seedance-asset, seedance-director-plan, seedance-storyboard-table, seedance-storyboard-prompt, seedance-video]
output_tag: productionPlan
---

# Seedance 制片调度技能

[任务与边界]
    做：
    - 约束 Seedance 五阶段顺序：A 导演分析 → B 资产管理 → C1 导演规划 → C2 分镜表 → C3 分镜提示词 → D 视频生成
    - 根据 packet.stage 判断当前阶段、前置依赖和下一步
    - 为 caller 返回可执行的阶段计划、缺失依赖、失败原因和恢复建议
    - 支持 fromStage/toStage 范围执行和断点续作

    不做：
    - 不直接生成导演分析、资产、导演规划、分镜表、分镜提示词或视频
    - 不直接写 novels/ 文件；落盘由 Web 后端 executor 或对应 Skill 完成
    - 不绕过 caller 与用户交互
    - 不跳过阶段依赖

    完成标准：
    - 输出明确当前 stage 的执行计划
    - 依赖缺失时明确列出缺什么、应先跑哪一阶段
    - 正常时输出 caller 可继续执行的下一阶段信息

[第一性原则]
    1. 阶段顺序不可跳过
       B 依赖 A，C1 依赖 A+B，C2 依赖 C1+B，C3 依赖 C2+C1+B，D 依赖 C3+B。
    2. 业务下沉到专职 Skill
       资产由 seedance-asset，导演规划由 seedance-director-plan，分镜表由 seedance-storyboard-table，提示词由 seedance-storyboard-prompt，视频由 seedance-video。
    3. 用户操作面在桌面应用
       所有状态、错误、重试建议必须能被 Web/Electron UI 展示，不输出 CLI 专属指令作为唯一方案。
    4. 断点续作优先
       已存在且结构有效的阶段产物默认复用；除非 packet.force=true，不重复生成。

[阶段依赖]
    A 导演分析：
    - 输入：novels/{name}/scripts/episode-{N}.txt
    - 输出：seedance/ep{N}/01-director.md

    B 资产管理：
    - 输入：seedance/ep{N}/01-director.md + description 中的画风
    - 输出：seedance/assets.json + seedance/images/

    C1 导演规划：
    - 输入：01-director.md + assets.json + 画风 director_skills
    - 输出：seedance/ep{N}/director-plan.json

    C2 分镜表：
    - 输入：director-plan.json + 01-director.md + assets.json
    - 输出：seedance/ep{N}/storyboard-table.json

    C3 分镜提示词：
    - 输入：storyboard-table.json + director-plan.json + assets.json + 视频风格模板
    - 输出：seedance/ep{N}/02-prompts.md

    D 视频生成：
    - 输入：02-prompts.md + assets.json + 视频模型配置
    - 输出：seedance/ep{N}/videos/

[输出格式]
    正常输出：

    <productionPlan>
    {
      "stage": "B",
      "episode": 1,
      "ready": true,
      "requiredInputs": ["seedance/ep1/01-director.md"],
      "expectedOutputs": ["seedance/assets.json", "seedance/images/"],
      "nextStage": "C1",
      "notes": []
    }
    </productionPlan>

    <!-- meta: {"status":"passed","stage_reached":0,"failure_count":{"critical":0,"high":0,"medium":0}} -->

    依赖缺失：

    <productionPlan>
    {
      "stage": "C2",
      "episode": 1,
      "ready": false,
      "missingInputs": ["seedance/ep1/director-plan.json"],
      "recommendedStage": "C1"
    }
    </productionPlan>

    <!-- meta: {"status":"stage1_blocked","stage_reached":0,"failure_count":{"critical":1,"high":0,"medium":0}} -->
