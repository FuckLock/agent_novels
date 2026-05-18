---
name: seedance-director-plan
version: 1.0.0
description: 导演规划技能（Seedance 阶段 C1）。基于导演分析（讲戏本）和资产数据，从六个维度规划全集视觉/叙事结构，产出 director-plan.json，作为后续分镜表/分镜提示词的视觉基准。
metaData: seedance_skills
depends_on: []
output_tag: director_plan
---

# 导演规划技能（Seedance 阶段 C1）

[任务与边界]
    做：
    - 读取 ep{N}/01-director.md（讲戏本）+ assets.json（资产数据）+ 当前画风的 director_planning_style.md
    - 按六维度（主题/视觉风格/叙事节奏/逐场景情绪/声音/转场）规划全集
    - 产出符合 schemas/director-plan.schema.json 的结构化 JSON
    - 写入 novels/{name}/seedance/ep{N}/director-plan.json

    不做：
    - 不编写分镜表（属于 seedance-storyboard-table）
    - 不编写视频提示词（属于 seedance-storyboard-prompt）
    - 不修改资产或讲戏本（仅消费上游产物）
    - 不脑补讲戏本中没有的场景或人物

    完成标准：
    - director-plan.json 写入成功且通过 schema 校验
    - 六维度全部填充（无空字段）
    - 视觉方案与已有资产风格不冲突
    - 色彩/光线方案与情感主线有明确对应

[第一性原则]（优先级从高到低）
    1. 讲戏本是唯一叙事真源
       所有规划必须基于 01-director.md 中实际存在的场景/人物/转折，禁止凭空发挥。
    2. 资产是硬约束
       assets.json 中已生成的角色/场景造型不可推翻，视觉规划必须与之兼容。
    3. 画风约束高于个人偏好
       director_planning_style.md 中的禁忌项必须严格遵守，方案选择不得冲突。
    4. 六维度必须互恰
       色彩/光线/构图/情绪/声音/转场之间不得自相矛盾（如"温暖"主题搭"冷肃杀色"基调）。
    5. 讲戏要有温度
       规划过程用导演叙述风格表达思考，不要写成干巴巴的字段填充；最终 JSON 才结构化。

[依赖检测]
    必需（缺失则终止）：
    [1] 导演讲戏本
        检测：Read novels/{name}/seedance/ep{N}/01-director.md
        失败话术（一字不改）：
          "缺少导演讲戏本：novels/{name}/seedance/ep{N}/01-director.md。请先完成阶段 A（导演分析）。"

    [2] 资产数据
        检测：Read novels/{name}/seedance/assets.json
        失败话术（一字不改）：
          "缺少资产数据：novels/{name}/seedance/assets.json。请先完成阶段 B（资产生成）。"

    [3] 画风规划约束
        检测：从 assets.json 读取 artStyle 字段，Read skills/art-styles/{artStyle}/director_skills/director_planning_style.md
        失败话术（一字不改）：
          "缺少画风规划约束文件：skills/art-styles/{artStyle}/director_skills/director_planning_style.md。请确认画风配置完整。"

    可选（缺失则降级）：
    - schemas/director-plan.schema.json → 缺失则按下文 [输出格式] 中模板结构产出，不做 schema 校验

[六维度规划框架]

    [维度一：主题与叙事核心]
        - 一句话本集主题（≤20 字）
        - 核心情感（心疼/紧张/甜蜜/愤怒/释然 等单选或主辅）
        - 叙事钩子（开头抓人手段）+ 结尾设计（悬念或余韵）
        - 上下集情感衔接（承接前集情绪、铺垫下集情绪）

    [维度二：视觉风格基调]（最核心）
        色彩方案（七选一或主辅组合，主色调 ≥60% 镜头）：
        1 暖光淡彩｜2 青绿含蓄｜3 柔暖暗影｜4 冷肃杀色｜5 窗纱漫透｜6 月华清冷｜7 喜庆暖光

        光线方案（A-G 七选一或场景级变化）：
        A 自然散射光｜B 侧逆光｜C 顶光｜D 底光｜E 窗光｜F 烛光/暖点光源｜G 月光/冷色环境光

        构图风格：对称偏好｜留白方向（上=压抑释放，下=不安定）｜前景遮挡频率｜人物画面位置习惯
        材质方向：颗粒感/胶片感/数字清晰｜景深偏好｜色彩饱和度范围

    [维度三：叙事结构与节奏]
        - 场景分组：按叙事功能命名（如"日常铺垫""矛盾爆发""真相揭晓"），标注情绪基调和时长占比
        - 情绪曲线：转折点（场景+触发事件）、最高/最低点、变化速度（急转/渐变）
        - 5 段节奏：opening(10-15%)→rising(25-30%)→climax(15-20%)→falling(20-25%)→ending(10-15%)

    [维度四：逐场景情绪意图]
        每个场景填：
        - directorIntent（一句话叙事目的）
        - emotionKeywords（2-3 个，角色+观众）
        - audienceDistance：旁观者（信息交代）｜共情者（情感高潮）｜窥视者（悬念秘密）
        - visualFocus（一个表情/一个动作/一件道具）
        - transition（与前后场景的视觉过渡方式）

    [维度五：声音与音乐方向]
        - BGM：分段落风格（描述情绪+乐器倾向，不指定具体曲目）、切换点对齐叙事转折、音量节奏
        - 关键音效：环境音（雨/风/人群/寂静）、动作音（门关上/杯碎/脚步）、情绪音（心跳/呼吸/耳鸣）
        - 静默运用：哪些时刻无声胜有声、持续时长、前后声音对比设计

    [维度六：转场与视觉连贯]
        - 重大情节转折的视觉标记方式
        - 时间跳跃处理（叠化/黑场/道具过渡）
        - 空间切换处理（匹配剪辑/运动过渡）
        - 相邻场景切换方式（硬切/叠化/淡入淡出/匹配剪辑/声音先行）+ 选择依据

[工作流程]

    第 1 步：执行 [依赖检测]
        若任一必需依赖缺失 → 输出失败话术终止；否则继续。

    第 2 步：吸收讲戏本与资产
        - 通读 01-director.md，提炼场景列表、关键转折、人物情绪轨迹
        - 通读 assets.json，记录已存角色/场景/道具的视觉特征和风格锚点
        - 阅读 director_planning_style.md，记录画风的色调偏好、禁忌、风格锚点

    第 3 步：六维度逐项规划（讲戏风格）
        按 [六维度规划框架] 中维度一至六的顺序，**用导演叙述方式**展开思考。
        每个维度都要给出"为什么这样选"的叙事理由，不只是字段填充。

    第 4 步：互恰性自检
        - 视觉风格 ↔ 主题情感：色彩/光线方案是否服务于核心情感？
        - 节奏分段 ↔ 场景分组：5 段节奏是否覆盖全部场景，无遗漏无重叠？
        - 逐场景情绪 ↔ 情绪曲线：每个场景的情绪是否落在曲线对应位置？
        - 声音方向 ↔ 转场方案：BGM 切换点和场景转场点是否协调？
        - 资产兼容性：规划方案中是否出现与已有资产风格冲突的描述？

    第 5 步：结构化为 JSON
        将六维度规划结果按 [输出格式] 中的 director-plan.json 模板填充，写入文件。

    第 6 步：完成汇报
        简述本集核心视觉方向（主题一句话 + 色彩+光线方案 + 节奏特点 + 关键转场）。

[输出格式]

    产物：novels/{name}/seedance/ep{N}/director-plan.json（符合 schemas/director-plan.schema.json）

    JSON 结构：
    ```json
    {
      "episode": "ep{N}",
      "theme": {
        "title": "本集主题（≤20字）",
        "coreEmotion": "核心情感",
        "hook": "叙事钩子",
        "ending": "结尾设计",
        "prevLink": "承接上集",
        "nextLink": "铺垫下集"
      },
      "visualStyle": {
        "colorScheme": { "primary": "...", "secondary": "...", "ratio": "..." },
        "lighting":    { "primary": "...", "variations": ["..."] },
        "composition": { "symmetry": "...", "whitespace": "...", "foregroundOcclusion": "...", "subjectPlacement": "..." },
        "texture":     { "grain": "...", "depthOfField": "...", "saturation": "..." }
      },
      "narrative": {
        "sceneGroups": [...],
        "emotionCurve": [...],
        "pacing": { "opening": {...}, "rising": {...}, "climax": {...}, "falling": {...}, "ending": {...} }
      },
      "sceneIntents": [
        { "sceneId": "...", "directorIntent": "...", "emotionKeywords": ["..."], "audienceDistance": "...", "visualFocus": "...", "transition": "..." }
      ],
      "sound": { "bgm": [...], "keyEffects": [...], "silence": [...] },
      "transitions": [
        { "from": "...", "to": "...", "method": "...", "reason": "..." }
      ]
    }
    ```

    强制 XML 包裹（v1 跨模型输出合约）：

    <director_plan>
    [本集核心视觉方向叙述 + 完整 director-plan.json 内容]
    </director_plan>

    <!-- meta: {"status":"passed","stage_reached":6,"failure_count":{"critical":0,"high":0,"medium":0}} -->

    异常合约：
    - 业务数据缺失（[依赖检测] 失败）→ 不输出 director_plan，仅输出失败话术 + meta.status='skill_failed'
    - 六维度互恰性自检失败 → 输出已完成的 director_plan + meta.status='stage1_blocked'，并在 meta.failure_count 中累计

[输出风格]
    语态：
    - 导演式叙述。每个维度先讲"为什么"，再给"是什么"。结构化 JSON 是结果，不是思路。

    反例（明文禁止）：
    × "色彩选 2，光线选 E，构图对称，差不多就行。"
    ✓ "本集核心是隐忍中的眷恋，主色调用青绿含蓄压住外露的情绪，配 E 窗光让女主侧脸半明半暗，
       构图大量左留白以承载未说出口的话。"

[初始化]
    AI 被 /seedance-director-plan 调用时按顺序执行：

    1. 输出开场："Seedance 阶段 C1 启动 — 开始六维度导演规划。"

    2. 执行 [依赖检测]
       失败 → 按失败话术终止

    3. 进入 [工作流程] 第 2 步
