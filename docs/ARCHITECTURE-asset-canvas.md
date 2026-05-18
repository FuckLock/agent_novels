# 技术架构方案：资产管理完善 + 制作画布新建

> 版本：v1.0 | 日期：2026-04-12
> 基于：`docs/PRD-asset-canvas.md` + `docs/DESIGN-asset-canvas.md` + `docs/execute_script_to_video.md`
> 架构师：web-architect

---

## 一、技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 框架 | Next.js 14+ (App Router) | 现有项目框架 |
| 语言 | TypeScript | 严格模式 |
| 样式 | Tailwind CSS | 现有方案 |
| 数据源 | `path.join(process.cwd(), '..', 'novels')` | 文件系统，禁止硬编码 |
| 模型配置 | `path.join(process.cwd(), '..', 'config')` | 现有 CONFIG_DIR |
| 流式通信 | SSE (Server-Sent Events) | 现有 Agent 对话方案 |
| 并发控制 | 进程内 Map 锁 + p-limit 模式 | 现有 assetLocks 方案 |

---

## 二、AI 调用层设计

### 2.1 新增文件：`web/app/lib/ai-client.ts`

统一封装所有 AI 调用，分为语言模型调用和图片模型调用两类。

#### 2.1.1 语言模型调用（润色/导演分析/导演规划/分镜等）

**复用现有 `web/app/lib/agent/stream-model.ts`**，不重复造轮子。

```typescript
// ai-client.ts — 语言模型部分

import { resolveModel, callModel, callModelStream } from '@/app/lib/agent/stream-model';
import { getModelConfigs, ModelConfig } from '@/app/lib/novels';

/** 获取指定类型的模型列表 */
export async function getModels(type: 'language' | 'image' | 'video'): Promise<ModelConfig[]> {
  const configs = await getModelConfigs();
  return configs[type] || [];
}

/** 获取指定 modelId 的模型配置 */
export async function getModelById(modelId: string): Promise<ModelConfig | null> {
  const configs = await getModelConfigs();
  const all = [...configs.language, ...configs.image, ...configs.video];
  return all.find(m => m.modelId === modelId) ?? null;
}

/** 非流式调用语言模型（用于润色等短任务） */
export async function callLanguageModel(
  modelId: string,
  messages: { role: string; content: string }[]
): Promise<string> {
  const model = await resolveModel('chat', modelId);
  return callModel(model, messages);
}

/** 流式调用语言模型（用于 Agent 对话） */
export async function* streamLanguageModel(
  modelId: string,
  messages: { role: string; content: string }[]
): AsyncGenerator<string> {
  const model = await resolveModel('chat', modelId);
  yield* callModelStream(model, messages);
}
```

#### 2.1.2 图片模型调用（提交任务 -> 轮询 -> 下载）

参考 `Toonflow-app/src/routes/assetsGenerate/batchGenerateImageAssets.ts` 和 `config/models/image/banana.json` 的 API 结构。

```typescript
// ai-client.ts — 图片模型部分

export interface ImageTaskResult {
  taskId: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  imageUrl?: string;
  error?: string;
}

/** 提交图片生成任务 */
export async function submitImageTask(
  model: ModelConfig,
  prompt: string,
  options: { size?: string; aspectRatio?: string }
): Promise<string> {
  // model.api.submitUrl → POST，返回 taskId
  const res = await fetch(model.api.submitUrl!, {
    method: model.api.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${model.api.apiKey}`,
    },
    body: JSON.stringify({
      model: model.defaultParams?.model || model.modelId,
      prompt,
      size: options.size || model.defaultParams?.size || '2K',
      aspectRatio: options.aspectRatio || model.defaultParams?.aspectRatio || '16:9',
    }),
  });
  if (!res.ok) throw new Error(`图片任务提交失败: ${res.status}`);
  const data = await res.json();
  return data.taskId || data.id || data.task_id;
}

/** 轮询图片生成结果 */
export async function pollImageResult(
  model: ModelConfig,
  taskId: string,
  maxRetries = 60,
  intervalMs = 5000
): Promise<ImageTaskResult> {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(`${model.api.pollUrl}?taskId=${taskId}`, {
      headers: { 'Authorization': `Bearer ${model.api.apiKey}` },
    });
    if (!res.ok) throw new Error(`轮询失败: ${res.status}`);
    const data = await res.json();

    if (data.status === 'success' || data.state === 'completed') {
      return { taskId, status: 'success', imageUrl: data.url || data.imageUrl || data.image_url };
    }
    if (data.status === 'failed' || data.state === 'failed') {
      return { taskId, status: 'failed', error: data.error || data.message || '生成失败' };
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return { taskId, status: 'failed', error: '轮询超时' };
}

/** 下载图片到本地 */
export async function downloadImage(
  imageUrl: string,
  savePath: string
): Promise<void> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`下载图片失败: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const fs = await import('fs/promises');
  const path = await import('path');
  await fs.mkdir(path.dirname(savePath), { recursive: true });
  await fs.writeFile(savePath, buffer);
}
```

#### 2.1.3 错误处理和重试策略

| 场景 | 策略 |
|------|------|
| 语言模型 401/403 | 不重试，直接抛出"API Key 无效"（复用现有 stream-model.ts 逻辑） |
| 语言模型 429 | 最多重试 2 次，间隔 2s/3s（复用现有逻辑） |
| 图片提交失败 | 不重试，标记 asset.state='failed' |
| 图片轮询超时 | 60 次 x 5s = 5 分钟超时，标记 failed |
| 图片下载失败 | 重试 1 次，间隔 2s |

---

## 三、美术模板读取

### 3.1 新增函数：`web/app/lib/novels.ts`

```typescript
/** 读取美术风格目录列表 */
export async function getArtStyles(): Promise<string[]> {
  const stylesDir = path.join(CONFIG_DIR, 'art-styles');
  const entries = await fs.readdir(stylesDir, { withFileTypes: true });
  return entries.filter(e => e.isDirectory()).map(e => e.name);
}

/** 读取指定美术风格的模板文件内容 */
export async function getArtTemplate(
  style: string,
  templateName: string
): Promise<string> {
  const safe = safeName(style);
  const safeTpl = safeName(templateName);
  const filePath = path.join(CONFIG_DIR, 'art-styles', safe, safeTpl);
  return fs.readFile(filePath, 'utf-8');
}
```

润色时根据资产类型选择模板：

| 资产类型 | 基础模板 | 衍生模板 |
|---------|---------|---------|
| character | `prefix.md` + `art_character.md` | `art_character_derivative.md` |
| scene | `prefix.md` + `art_scene.md` | `art_scene_derivative.md` |
| prop | `prefix.md` + `art_prop.md` | `art_prop_derivative.md` |

---

## 四、API 设计

### 4.1 需改造的现有 API

| 接口路径 | 方法 | 当前状态 | 改造内容 |
|---------|------|---------|---------|
| `/api/projects/{name}/seedance/assets/batch-polish` | POST | 假实现（字符串拼接） | 真实调用语言模型，读取美术模板生成 prompt |
| `/api/projects/{name}/seedance/assets/batch-generate` | POST | 假实现（setTimeout） | 真实调用图片 API，提交任务->轮询->下载 |
| `/api/projects/{name}/seedance/{episode}/director` | GET | 只有 GET | 新增 POST（触发导演分析 AI 调用） |
| `/api/projects/{name}/seedance/{episode}/prompts` | GET | 只有 GET | 新增 POST（触发分镜提示词 AI 生成） |

### 4.2 需新增的 API

| 接口路径 | 方法 | 功能 | 优先级 |
|---------|------|------|--------|
| `/api/projects/{name}/production/pipeline-status` | GET | 返回管线各节点状态 | P0 |
| `/api/projects/{name}/production/chat` | POST | 制作 Agent 对话（SSE 流式） | P0 |
| `/api/projects/{name}/seedance/assets/{id}/regenerate` | POST | 单个资产重新生成图片 | P1 |
| `/api/projects/{name}/seedance/{episode}/director-plan` | GET+POST | 读取/触发导演规划 | P0(GET) P1(POST) |
| `/api/projects/{name}/seedance/{episode}/storyboard-table` | GET+POST | 读取/触发分镜表构建 | P0(GET) P1(POST) |
| `/api/projects/{name}/seedance/{episode}/videos` | GET | 列出已生成视频文件 | P2 |
| `/api/projects/{name}/seedance/assets/extract` | POST | 从导演分析自动提取资产 | P0 |
| `/api/settings/art-styles` | GET | 返回可用美术风格列表 | P0 |

### 4.3 各 API 请求/响应格式

#### 4.3.1 `POST /api/projects/{name}/seedance/assets/batch-polish`（改造）

**请求体（不变）**：
```json
{
  "assetIds": ["char-001", "scene-001"],
  "overwrite": false,
  "modelId": "deepseek-v4-pro",
  "artStyle": "3d-guoman"
}
```
> 新增 `modelId`（润色语言模型）和 `artStyle`（美术风格，默认从项目 description 的"影片画风"字段读取）。

**响应体（不变）**：
```json
{
  "batchId": "batch-polish-1712901234567",
  "total": 5,
  "skipped": 0
}
```

**后台处理逻辑改造**：
1. 读取 `skills/art-styles/{artStyle}/prefix.md`
2. 根据资产类型读取对应模板（`art_character.md` / `art_scene.md` / `art_prop.md`）
3. 拼接 system prompt = prefix + 类型模板
4. 调用 `callLanguageModel(modelId, [{ role: 'system', content: systemPrompt }, { role: 'user', content: 资产描述 }])`
5. 解析 AI 输出，提取 `[PROMPT]` 和 `[ARTSTYLE]` 部分
6. 角色资产额外提取 `identityAnchor`（在 system prompt 中要求 AI 输出）
7. 写入 assets.json

#### 4.3.2 `POST /api/projects/{name}/seedance/assets/batch-generate`（改造）

**请求体（不变）**：
```json
{
  "assetIds": ["char-001", "scene-001"],
  "modelId": "nano-banana",
  "resolution": "2K",
  "overwrite": false
}
```

**后台处理逻辑改造**：
1. 从 `getModelById(modelId)` 获取图片模型配置
2. 使用并发控制（最多 5 并行），逐个资产：
   a. `submitImageTask(model, asset.prompt, { size: resolution })`
   b. 更新 asset.apiTaskId + state='generating'
   c. `pollImageResult(model, taskId)`
   d. 成功：`downloadImage(url, savePath)` -> 更新 state/imagePath/generatedAt
   e. 失败：更新 state='failed' + error
3. 图片保存路径：`novels/{name}/seedance/images/{type}/{assetName}.png`
   - type 映射：character -> characters, scene -> scenes, prop -> props

#### 4.3.3 `GET /api/projects/{name}/production/pipeline-status`（新增）

**响应体**：
```json
{
  "episodes": [
    {
      "episode": 1,
      "title": "困境·牺牲·秘密",
      "nodes": {
        "A": { "status": "completed", "file": "ep01/01-director.md" },
        "B": { "status": "completed", "assetCount": 8, "successCount": 5 },
        "C1": { "status": "pending" },
        "C2": { "status": "pending" },
        "C3": { "status": "pending" },
        "D": { "status": "pending" }
      }
    }
  ]
}
```

**状态检测逻辑**（复用 PRD 中的判断规则）：

```typescript
async function detectNodeStatus(projectName: string, episode: number) {
  const base = path.join(NOVELS_DIR, safeName(projectName), 'seedance');
  const epDir = path.join(base, `ep${episode}`);

  return {
    A: await fileExists(path.join(epDir, '01-director.md')) ? 'completed' : 'pending',
    B: await checkAssetStatus(projectName),
    C1: await fileExists(path.join(epDir, 'director-plan.json')) ? 'completed' : 'pending',
    C2: await fileExists(path.join(epDir, 'storyboard-table.json')) ? 'completed' : 'pending',
    C3: await fileExists(path.join(epDir, '02-prompts.md')) ? 'completed' : 'pending',
    D: await hasVideoFiles(path.join(epDir, 'videos')),
  };
}
```

#### 4.3.4 `POST /api/projects/{name}/production/chat`（新增 — SSE）

**请求体**：
```json
{
  "message": "开始分析",
  "episode": 1,
  "modelId": "deepseek-v4-pro",
  "stage": "A"
}
```

**SSE 响应事件格式**（复用现有 `SSEEvent` 类型）：
```
event: text
data: {"type":"text","data":"正在分析第1集剧本...","agentLabel":"制作助手"}

event: status
data: {"type":"status","data":"executing_stage_A"}

event: progress
data: {"type":"progress","data":"{\"stage\":\"B\",\"current\":3,\"total\":8,\"item\":\"叶真\"}"}

event: action
data: {"type":"action","data":"{\"buttons\":[{\"id\":\"continue\",\"label\":\"继续\"},{\"id\":\"goto_tab4\",\"label\":\"去塑造Tab\"}]}"}

event: pipeline_update
data: {"type":"pipeline_update","data":"{\"node\":\"A\",\"status\":\"completed\"}"}

event: done
data: {"type":"done","data":""}
```

#### 4.3.5 `POST /api/projects/{name}/seedance/assets/extract`（新增）

**请求体**：
```json
{
  "episode": 1,
  "artStyle": "3d-guoman"
}
```

**功能**：解析 `ep{N}/01-director.md` 中的人物清单和场景清单，提取资产写入 `assets.json`。

**响应体**：
```json
{
  "extracted": {
    "characters": ["叶真", "齐云山长老"],
    "scenes": ["山门广场", "藏经阁"],
    "props": ["修炼玉佩"]
  },
  "skipped": 2,
  "total": 5
}
```

**提取逻辑**：
1. 读取 `01-director.md` 内容
2. 用正则匹配人物清单、场景清单部分（markdown 格式，`### 角色` / `### 场景` 等标题下的列表）
3. 与现有 assets.json 比对，跳过同名资产
4. 新资产写入 assets.json（复用 `addSeedanceAsset` 函数）

#### 4.3.6 `POST /api/projects/{name}/seedance/{episode}/director`（改造 — 新增 POST）

**请求体**：
```json
{
  "modelId": "deepseek-v4-pro"
}
```

**功能**：读取 `scripts/episode-{N}.txt`，调用语言模型进行导演分析，产出写入 `seedance/ep{N}/01-director.md`。

**SSE 流式响应**（与 production/chat 相同格式）。

#### 4.3.7 `GET /api/settings/art-styles`（新增）

**响应体**：
```json
{
  "styles": [
    {
      "id": "3d-guoman",
      "files": ["prefix.md", "art_character.md", "art_scene.md", "art_prop.md", ...]
    }
  ]
}
```

---

## 五、数据流设计

### 5.1 assets.json 读写流程

**并发安全机制**：复用现有 `assetLocks`（`web/app/lib/novels.ts` 第 1180 行），基于 `Map<string, Promise<void>>` 的顺序写锁。

```
读取：直接读 fs（无锁，多读安全）
写入：withAssetLock(projectName, async () => { 读->改->写 })
```

**数据结构**：遵循 `schemas/assets.schema.json`，数组格式，每项为 `SeedanceAsset`。

**向后兼容**：读取时优先 `assets.json`，fallback `manifest.json`（已有逻辑）。

### 5.2 tasks.json 任务跟踪

**路径**：`novels/{name}/seedance/tasks.json`

**结构**：
```typescript
interface TaskRecord {
  batchId: string;
  type: 'polish' | 'generate' | 'director' | 'plan' | 'storyboard' | 'prompts' | 'video';
  assetIds?: string[];
  episode?: number;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  status: 'running' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  modelId?: string;
  resolution?: string;
}
```

已有 `saveBatchTask` 函数，需扩展支持新的 type 枚举值。

### 5.3 文件存储路径规范

| 产出类型 | 路径 | 来源阶段 |
|---------|------|---------|
| 导演分析 | `novels/{name}/seedance/ep{N}/01-director.md` | A |
| 资产数据 | `novels/{name}/seedance/assets.json` | B1 |
| 角色图片 | `novels/{name}/seedance/images/characters/{name}.png` | B3 |
| 场景图片 | `novels/{name}/seedance/images/scenes/{name}.png` | B3 |
| 道具图片 | `novels/{name}/seedance/images/props/{name}.png` | B3 |
| 导演规划 | `novels/{name}/seedance/ep{N}/director-plan.json` | C1 |
| 分镜表 | `novels/{name}/seedance/ep{N}/storyboard-table.json` | C2 |
| 分镜提示词 | `novels/{name}/seedance/ep{N}/02-prompts.md` | C3 |
| 视频文件 | `novels/{name}/seedance/ep{N}/videos/P{NN}.mp4` | D |
| 任务记录 | `novels/{name}/seedance/tasks.json` | 全局 |

---

## 六、画布 Agent 设计（productionAgent）

### 6.1 架构定位

productionAgent 是制作画布（Tab 5）的核心 Agent，负责：
- 感知管线状态
- 理解用户意图
- 调用各阶段 API 执行任务
- 流式汇报进度

**与现有 ContentWorkbench Agent 的关系**：
- ContentWorkbench Agent（`web/app/lib/agent/`）负责剧本生成（骨架/改编/剧本）
- productionAgent 负责制作流程（导演分析/资产/分镜/视频）
- **两者共用 `stream-model.ts` 和 `ai-client.ts`，但各有独立的 prompts 和 executor**

### 6.2 新增文件

```
web/app/lib/production-agent/
  types.ts          — 管线状态、Agent 消息类型定义
  prompts.ts        — productionAgent 的 system prompt 构建
  executor.ts       — 各阶段执行器（调用后端 API）
  pipeline.ts       — 管线状态检测与前置条件校验
```

### 6.3 Agent 感知管线状态

Agent 每次收到消息时，先调用 `pipeline-status` API 获取完整管线状态，注入 system prompt。

```typescript
// production-agent/pipeline.ts

export type NodeId = 'A' | 'B' | 'C1' | 'C2' | 'C3' | 'D';
export type NodeStatus = 'pending' | 'running' | 'completed';

export interface PipelineState {
  episode: number;
  nodes: Record<NodeId, { status: NodeStatus; meta?: Record<string, unknown> }>;
}

/** 前置条件映射 */
export const PREREQUISITES: Record<NodeId, NodeId[]> = {
  A: [],
  B: ['A'],
  C1: ['A', 'B'],
  C2: ['C1'],
  C3: ['C2'],
  D: ['C3'],
};

/** 检查某节点的前置条件是否满足 */
export function checkPrerequisites(state: PipelineState, node: NodeId): {
  satisfied: boolean;
  missing: NodeId[];
} {
  const required = PREREQUISITES[node];
  const missing = required.filter(n => state.nodes[n].status !== 'completed');
  return { satisfied: missing.length === 0, missing };
}
```

### 6.4 Agent 调用各阶段 API

```typescript
// production-agent/executor.ts

export type StageAction =
  | { stage: 'A'; episode: number; modelId: string }
  | { stage: 'B_extract'; episode: number }
  | { stage: 'B_polish'; assetIds: string[]; modelId: string; artStyle: string }
  | { stage: 'B_generate'; assetIds: string[]; modelId: string; resolution: string }
  | { stage: 'C1'; episode: number; modelId: string }
  | { stage: 'C2'; episode: number; modelId: string }
  | { stage: 'C3'; episode: number; modelId: string }
  | { stage: 'D'; episode: number; modelId: string };

/** 执行某阶段，返回 SSE 流 */
export async function executeStage(
  projectName: string,
  action: StageAction,
  send: (event: SSEEvent) => void
): Promise<void> {
  // 根据 action.stage 分发到对应 API
  // 例如 stage='A' -> POST /api/projects/{name}/seedance/{episode}/director
  // 每个 API 内部流式返回，executor 转发 SSE 事件
}
```

### 6.5 对话消息格式

扩展现有 `SSEEvent` 类型，新增 production 专用事件：

```typescript
// production-agent/types.ts

export interface ProductionSSEEvent {
  type: 'text' | 'status' | 'progress' | 'action' | 'pipeline_update' | 'error' | 'done';
  data: string;
  agentLabel?: string;
}

/** 进度数据（嵌入 progress 事件的 data 中） */
export interface ProgressData {
  stage: string;
  current: number;
  total: number;
  item?: string;
}

/** 操作按钮数据（嵌入 action 事件的 data 中） */
export interface ActionData {
  buttons: { id: string; label: string; action?: string }[];
}

/** 管线更新数据 */
export interface PipelineUpdateData {
  node: NodeId;
  status: NodeStatus;
}
```

### 6.6 Agent System Prompt 结构

```typescript
// production-agent/prompts.ts

export function buildProductionSystemPrompt(
  projectName: string,
  episode: number,
  pipelineState: PipelineState,
  scriptContent?: string
): string {
  return `你是 Toonflow 制作助手，负责引导用户完成从剧本到视频的制作管线。

## 当前项目
- 项目名：${projectName}
- 当前集数：第 ${episode} 集

## 管线状态
${formatPipelineState(pipelineState)}

## 你的能力
- 执行导演分析（A阶段）
- 从导演分析提取资产并触发润色和生图（B阶段）
- 执行导演规划（C1）、构建分镜表（C2）、生成提示词（C3）
- 触发视频生成（D阶段）

## 交互规则
1. 首次对话时，汇报当前管线状态，建议下一步操作
2. 识别用户意图：开始/继续/跳到某阶段/全部执行/停止
3. 执行前检查前置条件，不满足时明确告知缺什么
4. 执行过程中流式汇报进度
5. 每步完成后提供快捷操作按钮（继续/去塑造Tab/查看产出）
6. 用户说"都生成吧"或"全部自动"时，按 A→B→C1→C2→C3 顺序执行（D 需确认）
`;
}
```

### 6.7 意图识别

productionAgent 的意图分类不依赖 AI 调用，使用关键词匹配 + 简单规则：

```typescript
export type ProductionIntent =
  | 'start_stage'      // "开始分析"、"执行C1"
  | 'continue'         // "继续"、"下一步"
  | 'auto_all'         // "全部执行"、"都生成吧"
  | 'stop'             // "停"、"暂停"
  | 'check_status'     // "当前进度"、"看看状态"
  | 'goto_tab'         // "去塑造Tab"、"看看资产"
  | 'view_output'      // "看看导演分析"
  | 'chat';            // 其他对话

export function classifyIntent(message: string, pipelineState: PipelineState): ProductionIntent {
  // 关键词匹配，无需调用 AI
}
```

---

## 七、组件架构

### 7.1 Tab 5 组件树

```
ProductionCanvas（主容器，替换现有 ProductionTab）
├── PipelineCanvasPanel（左侧 60%）
│   ├── EpisodeSelector（集数下拉选择器）
│   ├── PipelineGraph（管线节点图）
│   │   ├── PipelineNode × 6（单个节点：A/B/C1/C2/C3/D）
│   │   └── PipelineConnector × 5（节点间连线）
│   └── NodeDetailPanel（节点详情展开区）
│       ├── DirectorSection（A — 复用现有）
│       ├── AssetPreviewGrid（B — 新建）
│       ├── DirectorPlanViewer（C1 — 新建）
│       ├── StoryboardTableViewer（C2 — 新建）
│       ├── StoryboardPrompts（C3 — 复用现有）
│       └── VideoGrid（D — 新建）
└── ProductionChatPanel（右侧 40%）
    ├── StageLabel（阶段标签栏）
    ├── ChatMessageList（对话消息列表）
    │   ├── AgentMessage（Agent 气泡 + Markdown 渲染）
    │   ├── UserMessage（用户气泡）
    │   ├── ProgressMessage（进度条消息）
    │   └── ActionButtons（快捷操作按钮）
    └── ChatInputBar（底部输入区）
        ├── ModelSelector（复用现有）
        └── SendButton / StopButton
```

### 7.2 Tab 4 改动组件

```
AssetsTab（现有）
├── DirectorAnalysisBar（新增 — 导演讲戏入口）
├── BatchPanel（现有，新增润色模型下拉）
├── AssetCardGrid（不变）
├── AssetDetailDrawer（现有，新增 RegenerateBar）
│   └── RegenerateBar（新增 — 模型选择 + 重新生成按钮）
└── ...其他不变组件
```

### 7.3 Tab 3 改动组件

```
ScriptHeader（现有）
├── 移除：提取资产按钮 + extracting 状态
└── 新增：StartProductionButton（跳转 Tab 5）
```

### 7.4 新增组件清单

| 组件 | 路径 | 功能 | 优先级 |
|------|------|------|--------|
| ProductionCanvas | `tabs/ProductionCanvas.tsx` | Tab 5 主容器，双栏布局 | P0 |
| PipelineCanvasPanel | `tabs/production-canvas/PipelineCanvasPanel.tsx` | 左侧画布区 | P0 |
| EpisodeSelector | `tabs/production-canvas/EpisodeSelector.tsx` | 集数下拉选择器 | P0 |
| PipelineGraph | `tabs/production-canvas/PipelineGraph.tsx` | 管线节点图 | P0 |
| PipelineNode | `tabs/production-canvas/PipelineNode.tsx` | 单个管线节点 | P0 |
| PipelineConnector | `tabs/production-canvas/PipelineConnector.tsx` | 节点间连线 | P0 |
| NodeDetailPanel | `tabs/production-canvas/NodeDetailPanel.tsx` | 节点详情展开 | P1 |
| ProductionChatPanel | `tabs/production-canvas/ProductionChatPanel.tsx` | 右侧对话面板 | P0 |
| StageLabel | `tabs/production-canvas/StageLabel.tsx` | 阶段标签 | P0 |
| ProgressMessage | `tabs/production-canvas/ProgressMessage.tsx` | 进度消息气泡 | P0 |
| ActionButtons | `tabs/production-canvas/ActionButtons.tsx` | 快捷操作按钮 | P0 |
| AssetPreviewGrid | `tabs/production-canvas/AssetPreviewGrid.tsx` | B 节点资产预览 | P1 |
| DirectorPlanViewer | `tabs/production-canvas/DirectorPlanViewer.tsx` | C1 六维度展示 | P2 |
| StoryboardTableViewer | `tabs/production-canvas/StoryboardTableViewer.tsx` | C2 分镜表格 | P1 |
| VideoGrid | `tabs/production-canvas/VideoGrid.tsx` | D 视频网格 | P2 |
| DirectorAnalysisBar | `tabs/assets/DirectorAnalysisBar.tsx` | Tab 4 导演讲戏入口 | P0 |
| RegenerateBar | `tabs/assets/RegenerateBar.tsx` | Tab 4 详情抽屉重新生成 | P1 |
| StartProductionButton | `tabs/scripts/StartProductionButton.tsx` | Tab 3 开始制作按钮 | P0 |

### 7.5 状态管理方案

**不引入全局状态库**，使用 React 自带方案：

| 状态 | 管理方式 | 说明 |
|------|---------|------|
| 管线节点状态 | `useState` + API 轮询 | ProductionCanvas 持有，通过 props 下传 |
| 当前集数 | `useState` | ProductionCanvas 持有 |
| 当前展开节点 | `useState<NodeId | null>` | PipelineCanvasPanel 持有 |
| 对话历史 | `useState<ChatMessage[]>` | ProductionChatPanel 持有 |
| 生成中状态 | `useState<boolean>` | ProductionChatPanel 持有 |
| SSE 连接 | `useRef<AbortController>` | ProductionChatPanel 持有 |
| 模型列表 | `useState` + `useEffect` fetch | ProductionCanvas 顶层加载一次 |

**跨组件通信**：
- 画布 -> 对话面板：ProductionCanvas 持有 `onNodeClick` 回调，更新 ChatPanel 的当前阶段
- 对话面板 -> 画布：Agent 发出 `pipeline_update` 事件时，ProductionCanvas 刷新管线状态
- Tab 切换：通过父组件 `ProjectDetailPage` 的 `activeTab` state + URL 参数 `?ep=N`

---

## 八、目录结构

```
web/app/
├── api/
│   ├── projects/[name]/
│   │   ├── production/
│   │   │   ├── pipeline-status/route.ts     ← 新增
│   │   │   └── chat/route.ts                ← 新增（SSE）
│   │   └── seedance/
│   │       ├── assets/
│   │       │   ├── batch-polish/route.ts     ← 改造
│   │       │   ├── batch-generate/route.ts   ← 改造
│   │       │   ├── extract/route.ts          ← 新增
│   │       │   └── [id]/
│   │       │       └── regenerate/route.ts   ← 新增
│   │       └── [episode]/
│   │           ├── director/route.ts         ← 改造（新增 POST）
│   │           ├── director-plan/route.ts    ← 新增
│   │           ├── storyboard-table/route.ts ← 新增
│   │           ├── prompts/route.ts          ← 改造（新增 POST）
│   │           └── videos/route.ts           ← 新增
│   └── settings/
│       └── art-styles/route.ts               ← 新增
├── lib/
│   ├── ai-client.ts                          ← 新增（AI 调用统一封装）
│   ├── novels.ts                             ← 扩展（新增 getArtStyles/getArtTemplate 等）
│   ├── agent/                                ← 不变（内容创作 Agent）
│   └── production-agent/                     ← 新增（制作 Agent）
│       ├── types.ts
│       ├── prompts.ts
│       ├── executor.ts
│       └── pipeline.ts
└── projects/[name]/tabs/
    ├── ProductionCanvas.tsx                   ← 新增（替换 ProductionTab）
    ├── production-canvas/                     ← 新增目录
    │   ├── PipelineCanvasPanel.tsx
    │   ├── EpisodeSelector.tsx
    │   ├── PipelineGraph.tsx
    │   ├── PipelineNode.tsx
    │   ├── PipelineConnector.tsx
    │   ├── NodeDetailPanel.tsx
    │   ├── ProductionChatPanel.tsx
    │   ├── StageLabel.tsx
    │   ├── ProgressMessage.tsx
    │   ├── ActionButtons.tsx
    │   ├── AssetPreviewGrid.tsx
    │   ├── DirectorPlanViewer.tsx
    │   ├── StoryboardTableViewer.tsx
    │   └── VideoGrid.tsx
    ├── assets/
    │   ├── DirectorAnalysisBar.tsx            ← 新增
    │   └── RegenerateBar.tsx                  ← 新增
    └── scripts/
        └── StartProductionButton.tsx          ← 新增
```

---

## 九、依赖包清单

| 包名 | 用途 | 版本 | 状态 |
|------|------|------|------|
| next | 框架 | 14+ | 已有 |
| react | UI 库 | 18+ | 已有 |
| typescript | 类型系统 | 5+ | 已有 |
| tailwindcss | 样式 | 3+ | 已有 |

**不需要新增任何 npm 包**。理由：
- 并发控制：用原生 Promise + 计数器实现（参考 Toonflow-app 的 p-limit 用法，但无需引入包，5 并发手写即可）
- SSE：用原生 `ReadableStream` + `TextEncoder`（复用现有 Agent 对话的 SSE 方案）
- Markdown 渲染：复用现有 `MarkdownPreview` 组件
- 状态管理：React 自带 `useState`/`useRef`

---

## 十、开发顺序建议

### Phase 1：基础设施（P0）

1. **`ai-client.ts`**：统一 AI 调用封装
2. **`novels.ts` 扩展**：`getArtStyles`、`getArtTemplate`、`detectPipelineStatus`
3. **`production-agent/`**：types、pipeline、prompts

### Phase 2：Tab 4 真实实现（P0）

4. **改造 `batch-polish`**：接入真实语言模型 + 美术模板
5. **改造 `batch-generate`**：接入真实图片 API
6. **新增 `art-styles` API**

### Phase 3：Tab 5 画布骨架（P0）

7. **`ProductionCanvas`** + 双栏布局
8. **`PipelineGraph`** + 节点状态检测 API
9. **`ProductionChatPanel`** + production/chat SSE API

### Phase 4：Tab 5 Agent 驱动（P0）

10. **`production-agent/executor.ts`**：各阶段执行
11. **`assets/extract` API**：导演分析后自动提取
12. **Tab 3 按钮替换**

### Phase 5：展示组件（P1/P2）

13. **`NodeDetailPanel`** + 各节点展示组件
14. **`DirectorAnalysisBar`** + **`RegenerateBar`**（Tab 4 增强）
15. **`StoryboardTableViewer`**、**`DirectorPlanViewer`**、**`VideoGrid`**
