---
name: asset-helpers-polish
version: 1.0.0
description: asset-helpers 子 Skill。被 seedance-asset / asset-helpers/batch 调度，将单个角色/场景/道具/分镜的原始描述润色为精炼中文图像提示词，输出含 [ARTSTYLE] 与 [PROMPT] 两节。
metaData: asset_skills
depends_on: []
output_tag: polished_prompt
---

# 资产提示词润色技能

[任务与边界]
    做：
    - 接收单个资产（role / scene / props / storyboard）的原始描述与画风信息
    - 按对应类型润色规范（prompts/{type}-polish.md）补齐视觉维度
    - 用叙事描述式（非关键词堆叠）输出 150-300 字精炼中文提示词
    - 输出固定双块结构：[ARTSTYLE]（画风标签）+ [PROMPT]（图像内容）

    不做：
    - 不调用图片 API（属 asset-helpers/generate-image）
    - 不下载或保存图片（属 asset-helpers/save）
    - 不批量遍历资产清单（属 asset-helpers/batch）
    - 不修改 outline.json 或 manifest.json

    完成标准：
    - 输出严格双块格式，[ARTSTYLE] 与 [PROMPT] 两节齐全
    - [PROMPT] 字数 150-300，叙事描述式而非关键词堆叠
    - 类型对应的所有必需视觉维度齐全（按 [类型润色要点]）
    - [ARTSTYLE] 标签准确匹配项目画风字段

[第一性原则]（优先级从高到低）
    1. 叙事描述式
       提示词必须是连贯的中文叙事描述，不得是逗号分隔的关键词堆叠。模型对叙述结构的理解显著优于关键词列表。
    2. 维度齐全不漏
       角色 / 场景 / 道具 / 分镜各有自己的必需维度集合（见 [类型润色要点]）。原始描述缺哪个维度，按规范补哪个，不得跳过。
    3. 画风前缀对齐
       [ARTSTYLE] 必须从项目 description 的「影片画风」字段或类型推断映射读取，禁止自由发挥。
    4. 长度受控
       [PROMPT] 严格 150-300 字。短于 150 → 维度不全；长于 300 → 关键信息被稀释。

[依赖检测]
    必需（缺失则终止）：
    [1] 类型润色规范文件
        检测：根据传入的 type，对应文件存在：
          - role → `prompts/role-polish.md`
          - scene → `prompts/scene-polish.md`
          - props → `prompts/tool-polish.md`
          - storyboard → `prompts/storyboard-polish.md`
        失败话术（一字不改）：
          "缺少类型对应的润色规范文件 prompts/{type}-polish.md。无法按规范执行润色。"

    [2] 资产原始描述
        检测：caller 已传入 name + description 字段
        失败话术（一字不改）：
          "缺少资产原始描述。需要 caller 在 packet 中传入 name + description + type 三字段。"

    可选（缺失则降级）：
    - 项目 description 中「影片画风」字段 → 缺失则按小说类型推断（仙侠/玄幻→国风水墨3D CG / 都市/现代→写实3D CG / 校园/青春→日系动漫 / 科幻→赛博朋克3D CG）

[润色策略]

    [叙事描述式 vs 关键词堆叠]
        × "白发，红袍，剑，山，月光，冷色调"（关键词堆叠）
        ✓ "银发束冠的少年身披朱红长袍，腰间斜挎一柄寒光闪闪的青锋剑，立于云雾缭绕的山巅，皎洁月光自身后洒落，将身影拉成一道孤绝的剪影。"

    [类型润色要点]

        角色（role）
        - 出图布局：面部特写 + 三视图（正面 / 侧面 / 背面），白色背景
        - 必需维度（按顺序）：年龄 / 性别 / 脸型 / 五官 / 发型 / 体型 / 服装（款式·颜色·材质）/ 配饰 / 鞋子 / 整体气质

        场景（scene）
        - 无人物、无文字
        - 必需维度：空间布局 / 光线方向 / 色调 / 天气 / 时间 / 氛围 / 关键物件

        道具（props）
        - 白色背景，多角度展示
        - 必需维度：材质 / 颜色 / 尺寸 / 细节纹理 / 特殊效果

        分镜（storyboard）
        - 特定场景中的特定时刻
        - 必需维度：景别 / 构图 / 人物动作 / 光影 / 情绪氛围

    [画风映射]
        | 小说类型 | [ARTSTYLE] 默认值 |
        |---------|------------------|
        | 仙侠 / 玄幻 | 国风水墨3D CG |
        | 都市 / 现代 | 写实3D CG |
        | 校园 / 青春 | 日系动漫 |
        | 科幻 | 赛博朋克3D CG |
        项目 description 显式指定 → 优先使用显式值。

[工作流程]
    第 1 步：根据 type 加载润色规范
        - role → prompts/role-polish.md
        - scene → prompts/scene-polish.md
        - props → prompts/tool-polish.md
        - storyboard → prompts/storyboard-polish.md
        理解规范要求的维度与写法。

    第 2 步：从原始描述提取视觉关键信息
        逐字读取 description，标出所有视觉相关细节（外观 / 质感 / 颜色 / 光影 / 构图 …）。

    第 3 步：补充缺失维度
        对照 [类型润色要点] 的必需维度集合，原始描述缺哪个 → 按规范合理补充。
        补充原则：尽量从上下文推断（如"少年"补"约十六七岁"），无依据时取最常见的合理默认值。

    第 4 步：组织成叙事描述式
        把所有维度信息组织成连贯中文叙述。控制字数 150-300。
        反例：避免"，"分隔的关键词列表；正例：用主谓结构与连接词构成完整句子。

    第 5 步：确定 [ARTSTYLE]
        - 项目 description 显式指定画风 → 取该字段
        - 否则按 [画风映射] 推断

    第 6 步：组装双块输出
        按 [输出格式] 模板组装。

[输出格式]
    固定双块结构：

        [ARTSTYLE]
        {画风描述，如：国风水墨3D CG风格}

        [PROMPT]
        {精炼的中文图像提示词，叙事描述式，150-300 字，含类型对应的全部必需维度}

    强制 XML 包裹（v1 跨模型输出合约）：
    必须严格按照如下格式输出：

        <polished_prompt>
        [ARTSTYLE]
        国风水墨3D CG风格

        [PROMPT]
        银发束冠的少年立于云雾山巅 …（150-300 字完整描述）
        </polished_prompt>

        <!-- meta: {"status":"passed","stage_reached":6,"failure_count":{"critical":0,"high":0,"medium":0}} -->

    异常合约：
    - 业务数据缺失（[依赖检测] 失败）→ 不输出 polished_prompt 标签，仅输出失败话术 + meta.status='skill_failed'
    - 维度严重不全（缺 ≥ 3 项必需维度且无法从上下文补充）→ 仍输出 polished_prompt 但 meta.status='partial' 并在末尾标注"⚠ 缺失维度：xxx"

[输出风格]
    语态：
    - 视觉小说作家式。一句话画一个画面，连续句构成可视图像。形容词紧贴名词，不堆砌。

    反例（明文禁止）：
    × "一个高大威猛的男人，穿着古代衣服，看起来很帅气。"
    ✓ "约二十八九岁的青年身高约一米八五，肩宽臂壮如挺立松木，浓眉下一双狭长丹凤眼，鼻梁高挺，下颌方正。一袭墨绿暗纹长袍以蜀锦裁制，外罩玄色短褙。"

    × "山，云，剑，月，氛围好。"
    ✓ "云雾自山腰漫起，朦胧裹住半轮残月，剑穗在夜风中轻颤，气氛清冷孤绝。"

[初始化]
    AI 被 /asset-helpers-polish 调用时按顺序执行：

    1. 输出开场："提示词润色启动。先读类型规范，再按维度补全。"

    2. 执行 [依赖检测]
       - 失败 → 按对应失败话术输出，停止流程

    3. 进入 [工作流程] 第 1 步
