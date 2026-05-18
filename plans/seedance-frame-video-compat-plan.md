# Seedance 首尾帧/分镜帧视频生成兼容计划

> 日期：2026-04-28  
> 范围：当前 Toonflow Web 制作模块 `web/app` 与第三方参考项目 `web/Toonflow-app` 的视频生成模式兼容方案。  
> 目标：在不破坏现有“人物/场景/道具参考图 + Track 提示词 -> 视频”链路的前提下，新增“先生成首帧/尾帧或分镜关键帧 -> 再讲解提示词 -> 再生成视频”的模式。

## 1. 结论

推荐新增一个可选阶段：`C4 帧画面`。

现有管线保持不变：

```text
A 导演分析 -> B 资产管理 -> C1 导演规划 -> C2 分镜表 -> C3 提示词 -> D 视频
```

新增模式在 C3 和 D 之间插入可跳过节点：

```text
A 导演分析 -> B 资产管理 -> C1 导演规划 -> C2 分镜表 -> C3 提示词 -> C4 帧画面 -> D 视频
```

核心原则：

- `C3` 继续产出视频叙事提示词 `02-prompts.md`，不改变现有提示词质量体系。
- `C4` 专门负责从人物、场景、道具资产与分镜表生成 `startFrame/endFrame/keyFrame` 图片。
- `D` 根据模型能力自动选择输入方式：纯多参考图、分镜帧辅助、多参考图加首帧、首尾帧。
- 没有 C4 数据时，D 仍按当前逻辑执行，保证历史项目和旧数据可继续运行。

## 2. 当前项目现状

当前项目已经具备这些基础能力：

| 模块 | 现有能力 | 位置 |
| --- | --- | --- |
| 管线阶段 | A/B/C1/C2/C3/D 六节点状态 | `web/app/lib/agent/seedance-executor.ts`、`PipelineGraph.tsx` |
| 结构化分镜 | `storyboard-table.json` 保存 Track、时长、景别、动作、资产引用 | `web/app/lib/novels.ts` |
| 视频提示词 | `02-prompts.md` 按 Track 输出连续叙事提示词 | `runStoryboardPrompts()` |
| 资产图生成 | 已能通过图像模型生成角色、场景、道具图 | `assets/batch-generate/route.ts`、`ai-client.ts` |
| 视频提交 | 已按提示词解析资产引用并提交视频任务 | `web/app/lib/agent/seedance-video.ts` |

当前 D 阶段已经有一个隐藏优势：  
`buildVideoBody()` 对 `multiReference` 模型会把参考图作为 `reference_image`，对非 `multiReference` 模型会把前两张参考图当 `first_frame` 和 `last_frame`。也就是说，底层已有“首尾帧输入”的雏形，缺口主要在：首帧/尾帧图片没有独立生成、保存、审核和 UI 管理。

## 3. Toonflow-app 可借鉴点

第三方 `web/Toonflow-app` 中有三块非常值得吸收，但不建议整体迁移：

| 借鉴点 | Toonflow-app 做法 | 本项目吸收方式 |
| --- | --- | --- |
| 分镜面板模式 | `production_execution_storyboard_panel.md` 支持纯文本多参、分镜图辅助多参、首位帧模式 | 转成文件制的 `videoInputMode`，放入 C4/D |
| 分镜图生成 | `batchGenerateImage.ts` 用分镜 prompt + 关联资产图生成分镜图 | 复用当前 `generateImage()` 和资产图，新增帧图任务 |
| 视频输入模式 | Vendor 抽象中有 `startEndRequired`、`startFrameOptional`、`imageReference:n` | 扩展现有 `config/models/video/*.json` 的能力字段 |

不建议直接搬 Toonflow-app 的 DB/Vendor 体系。当前项目是 Next.js + `novels/` 文件制，已有 `config/models/` 与 `ai-client.ts`，直接吸收“模式抽象”和“帧图中间产物”即可。

## 4. 产品需求分析

### 4.1 目标用户

- 短剧/漫剧制作用户，希望提高视频首画面稳定性和角色一致性。
- 需要适配不同视频模型的用户：有些模型适合多参考图，有些模型强依赖首帧或首尾帧。
- 希望保留当前 Seedance 2.0 多参考图流程，同时给更强控制场景一个升级通道。

### 4.2 核心痛点

当前方式是“人物、场景、道具参考图 + 文字提示词”直接生成视频。对 Seedance 2.0 多参考图很合适，但在以下场景容易不稳定：

- 视频第一帧构图不受控，角色位置、景别、动作准备姿态随机。
- 尾帧目标状态不明确，导致动作结束点漂移。
- 多角色同框时，人物左右位置和朝向容易混乱。
- 某些视频模型只接受首帧/尾帧，不适合当前纯多参考图输入。

### 4.3 P0/P1/P2 范围

| 优先级 | 功能 | 说明 |
| --- | --- | --- |
| P0 | 新增 C4 帧画面阶段 | 生成 Track 级首帧/尾帧或关键帧，保存任务和图片 |
| P0 | D 阶段兼容帧图输入 | 有 C4 时优先用帧图，无 C4 时走旧逻辑 |
| P0 | 模型输入模式配置 | 标准化 `multiReference`、`startFrameOptional`、`startEndRequired` |
| P1 | UI 查看与重试 | C4 节点展示帧图、失败原因、重试按钮 |
| P1 | 手动替换帧图 | 用户上传或选择已有图片作为首帧/尾帧 |
| P2 | 分镜级帧图 | 从 Track 级扩展为每个 shot 独立生成关键帧 |
| P2 | 帧图质量审核 | 自动检查角色、场景、道具是否遗漏或错位 |

## 5. 数据设计

### 5.1 新增文件

建议新增：

```text
novels/{project}/seedance/ep{N}/frames/
  frame-plan.json
  tasks.json
  T01/
    start.png
    end.png
  T02/
    start.png
    end.png
```

### 5.2 `frame-plan.json`

```json
{
  "episode": "ep01",
  "mode": "first_last_frame",
  "tracks": [
    {
      "trackId": "T01",
      "sourceSeq": [1, 2],
      "assetIds": ["char-001", "scene-001", "prop-001"],
      "startFrame": {
        "prompt": "首帧画面提示词",
        "path": "seedance/ep1/frames/T01/start.png",
        "state": "success",
        "apiTaskId": "xxx"
      },
      "endFrame": {
        "prompt": "尾帧画面提示词",
        "path": "seedance/ep1/frames/T01/end.png",
        "state": "success",
        "apiTaskId": "yyy"
      }
    }
  ]
}
```

### 5.3 扩展 `storyboard-table.json`

不强制迁移旧数据，只新增可选字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `frameState` | `pending/generating/success/failed` | 该分镜或 Track 帧图状态 |
| `startFramePath` | string | 首帧路径 |
| `endFramePath` | string | 尾帧路径 |
| `framePrompt` | string | 关键帧提示词摘要 |
| `videoInputMode` | string | 当前 Track 视频输入模式 |

### 5.4 视频任务记录扩展

`videos/video-tasks.json` 增加：

```json
{
  "id": "T01",
  "inputMode": "first_last_frame",
  "frameRefs": {
    "start": "seedance/ep1/frames/T01/start.png",
    "end": "seedance/ep1/frames/T01/end.png"
  },
  "assetRefs": ["char-001", "scene-001"]
}
```

## 6. 模式设计

### 6.1 三种视频输入模式

| 模式 | 说明 | 是否需要 C4 | 适合模型 |
| --- | --- | --- | --- |
| `multi_reference` | 当前模式：资产参考图 + Track 提示词 | 否 | Seedance 2.0 多参考图 |
| `storyboard_frame_reference` | 生成一张关键帧图，再与资产图一起作为参考 | 是 | 支持多参考图或单首帧模型 |
| `first_last_frame` | 每个 Track 生成首帧和尾帧，再配合视频提示词 | 是 | 首尾帧模型、强构图控制场景 |

### 6.2 默认策略

- 新项目默认 `multi_reference`，不改变旧体验。
- 用户选择“增强首帧稳定性”时使用 `storyboard_frame_reference`。
- 用户选择“首尾帧控制”或视频模型要求首尾帧时使用 `first_last_frame`。
- 若用户选了 `first_last_frame`，但视频模型不支持尾帧，则降级为 `startFrameOptional`，并在 UI 中提示。

## 7. 后端改造方案

### 7.1 新增运行时函数

建议新增文件：

```text
web/app/lib/agent/seedance-frames.ts
```

核心函数：

- `prepareFramePlan(projectName, episode, mode, modelId)`
- `generateTrackFrames(projectName, episode, framePlan, imageModelId)`
- `resolveTrackFrameRefs(projectName, episode, trackId)`
- `detectFrameStatus(projectName, episode)`

### 7.2 新增 API

| API | 方法 | 说明 |
| --- | --- | --- |
| `/api/projects/[name]/seedance/[episode]/frames` | GET | 读取 C4 帧图计划和状态 |
| `/api/projects/[name]/seedance/[episode]/frames` | POST | 启动帧图生成 |
| `/api/projects/[name]/seedance/[episode]/frames/status` | GET | 查询 C4 后台任务状态 |
| `/api/projects/[name]/seedance/[episode]/frames/[trackId]` | PATCH | 后续支持手动替换/重试 |

### 7.3 扩展执行器

`SeedanceStage` 从：

```ts
'A' | 'B' | 'C1' | 'C2' | 'C3' | 'D'
```

扩展为：

```ts
'A' | 'B' | 'C1' | 'C2' | 'C3' | 'C4' | 'D'
```

`C4` 为可选阶段。执行“全部生成”时的建议逻辑：

- 如果用户未开启帧图模式：`A -> B -> C1 -> C2 -> C3 -> D`
- 如果用户开启帧图模式：`A -> B -> C1 -> C2 -> C3 -> C4 -> D`

### 7.4 改造 D 阶段

在 `web/app/lib/agent/seedance-video.ts` 中改造引用图解析：

1. 先读取 `frame-plan.json`。
2. 如果当前 Track 有成功的 `startFrame/endFrame`：
   - `first_last_frame`：优先传首帧、尾帧。
   - `storyboard_frame_reference`：首帧作为第一参考图，再追加角色/场景/道具资产图。
3. 如果没有 C4 数据：
   - 完全回退当前 `resolveReferenceImages()` 逻辑。

### 7.5 视频模型配置扩展

建议在 `config/models/video/*.json` 增加可选字段：

```json
{
  "capabilities": {
    "videoInputModes": [
      "text",
      "multiReference",
      "startFrameOptional",
      "startEndRequired"
    ],
    "maxReferenceImages": 9,
    "supportsLastFrame": true
  }
}
```

兼容规则：

- 旧配置只有 `mode: "multiReference"` 时，自动推断支持 `multiReference`。
- 旧配置没有 `capabilities` 时，不影响现有视频生成。

## 8. C4 帧图提示词生成规则

C4 不应该另起一套自由发挥体系，必须从 C2/C3 派生：

| 输入 | 用途 |
| --- | --- |
| `storyboard-table.json` | 提取 Track 首镜/尾镜的画面、动作、景别、光影、资产 |
| `02-prompts.md` | 继承视频叙事的风格、时间轴、首帧原则 |
| `assets.json` | 提供角色 identityAnchor、场景和道具参考图 |
| `director-plan.json` | 继承整体光影、色彩、情绪 |

首帧 prompt 核心：

- 描述动作准备姿态，不描述动作顶点。
- 锁定角色画面位置、朝向、景别、环境光线。
- 必须引用首镜所需资产图。

尾帧 prompt 核心：

- 描述动作完成后的稳定状态。
- 保持同一场景空间连续。
- 若跨场景 Track，优先建议拆 Track；不强行生成跨场景尾帧。

## 9. 前端改造方案

### 9.1 管线图

`PipelineGraph.tsx` 新增节点：

```text
C4 帧画面
```

状态来源新增 `pipelineStatus.frames`。

### 9.2 节点详情

`NodeDetailPanel.tsx` 新增 C4 内容：

- Track 列表。
- 首帧/尾帧缩略图。
- 生成状态、失败原因。
- 重新生成按钮。
- P1 支持手动替换图片。

### 9.3 对话指令

`ProductionChatPanel.tsx` 新增直接指令：

- `生成帧图`
- `生成首尾帧`
- `开始C4`
- `用首尾帧生成视频`

发送 C4 请求时使用当前选择的图像模型 `selectedImageModelId`。

### 9.4 模式选择

建议在制作助手的模型选择区域增加“视频输入模式”：

| 选项 | 默认 |
| --- | --- |
| 多参考图 | 是 |
| 分镜帧辅助 | 否 |
| 首尾帧 | 否 |

选择后存到 localStorage，例如：

```text
toonflow:production:videoInputMode
```

后续可以保存到项目级配置。

## 10. Skill 与文档改造

### 10.1 新增 Skill

建议新增：

```text
skills/seedance-frame.md
```

职责：

- 读取 C2/C3/资产数据。
- 为每个 Track 生成首帧/尾帧图像 prompt。
- 输出 `frame-plan.json`。
- 不负责调用图片 API，API 调用由 `seedance-frames.ts` 执行。

### 10.2 更新现有 Skill

| 文件 | 改造点 |
| --- | --- |
| `skills/seedance-storyboard-prompt.md` | 明确 C3 仍是视频提示词，不生成图片 |
| `skills/seedance-video.md` | 增加帧图优先策略和降级逻辑 |
| `schemas/storyboard-table.schema.json` | 增加可选帧图字段 |
| `docs/seedance-pipeline.md` | 更新为 6+1 阶段，说明 C4 可选 |

## 11. 实施计划

### Phase 1：数据与模式底座

- 定义 `VideoInputMode`、`FramePlan`、`FrameTask` 类型。
- 新增 `seedance-frames.ts` 的读写函数。
- 扩展 `detectPipelineStatus()`，增加 `frames` 状态。
- 不接入真实图像生成，先能读写空计划。

### Phase 2：C4 帧图生成 API

- 新增 `/frames` API。
- 复用 `generateImage()`，支持把资产图作为 `urls` 参考图传入。
- 保存 `frames/Txx/start.png` 和 `frames/Txx/end.png`。
- 写入 `frame-plan.json` 和 `frames/tasks.json`。

### Phase 3：D 阶段接入帧图

- 改造 `resolveReferenceImages()`，增加帧图优先读取。
- 改造 `buildVideoBody()`，按模型能力输出 `first_frame/last_frame/reference_image`。
- 扩展 `video-tasks.json` 记录 `inputMode/frameRefs/assetRefs`。
- 保证无帧图时旧逻辑完全可用。

### Phase 4：前端节点与操作

- `PipelineGraph` 增加 C4。
- `NodeDetailPanel` 增加帧图内容。
- `ProductionChatPanel` 增加 C4 指令和模式选择。
- D 节点展示实际采用的输入模式。

### Phase 5：验证与回归

- 用已有 `造化之门/ep1` 做非破坏性验证。
- 验证三条链路：
  - 旧链路：C3 -> D。
  - 新链路：C3 -> C4 -> D，分镜帧辅助。
  - 新链路：C3 -> C4 -> D，首尾帧。
- 验证构建：`npm run lint`、`npm run build`。

## 12. 风险与处理

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| Track 内跨场景太多 | 首尾帧不连贯 | C4 检测跨场景 Track，提示拆 Track 或只生成关键帧 |
| 帧图与角色资产不一致 | 视频角色漂移 | 帧图生成强制引用资产图和 identityAnchor |
| 模型不支持尾帧 | D 阶段失败 | 根据 capabilities 自动降级为首帧模式 |
| C4 增加成本和时间 | 制作耗时上升 | C4 默认关闭，用户按需开启 |
| 图片任务失败 | 卡住视频流程 | C4 失败不阻塞旧 D，允许回退多参考图 |

## 13. 验收标准

P0 完成标准：

- 旧项目不生成 C4，也能正常从 C3 进入 D。
- 开启 C4 后，每个 Track 至少能生成首帧图；首尾帧模式能生成 start/end 两张图。
- D 阶段能读取 C4 帧图并作为视频输入。
- `video-tasks.json` 能记录每个 Track 的输入模式和帧图路径。
- UI 能看到 C4 节点状态和生成结果。

P1 完成标准：

- 支持单个 Track 重试。
- 支持手动替换首帧/尾帧。
- D 节点能展示“本次视频用了哪些帧图和资产图”。

## 14. 建议优先实现的最小闭环

第一版只做 Track 级 `startFrameOptional`：

1. C4 为每个 Track 生成一张 `start.png`。
2. D 阶段把 `start.png` 作为第一参考图或 `first_frame`。
3. 暂不生成尾帧，不改 Track 分组。

这样改动最小，能先解决“首帧画面不可控”的主要问题；等稳定后再补 `end.png` 和真正首尾帧模式。
