# 内容生成层（CLI 触发）

> **注意**：本文档描述的是**剧本生成管线**（scriptAgent 三阶段）。
> 视频制作管线（Seedance 5阶段）请参考 `docs/seedance-pipeline.md`。
> 传统资产管线（asset-generator）已标记为 LEGACY，不再维护。

## 三层 Agent 体系

```
用户对话
  └─► scriptAgent-main（决策层 · 统筹）
        │
        ├─► scriptAgent-skeleton（执行层1 · 事件提取 + 故事骨架）
        │     读：novels/{name}/chapter-{N}.txt
        │     写：novels/{name}/events.md（Phase 1：事件提取）
        │     写：novels/{name}/skeleton.md（Phase 2：骨架构建，基于 events.md）
        │
        ├─► scriptAgent-adaptation（执行层2 · 改编策略）
        │     读：skeleton.md + events.md（+ 按需读取 chapter-{N}.txt）
        │     写：novels/{name}/adaptation.md
        │
        ├─► scriptAgent-script（执行层3 · 剧本编写）
        │     读：skeleton.md + adaptation.md + chapter-{N}.txt + 前一集剧本
        │     写：novels/{name}/scripts/episode-{N}.txt
        │
        └─► scriptAgent-supervisor（监督层 · 编辑审核）
              读：skeleton.md 或 adaptation.md + 原文
              输出：审核报告（A/B/C/D 评分）
```

## 改编流水线（三阶段，串行）

```
项目初始化
  ↓ 推荐分支（可选）：分析章节文件 + description → 推荐配置
  ↓ 主询问分支：逐一追问参数 + 章节范围验证
  ↓ 用户确认参数（集数/时长/范围/规格/风格/付费策略）
  ↓ 保存 novels/{name}/config.json

阶段1：事件提取 + 故事骨架
  ↓ scriptAgent-main 调用 scriptAgent-skeleton
  ↓ Phase 1：读取原文章节 → 提取事件表 → 产出 events.md
  ↓ Phase 2：基于 events.md → 产出 skeleton.md
  ↓ scriptAgent-main 调用 scriptAgent-supervisor 审核
  ↓ 审核报告展示给用户
  ↓ 用户确认后进入下一阶段

阶段2：改编策略
  ↓ scriptAgent-main 调用 scriptAgent-adaptation
  ↓ 产出 adaptation.md
  ↓ scriptAgent-main 调用 scriptAgent-supervisor 审核
  ↓ 审核报告展示给用户
  ↓ 用户确认后进入下一阶段

阶段3：剧本编写
  ↓ scriptAgent-main 逐集调用 scriptAgent-script（每次最多5集）
  ↓ 产出 scripts/episode-{N}.txt
  ↓ 不需要监督审核
  ↓ 完成后一次性通知用户
```

## 数据目录结构

```
novels/{name}/
├── description           # 项目简介
├── config.json           # 项目配置（集数/时长/风格等）
├── chapter-{N}.txt       # 小说原文章节
├── events.md             # 章节事件表（阶段1 Phase 1 产出）
├── skeleton.md           # 故事骨架（阶段1 Phase 2 产出）
├── adaptation.md         # 改编策略（阶段2产出）
├── scripts/
│   └── episode-{N}.txt   # 剧本（阶段3产出）
├── reviews/              # 审核结果
├── assets/               # 图片资产
└── seedance/             # Seedance 视频制作
```

## 项目配置（config.json）

```json
{
  "totalEpisodes": 10,
  "episodeDuration": 2,
  "wordsPerEpisode": 300,
  "chapterRange": [1, 5],
  "platform": "竖屏",
  "style": "玄幻热血",
  "paywall": "前3集免费，第4集起付费"
}
```

## 审核评分标准

| 等级 | 分数 | 含义 | 决策层引导 |
|------|------|------|----------|
| A | 90-100 | 优秀 | "审核通过，是否进入下一阶段？" |
| B | 80-89 | 良好 | "有小问题，是否修复还是直接继续？" |
| C | 60-79 | 及格 | "建议修复以下问题" |
| D | <60 | 不及格 | "建议重做此阶段" |

## 关键约束

- 决策层不生成内容，不读取执行层产出（可列出章节文件、读取 description）
- 执行层失败时决策层向用户汇报，不代替执行
- 所有派发指令头部附带【项目配置】
- 阶段必须串行执行（1→2→3）
- 审核后必须等用户确认才进入下一阶段
- 剧本编写阶段不需要监督审核

## 旧 Agent（已废弃，文件保留但不再使用）

- outlineSript-main → 替换为 scriptAgent-main
- outlineScript-a1/a2 → 替换为 scriptAgent-skeleton
- outlineScript-a3 → 替换为 scriptAgent-script
- outlineScript-director/checker → 替换为 scriptAgent-supervisor
