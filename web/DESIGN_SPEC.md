# Toonflow Web — 设计规范（DESIGN_SPEC.md）

> 版本：v2.0 | 更新时间：2026-04-08
> 参考项目：Toonflow-app-master | 本文档为 Toonflow Web 平台的全局视觉系统与页面设计方案。

---

## 一、全局视觉令牌

### 色彩系统

| 用途 | Token | 值 |
|------|-------|----|
| 主色 | `primary` | `purple-600` (#7c3aed) |
| 主色悬停 | `primary-hover` | `purple-700` (#6d28d9) |
| 主色浅背景 | `primary-bg` | `purple-50` (#f5f3ff) |
| 主色文字 | `primary-text` | `purple-700` (#6d28d9) |
| 强调蓝 | `accent-blue` | `blue-600` |
| 强调绿 | `accent-green` | `green-700` |
| 强调橙 | `accent-orange` | `orange-600` |
| 页面背景 | `bg-page` | `gray-50` (#f9fafb) |
| 卡片背景 | `bg-card` | `white` |
| 边框默认 | `border-default` | `gray-200` |
| 文字主要 | `text-primary` | `gray-800` |
| 文字次要 | `text-secondary` | `gray-500` |
| 文字辅助 | `text-muted` | `gray-400` |
| 错误色 | `danger` | `red-600` |
| 错误背景 | `danger-bg` | `red-50` |

### 间距系统

| 名称 | 值 | 用途 |
|------|----|----|
| xs | `4px` (1) | 图标与文字间隙 |
| sm | `8px` (2) | 紧凑列表行间距 |
| md | `12px` (3) | 卡片内部元素间距 |
| lg | `16px` (4) | 区块间距 |
| xl | `20px` (5) | 卡片内边距 |
| 2xl | `24px` (6) | 页面主内容内边距 |

### 圆角系统

| 类型 | 类名 | 用途 |
|------|------|------|
| 小 | `rounded` (4px) | 按钮、标签 |
| 中 | `rounded-lg` (8px) | 输入框、小卡片 |
| 大 | `rounded-xl` (12px) | 主卡片、面板 |

### 阴影系统

| 层级 | 类名 | 用途 |
|------|------|------|
| 低 | `shadow-sm` | 卡片默认 |
| 中 | `shadow` | 悬停状态 |
| 高 | `shadow-md` | 弹出层 |

### 字体规范

- 中文正文：`PingFang SC`, `Microsoft YaHei`, sans-serif
- 等宽（代码/剧本）：`ui-monospace`, `SF Mono`, Menlo
- 标题：`text-base font-semibold text-gray-800`
- 正文：`text-sm text-gray-700`
- 辅助：`text-xs text-gray-500`
- 等宽内容：`text-sm font-mono`

---

## 二、通用组件规范

### Button

| variant | 样式 |
|---------|------|
| primary | `bg-purple-600 hover:bg-purple-700 text-white rounded` |
| secondary | `bg-gray-200 hover:bg-gray-300 text-gray-800 rounded` |
| danger | `bg-red-600 hover:bg-red-700 text-white rounded` |

- size sm：`px-3 py-1.5 text-sm`
- size md：`px-4 py-2`
- loading 状态：前置 spinner + 半透明

### 卡片（Card）

```
bg-white rounded-xl shadow-sm
```

卡片头部（深色版）：`bg-gray-800 px-5 py-3` + 左边框强调 `border-l-4 border-purple-400`
卡片头部（主色版）：`bg-purple-600 px-5 py-3`
卡片头部（浅色版）：`px-5 py-4 border-b border-gray-100`

### 标签 Badge

| 类型 | 样式 |
|------|------|
| 角色 | `bg-purple-100 text-purple-700 text-xs px-1.5 py-0.5 rounded` |
| 场景 | `bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded` |
| 道具 | `bg-green-100 text-green-700 text-xs px-1.5 py-0.5 rounded` |
| 中性 | `bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded` |

### 空状态

```
py-12 text-center
图标：w-12 h-12 mx-auto mb-3 text-gray-300
主文：text-sm text-gray-500
副文：text-xs text-gray-400 mt-1
```

### 加载骨架

```
animate-pulse
每行：h-4 bg-gray-100 rounded，不同宽度（95%/80%/88%/72%/90%）
```

### 错误提示

```
p-3 bg-red-50 border border-red-200 rounded-lg
文字：text-sm text-red-600
右侧：重试按钮 + 关闭按钮
```

---

## 三、导航结构

### 全局布局

```
┌──────┬──────────────────────────────────────────────┐
│      │  项目名称                   [①②③④⑤⑥]       │
│  侧  ├──────────────────────────────────────────────┤
│  栏  │                                              │
│ w-16 │               当前页面内容                    │
│      │                                              │
│ Logo │                                              │
│ 导航 │                                              │
│ 图标 │                                              │
└──────┴──────────────────────────────────────────────┘
```

### 左侧侧栏（Sidebar）

- 宽度：`w-16`（固定收起状态）
- 顶部：Toonflow Logo（羽毛图标，紫色圆形背景）
- 中部：2 个导航图标（项目列表、文档）
- 底部：3 个功能图标（信息、定位、设置）
- 样式：`bg-white border-r border-gray-200`
- 图标：`w-10 h-10 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100`

### 右上角 6 页面图标导航

- 位置：顶部导航栏右侧
- 样式：`flex items-center gap-2`
- 单个图标：`w-10 h-10 rounded-full flex items-center justify-center transition`
  - 当前页（高亮）：`bg-gray-900 text-white`
  - 非当前页：`text-gray-500 hover:bg-gray-100`

| # | 图标 | 页面 ID | 页面名 |
|---|------|---------|--------|
| 1 | 📄 文档 | `chapters` | 小说原文 |
| 2 | 👤 人物 | `workbench` | 剧本Agent |
| 3 | 📋 列表 | `scripts` | 剧本管理 |
| 4 | 👥 群组 | `assets-gen` | 素材生成 |
| 5 | 🖥️ 屏幕 | `production` | 制作工作台 |
| 6 | 📦 箱子 | `assets-lib` | 资产库 |

---

## 四、页面 2 — 剧本Agent（创作工作台）

### 页面概述

- **页面目标**：AI 驱动的剧本创作全流程工作台，从故事骨架到改编策略到剧本生成
- **用户场景**：用户与 AI 统筹对话，确认项目参数后自动生成故事骨架、改编策略和剧本

### 布局结构

```
┌─────────────────────────────────────────────────┐
│  左侧 AI 聊天 (w-[35%])  │  右侧内容 (flex-1)   │
│                            │                      │
│  ● 绿色在线指示             │  故事骨架│改编策略│  │
│  [开始] 按钮               │  剧本       [编辑]  │
│                            │  ───────────────── │
│  统筹                      │                      │
│  ┌──────────────────┐     │  《叶真的秘密》       │
│  │ 请您确认以下项目  │     │   - 故事骨架          │
│  │ 参数哦：          │     │                      │
│  │ 1. 拆分为几集？   │     │  故事核（一句话）     │
│  │ 2. 每集时长？     │     │  ...                 │
│  │ ...              │     │                      │
│  └──────────────────┘     │  隐线（人物弧）       │
│                            │  ...                 │
│  用户：1集 2分钟            │                      │
│                            │  三幕结构             │
│  统筹 ↓                    │  ...                 │
│  ┌──────────────────┐     │                      │
│  │ 请补充确认剩余   │     │                      │
│  │ 参数...          │     │                      │
│  └──────────────────┘     │                      │
│  ─────────────────────    │                      │
│  [⚙] 输入框...    [▲]    │                      │
└─────────────────────────────────────────────────┘
```

- 外层容器：`h-[calc(100vh-140px)] flex flex-row bg-white rounded-2xl shadow-sm overflow-hidden`

### AI 聊天面板（左 35%）

- 容器：`w-[35%] shrink-0 border-r border-gray-200 flex flex-col`

**顶部状态区**
- 绿色圆点指示在线：`w-2 h-2 rounded-full bg-green-500`
- "开始"按钮（右上角）：`px-4 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50`

**消息流**
- 滚动区：`flex-1 overflow-y-auto px-5 py-4 space-y-4`
- AI 消息：
  - 角色标签："统筹"，样式 `text-xs text-gray-400 mb-1`
  - 气泡：`bg-gray-50 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-700 max-w-[90%]`
- 用户消息：
  - 右对齐：`flex justify-end`
  - 气泡：`bg-gray-100 rounded-2xl rounded-tr-sm px-4 py-3 text-sm text-gray-700`

**底部输入区**
- 容器：`px-4 py-3 border-t border-gray-100`
- 输入框：`flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-gray-300`
- 设置按钮（左）：`w-8 h-8 text-gray-400`
- 发送按钮（右）：`w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center text-white`

### 内容面板（右 65%）

- 容器：`flex-1 flex flex-col min-h-0`

**Tab 栏**
- 容器：`px-6 border-b border-gray-100 flex items-center justify-between`
- Tab 样式（底部下划线）：
  - 活跃：`py-3 text-sm font-medium border-b-2 border-gray-900 text-gray-900`
  - 非活跃：`py-3 text-sm font-medium border-b-2 border-transparent text-gray-400 hover:text-gray-600`
- Tab 列表：**故事骨架 | 改编策略 | 剧本**（3 个，无素材）
- 编辑按钮（右侧）：`px-4 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800`

**内容区**
- 滚动容器：`flex-1 overflow-y-auto px-6 py-6`
- 内容渲染：`MarkdownPreview` 组件
- 剧本 Tab 特有：集数选择器（下拉框或按钮组）

### 编辑模式 — MarkdownEditorModal

- 触发：点击 Tab 栏右侧"编辑"按钮
- 全屏/大尺寸 Modal：`fixed inset-0 z-50 bg-white flex flex-col`
- 顶部栏：标题 + 关闭按钮
- 工具栏：加粗 B / 斜体 I / 删除线 S / H₁ / H₂ / 列表 / 代码 / 引用 / 链接 / 撤销 / 重做
- 主体：左右分栏 `grid grid-cols-2 flex-1 min-h-0`
  - 左侧：Markdown 源码编辑器（等宽字体，行号可选）
  - 右侧：实时预览（MarkdownPreview 渲染）
- 底部：`flex justify-end gap-3 px-6 py-4 border-t`
  - 取消：`border border-gray-300 text-gray-700 rounded-lg px-4 py-2`
  - 保存：`bg-purple-600 text-white rounded-lg px-4 py-2`

### 组件清单

| 组件 | 文件 | 职责 |
|------|------|------|
| ContentWorkbench | `tabs/ContentWorkbench.tsx` | 顶层编排：组合 ChatPanel + WorkbenchPanel |
| ChatPanel | `tabs/workbench/ChatPanel.tsx` | AI 聊天面板（消息流 + 进度 + 输入框）|
| WorkbenchPanel | `tabs/workbench/WorkbenchPanel.tsx` | 右侧 Tab 栏 + 内容切换 |
| SkeletonPanel | `tabs/workbench/SkeletonPanel.tsx` | 故事骨架内容（Markdown 渲染 + 编辑）|
| AdaptationPanel | `tabs/workbench/AdaptationPanel.tsx` | 改编策略内容（Markdown 渲染 + 编辑）|
| ScriptEpisodePanel | `tabs/workbench/ScriptEpisodePanel.tsx` | 剧本内容（集数选择 + Markdown 渲染 + 编辑）|
| MarkdownEditorModal | `components/MarkdownEditorModal.tsx` | 左右分栏 Markdown 编辑器（已有，复用）|
| MarkdownPreview | `components/MarkdownPreview.tsx` | Markdown 渲染组件（已有，复用）|

---

## 五、页面 3 — 剧本管理

### 页面概述

- **页面目标**：管理所有已生成的剧本，支持搜索、预览、导出、提取资产、批量操作
- **用户场景**：导演/编剧查看已生成的剧本列表，导出或提取关联资产

### 布局结构

```
┌─────────────────────────────────────────────────┐
│  搜索剧本名称...  [🔍搜索]  [+新建剧本]          │
│  右侧：[全选] [导出剧本] [提取资产] [批量删除]    │
├─────────────────────────────────────────────────┤
│  剧本卡片（左半宽，竖向列表）                      │
│  ┌─────────────────────────────────────────┐    │
│  │ 《叶真的秘密》EP01: 废柴的秘密     [☐]  │    │
│  │                                         │    │
│  │ # 《叶真的秘密》EP01: 废柴的秘密 #...   │    │
│  │ [叶真][赵虎][黑袍长老][后山密林]         │    │
│  │ [崖边暗处][修炼玉佩][齐云宗鎏金牌匾]    │    │
│  │ [赵虎的佩刀][宗门广场][杂役灰袍]        │    │
│  │ [外门劲装][玄色黑袍][半块玉佩]          │    │
│  │                                    [🗑] │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### 样式规范

**搜索栏**
- 输入框：`border border-gray-200 rounded-lg px-4 py-2 text-sm`
- 搜索按钮：`bg-gray-900 text-white px-4 py-2 rounded-lg text-sm`
- 新建按钮：`bg-gray-900 text-white px-4 py-2 rounded-lg text-sm`

**操作按钮组**
- 全选：`border border-gray-200 rounded-lg px-4 py-2 text-sm`
- 导出剧本：`border border-blue-200 text-blue-600 rounded-lg px-4 py-2 text-sm`
- 提取资产：`border border-blue-200 text-blue-600 rounded-lg px-4 py-2 text-sm`
- 批量删除：`border border-red-200 text-red-600 rounded-lg px-4 py-2 text-sm`

**剧本卡片**
- 容器：`bg-white border border-gray-200 rounded-xl p-5`
- 标题：`text-sm font-medium text-gray-800`
- 内容预览：`text-sm text-gray-600 mt-2 line-clamp-2`
- 标签区：`flex flex-wrap gap-1.5 mt-3`
- 单标签：`px-2 py-0.5 text-xs rounded border border-gray-200 text-gray-600`
- 复选框：`w-4 h-4 rounded border-gray-300`
- 删除图标：`text-gray-400 hover:text-red-500`

---

## 六、页面 4 — 素材生成（塑角造景）

### 页面概述

- **页面目标**：批量生成角色/场景/道具的提示词和参考图片
- **用户场景**：美术人员选择素材类型和生成模型，批量生成提示词，再批量生成参考图

### 布局结构

```
┌──────────────┬──────────────────────────────────┐
│  批量生成设置  │  资产网格（4列响应式）             │
│  (w-[300px])  │                                  │
│              │  ┌────┐ ┌────┐ ┌────┐ ┌────┐    │
│  快捷指令     │  │4视 │ │4视 │ │4视 │ │场景│    │
│  [全选提示词  │  │图  │ │图  │ │图  │ │图片│    │
│   为空]       │  │    │ │    │ │    │ │    │    │
│  [全选未生成] │  │叶真│ │赵虎│ │黑袍│ │齐云│    │
│  [全选已生成] │  │角色│ │角色│ │角色│ │场景│    │
│  [全选错误项] │  └────┘ └────┘ └────┘ └────┘    │
│  [反选]       │                                  │
│  [取消选择]   │  每张卡片：                       │
│  [批预览图片] │  - 顶部：4视图参考图（2x2宫格）   │
│              │  - 名称 + [已生成提示词] 绿色标签  │
│  素材类型筛选  │  - 类型标签：角色(橙)/场景(绿)/   │
│  ☐ 人物      │    工具(蓝)                       │
│  ☐ 场景      │  - 模型名 + 分辨率                │
│  ☐ 道具      │  - 描述文字（截断）               │
│              │                                   │
│  生成模型     │  右上角悬浮标签：                  │
│  [Doubao-    │  "塑角造景"                       │
│   Seedream-  │                                   │
│   4.5]       │                                   │
│              │                                   │
│  分辨率       │                                   │
│  [1K]        │                                   │
│              │                                   │
│  [批量生成   │                                   │
│   提示词]    │                                   │
│  [开始批量   │                                   │
│   生成图片]  │                                   │
└──────────────┴──────────────────────────────────┘
```

### 样式规范

**左侧设置面板**
- 容器：`w-[300px] shrink-0 bg-white p-5 overflow-y-auto`
- 标题：`text-base font-semibold text-gray-900 mb-4`（"批量生成设置"）
- 快捷指令按钮：`w-full py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50`
- 类型筛选：`flex flex-col gap-2` + checkbox
- 下拉选择器（模型/分辨率）：`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm`
- 底部操作按钮：
  - 批量生成提示词：`bg-green-500 text-white rounded-lg px-4 py-2 text-sm`
  - 开始批量生成图片：`bg-green-600 text-white rounded-lg px-4 py-2 text-sm`

**右侧资产网格**
- 容器：`flex-1 overflow-y-auto p-5`
- 网格：`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4`

**资产卡片**
- 容器：`bg-white border border-gray-200 rounded-xl overflow-hidden`
- 图片区：4 视图宫格（2x2），`aspect-square`
- 信息区：`p-3`
  - 名称：`text-sm font-medium text-gray-800`
  - 状态标签：`text-xs px-1.5 py-0.5 rounded border`
    - 已生成提示词：`border-green-300 text-green-600 bg-green-50`
  - 类型标签：
    - 角色：`bg-orange-100 text-orange-700 text-xs px-1.5 py-0.5 rounded`
    - 场景：`bg-green-100 text-green-700 text-xs px-1.5 py-0.5 rounded`
    - 工具：`bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded`
  - 模型信息：`text-xs text-gray-400`
  - 分辨率：`text-xs text-gray-400`
  - 描述：`text-xs text-gray-500 mt-1 line-clamp-2`

---

## 七、页面 5 — 制作工作台（画布）

### 页面概述

- **页面目标**：基于剧本驱动视频制作工作流：脚本 → 导演计划 → 分镜提示 → 分镜图像
- **用户场景**：导演选择剧本后，AI 自动推进制作流程

### 布局结构

```
┌──────────────────────────────┬──────────────────┐
│  顶部：                       │  AI 对话面板      │
│  [📋 剧本选择器 ▾] [🔄][⚙]  │  (w-[35%])       │
├──────────────────────────────┤                  │
│  流程进度条：                 │  ● 标题 + [🔲]   │
│  [脚本]→[导演计划]→          │  [生成]          │
│  [分镜提示]→[分镜图像]       │                  │
│  (步骤高亮当前阶段)           │  执行导演         │
│                              │  ┌──────────┐   │
│  剧本内容画布区               │  │ AI 消息   │   │
│  ┌──────────────────────┐   │  │ 气泡...   │   │
│  │ [脚本] 标签           │   │  └──────────┘   │
│  │ 标题 + 时长 + 风格    │   │                  │
│  │                      │   │  用户消息        │
│  │ 剧情梗概             │   │                  │
│  │ ...                  │   │                  │
│  │ 分场景剧本文本        │   │  ─────────────  │
│  │                      │   │  [⚙] 输入... [▲]│
│  │ [衍生资产] 按钮       │   │                  │
│  └──────────────────────┘   │                  │
│  +/−/🔲/💾 画布控制         │                  │
└──────────────────────────────┴──────────────────┘
```

### 样式规范

**顶部栏**
- 剧本选择器：`border border-gray-200 rounded-lg px-3 py-2 text-sm`
- 刷新/设置图标：`w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center`

**流程进度条**
- 步骤节点：`px-3 py-1 text-xs rounded-full`
  - 当前步骤：`bg-green-500 text-white`
  - 未到步骤：`bg-gray-100 text-gray-400`
- 连接线：虚线箭头

**画布区**
- 缩放控制：`flex flex-col gap-1` 左下角浮动
- 内容卡片：`bg-white border border-gray-200 rounded-xl shadow-sm p-5`

**AI 对话面板**
- 样式同页面 2 的 ChatPanel，角色标签改为"执行导演"
- 顶部有"生成"按钮：`px-4 py-1.5 bg-white border border-gray-200 rounded-lg text-sm`

---

## 八、页面 6 — 资产库

### 页面概述

- **页面目标**：以表格形式管理所有角色、道具、场景、素材资产
- **用户场景**：美术/导演查看和管理已创建的资产，支持增删改查

### 布局结构

```
┌─────────────────────────────────────────────────┐
│  Tab: 🎭角色 │ 🔧道具 │ 🏞️场景 │ ✂️素材         │
│  [+新增角色] [批量生成] [批量删除]  搜索框 [🔍搜索]│
├─────────────────────────────────────────────────┤
│  表格视图：                                      │
│  ☐│ 预览  │ 名称 │提示词│ 描述 │备注│创建时间│操作│
│  ─│──────│─────│─────│─────│───│───────│────│
│  ☐│[4视图]│ 叶真 │男性角│男性，│... │04-08  │⚡✏🗑│
│  ☐│[4视图]│ 赵虎 │男性角│男性，│... │04-08  │⚡✏🗑│
│  ☐│[4视图]│黑袍长│男性角│男性，│... │04-08  │⚡✏🗑│
│                                                  │
│  底部：共 N 条记录               分页器           │
└─────────────────────────────────────────────────┘
```

### 样式规范

**类型 Tab 栏**
- 容器：`flex items-center gap-6 border-b border-gray-100 px-2`
- Tab 样式：
  - 活跃：`pb-3 border-b-2 border-gray-900 text-sm font-medium text-gray-900 flex items-center gap-1.5`
  - 非活跃：`pb-3 border-b-2 border-transparent text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1.5`
- Tab 图标：`w-4 h-4`

**操作按钮**
- 新增：`bg-gray-900 text-white px-4 py-2 rounded-lg text-sm`
- 批量生成：`bg-gray-900 text-white px-4 py-2 rounded-lg text-sm`
- 批量删除：`border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm`
- 搜索：`bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm`

**数据表格**
- 容器：`w-full border border-gray-100 rounded-xl overflow-hidden`
- 表头：`bg-gray-50 text-xs font-medium text-gray-500 uppercase`
- 行：`border-b border-gray-50 hover:bg-gray-50 transition`
- 预览图：`w-16 h-16 rounded-lg object-cover`
- 名称：`text-sm font-medium text-gray-800`
- 提示词/描述：`text-xs text-gray-500 max-w-[200px] truncate`
- 操作列：
  - 生成：`text-blue-500 hover:text-blue-700 text-xs`（"⚡生成"）
  - 编辑：`text-gray-500 hover:text-gray-700 text-xs`（"✏ 编辑"）
  - 删除：`text-red-500 hover:text-red-700 text-xs`（"🗑 删除"）

**分页器**
- 容器：`flex items-center justify-between px-4 py-3`
- 左侧：`text-xs text-gray-400`（"共 N 条记录"）
- 右侧：页码按钮 + 每页条数选择

---

## 九、页面 1 — 小说原文

复用现有 `ChaptersTab` 组件设计，不在此重复。核心功能：
- 章节列表展示
- 新增章节（粘贴原文 → 解析章节）
- 编辑章节内容和标题
- 删除章节

---

## 十、通用交互规范

### 编辑流程（所有 Markdown 内容）
1. 点击"编辑"按钮 → 打开 MarkdownEditorModal
2. 左侧编辑 Markdown 源码，右侧实时预览
3. 点击"保存" → PUT 请求 → loading → 关闭 Modal → 刷新内容
4. 点击"取消" → 关闭 Modal，不保存

### 加载与错误
- 加载中：骨架屏（`animate-pulse`）
- 加载失败：ErrorBanner + 重试按钮
- 空状态：居中图标 + 提示文字

### 标签体系

| 类型 | 颜色 |
|------|------|
| 角色 | `bg-orange-100 text-orange-700` 或 `bg-purple-100 text-purple-700` |
| 场景 | `bg-green-100 text-green-700` 或 `bg-blue-100 text-blue-700` |
| 道具/工具 | `bg-blue-100 text-blue-700` 或 `bg-green-100 text-green-700` |
| 状态（已生成） | `border-green-300 text-green-600 bg-green-50` |
