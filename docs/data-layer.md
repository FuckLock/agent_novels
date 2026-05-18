# 数据层结构（旧 Web / Legacy Import 参考）

> 状态说明：本文描述的是旧 Web 与 CLI Seedance pipeline 时代的 `novels/` 文件数据层。  
> 对于 Product-Spec.md v3.0 之后的重做版 Toonflow Web，新产品数据边界以 `Workspace + dataRoot + 后端数据库 + Artifact 仓库` 为准；`novels/` 只作为旧项目扫描、兼容读取和 LegacyImport 来源。  
> 新开发不得把本文中的“所有系统共享，唯一数据源”继续理解为重做版产品规则。

```
novels/
└── {小说名称}/
    ├── description              小说简介（含画风/类型/背景）
    ├── config.json              项目配置（集数/时长/范围/规格/风格/付费策略）
    ├── storyline.md             故事线（AI1 生成）
    ├── outline.json             大纲（AI2 生成，JSON 数组）
    │
    ├── chapters/                原文章节
    │   └── chapter-N.txt        章节原文（N 从 1 开始）
    │
    ├── skeleton/                故事骨架（分层存储，scriptAgent-skeleton 生成）
    │   ├── global.md            全局骨架（故事核/人物弧/三幕/付费策略/集索引表，~500字）
    │   └── episodes/
    │       └── ep-{NN}.md       单集骨架（节拍/钩子/情绪曲线，~200字/集）
    │
    ├── adaptation/              改编策略（分层存储，scriptAgent-adaptation 生成）
    │   ├── global.md            全局改编原则（语言规范/情绪优先级，稳定不变）
    │   └── episodes/
    │       └── ep-{NN}.md       单集改编细节（删减决策/世界观呈现）
    │
    ├── continuity.json          连贯性追踪（跨三阶段维护：伏笔/人物状态/剧情线索）
    ├── continuity-archive.json  已关闭项归档（控制主文件大小）
    │
    ├── scripts/                 单集剧本（scriptAgent-script 生成）
    │   └── episode-{N}.txt      每集剧本文件
    │
    ├── reviews/                 审核记录
    │   └── {type}[-ep{N}].json  审核结果（skeleton/adaptation/script 等）
    │
    └── seedance/                Seedance 视频管线产出（seedance-main 协调）
        ├── assets.json          统一资产数据源
        │                        Schema: schemas/assets.schema.json
        ├── tasks.json           异步任务队列（图片/视频生成任务）
        │                        Schema: schemas/tasks.schema.json
        ├── images/              跨集累积的生成图片
        │   ├── characters/      角色设定图（{人物名}.png）
        │   ├── scenes/          场景图（scene-{场景名}.png）
        │   └── props/           道具图（{道具名}.png）
        └── ep{N}/               每集产出
            ├── 01-director.md        导演讲戏本 + 人物清单 + 场景清单
            ├── director-plan.json    导演规划（六维度）
            │                         Schema: schemas/director-plan.schema.json
            ├── storyboard-table.json 结构化分镜表（12列+trackId）
            │                         Schema: schemas/storyboard-table.schema.json
            ├── 02-prompts.md         Seedance 2.0 提示词（含 @图片 引用）
            └── videos/               生成的视频
                ├── P01.mp4
                ├── P02.mp4
                └── ...

config/
├── art-styles/                  美术风格模板
│   └── 3d-guoman/               3D 国漫风格
│       ├── prefix.md            全局风格（色板/材质/硬约束/禁止项）
│       ├── art_character.md     角色基础（面容/体型/四视图设定）
│       ├── art_scene.md         场景基础（构图/光影/四视图设定）
│       ├── art_prop.md          道具基础（材质/形状/多角度设定）
│       ├── art_character_derivative.md   角色衍生（L0-L5 六层堆叠体系）
│       ├── art_scene_derivative.md       场景衍生（景别/时段/天气三维度）
│       ├── art_prop_derivative.md        道具衍生
│       ├── art_storyboard_video.md       视频提示词（锚点词/画质/反向/情绪映射）
│       ├── director_planning_style.md    导演规划风格（色彩方案/光线方案/古乐/环境声）
│       └── director_storyboard_style.md  分镜表风格（光影/动作节奏/运镜禁区）
├── production-skills/           制作技法
│   ├── storyboard_table_techniques.md    分镜表规范（朝向/一镜到底/转场/校验）
│   ├── storyboard_prompt_techniques.md   提示词规范（首帧原则/去人化/柔化/五层框架）
│   └── emotion_face_mapping.md           情绪→面部映射表（含柔化版本）
├── models/                      模型配置
│   ├── image/                   图片生成模型
│   └── video/                   视频生成模型
└── banana.json                  图像生成 API 配置

schemas/                         JSON Schema 定义
├── assets.schema.json           SeedanceAsset[] 接口
├── tasks.schema.json            TaskRecord[] 接口
├── director-plan.schema.json    DirectorPlan 接口
├── storyboard-table.schema.json StoryboardTable 接口
└── outline.schema.json          大纲 Schema（已有）
```

**旧规则：旧 Web / CLI 阶段所有 Agent 和 Web API 都读写 novels/ 目录，不建其他数据源。重做版新产品不得沿用为唯一数据源。**

## 骨架分层说明

详见 `docs/script-rule.md`，核心设计：
- **全局层**（global.md）：项目级文档，~500字，不随集数膨胀
- **集层**（episodes/ep-{NN}.md）：每集独立文件，~200字，可单独修改
- **连贯性追踪**（continuity.json）：结构化数据，跨三阶段（骨架→改编→剧本）维护伏笔/人物状态/剧情线索

## Seedance 管线数据流

```
01-director.md → assets.json（资产提取）→ director-plan.json（六维度规划）
    → storyboard-table.json（分镜表）→ 02-prompts.md（提示词）→ videos/（视频）
```

每阶段产出的 JSON 文件都有对应的 Schema 定义在 `schemas/` 目录。
