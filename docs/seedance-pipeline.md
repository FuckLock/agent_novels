# Seedance 视频制作层（5 阶段流水线）

## 完整流水线

```
剧本（scripts/episode-{N}.txt）
    │
    ▼
═══════════════════════════════════════════
阶段 A：导演分析（保留，微调）
═══════════════════════════════════════════
    执行：director Agent → director-skill
    产出：seedance/ep{N}/01-director.md
    审核：导演自审(script-analysis-review-skill) + 合规审核(compliance-review-skill)
    │
    ▼
═══════════════════════════════════════════
阶段 B：资产管理（重写）
═══════════════════════════════════════════
    执行：seedance-asset Skill
    B1. 资产提取 → assets.json（描述层 + identityAnchor）
    B2. 模板驱动提示词生成 → assets.json（prompt 字段）
    B3. 图片生成 → images/ + tasks.json
    B4. 衍生资产（按需）→ L0-L5 角色衍生 / 三维度场景衍生
    审核：art-direction-review-skill（审核 assets.json）+ 合规审核
    │
    ▼
═══════════════════════════════════════════
阶段 C1：导演规划（新增）
═══════════════════════════════════════════
    执行：seedance-director-plan Skill
    产出：seedance/ep{N}/director-plan.json（六维度规划）
    六维度：主题叙事/视觉风格/叙事结构/场景意图/声音音乐/转场连贯
    │
    ▼
═══════════════════════════════════════════
阶段 C2：分镜表构建（新增）
═══════════════════════════════════════════
    执行：seedance-storyboard-table Skill
    产出：seedance/ep{N}/storyboard-table.json（12列+trackId）
    核心：10方位朝向/台词时长公式/景别衔接/Track分组
    校验：10项连贯性校验自动执行
    │
    ▼
═══════════════════════════════════════════
阶段 C3：分镜提示词（保留+增强）
═══════════════════════════════════════════
    执行：storyboard-artist Agent → seedance-storyboard-skill
    产出：seedance/ep{N}/02-prompts.md（Track 级提示词，每个 Track 一条）
    保留：五层框架/去人化/柔化词/嘴型/时间轴/连续叙事
    新增：首帧原则/风格锚点/情绪映射/10方位/@资产强绑定
    审核：seedance-prompt-review-skill + 合规审核
    │
    ▼
═══════════════════════════════════════════
阶段 D：视频生成（新增）
═══════════════════════════════════════════
    执行：seedance-video Skill
    D1. 单镜视频生成 → Seedance 2.0 multiReference API
    D2. 轨道组装（后续规划）→ 拼接/字幕/BGM
    产出：seedance/ep{N}/videos/T{NN}.mp4
```

## 指令前缀 `~sd`

| 指令 | 阶段 | 说明 |
|------|------|------|
| `~sd start [小说名] [ep{N}]` | A | 导演分析 |
| `~sd asset [小说名] [ep{N}]` | B | 资产管理 |
| `~sd plan [小说名] [ep{N}]` | C1 | 导演规划 |
| `~sd table [小说名] [ep{N}]` | C2 | 分镜表构建 |
| `~sd prompt [小说名] [ep{N}]` | C3 | 分镜提示词 |
| `~sd video [小说名] [ep{N}]` | D | 视频生成 |
| `~sd image [小说名]` | — | 独立触发图片生成 |
| `~sd status [小说名]` | — | 查看进度 |
| `~sd auto [小说名] [ep{N}]` | A→C3 | 自动执行完整流水线 |

## Agent/Skill 调用关系

```
seedance-main（制片人协调者，5阶段调度）
  ├─► [阶段A] director Agent → director-skill
  │     审核：script-analysis-review-skill + compliance-review-skill
  ├─► [阶段B] seedance-asset Skill（替代 seedance-art-skill + seedance-image）
  │     读取：skills/art-styles/{style}/ 美术模板
  │     审核：art-direction-review-skill + compliance-review-skill
  ├─► [阶段C1] seedance-director-plan Skill
  │     读取：skills/art-styles/{style}/director_planning_style.md
  ├─► [阶段C2] seedance-storyboard-table Skill
  │     读取：skills/shared/storyboard-table-techniques.md
  │     可回调：seedance-asset（衍生图按需生成）
  ├─► [阶段C3] storyboard-artist Agent → seedance-storyboard-skill
  │     读取：skills/shared/storyboard-prompt-techniques.md
  │     审核：seedance-prompt-review-skill + compliance-review-skill
  └─► [阶段D] seedance-video Skill
        读取：config/models/video/
```

## 数据流

```
scripts/episode-{N}.txt
    → 01-director.md（导演分析）
    → assets.json（资产提取+提示词+图片）
    → director-plan.json（六维度规划）
    → storyboard-table.json（结构化分镜表）
    → 02-prompts.md（Seedance 2.0 提示词）
    → videos/T{NN}.mp4（视频）
```

## 历史说明

传统视频模式（storyboard-main → shots.json → video-prompts → .mp4）已废弃并删除。
现在 Seedance 5阶段管线是唯一的视频制作流程。
