---
name: seedance-storyboard-prompt
version: 1.0.0
description: 分镜提示词编写技能（Seedance 阶段 C3）。基于讲戏本/分镜表/资产/导演规划，按 Track 合成 Seedance 2.0 动态视频提示词，输出 02-prompts.md，可直接复制到平台生成视频。
metaData: seedance_skills
depends_on: ["shared/storyboard-prompt-techniques", "shared/emotion-face-mapping"]
output_tag: storyboard_prompts
---

# Seedance 2.0 分镜提示词技能（阶段 C3）

[任务与边界]
    做：
    - 读取分镜表（按 trackId 分组）+ 资产 + 导演讲戏 + 导演规划 + 画风视频模板
    - 按 Track 级合成提示词（一个 Track = 一段叙事 = 一条提示词 = 一次 Seedance 任务）
    - 应用五层结构思考、@资产引用、首帧原则、嘴型规范，输出连续叙事段落
    - 写入 novels/{name}/seedance/ep{N}/02-prompts.md

    不做：
    - 不修改分镜表（仅消费）
    - 不生成视频（属于 seedance-video）
    - 不重复抄写知识层规则（统一引用 shared/storyboard-prompt-techniques.md）
    - 不为不在 character/scene-prompts 中的群演分配 @引用

    完成标准：
    - 02-prompts.md 写入成功，每个 Track 一段连续叙事
    - 每条提示词通过五层结构自检（参考图声明 + 风格基调 + 场景 + 分镜 + 嘴型）
    - @图片引用从 1 开始独立编号，对应素材表全局编号
    - 远景/大远景段不出现可辨识人物
    - 时间轴整数秒，最后镜头结束 = Track 视频时长

[第一性原则]（优先级从高到低）
    1. 平台合规高于一切
       违反 Seedance 2.0 红线（真人面部/暴力血腥/色情/未成年人/政治敏感等）直接审核拒绝。
       详细红线清单和合规改写方法见 shared/storyboard-prompt-techniques.md。
    2. @图片引用零遗漏
       Track 内所有 shot 的 assetIds 去重后，**全部**必须出现在该 Track 的 @图N 引用列表中。
    3. 远景人物禁令
       大远景/远景时间段内禁止出现任何可辨识人物形态（人影/身影/剪影/小人均禁），
       角色 @图N 仅在中景及更近景别使用。
    4. 关系词/代词禁用
       不得用"父亲/母亲/儿子/丈夫"等关系词指代角色，不得用"他/她/他们"在歧义处指代，
       必须用 @图N + 角色名。
    5. 输出连续叙事
       提示词是导演式段落，禁止分层标签（"前缀:""场景:"）、禁止结构化括号（"(景别:XX)"）、
       禁止元数据标签（"【时长:约X秒】"）、禁止否定句（"禁止字幕"→ 直接省略）。
    6. 时间轴精度
       使用整数秒，禁止小数（0-5s ✓，0-5.5s ✗）；最后镜头结束时间 = Track 视频时长。

[依赖检测]
    必需（缺失则终止）：
    [1] 分镜表
        检测：Read novels/{name}/seedance/ep{N}/storyboard-table.json
        失败话术（一字不改）：
          "缺少分镜表：novels/{name}/seedance/ep{N}/storyboard-table.json。请先完成阶段 C2。"

    [2] 资产数据
        检测：Read novels/{name}/seedance/assets.json
        失败话术（一字不改）：
          "缺少资产数据：novels/{name}/seedance/assets.json。请先完成阶段 B。"

    [3] 导演规划
        检测：Read novels/{name}/seedance/ep{N}/director-plan.json
        失败话术（一字不改）：
          "缺少导演规划：novels/{name}/seedance/ep{N}/director-plan.json。请先完成阶段 C1。"

    [4] 导演讲戏本
        检测：Read novels/{name}/seedance/ep{N}/01-director.md
        失败话术（一字不改）：
          "缺少导演讲戏本：novels/{name}/seedance/ep{N}/01-director.md。请先完成阶段 A。"

    [5] 提示词技法（shared）
        检测：Read shared/storyboard-prompt-techniques.md
        失败话术（一字不改）：
          "缺少 shared/storyboard-prompt-techniques.md。提示词五层结构、画质锁定、合规改写规则无法加载。"

    [6] 情绪面部映射（shared）
        检测：Read shared/emotion-face-mapping.md
        失败话术（一字不改）：
          "缺少 shared/emotion-face-mapping.md。情绪到面部描写的映射规则无法加载。"

    [7] 画风视频提示词模板
        检测：从 assets.json 读取 artStyle，Read skills/art-styles/{artStyle}/art_prompt/art_storyboard_video.md
        失败话术（一字不改）：
          "缺少画风视频模板：skills/art-styles/{artStyle}/art_prompt/art_storyboard_video.md。"

[核心写作框架]

    [五层结构]（写作思考框架，输出时融合为连续段落）
        L0 参考图声明：参考图中各人物的位置（如"上半部分@图1顾川，下半部分@图2沈瑶"），必须是首句
        L1 全局参数：风格锚点词 + 画质锁定 + 反向提示词 + 时长 + 转场 + director-plan 色彩关键词
        L2 场景落笔：通过 @场景图引用 + lighting 字段叙事化（1-2 句，不重复参考图静态内容）
        L3 蒙太奇叙事核心：按 Track 时长分段时间轴，每段融合景别/运镜/动作/情绪面部/台词/音效
        L4 嘴型标注：旁白闭嘴/对话张嘴/独白翕动（一句话说明全局口型规则）

        > 详细技法（首帧原则、风格锚点、画质锁定、远景禁令、合规红线、用词柔化等）
        > 全部见 shared/storyboard-prompt-techniques.md，不在此重复。

    [JSON→叙事字段映射]（按 Track 分组后逐 shot 合成）
        L0 / L1：写在 Track 提示词最前
        L2：assetIds 中的场景图 + lighting → 场景定位句
        L3 每段：
          - 时间标记（X-Xs:）
          - 空间布局（左/中/右 + 前景/中景/背景）
          - shotType → 景别融入叙事（"近景中…"，禁止括号"（景别:近景）"）
          - cameraMove → 运镜融入动作节奏（"镜头从侧脸缓推至窗外"）
          - action → 动作链（动词+方向+幅度+速度）
          - emotion → 查 shared/emotion-face-mapping.md 转面部/眼部描写
          - dialogue → 用「」标注台词原文（剧本一字不改）
          - soundEffect → 环境音/动作音用括号或自然句穿插**在该时间段内**
        L4：末尾一句嘴型规则

    [Track 级合成规则]
        - C3 按 Track 而非按 shot 生成提示词
        - Track 视频时长 = round(组内 shot duration 之和)，必须落在 Seedance 整数秒集合 [4..15]
          · <4 → 与相邻 Track 合并｜>15 → 拆分
        - L3 时间轴覆盖取整后的 Track 视频时长，每段不超过 3s（叙事密度可控）
        - 时长分段建议：4-6s→2-3 段｜7-9s→3-4 段｜10-12s→4-5 段｜13-15s→5-6 段
        - 景别过渡：shot 间用运镜平滑连接（"镜头从全景缓推至近景"）
        - 情绪弧线：Track 内多 shot emotion 编织为连续变化
        - 动作连续性：上 shot 终态 → 下 shot 起态自然衔接

    [@引用规范]
        - 每条提示词从 @图1 独立编号（不用素材表全局编号）
        - 格式：@图N（角色名-素材表@图M）｜@图N（场景名-素材表@图M）
        - 引用顺序：先角色后场景后道具
        - 多用途时标注：形象参考/场景参考/动作参考/氛围参考
        - 单条平台约束：图片 ≤9 张｜视频 ≤3｜音频 ≤3｜总文件 ≤12
        - 超 9 张时按优先级裁剪：焦点角色 > 场景 > 次角色 > 衍生 > 关键道具 > 场景衍生 > 背景角色 > 非焦点道具

    [群演/一次性配角]
        不在 character-prompts.md 中的人物（路人甲/配角）：
        - 不分配 @编号
        - 直接用文字描述外观和动作（外观从导演讲戏本提取）
        - 示例：路人甲 → "一个尖脸眯缝眼的白袍学员侧头低声说…"

[工作流程]

    第 1 步：执行 [依赖检测]
        必需依赖任一缺失 → 输出失败话术终止；否则继续。

    第 2 步：吸收上游产物
        - 阅读分镜表，按 trackId 分组建立索引
        - 阅读资产 + 讲戏本 + 导演规划，建立 character/scene/prop @编号映射表
        - 阅读 shared/storyboard-prompt-techniques.md（详细技法）
        - 阅读 shared/emotion-face-mapping.md（情绪映射）
        - 阅读画风的 art_storyboard_video.md（视频模板）

    第 3 步：建立素材对应表
        - 在文档头部建立素材对应表（人物 → 场景 → 道具顺序编号）
        - 场景图按九宫格中的格子单独编号（不是整张九宫格作一图）
        - 仅 character-prompts/scene-prompts 中存在的资产进对应表

    第 4 步：按 Track 编写提示词
        每个 Track：
        a. 计算视频时长（round 后必须 ∈ [4..15]）
        b. 按 [@引用规范] 收集 Track 内所有 assetIds 去重，零遗漏分配 @图N
        c. 按 [五层结构] 融合输出：L0 参考图声明 → L1 风格基调 → L2 场景 → L3 时间轴叙事 → L4 嘴型
        d. emotion 字段查 shared/emotion-face-mapping.md 转面部描写
        e. 远景/大远景段：只描写环境，禁止可辨识人物
        f. 合规检查：触碰红线则按 shared/storyboard-prompt-techniques.md 改写并标注"已合规改写"

    第 5 步：自检每条提示词
        - 五层完整？连续叙事无分层标签？无结构化括号？无元数据标签？无否定句？
        - @图引用零遗漏？编号从 1 开始？带角色名/场景名？
        - 时间轴整数秒？最后段结束 = Track 视频时长？
        - 远景段无可辨识人物？关系词/代词全部替换为 @图N？
        - 独白配音是否在备注区标注时间段？

    第 6 步：写入 02-prompts.md，输出汇报
        汇报：Track 数量 / 提示词数量 / 触碰红线改写数 / 备注区独白配音条目数。

[输出格式]

    产物：novels/{name}/seedance/ep{N}/02-prompts.md

    每个 Track 输出格式：
    ```
    ## T{N}【Track 叙事主题】

    [一整段连续叙事 = L0 参考图声明 + L1 风格基调 + L2 场景 + L3 时间轴分段叙事 + L4 嘴型规则]

    > **独白配音**（如有）：[时间段]，[角色名][动作]时配音："[独白台词]"（语气：[描述]）
    > **备注**：[预估时长 / 改写说明 / 其他元信息]
    ```

    强制 XML 包裹（v1 跨模型输出合约）：

    <storyboard_prompts>
    [Track 数量摘要 + 完整 02-prompts.md 内容]
    </storyboard_prompts>

    <!-- meta: {"status":"passed","stage_reached":6,"failure_count":{"critical":0,"high":0,"medium":0}} -->

    异常合约：
    - 业务数据缺失（[依赖检测] 失败）→ 不输出 storyboard_prompts，仅失败话术 + meta.status='skill_failed'
    - 个别 Track 触碰红线无法改写 → 输出已完成 Track 内容 + meta.status='stage1_blocked'，failure_count.critical 累计

[输出风格]
    语态：
    - 电影脚本式连续叙事。每个 Track 是一段可直接朗读的导演式段落。

    反例（明文禁止）：
    × "前缀：3D CG电影风格。场景：古朴书房。分镜：（景别：近景 视角：平视）林书白睁眼。【时长：约5秒】"
    ✓ "参考图上半部分是@图1（林书白）。3D CG电影风格，流畅动作过渡，无音乐有音效，说中文。
       0-2秒：首帧：@图1（林书白）在@图2（简陋住处）中静静躺在床上，灰蓝色清晨微光映在他面部，
       近景中他缓缓睁开双眼，眼神从迷茫渐渐聚焦……"

    × "禁止出现字幕"
    ✓ 直接省略，不提及字幕

    × "目光下垂回避父亲的注视"
    ✓ "目光下垂回避@图2叶天成的注视"

[初始化]
    AI 被 /seedance-storyboard-prompt 调用时按顺序执行：

    1. 输出开场："Seedance 阶段 C3 启动 — 开始按 Track 合成视频提示词。"

    2. 执行 [依赖检测]
       失败 → 按失败话术终止

    3. 进入 [工作流程] 第 2 步
