# Toonflow 剧本→视频 全面梳理重构计划

> 日期：2026-04-11
> 基于：`docs/script_video_generate_rule.md`（CLI seedance 管线 vs Toonflow-app 融合分析）

---

## 一、项目现状审计

### 1.1 三条内容管线（并行存在，有重叠）

| 管线 | 入口 Agent | 产出路径 | 状态 |
|------|-----------|---------|------|
| **scriptAgent 剧本管线** | scriptAgent-main | novels/{name}/skeleton/ + adaptation/ + scripts/ | 正常运作 |
| **seedance 视频管线** | seedance-main | novels/{name}/seedance/ | 正常但需升级（3阶段→5阶段） |
| **传统资产管线** | asset-generator | novels/{name}/assets/ + manifest.json | 半废弃，基于 outline.json |

### 1.2 重叠/冲突清单

**Agent 重叠**：
- `director.md` — seedance 管线的导演 agent（保留）
- `art-designer.md`（使用 art-design-skill）vs seedance-main 内的 seedance-art（使用 seedance-art-skill）— 功能重叠
- `storyboard-segment.md` + `storyboard-shot.md` — 传统管线的分镜 agent，与 seedance 管线完全不同路径

**Skill 重叠**：
- `art-design-skill` vs `seedance-art-skill` — 功能相同，后者是 seedance 版
- `asset-polish/asset-generate-image/asset-save/asset-batch` — 传统管线四件套，不属于 seedance 管线

**数据重叠**：
- `novels/造化之门/assets/manifest.json`（传统管线）vs `novels/造化之门/seedance/manifest.json`（seedance 管线）
- `prompts/` 根目录（旧架构 system prompt）vs `skills/`（新 skill 体系）

### 1.3 废弃/无关内容

| 路径 | 判定 | 理由 |
|------|------|------|
| `prompts/` 根目录 | 废弃 | 旧架构 system prompt，已被 skills/ 取代 |
| `zhican/` | 废弃 | 旧版 TS 资产生成代码 |
| `文章编辑部 Agent/` | 无关 | 独立项目，不属于 Toonflow |
| `Toonflow-new.md` | 废弃 | 只含图片引用无内容 |
| `skill_guifna.md` | 废弃 | 旧版 skill 规范 |
| `Toonflow开发说明书v2.md` | 废弃 | 旧版说明 |
| `ui.md` | 废弃 | 旧版 UI 文档 |
| `剧本设计思路.html` | 废弃 | 已有 docs/script-rule.md 取代 |
| `剧本生成视频思路.html` | 废弃 | 已有 docs/script_video_generate_rule.md 取代 |
| `web/剧本-生成视频思路.html` | 废弃 | 同上 |

---

## 二、核心目标

**CLI 的产出品质 + Toonflow-app 的方法论骨架，两者优势互补**

### 必须继承的 CLI 独有优势（禁止被替代）

| 优势 | 说明 | Toonflow-app 有无 |
|------|------|------------------|
| 五层写法框架 | L0-L4 内部结构，输出为连续叙事段落 | 无（XML 标签输出） |
| 去人化规则 | AI生图/禁拼接/情绪动态描写 | 无 |
| 柔化词系统 | 环境/表情/情绪三类替换表，负面词<=2/条 | 无 |
| 嘴型规范 | 旁白闭嘴/对话张嘴/独白翕动 | 无 |
| 精确时间轴 | 0.5s 最小精度，秒级时间段 | 无（只有总时长） |
| 双层审核 | 业务7维度+合规红线 | 无（单层 supervision） |
| 导演讲戏风格 | 五维交织的沉浸式叙事 | 无（结构化分析文档） |
| 跨集资产追踪 | 复用/变体/新增三态标记 | 无 |

### 从 Toonflow-app 学习的方法论

| 方法论 | 说明 |
|--------|------|
| 美术模板体系 | 结构化约束框架，AI 在模板内生成提示词 |
| 三步分镜 | 导演规划→分镜表→分镜面板（增加结构化中间层） |
| 衍生资产 | L0-L5 角色六层堆叠 + 场景三维度衍生 |
| 10方位朝向系统 | 精确朝向（替代粗糙的左/中/右）+ 180度线 |
| 首帧原则 | 描述动作准备姿态（起始1/3），非动作顶点 |
| 风格锚点词 | 每条提示词必含风格锚点 + 画质锁定 + 反向提示词 |
| 情绪面部映射 | 9种情绪→面部/眼部具体描写 |
| 台词时长公式 | 字数÷情绪语速+停顿+安全余量 |

---

## 三、重构后完整流水线

```
剧本（已有）
    |
    v
============================================
阶段 A：导演分析（保留，微调）
============================================
    输入：scripts/episode-{N}.txt
    执行：seedance-director Agent（director-skill）
    产出：seedance/ep{N}/01-director.md
          |-- 人物清单（含外貌/性格/服饰描述）
          |-- 场景清单（含空间/光影/氛围描述）
          |-- 情绪弧线 + 镜头分组（粗粒度）
    审核：导演自审 + 合规审核
    |
    v
============================================
阶段 B：资产管理（重写）
============================================
  B1. 资产提取与结构化
      输入：01-director.md 人物清单+场景清单
      产出：seedance/assets.json（统一数据源）

  B2. 图片提示词生成（模板驱动）
      输入：assets.json 描述 + skills/art-styles/{style}/ 模板
      产出：更新 assets.json 每个资产的 prompt 字段

  B3. 图片生成
      输入：assets.json 中的 prompt
      产出：seedance/images/{type}/{name}.png + 更新 assets.json + tasks.json

  B4. 衍生资产生成
      角色：L0-L5 六层堆叠（底模→妆面→发型→内衣→外衣→配饰）
      场景：三维度（景别/时段/天气）
    |
    v
============================================
阶段 C：分镜制作（融合两套最优，三步走）
============================================
  C1. 导演规划（新增）
      输入：01-director.md + assets.json + director_planning_style.md
      产出：seedance/ep{N}/director-plan.json
      六维度：主题叙事/视觉风格/叙事结构/场景意图/声音音乐/转场连贯

  C2. 构建分镜表（新增）
      输入：director-plan.json + assets.json + storyboard_table_techniques.md
      产出：seedance/ep{N}/storyboard-table.json
      12列+trackId：序号/画面描述/场景/资产ID/时长/景别/运镜/动作+朝向/情绪/光影/台词/音效

  C3. 生成 Seedance 2.0 提示词（保留+增强）
      输入：storyboard-table.json + assets.json + art_storyboard_video.md + storyboard_prompt_techniques.md
      产出：seedance/ep{N}/02-prompts.md
      保留：五层框架/去人化/柔化词/嘴型/时间轴/连续叙事
      新增：首帧原则/风格锚点/情绪映射/10方位预分析/@资产强绑定
    |
    v
============================================
阶段 D：视频生成（新增）
============================================
  D1. 单镜视频生成
      输入：02-prompts.md + 参考图
      API：Seedance 2.0 multiReference 模式
      产出：seedance/ep{N}/videos/P{NN}.mp4

  D2. 轨道组装（后续规划）
      拼接→字幕→BGM→最终漫剧
```

---

## 三.五、内容层关键规则补充

> 以下规则聚焦于"提示词质量"本身——从资产提示词到分镜提示词的生成过程中，原方案未覆盖的内容层细节。
> 这些规则需落地到对应的模板文件（config/）和 Skill 指令（skills/）中。

### 规则 1：分镜表 JSON → 叙事提示词的字段映射规则

分镜表（storyboard-table.json）12 列字段在转化为 02-prompts.md 连续叙事段落时，必须遵循固定的**映射语序**，避免 LLM 自由发挥导致结构失控。

**映射模板（每条提示词的叙事段落内部语序）**：

```
[L0] @图片引用声明（参考图列表）
[L1] 全局参数行（风格锚点词 + 画质锁定词 + 反向提示词 + 时长 + 转场）
[L2] 场景落笔（@场景图引用 + lighting 字段转化为光影叙事，1-2 句）
[L3] 蒙太奇叙事核心（按时间轴展开，融合以下字段）：
     ├─ 时间段开头：时间标记（0-Xs）
     ├─ 空间布局：角色在画面中的位置（左/中/右 + 前景/中景/背景）
     ├─ shotType → 景别描述融入叙事（"镜头缓缓推至近景"而非标注"近景"）
     ├─ cameraMove → 运镜融入动作节奏（"镜头跟随其脚步平移"）
     ├─ action → 动作链叙事（动词+方向+幅度+速度）
     ├─ emotion + face_mapping → 情绪面部描写紧跟动作之后
     ├─ dialogue → 台词以「」标注，嵌入对应时间段
     └─ soundEffect → 环境音/动作音以括号形式穿插
[L4] 嘴型标注行（旁白闭嘴 / 对话张嘴 / 独白翕动）
```

**字段省略规则**：
- `soundEffect` 为"无"时省略
- `dialogue` 为"无台词"时，L4 嘴型默认"闭嘴"，无需单独标注
- 同 Track 内连续同场景，L2 场景描写从第二镜起可简化为"（同上场景）"，但 @场景图引用**不可省略**（因 API 逐条独立调用）

> 落地位置：`skills/shared/storyboard-prompt-techniques.md` 新增"字段映射规则"章节

### 规则 2：多角色同框提示词写法

当画面中出现 2 个及以上角色时，提示词必须遵循以下规范：

**空间布局描述**（必写，紧跟 L2 场景之后）：
- 格式：`画面[前景/中景/背景][左/中/右]处，[角色名][动作]`
- 示例：`画面左侧前景处，叶真持剑而立；右侧中景处，萧炎抱臂倚墙`

**描写密度分配**：
| 角色类型 | 描写量 | 规则 |
|---------|--------|------|
| 焦点角色（景别主体） | 详写（动作链+情绪面部+朝向） | 分镜表 action 完整展开 |
| 次要角色（同框出现） | 简写（姿态+朝向，1 句） | 只写当前静态姿态 |
| 背景角色（虚化/局部） | 极简（"远处隐约可见一人影"） | 不写面部，只写轮廓/局部 |

**互动动作时序**：
- 同一时间段内的互动：用"同时"/"与此同时"连接
- 有先后的互动：用时间轴分段（"0-2s 叶真出剑 → 2-4s 萧炎侧身闪避"）
- 肢体接触类动作：描述准备姿态（首帧原则），如"叶真伸出右手，指尖将触未触萧炎肩头"

**参考图引用顺序**：多角色时按画面位置从左到右引用（非按戏份重要性）

> 落地位置：`skills/shared/storyboard-prompt-techniques.md` 新增"多角色同框"章节

### 规则 3：角色一致性锚点词

每个角色在 assets.json 中必须定义 `identityAnchor` 字段——3~5 个核心视觉关键词，作为该角色在所有分镜提示词中的**强制复用词**。

**identityAnchor 生成规则**：
- 从 01-director.md 的人物描述中提取最具辨识度的视觉特征
- 必须包含：发色/发型 + 服饰主色/款式 + 一个独有标识（如兵器/饰品/伤疤）
- 禁止包含：情绪词、动作词、场景相关词

**示例**：
```json
{
  "id": "char-001",
  "name": "叶真",
  "identityAnchor": ["银发束冠少年", "白色长袍金边", "腰佩青锋剑"]
}
```

**在分镜提示词中的使用**：
- 角色首次出现在该条提示词时，必须包含完整 identityAnchor
- 同一条提示词内再次提及同一角色时，可只用角色名
- 当 identityAnchor 与参考图有细微差异时，以参考图为准，但 identityAnchor 不删（文字起辅助锚定作用）

> 落地位置：`schemas/assets.schema.json` 新增 identityAnchor 字段；`skills/shared/storyboard-prompt-techniques.md` 新增"一致性锚点"章节

### 规则 4：道具在分镜提示词中的描写规则

道具不是静态摆设，在分镜中有**状态变化**，提示词需要体现：

**道具状态描写模板**：
| 状态 | 描写方式 | 示例 |
|------|---------|------|
| 静置/佩戴 | 位置+姿态 | "青锋剑斜挂于腰侧，剑穗随风轻摆" |
| 手持/使用中 | 握持方式+与角色的空间关系 | "右手握剑柄，剑身斜指前方" |
| 动态使用 | 首帧原则——准备姿态 | "双手举剑过顶，剑尖蓄势欲落"（非"一剑劈下"） |
| 被放置/丢弃 | 落点+状态 | "长剑插在身前青石地面，剑身微颤" |

**景别与道具描写密度**：
| 景别 | 道具描写 |
|------|---------|
| 特写/近景 | 详写材质纹理（"剑身泛着幽蓝寒光，刃口隐约可见铭文"） |
| 中景 | 写形态+状态（"腰间长剑"） |
| 全景/远景 | 极简或省略（"一袭白衣持剑立于崖端"中"持剑"即可） |

**道具参考图引用**：
- 道具为画面焦点时（如特写镜头）：必须引用道具参考图
- 道具为角色附属时（如腰间佩剑）：不单独引用道具图，由角色参考图覆盖

> 落地位置：`skills/shared/storyboard-prompt-techniques.md` 新增"道具描写规则"章节

### 规则 5：场景衍生资产的选择决策树

分镜表 C2 阶段选择场景参考图时，按以下决策树确定使用基础图还是衍生图：

```
当前分镜的场景 = assets.json 中哪个场景？
    │
    ├─ 景别是否与基础图一致？
    │   ├─ 不一致（如基础图是全景，当前镜头是近景）→ 使用景别衍生图
    │   └─ 一致 → 继续判断
    │
    ├─ 时段是否变化？（剧本明确写了"天色渐暗"/"夜幕降临"）
    │   ├─ 是 → 使用时段衍生图
    │   └─ 否 → 继续判断
    │
    ├─ 天气是否变化？（剧本明确写了"下起小雨"/"雪花纷飞"）
    │   ├─ 是 → 使用天气衍生图
    │   └─ 否 → 使用基础场景图
    │
    └─ 如果需要多维度组合（如"夜晚+细雨+近景"）：
        → 生成组合衍生图（B4 阶段按需生成，非预生成所有组合）
        → assetIds 引用该组合衍生图 ID
```

**渐变场景的处理**：
- 剧本中"天色渐暗"等渐变描述，在**分镜表**中确定切换点（具体哪一镜开始用暮色版）
- 切换前的镜头：用当前时段图 + 提示词文字补充光线变化（"天边最后一抹余晖渐隐"）
- 切换后的镜头：直接用新时段衍生图

**同场景连续多镜的景别衍生**：
- 不需要每一镜都换景别衍生图
- 仅在景别**跨两级以上**时切换参考图（如全景→特写）
- 相邻景别（如中景→近景）可用同一张参考图，靠提示词文字控制景别

> 落地位置：`skills/shared/storyboard-table-techniques.md` 新增"场景资产选择决策树"章节

### 规则 6：首帧原则与时间轴的配合规则

首帧原则和精确时间轴**不矛盾**，但需要明确各自的适用范围：

**规则**：
- **第一个时间段**（0-Xs）：严格执行首帧原则——描述动作的准备姿态/起始 1/3
- **中间时间段**：正常描述动作过程（可写动作顶点）
- **最后一个时间段**：描述动作终态/结果状态（供下一镜衔接）

**示例**：
```
一条 8 秒的分镜，角色动作为"挥剑斩出剑气"：

0-2s：叶真右手握剑，剑身缓缓后引至肩侧，身体微微扭转蓄力
      （首帧原则：准备姿态，非动作本身）
2-5s：腰部骤然发力带动手臂，剑身划出弧线向前斩出
      （动作过程：正常描述）
5-8s：剑势已尽，叶真保持前探姿态，一道青色剑气沿弧线消散
      （动作终态：供下一镜衔接）
```

**无动作镜头的豁免**：
- 纯对话/纯静态镜头无需首帧原则，直接描述画面状态
- 环境空镜（转场用）无需首帧原则

> 落地位置：`skills/shared/storyboard-prompt-techniques.md` 新增"首帧原则与时间轴配合"章节

### 规则 7：参考图数量上限下的优先级规则

Seedance 2.0 multiReference 模式最多 9 张参考图。当单条分镜关联的资产超过 9 个时，按以下优先级裁剪：

**优先级排序（从高到低）**：
1. 焦点角色图（景别主体的角色）
2. 当前场景图（必选）
3. 次要角色图（同框但非焦点）
4. 焦点角色的衍生图（如战斗服版本，替代基础图，不同时传）
5. 关键道具图（画面焦点道具）
6. 场景衍生图（如有，替代基础场景图，不同时传）
7. 背景角色图（虚化/局部出现的角色）
8. 非焦点道具图

**关键规则**：
- 同一资产的基础图和衍生图**不同时传**，选剧情状态匹配的那个
- 角色图至少保留焦点角色 + 1 个互动对象 = 最少 2 张角色图
- 场景图有且仅有 1 张（基础 or 衍生，不同时传）
- 如果裁剪后仍超 9 张：砍背景角色图 → 砍非焦点道具图

> 落地位置：`skills/shared/storyboard-prompt-techniques.md` 新增"参考图优先级规则"章节

### 规则 8：光影色彩从导演规划到提示词的逐级传递

director-plan.json 中的视觉风格（色彩方案 + 光线方案）必须**逐级传递**到最终提示词，不能在中间环节丢失。

**传递链路**：

```
director-plan.json                    storyboard-table.json              02-prompts.md
─────────────────                    ─────────────────────              ─────────────
visualStyle.colorPalette             每行 lighting 字段必须             L1 全局参数行包含
  "青绿含蓄"                          引用对应色彩方案的                  色彩方案关键词
                            ──→      具体光影描述              ──→     （"青绿色调，水墨灰
visualStyle.lightingPlan                                                辅调"）
  "方案B：侧逆光+冷色温"             "左侧冷白侧逆光，青绿             
                                      色调笼罩，面部半明半暗"           L3 每个时间段的光影
sceneGroups[].colorScheme                                               叙事与 lighting 一致
  每场景可微调色彩                    同场景内多镜 lighting
                                      基调一致，允许明暗微调
```

**具体规则**：
- `storyboard-table.json` 的 `lighting` 字段**不允许**脱离 director-plan 的色彩/光线方案自由发挥
- 同一 scene group 内所有分镜的 lighting 必须共享**同一光源方向和色调**，只允许明暗比例微调
- `02-prompts.md` 的 L1 全局参数行必须包含当前 Track 对应的色彩方案关键词
- 跨场景转场时，lighting 允许变化，但必须与 director-plan 的 transitions 段落一致

> 落地位置：`skills/shared/storyboard-table-techniques.md` 新增"光影色彩传递规则"章节；`skills/shared/storyboard-prompt-techniques.md` 中 L1 段落说明

### 规则 9：分镜表连贯性校验的完整规则 + 处理策略

storyboard-table.json 生成后，必须执行以下校验。每条校验给出**违规判定**和**处理策略**。

| # | 校验项 | 违规判定 | 处理策略 |
|---|--------|---------|---------|
| 1 | 景别递进 | 相邻两镜景别跨度 > 2 级 | 自动插入过渡镜头（中间景别，1-2s） |
| 2 | 连续同景别 | 连续 3 镜及以上同景别 | 将中间镜头调整为相邻景别 |
| 3 | 动作连续性 | 上一镜终态与下一镜起始不匹配 | 标记警告，LLM 重写该镜 action |
| 4 | 180度线 | 同场景内角色朝向突然左右翻转且无动作衔接 | 标记错误，必须修正朝向或插入动作过渡 |
| 5 | 情绪连贯性 | 相邻两镜情绪跳变（如"释然"→"愤怒"）且无剧情事件触发 | 标记警告，建议插入情绪过渡镜头 |
| 6 | Track 时长 | 单 Track 累计 > 15s | 在最近的场景切换处拆分 Track |
| 7 | 资产引用完整性 | description 提到某角色但 assetIds 未包含对应 ID | 自动补全 assetId |
| 8 | 台词时长 | duration < 按公式计算的台词所需时长 | 自动上调 duration 至公式值 |
| 9 | 黄金 6 秒 | 无台词镜头 duration > 6s 且非一镜到底 | 拆分为两镜或缩短时长 |
| 10 | 场景图必选 | assetIds 中无 scene 类型资产 | 自动补全最匹配的场景 assetId |

**校验执行时机**：C2 分镜表 Skill 生成完整 JSON 后、输出前，自动执行全部校验。违规项在 Skill 内自动修正后再输出，修正记录写入 `storyboard-table.json` 的 `_validationLog` 字段（数组，供审核参考）。

> 落地位置：`skills/shared/storyboard-table-techniques.md` 新增"连贯性校验规则表"章节；`skills/seedance-storyboard-table/SKILL.md` 中加入校验步骤

### 规则 10：L2 层 @引用在逐条独立调用下的复用策略

Seedance 2.0 API 逐条独立调用，每条提示词必须自包含。因此 L2 层的"最小化重复"指的是**文字描写层面**，不是引用层面。

**具体规则**：
- **@图片引用**：每条提示词都必须完整包含所有关联参考图的 @引用（不可省略）
- **场景文字描写**：
  - 同场景第 1 镜：完整描写场景（光影+空间+氛围，2-3 句）
  - 同场景第 2 镜起：简化为 1 句场景定位（"同一庭院内"），把笔墨让给角色动作
  - 跨场景第 1 镜：重新完整描写
- **角色 identityAnchor**：
  - 该角色在本条提示词首次出现：写完整 identityAnchor
  - 同一条提示词内再次提及：只用名字

> 落地位置：`skills/shared/storyboard-prompt-techniques.md` 更新"五层框架 L2 段落"说明

### 规则 11：美术模板内容编写指南

第 1 阶段新建的 13 个模板/技法文件，其**内容**的编写方法如下：

| 文件 | 内容来源 | 编写方法 |
|------|---------|---------|
| `prefix.md` | Toonflow-app `3D_chinese_traditional/prefix.md` + 造化之门视觉定位 | 提取 Toonflow-app 色板结构，替换为国漫 3D 风格的色系（暖黄皮肤/水墨灰背景/朱红强调色），禁止项从 script_video_generate_rule.md 去人化规则提取 |
| `art_character.md` | Toonflow-app `art_character.md` 面容表结构 + CLI 现有 art-skill 四视图规范 | 保留 Toonflow 的脸型/眼型/眉型/鼻型/唇型分类框架，填入国漫 3D 风格的具体选项（如眼型：丹凤/杏仁/狭长/圆润）；四视图规范从现有 art-skill 迁移 |
| `art_scene.md` | Toonflow-app `art_scene.md` + CLI director-skill 场景描写规范 | 提取构图/光影/材质规范结构，填入古风 3D 场景约束（石板/雕栏/飞檐/体积雾） |
| `art_prop.md` | 新建，参考 Toonflow-app 结构 | 古风道具约束（兵器/法器/书卷/玉佩等类别的材质/纹理/尺寸规范） |
| `art_*_derivative.md`（3 个） | Toonflow-app 对应衍生模板 + script_video_generate_rule.md 第四章 B4 | 保留层级结构（L0-L5 / 三维度），填入古风具体搭配（如 L4 外衣：儒衫/战甲/官袍/丧服） |
| `art_storyboard_video.md` | script_video_generate_rule.md 第四章 C3 + Toonflow-app 视频模板 | 风格锚点词/画质词/反向词从两套系统合并；情绪映射表从 emotion_face_mapping.md 引用 |
| `director_planning_style.md` | script_video_generate_rule.md 第四章 C1 六维度 | 直接从文档提取 7 色彩方案 + 7 光线方案 + 古乐/环境声内容 |
| `director_storyboard_style.md` | script_video_generate_rule.md 第四章 C2 + Toonflow-app 分镜约束 | 合并两套分镜风格约束 |
| `storyboard_table_techniques.md` | script_video_generate_rule.md 第七章 7.2 | 直接从文档提取全部 13 条规则，补充本文档规则 5/8/9 |
| `storyboard_prompt_techniques.md` | script_video_generate_rule.md 第七章 7.3 | 直接从文档提取全部 16 条规则，补充本文档规则 1/2/3/4/6/7/10 |
| `emotion_face_mapping.md` | script_video_generate_rule.md 第七章 7.4 | 直接迁移 9 种情绪映射表 |

**编写顺序**：先写 `prefix.md`（全局约束）→ 基础模板（character/scene/prop）→ 衍生模板 → 视频/导演模板 → 制作技法。每写完一个用造化之门 EP1 的角色/场景做一次提示词测试。

---

## 四、分阶段实施计划

### 总体原则

1. **向前兼容**：每阶段完成后系统可独立运行
2. **造化之门 EP1 作为验证基准**
3. **先基础设施后上层应用**：先建模板/数据结构，再改 Agent/Skill
4. **传统管线标记 Legacy**：不删除不维护

---

### 第 0 阶段：清理废弃物 + 文档归档

**删除**：
| 目标 | 理由 |
|------|------|
| `prompts/` 整个目录 | 旧架构 system prompt，已被 `skills/` 取代 |
| `zhican/` 整个目录 | 旧版 TS 资产生成代码 |
| `文章编辑部 Agent/` | 独立项目，不属于 Toonflow |
| `Toonflow-new.md` | 只含图片引用无内容 |
| `skill_guifna.md` | 旧版 skill 规范 |
| `Toonflow开发说明书v2.md` | 旧版说明 |
| `ui.md` | 旧版 UI 文档 |
| `剧本设计思路.html` | 已有 docs/script-rule.md 取代 |
| `剧本生成视频思路.html` | 已有 docs/script_video_generate_rule.md 取代 |
| `web/剧本-生成视频思路.html` | 同上 |

**标记 Legacy（不删除，加标注）**：
- `agents/storyboard-segment.md` — 传统管线分镜 agent
- `agents/storyboard-shot.md` — 传统管线分镜 agent
- `agents/asset-generator.md` — 传统管线资产 agent
- `skills/asset-polish/` — 传统管线四件套
- `skills/asset-generate-image/` — 同上
- `skills/asset-save/` — 同上
- `skills/asset-batch/` — 同上
- `skills/art-design-skill/` — 被 seedance-art-skill 取代，两者都将被 seedance-asset 取代

**文档整理**：
- `product.md` → 移到 `docs/product.md`
- 更新 `docs/data-layer.md`：标注 legacy 路径
- 更新 `.claude/CLAUDE.md`：移除对 prompts/ 的引用

---

### 第 1 阶段：基础设施 — 美术模板 + 制作技法

**新建 `skills/art-styles/3d-guoman/`**（10 个文件）：

| 文件 | 说明 |
|------|------|
| `prefix.md` | 全局风格前缀（色板/材质/硬约束/软约束/禁止项） |
| `art_character.md` | 角色基础模板（面容约束表/体型/服饰基调/四视图设定规范） |
| `art_scene.md` | 场景基础模板（构图/光影/空间规范/四视图设定规范） |
| `art_prop.md` | 道具基础模板（材质/形状/比例/多角度设定规范） |
| `art_character_derivative.md` | 角色衍生模板（L0-L5 六层堆叠体系） |
| `art_scene_derivative.md` | 场景衍生模板（景别/时段/天气三维度衍生） |
| `art_prop_derivative.md` | 道具衍生模板（使用状态/损毁状态） |
| `art_storyboard_video.md` | 视频提示词风格模板（风格锚点词/画质锁定词/反向提示词/情绪面部映射） |
| `director_planning_style.md` | 导演规划风格约束（7色彩方案/7光线方案/古乐器选择/环境声库） |
| `director_storyboard_style.md` | 分镜表风格约束（光影统一/古风动作节奏/运镜禁区） |

**制作技法文档**（已迁移至对应 `skills/` 目录下）：

| 文件 | 说明 |
|------|------|
| `storyboard_table_techniques.md` | 分镜表设计规范（台词锁定/台词时长公式/景别衔接/朝向系统/一镜到底/转场/Track分组） |
| `storyboard_prompt_techniques.md` | 分镜提示词写作规范（首帧原则/去人化/柔化词/五层框架/嘴型/风格锚点/@资产绑定） |
| `emotion_face_mapping.md` | 情绪→面部/眼部映射表（9种情绪，含柔化版本） |

**内容来源**：`docs/script_video_generate_rule.md` 第六、七章 + Toonflow-app 参考

**内容编写指南**：详见"三.五 规则 11"，每个模板文件的内容来源、编写方法和参考对象已逐一定义。编写顺序：prefix → 基础模板 → 衍生模板 → 视频/导演模板 → 制作技法。

**制作技法文件补充内容**（来自"三.五 内容层规则"）：
- `storyboard_table_techniques.md` 额外包含：场景资产选择决策树（规则5）、光影色彩传递规则（规则8）、连贯性校验规则表（规则9）
- `storyboard_prompt_techniques.md` 额外包含：字段映射规则（规则1）、多角色同框（规则2）、一致性锚点（规则3）、道具描写规则（规则4）、首帧与时间轴配合（规则6）、参考图优先级（规则7）、L2复用策略（规则10）

---

### 第 2 阶段：数据结构统一

**新建 JSON Schema**：
- `schemas/assets.schema.json` — SeedanceAsset[]（接口定义见 script_video_generate_rule.md 5.1，**新增 `identityAnchor: string[]` 字段**——角色资产必填 3~5 个核心视觉关键词，详见"三.五 规则 3"）
- `schemas/tasks.schema.json` — TaskRecord[] （见 5.2）
- `schemas/director-plan.schema.json` — DirectorPlan （见 5.3）
- `schemas/storyboard-table.schema.json` — StoryboardTable （见 5.4）

**数据迁移（造化之门 EP1）**：
- `seedance/manifest.json` + `seedance/prompts/*.md` → `seedance/assets.json`
  - 合并 characters 和 scenes 为扁平数组
  - 补充 id（char-001/scene-001 格式）、type、description（从 01-director.md 提取）
  - 旧 manifest.json 保留标注 `[MIGRATED]`
- 新建空 `seedance/tasks.json`（[]）

**更新文档**：
- `docs/data-layer.md` — 新目录结构

---

### 第 3 阶段：Skill 重建 — 资产管理

**新建 `skills/seedance-asset/SKILL.md`**

替代：seedance-art-skill + seedance-image

流程：
1. 从 01-director.md 提取资产列表 → 写入 assets.json（描述层字段）
   - **角色资产额外提取 identityAnchor**（3~5 核心视觉关键词，见"三.五 规则 3"）
2. 读取美术模板（skills/art-styles/{style}/）+ 资产描述 → 生成结构化 prompt → 写入 assets.json prompt 字段
3. 调用图片生成 API → 更新 assets.json 生成层字段 + tasks.json
4. 衍生资产生成（按需，L0-L5 角色衍生 / 三维度场景衍生）
   - **场景衍生的选择时机**：按"三.五 规则 5 决策树"，在 C2 分镜表阶段按需触发，非预生成所有组合

**废弃标记**：
- `skills/seedance-art-skill/SKILL.md` — 加 `[DEPRECATED: 使用 seedance-asset 替代]`
- `skills/seedance-image/SKILL.md` — 加 `[DEPRECATED: 使用 seedance-asset 替代]`

---

### 第 4 阶段：Skill 重建 — 导演规划 + 分镜表

**新建**：
- `skills/seedance-director-plan/SKILL.md` — 六维度导演规划
  - 输入：01-director.md + assets.json + director_planning_style.md
  - 产出：director-plan.json
  - 六维度：主题叙事核心 / 视觉风格基调 / 叙事结构节奏 / 逐场景情绪意图 / 声音音乐方向 / 转场视觉连贯

- `skills/seedance-storyboard-table/SKILL.md` — 结构化分镜表
  - 输入：director-plan.json + assets.json + storyboard_table_techniques.md + director_storyboard_style.md
  - 产出：storyboard-table.json
  - 核心增量：10方位朝向系统、台词时长公式、景别衔接、Track 分组、一镜到底策略
  - **内容层增量**（来自"三.五"）：
    - 场景衍生资产选择决策树（规则 5）——assetIds 中场景图的选择逻辑
    - 光影字段必须锚定 director-plan 的色彩/光线方案（规则 8）
    - 生成完成后自动执行 10 项连贯性校验（规则 9），修正后再输出
    - 校验修正记录写入 `_validationLog` 字段

- `skills/seedance-storyboard-table/SKILL.md` 中需包含的**场景衍生按需触发逻辑**：
  - 当 C2 分镜表需要某个景别/时段/天气衍生图，但 assets.json 中尚未生成时
  - 暂停分镜表生成 → 回调 seedance-asset Skill 生成该衍生图 → 更新 assets.json → 继续分镜表
  - 或标记 `assetIds` 中的衍生 ID 为 `pending`，由 seedance-main 协调生成后回填

**修改 `skills/seedance-storyboard-skill/SKILL.md`**：
- 新增输入源：storyboard-table.json + assets.json + storyboard_prompt_techniques.md + art_storyboard_video.md
- **保留**：五层写法框架、去人化规则、柔化词系统、嘴型规范、精确时间轴、连续叙事段落输出
- **新增**：首帧原则、风格锚点词、画质锁定+反向提示词、情绪面部映射、10方位预分析、@资产强绑定格式
- **内容层增量**（来自"三.五"）：
  - JSON→叙事的字段映射规则（规则 1）——12 列字段按固定语序映射到 L0-L4
  - 多角色同框写法（规则 2）——空间布局+描写密度分配+互动时序
  - 角色 identityAnchor 强制复用（规则 3）——每条提示词中角色首次出现时写完整锚点词
  - 道具状态描写（规则 4）——按状态×景别写道具
  - 首帧原则仅约束第一个时间段（规则 6）——中间段正常描述，末段写终态
  - 参考图超 9 张时按优先级裁剪（规则 7）
  - L1 行必须包含 director-plan 色彩方案关键词（规则 8）
  - L2 场景文字同场景第 2 镜起简化，但 @引用不可省（规则 10）

---

### 第 5 阶段：更新协调层 + 审核体系

**修改 `agents/seedance-main.md`** — 全面改写：
- 旧：3 阶段（导演分析→服化道设计→分镜编写）
- 新：5 阶段（导演分析A → 资产管理B → 导演规划C1 → 分镜表C2 → 分镜提示词C3）

~sd 指令扩展：
| 指令 | 阶段 | 说明 |
|------|------|------|
| `~sd start` | A | 导演分析（不变） |
| `~sd asset` | B | 资产管理（替代 `~sd design`） |
| `~sd plan` | C1 | 导演规划（新增） |
| `~sd table` | C2 | 分镜表构建（新增） |
| `~sd prompt` | C3 | 分镜提示词（保留） |
| `~sd image` | — | 独立触发图片生成 |
| `~sd status` | — | 查看进度 |

**修改审核 skill**：
- `art-direction-review-skill` — 审核 assets.json 内容（替代审核 prompts/*.md）
- `seedance-prompt-review-skill` — 同时校验 storyboard-table.json 连贯性 + 02-prompts.md 质量

**Agent 清理**：
- `agents/art-designer.md` — 标记 deprecated（被 seedance-main 直接调度 seedance-asset 取代）
- `docs/seedance-pipeline.md` — 重写为 5 阶段流程
- `.claude/CLAUDE.md` — 更新 Seedance 层说明

---

### 第 6 阶段：视频生成（新增）

**新建 `skills/seedance-video/SKILL.md`**

流程：
1. 解析 02-prompts.md，拆分为独立的 P01/P02/...
2. 为每个 P 收集对应的参考图（根据 @图片引用 + assets.json 的 imagePath）
3. 调用 Seedance 2.0 API（multiReference 模式）
4. 写入 tasks.json，轮询获取结果
5. 下载保存到 seedance/ep{N}/videos/P{NN}.mp4
6. 更新 storyboard-table.json 中对应行的 videoState/videoPath

并发控制：最多 3 个视频任务并行，失败自动重试最多 2 次

**修改**：
- seedance-main 添加 `~sd video [小说名] [ep{N}]` 指令
- `config/models/video/` — Seedance 2.0 模型配置

---

### 第 7 阶段：Web 层适配

**修改 `web/app/lib/novels.ts`**：
- `readSeedanceManifest()` — 从读 manifest.json 改为读 assets.json（fallback 旧格式）
- `readSeedanceDesign()` — 从读 prompts/*.md 改为从 assets.json 提取 prompt 字段
- 新增：读取 director-plan.json、storyboard-table.json、tasks.json 的函数

**新增 Web 组件**：
- 资产管理视图（展示 assets.json 资产列表和状态）
- 分镜表视图（展示 storyboard-table.json 表格）
- 视频生成进度视图（展示 tasks.json 任务队列）

---

## 五、最终产出目录结构

```
novels/{name}/
|-- scripts/
|   +-- episode-{N}.txt                  # 剧本（已有）
+-- seedance/
    |-- assets.json                       # [新] 统一资产数据源（合并原 manifest.json）
    |-- tasks.json                        # [新] 异步任务队列
    |-- images/
    |   |-- characters/{name}.png         # 角色图
    |   |-- scenes/{name}.png             # 场景图
    |   +-- props/{name}.png              # 道具图
    +-- ep{N}/
        |-- 01-director.md                # 导演分析（保留）
        |-- director-plan.json            # [新] 导演规划（六维度）
        |-- storyboard-table.json         # [新] 结构化分镜表（纯 JSON）
        |-- 02-prompts.md                 # Seedance 2.0 提示词（保留+增强）
        +-- videos/                       # [新] 生成的视频
            |-- P01.mp4
            |-- P02.mp4
            +-- ...

config/
|-- art-styles/                           # [新] 美术风格模板
|   +-- 3d-guoman/
|       |-- prefix.md                     # 全局风格
|       |-- art_character.md              # 角色基础
|       |-- art_scene.md                  # 场景基础
|       |-- art_prop.md                   # 道具基础
|       |-- art_character_derivative.md   # 角色衍生
|       |-- art_scene_derivative.md       # 场景衍生
|       |-- art_prop_derivative.md        # 道具衍生
|       |-- art_storyboard_video.md       # 视频提示词
|       |-- director_planning_style.md    # 导演规划风格
|       +-- director_storyboard_style.md  # 分镜表风格
|-- production-skills/                    # [新] 制作技法
|   |-- storyboard_table_techniques.md    # 分镜表规范
|   |-- storyboard_prompt_techniques.md   # 提示词规范
|   +-- emotion_face_mapping.md           # 情绪面部映射
+-- models/                              # 已有
    |-- image/
    +-- video/
```

**废弃文件**：

| 废弃 | 替代 |
|------|------|
| `seedance/manifest.json` | 合并入 `assets.json` |
| `seedance/prompts/character-prompts.md` | `assets.json` 中每个角色的 `prompt` 字段 |
| `seedance/prompts/scene-prompts.md` | `assets.json` 中每个场景的 `prompt` 字段 |

---

## 六、Agent/Skill 最终决议

| 组件 | 命运 | 说明 |
|------|------|------|
| `director.md` agent | **保留** | seedance 导演 agent |
| `art-designer.md` agent | **废弃** | 被 seedance-main 直接调度 seedance-asset 取代 |
| `storyboard-artist.md` agent | **保留+改造** | 更新 skill 引用，增加读取 storyboard-table.json |
| `storyboard-segment.md` agent | **Legacy** | 传统管线，不删除不维护 |
| `storyboard-shot.md` agent | **Legacy** | 传统管线，不删除不维护 |
| `asset-generator.md` agent | **Legacy** | 传统管线，不删除不维护 |
| `art-design-skill` | **Deprecated** | 被 seedance-asset 取代 |
| `seedance-art-skill` | **Deprecated** | 被 seedance-asset 取代 |
| `seedance-image` | **Deprecated** | 被 seedance-asset 取代 |
| `director-skill` | **保留** | 阶段A仍使用 |
| `seedance-storyboard-skill` | **保留+改造** | 增加新输入源（分镜表+技法模板） |
| `compliance-review-skill` | **保留** | 不变 |
| Claude Code 兼容层的 `web-*` agent/skill | **保留** | Codex 侧旧 `web-*` 入口已删除；本文管线不受影响 |
| 所有 `scriptAgent-*` agent | **保留** | 剧本管线不受影响 |

---

## 七、依赖关系

```
第0阶段（清理）——→ 无依赖
第1阶段（模板）——→ 无依赖，可与第0阶段并行
第2阶段（数据结构）——→ 依赖第1阶段（schema 需引用模板体系中的 artStyle 枚举）
第3阶段（资产Skill）——→ 依赖第1阶段（读取模板）+ 第2阶段（写入 assets.json）
第4阶段（分镜Skill）——→ 依赖第2阶段（读写 JSON）+ 第3阶段（需要 assets.json 已填充）
第5阶段（协调层）——→ 依赖第3+4阶段（所有新 Skill 就绪）
第6阶段（视频）——→ 依赖第5阶段（完整流水线）
第7阶段（Web）——→ 依赖第2阶段（数据结构定义），可与第3-6阶段并行
```

---

## 八、关键风险

1. **模板质量**：美术模板质量直接决定 seedance-asset 产出质量，需反复调试
2. **JSON 输出可靠性**：LLM 输出 director-plan.json 和 storyboard-table.json 时可能格式不稳定，需在 Skill 中加入格式校验和修复逻辑
3. **向后兼容**：Web 层需同时支持旧 manifest.json 和新 assets.json 的 fallback
4. **Seedance 2.0 API**：视频生成阶段依赖外部 API，成功率和成本不可控
5. **字段映射规则执行偏移**：LLM 在将分镜表 JSON 转化为叙事段落时，可能不严格遵循规则 1 的固定语序，需在 Skill 中用 few-shot 示例锚定格式
6. **多角色同框上下文过载**：3+ 角色同框时，单条提示词描写量剧增，可能超过 Seedance 2.0 单条 prompt 字数限制（需实测确认限制值）
7. **identityAnchor 与参考图偏移**：角色锚点词描述的视觉特征与实际生成的参考图可能有差异（如"银发"生成为浅灰），需在图片生成后人工校验并更新锚点词
8. **场景衍生图按需生成的流程中断**：C2 分镜表阶段发现需要未生成的衍生图，回调 B4 生成可能打断分镜表的整体连贯性思路

---

## 九、关键文件变更清单

### 新建（约 23 个文件）

| 文件 | 说明 |
|------|------|
| `skills/art-styles/3d-guoman/prefix.md` | 全局风格前缀 |
| `skills/art-styles/3d-guoman/art_character.md` | 角色基础模板 |
| `skills/art-styles/3d-guoman/art_scene.md` | 场景基础模板 |
| `skills/art-styles/3d-guoman/art_prop.md` | 道具基础模板 |
| `skills/art-styles/3d-guoman/art_character_derivative.md` | 角色衍生模板 |
| `skills/art-styles/3d-guoman/art_scene_derivative.md` | 场景衍生模板 |
| `skills/art-styles/3d-guoman/art_prop_derivative.md` | 道具衍生模板 |
| `skills/art-styles/3d-guoman/art_storyboard_video.md` | 视频提示词模板 |
| `skills/art-styles/3d-guoman/director_planning_style.md` | 导演规划风格 |
| `skills/art-styles/3d-guoman/director_storyboard_style.md` | 分镜表风格 |
| `skills/shared/storyboard-table-techniques.md` | 分镜表规范 |
| `skills/shared/storyboard-prompt-techniques.md` | 提示词规范 |
| `skills/shared/emotion-face-mapping.md` | 情绪映射表 |
| `schemas/assets.schema.json` | SeedanceAsset[] |
| `schemas/tasks.schema.json` | TaskRecord[] |
| `schemas/director-plan.schema.json` | DirectorPlan |
| `schemas/storyboard-table.schema.json` | StoryboardTable |
| `skills/seedance-asset/SKILL.md` | 资产管理技能 |
| `skills/seedance-director-plan/SKILL.md` | 导演规划技能 |
| `skills/seedance-storyboard-table/SKILL.md` | 分镜表构建技能 |
| `skills/seedance-video/SKILL.md` | 视频生成技能 |
| `novels/造化之门/seedance/assets.json` | 迁移数据 |
| `novels/造化之门/seedance/tasks.json` | 空初始化 |

### 修改（约 10 个文件）

| 文件 | 说明 |
|------|------|
| `agents/seedance-main.md` | 3阶段→5阶段 |
| `skills/seedance-storyboard-skill/SKILL.md` | 增加新输入源 |
| `agents/art-designer.md` | 标记 deprecated |
| `docs/data-layer.md` | 新数据结构 |
| `docs/seedance-pipeline.md` | 新流程 |
| `docs/content-pipeline.md` | legacy 标注 |
| `.claude/CLAUDE.md` | 更新引用 |
| `config/models/video/` | Seedance 2.0 视频模型配置 |
| `web/app/lib/novels.ts` | 适配新数据格式 |
| `config/models/video/` | Seedance 2.0 配置 |

### 删除（约 10 个文件/目录）

| 目标 | 理由 |
|------|------|
| `prompts/` 整个目录 | 旧架构，被 skills/ 取代 |
| `zhican/` 整个目录 | 旧版 TS 代码 |
| `文章编辑部 Agent/` | 独立项目，移出 |
| `Toonflow-new.md` | 无内容 |
| `skill_guifna.md` | 旧版规范 |
| `Toonflow开发说明书v2.md` | 旧版说明 |
| `ui.md` | 旧版 UI |
| `剧本设计思路.html` | 已有 docs/ 取代 |
| `剧本生成视频思路.html` | 已有 docs/ 取代 |
| `web/剧本-生成视频思路.html` | 同上 |

---

## 十、验证方案

用造化之门 EP1 端到端测试：

1. 确认 01-director.md 正常产出
2. 验证 assets.json 迁移数据正确（3 角色 + 2 场景）
2a. **验证每个角色的 identityAnchor 字段**：是否为 3~5 个核心视觉关键词，是否与参考图匹配
3. 对比新旧角色图质量（模板约束 vs 自由发挥）
4. 验证衍生资产生成（角色姿势变体）
5. 验证 director-plan.json 六维度完整性
5a. **验证色彩方案/光线方案是否具体且可传递**（不允许模糊的"柔光"，必须是"方案X：具体描述"）
6. 验证 storyboard-table.json 12字段+朝向+Track分组
6a. **验证 lighting 字段是否锚定 director-plan 色彩方案**（同 scene group 内光源方向+色调一致）
6b. **验证 10 项连贯性校验全部通过**（检查 _validationLog 字段是否有未修正项）
6c. **验证场景衍生资产选择是否合理**（景别跨两级以上时是否切换了参考图）
7. 验证连贯性校验规则生效（朝向/景别/动作终态）
8. 验证 02-prompts.md 引用 assets.json 中的 ID
8a. **验证字段映射语序**：抽查 3 条提示词，确认叙事段落内部语序遵循规则 1（L0→L1→L2→L3→L4）
8b. **验证 identityAnchor 复用**：每条提示词中角色首次出现时包含完整锚点词
8c. **验证多角色同框**：找一条 2+ 角色的提示词，确认有空间布局描述、描写密度分配合理
8d. **验证道具描写**：找一条含道具的提示词，确认道具有状态描写且密度与景别匹配
8e. **验证首帧原则**：确认每条提示词的第一个时间段描述的是准备姿态（非动作顶点）
8f. **验证参考图数量**：确认每条提示词的 @图引用 ≤ 9 张
8g. **验证色彩传递**：L1 全局参数行是否包含 director-plan 色彩方案关键词
8h. **验证 L2 复用策略**：同场景连续镜头中，@引用未省略但场景文字描写从第 2 镜起已简化
9. 触发单镜视频生成（P01）+ 进度反馈
10. 流水线五阶段正常流转
11. Web 页面正确显示新数据格式
