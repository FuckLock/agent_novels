---
name: seedance-video
version: 1.0.0
description: Seedance 阶段 D 视频生成 Skill。被 seedance 视频 Agent 调度，解析 02-prompts.md 的 Track 级提示词，收集参考图，调用 Seedance 2.0 API 生成视频，写入 tasks.json 并更新 storyboard-table.json。
metaData: seedance_skills
depends_on: []
output_tag: video_task_report
---

# Seedance 视频生成技能

[任务与边界]
    做：
    - 解析 `novels/{name}/seedance/ep{N}/02-prompts.md`，拆为 T01/T02/T03... Track 级提示词
    - 从 assets.json 按提示词中的 `@图片引用` 收集参考图（最多 9 张/Track）
    - 转 base64 后调用 Seedance 2.0 API（multiReference 模式）提交任务
    - 创建 / 维护 `tasks.json`（schema：`schemas/tasks.schema.json`），任务流转 queued → submitted → running → success/failed
    - 按配置间隔轮询，成功下载视频到 `videos/T{NN}.mp4`
    - 更新 storyboard-table.json 对应行的 videoState / videoPath / videoTaskId

    不做：
    - 不写分镜表（属 seedance-storyboard-table）
    - 不写分镜提示词（属 seedance-storyboard-skill / 阶段 C3）
    - 不生成参考图（属 seedance-asset / 阶段 B）
    - 不调整 Track 拆分逻辑（按 02-prompts.md 已有的 T01/T02/... 边界）

    完成标准：
    - 每个 Track 对应一个视频任务进入 tasks.json
    - 成功任务的 mp4 文件落盘 `novels/{name}/seedance/ep{N}/videos/T{NN}.mp4`
    - storyboard-table.json 中对应行的 videoState / videoPath / videoTaskId 字段已更新
    - 所有失败任务 retryCount 已耗尽（最多 2 次重试）

[第一性原则]（优先级从高到低）
    1. 按 Track 切分
       一个 Track（T01/T02/...）= 一次视频生成任务。Track 内多 shot 的 duration 累加并取整，不拆为多任务。
    2. 时长仅取整数秒
       Seedance 2.0 只接受 [4,5,6,7,8,9,10,11,12,13,14,15] 秒。Track 时长 = round(Σ shot.duration)，超出范围则截断到最近合法值。
    3. 参考图上限 9 张
       multiReference 模式每条提示词最多 9 张参考图。若提示词中的 `@图片引用` 超 9 张，按出现顺序取前 9 张并在报告中标注。
    4. 失败可重试两次
       单任务最多重试 2 次（retryCount: 0→1→2）。第三次仍失败则标记最终失败。重试不重新提交相同 taskId，每次重试创建新 API 任务。
    5. 状态变更立写
       每次 tasks.json / storyboard-table.json 状态变更后立即写入磁盘，确保任意时点中断可断点续作。

[依赖检测]
    必需（缺失则终止）：
    [1] 分镜提示词
        检测：`novels/{name}/seedance/ep{N}/02-prompts.md` 存在且含至少一个 T01 等 Track 段
        失败话术（一字不改）：
          "缺少分镜提示词文件 novels/{name}/seedance/ep{N}/02-prompts.md。需要先完成阶段 C3 分镜师产出。"

    [2] 资产清单
        检测：`novels/{name}/seedance/assets.json` 存在
        失败话术（一字不改）：
          "缺少资产清单 novels/{name}/seedance/assets.json。需要先完成阶段 B 资产管理。"

    [3] 分镜表
        检测：`novels/{name}/seedance/ep{N}/storyboard-table.json` 存在
        失败话术（一字不改）：
          "缺少分镜表 novels/{name}/seedance/ep{N}/storyboard-table.json。需要先完成阶段 C2 分镜表构建。"

    [4] API 配置
        检测：`config/models/video/seedance-2.0.json` 存在并含 apiUrl / apiKey 字段
        失败话术（一字不改）：
          "缺少视频 API 配置 config/models/video/seedance-2.0.json，或字段不全（需 apiUrl / apiKey / pollInterval / maxConcurrency 等）。"

    [5] tasks.json schema
        检测：`schemas/tasks.schema.json` 存在
        失败话术（一字不改）：
          "缺少 schemas/tasks.schema.json。无法校验任务记录结构。"

    可选（缺失则降级）：
    - 已有 `novels/{name}/seedance/ep{N}/tasks.json` → 不存在则初始化空数组；存在则加载并跳过 state="success" 的任务

[API 调用规范]

    [配置加载]
        从 `config/models/video/seedance-2.0.json` 读取：
        - apiUrl：Seedance 2.0 API 地址
        - apiKey：API 密钥
        - defaultDuration：默认视频时长（秒）
        - defaultResolution：默认分辨率
        - pollInterval：轮询间隔（毫秒）
        - maxConcurrency：最大并发数

    [Track 时长计算]
        - 单条 Track 时长 = round(Σ Track 内所有 shot 的 duration)
        - 合法集：[4,5,6,7,8,9,10,11,12,13,14,15]
        - 超过 15 → 截断为 15；不足 4 → 上调到 4

    [API 提交参数]
        模式：multiReference
        参数：
        - prompt：提示词文本（来自 02-prompts.md 该 Track）
        - referenceImages：base64 编码的参考图数组（最多 9 张）
        - duration：整数秒（按 [Track 时长计算] 取值）
        - resolution：来自 defaultResolution
        提交后从响应取 API taskId。

    [TaskRecord 字段]（须符合 `schemas/tasks.schema.json`）
        ```json
        {
          "taskId": "UUID",
          "type": "video",
          "trackId": "T01",
          "episode": "ep01",
          "state": "queued",
          "modelId": "seedance-2.0",
          "resolution": "...",
          "duration": 8,
          "createdAt": "ISO 8601",
          "retryCount": 0,
          "apiTaskId": null,
          "resultPath": null,
          "completedAt": null,
          "error": null
        }
        ```

    [并发与重试]
        | 参数 | 默认值 | 说明 |
        |------|--------|------|
        | 最大并行数 | 3（来自 maxConcurrency） | 同时运行的视频生成任务上限 |
        | 失败重试次数 | 2 | 单个任务最大重试次数 |
        | 轮询间隔 | 30 秒（来自 pollInterval） | 查询任务状态的时间间隔 |

        失败重试：retryCount < 2 → retryCount++，重新创建 API 任务；retryCount >= 2 → 最终失败。

[工作流程]
    第 1 步：解析 02-prompts.md
        - 读 `novels/{name}/seedance/ep{N}/02-prompts.md`
        - 按 T01 / T02 / T03... 边界拆为独立 Track 提示词块
        - 每条 Track = 一个视频任务

    第 2 步：收集参考图
        对每条 Track：
        - 从提示词中提取所有 `@图片引用`
        - 在 assets.json 中按引用名查 imagePath
        - 读取本地图片文件转 base64
        - 超过 9 张 → 取前 9 张，在报告中标注"⚠ T{NN} 参考图超 9 张，已截取前 9 张"

    第 3 步：计算 Track 时长
        - 从 02-prompts.md 中 Track 的 L1 行或 storyboard-table.json 中查询每个 shot 的 duration
        - Track 时长 = round(Σ duration)
        - 按 [Track 时长计算] 截断到合法值

    第 4 步：创建 / 加载 tasks.json
        - 如已存在 → 加载，跳过 state="success" 的任务
        - 不存在 → 初始化空数组
        - 为每个未完成 Track 创建 TaskRecord（state: queued，retryCount: 0），写入 tasks.json

    第 5 步：调用 Seedance 2.0 API 提交
        按 [API 提交参数] curl 提交，按 [并发与重试] 控制并发（默认 3）。
        提交成功 → tasks.json state: queued → submitted，写入 apiTaskId。
        提交失败 → 视为本次失败，走第 7 步重试逻辑。

    第 6 步：轮询任务状态
        按 pollInterval（默认 30 秒）轮询 API。
        - status: running → 继续等，tasks.json state: submitted → running
        - status: succeeded → 第 7 步处理成功
        - status: failed → 第 7 步处理失败

    第 7 步：处理结果
        成功：
        - 下载视频到 `novels/{name}/seedance/ep{N}/videos/T{NN}.mp4`
        - tasks.json：state → success，resultPath → 该 mp4 路径，completedAt → ISO 时间
        - 更新 storyboard-table.json 对应行：videoState=success / videoPath=该 mp4 / videoTaskId=apiTaskId

        失败：
        - retryCount < 2 → retryCount++，回到第 5 步重新提交
        - retryCount >= 2 → tasks.json：state → failed，error → 失败原因
        - 更新 storyboard-table.json：videoState=failed

    第 8 步：汇总报告
        按 [输出格式] 模板组装，统计成功 / 失败 / 跳过数量。

[输出格式]
    最终汇报模板：

        ## 视频生成报告（ep{N}）

        ✓ 成功：X | ✗ 失败：Y | ⏭ 跳过：Z（已存在 success）

        ### 详细结果
        - ✓ T01 → videos/T01.mp4（时长 8s，参考图 5 张）
        - ✓ T02 → videos/T02.mp4（时长 10s，参考图 9 张，⚠ 已截取前 9 张）
        - ✗ T03 → 失败原因（如"轮询超时 / API 失败：prompt 命中违禁词"），已重试 2 次
        - ⏭ T04（已存在 success）

        ## 数据更新
        - tasks.json：X 条记录已写入
        - storyboard-table.json：X 行的 videoState / videoPath / videoTaskId 已更新

        ## 视频文件
        全部保存在 novels/{name}/seedance/ep{N}/videos/

    强制 XML 包裹（v1 跨模型输出合约）：
    必须严格按照如下格式输出：

        <video_task_report>
        ## 视频生成报告（ep01）

        ✓ 成功：12 | ✗ 失败：1 | ⏭ 跳过：2

        ### 详细结果
        ...
        </video_task_report>

        <!-- meta: {"status":"passed","stage_reached":8,"failure_count":{"critical":0,"high":1,"medium":0}} -->

    异常合约：
    - [依赖检测] 失败 → 不输出 video_task_report 标签，仅输出失败话术 + meta.status='skill_failed'
    - 部分 Track 失败 → 输出完整 video_task_report + meta.failure_count 反映具体数
    - 全部 Track 失败 → 输出 video_task_report（逐项 failed）+ meta.status='all_failed'

[输出风格]
    语态：
    - 任务调度系统式精准。一行一 Track 一结果，时长 / 参考图数 / 路径 / 失败原因齐全可定位。

    反例（明文禁止）：
    × "视频大部分生成成功，少数有问题。"
    ✓ "✓ 成功：12 | ✗ 失败：1（T03 已重试 2 次，最终失败原因：API 返回 prompt 命中违禁词『血腥』，建议调整 02-prompts.md 中 T03 的描述）| ⏭ 跳过：2"

    × "T01 视频好了。"
    ✓ "✓ T01 → videos/T01.mp4（时长 8s，参考图 5 张：char-001 / scene-002 / prop-001 / prop-003 / scene-005）"

[初始化]
    AI 被 /seedance-video 调用时按顺序执行：

    1. 输出开场："视频生成启动。解析提示词→收参考图→提交→轮询→落盘。"

    2. 执行 [依赖检测]
       - 任一必需失败 → 按对应失败话术输出，停止流程

    3. 进入 [工作流程] 第 1 步
