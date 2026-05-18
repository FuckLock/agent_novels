---
name: seedance-storyboard-table
version: 1.0.0
description: 分镜表构建技能（Seedance 阶段 C2）。基于导演规划和资产数据，构建结构化分镜表（12 列字段 + trackId），自动执行 10 项连贯性校验，产出 storyboard-table.json。
metaData: seedance_skills
depends_on: ["shared/storyboard-table-techniques"]
output_tag: storyboard_table
---

# 分镜表构建技能（Seedance 阶段 C2）

[任务与边界]
    做：
    - 读取 director-plan.json + assets.json + scripts/episode-{N}.txt + 当前画风的 director_storyboard_style.md
    - 按场景分组逐组构建分镜行（12 列字段 + trackId）
    - 台词字段一字不改从剧本原文复制
    - 执行 10 项连贯性校验，自动修正或标记警告
    - 写入 novels/{name}/seedance/ep{N}/storyboard-table.json

    不做：
    - 不撰写视频提示词（属于 seedance-storyboard-prompt）
    - 不修改剧本台词（仅引用，禁止改字）
    - 不生成新资产（仅消费已存资产；缺失资产标 pending 由 seedance-asset 补全）
    - 不跳过 10 项校验（即使生成时已注意，仍必须跑完）

    完成标准：
    - storyboard-table.json 写入成功且通过 schema 校验
    - 每条分镜 13 个字段全部填充（无台词镜头 dialogue 为空字符串）
    - 10 项校验全部执行，结果记录在 _validationLog
    - 所有 Track 总时长 ≤15s
    - dialogue 字段与剧本原文一字不差

[第一性原则]（优先级从高到低）
    1. 台词原文锁定
       dialogue 必须从剧本逐字复制，不得添加、删除、修改任何文字。改一字即视为越权。
    2. 校验是强制流程
       10 项连贯性校验全部跑完，自动修正可改则改，不可改则标 warning，不得跳过。
    3. 字段无模糊
       不允许"某种光线""大概 3 秒"这类模糊表达，每个字段精确可执行。
    4. 光影锚定导演规划
       lighting 字段必须基于 director-plan.json 的 colorScheme + lighting 方案；同 scene group 内主基调不变。
    5. 缺信息不脑补
       导演规划信息不足时，在 _validationLog 中记录信息缺口，不要自行补完。

[依赖检测]
    必需（缺失则终止）：
    [1] 导演规划
        检测：Read novels/{name}/seedance/ep{N}/director-plan.json
        失败话术（一字不改）：
          "缺少导演规划：novels/{name}/seedance/ep{N}/director-plan.json。请先完成阶段 C1（导演规划）。"

    [2] 资产数据
        检测：Read novels/{name}/seedance/assets.json
        失败话术（一字不改）：
          "缺少资产数据：novels/{name}/seedance/assets.json。请先完成阶段 B（资产生成）。"

    [3] 剧本原文
        检测：Read novels/{name}/scripts/episode-{N}.txt
        失败话术（一字不改）：
          "缺少剧本原文：novels/{name}/scripts/episode-{N}.txt。台词原文锁定无法执行。"

    [4] 分镜表通用技法
        检测：Read shared/storyboard-table-techniques.md
        失败话术（一字不改）：
          "缺少 shared/storyboard-table-techniques.md。分镜表字段定义和校验规则无法加载。"

    [5] 画风分镜约束
        检测：从 assets.json 读取 artStyle，Read skills/art-styles/{artStyle}/director_skills/director_storyboard_table_style.md
        失败话术（一字不改）：
          "缺少画风分镜约束：skills/art-styles/{artStyle}/director_skills/director_storyboard_table_style.md。"

    可选（缺失则降级）：
    - schemas/storyboard-table.schema.json → 缺失则按 [输出格式] 模板结构产出，不做 schema 校验

[字段定义与核心规则]

    每条分镜 13 个字段（详见 shared/storyboard-table-techniques.md）：
    seq｜description｜scene｜assetIds｜duration｜shotType｜cameraMove｜action｜emotion｜lighting｜dialogue｜soundEffect｜trackId

    [台词时长公式]
        duration = 字数 ÷ 情绪语速 + 停顿时长 + 1s 余量
        情绪语速：日常 4 字/秒｜激动/争吵 5｜深沉/悲伤 3｜低语/犹豫 2.5
        停顿：逗号 +0.3s｜句号/问号/叹号 +0.5s｜省略号 +0.8s｜段落间 +1.0s

    [景别衔接规则]
        景别等级：特写(1)→近景(2)→中近景(3)→中景(4)→中全景(5)→全景(6)→远景(7)
        - 相邻镜头景别跨度 ≤2 级（跨度 >2 必插过渡镜头）
        - 禁止连续 3 镜同景别

    [10 方位朝向系统]
        action 字段末尾用方括号标注：[正面/背面/左侧面/右侧面/左前45°/右前45°/左后45°/右后45°/俯视/仰视]
        示例：林婉儿缓缓转身，面向窗户 [右侧面]

    [Track 分组规则]
        - 单 Track 总时长 ≤15s
        - Track 内时间和空间必须连续
        - Track 切换通常发生在场景切换/时间跳跃/大景别跳跃处
        - trackId 格式 T{nn}（如 T01、T02）

    [一镜到底策略]
        适用：连续动作 + 情绪不间断 + 空间不切换；时长上限 12s；cameraMove 标完整运镜路径；不拆分 seq。

    [光影锚定规则]
        - lighting 必须锚定 director-plan.json 的 colorScheme + lighting 方案
        - 同 scene group 内主基调不变（允许角色走近窗户等微调）
        - 跨 scene group 光影变化必须有叙事理由（时间推移、场景切换等）
        - 示例：导演方案"青绿含蓄 + E 窗光" → lighting 写"左侧窗光照入，冷青色调，面部半明半暗"
        - 不得出现矛盾描述（方案冷调却写"暖橙色夕阳光"）

    [衍生资产 pending 机制]
        分镜需要尚未生成的衍生资产（特定角度场景图、特殊道具等）时：
        - assetIds 中使用预期的衍生 ID
        - 在 _pendingAssets 数组中登记 { assetId, reason, usedInSeq }
        - pending 不阻塞校验，由 seedance-main 协调 seedance-asset 后续补全

[10 项连贯性校验]

    每项发现问题先尝试自动修正，不可修正则标 warning，结果写入 _validationLog。

    1. **景别递进**：相邻跨度 >2 级 → 插入中间景别过渡镜头
    2. **连续同景别**：连续 ≥3 镜同景别 → 中间镜头上下浮动 1 级
    3. **动作连续性**：上镜终态与下镜起态矛盾 → 不可自动修正，标 warning
    4. **180 度线**：同对话场景角色朝向突然翻转 → 修正朝向标注
    5. **情绪连贯性**：emotion 无触发剧烈跳变 → 不可自动修正，标 warning
    6. **Track 时长**：超 15s → 在自然停顿点拆分 Track，trackId 顺延
    7. **资产引用完整性**：description/action 提到但 assetIds 缺 → 补全或标 pending
    8. **台词时长**：duration < 公式计算值 → 上调至公式值
    9. **黄金 6 秒**：无台词镜头 duration > 6s → 拆为两镜或缩短至 ≤6s
    10. **场景图必选**：每个场景至少引用一个 scene 类资产 → 补全或标 pending

    校验日志格式：
    ```json
    "_validationLog": [
      { "check": "景别递进", "seq": 5, "issue": "seq5(特写)→seq6(全景)跨度5级",
        "action": "fixed", "detail": "插入 seq5.5(中景) 过渡，后续 seq 重新编号" },
      { "check": "情绪连贯性", "seq": 12, "issue": "seq11(平静)→seq12(暴怒)无触发事件",
        "action": "warning", "detail": "请检查 seq12 emotion 合理性或补触发镜头" }
    ]
    ```

[工作流程]

    第 1 步：执行 [依赖检测]
        必需依赖任一缺失 → 输出失败话术终止；否则继续。

    第 2 步：吸收上游产物
        - 阅读 director-plan.json，记录色彩/光线方案 + 场景分组 + 节奏段落
        - 阅读 assets.json，建立 assetId 索引（角色/场景/道具）
        - 阅读 scripts/episode-{N}.txt，提取每场戏的台词原文
        - 阅读 shared/storyboard-table-techniques.md（详细字段定义和技法）
        - 阅读画风的 director_storyboard_style.md（特殊约束）

    第 3 步：按场景分组逐组构建分镜
        每条分镜按 [字段定义与核心规则] 填满 13 字段：
        - dialogue 一字不改从剧本复制
        - lighting 锚定导演方案
        - action 末尾标注方位朝向
        - 衍生资产用 pending ID 并登记 _pendingAssets

    第 4 步：分配 trackId
        按场景连续性 + 时空连续性聚合，单 Track ≤15s。

    第 5 步：执行 10 项连贯性校验
        逐项跑校验，可自动修正则改并记录 'fixed'，不可则记 'warning'。
        校验后 seq 必须重新连续编号。

    第 6 步：计算 totalDuration、trackCount，写入 storyboard-table.json

    第 7 步：完成汇报
        概述：分镜数量 / Track 数量 / 校验修正次数 / pending 资产数量。

[输出格式]

    产物：novels/{name}/seedance/ep{N}/storyboard-table.json（符合 schemas/storyboard-table.schema.json）

    JSON 结构：
    ```json
    {
      "episode": "ep{N}",
      "totalDuration": 0,
      "trackCount": 0,
      "shots": [
        {
          "seq": 1,
          "description": "镜头画面描述",
          "scene": "场景标识",
          "assetIds": ["character-xxx", "scene-xxx"],
          "duration": 3.5,
          "shotType": "中景",
          "cameraMove": "固定",
          "action": "角色动作描述 [右前45°]",
          "emotion": "平静",
          "lighting": "左侧窗光，冷青色调，面部半明半暗",
          "dialogue": "台词原文",
          "soundEffect": "轻微环境白噪",
          "trackId": "T01"
        }
      ],
      "_pendingAssets": [],
      "_validationLog": []
    }
    ```

    强制 XML 包裹（v1 跨模型输出合约）：

    <storyboard_table>
    [分镜数量/Track 数量/校验摘要 + 完整 storyboard-table.json 内容]
    </storyboard_table>

    <!-- meta: {"status":"passed","stage_reached":7,"failure_count":{"critical":0,"high":0,"medium":0}} -->

    异常合约：
    - 业务数据缺失（[依赖检测] 失败）→ 不输出 storyboard_table，仅失败话术 + meta.status='skill_failed'
    - 校验出现 warning（不可自动修正项）→ 输出 storyboard_table + meta.status 仍 'passed' 但 failure_count.medium 累计

[输出风格]
    语态：
    - 工程师式精确。字段值是技术参数，不是文学表达。

    反例（明文禁止）：
    × duration: "大概 3 秒"
    ✓ duration: 3.5

    × lighting: "某种暖光"
    ✓ lighting: "右上 45° 暖黄色窗光，面部右侧高光、左侧轮廓阴影"

[初始化]
    AI 被 /seedance-storyboard-table 调用时按顺序执行：

    1. 输出开场："Seedance 阶段 C2 启动 — 开始构建结构化分镜表。"

    2. 执行 [依赖检测]
       失败 → 按失败话术终止

    3. 进入 [工作流程] 第 2 步
