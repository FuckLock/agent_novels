# Toonflow 故事骨架分层存储 + 连贯性追踪 方案

## 一、问题背景

当前故事骨架（skeleton.md）和改编策略（adaptation.md）是项目级单文件，每次生成直接覆盖。导致：
1. 先生成 1-3 集骨架，再生成 4-6 集时，前 3 集骨架被覆盖丢失
2. 无法单独修改某一集的骨架/改编
3. 续写新集时需要把所有已有内容作为上下文，上下文窗口不够
4. 剧本生成缺乏结构化的连贯性追踪，伏笔/人物状态可能跨集丢失

---

## 二、目录结构与文件说明

### 新目录结构

```
novels/{作品名}/
│
├── config.json                    # 项目配置
├── description                    # 小说简介
├── chapter-1.txt                  # 小说原文第1章
├── chapter-2.txt                  # 小说原文第2章
├── ...
│
├── events.md                      # 章节事件表
│
├── skeleton/                      # 故事骨架（分层）
│   ├── global.md                  # 全局骨架
│   └── episodes/
│       ├── ep-01.md               # 第1集骨架
│       ├── ep-02.md               # 第2集骨架
│       └── ...
│
├── adaptation/                    # 改编策略（分层）
│   ├── global.md                  # 全局改编原则
│   └── episodes/
│       ├── ep-01.md               # 第1集改编细节
│       ├── ep-02.md               # 第2集改编细节
│       └── ...
│
├── continuity.json                # 连贯性追踪（跨三阶段）
├── continuity-archive.json        # 已关闭项归档
│
├── scripts/                       # 剧本
│   ├── episode-1.txt              # 第1集剧本
│   ├── episode-2.txt              # 第2集剧本
│   └── ...
│
└── chat-history.json              # 对话历史
```

### 每个文件/目录的作用

#### 输入文件（用户提供）

| 文件 | 作用 | 谁写入 |
|------|------|--------|
| `config.json` | 项目配置：集数、时长、章节范围、平台规格、风格、付费策略 | 用户通过 scriptAgent-main 确认 |
| `description` | 小说简介：画风、类型、时代背景 | 用户提供 |
| `chapter-N.txt` | 小说原文第 N 章 | 用户上传 |

#### 阶段 0 产出：事件提取

| 文件 | 作用 | 谁写入 | 谁读取 |
|------|------|--------|--------|
| `events.md` | **章节事件表**：从小说原文中提取的结构化事件摘要。每章包含核心事件列表、出场人物、情绪基调、情节功能、关键冲突。作用是把几万字的原文浓缩为几百字的结构化数据，后续骨架构建基于此文件而非重读原文。 | scriptAgent-skeleton (Phase 1) | scriptAgent-skeleton (Phase 2) |

#### 阶段 1 产出：故事骨架

| 文件 | 作用 | 谁写入 | 谁读取 |
|------|------|--------|--------|
| `skeleton/global.md` | **全局骨架**（~500字）：故事核（一句话概括）、主角人物弧（成长轨迹）、三幕结构（高层概览）、付费策略、全局删减决策、集索引表（所有集的标题/章节/状态）。是整个项目的"北极星"文档，内容稳定、体积小。 | scriptAgent-skeleton | 所有后续阶段的 Agent |
| `skeleton/episodes/ep-{NN}.md` | **单集骨架**（每集~200字）：该集的标题、章节覆盖范围、时长、核心节拍表（3-5个关键剧情点）、集末钩子、情绪曲线、付费点、状态（draft/confirmed/locked）。每集独立文件，可单独修改。 | scriptAgent-skeleton | scriptAgent-adaptation、scriptAgent-script |

#### 阶段 2 产出：改编策略

| 文件 | 作用 | 谁写入 | 谁读取 |
|------|------|--------|--------|
| `adaptation/global.md` | **全局改编原则**：适用于所有集的通用规则。包含语言规范（对话口语化/内心戏用画面表达）、情绪优先级排序、压缩原则、删减标准。写一次后基本不变。 | scriptAgent-adaptation | scriptAgent-script（每集都读） |
| `adaptation/episodes/ep-{NN}.md` | **单集改编细节**：该集具体删什么、改什么、怎么压缩。基于该集骨架 + 对应章节原文做出的具体决策。每集独立，可单独修改。 | scriptAgent-adaptation | scriptAgent-script |

#### 跨阶段：连贯性追踪

| 文件 | 作用 | 谁写入 | 谁读取 |
|------|------|--------|--------|
| `continuity.json` | **连贯性中枢**：结构化追踪跨集的伏笔、人物状态、剧情线索、集间衔接要求。从骨架阶段开始初始化，每个阶段都更新。是确保剧本连贯性的核心文件。只包含 active（未关闭）的项目，体积可控。 | 三个阶段的 Agent 都写 | scriptAgent-skeleton(extend)、scriptAgent-adaptation、scriptAgent-script |
| `continuity-archive.json` | **已关闭项归档**：已回收的伏笔、已解决的线索等。从 continuity.json 迁移过来，控制主文件大小。正常流程中不需要读取，仅供追溯查看。 | 自动归档 | 仅调试/回顾时 |

#### 阶段 3 产出：剧本

| 文件 | 作用 | 谁写入 | 谁读取 |
|------|------|--------|--------|
| `scripts/episode-{N}.txt` | **单集剧本**：最终交付物。场景描写 + 对白 + 动作指示。 | scriptAgent-script | 下一集生成时读最后500字（衔接） |

---

## 三、continuity.json 详细结构

```json
{
  "lastUpdatedPhase": "script",
  "lastUpdatedEpisode": 3,

  "characterArcs": {
    "叶真": {
      "startState": "天赋平庸、被动等待命运审判",
      "endState": "主动承担、觉醒秘密力量",
      "turningPoints": [
        {"ep": 1, "event": "发现父亲气血衰败，从被动变主动", "status": "planned|executed"}
      ]
    }
  },

  "characterStates": {
    "叶真": {
      "location": "齐云宗外门",
      "cultivation": "练血一重后期",
      "knowledge": ["知道父亲气血衰败", "发现掌心秘密"],
      "relationships": {"母亲": "深爱但故意隐瞒秘密"},
      "emotionalState": "坚定但焦虑"
    }
  },

  "foreshadowing": [
    {
      "id": "f1",
      "description": "掌心微光",
      "plantEp": 1,
      "payoffEp": 4,
      "status": "planned → planted → resolved",
      "plantContext": "叶真握拳时掌心金光一闪",
      "resolution": null
    }
  ],

  "plotThreads": [
    {
      "id": "t1",
      "title": "大考逼近",
      "startEp": 1,
      "resolveEp": 4,
      "status": "planned → active → resolved",
      "description": "一个月后宗门大考，不达标被驱逐"
    }
  ],

  "episodeLinks": {
    "1→2": "第1集尾钩「掌心微光」→ 第2集开场叶真研究微光来源",
    "2→3": "..."
  },

  "episodeEndStates": {
    "1": {
      "ending": "叶真独自站在山崖边，掌心微光闪烁",
      "hookType": "悬念",
      "nextMustStart": "叶真研究掌心微光的来源"
    }
  },

  "adaptationImpact": [
    {
      "decision": "删除支线角色李长老",
      "affectedItems": ["t2"],
      "resolution": "功能合并到师兄陈坤身上"
    }
  ]
}
```

**字段说明：**

| 字段 | 作用 | 何时写入 | 何时读取 |
|------|------|---------|---------|
| `characterArcs` | 人物成长轨迹规划 | 骨架阶段初始化 | 续写骨架时参考 |
| `characterStates` | 人物当前状态快照（位置/知识/关系） | 每集剧本完成后更新 | 下一集剧本生成时读取 |
| `foreshadowing` | 伏笔追踪：在哪集埋、在哪集收、当前状态 | 骨架规划→改编调整→剧本执行 | 剧本生成时过滤当前集相关项 |
| `plotThreads` | 剧情线索：什么时候开始、什么时候解决 | 骨架规划→剧本执行 | 剧本生成时过滤 active 项 |
| `episodeLinks` | 集间衔接设计：上一集结尾接下一集开头 | 骨架阶段 | 剧本生成时读当前集的衔接要求 |
| `episodeEndStates` | 每集结尾状态：最后场景、钩子类型、下集必须接什么 | 每集剧本完成后 | 下一集剧本生成时 |
| `adaptationImpact` | 改编删减造成的影响：删了什么、影响了哪些伏笔/线索 | 改编阶段 | 后续改编和剧本时参考 |

**容量控制：**
- `foreshadowing` 中 resolved 的项：只保留最近 5 条，更早的归档到 `continuity-archive.json`
- `episodeEndStates`：只保留最近 3 集
- `characterStates`：快照覆盖，不增长

---

## 四、集骨架状态机

每集骨架文件（ep-{NN}.md）有三个状态：

```
draft → confirmed → locked
  ↑         |          |
  └─────────┘          |
  (用户请求修改)       |
  ↑                    |
  └────────────────────┘
  (用户显式解锁 + 二次确认)
```

| 状态 | 含义 | 谁能修改 | 何时转换 |
|------|------|---------|---------|
| `draft` | AI 生成后的默认状态 | AI 可修改 | → confirmed：用户确认 |
| `confirmed` | 用户确认骨架 OK | 用户请求时可改 | → locked：生成剧本后自动 |
| `locked` | 已生成剧本，强保护 | 需用户显式解锁 | → draft：用户二次确认解锁 |

---

## 五、四种生成模式

| mode | 触发条件 | 逻辑说明 |
|------|---------|---------|
| `full` | 项目首次，skeleton/ 不存在 | 从零创建所有文件：global.md + 所有集骨架 + continuity.json 初始化 |
| `extend` | skeleton/ 已存在 + 用户要续写新集 | 只读最后一集+全局+continuity，只创建新集文件，不动已有集 |
| `revise_episode` | 用户要修改某一集 | 读目标集±1集+全局+continuity，只改目标集。locked 集禁止写入 |
| `revise_global` | 用户要改全局设定 | 读 global+集索引，改 global。locked 集标记 needs_review |

---

## 六、完整流程（以"造化之门"1-6集为例）

### 第一轮：首次生成 1-3 集（full 模式）

#### 步骤 1.0：事件提取

| 项 | 内容 |
|---|------|
| **AI 读取** | `chapter-1.txt`, `chapter-2.txt`, ...（chapterRange 范围内） |
| **AI 写入** | `events.md` — 每章的核心事件、人物、情绪、冲突的结构化提取 |

#### 步骤 1.1：骨架生成（full）

| 项 | 内容 |
|---|------|
| **AI 读取** | `events.md` + `config.json` |
| **AI 写入** | `skeleton/global.md` — 故事核、人物弧、三幕、付费策略、集索引表 |
| | `skeleton/episodes/ep-01.md` — 第1集节拍、钩子、情绪 |
| | `skeleton/episodes/ep-02.md` — 第2集 |
| | `skeleton/episodes/ep-03.md` — 第3集 |
| | `continuity.json` — 初始化 characterArcs、foreshadowing(planned)、plotThreads(planned)、episodeLinks |
| **不动** | chapter-*.txt、scripts/、adaptation/ |

#### 步骤 1.2：改编策略生成（full）

| 项 | 内容 |
|---|------|
| **AI 读取** | `skeleton/global.md` + `skeleton/episodes/ep-01~03.md` + `continuity.json` + 章节原文 |
| **AI 写入** | `adaptation/global.md` — 通用改编原则（语言/情绪/压缩规则） |
| | `adaptation/episodes/ep-01.md` — 第1集删减决策 |
| | `adaptation/episodes/ep-02.md` — 第2集 |
| | `adaptation/episodes/ep-03.md` — 第3集 |
| **AI 更新** | `continuity.json` — adaptationImpact、被 cut 的伏笔/线索 |
| **不动** | skeleton/（已定稿） |

#### 步骤 1.3：剧本编写（逐集生成）

**第1集：**

| 项 | 内容 |
|---|------|
| **AI 读取** | `skeleton/global.md` + `skeleton/episodes/ep-01.md` + `adaptation/global.md` + `adaptation/episodes/ep-01.md` + `continuity.json`(过滤出 ep1 相关项) + 章节原文 |
| **AI 写入** | `scripts/episode-1.txt` |
| **AI 更新** | `continuity.json` — foreshadowing(planned→planted)、characterStates(快照)、episodeEndStates.1 |

**第2集：**

| 项 | 内容 |
|---|------|
| **AI 读取** | `skeleton/global.md` + `skeleton/episodes/ep-02.md` + `adaptation/global.md` + `adaptation/episodes/ep-02.md` + `continuity.json`(ep2 相关项 + ep1 的 endState) + `episode-1.txt 最后500字` + 章节原文 |
| **AI 写入** | `scripts/episode-2.txt` |
| **AI 更新** | `continuity.json` — characterStates、episodeEndStates.2、伏笔/线索状态 |

**第3集：** 同第2集模式（读 ep2 的 endState + episode-2.txt 尾部）

---

### 第二轮：续写 4-6 集（extend 模式）

#### 步骤 2.0：事件提取（extend）

| 项 | 内容 |
|---|------|
| **AI 读取** | 新章节原文（第4-6集覆盖的章节） |
| **AI 写入** | `events.md` — **追加**新章节事件（不覆盖已有内容） |

#### 步骤 2.1：骨架续写（extend）

| 项 | 内容 |
|---|------|
| **AI 读取** | `skeleton/global.md`(~500字) + `skeleton/episodes/ep-03.md`(~200字,衔接) + `continuity.json`(active 项) + `events.md`(新章节部分) + `config.json` |
| **AI 写入** | `skeleton/episodes/ep-04.md`、`ep-05.md`、`ep-06.md`（新集骨架） |
| **AI 更新** | `skeleton/global.md`（仅追加集索引行，不改主体内容） |
| | `continuity.json`（追加新伏笔/线索规划、新 episodeLinks） |
| **不动** | `ep-01.md`、`ep-02.md`、`ep-03.md` ← **硬保护，不读不写** |

#### 步骤 2.2：改编策略续写（extend）

| 项 | 内容 |
|---|------|
| **AI 读取** | `adaptation/global.md`(已有,不重写) + `skeleton/episodes/ep-04~06.md` + `continuity.json` + 新章节原文 |
| **AI 写入** | `adaptation/episodes/ep-04.md`、`ep-05.md`、`ep-06.md` |
| **AI 更新** | `continuity.json`（新的 adaptationImpact） |
| **不动** | `adaptation/global.md`（通用规则不变）、`adaptation/ep-01~03.md` ← **硬保护** |
| **不读** | `adaptation/ep-01~03.md`（前几集改编对当前集无直接影响，影响已记录在 continuity.json 中） |

#### 步骤 2.3：剧本编写（从第4集开始）

**第4集：**

| 项 | 内容 |
|---|------|
| **AI 读取** | `skeleton/global.md` + `skeleton/episodes/ep-04.md` + `adaptation/global.md` + `adaptation/episodes/ep-04.md` + `continuity.json`(ep4 相关 + ep3 的 endState) + `episode-3.txt 最后500字` + 章节原文 |
| **AI 写入** | `scripts/episode-4.txt` |
| **AI 更新** | `continuity.json` |
| **不读** | episode-1~2.txt、skeleton/ep-01~03.md、adaptation/ep-01~03.md |

第5、6集同上模式。

---

## 七、上下文大小对比

| 场景 | 旧方案（单文件） | 新方案（分层） |
|------|----------------|---------------|
| 续写第 11 集骨架 | 读完整 skeleton.md（含 1-10 集全部内容，可能 5000+ 字） | 读 global.md(500字) + ep-10.md(200字) + continuity.json(~300字) = **~1000字** |
| 生成第 30 集剧本 | 读完整 skeleton.md + adaptation.md = 可能 10000+ 字 | global(500) + ep-30(200) + adaptation/global + adaptation/ep-30 + continuity过滤(300) + 上集尾部(500) = **~2000字** |

无论项目有多少集，上下文大小**恒定**。

---

## 八、实施顺序

### Phase 1：CLI 层（优先）
1. 创建新目录结构 + 迁移造化之门数据
2. 改 `scriptAgent-skeleton.md`（支持 4 种 mode + continuity.json 初始化/更新）
3. 改 `scriptAgent-main.md`（分批次调度 + mode 判断）
4. 改 `scriptAgent-adaptation.md`（分层 + 更新 continuity.json）
5. 改 `scriptAgent-script.md`（分层读取 + continuity 过滤 + 完成后更新）
6. 更新 `docs/data-layer.md`

### Phase 2：Web 前端层
1. 改 `web/app/lib/novels.ts`（分层读写函数 + 兼容层）
2. 改 `web/app/lib/agent/executor.ts`（分段 XML 解析 + 分层写入）
3. 改 `web/app/lib/agent/prompts.ts`（分层上下文注入 + continuity 过滤）
4. 改 `web/app/projects/[name]/tabs/workbench/SkeletonPanel.tsx`（按集展示/编辑/状态）
5. 改 `web/app/api/projects/[name]/skeleton/route.ts`（支持 episode 参数）

### ~~Phase 3：Toonflow-app-master 后端~~（不需要）

> Toonflow-app-master 是参考项目，不是我们的项目。我们的 Web 层已在 Phase 2 中完成改造（`web/app/` 下的代码）。

---

## 九、涉及的关键文件

| 文件 | 改动类型 |
|------|---------|
| `agents/scriptAgent-skeleton.md` | 重写（4 种 mode + continuity 维护） |
| `agents/scriptAgent-main.md` | 修改（分批次调度） |
| `agents/scriptAgent-adaptation.md` | 修改（分层 + continuity） |
| `agents/scriptAgent-script.md` | 修改（分层读取 + continuity 过滤） |
| `docs/data-layer.md` | 更新目录树 |
| `novels/{name}/continuity.json` | 新增 |
| `web/app/lib/novels.ts` | 新增分层函数 |
| `web/app/lib/agent/executor.ts` | 改造三个 execute 函数 |
| `web/app/lib/agent/prompts.ts` | 分层上下文注入 |
| `web/app/projects/[name]/tabs/workbench/SkeletonPanel.tsx` | UI 适配 |
| `web/app/api/projects/[name]/skeleton/route.ts` | API 适配 |
| ~~Toonflow-app-master 后端~~ | 参考项目，不改动 |
