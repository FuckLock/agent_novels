---
name: asset-helpers-batch
version: 1.0.0
description: asset-helpers 批量调度 Skill。被 seedance-asset 调度，从 outline.json 提取去重资产清单，按 roles→scenes→props 优先级串联调用 polish→generate-image→save 三个子 Skill，单点失败不中断，最终输出汇总报告。
metaData: asset_skills
depends_on: [asset-helpers/polish, asset-helpers/generate-image, asset-helpers/save]
output_tag: batch_report
---

# 资产批量生成技能

[任务与边界]
    做：
    - 从 `novels/{novelName}/outline.json` 提取所有集数中去重后的 characters / scenes / props 清单
    - 跨集去重（以 name 为唯一标识）
    - 读取 `novels/{novelName}/description` 取画风字段
    - 读取已有 manifest.json，跳过 status="success" 的资产
    - 按 roles → scenes → props 优先级，对每个资产串联 polish → generate-image → save
    - 单个资产失败不中断流程，记录到 manifest.json（status: "failed"）
    - 输出最终汇总报告（成功 / 失败统计 + 逐项结果）

    不做：
    - 不直接调用图片 API（委托 generate-image）
    - 不直接润色提示词（委托 polish）
    - 不直接下载文件（委托 save）
    - 不识别衍生资产（属 seedance-asset 主流程的 B1.5 步骤）
    - 不修改 outline.json

    完成标准：
    - outline.json 中所有跨集去重资产被尝试（成功或明确失败）
    - manifest.json 记录每个资产的最终状态
    - 输出报告含成功/失败计数与每项结果（含失败原因）

[第一性原则]（优先级从高到低）
    1. 单点失败不中断
       任一资产失败仅记录 status: "failed" 到 manifest 并继续处理下一个。整体流程绝不因单点失败终止。
    2. 优先级串行
       roles → scenes → props 严格按序处理。原因：角色是核心一致性锚点；场景比道具更影响视觉基调。
    3. 跳过已成功
       manifest.json 中 status="success" 的资产直接跳过，不重复消耗 API 配额。如需重新生成，调用方需先把对应记录从 manifest 删除。
    4. 每资产三步串联
       对每个资产严格按 polish → generate-image → save 顺序串联调用，前步成功才走下一步；前步失败立即记 failed 并跳到下一资产。

[依赖检测]
    必需（缺失则终止）：
    [1] 大纲文件
        检测：`novels/{novelName}/outline.json` 存在
        失败话术（一字不改）：
          "缺少大纲文件 novels/{novelName}/outline.json。需要先完成阶段 1 故事骨架。"

    [2] 项目简介
        检测：`novels/{novelName}/description` 存在
        失败话术（一字不改）：
          "缺少项目简介 novels/{novelName}/description。需要确认项目已初始化。"

    [3] API 配置
        检测：`config/banana.json` 存在
        失败话术（一字不改）：
          "缺少 config/banana.json。无法提交生图任务。"

    可选（缺失则降级）：
    - `novels/{novelName}/assets/manifest.json` → 不存在则初始化为 `{"generatedAt":"","assets":[]}`，所有资产均待生成

[批量调度策略]

    [资产去重规则]
        - 遍历 outline.json 所有集数（episodes 数组）
        - 对每集 characters / scenes / props 三类各自收集
        - 以 name 为唯一标识跨集去重，同名资产只保留一份描述
        - 描述合并策略：取首次出现的描述；后续集出现时若描述不一致，记录到该资产的 notes（v1 不主动用，留给衍生识别参考）

    [优先级与失败隔离]
        处理顺序：roles → scenes → props
        每个资产 4 步：
        1. 检查 manifest.json：已 status="success" → 跳过（计入"⏭ 跳过"）
        2. 调 asset-helpers/polish → 失败则 manifest 记 failed（reason: polish 失败原因），跳到下一资产
        3. 调 asset-helpers/generate-image → 失败则 manifest 记 failed（reason: API 失败原因），跳到下一资产
        4. 调 asset-helpers/save → 失败则 manifest 记 failed（reason: 下载/写入失败原因），跳到下一资产
        全成功 → manifest 记 success（含 filePath / sourceUrl / generatedAt）

    [汇总指标]
        - 总数 / 成功 / 失败 / 跳过
        - 按类型分组（roles / scenes / props）
        - 失败项必须列出具体失败原因

[工作流程]
    第 1 步：提取资产清单
        - 读 `novels/{novelName}/outline.json`
        - 遍历 episodes，收集所有集的 characters / scenes / props
        - 按 [资产去重规则] 跨集去重
        - 读 `novels/{novelName}/description`，提取画风字段

    第 2 步：读取配置与 manifest
        - 读 `config/banana.json`
        - 读 `novels/{novelName}/assets/manifest.json`（不存在则初始化）
        - 标记已 status="success" 的资产

    第 3 步：批量处理 roles
        遍历所有 role 资产：
        - 已成功 → 计入"⏭ 跳过"，下一个
        - 调 asset-helpers/polish（传 type=role + name + description + 画风信息）
        - 成功 → 调 asset-helpers/generate-image（传 type + polish 输出）
        - 成功 → 调 asset-helpers/save（传 imageUrl + novelName + type + name + prompt）
        - 任一步失败 → manifest 记 failed + 失败原因，下一个

    第 4 步：批量处理 scenes
        同第 3 步流程，type=scene。

    第 5 步：批量处理 props
        同第 3 步流程，type=props。

    第 6 步：更新 manifest.json 时间戳
        manifest.json 的 generatedAt 字段更新为当前 ISO 时间。

    第 7 步：组装汇总报告
        按 [输出格式] 模板组装。

[输出格式]
    汇总报告模板：

        ## 资产生成报告

        ✓ 成功：X 个
        ✗ 失败：Y 个
        ⏭ 跳过：Z 个（已存在 status=success）

        ### 角色（roles）
        - ✓ 角色名1 → roles/角色名1.png
        - ✗ 角色名2 → 失败原因（具体到可定位）
        - ⏭ 角色名3（已存在）

        ### 场景（scenes）
        - ✓ 场景名1 → scenes/场景名1.png
        - ...

        ### 道具（props）
        - ✓ 道具名1 → props/道具名1.png
        - ...

        所有资产保存在 novels/{novelName}/assets/

    强制 XML 包裹（v1 跨模型输出合约）：
    必须严格按照如下格式输出：

        <batch_report>
        ## 资产生成报告

        ✓ 成功：12 | ✗ 失败：1 | ⏭ 跳过：3

        ### 角色（roles）
        ...
        </batch_report>

        <!-- meta: {"status":"passed","stage_reached":7,"failure_count":{"critical":0,"high":1,"medium":0}} -->

    异常合约：
    - [依赖检测] 失败 → 不输出 batch_report 标签，仅输出失败话术 + meta.status='skill_failed'
    - 全部资产失败 → 输出 batch_report（含逐项 failed）+ meta.status='all_failed'
    - 部分失败 → 输出 batch_report + meta.failure_count 反映具体数

[输出风格]
    语态：
    - 调度中心式总览。先汇总数字，再分类列表，每行一资产一结果。失败必带具体 reason，不容含混。

    反例（明文禁止）：
    × "大部分资产成功生成，少数有问题。"
    ✓ "✓ 成功：12 | ✗ 失败：1 | ⏭ 跳过：3。失败：scene-雪山顶（API 失败：prompt 命中违禁词『血腥』，建议人工调整描述）。"

    × "请稍后重试失败的项。"
    ✓ "✗ 失败 1 项：role-反派老者（轮询超时 100 秒，apiTaskId: task-9f8c2a，可单独重试 polish + generate-image + save 链路）。"

[初始化]
    AI 被 /asset-helpers-batch 调用时按顺序执行：

    1. 输出开场："资产批量生成启动。先去重清单，再按 roles→scenes→props 串联三步。"

    2. 执行 [依赖检测]
       - 失败 → 按对应失败话术输出，停止流程

    3. 进入 [工作流程] 第 1 步
