---
name: asset-helpers-save
version: 1.0.0
description: asset-helpers 子 Skill。被 seedance-asset / asset-helpers/batch 调度，下载 generate-image 返回的 2 小时有效期图片 URL 到 novels/{name}/assets/ 子目录，写入 manifest.json 记录。
metaData: asset_skills
depends_on: [asset-helpers/generate-image]
output_tag: save_result
---

# 资产保存技能

[任务与边界]
    做：
    - 接收图片 URL + type + 资产名 + 小说名 + 提示词
    - 按 type 选定子目录（roles / scenes / props / storyboards）
    - mkdir -p 确保目录存在
    - curl 下载图片到 `novels/{name}/assets/{子目录}/{资产名}.png`
    - 验证文件存在 + 大小 > 0
    - 读写 manifest.json 增量更新该资产记录

    不做：
    - 不调用图片生成 API（属 asset-helpers/generate-image）
    - 不润色或修改提示词（属 asset-helpers/polish）
    - 不批量遍历资产清单（属 asset-helpers/batch）
    - 不处理 URL 失效问题（URL 失效需调用方重新走 polish→generate-image）

    完成标准：
    - 文件存在于 `novels/{name}/assets/{子目录}/{资产名}.png` 且大小 > 0
    - manifest.json 含该资产记录（含 type / name / prompt / filePath / sourceUrl / status / generatedAt）

[第一性原则]（优先级从高到低）
    1. URL 立即下载
       上游 generate-image 返回的 URL 仅 2 小时有效。本 Skill 必须在收到 URL 后立即下载，不得延迟入队。
    2. 验证文件完整
       下载后必须校验：文件存在 + 文件大小 > 0。任一失败即视为下载失败，返回明确错误，不写 manifest 成功记录。
    3. manifest 是真相之源
       每次下载成功必须立即写 manifest.json。文件落盘但 manifest 未更新 → 下次扫描会判定为缺失而重新生成，浪费 API 配额。
    4. 同名覆盖
       重新生成时同名文件直接覆盖（不做版本号后缀）。manifest 中对应记录被新记录覆盖。

[依赖检测]
    必需（缺失则终止）：
    [1] 图片 URL（来自 generate-image）
        检测：caller 已传入非空 imageUrl
        失败话术（一字不改）：
          "缺少图片 URL。需要 caller 在 packet 中传入 imageUrl（来自 asset-helpers/generate-image 的输出）。"

    [2] 资产元信息
        检测：caller 已传入 novelName + type + name + prompt 四字段
        失败话术（一字不改）：
          "缺少资产元信息。需要 caller 在 packet 中传入 novelName + type + name + prompt 四字段。"

    [3] 项目目录
        检测：`novels/{novelName}/` 存在
        失败话术（一字不改）：
          "找不到项目目录 novels/{novelName}/。需要确认项目名称拼写和项目已初始化。"

    可选（缺失则降级）：
    - `novels/{novelName}/assets/manifest.json` → 不存在则初始化为 `{"generatedAt": "", "assets": []}`

[文件路径与命名规则]

    [子目录映射]
        | type | 子目录 |
        |------|--------|
        | role | roles/ |
        | scene | scenes/ |
        | props | props/ |
        | storyboard | storyboards/ |

    [完整路径]
        `novels/{novelName}/assets/{子目录}/{资产名}.png`

    [文件名规则]
        - 中文名称直接使用，不做转码
        - 特殊字符（`/ \ : * ? " < > |`）替换为 `-`
        - 同名文件覆盖（重新生成时替换旧图）

    [manifest.json 记录格式]
        ```json
        {
          "type": "role",
          "name": "王林",
          "prompt": "{使用的提示词}",
          "filePath": "roles/王林.png",
          "sourceUrl": "{原始图片 URL}",
          "status": "success",
          "generatedAt": "2026-04-26T10:30:00Z"
        }
        ```
        在 assets 数组中按 type+name 唯一标识，已存在则覆盖该条；新条目追加末尾。

[工作流程]
    第 1 步：确定保存路径
        按 [子目录映射] 确定 {子目录}。
        按 [文件名规则] 处理 {资产名} 中的特殊字符。
        组装完整路径：`novels/{novelName}/assets/{子目录}/{资产名}.png`。

    第 2 步：确保目录存在
        ```bash
        mkdir -p novels/{novelName}/assets/{子目录}
        ```

    第 3 步：下载图片
        ```bash
        curl -o "novels/{novelName}/assets/{子目录}/{资产名}.png" "{imageUrl}"
        ```

    第 4 步：验证下载
        - `test -f "{完整路径}"` → 文件存在
        - `wc -c < "{完整路径}"` → 大小 > 0
        任一失败 → 返回失败结果（"下载失败：HTTP 404" / "文件大小为 0"）。

    第 5 步：更新 manifest.json
        读取 `novels/{novelName}/assets/manifest.json`（不存在则初始化为 `{"generatedAt":"","assets":[]}`）。
        按 [manifest.json 记录格式] 构建该资产记录。
        在 assets 数组按 type+name 查找：存在 → 覆盖；不存在 → 追加。
        写回 manifest.json。

    第 6 步：返回结果
        按 [输出格式] 输出本地路径或失败原因。

[输出格式]
    成功：
        ```
        status: success
        filePath: {子目录}/{资产名}.png
        fullPath: novels/{novelName}/assets/{子目录}/{资产名}.png
        manifestUpdated: true
        ```

    失败：
        ```
        status: failed
        reason: {具体原因，如"下载失败：HTTP 404" / "文件大小为 0" / "manifest.json 写入失败"}
        ```

    强制 XML 包裹（v1 跨模型输出合约）：
    必须严格按照如下格式输出：

        <save_result>
        status: success
        filePath: roles/王林.png
        fullPath: novels/三体/assets/roles/王林.png
        manifestUpdated: true
        </save_result>

        <!-- meta: {"status":"passed","stage_reached":6,"failure_count":{"critical":0,"high":0,"medium":0}} -->

    异常合约：
    - [依赖检测] 失败 → 不输出 save_result 标签，仅输出失败话术 + meta.status='skill_failed'
    - 下载失败 → 输出 save_result（含 status=failed + reason）+ meta.status='download_failed'
    - manifest 写入失败但文件已下载 → 输出 save_result（含 manifestUpdated=false）+ meta.status='manifest_failed'

[输出风格]
    语态：
    - 文件系统工程师式短句。一行一项：状态、路径、操作结果。失败原因明确到可定位文件层。

    反例（明文禁止）：
    × "图片保存好了，请检查目录。"
    ✓ "status: success | filePath: roles/王林.png | manifestUpdated: true"

    × "下载好像有点问题。"
    ✓ "status: failed | reason: 文件大小为 0（curl 返回 200 但 body 为空，疑似 URL 已过期）"

[初始化]
    AI 被 /asset-helpers-save 调用时按顺序执行：

    1. 输出开场："资产保存启动。下载→校验→写 manifest。"

    2. 执行 [依赖检测]
       - 失败 → 按对应失败话术输出，停止流程

    3. 进入 [工作流程] 第 1 步
