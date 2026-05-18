# 塑造模块 -- 页面设计方案

> 版本：v1.0 | 创建时间：2026-04-12
> 对应 PRD：五、塑造模块 -- 资产管理（5.1-5.10）
> 设计规范：DESIGN_SPEC.md v2.3

---

## 一、页面概述

### 用户目标

在项目详情页中以卡片网格形式集中管理角色、场景、道具三类视觉资产，完成查看、创建、编辑、删除的完整工作流。

### 页面入口

项目详情页右上角 Tab 导航的第 4 个图标（替换原"素材生成"和"资产库"两个 Tab）。

### Tab 导航变更

| # | 图标 | 页面 ID | 页面名 |
|---|------|---------|--------|
| 1 | 文档图标 | `chapters` | 小说原文 |
| 2 | 人物图标 | `workbench` | 剧本Agent |
| 3 | 列表图标 | `scripts` | 剧本管理 |
| 4 | 调色盘图标 (Palette) | `assets` | 塑造 |
| 5 | 屏幕图标 | `production` | 制作工作台 |

说明：原第 4 位"素材生成"和第 6 位"资产库"合并为"塑造"，图标使用 Lucide `Palette`（调色盘），语义更贴合"视觉资产塑造"。

---

## 二、页面布局结构

### 整体结构

```
┌─────────────────────────────────────────────────────────┐
│  页面标题区                                               │
│  塑造                                    [从大纲提取] [+] │
│  管理角色、场景、道具的视觉资产                             │
├─────────────────────────────────────────────────────────┤
│  筛选 Tab 栏                                              │
│  全部(24)  角色(8)  场景(10)  道具(6)                      │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐            │
│  │ 缩略图  │ │ 缩略图  │ │ 缩略图  │ │  占位   │            │
│  │        │ │        │ │        │ │ 图标   │            │
│  │────────│ │────────│ │────────│ │────────│            │
│  │名称    │ │名称    │ │名称    │ │名称    │            │
│  │[角色]  │ │[场景]  │ │[道具]  │ │[角色]  │            │
│  │描述... │ │描述... │ │描述... │ │描述... │            │
│  │ 已完成 │ │ 待生成 │ │ 生成中 │ │  失败  │            │
│  └────────┘ └────────┘ └────────┘ └────────┘            │
│                                                           │
│  ┌────────┐ ┌────────┐ ...                               │
│  │  ...   │ │  ...   │                                    │
│  └────────┘ └────────┘                                    │
│                                                           │
└─────────────────────────────────────────────────────────┘
                                    ┌──────────────────────┐
                                    │   资产详情抽屉        │
                                    │   (点击卡片后滑出)    │
                                    │   宽度 45%           │
                                    └──────────────────────┘
```

### 页面容器样式

- 外层容器：`p-6`（内页内边距，与其他 Tab 页保持一致）
- 内容最大宽度：无限制（使用全部可用宽度，因为网格需要空间）
- 背景：继承项目详情页的 `bg-gray-50`

---

## 三、页面标题区

### 布局

```
┌──────────────────────────────────────────────────┐
│ 塑造                          [从大纲提取] [+ 新增] │
│ 管理角色、场景、道具的视觉资产                        │
└──────────────────────────────────────────────────┘
```

### 样式

- 标题行：`flex items-center justify-between mb-1`
  - 标题文字：`text-lg font-semibold text-gray-800`
  - 右侧按钮组：`flex items-center gap-2`
- 副标题：`text-sm text-gray-500 mb-5`

### 操作按钮

| 按钮 | 样式 | 图标 |
|------|------|------|
| 从大纲提取 | `secondary` — `px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg border border-gray-200 transition-colors duration-150` | `FileDown` 图标 14px，`mr-1.5` |
| 新增资产 | `primary` — `px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors duration-150` | `Plus` 图标 14px，`mr-1.5` |

---

## 四、筛选 Tab 栏

### 布局

```
全部(24)   角色(8)   场景(10)   道具(6)
─────────────────────────────────────────
```

### 样式

- 容器：`flex items-center gap-1 border-b border-gray-100 mb-5`
- 活跃 Tab：`px-3 py-2.5 text-sm font-medium border-b-2 border-gray-900 text-gray-900`
- 非活跃 Tab：`px-3 py-2.5 text-sm text-gray-500 hover:text-gray-700 border-b-2 border-transparent transition-colors duration-150`
- 数量：`text-xs text-gray-400 ml-1`（紧跟标签文字，如"角色 (8)"），活跃时 `text-gray-600`

### 交互

- 切换 Tab 后立即过滤卡片网格，无加载延迟（纯前端筛选）
- 活跃 Tab 底部有 2px 深灰色下划线，过渡动效 `transition-all duration-200`
- Tab 文字与数量之间用空格分隔，数量用括号包裹

---

## 五、资产卡片网格

### 网格布局

- 容器：`grid gap-4`
- 响应式列数：`grid-cols-2 md:grid-cols-3 lg:grid-cols-4`
- 每列最小宽度由网格自动计算

### 资产卡片（AssetCard）

#### 整体结构

```
┌──────────────────────┐
│                      │
│     缩略图区域        │
│     (aspect-[4/3])   │
│                      │
├──────────────────────┤
│ 资产名称        [类型] │
│ 描述文字最多两行截断... │
│                 状态  │
└──────────────────────┘
```

#### 样式规范

**卡片容器**
- 默认：`bg-white rounded-xl border border-gray-200 overflow-hidden cursor-pointer transition-all duration-200`
- 悬停：`hover:shadow-md hover:border-gray-300`
- 点击反馈：`active:scale-[0.98]`（微缩动效）

**缩略图区域**
- 容器：`relative aspect-[4/3] bg-gray-50 overflow-hidden`
- 图片：`w-full h-full object-cover`
- 图片加载中：`animate-pulse bg-gray-100`

**信息区域**
- 容器：`p-3`
- 第一行（名称 + 类型）：`flex items-center justify-between mb-1`
  - 名称：`text-sm font-medium text-gray-800 truncate flex-1 mr-2`
  - 类型标签：复用 Badge 组件（角色紫/场景蓝/道具绿）
- 第二行（描述）：`text-xs text-gray-500 line-clamp-2 mb-2 min-h-[2rem]`（固定两行高度）
- 第三行（状态）：`flex items-center justify-end`
  - 状态标签样式见下方表格

#### 卡片状态一览

| 状态 | 缩略图表现 | 状态标签样式 | 附加效果 |
|------|-----------|-------------|---------|
| **有图 + success** | 显示实际图片 | `bg-green-50 text-green-700 text-[10px] px-1.5 py-0.5 rounded` + 实心圆点 `w-1.5 h-1.5 rounded-full bg-green-500` | 无 |
| **无图 + pending** | 居中显示类型图标（角色=`User`/场景=`Mountain`/道具=`Box`，`w-10 h-10 text-gray-300`），灰色背景 | `bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded` + 空心圆点 `w-1.5 h-1.5 rounded-full border border-gray-400` | 无 |
| **无图 + generating** | 居中显示类型图标 + 旋转加载指示器叠加（`animate-spin w-5 h-5 text-purple-400` 位于图标右下角） | `bg-blue-50 text-blue-700 text-[10px] px-1.5 py-0.5 rounded` + 脉冲圆点 `w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse` | 卡片边框变为 `border-blue-200` |
| **无图 + failed** | 居中显示类型图标 + 右下角红色警告三角（`AlertTriangle w-4 h-4 text-red-400`） | `bg-red-50 text-red-600 text-[10px] px-1.5 py-0.5 rounded` + 实心圆点 `w-1.5 h-1.5 rounded-full bg-red-500` | 无 |
| **图片加载失败** | 同"无图 + pending"的占位图标显示 | 保持原状态标签 | 无 |

#### 类型占位图标对应

| 资产类型 | Lucide 图标 | 说明 |
|---------|-------------|------|
| character（角色）| `User` | 人物轮廓 |
| scene（场景）| `Mountain` | 山景轮廓 |
| prop（道具）| `Box` | 方块轮廓 |

---

## 六、资产详情抽屉（AssetDetailDrawer）

### 触发方式

点击任意资产卡片，从页面右侧滑入。

### 布局结构

```
┌──────────────────────────────────────────┐
│ 半透明遮罩 (bg-black/30)                  │
│                    ┌─────────────────────┐│
│                    │ 标题栏              ││
│                    │ 名称 [编辑]  [类型] X││
│                    ├─────────────────────┤│
│                    │                     ││
│                    │    图片预览区        ││
│                    │    (大图)           ││
│                    │                     ││
│                    ├─────────────────────┤│
│                    │ 元信息区（只读）      ││
│                    │ 状态 · 模型 · 分辨率  ││
│                    │ 来源集数 · 生成时间   ││
│                    │ [错误信息]           ││
│                    ├─────────────────────┤│
│                    │ 可编辑区             ││
│                    │ 描述                ││
│                    │ [textarea]          ││
│                    │ 视觉锚点（仅角色）    ││
│                    │ [tag] [tag] [+]     ││
│                    │ 提示词               ││
│                    │ [textarea]          ││
│                    ├─────────────────────┤│
│                    │ [删除]     [保存]    ││
│                    └─────────────────────┘│
└──────────────────────────────────────────┘
```

### 抽屉容器样式

- 遮罩：`fixed inset-0 bg-black/30 z-40 transition-opacity duration-300`
- 抽屉面板：`fixed top-0 right-0 h-full w-[45%] max-w-[640px] min-w-[400px] bg-white shadow-xl z-50 flex flex-col`
- 滑入动画：`transform translate-x-full → translate-x-0`，`transition-transform duration-300 ease-out`
- 滑出动画：`translate-x-0 → translate-x-full`，`transition-transform duration-200 ease-in`

### 6.1 标题栏

- 容器：`flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0`
- 左侧（名称 + 类型）：`flex items-center gap-3 flex-1 min-w-0`
  - 资产名称（查看态）：`text-base font-semibold text-gray-800 truncate cursor-pointer hover:text-purple-600 transition-colors duration-150`
  - 资产名称（编辑态）：`text-base font-semibold text-gray-800 border-b-2 border-purple-400 outline-none bg-transparent w-full`
  - 点击名称切换到编辑态，失焦或回车确认
  - 类型标签：复用全局 Badge 组件
- 右侧：关闭按钮 `w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-150`，`X` 图标 18px

### 6.2 图片预览区

- 容器：`px-6 py-4 shrink-0`
- 图片框：`w-full aspect-[4/3] bg-gray-50 rounded-lg overflow-hidden border border-gray-100`
- 有图片时：`<img>` `w-full h-full object-cover`
- 无图片时：居中 `flex flex-col items-center justify-center`
  - 类型占位图标：`w-16 h-16 text-gray-200 mb-2`（同卡片中的类型图标，但更大）
  - 文字：`text-sm text-gray-400`（"暂无图片"）
  - 副文字：`text-xs text-gray-300 mt-1`（"图片通过 CLI 生成"）

### 6.3 元信息区（只读）

- 容器：`px-6 py-4 border-t border-gray-50 shrink-0`
- 区块标题：`text-xs font-medium text-gray-400 uppercase tracking-wider mb-3`（"基本信息"）
- 信息网格：`grid grid-cols-2 gap-x-6 gap-y-3`

| 字段 | label 样式 | value 样式 | 说明 |
|------|-----------|-----------|------|
| 状态 | `text-xs text-gray-400` | 状态标签（同卡片状态标签样式，但稍大：`text-xs px-2 py-0.5 rounded`） | 显示 pending/generating/success/failed |
| 生成模型 | `text-xs text-gray-400` | `text-sm text-gray-700` | 显示 modelId，空值显示 `--` |
| 分辨率 | `text-xs text-gray-400` | `text-sm text-gray-700` | 显示 resolution，空值显示 `--` |
| 来源集数 | `text-xs text-gray-400` | `text-sm text-gray-700` | 显示 `第 N 集`，空值显示 `--` |
| 关联集数 | `text-xs text-gray-400` | `text-sm text-gray-700` | 多个集数用逗号分隔，空数组显示 `--` |
| 生成时间 | `text-xs text-gray-400` | `text-sm text-gray-700` | 格式化为 `YYYY-MM-DD HH:mm`，空值显示 `--` |

**错误信息**（仅 state === 'failed' 时显示）
- 容器：`mt-3 p-3 bg-red-50 border border-red-200 rounded-lg`
- 文字：`text-sm text-red-600`
- 前置图标：`AlertCircle w-4 h-4 text-red-400 mr-2 shrink-0`

### 6.4 可编辑区

- 容器：`flex-1 overflow-y-auto px-6 py-4 border-t border-gray-50 space-y-5`

**描述字段**
- label：`text-xs font-medium text-gray-500 mb-1.5`（"描述"）
- textarea：`w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 resize-none focus:ring-2 focus:ring-purple-300 focus:border-purple-400 transition-shadow duration-150`
- 行数：`rows="3"`，可手动拉伸

**视觉锚点（仅 type === 'character' 时渲染）**
- label：`text-xs font-medium text-gray-500 mb-1.5`（"视觉锚点"）
- 标签容器：`flex flex-wrap items-center gap-2`
- 已有标签：`inline-flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded-lg`
  - 删除按钮：`w-3.5 h-3.5 text-purple-400 hover:text-purple-600 cursor-pointer`（`X` 图标）
- 新增输入：`inline-flex items-center gap-1 px-2 py-1 border border-dashed border-gray-300 text-gray-400 text-xs rounded-lg cursor-pointer hover:border-purple-300 hover:text-purple-500 transition-colors duration-150`（`Plus` 图标 + "添加"）
  - 点击后变为内联输入框：`border border-purple-300 rounded-lg px-2 py-1 text-xs w-24 outline-none`，回车确认，Esc 取消

**提示词字段**
- label：`text-xs font-medium text-gray-500 mb-1.5`（"提示词"）
- textarea：同描述字段样式
- 行数：`rows="5"`（提示词通常较长）
- 占位文本：`text-gray-300`（"输入图片生成提示词..."）

### 6.5 底部操作栏

- 容器：`flex items-center justify-between px-6 py-4 border-t border-gray-100 shrink-0`
- 左侧 — 删除按钮：`px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-150`（`Trash2` 图标 14px + "删除"）
- 右侧 — 保存按钮：
  - 未修改：`px-4 py-2 text-sm bg-gray-100 text-gray-400 rounded-lg cursor-not-allowed`（禁用态）
  - 已修改：`px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors duration-150`
  - 保存中：`px-4 py-2 text-sm bg-purple-600 text-white rounded-lg opacity-75`（前置 spinner `animate-spin w-4 h-4 mr-1.5`）

### 6.6 抽屉交互逻辑

| 交互 | 行为 |
|------|------|
| 点击遮罩 | 如有未保存修改弹出"放弃修改？"确认框，无修改则直接关闭 |
| 按 Esc | 同点击遮罩 |
| 编辑任一字段 | 保存按钮从禁用态变为可点击紫色 |
| 点击保存 | 按钮进入 loading 态 → 调用 PUT API → 成功后按钮恢复，显示 toast "保存成功"，卡片网格同步更新 |
| 保存失败 | 保存按钮恢复可点击，显示错误 toast |
| 点击删除 | 弹出删除确认对话框（见第八节） |
| 名称编辑 | 点击名称变为输入框，失焦或回车自动保存到表单状态（不立即提交 API，需点击保存按钮） |

---

## 七、新增资产弹窗（CreateAssetModal）

### 触发方式

点击标题区的"+ 新增"按钮。

### 弹窗布局

```
┌────────────────────────────────┐
│ 新增资产                    X  │
├────────────────────────────────┤
│                                │
│ 名称 *                         │
│ ┌────────────────────────────┐ │
│ │                            │ │
│ └────────────────────────────┘ │
│                                │
│ 类型 *                         │
│ ┌─────────┐                    │
│ │ 角色  ▾  │                    │
│ └─────────┘                    │
│                                │
│ 描述 *                         │
│ ┌────────────────────────────┐ │
│ │                            │ │
│ │                            │ │
│ └────────────────────────────┘ │
│                                │
│ 视觉锚点（仅角色时显示）         │
│ [tag] [tag] [+添加]            │
│                                │
├────────────────────────────────┤
│              [取消]   [创建]    │
└────────────────────────────────┘
```

### 样式

- 遮罩：`fixed inset-0 bg-black/40 backdrop-blur-sm z-50`
- 弹窗容器：`max-w-md w-full mx-auto bg-white rounded-xl shadow-lg`（垂直居中 `flex items-center justify-center`）
- 标题栏：`flex items-center justify-between px-6 py-4 border-b border-gray-100`
  - 标题：`text-base font-semibold text-gray-800`（"新增资产"）
  - 关闭按钮：`text-gray-400 hover:text-gray-600`
- 表单区：`px-6 py-5 space-y-4`
- 底部按钮：`flex justify-end gap-2 px-6 py-4 border-t border-gray-100`

### 表单字段

| 字段 | 组件 | 必填 | 样式 |
|------|------|------|------|
| 名称 | Input 文本框 | 是 | `w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-300 focus:border-purple-400` |
| 类型 | Select 下拉 | 是 | 同 Input 样式，选项：角色/场景/道具 |
| 描述 | Textarea | 是 | 同 Input 样式，`rows="3"` |
| 视觉锚点 | 标签输入 | 否 | 仅 type=character 时渲染，样式同抽屉中的锚点编辑 |

### 表单验证

- 名称为空时：输入框 `border-red-300 focus:ring-red-300`，下方提示 `text-xs text-red-500 mt-1`（"请输入资产名称"）
- 描述为空时：同上，提示"请输入资产描述"
- 验证通过后创建按钮可点击

### 按钮状态

| 状态 | 创建按钮 |
|------|---------|
| 表单未填完 | `bg-gray-100 text-gray-400 cursor-not-allowed` |
| 表单已填完 | `bg-purple-600 hover:bg-purple-700 text-white` |
| 提交中 | 前置 spinner + `opacity-75` + 禁用 |
| 提交成功 | 弹窗关闭，网格刷新，toast "创建成功" |
| 提交失败 | 按钮恢复，显示错误 toast |

---

## 八、删除确认对话框（DeleteConfirmDialog）

### 触发方式

- 详情抽屉底部的"删除"按钮
- 卡片右键菜单暂不实现（P1），本期仅通过抽屉删除

### 弹窗布局

```
┌────────────────────────────────┐
│ ⚠ 确认删除                     │
├────────────────────────────────┤
│                                │
│ 确认删除资产「齐云宗山门广场」？  │
│ 删除后数据不可恢复，关联的图片    │
│ 文件将保留。                     │
│                                │
├────────────────────────────────┤
│              [取消]   [删除]    │
└────────────────────────────────┘
```

### 样式

- 复用通用 Modal 组件
- 遮罩：`fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]`（高于抽屉的 z-50）
- 弹窗：`max-w-sm w-full mx-auto bg-white rounded-xl shadow-lg`
- 标题：`flex items-center gap-2 px-6 py-4 border-b border-gray-100`
  - 警告图标：`AlertTriangle w-5 h-5 text-orange-500`
  - 标题文字：`text-base font-semibold text-gray-800`（"确认删除"）
- 正文：`px-6 py-5 text-sm text-gray-600 leading-relaxed`
- 底部：`flex justify-end gap-2 px-6 py-4 border-t border-gray-100`
  - 取消：`px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors duration-150`
  - 删除：`px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-150`
  - 删除中：前置 spinner + `opacity-75`

### 交互

- 点击"删除"→ 按钮 loading → 调用 DELETE API → 成功后关闭弹窗 + 关闭抽屉 + 刷新网格 + toast "已删除"
- 失败时按钮恢复，显示错误 toast
- 按 Esc 或点击遮罩关闭弹窗

---

## 九、从大纲提取弹窗（ExtractFromOutlineModal）

### 触发方式

点击标题区的"从大纲提取"按钮。

### 两阶段交互

**阶段一：分析中（加载态）**

```
┌────────────────────────────────┐
│ 从大纲提取资产               X  │
├────────────────────────────────┤
│                                │
│        (loading spinner)       │
│      正在分析大纲数据...        │
│                                │
└────────────────────────────────┘
```

**阶段二：预览结果**

```
┌────────────────────────────────┐
│ 从大纲提取资产               X  │
├────────────────────────────────┤
│                                │
│ 分析完成，将从大纲中提取：       │
│                                │
│  ┌──────────────────────────┐  │
│  │ 角色  5 个               │  │
│  │ 场景  8 个               │  │
│  │ 道具  3 个               │  │
│  │ ───────────────────────  │  │
│  │ 合计  16 个              │  │
│  │ 重复跳过  2 个            │  │
│  └──────────────────────────┘  │
│                                │
├────────────────────────────────┤
│              [取消]  [确认提取]  │
└────────────────────────────────┘
```

**阶段二（异常态）：无数据**

```
┌────────────────────────────────┐
│ 从大纲提取资产               X  │
├────────────────────────────────┤
│                                │
│     (FileX 图标 w-10 h-10)    │
│      未找到大纲数据             │
│   请先在剧本Agent中生成大纲     │
│                                │
├────────────────────────────────┤
│                       [关闭]   │
└────────────────────────────────┘
```

### 样式

- 弹窗容器：`max-w-sm w-full mx-auto bg-white rounded-xl shadow-lg`
- 标题栏：同其他弹窗
- 加载态：居中 spinner `w-8 h-8 text-purple-500 animate-spin` + `text-sm text-gray-500 mt-3`
- 预览统计：
  - 卡片：`bg-gray-50 rounded-lg p-4 mx-6`
  - 每行：`flex items-center justify-between py-1.5`
    - 类型标签（左）：`text-sm text-gray-600` + 类型 Badge
    - 数量（右）：`text-sm font-medium text-gray-800`
  - 分割线：`border-t border-gray-200 my-1.5`
  - 合计行：`text-sm font-semibold text-gray-800`
  - 重复跳过行：`text-xs text-gray-400`
- 无数据态：
  - 图标：`FileX` 或 `FileQuestion`，`w-10 h-10 text-gray-300 mx-auto mb-3`
  - 主文：`text-sm text-gray-500 text-center`
  - 副文：`text-xs text-gray-400 text-center mt-1`
- 确认按钮：`bg-purple-600 hover:bg-purple-700 text-white`（primary 样式）
- 提取中：按钮 loading 态

### 交互流程

1. 点击按钮 → 弹窗打开 → 自动调用 POST `/api/projects/[name]/seedance/assets/extract?preview=true` 获取预览数据
2. 加载完成 → 展示预览统计
3. 用户点击"确认提取" → 按钮 loading → 调用 POST `/api/projects/[name]/seedance/assets/extract` 执行提取
4. 提取成功 → 弹窗关闭 → 网格刷新 → toast "成功提取 N 个资产"
5. 提取失败 → 显示错误 toast

---

## 十、空状态设计

### 场景一：项目无任何资产

```
┌─────────────────────────────────────────┐
│                                         │
│         (Palette 图标 w-12 h-12)        │
│                                         │
│         暂无视觉资产                     │
│   从大纲中提取角色、场景和道具，           │
│   或手动创建资产开始塑造                  │
│                                         │
│    [从大纲提取]    [+ 新增资产]           │
│                                         │
└─────────────────────────────────────────┘
```

- 容器：`py-16 flex flex-col items-center justify-center`
- 图标：`Palette w-12 h-12 text-gray-200 mb-4`
- 主文：`text-sm text-gray-500 mb-1`
- 副文：`text-xs text-gray-400 mb-5 text-center max-w-xs`
- 按钮组：`flex items-center gap-3`
  - 从大纲提取：secondary 按钮样式
  - 新增资产：primary 按钮样式

### 场景二：当前筛选类型无资产

```
┌─────────────────────────────────────────┐
│                                         │
│       (类型对应图标 w-10 h-10)           │
│                                         │
│         暂无角色资产                     │
│       点击上方"+ 新增"创建               │
│                                         │
└─────────────────────────────────────────┘
```

- 容器：`py-12 flex flex-col items-center justify-center`
- 图标：使用对应类型的占位图标（User/Mountain/Box），`w-10 h-10 text-gray-200 mb-3`
- 主文：`text-sm text-gray-500 mb-1`（动态："暂无角色资产"/"暂无场景资产"/"暂无道具资产"）
- 副文：`text-xs text-gray-400`

---

## 十一、加载状态设计

### 首次加载（骨架屏）

网格区域显示 8 个骨架卡片（2 行 x 4 列）：

```
┌──────────────────────┐
│ ░░░░░░░░░░░░░░░░░░░░ │  ← animate-pulse bg-gray-100 aspect-[4/3] rounded-t-xl
├──────────────────────┤
│ ░░░░░░░░░░  ░░░      │  ← h-4 bg-gray-100 rounded + h-3 bg-gray-100 rounded w-12
│ ░░░░░░░░░░░░░░░░     │  ← h-3 bg-gray-100 rounded w-[85%]
│ ░░░░░░░░░░░░░        │  ← h-3 bg-gray-100 rounded w-[65%]
└──────────────────────┘
```

- 骨架容器：`animate-pulse`
- 缩略图区域：`aspect-[4/3] bg-gray-100 rounded-t-xl`
- 信息区域：`p-3 space-y-2`
  - 第一行：`flex justify-between`，左 `h-4 bg-gray-100 rounded w-[60%]`，右 `h-4 bg-gray-100 rounded w-12`
  - 第二行：`h-3 bg-gray-100 rounded w-[85%]`
  - 第三行：`h-3 bg-gray-100 rounded w-[65%]`

### 接口错误

```
┌─────────────────────────────────────────────────────┐
│ ⚠ 加载资产数据失败                          [重试]   │
└─────────────────────────────────────────────────────┘
```

- 复用通用错误提示组件
- `p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between`
- 左侧：`AlertCircle w-4 h-4 text-red-400 mr-2` + `text-sm text-red-600`
- 右侧：`text-sm text-red-600 hover:text-red-700 font-medium cursor-pointer`（"重试"）

---

## 十二、响应式适配

| 断点 | 卡片列数 | 抽屉宽度 | 页面内边距 | 特殊处理 |
|------|---------|---------|-----------|---------|
| < 640px (sm) | 2 列 | 100%（全屏抽屉） | `p-4` | 抽屉底部操作栏固定在底部 |
| 640px - 1024px (md) | 3 列 | 60% | `p-5` | -- |
| > 1024px (lg) | 4 列 | 45%（max-w-640px, min-w-400px） | `p-6` | -- |

### 小屏适配说明

- 小屏下抽屉变为全屏覆盖，顶部增加返回箭头按钮（替代关闭 X）
- 卡片缩略图区域比例保持 4:3
- 标题区的两个操作按钮缩为图标按钮（去掉文字，保留图标 + tooltip）

---

## 十三、组件清单

| 组件 | 文件路径建议 | 职责 | 状态覆盖 |
|------|-------------|------|---------|
| AssetsTab | `components/project/AssetsTab.tsx` | 塑造 Tab 页面主入口，组合标题区 + 筛选栏 + 卡片网格 | 默认/加载/空/错误 |
| AssetFilterBar | `components/project/assets/AssetFilterBar.tsx` | 类型筛选 Tab 栏（全部/角色/场景/道具），含数量统计 | -- |
| AssetCardGrid | `components/project/assets/AssetCardGrid.tsx` | 响应式卡片网格容器 | 默认/空/加载骨架 |
| AssetCard | `components/project/assets/AssetCard.tsx` | 单张资产卡片，含缩略图+名称+类型+状态 | 有图/无图/生成中/失败/图片加载失败 |
| AssetDetailDrawer | `components/project/assets/AssetDetailDrawer.tsx` | 右侧详情抽屉，含图片预览+元信息+编辑区+操作栏 | 查看/编辑中/保存中/有未保存修改 |
| AssetMetaInfo | `components/project/assets/AssetMetaInfo.tsx` | 抽屉内元信息区（只读网格） | 默认/失败错误展示 |
| AssetEditForm | `components/project/assets/AssetEditForm.tsx` | 抽屉内可编辑区（描述+锚点+提示词） | 默认/已修改 |
| IdentityAnchorTags | `components/project/assets/IdentityAnchorTags.tsx` | 视觉锚点标签编辑组件 | 查看/编辑/新增输入态 |
| CreateAssetModal | `components/project/assets/CreateAssetModal.tsx` | 新增资产弹窗表单 | 空表单/验证错误/提交中 |
| DeleteConfirmDialog | `components/project/assets/DeleteConfirmDialog.tsx` | 删除确认对话框 | 默认/删除中 |
| ExtractFromOutlineModal | `components/project/assets/ExtractFromOutlineModal.tsx` | 从大纲提取预览弹窗 | 加载中/预览/无数据/提取中 |
| AssetEmptyState | `components/project/assets/AssetEmptyState.tsx` | 空状态展示（区分全局空和筛选空） | 全局空/筛选空 |
| AssetCardSkeleton | `components/project/assets/AssetCardSkeleton.tsx` | 卡片骨架屏 | -- |

---

## 十四、交互动效汇总

| 交互 | 动效 | 参数 |
|------|------|------|
| 卡片悬停 | 阴影加深 + 边框变色 | `transition-all duration-200` |
| 卡片点击 | 微缩 | `active:scale-[0.98]` |
| 抽屉打开 | 右侧滑入 | `transform duration-300 ease-out` |
| 抽屉关闭 | 右侧滑出 | `transform duration-200 ease-in` |
| 遮罩显隐 | 透明度渐变 | `opacity duration-300` |
| 弹窗出现 | 缩放 + 渐显 | `scale-95 opacity-0 → scale-100 opacity-100, duration-200` |
| 筛选切换 | Tab 下划线滑动 | `transition-all duration-200` |
| 保存按钮激活 | 颜色变化 | `transition-colors duration-150` |
| generating 状态脉冲 | 圆点闪烁 | `animate-pulse` |
| 骨架屏 | 闪烁 | `animate-pulse` |

---

## 十五、自检结果

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | 视觉令牌一致性 | 通过 -- 所有色值（purple-600/gray-200/red-600 等）、字号（text-sm/text-xs/text-base）、间距（p-3/p-6/gap-4）、圆角（rounded-xl/rounded-lg）均引用 DESIGN_SPEC.md 中定义的令牌 |
| 2 | 状态完整性 | 通过 -- 卡片覆盖有图/无图/生成中/失败/图片加载失败；抽屉覆盖查看/编辑/保存中；弹窗覆盖空表单/验证/提交中；页面覆盖默认/加载/空/错误 |
| 3 | 响应式覆盖 | 通过 -- 标注了三档断点（sm/md/lg）下卡片列数、抽屉宽度、页面内边距和小屏特殊处理 |
| 4 | 组件可开发性 | 通过 -- 每个组件有明确的 Tailwind 类名、状态描述和交互逻辑，developer 可直接实现 |
| 5 | PRD 覆盖率 | 通过 -- F1 资产卡片网格、F2 详情抽屉、F3 新增资产、F4 删除资产、F5 从大纲提取，全部 P0 功能均有对应设计 |
| 6 | 可访问性 | 通过 -- 状态标签使用颜色+圆点+文字多维度区分，不仅依赖颜色；类型标签使用不同色系；交互元素有 hover/focus 反馈 |
