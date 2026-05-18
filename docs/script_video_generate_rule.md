# 漫剧制作流水线方案

> 定位：从"剧本之后"到"最终漫剧"的完整流水线设计

---

## 一、问题背景

我们项目的剧本生成（scriptAgent 三阶段）已经完善。现在需要设计**剧本之后**的完整流水线：

```
剧本 → ??? → 漫剧（每集由多个 Seedance 2.0 短视频拼接而成）
```

当前 CLI seedance pipeline 有两个痛点：

1. **角色/场景图片质量不好** —— 提示词体系不够结构化，只用一个供应商
2. **缺少视频生成环节** —— CLI 只产出提示词文本（02-prompts.md），没有调视频 API

---

## 二、Toonflow-app 参考分析（不改它，只学它）

Toonflow-app 是一个成熟的短剧制作工具，它的流水线给我们以下核心启发：

### 启发 1：结构化美术模板体系

Toonflow-app 有 9 套美术风格（如 `3D_chinese_traditional`），每套包含：

- `prefix.md` — 全局风格前缀（色板/材质/硬约束）
- `art_character.md` — 面容约束表（脸型/眼型/眉型/鼻型/唇型/气质，男女分开）
- `art_scene.md` — 场景约束（构图/光影/材质规范）
- `art_prop.md` — 道具约束（形状/颜色/材质/尺寸）
- `art_character_derivative.md` — 角色衍生模板（姿势变体/服装切换）
- `art_scene_derivative.md` — 场景衍生模板（时段变体/季节变化）
- `art_prop_derivative.md` — 道具衍生模板
- `art_storyboard_video.md` — 视频提示词风格模板（运镜/转场/动画约束）

**对比我们的 seedance-art-skill**：Claude 自由发挥写提示词，没有约束表 → 出图质量不稳定。

**我们应该学的**：建立自己的美术模板体系，让 AI 在约束框架内生成提示词。特别是**衍生模板**和**视频专用模板**，这是我们完全缺失的。

### 启发 2：分镜制作是三步走（不是两步）

Toonflow-app 的分镜制作：

```
剧本 → 导演规划（director_plan） → 分镜表（storyboard_table） → 分镜面板（storyboard_panel）
```

每一步有对应的 skill 模板：

- `production_execution_director_plan.md` — 导演拆解场景结构
- `production_execution_storyboard_table.md` — 结构化分镜表（景别/时长/运镜/动作）
- `production_execution_storyboard_panel.md` — 最终视觉描述（供图片/视频生成消费）

另有两份独立的技法文档：

- `storyboard_table_techniques.md` — 分镜表设计规范（景别衔接/时长规则/连贯性校验）
- `storyboard_prompt_techniques.md` — 分镜提示词写作规范（构图/光影/动作描述）

**分镜表** 是一个结构化表格，每行包含 12 个字段：

| 序号 | 画面描述 | 场景 | 关联资产 | 时长 | 景别 | 运镜 | 角色动作 | 情绪 | 光影氛围 | 台词 | 音效 |
|------|---------|------|---------|------|------|------|---------|------|---------|------|------|

这个中间层的好处：

- 所有维度拆开填写，不会遗漏
- 可以在生成最终提示词前进行**连贯性校验**（人物朝向、景别衔接）
- 同一份分镜表可以适配不同的视频生成模式

**对比我们的 CLI seedance**：从导演分析直接跳到最终提示词（01-director.md → 02-prompts.md），中间没有结构化校验环节，也缺少 panel 细化环节。

### 启发 3：视频提示词的多模式适配

Toonflow-app 支持 3 种分镜模式：

- **纯文本多参模式** — 只写 videoDesc，不生分镜图，适合 Seedance 2.0 multiReference
- **分镜图辅助多参模式** — 先生分镜图再送视频 API，图+文双通道
- **首尾帧模式** — 每镜独立，首帧+尾帧+描述

我们的目标是 Seedance 2.0 漫剧，**"纯文本多参模式"最匹配**：把角色/场景参考图 + 叙事提示词一起送给 Seedance 2.0。

### 启发 4：可插拔的供应商架构

Toonflow-app 的 Vendor 系统值得学习：

```
o_vendorConfig 表：存储供应商配置（API Key / 参数）
data/vendor/{id}.ts：每个供应商的调用代码（动态加载执行）
  export async function imageRequest(input, model) { ... }
  export async function videoRequest(input, model) { ... }
  export async function ttsRequest(input, model) { ... }
```

好处：
- 新增供应商不需要改核心代码，只需加一个 vendor 文件
- 统一接口（imageRequest/videoRequest），上层调用无感知
- 模型/供应商配置与代码分离

**我们现有的 config/models/ 体系**已具备模型配置能力，但缺少供应商调用的抽象层。

### 启发 5：Agent 记忆系统

Toonflow-app 的 Agent 有 RAG 记忆（基于 ONNX 本地 Embedding）：

- 短期记忆：近几轮对话
- 长期记忆：摘要 + 语义检索
- 跨阶段共享上下文

这解释了为什么它的 productionAgent 能在多步流程中保持一致性。我们的 CLI Agent 每次调用是独立的，上下文靠文件传递。

---

## 二.五、现有 Seedance Pipeline 优势分析（必须保留）

> 深入分析现有 CLI seedance 三阶段（director-skill / art-skill / storyboard-skill）和实际产出（造化之门 EP1），识别出**优于 Toonflow-app 的独有优势**。新方案中必须继承这些优势，避免"学到的反而替掉了自己更好的东西"。

### 优势 1：五层写法框架 ★★★

storyboard-skill 有内部五层思考结构，但**输出为连续叙事段落**（非结构化标签）：

```
L0 参考图声明 → L1 全局参数（风格/转场/音频/语言）
→ L2 场景（通过 @引用，最小化文字重复）
→ L3 蒙太奇动态叙事核心（秒级时间轴 + 景别/视角/运镜/动作/台词/光影）
→ L4 旁白嘴型规范（闭嘴/张嘴/翕动）
```

**对比 Toonflow-app**：输出是 XML 结构化标签（`<storyboardItem>`），读起来像技术文档，需要二次转换才能送 Seedance 2.0。

**我们的优势**：Seedance 2.0 消费的是自然语言，连续叙事风格**直接就是最终可用格式**。新方案中 C3 阶段必须保留此框架，明确标注"输出格式为连续叙事段落，禁止结构化标签"。

### 优势 2：去人化 + 柔化词系统 ★★★

这是针对 Seedance 2.0 平台审核机制的**独创规则体系**，Toonflow-app 完全没有（它面向多平台，无单平台审核优化）：

**去人化核心**：
- 所有角色参考图必须 AI 生成/手绘，禁止真人照片，禁止面部拼接
- 面部描写用"情绪动态变化"（如"表情从迷茫转为坚定"），禁止"静态写实细节"（如瞳孔颜色、肤质纹理、毛孔）

**柔化替换表**（零容忍执行）：
- 环境词：破旧→古朴，斑驳→简朴，逼仄→紧凑，死寂→静谧，残破→旧
- 表情词：冷汗→略带疲惫，惊恐→微微惊讶，颤抖→微紧张，猛然睁眼→缓缓睁眼
- 情绪词：绝望→迷茫，恐惧→不安，孤独→沉思，愤怒→不甘
- 密度限制：每条提示词负面词 ≤ 2 个；优先用"动态转变"替代"静态负面状态"

### 优势 3：精确时间轴系统 ★★

02-prompts.md 每条提示词有精确的秒级时间段（0-1s, 1-5s, 5-8s），最小精度 0.5s。

**Toonflow-app 的分镜面板**只有总时长（duration 字段），没有秒级时间轴拆分。我们的时间轴精度让 Seedance 2.0 能更精确地控制每个时间段的画面内容。

### 优势 4：嘴型规范体系 ★★

三种嘴型模式，直接影响视频生成中角色的嘴部自然度：

| 模式 | 嘴部状态 | 适用场景 |
|------|---------|---------|
| 旁白/画外音 | 闭嘴 | 配音叙述，画面中角色不说话 |
| 对话 | 张嘴说话 | 画面中角色正在说台词 |
| 独白/自语 | 翕动（微动） | 角色内心独白，后期配音标注 |

**Toonflow-app 没有嘴型规范**，视频中角色嘴部状态不可控。

### 优势 5：双层审核体系 ★★

每阶段两步审核（Toonflow-app 只有单层 supervision）：

1. **业务审核**：忠实度/画面还原/动作可执行/镜头可实现/Seedance友好/音频设计/情绪准确，7 维度 10 分制，≥8.0 通过
2. **合规审核**：Seedance 2.0 + Gemini 平台红线检查（真人肖像/版权IP/暴力/色情/歧视等），任一违规即 FAIL

### 优势 6：导演"讲戏"风格 ★

01-director.md 的叙事风格像舞台导演给演员说戏，五个维度交织在连续叙事中（画面内容/人物动作/台词声音/镜头感觉/光影氛围），创造沉浸式画面感。Toonflow-app 的 scriptPlan 是 XML 结构化输出，偏分析文档风格。

### 优势 7：跨集资产追踪 ★

导演分析（ep02+）自动做资产比对：**复用/变体/新增**三态标记。已有角色/场景不重复生成，只标注变化部分。Toonflow-app 无此机制。

### 优势 8：节拍密度 + 头尾安全区（已有！）★

director-skill 和 script-analysis-review-skill 中**已经包含**这些规则：
- 1 beat ≈ 2.5s（连续单镜内），每镜头拍密度与时长匹配
- 头尾各 0.5s 安全区，不放关键动作/台词起始点
- 审核 checklist 中有节拍密度和安全区检查项

> **注意**：方案文档 C2 分镜表中的节拍密度和安全区规则应标注为"从现有 skill 迁移"，而非"从 Toonflow-app 学习"。

---

## 三、分镜提示词质量对比

| 维度 | CLI seedance（02-prompts.md） | Toonflow-app（分镜面板） | 新方案取谁 |
|------|-------------------------------|------------------------|-----------|
| **叙事风格** | 电影级连贯叙事，读起来像小说 | 结构化字段拼接，偏技术描述 | ✅ CLI |
| **时间轴** | 精确到秒（0-1s/1-5s/5-8s） | 只有总时长，无秒级拆分 | ✅ CLI |
| **镜头语言** | 完整的运镜描述融入叙事 | 独立字段（景别+运镜） | ✅ CLI |
| **@参考图** | 融入叙事中自然引用 | @图N 标注前缀 | ✅ CLI |
| **连贯性** | 靠导演审核保证 | 系统化校验（人物位置/朝向铁律） | ✅ Toonflow |
| **中间层** | 无（直接写最终稿） | 有分镜表→面板两步 | ✅ Toonflow |
| **衍生资产** | 无 | 支持角色六层衍生/场景三维衍生 | ✅ Toonflow |
| **去人化规则** | 完整（AI生图/禁拼接/情绪动态描写） | 无 | ✅ CLI |
| **柔化词系统** | 完整（环境/表情/情绪三类替换表） | 无 | ✅ CLI |
| **嘴型规范** | 三种模式（闭嘴/张嘴/翕动） | 无 | ✅ CLI |
| **审核体系** | 双层（业务7维度+合规红线） | 单层 supervision | ✅ CLI |
| **朝向系统** | 有但不系统化 | 10方位标准表+180度线 | ✅ Toonflow |
| **首帧原则** | 无 | 描述准备姿态而非动作顶点 | ✅ Toonflow |
| **风格锚点词** | 有关键词但不系统化 | 锚点词+画质锁定+反向提示词 | ✅ Toonflow |
| **情绪面部映射** | 无标准表 | 9种情绪→面部/眼部映射 | ✅ Toonflow |

**结论**：

- CLI 的**单条提示词质量更高**（叙事感强、时间轴精确）+ **平台适配能力更强**（去人化、柔化词、嘴型、双层审核）
- Toonflow-app 的**流程方法论更好**（三步分镜、连贯性校验、衍生资产）+ **视觉规范更系统化**（朝向、首帧原则、风格锚点、情绪映射）
- **最优方案：CLI 的产出品质 + Toonflow-app 的方法论骨架，两者优势互补**

---

## 四、重构方案：融合两套最优

### 完整流水线总览

```
剧本（已有）
    |
    v
============================================
阶段 A：导演分析（保留，微调）
============================================
    输入：novels/{name}/scripts/episode-{N}.txt
    执行：seedance-director Agent
    产出：novels/{name}/seedance/ep{N}/01-director.md
          |-- 人物清单（含外貌/性格/服饰描述）
          |-- 场景清单（含空间/光影/氛围描述）
          |-- 情绪弧线
          +-- 镜头分组（粗粒度）
    审核：导演自审 + 合规审核
    |
    v
============================================
阶段 B：资产管理（重写，学 Toonflow-app）
============================================

  B1. 资产提取与结构化
      输入：01-director.md 的人物清单 + 场景清单
      产出：novels/{name}/seedance/assets.json（统一数据源，合并原 manifest.json）
      关键：给每个资产分配 ID，后续分镜表通过 ID 引用
      详细数据结构见"第五章 数据结构定义"

  B2. 图片提示词生成（学 Toonflow-app 模板体系）
      新增：skills/art-styles/{styleName}/ 美术风格模板目录
            |-- prefix.md             （全局风格前缀：色板/材质/硬约束）
            |-- art_character.md      （面容/肤感/发型/体型约束表）
            |-- art_scene.md          （构图/光影/材质约束）
            |-- art_prop.md           （道具描述规范）
            |-- art_character_derivative.md （角色姿势变体/服装切换模板）
            |-- art_scene_derivative.md    （场景时段/季节变体模板）
            +-- art_storyboard_video.md    （视频提示词风格约束）

      执行：AI 读取 assets.json 中的描述 + 对应美术模板 → 生成结构化图片提示词
      产出：更新 assets.json 中每个资产的 prompt 字段

  B3. 图片生成（可配置模型）
      复用现有 config/models/image/ 模型配置体系

      执行：遍历 assets.json，逐个/批量调用图片 API
      任务跟踪：写入 tasks.json（详细结构见"第五章"）
      产出：novels/{name}/seedance/images/{type}/{name}.png
            更新 assets.json 中对应资产的 state/imagePath/generatedAt 等字段

  B4. 衍生资产生成（新增，学 Toonflow-app 六层体系）
      输入：已生成的基础资产 + 剧本中的造型变化需求
      执行：使用 art_character_derivative.md / art_scene_derivative.md 模板

      ▸ 角色衍生：L0-L5 六层堆叠体系
        ┌────────────────────────────────────────────┐
        │ L0 底模（脸+体型）  — 永远不变，一致性锚点    │
        │ L1 妆面（素颜/淡妆/盛装）— 按剧情阶段切换    │
        │ L2 发型（散发/束发/盘发）— 按场景/身份切换    │
        │ L3 内衣（中衣/亵衣）    — 私密场景           │
        │ L4 外衣（常服/战甲/礼服）— 按剧情事件切换    │
        │ L5 配饰（头/耳/颈/腰/手）— 身份/仪式标识    │
        └────────────────────────────────────────────┘
        核心原则：
        - 面容锁定：所有衍生资产共享 L0，面部特征不可偏移
        - 逐层可控：只变需要变的层，其余层保持一致
        - parentId 关联：衍生资产链接主资产
        - 同一父资产在同一分镜中禁止主/衍生同时出现

      ▸ 场景衍生：三维度体系
        - 景别变体（远景/全景/中景/近景/特写）— 最常用！同场景不同景别需不同参考图
        - 时段变体（晨/午/暮/月夜/灯火夜）
        - 天气变体（晴/阴/薄雾/细雨/飘雪）

      产出：衍生资产图片，更新 assets.json（parentId + derivativeType + derivativeLayer）
    |
    v
============================================
阶段 C：分镜制作（融合两套最优，三步走）
============================================

  C1. 导演规划（新增，学 Toonflow-app 六维度 + 保留讲戏风格）
      输入：01-director.md + assets.json
      执行：使用 director_planning_style.md 模板（含美术风格约束）
      产出：novels/{name}/seedance/ep{N}/director-plan.json
      作用：在分镜表之前，从导演视角规划全集六维结构

      ▸ 六维度规划（学 Toonflow-app，原三维扩展为六维）：
        维度1 — 主题与叙事核心：全集情感主线、观众带走什么
        维度2 — 视觉风格基调（新增，最有价值！）：
                 情绪色彩方案（7种）：
                 | 方案 | 色彩 | 适用场景 |
                 | 暖光淡彩 | 琥珀金+米白 | 温情/回忆 |
                 | 青绿含蓄 | 青绿+水墨灰 | 沉静/隐忍 |
                 | 柔暖暗影 | 朱红+赭石 | 暧昧/情愫 |
                 | 冷肃杀色 | 靛蓝+银白 | 紧张/对峙 |
                 | 窗纱漫透 | 月白+藤黄 | 闺中/思念 |
                 | 月华清冷 | 银蓝+墨色 | 夜戏/独白 |
                 | 喜庆暖光 | 朱红+金黄 | 庆典/团圆 |
                 光线方案（A-G）：对应不同情绪段落的光源/色温/明暗设计
        维度3 — 叙事结构与节奏：场景分组 + 情绪曲线（保留原有）
        维度4 — 逐场景情绪意图（新增）：每场景的导演意图、观众距离设计
        维度5 — 声音与音乐方向（新增）：BGM选择、音效设计、静默运用
        维度6 — 转场与视觉连贯：场景切换方式、位置锁定（扩展原 turningPoints）

      ▸ 保留 CLI 优势：讲戏风格叙事（非 XML 结构化输出）

  C2. 构建分镜表（学 Toonflow-app 结构化中间层 + 迁移 CLI 已有规则）
      输入：director-plan.json + assets.json
      产出：novels/{name}/seedance/ep{N}/storyboard-table.json（纯 JSON）

      分镜表字段（12 列 + trackId），详细结构见"第五章"

      ▸ 基础约束规则（学 Toonflow-app）：
      - 台词原文锁定（禁止改写，一字不改照搬剧本）
      - 视觉连续性逐行校验（动作终态→下一镜起始）
      - 定场精简（同场景最多 1-2 镜定场，禁止三段式冗余）
      - 黄金 6 秒（无台词镜头 ≤ 6s）
      - 角色出现即引用资产 ID（含局部出现：背影/手部/虚化剪影）
      - 场景资产必选（每条分镜必须引用场景资产 ID）

      ▸ 10 方位精确朝向系统（学 Toonflow-app，替代粗糙的"左/中/右"）：
      action 字段末尾必须标注朝向：`｜朝向：角色A-面朝右; 角色B-面朝左`

      | 朝向取值 | 含义 | 典型场景 |
      |---------|------|---------|
      | 面朝右/面朝左 | 水平朝向 | 180度线两侧角色 |
      | 正面 | 正对镜头 | 自白、宣言、直视观众 |
      | 3/4正面朝右/左 | 3/4侧面偏向镜头 | 对话主体 |
      | 正侧面朝右/左 | 正侧面轮廓 | 独白、沉思 |
      | 3/4背面朝右/左 | 3/4侧背面 | 疏离、离去 |
      | 背面 | 背对镜头 | 神秘登场、离别、遥望 |
      可叠加俯仰修饰：`面朝右微仰头`、`3/4正面朝左微低头`
      规则：同场景内遵循 180 度视轴线不得跳轴，朝向变化必须有动作衔接

      ▸ 台词时长精确公式（增强原"语速×字数+1s"）：
      - 情绪语速：愤怒~4字/s、正常~3字/s、悲伤/低语~2字/s
      - 标点停顿：每个逗号/句号/省略号 +0.3~0.5s
      - 情绪转折/语气变化处 +0.5s
      - 最终 duration = 基础秒数 + 停顿累计 + 1s 安全余量（向上取整）

      ▸ 从现有 CLI skill 迁移的规则（非学 Toonflow-app）：
      - 节拍密度（1 beat ≈ 2.5s）：2-3s 镜头最多 1 拍，4-6s 最多 2 拍，7s+ 最多 3 拍
      - 头尾安全区：每镜前后 0.5s 不放关键动作/台词起始点

      ▸ 新增规则（学 Toonflow-app）：
      - 一镜到底策略：角色行走穿越空间/跟随动作/环绕展示时可合并为长镜头
        · 突破 6s 上限但不超过 12s
        · cameraMove 标注运镜路径：`一镜到底：缓推远景→跟移至院内→落幅全景`
        · 风险提示：提高视频生成抽卡难度，仅在叙事流畅性收益明显时使用
      - 信息控制意识：每镜考虑"观众此刻知道什么"
        · 给手不给脸=悬念；先声后画=期待；只给背影=疏离；全貌揭示=高潮兑现
      - 转场规则：
        · 同场戏内：默认硬切
        · 跨场景：插 1 个空镜分镜（2-3s）做情绪缓冲
        · 跨段落：可在 description 中标注"叠化过渡"或"淡入淡出"
        · 禁用花式转场（划屏/旋转/百叶窗等）
      - Track 分组：分镜按 15s 累计上限分组为 Track，切换点优先选在场景切换处

      **Track 级视频生成**：
      C3 提示词按 Track 生成（非按 shot），每个 Track 对应一条提示词和一次 Seedance 2.0 API 调用。
      参考 Toonflow-app 的 generateVideoPrompt 机制：LLM 将 Track 内多条 shot 的分镜数据合成为一段连贯的视觉叙事。
      Track 视频时长 = round(组内 shot duration 之和) → 整数秒 [4-15]。

      参考技法：skills/shared/storyboard-table-techniques.md

  C3. 生成分镜面板 / Seedance 2.0 提示词（保留 CLI 全部优势 + 精准增强）
      输入：storyboard-table.json + assets.json + 生成的图片 + art_storyboard_video.md
      产出：novels/{name}/seedance/ep{N}/02-prompts.md

      ▸ 保留的 CLI 独有优势（禁止被 Toonflow-app 方式替代）：
      - 五层写法框架：L0参考图声明→L1全局参数→L2场景@引用→L3蒙太奇叙事→L4嘴型
      - 输出格式为连续叙事段落，禁止结构化标签/XML
      - 精确时间轴（0-1s/1-5s/5-8s），最小精度 0.5s
      - 电影级叙事风格，Seedance 2.0 直接消费
      - 去人化规则：AI生图/禁拼接/情绪动态描写（非静态写实）
      - 柔化词系统：环境/表情/情绪三类替换表 + 每条负面词≤2个
      - 嘴型规范：旁白闭嘴/对话张嘴/独白翕动
      - @图片编号每条提示词内从 @图片1 重新开始（非全局累计）

      ▸ 新增的 Toonflow-app 增量（补充 CLI 缺失的规则）：

      1. 视频首帧原则（最重要！）：
         提示词描述的是动作的**准备姿态**（起始 1/3），而非动作顶点
         ✗ 错误："叶真挥剑斩出一道剑气" → 第一帧渲染成已斩完状态
         ✓ 正确："叶真持剑于身侧，剑尖微抬蓄力" → 准备状态，模型自行补完动作

      2. 风格锚点词 + 画质锁定词 + 反向提示词：
         - 风格锚点（每条必含）：如 `国风3D渲染，PBR材质，体积光，东方美学，典雅大气，电影风格`
         - 画质锁定：`best quality, masterpiece, 8k`（或中文等价）
         - 反向提示词模板：`low quality, blurry, deformed, extra limbs, watermark, text`
         - 注意：柔化词系统已承担部分"反向"功能，两者互补不冲突

      3. 情绪→面部/眼部映射表（引用 emotion_face_mapping.md）：
         | 情绪 | 面部特征 | 眼部特征 |
         | 隐忍 | 唇紧抿、下颌微收 | 眼神沉稳、微微眯眼 |
         | 愤怒 | 眉头紧蹙、嘴角下沉 | 目光凌厉 |
         | 悲伤 | 眉尾下垂、唇角微颤 | 眼神涣散 |
         | 温柔 | 唇角微扬、面部放松 | 目光柔和、略带笑意 |
         | 惊愕 | 嘴唇微张 | 眼睛圆睁 |
         | 冷傲 | 下巴微抬、唇角微挑 | 目光下视、眼神疏离 |
         | 决绝 | 嘴唇紧抿成线 | 目光坚定前视 |
         | 迷茫 | 嘴微张、面部松弛 | 眼神失焦、目光游移 |
         | 释然 | 嘴角自然上扬 | 目光温润、微眯 |
         ※ 此表需过柔化词过滤——触发审核的描述提供柔化替代版

      4. 10 方位人物位置预分析（每条提示词写作前）：
         - 分析画面中每个角色的位置（画面左/中/右）+ 精确朝向（10方位）
         - 参照分镜表 action 字段的朝向标注
         - 镜像/反射规则：水面/镜子反射时朝向翻转

      5. @资产引用强绑定：
         - 格式：`@图N（素材表@图M-名称）`
         - 引用顺序：先角色后场景后道具
         - 角色出现即引用（含背影/手部/虚化剪影）
         - 场景资产必选（每条提示词必须有场景资产引用）
         - 场景独立性：宫格图裁切后每个单格 = 1个 @图片（非整张宫格 = 1个）

      6. Track 分组：按分镜表 trackId 组织提示词输出顺序

      参考技法：skills/shared/storyboard-prompt-techniques.md
      审核：Seedance 提示词审核 + 合规审核
    |
    v
============================================
阶段 D：视频生成（新增）
============================================

  D1. Track 视频生成
      输入：02-prompts.md 中每个 Track 级提示词 + 对应参考图（角色图+场景图）
      API：Seedance 2.0 multiReference 模式
            参数：prompt + referenceImages(最多9张) + duration + resolution

      执行流程：
        1. 解析 02-prompts.md，拆分为独立的 T01/T02/T03... Track 级提示词
        2. 每个 Track 提示词对应一次 Seedance 2.0 API 调用
        3. duration = round(Track 内所有 shot 的 duration 之和) → 整数秒
        4. 创建 TaskRecord 写入 tasks.json
        5. 轮询获取结果
        6. 下载保存到 novels/{name}/seedance/ep{N}/videos/T{NN}.mp4

      产出：每个 Track 一个视频（4-15 秒整数秒），novels/{name}/seedance/ep{N}/videos/T{NN}.mp4

  D2. 轨道组装（后续规划）
      将所有 P{N}.mp4 按顺序拼接 → 单集漫剧视频
      可选：加入转场、字幕、BGM
      工具：FFmpeg 或其他视频编辑工具
```

---

## 五、数据结构定义

> 本章定义所有新增/修改的数据文件的完整 TypeScript 接口，供 CLI Agent 和 Web 端共用。

### 5.1 assets.json — 统一资产数据源

**合并原 assets.json + manifest.json**，每个资产包含"定义层"和"生成层"所有字段。

存储位置：`novels/{name}/seedance/assets.json`

```typescript
interface SeedanceAsset {
  // === 标识 ===
  id: string;                    // 格式："char-001" | "scene-001" | "prop-001"
  name: string;                  // 资产名称，如 "叶真"、"山门广场"
  type: "character" | "scene" | "prop";

  // === 描述层（来自导演分析 01-director.md） ===
  description: string;           // 完整文字描述（外貌/性格/服饰 或 空间/光影/氛围）
  identityAnchor?: string[];     // 角色资产必填（3~5个核心视觉关键词），场景/道具可选
                                 // 用途：分镜提示词中角色每次出现时强制复用，保证跨镜一致性
                                 // 示例：["银发束冠少年", "白色长袍金边", "腰佩青锋剑"]
                                 // 禁止包含：情绪词、动作词、场景相关词
  prompt: string;                // AI 图片生成提示词（由美术模板 + 描述生成）
  artStyle: string;              // 引用的美术风格 ID，如 "3d-guoman"

  // === 生成层（来自图片 API 调用结果） ===
  state: "pending" | "generating" | "success" | "failed";
  imagePath: string;             // 相对路径，如 "images/characters/叶真.png"
  generatedAt: string;           // ISO 时间，如 "2026-04-08T14:16:00.000Z"
  apiTaskId: string;             // 远程 API 任务 ID，用于轮询
  error?: string;                // 失败原因

  // === 供应商层 ===
  modelId: string;               // 使用的模型 ID，如 "doubao-seedance-4-5"
  resolution: string;            // 分辨率，如 "1K"、"2K"

  // === 关联层 ===
  sourceEpisode: string;         // 首次出现的集，如 "ep01"
  episodeRefs: string[];         // 所有引用该资产的集，如 ["ep01", "ep02"]
  parentId?: string;             // 衍生资产的父资产 ID（用于角色多姿势、场景变体等）
  childIds?: string[];           // 子资产 ID 列表
  derivativeType?:               // 衍生类型枚举
    // 角色衍生（L0-L5 六层体系）
    | "makeup"                   // L1 妆面变体（素颜/淡妆/盛装）
    | "hairstyle"                // L2 发型变体（散发/束发/盘发）
    | "underwear"                // L3 内衣变体
    | "outerwear"                // L4 外衣变体（常服/战甲/礼服）
    | "accessory"                // L5 配饰变体
    | "pose"                     // 姿势变体
    | "emotion"                  // 表情变体
    // 场景衍生（三维度体系）
    | "shotSize"                 // 景别变体（远景/全景/中景/近景/特写）
    | "timeOfDay"                // 时段变体（晨/午/暮/月夜/灯火夜）
    | "weather";                 // 天气变体（晴/阴/薄雾/细雨/飘雪）
  derivativeLayer?: "L0" | "L1" | "L2" | "L3" | "L4" | "L5";  // 角色衍生层级标识

  // === 元数据 ===
  createdAt: string;             // 资产创建时间
  updatedAt: string;             // 最后更新时间
}

// assets.json 文件格式
type AssetsFile = SeedanceAsset[];
```

**与原 manifest.json 的映射关系**：

| 原 manifest.json 字段 | 新 assets.json 字段 |
|----------------------|-------------------|
| `characters.{name}.state` | `state` |
| `characters.{name}.path` | `imagePath` |
| `characters.{name}.sourceEpisode` | `sourceEpisode` |
| `characters.{name}.promptSnippet` | `prompt` |
| `characters.{name}.generatedAt` | `generatedAt` |
| `characters.{name}.apiTaskId` | `apiTaskId` |
| `scenes.{name}.reusedIn` | `episodeRefs` |

### 5.2 tasks.json — 异步任务队列

存储位置：`novels/{name}/seedance/tasks.json`

```typescript
interface TaskRecord {
  taskId: string;                // 本地任务 ID，UUID 格式
  type: "image" | "video";      // 任务类型
  assetId?: string;              // 关联资产 ID（图片生成时）
  promptId?: string;             // 关联分镜 ID，如 "P01"（视频生成时）
  episode?: string;              // 关联集数，如 "ep01"

  // === 状态 ===
  state: "queued" | "submitted" | "running" | "success" | "failed";
  apiTaskId?: string;            // 远程 API 任务 ID
  progress?: number;             // 进度百分比（0-100），部分 API 支持

  // === 供应商 ===
  modelId: string;               // 使用的模型 ID
  resolution?: string;

  // === 时间 ===
  createdAt: string;             // 任务创建时间
  submittedAt?: string;          // 提交到 API 的时间
  completedAt?: string;          // 完成时间

  // === 结果 ===
  resultPath?: string;           // 产出文件的相对路径
  error?: string;                // 失败原因
  retryCount: number;            // 已重试次数（默认 0）
}

// tasks.json 文件格式
type TasksFile = TaskRecord[];
```

**任务生命周期**：

```
queued → submitted → running → success
                            → failed（可重试，retryCount++）
```

**并发控制策略**：

- 图片生成：最多 5 个任务并发
- 视频生成：最多 3 个任务并发（API 成本更高）
- 失败自动重试：最多 2 次

### 5.3 director-plan.json — 导演规划（新增）

存储位置：`novels/{name}/seedance/ep{N}/director-plan.json`

```typescript
interface DirectorPlan {
  episode: string;               // 集数标识，如 "ep01"

  // === 维度1：主题与叙事核心（新增） ===
  themeCore: {
    emotionalArc: string;        // 全集情感主线，如 "从迷茫到觉醒"
    viewerTakeaway: string;      // 观众带走什么，如 "即使渺小也要挣扎向上"
  };

  // === 维度2：视觉风格基调（新增，最有价值！） ===
  visualStyle: {
    colorPalette: string;        // 情绪色彩方案，如 "青绿含蓄"
    lightingPlan: string;        // 光线方案（A-G），如 "方案B：侧逆光+冷色温"
    compositionStyle: string;    // 构图风格，如 "留白写意/对称庄重/不对称张力"
    textureDirection: string;    // 材质方向，如 "3D渲染+PBR材质+体积光+景深"
  };

  // === 维度3：叙事结构与节奏（保留原有） ===
  sceneGroups: {
    sceneId: string;             // 关联 assets.json 中的场景 ID
    sceneName: string;
    shots: number[];             // 包含的分镜序号
    mood: string;                // 场景整体情绪
    lightingKey: string;         // 主光调
    colorScheme: string;         // 该场景使用的情绪色彩方案
  }[];

  rhythm: {
    act: "opening" | "rising" | "climax" | "falling" | "ending";
    shotRange: [number, number]; // 分镜范围，如 [1, 5]
    pacing: "slow" | "medium" | "fast";
    note: string;                // 导演意图说明
  }[];

  // === 维度4：逐场景情绪意图（新增） ===
  sceneIntents: {
    sceneId: string;             // 关联场景 ID
    directorNote: string;        // 导演意图，如 "让观众感受到主角的不甘，但又被现实压制"
    audienceDistance: string;    // 观众距离设计，如 "旁观者/共情者/窥视者"
  }[];

  // === 维度5：声音与音乐方向（新增） ===
  soundDesign: {
    bgmDirection: string;        // 如 "古琴为主，紧张段落加入鼓点"
    keyEffects: string[];        // 关键音效，如 ["剑鸣声", "风声呼啸", "脚步声"]
    silenceUsage: string;        // 静默运用，如 "对峙高潮前1s完全静音以强化张力"
  };

  // === 维度6：转场与视觉连贯（扩展原 turningPoints） ===
  turningPoints: {
    afterShot: number;           // 在哪一镜之后
    type: "emotional" | "plot" | "visual";
    description: string;
  }[];

  transitions: {
    fromScene: string;           // 前一场景名
    toScene: string;             // 后一场景名
    method: string;              // 切换方式，如 "空镜过渡/叠化/硬切"
    emotionBridge: string;       // 情绪衔接说明
  }[];
}
```

### 5.4 storyboard-table.json — 结构化分镜表

存储位置：`novels/{name}/seedance/ep{N}/storyboard-table.json`

```typescript
interface StoryboardRow {
  seq: number;                   // 分镜序号，从 1 开始
  description: string;           // 画面描述（15-50字，含前景/中景/背景至少两层空间层次）
  scene: string;                 // 场景名称
  assetIds: string[];            // 关联资产 ID 数组，如 ["char-001", "scene-001"]
                                 // 规则：角色出现即引用（含局部）；场景资产必选；
                                 // 父子资产选择：按剧情状态选衍生ID，禁止主/衍生同时出现
  duration: number;              // 时长（秒），台词时长=字数÷情绪语速+停顿+1s余量
  shotType: string;              // 景别：大远景/远景/全景/中景/近景/特写/大特写
                                 // 景别递进法则：相邻跨度不超两级，禁止连续3镜同景别
  cameraMove: string;            // 运镜：静止/推/拉/摇/移/俯拍/仰拍
                                 // 一镜到底标注：`一镜到底：缓推远景→跟移至院内→落幅全景`
  action: string;                // 角色动作链（含速度节奏）+ 末尾必须标注朝向
                                 // 格式：`缓缓抬手→猛然握拳｜朝向：叶真-面朝右; 萧炎-面朝左`
                                 // 朝向10方位：面朝右/左、正面、3/4正面朝右/左、正侧面朝右/左、
                                 //            3/4背面朝右/左、背面（可叠加俯仰修饰）
  emotion: string;               // 情绪：用具象可感描述，如"冷傲轻蔑""痛苦绝望"，禁止"开心""难过"
  lighting: string;              // 光影：必含光源方向+色调倾向+明暗关系
                                 // 如"右侧冷白光斜射，面部明暗对半，背景深沉"
  dialogue: string;              // 台词原文（禁止改写，一字不改照搬剧本），无台词填"无台词"
  soundEffect: string;           // 按「环境音层+动作音层」分层，如"远处风声呼啸+剑鸣声"
  trackId: number;               // Track 分组 ID（15s 累计上限，场景切换处优先切分）

  // === 视频生成状态（阶段 D 使用） ===
  videoState?: "pending" | "generating" | "success" | "failed";
  videoPath?: string;            // 生成的视频文件路径
  videoTaskId?: string;          // 关联的 tasks.json 中的 taskId
}

// storyboard-table.json 文件格式
interface StoryboardTable {
  episode: string;               // 集数标识，如 "ep01"
  totalDuration: number;         // 总时长（秒）
  rows: StoryboardRow[];
}
```

**为什么只存 JSON 不存 Markdown**：

1. JSON 是程序原生格式，便于校验和操作
2. CLI Agent（LLM）输出 JSON 比完美对齐的 Markdown 表格更可靠
3. 不需要维护两份数据的同步

---

## 六、美术模板体系设计

> 学习 Toonflow-app 的模板体系，建立我们自己的约束框架。

### 6.1 目录结构

```
skills/art-styles/{styleName}/
|-- prefix.md                      # 全局风格前缀（色板/材质/硬约束/软约束/禁止项）
|-- art_character.md               # 角色基础模板（面容约束/体型/服饰基调/四视图设定规范）
|-- art_scene.md                   # 场景基础模板（构图/光影/空间规范/四视图设定规范）
|-- art_prop.md                    # 道具基础模板（材质/形状/比例/多角度设定规范）
|-- art_character_derivative.md    # 角色衍生模板（L0-L5 六层堆叠体系）
|-- art_scene_derivative.md        # 场景衍生模板（景别/时段/天气三维度衍生）
|-- art_prop_derivative.md         # 道具衍生模板（使用状态/损毁状态）
|-- art_storyboard_video.md        # 视频提示词风格模板（风格锚点词/画质锁定词/反向提示词/情绪面部映射）
|-- director_planning_style.md     # 导演规划风格约束（情绪色彩方案/光线方案/古乐选择/环境声）
+-- director_storyboard_style.md   # 分镜表风格约束（光影统一/古风动作节奏/运镜禁区）
```

### 6.2 prefix.md 结构（学 Toonflow-app）

```markdown
## 风格定义
{整体视觉风格描述}

## 色板
- 主色：{hex} — {用途}
- 辅色：{hex} — {用途}
- 强调色：{hex} — {用途}

## 硬约束（必须遵守）
- {如：所有角色皮肤色调统一为暖黄}
- {如：禁止使用纯黑阴影}

## 软约束（优先遵守）
- {如：场景优先使用暖色调}
- {如：道具边缘保持柔和过渡}

## 材质规范
- 皮肤：{材质描述}
- 头发：{材质描述}
- 服饰：{材质描述}
- 环境：{材质描述}
```

### 6.3 关键模板增强说明

**art_character.md — 四视图设定图规范**（现有 art-skill 已有左半脸部+右半三视图，需标准化）：
- 输出格式：左半 50%（面部特写）+ 右半 50%（正面/侧面/背面三个全身）
- 白色纯净背景，8K 分辨率
- 包含：核心气质、造型细节（发型/体型/服饰/鞋履/姿态）、画面技术（UE5/PBR/轮廓光）

**art_character_derivative.md — L0-L5 六层堆叠规则**：
- L0 面容锁定：所有衍生共享底模面部，不可偏移
- L1-L5 逐层可控：只变需要变的层，其余层维持一致
- 四视图设定：衍生资产同样需要四视图
- 服饰组合速查表：按剧情阶段（日常/战斗/仪式/私密）推荐默认搭配

**art_scene_derivative.md — 三维度衍生**：
- 景别维度：远景/全景/中景/近景/特写各一版（最常用！同场景不同景别需不同参考图）
- 时段维度：晨/午/暮/月夜/灯火夜各一版
- 天气维度：晴/阴/薄雾/细雨/飘雪各一版
- 可灵活组合：不需要穷尽所有组合，按剧本实际需求生成

**art_storyboard_video.md — 视频提示词三组约束词**：
- 风格锚点词（每条必含）：如 `国风3D渲染，PBR材质，体积光，东方美学，典雅大气，电影风格`
- 画质锁定词：`best quality, masterpiece, 8k`（或中文等价）
- 反向提示词模板：`low quality, blurry, deformed, extra limbs, watermark, text`
- 情绪→面部/眼部映射表（9种情绪，含柔化版本）
- 注意：与 CLI 柔化词系统互补，不冲突

**director_planning_style.md — 导演规划风格约束**（新增，学 Toonflow-app）：
- 7 种情绪色彩方案（暖光淡彩/青绿含蓄/柔暖暗影/冷肃杀色/窗纱漫透/月华清冷/喜庆暖光）
- 7 种光线方案（A-G，对应不同情绪段落）
- 古乐器选择策略（竹笛/二胡/唢呐/古琴/琵琶/古筝及组合）
- 古风环境声库（蝉鸣/流水/竹风/市井/雨打屋檐/衣料摩擦/风铃/鸟鸣/落花）

### 6.4 模板加载机制

```
AI 收到资产描述
    → 读取 prefix.md（全局风格）
    → 读取对应类型模板（art_character.md / art_scene.md / art_prop.md）
    → 如果是衍生资产，额外读取 derivative 模板
    → 如果是视频提示词，额外读取 art_storyboard_video.md
    → 如果是导演规划，额外读取 director_planning_style.md
    → 如果是分镜表，额外读取 director_storyboard_style.md
    → 组合：prefix + 类型模板 + 资产描述 → 生成最终提示词
```

### 6.5 首批风格

先建立 1 套风格用于验证（后续可扩展）：

- `3d-guoman` — 3D 国漫风格（对标 Toonflow-app 的 `3D_chinese_traditional`）

---

## 七、制作技法文档

> 学习 Toonflow-app 的 production_skills，建立分镜制作规范。

### 7.1 目录结构

```
skills/seedance-storyboard-table/
|-- storyboard_table_techniques.md    # 分镜表设计规范
skills/seedance-storyboard-skill/
|-- storyboard_prompt_techniques.md   # 分镜提示词写作规范
+-- emotion_face_mapping.md           # 情绪→面部/眼部映射表（含柔化版本）
```

### 7.2 storyboard_table_techniques.md 核心规则

**基础规则（学 Toonflow-app）**：

1. **台词原文锁定** — 一字不改照搬剧本，多角色按 `角色名：台词` 格式
2. **台词-时长精确公式** — 基础秒数=字数÷情绪语速（愤怒4字/s、正常3字/s、悲伤2字/s）+标点停顿(逗号/句号+0.3-0.5s)+情绪转折(+0.5s)+1s安全余量
3. **景别衔接规则** — 相邻跨度不超两级，禁止连续 3 镜以上同景别
4. **动作连续性** — 上一镜动作终态 = 下一镜起始状态，首镜写"开篇"
5. **定场精简** — 同场景最多 1-2 镜定场，禁止三段式冗余（环境空镜→局部→人物到达）
6. **黄金 6 秒** — 无台词镜头 ≤ 6s（一镜到底例外，≤ 12s）
7. **资产强绑定** — 角色出现即引用（含局部），场景资产必选

**10 方位朝向系统（学 Toonflow-app，核心增量）**：

action 字段末尾必须标注：`｜朝向：角色A-面朝右; 角色B-面朝左`

| 朝向取值 | 含义 | 典型场景 |
|---------|------|---------|
| 面朝右 / 面朝左 | 水平面朝画面右/左侧 | 180度线两侧角色 |
| 正面 | 正对镜头 | 自白、宣言、直视观众 |
| 3/4正面朝右 / 朝左 | 3/4侧面偏向镜头 | 对话主体 |
| 正侧面朝右 / 朝左 | 正侧面轮廓 | 独白、沉思 |
| 3/4背面朝右 / 朝左 | 3/4侧背面 | 疏离、离去 |
| 背面 | 背对镜头 | 神秘登场、离别、遥望 |

可叠加俯仰：`面朝右微仰头`、`3/4正面朝左微低头`
铁律：同场景遵循 180 度视轴线，朝向变化必须有动作衔接

**从现有 CLI skill 迁移的规则**：

8. **节拍密度** — 1 beat ≈ 2.5s，2-3s 最多 1 拍，4-6s 最多 2 拍，7s+ 最多 3 拍
9. **头尾安全区** — 每镜前后 0.5s 不放关键动作/台词起始点

**新增规则（学 Toonflow-app）**：

10. **一镜到底策略** — 适用于角色穿越空间/跟随动作/环绕展示，突破 6s 但 ≤ 12s，cameraMove 标注完整路径，风险提示：提高抽卡难度
11. **信息控制意识** — 给手不给脸=悬念；先声后画=期待；只给背影=疏离；全貌揭示=高潮兑现
12. **转场规则** — 同场硬切/跨场景插空镜(2-3s)/跨段落叠化或淡入淡出/禁用花式转场
13. **Track 分组** — 15s 累计上限分组，场景切换处优先切分

### 7.3 storyboard_prompt_techniques.md 核心规则

**首要规则（保留 CLI 独有优势）**：

1. **去人化规则**（零容忍）— AI 生图/禁拼接/面部描写用情绪动态而非静态写实
2. **柔化词系统** — 环境/表情/情绪三类替换表，每条负面词 ≤ 2个
3. **五层写法框架** — L0参考图声明→L1全局参数→L2场景→L3蒙太奇→L4嘴型，输出为连续叙事段落
4. **嘴型规范** — 旁白闭嘴/对话张嘴/独白翕动
5. **精确时间轴** — 0.5s 最小精度，所有画面内容必须落在时间段内

**新增规则（学 Toonflow-app）**：

6. **视频首帧原则**（最重要新增！）— 描述动作的准备姿态（起始 1/3），非动作顶点。让视频模型自行补完后续动作
7. **风格锚点词** — 每条提示词必含风格锚点（如"国风3D渲染，PBR材质，体积光"）
8. **画质锁定词 + 反向提示词** — 正向锁定 + 反向模板，与柔化词系统互补
9. **情绪→面部映射** — 引用 emotion_face_mapping.md，将抽象情绪转为具体面部描写
10. **@资产强绑定** — `@图N（素材表@图M-名称）`格式，编号每条内从1开始，引用顺序角色>场景>道具
11. **10 方位人物位置预分析** — 每条写作前分析画面位置+精确朝向，镜像/反射时朝向翻转

**通用规则（保留+增强）**：

12. **构图描述** — 明确前景/中景/背景至少两层空间层次
13. **光影描述** — 必含光源方向+色调倾向+明暗关系（禁止只写"柔光""暗调"）
14. **动作描述** — 动词+方向+幅度+速度节奏（如"缓缓抬起右手→指尖微颤→猛然握拳"）
15. **情绪视觉化** — 情绪用视觉元素+面部映射表达
16. **运镜与叙事统一** — 运镜服务叙事节奏

### 7.4 emotion_face_mapping.md — 情绪面部映射表（新增）

| 情绪 | 面部特征 | 眼部特征 | 柔化版（触发审核时替代） |
|------|---------|---------|----------------------|
| 隐忍 | 唇紧抿、下颌微收 | 眼神沉稳、微微眯眼 | — |
| 愤怒 | 眉头紧蹙、嘴角下沉 | 目光凌厉 | 眉头微蹙、神情严肃 / 目光锐利 |
| 悲伤 | 眉尾下垂、唇角微颤 | 眼神涣散 | 眉眼低垂、神情黯然 / 目光迷离 |
| 温柔 | 唇角微扬、面部放松 | 目光柔和、略带笑意 | — |
| 惊愕 | 嘴唇微张 | 眼睛圆睁 | 嘴唇微张 / 眼神微亮（避免"瞳孔放大"） |
| 冷傲 | 下巴微抬、唇角微挑 | 目光下视、眼神疏离 | — |
| 决绝 | 嘴唇紧抿成线 | 目光坚定前视 | — |
| 迷茫 | 嘴微张、面部松弛 | 眼神失焦、目光游移 | — |
| 释然 | 嘴角自然上扬、眉眼舒展 | 目光温润、微眯 | — |

> 标注"—"的表示无柔化风险，可直接使用。其余需根据 Seedance 2.0 审核反馈动态调整。

---

## 八、最终产出目录结构

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
        |-- director-plan.json            # [新] 导演规划
        |-- storyboard-table.json         # [新] 结构化分镜表（纯 JSON）
        |-- 02-prompts.md                 # Seedance 2.0 提示词（保留+增强）
        +-- videos/                       # [新] 生成的视频
            |-- P01.mp4
            |-- P02.mp4
            +-- ...

config/
|-- art-styles/                           # [新] 美术风格模板
|   +-- 3d-guoman/
|       |-- prefix.md                     # 全局风格（色板/材质/硬约束/禁止项）
|       |-- art_character.md              # 角色基础（面容/体型/四视图设定）
|       |-- art_scene.md                  # 场景基础（构图/光影/四视图设定）
|       |-- art_prop.md                   # 道具基础（材质/形状/多角度设定）
|       |-- art_character_derivative.md   # 角色衍生（L0-L5 六层堆叠体系）
|       |-- art_scene_derivative.md       # 场景衍生（景别/时段/天气三维度）
|       |-- art_prop_derivative.md        # 道具衍生
|       |-- art_storyboard_video.md       # 视频提示词（锚点词/画质/反向/情绪映射）
|       |-- director_planning_style.md    # [新] 导演规划风格（色彩方案/光线方案/古乐/环境声）
|       +-- director_storyboard_style.md  # [新] 分镜表风格（光影/动作节奏/运镜禁区）
|-- production-skills/                    # [新] 制作技法
|   |-- storyboard_table_techniques.md    # 分镜表规范（含朝向/一镜到底/转场等）
|   |-- storyboard_prompt_techniques.md   # 提示词规范（含首帧原则/去人化/柔化等）
|   +-- emotion_face_mapping.md           # [新] 情绪→面部映射表（含柔化版本）
+-- models/                              # 已有，模型配置
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

## 九、废弃与保留清单

### 废弃组件

| 废弃组件 | 原功能 | 替代方案 |
|---------|--------|---------|
| seedance-art-skill | 自由发挥写角色/场景提示词 | 阶段 B：美术模板 + 结构化资产 |
| seedance-image skill | 直接调 Banana API | 阶段 B3：可配置模型的图片生成 |
| character-prompts.md | 独立的角色提示词文件 | assets.json 中的 prompt 字段 |
| scene-prompts.md（宫格/裁切/多视角） | 三步串行场景图生成 | 直接生成 + 多参考图一致性 |
| manifest.json | 独立的生成记录文件 | 合并入 assets.json |

### 保留并增强

| 保留组件 | 增强点 | 保留原因 |
|---------|-------|---------|
| seedance-director (01-director.md) | 输出格式对齐 assets.json + 六维度导演规划 | 讲戏风格优于 Toonflow-app 的 XML 输出 |
| seedance-storyboard (02-prompts.md) | 增加分镜表+导演规划中间层，增加位置/朝向校验 | 五层写法框架直接可用于 Seedance 2.0 |
| config/models/ | 扩展支持语言 / 图像 / 视频模型配置；运行时由用户当前选择传入 | — |
| 两步审核（业务+合规） | 不变 | Toonflow-app 只有单层 supervision |

### 自有优势（新方案中必须继承，禁止被替代）

| 原有流程优势 | 说明 | Toonflow-app 是否有 |
|-------------|------|-------------------|
| 五层写法框架 | L0-L4 内部结构，输出为连续叙事段落 | ✗（XML 标签输出） |
| 去人化规则 | AI生图/禁拼接/情绪动态描写 | ✗ |
| 柔化词系统 | 环境/表情/情绪三类替换表，负面词≤2/条 | ✗ |
| 嘴型规范 | 旁白闭嘴/对话张嘴/独白翕动 | ✗ |
| 精确时间轴 | 0.5s 最小精度，秒级时间段 | ✗（只有总时长） |
| 双层审核 | 业务7维度+合规红线 | ✗（单层 supervision） |
| 导演讲戏风格 | 五维交织的沉浸式叙事 | ✗（结构化分析文档） |
| 跨集资产追踪 | 复用/变体/新增三态标记 | ✗ |
| 节拍密度+安全区 | 1beat≈2.5s + 前后0.5s安全区 | ✓（两者均有，迁移到分镜表环节） |

---

## 十、实施步骤

### 第 1 步：建立美术模板体系

- 新建 `skills/art-styles/3d-guoman/` 目录
- 从 Toonflow-app 的 `3D_chinese_traditional` 学习结构，创建自己的 8 个模板文件
- 重点：prefix.md（色板+硬约束）、art_character.md（面容表）、art_storyboard_video.md（视频约束）

### 第 2 步：建立制作技法文档

- 制作技法文档存放于 `skills/` 对应 Skill 目录下
- 从 Toonflow-app 的 production_skills 提取核心规则
- `storyboard_table_techniques.md`（在 `skills/seedance-storyboard-table/`）
- `storyboard_prompt_techniques.md`（在 `skills/seedance-storyboard-skill/`）

### 第 3 步：统一数据结构

- 设计并实现 `assets.json` 统一结构（合并 manifest.json）
- 设计并实现 `tasks.json` 任务队列
- 设计并实现 `director-plan.json` 导演规划
- 设计并实现 `storyboard-table.json` 分镜表
- 迁移"造化之门"现有 manifest.json 数据到新格式

### 第 4 步：重写资产管理 Agent/Skill

- 新建 `seedance-asset` skill（替代 seedance-art-skill + seedance-image）
- 输入：01-director.md → 输出：assets.json + 图片
- 使用 config/models/ 体系选择模型
- 支持衍生资产生成

### 第 5 步：新增导演规划环节

- 新建 `seedance-director-plan` skill
- 输入：01-director.md + assets.json → 输出：director-plan.json
- 规划场景分组、节奏编排、关键转折

### 第 6 步：新增分镜表环节

- 新建 `seedance-storyboard-table` skill
- 输入：director-plan.json + assets.json → 输出：storyboard-table.json
- 引入 storyboard_table_techniques.md 中的连贯性校验规则

### 第 7 步：升级分镜提示词生成

- 修改 `seedance-storyboard-skill`
- 输入增加 storyboard-table.json + assets.json + art_storyboard_video.md
- 引入 storyboard_prompt_techniques.md
- 输出不变：02-prompts.md（但质量更高，有结构化数据支撑）

### 第 8 步：新增视频生成

- 新建 `seedance-video` skill
- 解析 02-prompts.md → 逐镜调用 Seedance 2.0 API → 保存视频
- 实现任务队列和进度反馈

### 第 9 步：更新 seedance-main 协调流程

- 更新 `~sd` 指令体系，适配新的五阶段
- 更新 `.agent-state.json` 状态机

---

## 十一、验证方案

用造化之门 EP1 端到端测试：

1. 确认 01-director.md 正常产出
2. 验证 assets.json 结构化提取正确（新结构，含所有字段）
3. 验证 manifest.json 数据迁移正确
4. 对比新旧角色图质量（美术模板约束 vs 自由发挥）
5. 验证衍生资产生成（角色姿势变体）
6. 验证 director-plan.json 场景分组合理性
7. 验证 storyboard-table.json 与剧本一致性
8. 验证连贯性校验规则生效（朝向/景别/动作终态）
9. 验证 02-prompts.md 引用 assets.json 中的 ID
10. 触发单镜视频生成（P01）+ 进度反馈
11. 流水线五阶段正常流转

---

## 十二、关键文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| **美术风格模板** | | |
| `skills/art-styles/3d-guoman/prefix.md` | **新建** | 全局风格前缀（色板/材质/硬约束/禁止项） |
| `skills/art-styles/3d-guoman/art_character.md` | **新建** | 角色基础模板（含四视图设定规范） |
| `skills/art-styles/3d-guoman/art_scene.md` | **新建** | 场景基础模板（含四视图设定规范） |
| `skills/art-styles/3d-guoman/art_prop.md` | **新建** | 道具基础模板 |
| `skills/art-styles/3d-guoman/art_character_derivative.md` | **新建** | 角色衍生（L0-L5 六层堆叠体系） |
| `skills/art-styles/3d-guoman/art_scene_derivative.md` | **新建** | 场景衍生（景别/时段/天气三维度） |
| `skills/art-styles/3d-guoman/art_prop_derivative.md` | **新建** | 道具衍生模板 |
| `skills/art-styles/3d-guoman/art_storyboard_video.md` | **新建** | 视频提示词（锚点词/画质/反向/情绪映射） |
| `skills/art-styles/3d-guoman/director_planning_style.md` | **新建** | 导演规划风格（色彩方案/光线方案/古乐/环境声） |
| `skills/art-styles/3d-guoman/director_storyboard_style.md` | **新建** | 分镜表风格约束 |
| **制作技法** | | |
| `skills/shared/storyboard-table-techniques.md` | **新建** | 分镜表规范（含朝向系统/一镜到底/转场等） |
| `skills/shared/storyboard-prompt-techniques.md` | **新建** | 提示词规范（含首帧原则/去人化/柔化等） |
| `skills/shared/emotion-face-mapping.md` | **新建** | 情绪→面部映射表（含柔化版本） |
| **Agent/Skill** | | |
| `skills/seedance-asset/SKILL.md` | **新建** | 资产管理技能（替代 art-skill + image） |
| `skills/seedance-director-plan/SKILL.md` | **新建** | 导演规划技能（六维度） |
| `skills/seedance-storyboard-table/SKILL.md` | **新建** | 分镜表构建技能 |
| `skills/seedance-video/SKILL.md` | **新建** | 视频生成技能 |
| `skills/seedance-storyboard-skill/SKILL.md` | **修改** | 增加分镜表+视频模板输入（保留五层框架/去人化/柔化/嘴型） |
| `agents/seedance-main.md` | **修改** | 五阶段流程 |
| `skills/seedance-art-skill/SKILL.md` | **废弃** | 被 seedance-asset 替代 |
| `skills/seedance-image/SKILL.md` | **废弃** | 被 seedance-asset 替代 |
