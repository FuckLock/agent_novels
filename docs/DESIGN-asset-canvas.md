# 设计方案：资产管理完善 + 制作画布新建

> 版本：v1.0 | 日期：2026-04-12
> 基于：`docs/PRD-asset-canvas.md` + `web/DESIGN_SPEC.md` v2.4
> 设计师：web-designer

---

## 一、设计概述

### 设计范围

| Tab | 改动级别 | 设计策略 |
|-----|---------|---------|
| Tab 3 剧本管理 | 微改 | 替换按钮文案，新增跳转逻辑 |
| Tab 4 塑造（资产管理） | 小改 | 在现有双栏布局上增量添加"导演讲戏入口"和"模型选择"，不改变整体结构 |
| Tab 5 制作画布 | 重建 | 全新双栏布局：左管线画布 + 右对话面板 |

### 设计原则复述

- 极简克制：不增加多余装饰，新增元素融入现有视觉语言
- 信息层级：管线节点状态一目了然，对话区聚焦当前阶段
- 呼吸感：节点之间留足间距，画布区不拥挤
- 颜色克制：节点状态用灰/紫/绿三色区分，不引入新色系

---

## 二、Tab 3 剧本管理 — 微改方案

### 2.1 改动点

| 编号 | 改动 | PRD 编号 |
|------|------|---------|
| T3-1 | 移除"提取资产"按钮 | F3.1 |
| T3-2 | 新增"开始制作"按钮 | F3.2 |

### 2.2 "开始制作"按钮设计

**位置**：ScriptHeader 操作区，原"提取资产"按钮位置

**样式**：
```
inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors duration-150
```

| 状态 | 样式 |
|------|------|
| 可用 | `bg-purple-600 hover:bg-purple-700 text-white` |
| 禁用（无剧本） | `bg-gray-100 text-gray-400 cursor-not-allowed` |

**图标**：播放三角形（`Play` icon），`w-3.5 h-3.5`

**交互**：
- 点击 -> 切换到 Tab 5（production），URL 参数携带集数 `?ep=N`
- 按钮文案：`开始制作`
- 禁用时 tooltip：`请先生成剧本`

### 2.3 组件清单

| 组件 | 功能 | 状态 | 交互 |
|------|------|------|------|
| StartProductionButton | 跳转 Tab 5 | 可用/禁用 | 点击切换 Tab + 传递集数 |

---

## 三、Tab 4 塑造（资产管理）— 小改方案

### 3.1 改动总览

在现有 `AssetsTab.tsx` 双栏布局基础上，新增两个元素：

| 编号 | 改动 | 位置 | PRD 编号 |
|------|------|------|---------|
| T4-1 | 导演讲戏入口区 | 标题区下方、双栏布局上方 | F2.3 辅助入口 |
| T4-2 | 润色模型选择下拉 | BatchPanel 区域 3 上方新增 | F1.1 |
| T4-3 | 详情抽屉增加"重新生成"按钮 | AssetDetailDrawer 图片区下方 | F1.3 |

**不变的部分**：卡片网格、筛选逻辑、批量面板整体结构、详情抽屉整体结构。

### 3.2 导演讲戏入口区

**位置**：标题区（`h2 塑造` + 搜索/按钮行）与双栏布局（`BatchPanel` + 卡片网格）之间，作为一个独立的条状区块。

**布局**：

```
┌──────────────────────────────────────────────────────────────┐
│  塑造                                    [🔍搜索] [提取] [+] │
├──────────────────────────────────────────────────────────────┤
│  ┌─ 导演讲戏 ───────────────────────────────────────────┐   │
│  │  集数 [▾ 第1集]  [生成导演分析]    ● 已完成/未开始     │   │
│  └───────────────────────────────────────────────────────┘   │
├──────────────┬───────────────────────────────────────────────┤
│  BatchPanel  │  卡片网格                                      │
│  ...         │  ...                                           │
```

**样式规范**：

**容器**
```
bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-4
```

**组件清单**

| 组件 | 功能 | 样式 |
|------|------|------|
| 区域标签 | 标识功能 | `text-xs font-medium text-gray-500 uppercase tracking-wider`，文案"导演讲戏" |
| 集数选择器 | 选择分析集数 | `px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:ring-1 focus:ring-purple-300 appearance-none pr-8`，宽度 `w-[120px]` |
| 生成按钮 | 触发导演分析 | `inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition` |
| 状态指示 | 显示分析状态 | 行内文字，`text-xs` |

**状态指示样式**

| 状态 | 样式 |
|------|------|
| 未开始 | `text-gray-400`，文案"未分析" |
| 分析中 | `text-purple-600 animate-pulse`，文案"分析中..."，按钮 disabled |
| 已完成 | `text-green-600`，文案"已完成 -- 提取了 N 个资产"，按钮文案变为"重新分析" |
| 失败 | `text-red-500`，文案"分析失败"，按钮文案变为"重试" |

**交互逻辑**：
1. 切换集数 -> 查询该集导演分析状态（检查 `ep{N}/01-director.md` 是否存在）
2. 点击"生成导演分析" -> 调用 `POST /api/projects/{name}/production/chat` 触发 A 阶段
3. 分析完成后自动提取资产 -> 刷新资产列表 -> 状态变为"已完成"
4. 完成后自动刷新下方卡片网格

### 3.3 润色模型选择（BatchPanel 增强）

**位置**：在现有 BatchPanel 的"区域 3 生成模型"上方，新增一个"区域 2.5：润色模型"。

**说明**：现有"生成模型"是图片生成模型（banana API 等），新增的"润色模型"是语言模型（用于从描述生成提示词）。

**样式**：与现有"区域 3 生成模型"完全一致：
```
区域标题：text-xs font-medium text-gray-500 uppercase tracking-wider mb-2
文案："润色模型"
下拉选择器：同现有生成模型下拉框样式
数据源：/api/settings/models 返回的 language 模型列表
```

**面板结构更新**（从上到下）：
1. 快捷选择指令（不变）
2. 素材类型筛选（不变）
3. **润色模型**（新增）
4. 生成模型（不变）
5. 分辨率（不变）
6. 批量操作按钮（不变）
7. 底部统计（不变）

### 3.4 详情抽屉 — 重新生成按钮

**位置**：`AssetDetailDrawer` 的图片预览区下方，编辑区上方。

**布局**：

```
┌─ 图片预览区 ──────────────────────────┐
│                                        │
│         [图片/占位图]                   │
│                                        │
├────────────────────────────────────────┤
│  [选择模型 ▾]  [选择分辨率 ▾]  [重新生成图片] │
├────────────────────────────────────────┤
│  元信息区                               │
│  编辑区（prompt 文本区域）               │
```

**组件清单**

| 组件 | 功能 | 样式 |
|------|------|------|
| 模型下拉 | 选择图片模型 | `px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 bg-white`，宽度自适应 |
| 分辨率下拉 | 选择分辨率 | 同上 |
| 重新生成按钮 | 触发单张重新生成 | `px-3 py-1.5 text-xs bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition inline-flex items-center gap-1` |

**按钮状态**

| 状态 | 样式 |
|------|------|
| 可用（有 prompt） | 正常深色按钮 |
| 禁用（无 prompt） | `bg-gray-100 text-gray-400 cursor-not-allowed`，tooltip "请先生成提示词" |
| 生成中 | `bg-gray-900 text-white opacity-70 cursor-wait`，文案"生成中..."，前置 spinner |

**交互**：
1. 点击"重新生成" -> 调用 `POST /api/projects/{name}/seedance/assets/{id}/regenerate`
2. 按钮进入 loading 状态
3. 成功后刷新图片预览
4. 失败后显示错误 toast

### 3.5 Tab 4 完整组件清单

| 组件 | 状态 | 改动类型 |
|------|------|---------|
| AssetsTab | 标题区/双栏布局 | 现有，新增导演讲戏入口区 |
| DirectorAnalysisBar（新） | 未分析/分析中/已完成/失败 | 新增 |
| BatchPanel | 快捷/筛选/模型/按钮 | 现有，新增润色模型下拉 |
| AssetCard | 默认/选中/生成中/失败 | 不变 |
| AssetDetailDrawer | 查看/编辑/保存/删除 | 现有，新增重新生成区 |
| RegenerateBar（新） | 可用/禁用/生成中 | 新增 |
| AssetCardGrid | 响应式网格 | 不变 |
| AssetEmptyState | 全局空/筛选空 | 不变 |
| CreateAssetModal | 创建弹窗 | 不变 |
| ExtractFromOutlineModal | 提取弹窗 | 不变 |

---

## 四、Tab 5 制作画布 — 重建方案

### 4.1 页面概述

- **页面目标**：可视化完整制作管线（A->D），通过 Agent 对话驱动每个阶段执行，让用户清晰掌握进度
- **用户场景**：创作者完成剧本后，进入此页面按步骤生成导演分析、资产、分镜表、提示词、视频
- **核心交互**：左侧看进度 + 点击查看产出，右侧对话驱动 Agent 执行

### 4.2 布局结构

```
┌───────────────────────────────────────┬──────────────────────┐
│  左侧画布区 (60%)                       │  右侧对话面板 (40%)   │
│                                         │                      │
│  ┌─ 集数选择 ────────────────────┐     │  ┌─ 阶段标签 ──────┐ │
│  │  [第1集] [第2集] [第3集] ...   │     │  │  第1集 · A导演分析│ │
│  └────────────────────────────────┘     │  └──────────────────┘ │
│                                         │                      │
│  ┌─ 管线节点图 ──────────────────┐     │  ┌──────────────────┐ │
│  │                                │     │  │                  │ │
│  │  [A] ─── [B] ─── [C1] ───     │     │  │  对话消息列表     │ │
│  │             ─── [C2] ─── [C3]  │     │  │                  │ │
│  │                    ─── [D]     │     │  │  Agent: 检测到... │ │
│  │                                │     │  │  User: 开始分析   │ │
│  └────────────────────────────────┘     │  │  Agent: [流式]... │ │
│                                         │  │                  │ │
│  ┌─ 节点详情展开区 ──────────────┐     │  │                  │ │
│  │                                │     │  │                  │ │
│  │  （点击已完成节点后展开）        │     │  └──────────────────┘ │
│  │  复用 DirectorSection /        │     │                      │
│  │  StoryboardPrompts 等组件      │     │  ┌──────────────────┐ │
│  │                                │     │  │ [模型▾]    统筹  │ │
│  └────────────────────────────────┘     │  │ [输入消息...]  [▶]│ │
│                                         │  └──────────────────┘ │
└───────────────────────────────────────┴──────────────────────┘
```

**响应式规则**：
- 大屏（>=1440px）：6:4 分栏，节点图横向一行排满
- 中屏（>=1024px）：55:45 分栏，节点图可能折行
- 小屏（<1024px）：上下堆叠，画布在上（节点图缩小），对话在下（固定高度 50vh）

### 4.3 集数下拉选择器

**位置**：画布区左上角（参考 Toonflow-app 的集数下拉框设计）

**交互**：下拉框选择，显示格式为「《项目名》EP{N}: 集标题」，如「《造化之门》EP01: 困境·牺牲·秘密」

**样式**：
```
inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white
hover:border-gray-300 focus:ring-1 focus:ring-purple-300
min-w-[280px] max-w-[400px]
```

**下拉选项样式**：
| 状态 | 样式 |
|------|------|
| 普通选项 | `px-3 py-2 text-sm text-gray-700 hover:bg-gray-50` |
| 当前选中 | `px-3 py-2 text-sm text-purple-700 bg-purple-50 font-medium` |

**左侧图标**：剧本图标（参考 Toonflow-app 左上角的剧本icon），右侧展开箭头

### 4.4 管线节点图

**设计理念**：简洁几何风格的横向流程图。6 个节点横向排列，用连线串联，通过颜色和图标表达状态。

#### 节点布局

```
[A 导演分析] ── [B 资产管理] ── [C1 导演规划] ── [C2 分镜表] ── [C3 提示词] ── [D 视频]
```

**容器**
```
bg-white border border-gray-200 rounded-xl p-6
flex items-center justify-between gap-0 overflow-x-auto
```

#### 单个节点

**结构**：
```
┌──────────────┐
│    [图标]     │  <- 40x40 圆形图标
│   节点名称    │  <- 下方文字
│  (状态文字)   │  <- 可选状态描述
└──────────────┘
```

**节点图标容器**
```
w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300
```

| 状态 | 图标容器样式 | 图标样式 | 节点名称样式 |
|------|------------|---------|------------|
| 未开始 | `bg-gray-100 border-2 border-gray-200` | `w-4 h-4 text-gray-400` | `text-xs text-gray-400 mt-2` |
| 进行中 | `bg-purple-100 border-2 border-purple-400 animate-pulse` | `w-4 h-4 text-purple-600` | `text-xs text-purple-600 font-medium mt-2` |
| 已完成 | `bg-green-50 border-2 border-green-400` | `w-4 h-4 text-green-600`（checkmark） | `text-xs text-green-700 mt-2` |

**节点图标映射**

| 节点 | 图标 | SVG path 描述 |
|------|------|--------------|
| A 导演分析 | 摄影机 | Film/Camera icon |
| B 资产管理 | 调色板 | Palette icon |
| C1 导演规划 | 文档规划 | ClipboardList icon |
| C2 分镜表 | 表格 | Table icon |
| C3 提示词 | 代码/文本 | Code icon |
| D 视频 | 播放 | Play icon |

**已完成节点增强**：
- 点击时底部出现展开箭头指示
- `cursor-pointer hover:shadow-md transition`

#### 连接线

**位置**：两个节点之间，水平连线

**样式**

| 状态 | 样式 |
|------|------|
| 两端都已完成 | `h-0.5 bg-green-400 flex-1`（实线） |
| 前节点完成、后节点未开始 | `h-0.5 bg-gray-200 flex-1 border-dashed`（虚线） |
| 其他 | `h-0.5 bg-gray-200 flex-1`（实线灰色） |

**连线容器**：`flex-1 mx-2 flex items-center`，最小宽度 `min-w-[24px]`

#### 进行中动画

进行中节点的脉冲效果：
```css
@keyframes pipeline-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(139, 92, 246, 0); }
}
```
应用：`animate-pulse` + 自定义 `shadow-[0_0_0_4px_rgba(139,92,246,0.15)]`

### 4.5 节点详情展开区

**位置**：管线节点图下方

**触发**：点击已完成节点

**容器**：
```
bg-white border border-gray-200 rounded-xl mt-4 overflow-hidden
transition-all duration-300 ease-out
```

**展开/收起动画**：
- 展开：`max-h-0 -> max-h-[600px]`，`opacity-0 -> opacity-100`
- 收起：反向动画

**头部**
```
flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50
```
- 左侧：节点名称 `text-sm font-medium text-gray-700`
- 右侧：收起按钮 `w-6 h-6 text-gray-400 hover:text-gray-600 cursor-pointer`（ChevronUp icon）

**内容区**（按节点类型不同）

| 节点 | 内容组件 | 最大高度 | 复用/新建 |
|------|---------|---------|----------|
| A 导演分析 | DirectorSection | 500px，内部滚动 | 复用现有 |
| B 资产管理 | AssetPreviewGrid（缩略图网格 + "去塑造Tab编辑"链接） | 300px | 新建（简化版） |
| C1 导演规划 | DirectorPlanViewer（六维度折叠面板） | 500px，内部滚动 | 新建 |
| C2 分镜表 | StoryboardTableViewer（12列表格） | 500px，横向+纵向滚动 | 新建 |
| C3 提示词 | StoryboardPrompts | 500px，内部滚动 | 复用现有 |
| D 视频 | VideoGrid（缩略图网格 + 播放器） | 400px | 新建 |

**规则**：同时只展开一个节点。点击另一个节点时，先收起当前节点（300ms），再展开新节点。

### 4.6 右侧对话面板

**设计基础**：复用现有 `ChatPanel` 的视觉语言和交互模式，针对制作场景定制。

#### 整体结构

```
┌──────────────────────────────┐
│  阶段标签栏                    │  <- 固定顶部
├──────────────────────────────┤
│                              │
│  对话消息列表                  │  <- 可滚动
│                              │
├──────────────────────────────┤
│  工具行 + 输入框              │  <- 固定底部
└──────────────────────────────┘
```

**容器**
```
w-[40%] shrink-0 border-l border-gray-200 flex flex-col bg-white
```

#### 阶段标签栏

**位置**：对话面板顶部，固定不滚动

**样式**
```
px-5 py-3 border-b border-gray-100 flex items-center justify-between
```

**左侧**：当前集数 + 当前阶段
- 集数：`text-sm font-medium text-gray-800`（如"第1集"）
- 分隔符：`text-gray-300 mx-2`（"--"）
- 阶段标签：`text-xs px-2 py-0.5 rounded-full`
  - A 阶段：`bg-purple-50 text-purple-600`（"导演分析"）
  - B 阶段：`bg-orange-50 text-orange-600`（"资产管理"）
  - C1 阶段：`bg-blue-50 text-blue-600`（"导演规划"）
  - C2 阶段：`bg-blue-50 text-blue-600`（"分镜表"）
  - C3 阶段：`bg-blue-50 text-blue-600`（"提示词"）
  - D 阶段：`bg-green-50 text-green-600`（"视频生成"）

**右侧**：连接状态指示
- 在线：`w-2 h-2 rounded-full bg-green-500`
- 离线：`w-2 h-2 rounded-full bg-gray-300`

#### 对话消息列表

**容器**
```
flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0
```

**消息气泡 -- Agent 消息**
```
bg-gray-50 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-700 max-w-[90%]
```
- 角色标签：`text-xs text-gray-400 mb-1`（"制作助手"）
- 内容：支持 Markdown 渲染（复用 MarkdownPreview）
- 流式光标：`inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom rounded-sm`

**消息气泡 -- 用户消息**
```
flex justify-end
气泡：bg-gray-800 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm max-w-[90%]
```

**进度消息（Agent 特殊消息类型）**

Agent 消息中嵌入进度条，用于展示批量操作进度：

```
┌─ Agent 气泡 ─────────────────────────┐
│  资产生成中...                          │
│  ┌──────────────────────────────────┐ │
│  │  ████████░░░░░░░░  3/8           │ │
│  └──────────────────────────────────┘ │
│  已完成：叶真、齐云山、修炼玉佩          │
└──────────────────────────────────────┘
```

进度条样式：
```
外框：w-full h-2 bg-gray-100 rounded-full overflow-hidden mt-2
填充：h-full bg-purple-500 rounded-full transition-all duration-500
计数：text-xs text-gray-500 mt-1 text-right
```

**快捷操作按钮（Action Buttons）**

Agent 消息可携带操作按钮（如"继续"、"去塑造Tab"、"全部执行"）：
```
flex flex-wrap gap-2 mt-3
单个按钮：px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 
          hover:bg-gray-50 hover:border-gray-300 transition cursor-pointer
```

**空状态**
```
flex flex-col items-center justify-center gap-2 h-full
图标：w-10 h-10 text-gray-300（Pipeline/Workflow icon）
主文：text-sm text-gray-500（"选择集数开始制作"）
副文：text-xs text-gray-400（"AI 助手将引导你完成整个管线"）
```

#### 底部输入区

**容器**
```
px-4 py-3 border-t border-gray-100
```

**工具行**
```
flex items-center justify-between mb-2
```
- 左侧：ModelSelector 组件（复用现有），下拉选择语言模型
- 右侧：角色标签 `text-xs text-gray-400`（"制作助手"）

**输入行**
```
flex items-center gap-2
```

- 输入框：`flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-full text-sm outline-none focus:ring-2 focus:ring-gray-300 text-gray-700 placeholder-gray-400`
  - placeholder：`"说"开始"启动管线，或描述你的需求..."`
  - loading 态：`disabled:bg-gray-50 disabled:cursor-not-allowed`，placeholder 变为 `"AI 正在执行中..."`
- 发送按钮：`w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center text-white hover:bg-gray-700 transition shrink-0`
  - 禁用态：`opacity-30 cursor-not-allowed`
- 停止按钮（loading 态替换发送按钮）：`w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition shrink-0`

### 4.7 新增展示组件设计

#### 4.7.1 AssetPreviewGrid（B 节点详情）

**用途**：在管线画布中展示资产缩略图列表

**布局**：
```
grid grid-cols-4 gap-3 p-4
```

**单个缩略图**：
```
┌──────────────┐
│  [缩略图/占位] │  aspect-square rounded-lg overflow-hidden bg-gray-50
│              │
├──────────────┤
│  名称  [类型] │  text-xs text-gray-700 truncate
└──────────────┘
```

**底部链接**：
```
flex justify-end px-4 pb-3
链接文字："前往塑造 Tab 编辑 -->"
样式：text-xs text-purple-600 hover:text-purple-700 cursor-pointer
```

#### 4.7.2 DirectorPlanViewer（C1 节点详情）

**用途**：展示 director-plan.json 六维度内容

**布局**：六个可折叠区块，手风琴模式（同时只展开一个）

**单个维度区块**：
```
┌─ 维度1：主题叙事 ───────────── [▾] ─┐
│                                       │
│  文本内容渲染区                         │
│  ...                                   │
└───────────────────────────────────────┘
```

**折叠头部**
```
flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition
border-b border-gray-100
```
- 维度编号：`w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs flex items-center justify-center font-medium mr-3`
- 维度名称：`text-sm font-medium text-gray-700`
- 展开图标：`w-4 h-4 text-gray-400 transition-transform duration-200`（展开时旋转 180deg）

**展开内容**
```
px-4 py-3 text-sm text-gray-600 leading-relaxed
```

**六个维度**

| 序号 | 名称 | 内容类型 |
|------|------|---------|
| 1 | 主题叙事 | Markdown 文本渲染 |
| 2 | 视觉风格 | 文本 + 色彩标签 `inline-block px-2 py-0.5 rounded text-xs` |
| 3 | 叙事结构 | 文本 + 场景列表 |
| 4 | 场景意图 | 有序列表 `list-decimal list-inside` |
| 5 | 声音音乐 | 文本描述 |
| 6 | 转场连贯 | 表格 `text-xs` |

#### 4.7.3 StoryboardTableViewer（C2 节点详情）

**用途**：展示 storyboard-table.json 的 12 列分镜表

**容器**
```
overflow-x-auto overflow-y-auto
```

**表格**
```
w-full text-xs border-collapse
```

**表头**
```
bg-gray-50 sticky top-0 z-10
th: px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap
```

**12 列定义**

| 列 | 宽度 | 对齐 |
|-----|------|------|
| 序号 | `w-[50px]` | center |
| 画面描述 | `min-w-[200px]` | left |
| 场景 | `min-w-[80px]` | left |
| 关联资产 | `min-w-[100px]` | left |
| 时长 | `w-[60px]` | center |
| 景别 | `w-[60px]` | center |
| 运镜 | `w-[80px]` | left |
| 动作+朝向 | `min-w-[120px]` | left |
| 情绪 | `w-[60px]` | center |
| 光影 | `min-w-[100px]` | left |
| 台词 | `min-w-[150px]` | left |
| 音效 | `min-w-[100px]` | left |

**表体行**
```
tr: border-b border-gray-100 hover:bg-gray-50 transition
td: px-3 py-2 text-gray-700 align-top
```

**Track 分组**：
- 同一 trackId 的行归为一组
- 组间插入分隔行：`h-1 bg-gray-100`
- Track 标题行（可选）：合并所有列，`text-xs font-medium text-gray-500 bg-gray-50 px-3 py-1.5`

**关联资产列特殊处理**：
- 显示资产缩略图小图标：`w-5 h-5 rounded-sm object-cover inline-block mr-1`
- 多个资产横向排列，溢出时 `+N` 标记

**当前处理行高亮**：
```
bg-purple-50 border-l-2 border-purple-400
```

#### 4.7.4 VideoGrid（D 节点详情）

**用途**：展示已生成视频的缩略图网格

**布局**
```
grid grid-cols-3 gap-3 p-4
```

**单个视频卡片**
```
┌──────────────────────┐
│                      │
│   [视频首帧缩略图]    │  aspect-video rounded-lg overflow-hidden bg-gray-900 relative
│   ▶ (播放按钮覆盖)    │
│                      │
├──────────────────────┤
│  P01  |  5.0s        │  text-xs text-gray-600
└──────────────────────┘
```

**播放按钮覆盖层**
```
absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition
图标：w-10 h-10 text-white drop-shadow-lg
```

**视频播放器**：点击后弹出 Modal 播放
```
fixed inset-0 z-50 bg-black/80 flex items-center justify-center
video: max-w-[80vw] max-h-[80vh] rounded-xl
关闭按钮：absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20
```

**生成中状态卡片**
```
aspect-video rounded-lg bg-gray-100 flex flex-col items-center justify-center
spinner: w-6 h-6 text-purple-500 animate-spin
文字: text-xs text-gray-500 mt-2（"生成中..."）
```

### 4.8 Tab 5 完整组件清单

| 组件 | 功能 | 状态覆盖 | 新建/复用 |
|------|------|---------|----------|
| ProductionCanvas（主容器） | 双栏布局 | 加载/正常/错误 | 新建（替换现有 ProductionTab） |
| EpisodeSelector | 集数选择 | 选中/未选中 | 新建 |
| PipelineGraph | 管线节点图 | 节点三态 + 连线 | 新建 |
| PipelineNode | 单个节点 | 未开始/进行中/已完成 | 新建 |
| PipelineConnector | 节点连线 | 灰色/绿色 | 新建 |
| NodeDetailPanel | 节点详情展开 | 展开/收起 + 各节点内容 | 新建 |
| AssetPreviewGrid | B节点资产预览 | 有图/无图 | 新建 |
| DirectorPlanViewer | C1六维度展示 | 折叠/展开 | 新建 |
| StoryboardTableViewer | C2分镜表格 | 正常/高亮行 | 新建 |
| VideoGrid | D视频网格 | 成功/生成中/失败 | 新建 |
| ProductionChatPanel | 对话面板 | 空/对话中/loading | 新建（基于ChatPanel） |
| StageLabel | 阶段标签 | A~D六种 | 新建 |
| ProgressMessage | 进度消息气泡 | 进行中/完成 | 新建 |
| DirectorSection | A节点内容 | - | 复用现有 |
| StoryboardPrompts | C3节点内容 | - | 复用现有 |
| ModelSelector | 模型选择 | - | 复用现有 |
| MarkdownPreview | Markdown渲染 | - | 复用现有 |

---

## 五、交互流程设计

### 5.1 主流程：从 Tab 3 进入制作

```
Tab 3 点击"开始制作"
  ↓
Tab 5 激活，自动选中对应集数
  ↓
管线节点图加载，检测各节点状态
  ↓
右侧对话面板：Agent 自动发送欢迎消息，汇报当前管线状态
  ↓
用户输入"开始"或点击 Agent 提供的"开始导演分析"按钮
  ↓
A 节点状态变为"进行中"（紫色脉冲）
  ↓
对话面板流式输出分析过程
  ↓
完成：A 节点变为"已完成"（绿色勾），连线变绿
  ↓
Agent 提示下一步，用户选择继续或跳转 Tab 4 调整
```

### 5.2 节点点击交互

```
用户点击已完成节点
  ↓
判断：是否有展开的节点？
  ├─ 是：先收起当前节点（300ms 动画）
  └─ 否：直接展开
  ↓
展开被点击节点的详情面板（300ms 动画）
  ↓
右侧对话面板阶段标签更新为对应阶段

用户点击未完成节点
  ↓
右侧对话面板阶段标签更新
Agent 提示："该阶段尚未开始，需要先完成前置阶段"或引导开始
```

### 5.3 Tab 4 导演讲戏入口交互

```
用户在 Tab 4 选择集数
  ↓
查询该集导演分析状态
  ├─ 未分析：显示"生成导演分析"按钮
  └─ 已完成：显示已完成状态 + "重新分析"按钮
  ↓
用户点击"生成导演分析"
  ↓
按钮进入 loading，状态文字"分析中..."
  ↓
完成后：状态变为"已完成 -- 提取了 N 个资产"
  ↓
自动刷新下方资产卡片网格
```

---

## 六、状态设计总结

### 6.1 管线节点状态

| 状态 | 视觉表现 | 触发条件 |
|------|---------|---------|
| 未开始 | 灰色圆形 + 灰色图标 + 灰色文字 | 对应文件不存在 |
| 进行中 | 紫色圆形 + 脉冲动画 + 紫色文字 | Agent 正在执行该阶段 |
| 已完成 | 绿色圆形 + 勾号 + 绿色文字 | 对应文件存在 |

### 6.2 对话面板状态

| 状态 | 表现 |
|------|------|
| 空闲 | 空状态插图 + 引导文字 |
| 已连接 | 绿色状态点 + 可输入 |
| Agent 执行中 | 输入框 disabled + 停止按钮可用 + 流式消息输出 |
| 断开 | 灰色状态点 + 输入框 disabled |

### 6.3 批量操作状态（Tab 4）

| 状态 | 按钮表现 | 进度表现 |
|------|---------|---------|
| 空闲 | 正常可点击 | 无进度条 |
| 执行中 | disabled | 进度条 + 计数文字 |
| 完成 | 恢复可点击 | 进度条 100% 后淡出 |

---

## 七、自检清单

| # | 检查项 | 结果 |
|---|--------|------|
| 1 | 视觉令牌一致性 | 通过 -- 所有色值/字号/间距/圆角引用 DESIGN_SPEC.md 令牌，主色 purple-600，状态色 green/gray/red 复用规范 |
| 2 | 状态完整性 | 通过 -- 节点三态、对话四态、批量三态、按钮多态均已覆盖 |
| 3 | 响应式覆盖 | 通过 -- Tab 5 标注了三个断点下的布局变化；Tab 4 沿用现有响应式规则 |
| 4 | 组件可开发性 | 通过 -- 每个组件有明确的样式类名、状态映射和交互描述 |
| 5 | PRD 覆盖率 | 通过 -- F1.1~F1.4、F2.1~F2.7、F3.1~F3.2 全部有对应设计 |
| 6 | 可访问性 | 通过 -- 状态不仅靠颜色区分（有图标+文字），按钮有 disabled 态，键盘可导航 |
