---
name: asset-helpers-generate-image
version: 1.0.0
description: asset-helpers 子 Skill。被 seedance-asset / asset-helpers/batch 调度，接收 polish 后的提示词组合最终 prompt，调用 banana 图像 API 提交+轮询，返回带 2 小时有效期的图片 URL（供 save 立即下载）。
metaData: asset_skills
depends_on: [asset-helpers/polish]
output_tag: image_task
---

# 图片生成技能

[任务与边界]
    做：
    - 读取 `config/banana.json` 取 url / apiKey / defaultModel / defaultAspectRatio
    - 按资产类型读取生成规范文件（scene-generateImage.md / tool-generateImage.md / storyboard-generateImage.md），role 类型跳过
    - 组合最终 prompt（画风前缀 + polish 输出 + generateImageSpec）
    - curl 提交 banana API，获取任务 ID
    - 轮询结果（每 5 秒，最多 20 次），返回图片 URL 或失败原因

    不做：
    - 不生成提示词（属 asset-helpers/polish）
    - 不下载图片到本地（属 asset-helpers/save）
    - 不写 manifest.json（属 asset-helpers/save）
    - 不批量调度多个资产（属 asset-helpers/batch）

    完成标准：
    - 提交成功且取得任务 ID
    - 轮询直到 status=succeeded（取 results[0].url）/ failed（取 failure_reason）/ 超时（100 秒）
    - 返回结果在 100 秒内交付

[第一性原则]（优先级从高到低）
    1. 画风前缀置首
       画风必须写在最终 prompt 的最前面，确保模型从 token 0 起就以指定风格生成。
    2. 角色类型不追加规范
       role 类型的 polish 输出已含四视图布局约束。banana API 只有单一 prompt 字段；追加 role-generateImage.md 会稀释外貌细节权重。其他类型必须追加。
    3. URL 时效 2 小时
       提交得到的图片 URL 有效期 2 小时，超时即失效。本 Skill 一返回成功 URL，调用方必须立即调 asset-helpers/save 下载。
    4. 失败可定位
       失败必须返回具体原因（HTTP 状态码 / failure_reason / 超时秒数），不输出"大概失败了"之类含混说法。

[依赖检测]
    必需（缺失则终止）：
    [1] API 配置文件
        检测：`config/banana.json` 存在，且含 url / apiKey / defaultModel / defaultAspectRatio 字段，且 url / resultUrl 是完整接口地址
        失败话术（一字不改）：
          "缺少 config/banana.json 或字段不全（需 url / resultUrl / apiKey / defaultModel / defaultAspectRatio）。无法提交生图任务。"

    [2] 上游 polish 输出
        检测：caller 已传入 [PROMPT] 与 [ARTSTYLE] 两块文本（来自 asset-helpers/polish）
        失败话术（一字不改）：
          "缺少上游 asset-helpers/polish 的输出（需含 [PROMPT] 与 [ARTSTYLE] 双块）。"

    [3] 资产类型
        检测：caller 已传入 type ∈ { role, scene, props, storyboard }
        失败话术（一字不改）：
          "缺少 type 字段或 type 取值非法（需为 role / scene / props / storyboard）。"

    可选（缺失则降级）：
    - 类型对应的 generateImageSpec 文件（scene-generateImage.md / tool-generateImage.md / storyboard-generateImage.md）→ scene/props/storyboard 类型缺失则警告但不阻止；role 类型不读

[API 调用规范]

    [配置加载]
        从 `config/banana.json` 读取：
        - url：生成接口完整地址（已是完整地址，直接使用，不拼接路径）
        - resultUrl：轮询接口完整地址
        - apiKey：鉴权密钥
        - defaultModel：模型名（如 nano-banana-2）
        - defaultAspectRatio：默认宽高比
        - imageSize：图片尺寸（如 2K）

    [提示词组合规则]
        角色（role）：
            ```
            风格：{ARTSTYLE}，{PROMPT 内容}
            ```
            不追加 generateImageSpec，保持 prompt 简洁。

        其他（scene / props / storyboard）：
            ```
            风格：{ARTSTYLE}，{PROMPT 内容}

            {generateImageSpec 全部内容}
            ```
            画风前缀必须在最前。scene 类型 generateImageSpec 含左1全景+右3多视角布局规范。

    [提交 API]
        ```bash
        curl -s -X POST "{url}" \
          -H "Authorization: Bearer {apiKey}" \
          -H "Content-Type: application/json" \
          -d '{
            "model": "{defaultModel}",
            "prompt": "{组合后的最终 prompt}",
            "aspectRatio": "{defaultAspectRatio}",
            "imageSize": "2K",
            "webHook": "-1"
          }'
        ```
        从响应取 `data.id` 作为任务 ID。

    [轮询 API]
        每 5 秒轮询一次，最多 20 次（合计 100 秒超时）。
        ```bash
        curl -s -X POST "{resultUrl}" \
          -H "Authorization: Bearer {apiKey}" \
          -H "Content-Type: application/json" \
          -d '{"id": "{任务 ID}"}'
        ```
        - status: running → 继续等
        - status: succeeded → 取 results[0].url 返回
        - status: failed → 取 failure_reason 返回失败
        - 20 次仍 running → 视为超时，返回"轮询超时（100 秒）"

[工作流程]
    第 1 步：读配置
        从 config/banana.json 取 url / resultUrl / apiKey / defaultModel / defaultAspectRatio / imageSize。

    第 2 步：读生成规范（role 跳过）
        - role：跳过（直接进入第 3 步，不追加 spec）
        - scene → prompts/scene-generateImage.md
        - props → prompts/tool-generateImage.md
        - storyboard → prompts/storyboard-generateImage.md
        将文件全文保存为 {generateImageSpec}，第 3 步追加到 prompt 末尾。

    第 3 步：组合最终 prompt
        按 [提示词组合规则] 组装。强制画风前缀置首。

    第 4 步：调用 banana API 提交任务
        按 [提交 API] 模板 curl，从响应取 `data.id`。
        - HTTP 非 2xx → 返回失败 "API 提交失败：HTTP {code}"
        - 响应无 data.id → 返回失败 "API 响应异常：缺 data.id"

    第 5 步：轮询结果
        按 [轮询 API] 模板，每 5 秒轮询，最多 20 次。
        - succeeded → 第 6 步
        - failed → 返回 "API 失败：{failure_reason}"
        - 超时 → 返回 "轮询超时（100 秒）"

    第 6 步：返回图片 URL
        按 [输出格式] 输出，提醒调用方 URL 仅 2 小时有效，必须立即交给 asset-helpers/save 下载。

[输出格式]
    成功：
        ```
        status: success
        imageUrl: {results[0].url}
        apiTaskId: {data.id}
        validUntil: 2 小时后
        nextAction: 立即调 asset-helpers/save 下载
        ```

    失败：
        ```
        status: failed
        reason: {具体原因，如"API 提交失败：HTTP 401" / "API 失败：prompt 命中违禁词" / "轮询超时（100 秒）"}
        apiTaskId: {data.id 或 null}
        ```

    强制 XML 包裹（v1 跨模型输出合约）：
    必须严格按照如下格式输出：

        <image_task>
        status: success
        imageUrl: https://...
        apiTaskId: task-xxx
        validUntil: 2 小时后
        nextAction: 立即调 asset-helpers/save 下载
        </image_task>

        <!-- meta: {"status":"passed","stage_reached":6,"failure_count":{"critical":0,"high":0,"medium":0}} -->

    异常合约：
    - [依赖检测] 失败 → 不输出 image_task 标签，仅输出失败话术 + meta.status='skill_failed'
    - 提交 / 轮询失败 → 输出 image_task（含 status=failed + reason）+ meta.status='api_failed'

[输出风格]
    语态：
    - 运维工程师式简洁。状态、URL、任务 ID、原因，一行一项。失败原因贴近排障所需的最小事实。

    反例（明文禁止）：
    × "图片好像生成失败了，可能是网络问题。"
    ✓ "status: failed | reason: 轮询超时（100 秒），20 次轮询均返回 status=running | apiTaskId: task-9f8c2a"

    × "请稍后重试。"
    ✓ "status: failed | reason: API 提交失败：HTTP 401（apiKey 鉴权失败）| apiTaskId: null"

[初始化]
    AI 被 /asset-helpers-generate-image 调用时按顺序执行：

    1. 输出开场："图片生成启动。读配置→组 prompt→提交→轮询。"

    2. 执行 [依赖检测]
       - 失败 → 按对应失败话术输出，停止流程

    3. 进入 [工作流程] 第 1 步
