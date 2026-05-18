# 图像模型设置页改造计划：官方 OpenAI + 第三方 GRSAI

> 状态：已执行 `Parse 1R` 返工修正，新增图像模型已改为“平台来源优先”
> 日期：2026-04-27
> 范围：设置页如何展示、保存和调用“官方图片模型 / 第三方图片平台”。
> 执行标注：已拆成 `Parse 1`、`Parse 2`、`Parse 3`、`Parse 4`，后续可按块实施。

## 执行记录

- 2026-04-27：已实现 `Parse 1` 设置页展示与配置保存。
- 2026-04-27：已实现 `Parse 2` 第三方 GRSAI / Nano Banana 运行时。
- 2026-04-27：已实现 `Parse 3` 官方 OpenAI Images 运行时。
- 2026-04-27：已完成 `Parse 4` 基础验证：lint 无错误、build 通过、设置页 HTTP 200、图像模型测试接口返回 warn。
- 2026-04-27：用户反馈新增弹窗默认态和平台选择逻辑不合理。确认需要返工：新增时不应默认塞入 `GRSAI gpt-image-2`；应先选择平台，选择平台后自动填入平台 URL，再选择/填写远端模型。
- 2026-04-27：已执行 `Parse 1R` 返工：新增图像模型改为空白草稿；“平台预设”改为“平台来源”；选择 `OpenAI` 自动填 `baseUrl`；选择 `GRSAI` 自动填 `submitUrl/pollUrl`；远端模型选择后才建议 `modelId/name`；编辑模式锁定平台和 adapter。
- 2026-04-27：`Parse 1R` 验证结果：`npm run lint` 通过（0 errors，保留原有 16 warnings）；`npm run build` 通过；`/settings` HTTP 200；`/api/settings/models` 正常返回。

## 返工复盘：当前实现的问题

当前截图暴露的问题是产品逻辑问题，不是单纯样式问题：

1. **默认值不合理**
   - 新增图像模型一打开就默认 `grsai-gpt-image-2`、`GRSAI gpt-image-2`。
   - 用户还没有选择平台，系统已经替用户决定了平台和模型。
   - 这会让“新增”像是在编辑一个预置模型，而不是创建配置。

2. **平台预设和模型预设混淆**
   - 现在的“平台预设”下拉项是 `GRSAI gpt-image-2`，这其实是“平台 + 模型”的组合。
   - 正确关系应该是：
     - 第一步：选平台，例如 `OpenAI 官方` / `GRSAI 第三方`。
     - 第二步：平台 URL 自动填入。
     - 第三步：选或填写该平台下的远端模型，例如 `gpt-image-2` / `nano-banana-2`。

3. **URL 填充触发点不对**
   - 用户选中哪个平台，就应该立即把该平台的 URL 放进去。
   - 例如选择 `GRSAI`，应自动填：
     - `submitUrl = https://grsai.dakka.com.cn/v1/draw/completions`
     - `pollUrl = https://grsai.dakka.com.cn/v1/draw/result`
   - 选择 `OpenAI 官方`，应自动填：
     - `baseUrl = https://api.openai.com/v1`
     - endpoint 只读展示 `/images/generations`

4. **模型 ID / 显示名称生成时机不对**
   - 当前一打开就生成 `grsai-gpt-image-2`。
   - 正确应该在“平台 + 远端模型名”确定后自动建议：
     - `openai + gpt-image-2` -> `openai-gpt-image-2`
     - `grsai + gpt-image-2` -> `grsai-gpt-image-2`
     - `grsai + nano-banana-2` -> `grsai-nano-banana`
   - 用户仍然可以编辑显示名称和模型 ID。

5. **新增和编辑要分开**
   - 新增模式：平台可选，选平台后填 URL，选模型后建议名称。
   - 编辑模式：平台和 adapter 默认锁定，避免修改后把旧配置文件变成另一种协议；只允许改 API Key、URL、远端模型和参数。

返工结论：

- UI 不要叫“平台预设 = GRSAI gpt-image-2”。
- UI 应改为“平台来源”先行、“远端模型”后行。
- URL 的自动填充绑定在“平台来源”选择上，而不是绑定在“模型预设”选择上。

## 0. 复核结论

结论：设置页不能只按“第三方接口”设计，也不能把第三方网关伪装成官方 OpenAI。最稳的方式是：

1. 仍然统一放在“设置 -> 媒体模型 -> 图像”里。
2. 图像模型增加“平台来源”和“调用适配器”两个概念。
3. UI 上区分：
   - 官方 OpenAI：`OpenAI Images API`
   - 第三方平台：`GRSAI task-polling`
   - 自定义接口：后续扩展
4. 同一个远端模型名 `gpt-image-2` 可能同时出现在官方 OpenAI 和 GRSAI 网关里，但保存配置和调用协议必须分开。

官方 OpenAI 文档核对结论：

- 官方图片生成可走 Image API：`POST /v1/images/generations`，示例模型包含 `gpt-image-2`。
- 官方 GPT 图片模型默认返回 `data[0].b64_json`，不是 GRSAI 的“提交任务 id -> 轮询 URL”。
- 官方支持 `size`、`quality`、`output_format` 等输出参数；尺寸是 `1024x1024`、`1536x1024`、`1024x1536`、`auto` 这类像素规格，不是 GRSAI 的 `aspectRatio`。
- 官方 Responses API 也能通过 image generation tool 生图，但本计划第一版不走 Responses 工具链。

因此：

- `GRSAI gpt-image-2` 走 `grsai-task-polling`。
- `OpenAI gpt-image-2` 走 `openai-images`。
- 二者可以在设置页并存，模型卡片必须展示平台和适配器，避免用户误选。

## 1. 背景

当前项目已有 `config/models/image/banana.json`，它本质上是第三方平台封装后的图像生成接口：

- 提交接口：`POST https://grsai.dakka.com.cn/v1/draw/nano-banana`
- 轮询接口：`POST https://grsai.dakka.com.cn/v1/draw/result`
- 当前代码路径：`submitImageTask -> pollImageTask -> downloadImage`

用户现在提供了 GRSAI 的 `gpt-image-2` 接口：

- 提交接口：`POST https://grsai.dakka.com.cn/v1/draw/completions`
- 轮询接口：`POST https://grsai.dakka.com.cn/v1/draw/result`
- 如需立即返回任务 id 并轮询，请求体需要 `webHook: "-1"`。

同时，项目也应该允许配置官方 OpenAI 图片模型。官方接口与 GRSAI 的返回结构不同，不能复用同一个 task-polling 解析器。

## 2. 目标

1. 设置页能新增和编辑官方 OpenAI 图像模型。
2. 设置页能新增和编辑第三方 GRSAI 图像模型。
3. 图像模型卡片能清楚展示“平台来源 / 适配器 / 远端模型名”。
4. 后端根据 `adapter` 分发调用逻辑：
   - `openai-images`：直接生成，解析 `b64_json/url`，保存本地文件。
   - `grsai-task-polling`：提交任务，取 task id，轮询结果 URL，下载本地文件。
5. 保留 Nano Banana 现有能力，并兼容旧配置里的 `defaultParams.size`。
6. 不让用户在设置页面对一大坨 JSON；普通字段表单优先，高级设置折叠展示。

## 3. 非目标

1. 本阶段不做平台账号统一管理和密钥加密迁移。
2. 本阶段不做 GRSAI webhook 公网回调服务，只做轮询。
3. 本阶段不改 `novels/` 业务数据。
4. 本阶段不做 OpenAI Responses API image_generation tool。
5. 本阶段不做官方图片编辑、遮罩编辑、多轮编辑。
6. 本阶段不做任意 HTTP 平台的通用 `requestTemplate` 渲染器。
7. 本阶段不主动迁移历史 `.md` 文档里的明文 API Key，但新增设置页不应再生成带 Key 的 `.md` 文档。

## 4. 配置模型设计

建议在现有 `ModelConfig` 基础上新增可选字段：

```ts
type ImageAdapter = 'openai-images' | 'grsai-task-polling' | 'custom-http';

interface ModelConfig {
  modelId: string;
  name: string;
  type: 'language' | 'image' | 'video' | string;
  mode?: string;
  provider?: string;
  adapter?: ImageAdapter;
  enabled: boolean;
  api: {
    baseUrl?: string;
    submitUrl?: string;
    pollUrl?: string;
    apiKey?: string;
    apiKeyEnv?: string;
    method?: string;
    protocol?: string;
    version?: string;
  };
  defaultParams?: Record<string, unknown>;
  capabilities?: {
    aspectRatios?: string[];
    sizeOptions?: string[];
    qualityOptions?: string[];
    outputFormats?: string[];
    supportsReferenceImages?: boolean;
    sizeParam?: 'size' | 'imageSize' | null;
  };
}
```

说明：

1. `provider` 表示平台：`openai`、`grsai`、`custom`。
2. `adapter` 表示调用协议：`openai-images`、`grsai-task-polling`、`custom-http`。
3. `defaultParams` 存会进入请求体的默认参数。
4. `capabilities` 只给 UI 和调用层判断控件与字段，不一定直接进入请求体。

## 5. 设置页显示方案

入口不变：

- 设置
  - 语言模型
  - 媒体模型
    - 视频
    - 图像

图像模型“新增/编辑”弹窗分三层。

返工后的弹窗不是“模型预设优先”，而是“平台优先”。

### 5.0 新增模式的正确流程

新增图像模型打开时：

1. `模型 ID` 为空。
2. `显示名称` 为空。
3. `平台来源` 为空，placeholder 为“请选择平台”。
4. `API Key` 为空。
5. URL 区域不显示或显示灰色提示“选择平台后自动填入接口地址”。
6. 保存按钮禁用，直到平台、远端模型名、API Key、必要 URL 填完。

用户选择平台后：

| 选择平台 | 自动填入 | 后续显示 |
| --- | --- | --- |
| 官方 OpenAI | `baseUrl = https://api.openai.com/v1` | endpoint 只读 `/images/generations`，显示 size/quality/output_format |
| 第三方 GRSAI | `submitUrl = https://grsai.dakka.com.cn/v1/draw/completions`、`pollUrl = https://grsai.dakka.com.cn/v1/draw/result` | 显示远端模型选择、aspectRatio、webHook、shutProgress |
| 自定义 HTTP | 不自动填 URL | 显示自定义 URL 字段，但 V1 不建议开放为可用 |

用户选择或填写远端模型后：

| 平台 | 远端模型 | 自动建议模型 ID | 自动建议显示名称 |
| --- | --- | --- | --- |
| OpenAI | `gpt-image-2` | `openai-gpt-image-2` | `OpenAI gpt-image-2` |
| GRSAI | `gpt-image-2` | `grsai-gpt-image-2` | `GRSAI gpt-image-2` |
| GRSAI | `nano-banana-2` | `grsai-nano-banana` | `Nano Banana 图像生成` |

自动建议只在字段为空或仍是系统建议值时覆盖；如果用户手动改过模型 ID 或显示名称，不再强行覆盖。

### 5.1 基础区

| 字段 | 默认态 | 官方 OpenAI 示例 | 第三方 GRSAI 示例 | 说明 |
| --- | --- | --- | --- |
| 平台来源 | 空，必须选择 | 官方 OpenAI | 第三方 GRSAI | 下拉或分段控件，选择后立刻填 URL |
| 远端模型 | 平台未选时禁用 | gpt-image-2 | gpt-image-2 / nano-banana-2 | 平台下的模型，不等于平台 |
| 本地模型 ID | 远端模型确定后建议 | openai-gpt-image-2 | grsai-gpt-image-2 | 保存文件名和选择器值 |
| 显示名称 | 远端模型确定后建议 | OpenAI gpt-image-2 | GRSAI gpt-image-2 | 用户可编辑 |
| API Key | 空 | sk-xxx | sk-xxx | 密码框 |
| 启用 | true | true | true | 是否在生成面板可选 |

注意：不再使用“平台预设 = GRSAI gpt-image-2”这种文案。平台是平台，模型是模型。

### 5.2 协议区

根据适配器动态切换。

协议区只在选择平台后出现。

官方 OpenAI 显示：

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| Adapter | `openai-images` | 只读徽标 |
| Base URL | `https://api.openai.com/v1` | 可高级修改 |
| Endpoint | `/images/generations` | 只读或高级显示 |
| Size | `1024x1024` / `auto` | 像素尺寸，不是比例 |
| Quality | `auto` | 可选 `low/medium/high/auto` |
| Output format | `png` | 可选 `png/webp/jpeg` |
| Reference images | V1 关闭 | 后续编辑接口再开 |

触发规则：

- 选择“官方 OpenAI”平台后立即填 `baseUrl`。
- 不显示 `Submit URL / Poll URL`。
- endpoint `/images/generations` 只读展示，不要求用户手填。
- 远端模型默认可建议 `gpt-image-2`，但用户确认或填写后才生成模型 ID 和显示名。

第三方 GRSAI 显示：

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| Adapter | `grsai-task-polling` | 只读徽标 |
| Submit URL | `https://grsai.dakka.com.cn/v1/draw/completions` | 提交任务 |
| Poll URL | `https://grsai.dakka.com.cn/v1/draw/result` | 轮询任务 |
| Aspect ratio | `1:1` | GRSAI 比例 |
| webHook | `-1` | 立即返回 task id |
| shutProgress | `false` | 是否关闭过程进度 |
| Size | 不显示 | `gpt-image-2` 不传尺寸 |

触发规则：

- 选择“第三方 GRSAI”平台后立即填 `submitUrl` 和 `pollUrl`。
- 远端模型下拉提供：
  - `gpt-image-2`
  - `nano-banana-2`
  - 自定义填写
- 当远端模型选择 `gpt-image-2`：
  - `submitUrl` 使用 `/v1/draw/completions`
  - 不显示 size 控件
  - `capabilities.sizeParam = null`
- 当远端模型选择 `nano-banana-2`：
  - `submitUrl` 切换为 `/v1/draw/nano-banana`
  - 显示 `imageSize`
  - `capabilities.sizeParam = "imageSize"`

Nano Banana 作为 GRSAI 变体：

| 字段 | 默认值 |
| --- | --- |
| Submit URL | `https://grsai.dakka.com.cn/v1/draw/nano-banana` |
| Remote model | `nano-banana-2` |
| Size param | `imageSize` |
| Size options | `1K / 2K / 4K` |

### 5.3 高级区

默认折叠：

- 请求方法
- 轮询间隔
- 最大轮询次数
- 并发数
- 原始配置预览

第一版不开放直接编辑原始 JSON。等自定义 HTTP 适配器成熟后再开放。

## 6. 推荐配置示例

### 6.1 官方 OpenAI gpt-image-2

```json
{
  "modelId": "openai-gpt-image-2",
  "name": "OpenAI gpt-image-2",
  "type": "image",
  "mode": "text_to_image",
  "provider": "openai",
  "adapter": "openai-images",
  "enabled": true,
  "api": {
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "",
    "method": "POST"
  },
  "defaultParams": {
    "model": "gpt-image-2",
    "size": "1024x1024",
    "quality": "auto",
    "output_format": "png"
  },
  "capabilities": {
    "sizeOptions": ["auto", "1024x1024", "1536x1024", "1024x1536"],
    "qualityOptions": ["auto", "low", "medium", "high"],
    "outputFormats": ["png", "webp", "jpeg"],
    "supportsReferenceImages": false,
    "sizeParam": "size"
  }
}
```

### 6.2 第三方 GRSAI gpt-image-2

```json
{
  "modelId": "grsai-gpt-image-2",
  "name": "GRSAI gpt-image-2",
  "type": "image",
  "mode": "text_to_image",
  "provider": "grsai",
  "adapter": "grsai-task-polling",
  "enabled": true,
  "api": {
    "submitUrl": "https://grsai.dakka.com.cn/v1/draw/completions",
    "pollUrl": "https://grsai.dakka.com.cn/v1/draw/result",
    "apiKey": "",
    "method": "POST"
  },
  "defaultParams": {
    "model": "gpt-image-2",
    "aspectRatio": "1:1",
    "webHook": "-1",
    "shutProgress": false
  },
  "capabilities": {
    "aspectRatios": ["auto", "1:1", "3:2", "2:3", "16:9", "9:16", "5:4", "4:5", "4:3", "3:4", "21:9", "9:21", "1:3", "3:1", "2:1", "1:2"],
    "supportsReferenceImages": true,
    "sizeOptions": [],
    "sizeParam": null
  }
}
```

### 6.3 第三方 GRSAI Nano Banana

```json
{
  "modelId": "nano-banana",
  "name": "Nano Banana 图像生成",
  "type": "image",
  "mode": "text_to_image",
  "provider": "grsai",
  "adapter": "grsai-task-polling",
  "enabled": true,
  "api": {
    "submitUrl": "https://grsai.dakka.com.cn/v1/draw/nano-banana",
    "pollUrl": "https://grsai.dakka.com.cn/v1/draw/result",
    "apiKey": "",
    "method": "POST"
  },
  "defaultParams": {
    "model": "nano-banana-2",
    "imageSize": "2K",
    "aspectRatio": "16:9",
    "webHook": "-1",
    "shutProgress": false
  },
  "capabilities": {
    "aspectRatios": ["1:1", "16:9", "9:16", "4:3", "3:4"],
    "supportsReferenceImages": true,
    "sizeOptions": ["1K", "2K", "4K"],
    "sizeParam": "imageSize"
  }
}
```

兼容要求：旧 `banana.json` 使用 `defaultParams.size`，运行时要兼容；设置页新保存时统一用 `imageSize`。

## 7. 后端调用分发

建议把现有 `submitImageTask` 拆成适配器分发：

```ts
async function generateImage(model, prompt, options) {
  switch (model.adapter) {
    case 'openai-images':
      return generateOpenAIImage(model, prompt, options);
    case 'grsai-task-polling':
      return generateTaskPollingImage(model, prompt, options);
    default:
      throw new Error(`不支持的图像模型适配器：${model.adapter}`);
  }
}
```

### 7.1 OpenAI Images 适配器

处理规则：

1. 请求地址：`${baseUrl}/images/generations`。
2. 请求体：合并 `defaultParams`，覆盖 `model`、`prompt`、`size` 等。
3. 成功结果优先解析 `data[0].b64_json`。
4. 如返回 `data[0].url`，也支持下载 URL。
5. 保存本地文件，返回与现有 `ImageTaskResult` 等价的结果。
6. V1 不支持参考图 URL，不支持 edits endpoint。

### 7.2 GRSAI task-polling 适配器

处理规则：

1. 请求体以 `defaultParams` 为基础构建。
2. 必须带 `webHook: "-1"`，保证立即返回 task id。
3. 仅在本次确实有参考图时传 `urls`；无参考图时省略。
4. 仅在 `capabilities.sizeParam` 存在时传尺寸：
   - `sizeParam: "imageSize"` -> 写入 `imageSize`
   - `sizeParam: "size"` -> 写入 `size`
   - `sizeParam: null` -> 不传尺寸
5. task id 解析兼容：
   - 顶层 `id`
   - 顶层 `taskId`
   - 顶层 `task_id`
   - 嵌套 `data.id`
6. 轮询成功状态：`succeeded` / `success`。
7. 轮询失败状态：`failed`。
8. 失败原因优先级：`failure_reason` -> `error` -> `msg` -> `message`。
9. `code === -22` 显示“任务不存在或已过期”。
10. 成功拿到远端图片 URL 后立即下载到本地，因为 GRSAI 结果 URL 有有效期。

## 8. 模型选择与类型安全

当前 `batch-generate` 通过 `getModelById(modelId)` 在语言、图像、视频中混合查找，存在同名误取风险。

必须调整：

1. 图片生成只允许 `type === "image"`。
2. 后端 fallback 只从启用的图像模型中选默认模型。
3. 设置页保存时尽量校验 `modelId` 全局不重复。
4. 推荐新增 `getModelById(type, modelId)` 或 `getImageModelById(modelId)`。

## 9. 资产生成中的比例与尺寸规则

当前“塑造”资产生成会按资产类型覆盖比例：

```ts
character -> 1:1
scene -> 1:1
prop -> 1:1
```

这是合理的，因为角色、场景四视图、道具都需要稳定资产图。设置页里的默认比例/尺寸只作为模型默认值；资产生成时，以业务传入参数优先。

不同适配器的转换：

| 业务传入 | OpenAI Images | GRSAI task-polling |
| --- | --- | --- |
| `1:1` | `1024x1024` | `1:1` |
| `16:9` | `1536x1024` 或 `auto` | `16:9` |
| `9:16` | `1024x1536` 或 `auto` | `9:16` |

OpenAI 没有纯 `aspectRatio` 字段，所以需要做比例到 `size` 的映射；GRSAI 直接传 `aspectRatio`。

## 10. 执行标注

### Parse 1R：返工设置页平台优先流程

状态：已执行。

执行结果：

1. 新增图像模型打开时使用空白草稿，不再默认 `grsai-gpt-image-2`。
2. 设置页字段已拆成“平台来源”和“远端模型”，不再把 `GRSAI gpt-image-2` 作为平台预设。
3. 选择 `官方 OpenAI` 后自动写入 `https://api.openai.com/v1`，并展示只读 endpoint `/images/generations`。
4. 选择 `第三方 GRSAI` 后自动写入：
   - `https://grsai.dakka.com.cn/v1/draw/completions`
   - `https://grsai.dakka.com.cn/v1/draw/result`
5. 选择 `nano-banana-2` 时自动切到 `/v1/draw/nano-banana`，并显示 `imageSize` 控件。
6. `modelId/name` 只在远端模型确定后自动建议；用户手动改过后不再强制覆盖，保留“重新生成建议名称”入口。
7. 图像模型弹窗顺序改为平台优先，`modelId/name` 移到平台与远端模型配置之后。
8. 保存按钮补充图像模型必填校验：平台、远端模型、API Key、必要 URL 都满足后才可保存。
9. 编辑模式锁定平台来源和 adapter，只允许继续改 URL、API Key、远端模型和参数。

目标：修正当前实现的默认值和选择逻辑。新增时不默认 GRSAI 模型；先选平台，平台一选就自动填 URL。

改动点：

1. 新增图像模型打开时，`modelId/name/provider/adapter/defaultParams.model` 默认为空。
2. 把当前“平台预设”下拉改成“平台来源”：
   - `官方 OpenAI`
   - `第三方 GRSAI`
   - `自定义 HTTP`（可显示但 V1 不建议启用）
3. 选择 `官方 OpenAI` 后自动填：
   - `provider = openai`
   - `adapter = openai-images`
   - `api.baseUrl = https://api.openai.com/v1`
   - endpoint 只读展示 `/images/generations`
4. 选择 `第三方 GRSAI` 后自动填：
   - `provider = grsai`
   - `adapter = grsai-task-polling`
   - `api.submitUrl = https://grsai.dakka.com.cn/v1/draw/completions`
   - `api.pollUrl = https://grsai.dakka.com.cn/v1/draw/result`
   - `defaultParams.webHook = "-1"`
   - `defaultParams.shutProgress = false`
5. 选择平台后再显示远端模型选择。
6. 远端模型选定后再建议 `modelId/name`。
7. 用户手动修改过 `modelId/name` 后，后续平台或远端模型变更不强制覆盖用户输入，除非用户点击“重新生成建议名称”。
8. 编辑模式锁定平台来源和 adapter，只允许改 URL、API Key、远端模型和参数。

涉及文件：

- `web/app/settings/page.tsx`
- `web/app/settings/components/ModelEditModal.tsx`
- `web/app/settings/components/ImageModelPresetFields.tsx`
- `web/app/lib/model-presets.ts`

### Parse 1：设置页展示与配置保存（旧版，已发现需返工）

目标：先把 UI 和配置结构做对，让官方和第三方能清楚并存。

改动点：

1. 图像模型弹窗增加“平台来源 / 平台预设 / adapter”。
2. 官方 OpenAI 显示 `Base URL / size / quality / output_format`。
3. 第三方 GRSAI 显示 `Submit URL / Poll URL / aspectRatio / webHook / shutProgress`。
4. 模型卡片展示平台徽标：`官方 OpenAI`、`第三方 GRSAI`。
5. 保存 JSON 时写入 `provider`、`adapter`、`capabilities`。
6. 保证历史配置缺少 `api`、`adapter`、`capabilities` 时不会导致弹窗崩溃。

涉及文件：

- `web/app/settings/components/ModelEditModal.tsx`
- `web/app/settings/components/ModelConfigItem.tsx`
- `web/app/settings/components/MediaModelSection.tsx`
- `web/app/lib/novels.ts`

建议新增：

- `web/app/settings/components/ImageModelPresetFields.tsx`
- `web/app/lib/model-presets.ts`

### Parse 2：第三方 GRSAI / Nano Banana 运行时

目标：让 GRSAI `gpt-image-2` 和现有 Nano Banana 都能在“塑造”批量生图中稳定运行。

改动点：

1. 新增 `grsai-task-polling` 适配器。
2. `submit` 支持 `data.id`。
3. 自动带 `webHook: "-1"`。
4. `gpt-image-2` 不发送 `size/imageSize`。
5. Nano Banana 支持旧 `defaultParams.size` 和新 `defaultParams.imageSize`。
6. 轮询处理 `failure_reason`、`code !== 0`、`code === -22`。
7. 图片 URL 立即下载到本地。

涉及文件：

- `web/app/lib/ai-client.ts`
- `web/app/api/projects/[name]/seedance/assets/batch-generate/route.ts`
- `web/app/projects/[name]/tabs/assets/BatchPanel.tsx`
- `web/app/projects/[name]/tabs/assets/AssetEditForm.tsx`

### Parse 3：官方 OpenAI Images 运行时

目标：让官方 OpenAI 图片模型不是只“能配置”，而是真的能用于生成。

改动点：

1. 新增 `openai-images` 适配器。
2. 调用 `POST {baseUrl}/images/generations`。
3. 解析 `data[0].b64_json` 并保存本地图片。
4. 兼容 `data[0].url`。
5. 将业务比例映射到 OpenAI `size`。
6. V1 不支持官方参考图编辑；如果用户选择官方模型，参考图控件隐藏或禁用。

涉及文件：

- `web/app/lib/ai-client.ts`
- `web/app/api/projects/[name]/seedance/assets/batch-generate/route.ts`
- `web/app/projects/[name]/tabs/assets/BatchPanel.tsx`
- `web/app/projects/[name]/tabs/assets/AssetEditForm.tsx`

### Parse 4：测试与验收

目标：执行前 3 个 Parse 后统一验证。

验收项：

1. 设置页能新增并保存 `OpenAI gpt-image-2`。
2. 设置页能新增并保存 `GRSAI gpt-image-2`。
3. 两张模型卡片清楚显示不同平台和 adapter。
4. `GRSAI gpt-image-2` 请求体包含 `model/prompt/aspectRatio/webHook/shutProgress`，无参考图时不含 `urls`，不含 `size/imageSize`。
5. GRSAI 返回 `{ code: 0, data: { id } }` 时能取到 task id。
6. GRSAI 轮询成功后能下载到 `novels/<项目>/seedance/images/...`。
7. GRSAI 失败时显示 `failure_reason`。
8. Nano Banana 旧配置仍可用。
9. OpenAI 官方模型能解析 `b64_json` 并保存本地图片。
10. 禁用图像模型不会被后端 fallback 自动选中。
11. 同名语言模型和图像模型同时存在时，图片生成不会误取语言模型。
12. `npm run lint` 和 `npm run build` 通过。

## 11. 待讨论问题

1. 官方 OpenAI 是否这轮必须做成“可生成”，还是先只做设置页保存？
   - 推荐：既然设置页开放官方模型，就同步做 `openai-images` 适配器，避免用户选了不能用。

2. 是否拆平台账号和模型？
   - 当前推荐不拆。第一版每个模型各存 API Key，改动小。
   - 后续模型多了，再升级“平台账号 + 模型列表”。

3. 自定义 HTTP 什么时候开放？
   - 不建议第一版开放。
   - 至少要有 `requestTemplate`、`responseMapping`、鉴权配置和测试沙箱后再做。

4. 官方参考图编辑是否纳入本轮？
   - 不纳入。官方参考图需要 edits endpoint 或 Responses tool，和当前资产生图链路不是一回事。

5. 是否清理历史明文 Key？
   - 本计划不主动迁移。
   - 但新增设置页不再生成 `.md` 配置文档，也不在 UI 明文展示 Key。

## 12. 推荐结论

修订后的最终建议：

1. 图像设置页统一管理官方和第三方模型。
2. 用 `adapter` 明确调用协议，避免“模型名一样但协议不同”的混乱。
3. UI 必须平台优先：先选择平台，平台自动填 URL，再选择远端模型。
4. 新增弹窗不应默认任何具体模型，尤其不能默认 `GRSAI gpt-image-2`。
5. 下一步先执行 `Parse 1R` 返工当前设置页，再复查 `Parse 2 / Parse 3` 的运行时逻辑是否需要同步调整。
6. 最后重新执行 `Parse 4` 做统一验收。

这套方案合理且可执行，关键边界已经明确：官方 OpenAI 走 `openai-images`，第三方 GRSAI 走 `grsai-task-polling`，不要混用。

## 13. 最新验收标准补充

返工后必须满足：

1. 点击“新增图像模型”时，平台来源为空，不出现 `grsai-gpt-image-2` 默认模型 ID。
2. 未选择平台前，不显示可编辑 URL，或 URL 区域明确提示“选择平台后自动填入”。
3. 选择 `官方 OpenAI` 后，立即填入 `https://api.openai.com/v1`。
4. 选择 `第三方 GRSAI` 后，立即填入 GRSAI submit/poll URL。
5. 选择 GRSAI 后，再选择 `gpt-image-2` 或 `nano-banana-2`，不同远端模型能切换对应 submit URL 和 size 控件。
6. 选择平台和远端模型后，系统才建议本地模型 ID 和显示名称。
7. 用户手动改过本地模型 ID 或显示名称后，系统不再擅自覆盖。
8. 编辑已有模型时，平台和 adapter 只读，避免把一个已保存模型改成另一套协议。
