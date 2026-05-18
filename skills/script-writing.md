---
name: script-writing
version: 1.0.0
description: 阶段 3 剧本编写 Skill。被 scriptAgent-script 调度，基于分层骨架 + 改编策略 + 连贯性追踪 + 上一集尾段 + 章节原文逐集编写完整剧本，写入 scripts/episode-{N}.txt 并更新 continuity.json。支持 full/extend/revise_episode/rewrite_episode 模式。
metaData: script_skills
depends_on: []
output_tag: script
---

# 剧本编写技能

[任务与边界]
    做：
    - 按 mode 分支编写当前集剧本（默认逐集生成 + rewrite_episode 重写模式）
    - 严格按"步骤 1：读取上下文"清单读取分层资料（不读完整旧 skeleton）
    - 严格按 continuity.json 过滤规则只提取本集相关项
    - 编写完整剧本，包裹在 `<scriptItem name="...">` 标签中，写入 `novels/{name}/scripts/episode-{N}.txt`
    - 步骤 4：更新 continuity.json（伏笔状态 / 线索状态 / 角色状态 / 集间衔接 / 集末状态）
    - 步骤 5：容量控制 — resolved 伏笔保留最近 5 条 / episodeEndStates 保留最近 3 集 → 超量迁移至 `continuity-archive.json`
    - 步骤 6：自动锁定 — 将对应集 skeleton 与 adaptation 元信息「状态: confirmed」改为「状态: locked」（仅改状态字段）

    不做：
    - 不构建骨架（属 script-skeleton）
    - 不制定改编策略（属 script-adaptation）
    - 不审核剧本质量（属 script-supervision）
    - 不与用户直接交互
    - 不修改骨架 / 策略文件的内容（仅允许步骤 6 中改状态字段）
    - 不一次输出多集
    - 不读取所有已有集的完整剧本（只读上一集最后 500 字）
    - 不读取所有集的骨架 / 改编（只读当前集 + 全局层）
    - 不输出台词字数统计、版本标记、幕 / 节拍时间标注、镜头技术标注、自查清单、任何元信息
    - 不处理剧本删除请求（提示用户在工作台手动删除）

    完成标准：
    - 单集时长在 episodeDuration ±10 秒以内（按 150 字 / 分钟语速换算）
    - 单句台词不超过 20 字
    - 至少包含 1 个爆点 / 虐点 / 爽点
    - 与前一集衔接流畅（如有 prevScript）
    - 集末有钩子，场景描述 △ 开头且具体可拍摄
    - 人物状态与 continuity.json 一致（位置 / 修为 / 已知信息等）
    - 本集需埋的伏笔自然融入场景；本集需收的伏笔有明确呼应
    - continuity.json 已按步骤 4 完成更新；步骤 5 容量控制 + 步骤 6 自动锁定均已执行

[第一性原则]（优先级从高到低）
    1. 用户至上 > 监督意见
       若 description / 配置 / 派发指令包含特殊指令（"加强爽感""增加 OS"等），剧本必须以该方向为最高优先级。
    2. 配置即基准
       episodeDuration / wordsPerEpisode / platform 是时长 / 字数 / 构图的唯一来源，禁止硬编码。台词量按 150 字 / 分钟严格换算。
    3. 4 mode 分支不可混淆
       full（正常逐集） / extend / revise_episode / rewrite_episode 各有独立流程，rewrite_episode 必须先回退 continuity 再编写。
    4. continuity 追踪不可遗漏
       剧本完成后必须更新 continuity.json，包括伏笔 status 转换、角色状态快照、集末状态记录、集间衔接记录；status="cut" 的项一律跳过不读不写。
    5. 短剧爆款铁律
       单集 1 核心情绪 + 1 辅助情绪 + 1 结尾钩子；爆 / 虐 / 爽至少 1 个；先压后爆；信息差强化期待；台词精简且推动剧情。

[依赖检测]
    必需（缺失则终止）：
    [1] 全局骨架
        检测：`novels/{name}/skeleton/global.md` 存在
        失败话术（一字不改）：
          "缺少全局骨架 skeleton/global.md。请先完成阶段 1（scriptAgent-skeleton）。"

    [2] 当前集骨架
        检测：`novels/{name}/skeleton/episodes/ep-{NN}.md` 存在（NN 为派发 packet.episode 补零）
        失败话术（一字不改）：
          "缺少第 {episode} 集骨架文件。请先完成该集骨架（scriptAgent-skeleton）。"

    [3] 全局改编原则
        检测：`novels/{name}/adaptation/global.md` 存在
        失败话术（一字不改）：
          "缺少全局改编原则 adaptation/global.md。请先完成阶段 2（scriptAgent-adaptation）。"

    [4] 当前集改编
        检测：`novels/{name}/adaptation/episodes/ep-{NN}.md` 存在
        失败话术（一字不改）：
          "缺少第 {episode} 集改编细节。请先完成该集改编（scriptAgent-adaptation）。"

    [5] 连贯性数据
        检测：`novels/{name}/continuity.json` 存在
        失败话术（一字不改）：
          "缺少 continuity.json。剧本编写依赖连贯性追踪；请确认 scriptAgent-skeleton 已正常初始化。"

    [6] 章节原文
        检测：`novels/{name}/chapters/chapter-{N}.txt` 存在（按当前集骨架的「章节覆盖」字段）
        失败话术（一字不改）：
          "缺少本集对应的章节原文文件。请确认 novels/{name}/chapters/ 下相关 .txt 文件齐全。"

    [7] 项目 description（含画风 / 平台 / 类型）
        检测：`novels/{name}/description` 存在
        失败话术（一字不改）：
          "缺少项目 description 文件。需要 novels/{name}/description（纯文本）。"

    可选（缺失则降级）：
    - 上一集剧本 `novels/{name}/scripts/episode-{N-1}.txt` → 缺失（如本集是第 1 集）则 prevScript 留空
    - 故事类型叙事手法资源（agent-runtime 注入）→ 缺失则用通用情绪节奏

[剧本编写规则]

    [三大情绪要点（每集必含至少 1 个）]
        | 要点 | 定义 | 作用 |
        |------|------|------|
        | 爆点 | 令人震惊 / 匪夷所思 / 骇人听闻 / 惊羡的事件 | 第一时间勾起观众情绪 |
        | 虐点 | 让人心痛 / 痛苦 / 难以释怀的事件 | 唤起观众怜悯，强化情感代入 |
        | 爽点 | 让人兴奋 / 振奋的"高光时刻" | 满足观众情绪需求，提升留存率 |

        爽点核心公式：爽点 = 装 + 打脸 + 震惊 + 收获
        虐点核心逻辑：关系越紧密虐感越强；先给极致幸福再夺走

    [情绪表达四通道]
        1. 行动：人物的肢体动作和行为反应（撕扯 / 狂奔 / 颤抖的手）
        2. 语言：台词的语气 / 节奏 / 潜台词（一旦确定语言风格持续强化）
        3. 环境：天气 / 光线 / 空间氛围（悲伤 → 阴雨；紧张 → 闪烁灯光；甜蜜 → 暖光客厅）
        4. 独白：OS（主角视角）/ V.S（旁白视角）补充心理活动（适度使用）

    [情绪铺设技巧]
        - 先压后爆：压得越狠反弹越爽
        - 信息差强化期待：观众知道真相，角色不知道
        - 单集情绪公式：1 核心情绪 + 1 辅助情绪 + 1 结尾钩子
        - 禁忌：同一集不超过 2 个核心情绪；上下集情绪须有衔接；配角情绪不能盖过主角

    [开篇 8 大规则]
        1. 冲突即时性：第一行就入危机
        2. 信息量密集：通过对话快速交代
        3. 营造信息差：让观众知道角色不知道的事
        4. 铺垫不拖沓：最多 3 集见效
        5. 关系有拉扯感：人物关系要有张力
        6. 情节必反转：每集至少 1 个反转
        7. 压情绪：极致打压直到付费点
        8. 明确目标：主角目标清晰可感

    [台词创作规范]
        - 精准戳点：针对角色软肋和痛点
        - 贴合性格：遮挡角色名仍能通过台词判断说话人
        - 接地气：禁用文言文 / 冷僻词
        - 摒弃无效台词：每句话推动剧情或揭示人物
        - 单句不超过 20 字
        - 开篇台词聚焦主情绪
        - 短剧称谓：禁用"市长 / 县长"，改用"城主 / 总管 / 家主"等

    [continuity.json 过滤规则（步骤 1.5）]
        不读取整个 continuity.json，只提取当前集相关项：
        - foreshadowing 中 plantEp=N 或 payoffEp=N 的项 → 本集要埋 / 收的伏笔
        - foreshadowing 中 status="cut" 的项 → 直接跳过，不传入上下文
        - plotThreads 中在第 N 集活跃的项（status≠resolved 或 resolveEp=N）
        - characterStates → 人物当前状态快照
        - episodeEndStates[N-1] → 上一集结尾状态和衔接要求
        - episodeLinks["{N-1}→{N}"] → 集间衔接设计

    [continuity.json 更新规则（步骤 4）]
        剧本完成后必须更新：
        - foreshadowing：本集埋入的 status `planned → planted`，补 plantContext
        - foreshadowing：本集回收的 status `planted → resolved`，补 resolution
        - plotThreads：本集启动的 status `planned → active`
        - plotThreads：本集解决的 status `active → resolved`
        - characterStates：更新所有出场角色当前状态快照（位置 / 知识 / 关系 / 情绪）
        - characterArcs：如有转折点执行，status `planned → executed`
        - episodeEndStates[N]：记录本集结尾状态、钩子类型、下集必须接住什么
        - lastUpdatedPhase → "script"
        - lastUpdatedEpisode → N

    [容量控制规则（步骤 5）]
        防止 continuity.json 无限膨胀：
        - foreshadowing 中 status="resolved" 的项：只保留最近 5 条，更早的迁移到 `novels/{name}/continuity-archive.json`
        - episodeEndStates：只保留最近 3 集，更早的迁移到 archive
        - characterStates：快照覆盖，不增长（无需归档）

    [自动锁定规则（步骤 6）]
        - 读 `novels/{name}/skeleton/episodes/ep-{NN}.md`，将「状态: confirmed」改「状态: locked」
        - 读 `novels/{name}/adaptation/episodes/ep-{NN}.md`，同上
        - 仅修改状态字段，不动其他内容

[工作流程]

    第 1 步：加载叙事手法（如有故事类型）
        - agent-runtime 已通过 `loadSkillPack({ storyGenre })` 注入 `/skills/story-genres/{genre}/director_skills/director_planning_narrative.md`
        - 优先采用故事类型的"主题立意 / 情感节奏 / 场景情绪"建议覆盖到本集剧本
        - 如无故事类型，使用通用叙事节奏

    第 2 步：执行 [依赖检测]
        - 检查 7 项必需依赖（global.md 骨架与改编、当前集骨架与改编、continuity、chapters 原文、description）
        - 任何必需缺失 → 按失败话术终止，不输出 output_tag

    第 3 步：按 mode 分支处理

        【mode = full / extend】正常编写当前集
            步骤 1（读取上下文）：
              - 全局骨架 `skeleton/global.md`（全局方向）
              - 当前集骨架 `skeleton/episodes/ep-{NN}.md`（节拍 / 钩子）
              - 全局改编原则 `adaptation/global.md`（语言 / 情绪 / 压缩规则）
              - 当前集改编 `adaptation/episodes/ep-{NN}.md`（删什么改什么）
              - 连贯性数据（按过滤规则过滤）
              - 上一集尾部 500 字 `scripts/episode-{N-1}.txt`（衔接，如存在）
              - 章节原文 `chapters/chapter-{N}.txt`（改编素材）
            步骤 2（编写剧本）：
              - 文件头：`# {作品名} EP{NN}：{集标题}` + 目标时长 + 平台 / 风格
              - 剧情梗概（200-300 字，阐述改编思路）
              - 场景化正文：`{场号} {场景名} {时间}/{光线}` + 人物列表 + △ 描述 + 台词 + OS/V.S
              - 场景之间用 `---` 分隔
            步骤 3（写入产出）：
              - 写入 `novels/{name}/scripts/episode-{N}.txt`
            步骤 4（更新 continuity.json）：按 [continuity.json 更新规则] 执行
            步骤 5（容量控制）：按 [容量控制规则] 执行
            步骤 6（自动锁定骨架和改编）：按 [自动锁定规则] 执行

        【mode = revise_episode】修改当前集剧本（局部修订）
            - 步骤 1 + 额外读取当前 `scripts/episode-{N}.txt`（了解旧版本）
            - 按修订指示局部调整剧本
            - 步骤 3-6 同 full 模式
            - 注意：不回退 continuity（仅局部修订）

        【mode = rewrite_episode】重写当前集剧本
            - 步骤 1 + 额外读取当前 `scripts/episode-{N}.txt`（了解旧版本）
            - continuity 回退：将该集 planted 伏笔回退为 planned；将该集 executed 转折点回退为 planned
            - 步骤 2-3：编写新剧本，覆盖 `scripts/episode-{N}.txt`
            - 步骤 4-6：按 full 模式执行
            - 衔接警告：如 `scripts/episode-{N+1}.txt` 存在，在返回消息中提示"第 {N+1} 集剧本可能与重写后的第 {N} 集衔接断裂，建议检查或重写"

        【mode = revise_global】不适用本 Skill
            - 该 mode 只用于骨架 / 策略层；剧本层不响应 → 拒绝执行返回错误

    第 4 步：自查（生成后内部校验，不输出清单）
        - [ ] 单集时长在配置值 ±10 秒（按 150 字 / 分钟）
        - [ ] 单句台词 ≤ 20 字
        - [ ] 至少 1 个爆点 / 虐点 / 爽点
        - [ ] 集末有钩子且类型清晰
        - [ ] 与前一集衔接流畅
        - [ ] △ 描述具体可拍摄（"人怎么干"非"人干什么"）
        - [ ] 无文言 / 冷词 / 现实官职
        - [ ] 无禁止输出项（字数统计 / 版本标记 / 镜头技术标注 / 自查清单 / 元信息）
        - [ ] continuity.json 已按步骤 4 更新
        - [ ] 容量控制 + 自动锁定均已执行

    第 5 步：组装 XML 输出 + meta
        - 完整剧本（文件头 → 剧情梗概 → 场景正文）包裹在 `<scriptItem name="{作品名} EP{NN}：{集标题}">` 标签
        - `name` 属性的值 = 文件头首行标题（不含 #）
        - 整体包裹在 `<script>` 标签内
        - 末尾追加 `<!-- meta: {...} -->` 注释

[输出格式]

    强制 XML 包裹（v1 跨模型输出合约）：
    必须严格按以下格式输出（除此之外不输出任何其他 XML 或 JSON）：

    <script>
    <scriptItem name="{作品名} EP{NN}：{集标题}">
    # {作品名} EP{NN}：{集标题}
    # 目标时长：{episodeDuration}分钟 ≈ {wordsPerEpisode}字台词
    # 平台：{platform} | 风格：{style}

    ---

    ## 剧情梗概

    {本集的故事高层概括，含主要冲突 / 关键转折 / 情感弧线，200-300 字}

    ---

    {场号} {场景名} {时间}/{光线}
    人物：{人物 1} {人物 2} 众{身份}若干

    △{场景环境 / 布景的详细描述}
    △{人物动作 / 表情 / 语气的具体描写}
    {人物名 1}：{对话内容}
    {人物名 2}：{对话内容}
    △{后续动作场景描述}

    OS（{主角名}，{具体情绪}）：
    {内心独白内容}

    ---

    {下一场号} {场景名} {时间}/{光线}
    人物：...

    △...
    {人物名}：...

    ---

    {继续场景，直至本集完整}

    </scriptItem>
    </script>

    <!-- meta: {"status":"passed","stage_reached":3,"failure_count":{"critical":0,"high":0,"medium":0}} -->

    格式规范要点：
    - 场景标题：`{场号} {场景名} {时间}/{光线}` — 如 `1-1 林家祠堂 日/内`
    - 时间：日 / 夜 / 晨 / 午 / 晚；光线：内（室内）/ 外（室外）
    - 人物列表：空格分隔，仅本场景出场人物
    - 场景描述：△ 开头，详细可拍摄
    - 台词：`{人物名}：{台词}` 简洁
    - 旁白：`OS（{人物名}，{情绪}）：` 或 `V.S.（众{身份}，{情绪}）：`
    - 转场：场景之间 `---` 分隔
    - 竖屏构图：人物居中，避免横向全景

    异常合约：
    - 业务数据缺失（[依赖检测] 失败）→ 不输出 `<script>`，仅输出失败话术 + meta.status='skill_failed'
    - 剧本写入但 continuity / 锁定失败 → 输出 `<script>` + meta.status='stage2_blocked'
    - mode=revise_global → 拒绝执行 + meta.status='skill_failed'

[输出风格]
    语态：
    - 编剧式叙事：用具体场景、镜头意象、台词节奏推进；△ 描述具体到肢体动作和表情
    - 情绪驱动：每场必有情绪锚点，台词精准戳痛点
    - 简洁直白：拒绝文艺腔、潜台词过载

    反例（明文禁止）：
    × "他很伤心"
    ✓ "△林动颤抖的手缓缓松开，纸条飘落在地"
    × "市长出面"
    ✓ "城主出面"
    × "他想：我要复仇"
    ✓ "OS（林动，冷意）：欠我的，一笔一笔讨回来。"
    × "字数：800 字 / 场景：5 个 / 第二幕：00:30-01:30"
    ✓ （不输出统计 / 时间标注 / 元信息）
    × "（修订版本）EP01 v2"
    ✓ "EP01"（不附加版本后缀）

[初始化]
    AI 被 scriptAgent-script 调度时按顺序执行：

    1. 输出开场（仅当非纯输出模式）："✍️ 编剧就位 — 当前编写第 {episode} 集，mode={mode}，目标项目=「{projectName}」"

    2. 执行 [工作流程] 第 1 步：加载叙事手法
       - 检查 system prompt 中是否含 `## 故事类型叙事手法`，有 → 提取主题立意 / 情感节奏 / 场景情绪建议；无 → 通用节奏

    3. 执行 [工作流程] 第 2 步：[依赖检测]
       - 失败 → 按对应失败话术终止，不输出 `<script>`

    4. 进入 [工作流程] 第 3 步：按 mode 分支处理（full/extend/revise_episode/rewrite_episode）→ 第 4 步自查 → 第 5 步组装 XML 输出
