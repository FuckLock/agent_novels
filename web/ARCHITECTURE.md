# Web 技术架构文档

## 一、剧本管理 -- 卡片列表与详情弹窗

> 对应 PRD 第四章、DESIGN_SPEC 第六章
> 创建时间：2026-04-10

---

### 1. 技术影响评估

#### 1.1 现有组件变更矩阵

| 组件 | 文件路径 | 变更类型 | 说明 |
|------|----------|----------|------|
| `ScriptsTab` | `tabs/ScriptsTab.tsx` | **重构** | 从 Tab 切换模式改为卡片网格 + 弹窗模式；移除 `activeEpisode`/`scriptContent`/`isEditing` 等单集状态，改为管理 `selectedEpisode`（控制弹窗打开）；审核功能入口移至弹窗或卡片列表 |
| `EpisodeTabBar` | `scripts/EpisodeTabBar.tsx` | **弃用** | 被卡片网格替代，不再引用 |
| `ScriptContentCard` | `scripts/ScriptContentCard.tsx` | **保留复用** | 内部渲染逻辑（`renderScriptLine`、骨架屏、编辑 textarea）迁移至 `ScriptDetailModal` 中复用；组件本身可能不再被外部直接引用，但逻辑全部保留 |
| `ScriptHeader` | `scripts/ScriptHeader.tsx` | **微调** | 移除 `scriptContent`/`scriptLoading` Props（不再依赖单集加载状态）；导出按钮改为"一键导出所有"或移至弹窗内 |
| `EmptyScripts` | `scripts/EmptyScripts.tsx` | **保留** | 不做修改 |
| `SectionCard` | `scripts/SectionCard.tsx` | **保留** | 可在弹窗内复用（如包裹剧本内容区） |
| `Modal` | `components/Modal.tsx` | **保留** | 用于"未保存确认"二次弹窗；详情弹窗因尺寸和布局定制需求，不直接使用此组件 |
| `Button` | `components/Button.tsx` | **保留** | 弹窗内保存/取消按钮复用 |
| `Card` | `components/Card.tsx` | **保留** | 可选用于卡片外层包裹 |

#### 1.2 API 变更

| API | 方法 | 变更 | 说明 |
|-----|------|------|------|
| `/api/projects/[name]/scripts` | GET | **无变更** | 卡片列表复用现有接口获取剧本列表 |
| `/api/projects/[name]/scripts/[episode]` | GET | **无变更** | 弹窗打开时加载单集内容 |
| `/api/projects/[name]/scripts/[episode]` | PUT | **扩展** | 在现有 `content` 字段基础上，需支持同时保存 `title`（剧本名称）字段；更新 content 时需同步更新文件第一行标题 |
| `/api/projects/[name]/scripts/[episode]/assets` | GET | **新增** | 读取 `episode-{N}-assets.json`，如不存在返回空对象 |
| `/api/projects/[name]/scripts/[episode]/assets` | PUT | **新增** | 写入关联资产到 `episode-{N}-assets.json` |

#### 1.3 数据存储变更

**关联资产持久化方案**（回答 PRD Q8）：

采用**独立 JSON 文件**方案：`novels/{name}/scripts/episode-{N}-assets.json`

```json
{
  "characters": ["叶真", "赵虎", "黑袍长老"],
  "scenes": ["齐云宗山门广场", "山门旁凉亭"],
  "props": ["灰色杂役弟子服", "传音信笺"]
}
```

**选择理由**：
- 与现有 `episode-{N}.txt` 平级存放，路径语义清晰
- 不侵入 `outline.json`（PRD 明确 outline.json 为只读）
- 不侵入剧本 txt 文件（纯文本文件不适合嵌入结构化数据）
- 独立文件便于单集独立读写，不存在并发冲突

**PRD 待澄清项决策建议**：
- Q9（名称同步 outline.json）：**不同步**。outline.json 是 AI 生成的只读数据源，剧本名称编辑仅更新 txt 文件第一行
- Q10（排序/筛选）：**V1 不做**。卡片按集数升序排列即可，后续按需扩展
- Q11（提取结果缓存）：**V1 不做前端缓存**。资产 JSON 文件本身就是持久化缓存；首次打开弹窗时，如 JSON 不存在则自动提取并写入
- Q12（操作历史/撤销）：**V1 不做**。关联资产的增删操作在"确认"时一次性保存，"取消"即丢弃

#### 1.4 类型定义变更

在 `types.tsx` 中新增：

```typescript
/** 关联资产数据结构 */
export interface LinkedAssetsData {
  characters: string[];
  scenes: string[];
  props: string[];
}

/** 资产类型枚举 */
export type AssetType = 'characters' | 'scenes' | 'props';

/** 资产类型显示配置 */
export const ASSET_TYPE_CONFIG: Record<AssetType, {
  label: string;
  bgColor: string;
  textColor: string;
  hoverColor: string;
}> = {
  characters: {
    label: '角色',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-700',
    hoverColor: 'hover:text-purple-900',
  },
  scenes: {
    label: '场景',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
    hoverColor: 'hover:text-blue-900',
  },
  props: {
    label: '道具与服装',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    hoverColor: 'hover:text-green-900',
  },
};

/** 剧本卡片展示所需数据 */
export interface ScriptCardData {
  episode: number;
  title: string;         // 从 outline.json 或剧本首行解析
  charCount: number;     // 字数统计
  sceneCount: number;    // 场景数量
  hasContent: boolean;   // 是否已生成
}
```

---

### 2. 组件架构设计

#### 2.1 新建组件清单

| 组件 | 文件路径 | 职责 |
|------|----------|------|
| `ScriptCard` | `tabs/scripts/ScriptCard.tsx` | 单个剧本卡片，展示集数/标题/字数/场景数 |
| `ScriptDetailModal` | `tabs/scripts/ScriptDetailModal.tsx` | 剧本详情弹窗主容器（名称编辑 + 内容读写 + 关联资产 + 底部操作） |
| `LinkedAssets` | `tabs/scripts/LinkedAssets.tsx` | 关联资产展示区（分组 Tag 列表 + 删除 + "选择资产"入口） |
| `AssetPicker` | `tabs/scripts/AssetPicker.tsx` | 资产选择 Popover（分 Tab 列表 + 勾选/取消勾选） |
| `AssetTag` | `tabs/scripts/AssetTag.tsx` | 单个资产标签（类型色彩 + 名称 + 删除按钮） |
| `parseScriptAssets` | `utils/scriptAssetParser.ts` | 剧本文本自动提取工具函数（纯函数，无副作用） |

#### 2.2 组件层级与数据流

```
ScriptsTab (页面容器)
├── ScriptHeader (复用，微调 Props)
├── [scripts.length === 0] → EmptyScripts (复用)
├── [scripts.length > 0] → 卡片网格
│   └── ScriptCard[] (新建)  ← 点击触发 setSelectedEpisode
│
└── ScriptDetailModal (新建，selectedEpisode !== null 时渲染)
    ├── C1: 弹窗标题栏 (内联)
    ├── C2: 剧本名称编辑区 (内联)
    ├── C3: 剧本内容区 (复用 ScriptContentCard 渲染逻辑)
    ├── C4: LinkedAssets (新建)
    │   ├── AssetTag[] (新建)
    │   └── AssetPicker (新建，Popover 浮层)
    └── C6: 底部操作栏 (内联)
```

#### 2.3 Props 接口定义

```typescript
// --- ScriptCard ---
interface ScriptCardProps {
  episode: number;
  title: string;
  charCount: number;
  sceneCount: number;
  hasContent: boolean;
  onClick: () => void;
}

// --- ScriptDetailModal ---
interface ScriptDetailModalProps {
  isOpen: boolean;
  episode: number;
  encodedName: string;
  outline?: OutlineEpisode[] | null;  // 用于资产选择面板和交叉验证
  onClose: () => void;
  onSaved: () => void;  // 保存成功后回调（刷新卡片列表）
}

// --- LinkedAssets ---
interface LinkedAssetsProps {
  assets: LinkedAssetsData;
  allAssets: LinkedAssetsData;   // outline.json 中所有可用资产（去重合并）
  onChange: (assets: LinkedAssetsData) => void;
}

// --- AssetPicker ---
interface AssetPickerProps {
  allAssets: LinkedAssetsData;
  selectedAssets: LinkedAssetsData;
  onToggle: (type: AssetType, name: string) => void;
  onClose: () => void;
}

// --- AssetTag ---
interface AssetTagProps {
  type: AssetType;
  name: string;
  onRemove: () => void;
}
```

#### 2.4 状态管理方案

**ScriptsTab（页面层）**：
- `selectedEpisode: number | null` -- 控制弹窗开关
- `scripts` -- 从 `project.scripts` 派生（已有）
- 卡片数据（标题、字数、场景数）从 `project.outline` + `project.scripts` 在前端计算

**ScriptDetailModal（弹窗层）**：
- `scriptContent: string` -- 原始剧本内容（API 加载）
- `scriptTitle: string` -- 剧本名称
- `editTitle: string` -- 编辑中的名称
- `editContent: string` -- 编辑中的内容
- `isEditingContent: boolean` -- 内容编辑模式开关
- `isEditingTitle: boolean` -- 名称编辑模式开关
- `linkedAssets: LinkedAssetsData` -- 当前关联资产（可增删）
- `originalAssets: LinkedAssetsData` -- 初始资产快照（用于脏检查）
- `loading: boolean` -- 加载状态
- `saving: boolean` -- 保存状态
- `isDirty: boolean` -- 派生状态，判断是否有未保存修改

**LinkedAssets（资产区）**：
- 无独立状态，完全受控于 `ScriptDetailModal` 传入的 `assets` 和 `onChange`

**AssetPicker（选择面板）**：
- `activeTab: AssetType` -- 当前选中的分类 Tab
- `isOpen: boolean` -- 面板显示状态（由 LinkedAssets 控制）

**设计原则**：弹窗内的所有编辑状态统一由 `ScriptDetailModal` 管理，子组件通过回调上报变更。点击"确认"时一次性提交所有变更（名称 + 内容 + 资产），点击"取消"则丢弃全部。

---

### 3. 资产自动提取算法设计

#### 3.1 函数签名

文件路径：`tabs/[name]/utils/scriptAssetParser.ts`

```typescript
import { LinkedAssetsData, OutlineEpisode } from '../types';

/**
 * 从剧本文本中自动提取关联资产，并与 outline.json 交叉验证
 *
 * @param scriptContent - 剧本纯文本内容
 * @param episodeOutline - 当前集的 outline 数据（可选，用于交叉验证和道具匹配）
 * @param allOutlineEpisodes - 所有集的 outline（可选，用于构建全局道具词典）
 * @returns 提取并合并后的关联资产
 */
export function parseScriptAssets(
  scriptContent: string,
  episodeOutline?: OutlineEpisode | null,
  allOutlineEpisodes?: OutlineEpisode[] | null,
): LinkedAssetsData;
```

#### 3.2 角色提取逻辑

```typescript
function extractCharacters(lines: string[]): string[] {
  const characters = new Set<string>();

  // 规则 1：匹配"人物："行
  // 格式：人物：叶真、赵虎、众杂役弟子若干
  const personLineRegex = /^人物[：:]\s*(.+)$/;
  // 过滤词：以这些词开头的不算具名角色
  const filterPrefixes = ['若干', '等', '众', '数', '几', '一群', '一帮', '路人'];

  for (const line of lines) {
    const trimmed = line.trim();

    // 规则 1：人物行
    const personMatch = trimmed.match(personLineRegex);
    if (personMatch) {
      const names = personMatch[1].split(/[、，,\s]+/);
      for (const name of names) {
        const cleaned = name.trim();
        if (cleaned && !filterPrefixes.some(p => cleaned.startsWith(p))) {
          characters.add(cleaned);
        }
      }
      continue;
    }

    // 规则 2：台词行（名字：台词）
    // 匹配：冒号前为 1-6 个字符的角色名（排除括号内容和行首特殊标记）
    const dialogueRegex = /^([^\s（(△※$【][^：:（(]{0,5})[：:](?!\/)/;
    const dialogueMatch = trimmed.match(dialogueRegex);
    if (dialogueMatch) {
      const name = dialogueMatch[1].trim();
      // 排除场景标题行（如 "S01 xxx 日:晴"）
      if (!name.match(/^S?\d+\s/) && name.length >= 1 && name.length <= 6) {
        characters.add(name);
      }
    }
  }

  return Array.from(characters);
}
```

**关键设计决策**：
- 角色名长度限制 1-6 字符，覆盖中文名（如"叶真"2字、"黑袍长老"4字）同时排除误匹配
- 台词行的正则排除 `△`、`※`、`$`、`【` 开头的特殊行，避免动作描写、音效等被误判
- 冒号后跟 `/` 的排除（如 `日/外` 场景时间标记）

#### 3.3 场景提取逻辑

```typescript
function extractScenes(lines: string[]): string[] {
  const scenes = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();

    // 格式 A：S01 齐云宗·山门广场 日/晴
    const formatA = trimmed.match(/^S(\d+)\s+(.+?)\s+(日|夜|晨|昏|午)\//);
    if (formatA) {
      scenes.add(formatA[2].trim());
      continue;
    }

    // 格式 B：1 宗门广场 日/外
    const formatB = trimmed.match(/^(\d+)\s+(.+?)\s+(日|夜|晨|昏|午)\/(内|外|内外)/);
    if (formatB) {
      scenes.add(formatB[2].trim());
      continue;
    }
  }

  return Array.from(scenes);
}
```

#### 3.4 道具提取逻辑

```typescript
function extractProps(
  lines: string[],
  knownProps: string[],
): string[] {
  if (knownProps.length === 0) return [];

  const found = new Set<string>();

  // 仅在动作描写行（△ 开头）中匹配已知道具名
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('△')) continue;

    for (const prop of knownProps) {
      if (trimmed.includes(prop)) {
        found.add(prop);
      }
    }
  }

  return Array.from(found);
}
```

**关键设计决策**：
- 道具提取采用**词典匹配**策略（而非正则猜测），词典来源为 outline.json 中所有集的 `props[].name` 合并去重
- 仅扫描 `△` 开头的动作描写行，大幅减少误提取风险
- 如 outline.json 中无 props 数据，则不提取任何道具

#### 3.5 交叉验证与合并

```typescript
export function parseScriptAssets(
  scriptContent: string,
  episodeOutline?: OutlineEpisode | null,
  allOutlineEpisodes?: OutlineEpisode[] | null,
): LinkedAssetsData {
  const lines = scriptContent.split('\n');

  // 构建已知道具词典（所有集合并去重）
  const knownProps: string[] = [];
  if (allOutlineEpisodes) {
    const propSet = new Set<string>();
    for (const ep of allOutlineEpisodes) {
      for (const p of ep.props || []) {
        const name = typeof p === 'string' ? p : p.name;
        propSet.add(name);
      }
    }
    knownProps.push(...propSet);
  }

  // Step 1: 从剧本文本提取
  const textCharacters = extractCharacters(lines);
  const textScenes = extractScenes(lines);
  const textProps = extractProps(lines, knownProps);

  // Step 2: 从 outline.json 当前集补充
  const outlineCharacters: string[] = [];
  const outlineScenes: string[] = [];
  const outlineProps: string[] = [];

  if (episodeOutline) {
    for (const c of episodeOutline.characters || []) {
      outlineCharacters.push(typeof c === 'string' ? c : c.name);
    }
    for (const s of episodeOutline.scenes || []) {
      outlineScenes.push(typeof s === 'string' ? s : s.name);
    }
    for (const p of episodeOutline.props || []) {
      outlineProps.push(typeof p === 'string' ? p : p.name);
    }
  }

  // Step 3: 合并去重（文本提取 + outline 补充）
  return {
    characters: [...new Set([...textCharacters, ...outlineCharacters])],
    scenes: [...new Set([...textScenes, ...outlineScenes])],
    props: [...new Set([...textProps, ...outlineProps])],
  };
}
```

#### 3.6 提取时机

1. 弹窗打开时，先尝试读取 `episode-{N}-assets.json`
2. 如文件存在 → 直接使用持久化数据（用户之前手动调整过的结果）
3. 如文件不存在 → 调用 `parseScriptAssets()` 自动提取 → 作为初始值展示
4. 用户点击"确认"时，将当前资产状态写入 `episode-{N}-assets.json`

---

### 4. 开发任务拆分

以下路径均相对于 `web/app/projects/[name]/`。

#### Task 1: 类型定义与工具函数（无依赖）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 -- 基础设施，被后续所有任务依赖 |
| **涉及文件** | `types.tsx`、`utils/scriptAssetParser.ts`（新建） |
| **工作内容** | 1) 在 `types.tsx` 中新增 `LinkedAssetsData`、`AssetType`、`ASSET_TYPE_CONFIG`、`ScriptCardData` 类型定义 2) 新建 `utils/scriptAssetParser.ts`，实现 `parseScriptAssets`、`extractCharacters`、`extractScenes`、`extractProps` 函数 |
| **验收标准** | 类型定义无 TS 错误；`parseScriptAssets` 对典型剧本文本（含人物行、台词行、场景标题、△动作行）能正确提取角色/场景/道具 |

#### Task 2: 关联资产 API（依赖 Task 1）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 -- 数据层，被弹窗组件依赖 |
| **涉及文件** | `../../api/projects/[name]/scripts/[episode]/assets/route.ts`（新建）、`../../lib/novels.ts`（新增函数） |
| **工作内容** | 1) 在 `novels.ts` 中新增 `getScriptAssets(name, episode)` 和 `updateScriptAssets(name, episode, assets)` 函数，读写 `novels/{name}/scripts/episode-{N}-assets.json` 2) 新建 API route，GET 返回资产 JSON（不存在时返回 `{ characters: [], scenes: [], props: [] }`），PUT 写入资产 JSON 3) 扩展 `PUT /api/projects/[name]/scripts/[episode]` 的 request body，支持可选的 `title` 字段 |
| **验收标准** | GET/PUT 接口正常工作；文件不存在时 GET 返回空结构；PUT 正确写入 JSON 文件 |

#### Task 3: AssetTag 组件（依赖 Task 1）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 -- 原子组件，被 LinkedAssets 依赖 |
| **涉及文件** | `tabs/scripts/AssetTag.tsx`（新建） |
| **工作内容** | 实现单个资产标签组件，根据 `type` 渲染对应颜色，包含名称文字和 x 删除按钮。样式严格按 DESIGN_SPEC C4 区域的 Tag 样式规范 |
| **验收标准** | 三种类型（角色/场景/道具）颜色正确；点击 x 触发 onRemove；hover 态 opacity 变化 |

#### Task 4: ScriptCard 组件（依赖 Task 1）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 -- 列表核心组件 |
| **涉及文件** | `tabs/scripts/ScriptCard.tsx`（新建） |
| **工作内容** | 实现剧本卡片组件：集数编号徽章（EPxx）、标题（单行截断）、元信息行（字数 + 场景数）、空状态（"暂未生成"）、hover/active 动效。样式严格按 DESIGN_SPEC 区域 B 规范 |
| **验收标准** | 有内容/无内容两种状态正确渲染；hover 浮起 + 紫色边框；active 微缩 |

#### Task 5: LinkedAssets + AssetPicker 组件（依赖 Task 1、Task 3）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 -- 弹窗核心子组件 |
| **涉及文件** | `tabs/scripts/LinkedAssets.tsx`（新建）、`tabs/scripts/AssetPicker.tsx`（新建） |
| **工作内容** | 1) `LinkedAssets`：按角色/场景/道具三组展示 AssetTag，空组不显示标题，全空时显示占位文字，包含"+ 选择资产"按钮触发 AssetPicker 2) `AssetPicker`：Popover 浮层，分 Tab（角色/场景/道具）展示 outline.json 中所有资产，已选中项显示勾选，点击切换选中状态 |
| **验收标准** | Tag 展示和删除正常；Popover 定位正确；Tab 切换流畅；已选中资产不可重复添加；点击外部关闭面板 |

#### Task 6: ScriptDetailModal 弹窗组件（依赖 Task 2、Task 5）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 -- 核心功能组件 |
| **涉及文件** | `tabs/scripts/ScriptDetailModal.tsx`（新建） |
| **工作内容** | 1) 弹窗容器（遮罩 + 定制尺寸 `max-w-[900px] w-[75vw] max-h-[90vh]`） 2) 标题栏（sticky top，含关闭按钮） 3) 名称编辑区（只读/编辑切换，Escape 退出编辑） 4) 内容区（复用 `renderScriptLine` 只读渲染 + textarea 编辑模式，内部 `max-h-[400px]` 独立滚动） 5) 关联资产区（集成 LinkedAssets，弹窗打开时调用 `parseScriptAssets` 或读取已有 JSON） 6) 底部操作栏（sticky bottom，取消/确认按钮） 7) 未保存修改拦截（关闭/取消时检测脏状态，弹出确认对话框） 8) 确认时一次性保存：PUT content + PUT assets |
| **验收标准** | 弹窗正确加载剧本内容；名称和内容可编辑并保存；关联资产自动提取和手动管理正常；未保存拦截生效；保存后弹窗关闭 |

#### Task 7: ScriptsTab 重构（依赖 Task 4、Task 6）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 -- 页面整合 |
| **涉及文件** | `tabs/ScriptsTab.tsx`（重构）、`tabs/scripts/ScriptHeader.tsx`（微调） |
| **工作内容** | 1) 重构 ScriptsTab：移除 EpisodeTabBar 引用和单集状态（activeEpisode/scriptContent/isEditing 等）；新增 `selectedEpisode` 状态控制弹窗；构建卡片数据（从 outline 获取标题，从 scripts 列表获取集数） 2) 卡片网格布局 `grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4` 3) 微调 ScriptHeader：移除 `scriptContent`/`scriptLoading` Props，导出按钮改为全量导出或移至弹窗 4) 审核功能入口保留（可放在卡片列表页面的统一位置） |
| **验收标准** | 卡片网格正确渲染所有集数；点击卡片打开弹窗；弹窗保存后卡片数据刷新；响应式布局 2/3/4 列正确切换；空状态显示 EmptyScripts |

#### Task 8: 卡片列表字数/场景数计算（依赖 Task 7）

| 项目 | 内容 |
|------|------|
| **优先级** | P1 -- 信息增强 |
| **涉及文件** | `tabs/ScriptsTab.tsx`、可能需要扩展 `GET /api/projects/[name]/scripts` 接口 |
| **工作内容** | 卡片上需要展示字数和场景数，但现有 scripts 列表接口只返回 `{ episode, filename }`，不包含内容。方案选择：**方案 A**（推荐）：扩展 scripts 列表 API，在服务端计算每集的 charCount 和 sceneCount 一并返回，避免前端逐集请求；**方案 B**：前端打开页面时并行请求所有集内容后计算（集数多时性能差） |
| **验收标准** | 卡片上正确显示字数和场景数 |

---

### 5. 文件变更总览

```
web/app/projects/[name]/
├── types.tsx                              [修改] 新增类型定义
├── tabs/
│   ├── ScriptsTab.tsx                     [重构] Tab 模式 → 卡片网格 + 弹窗
│   └── scripts/
│       ├── ScriptHeader.tsx               [微调] 移除单集依赖 Props
│       ├── EpisodeTabBar.tsx              [弃用] 不再引用
│       ├── ScriptContentCard.tsx          [保留] 渲染逻辑被弹窗复用
│       ├── SectionCard.tsx                [保留]
│       ├── EmptyScripts.tsx               [保留]
│       ├── ScriptCard.tsx                 [新建] 剧本卡片
│       ├── ScriptDetailModal.tsx          [新建] 详情弹窗
│       ├── LinkedAssets.tsx               [新建] 关联资产区
│       ├── AssetPicker.tsx                [新建] 资产选择面板
│       └── AssetTag.tsx                   [新建] 资产标签
├── utils/
│   ├── scriptUtils.tsx                    [保留] renderScriptLine / countChars
│   └── scriptAssetParser.ts              [新建] 资产自动提取

web/app/api/projects/[name]/scripts/
├── route.ts                               [可能扩展] 返回 charCount/sceneCount
├── [episode]/
│   ├── route.ts                           [微调] PUT 支持 title 字段
│   └── assets/
│       └── route.ts                       [新建] GET/PUT 关联资产

web/app/lib/
└── novels.ts                              [新增函数] getScriptAssets / updateScriptAssets
```

---

### 6. 技术风险与注意事项

1. **ScriptContentCard 复用策略**：弹窗内的内容区不应直接嵌入 `ScriptContentCard` 组件（因为它包含 `SectionCard` 外壳），而应提取其内部渲染逻辑（骨架屏、行号表格、编辑 textarea）为独立函数或 hooks，在弹窗中直接调用。可行做法：将渲染逻辑保留在 `ScriptContentCard` 中，弹窗内直接复制渲染代码（因为弹窗的布局/边距/样式有定制需求，强行复用反而增加耦合）。

2. **角色提取误匹配风险**：台词行正则 `^名字：台词` 可能误匹配场景描述中的冒号用法（如"时间：日落"）。建议在 `extractCharacters` 中维护一个排除词列表：`['时间', '地点', '场景', '天气', '音效', '备注', '画面']`。

3. **弹窗内多区域保存的一致性**：确认按钮需同时保存名称 + 内容 + 资产三项数据，涉及两个 API 调用（PUT scripts + PUT assets）。建议按顺序调用，任一失败时提示用户重试，不做部分回滚。

4. **卡片列表性能**：如果需要在卡片上显示字数/场景数，推荐在服务端 API 计算（Task 8 方案 A），避免前端并行请求 20+ 集的内容。扩展 `getScripts` 函数，在读取文件列表时同时 `fs.readFile` 并计算 charCount/sceneCount。

---
---

## 二、塑造模块 -- 资产管理（CRUD + 大纲提取）

> 对应 PRD 第五章（5.1-5.10）、设计方案 design-assets-tab.md
> 创建时间：2026-04-12

---

### 1. 技术影响评估

#### 1.1 现有组件变更矩阵

| 组件 / 文件 | 文件路径 | 变更类型 | 说明 |
|-------------|----------|----------|------|
| `page.tsx` | `projects/[name]/page.tsx` | **修改** | Tab 列表从 6 项改为 5 项，移除 `assets-gen` 和 `assets-lib`，新增 `assets` |
| `types.tsx` | `projects/[name]/types.tsx` | **修改** | Tab 联合类型更新；新增 `SeedanceAsset` 接口和资产筛选类型 |
| `AssetsTab.tsx` | `tabs/AssetsTab.tsx` | **替换** | 原组件整体替换为新的塑造 Tab 主入口 |
| `novels.ts` | `app/lib/novels.ts` | **扩展** | 新增 5 个 CRUD 函数 |
| 现有 API `/api/projects/[name]/assets/` | `api/projects/[name]/assets/route.ts` | **保留** | 旧资产图片列表接口保留不动（制作工作台可能依赖） |

#### 1.2 Tab 配置变更

**变更前**（6 个 Tab）：

```
chapters | workbench | scripts | assets-gen | production | assets-lib
```

**变更后**（5 个 Tab）：

```
chapters | workbench | scripts | assets | production
```

`types.tsx` 中 Tab 类型变更：

```typescript
// 变更前
export type Tab = 'chapters' | 'workbench' | 'scripts' | 'assets-gen' | 'production' | 'assets-lib';

// 变更后
export type Tab = 'chapters' | 'workbench' | 'scripts' | 'assets' | 'production';
```

`TAB_ICONS` 需新增 `assets` 键（Palette 调色盘图标 SVG path），移除 `assets-gen` 和 `assets-lib` 键。

`page.tsx` 中 tabs 数组变更：

```typescript
const tabs: { id: Tab; label: string }[] = [
  { id: 'chapters', label: '小说原文' },
  { id: 'workbench', label: '剧本Agent' },
  { id: 'scripts', label: '剧本管理' },
  { id: 'assets', label: '塑造' },         // 新增
  { id: 'production', label: '制作工作台' },
];
// 移除 assets-gen 和 assets-lib
```

内容渲染区变更：移除 `assets-gen` 占位和 `assets-lib` 的 AssetsTab，新增 `assets` 条件分支渲染新的 AssetsTab 组件。

---

### 2. TypeScript 类型定义

在 `types.tsx` 中新增以下类型（基于真实数据样本 `seedance/assets.json`）：

```typescript
/** 资产状态枚举 */
export type AssetState = 'pending' | 'generating' | 'success' | 'failed';

/** 资产类型枚举（Seedance 格式） */
export type SeedanceAssetType = 'character' | 'scene' | 'prop';

/** Seedance 资产完整数据结构 */
export interface SeedanceAsset {
  id: string;                      // 格式：char-001 / scene-001 / prop-001
  name: string;                    // 资产名称
  type: SeedanceAssetType;         // 资产类型
  description: string;             // 描述文字
  identityAnchor?: string[];       // 视觉锚点（仅角色类型）
  prompt: string;                  // 图片生成提示词
  artStyle: string;                // 美术风格（如 "3d-guoman"）
  state: AssetState;               // 生成状态
  imagePath: string;               // 图片相对路径（如 "images/characters/叶真.png"）
  generatedAt: string | null;      // 图片生成时间 ISO
  apiTaskId: string;               // API 任务 ID
  modelId: string;                 // 生成模型 ID
  resolution: string;              // 分辨率（如 "1K"）
  sourceEpisode: string;           // 来源集数（如 "ep01"）
  episodeRefs: string[];           // 关联集数数组
  createdAt: string;               // 创建时间 ISO
  updatedAt: string;               // 更新时间 ISO
  error?: string;                  // 错误信息（仅 failed 状态）
}

/** 新增资产请求体（用户手动创建） */
export interface CreateAssetPayload {
  name: string;
  type: SeedanceAssetType;
  description: string;
  identityAnchor?: string[];
}

/** 更新资产请求体（编辑抽屉保存） */
export interface UpdateAssetPayload {
  name?: string;
  description?: string;
  identityAnchor?: string[];
  prompt?: string;
}

/** 筛选 Tab 类型 */
export type AssetFilterType = 'all' | 'character' | 'scene' | 'prop';

/** 筛选 Tab 显示配置 */
export const ASSET_FILTER_CONFIG: Record<AssetFilterType, { label: string }> = {
  all: { label: '全部' },
  character: { label: '角色' },
  scene: { label: '场景' },
  prop: { label: '道具' },
};

/** 大纲提取预览结果 */
export interface ExtractPreview {
  characters: { name: string; description: string }[];
  scenes: { name: string; description: string }[];
  props: { name: string; description: string }[];
  skipped: number;   // 与已有资产重名被跳过的数量
}
```

---

### 3. API Routes 设计

#### 3.1 接口总览

| 方法 | 路径 | 说明 | 请求体 | 响应 |
|------|------|------|--------|------|
| GET | `/api/projects/[name]/seedance/assets` | 获取资产列表 | -- | `SeedanceAsset[]` |
| POST | `/api/projects/[name]/seedance/assets` | 新增资产 | `CreateAssetPayload` | `SeedanceAsset`（新创建的完整对象） |
| PUT | `/api/projects/[name]/seedance/assets/[id]` | 更新资产 | `UpdateAssetPayload` | `SeedanceAsset`（更新后的完整对象） |
| DELETE | `/api/projects/[name]/seedance/assets/[id]` | 删除资产 | -- | `{ success: true }` |
| POST | `/api/projects/[name]/seedance/assets/extract` | 从大纲提取 | `{ preview?: boolean }` | preview=true: `ExtractPreview`; preview=false: `{ created: number }` |

#### 3.2 API 文件结构

```
web/app/api/projects/[name]/seedance/
├── assets/
│   ├── route.ts              [新建] GET（列表）+ POST（新增）
│   ├── [id]/
│   │   └── route.ts          [新建] PUT（更新）+ DELETE（删除）
│   └── extract/
│       └── route.ts          [新建] POST（提取）
```

#### 3.3 各接口详细定义

**GET /api/projects/[name]/seedance/assets**

```typescript
// 响应 200
SeedanceAsset[]
// 响应 500（读取失败）
{ error: string }
```

实现要点：调用 `getSeedanceAssets(name)` 直接返回。

**POST /api/projects/[name]/seedance/assets**

```typescript
// 请求体
{
  name: string;          // 必填
  type: "character" | "scene" | "prop";  // 必填
  description: string;   // 必填
  identityAnchor?: string[];  // 可选，仅角色
}

// 响应 201
SeedanceAsset   // 含自动生成的 id、state: "pending"、时间戳等

// 响应 400
{ error: "缺少必填字段：name, type, description" }
```

实现要点：
- 调用 `createSeedanceAsset(name, payload)` 生成完整对象并追加到 assets.json
- ID 自动生成规则：读取当前 assets.json，找到同 type 的最大编号 +1，格式 `char-001` / `scene-001` / `prop-001`
- 默认字段填充：`state: "pending"`, `prompt: ""`, `artStyle: ""`, `imagePath: ""`, `apiTaskId: ""`, `modelId: ""`, `resolution: ""`, `sourceEpisode: ""`, `episodeRefs: []`, `generatedAt: null`, `createdAt/updatedAt: new Date().toISOString()`

**PUT /api/projects/[name]/seedance/assets/[id]**

```typescript
// 请求体（全部可选，仅传需更新的字段）
{
  name?: string;
  description?: string;
  identityAnchor?: string[];
  prompt?: string;
}

// 响应 200
SeedanceAsset   // 更新后的完整对象

// 响应 404
{ error: "资产不存在" }
```

实现要点：
- 调用 `updateSeedanceAsset(name, id, partial)` 执行读-改-写
- 仅覆盖请求体中存在的字段，其余保持不变
- 自动更新 `updatedAt` 为当前时间

**DELETE /api/projects/[name]/seedance/assets/[id]**

```typescript
// 响应 200
{ success: true }

// 响应 404
{ error: "资产不存在" }
```

实现要点：
- 调用 `deleteSeedanceAsset(name, id)` 从 assets.json 中移除对应条目
- 不删除关联的图片文件（PRD 5.9 约束）

**POST /api/projects/[name]/seedance/assets/extract**

```typescript
// 请求体
{ preview?: boolean }  // true=仅预览不写入，false/undefined=执行提取

// 响应 200（preview=true）
{
  characters: [{ name, description }],
  scenes: [{ name, description }],
  props: [{ name, description }],
  skipped: 2
}

// 响应 200（preview=false）
{ created: 14 }

// 响应 404（大纲不存在）
{ error: "未找到大纲数据" }
```

实现要点：
- 调用 `extractAssetsFromOutline(name, preview)` 统一处理
- 读取 `outline.json` 遍历所有 episodes 的 characters/scenes/props
- 按 name 去重（同名角色在不同集只保留首次出现的 description -- 回答 PRD Q15）
- 与已有 assets.json 按 name+type 比对，跳过已存在的
- preview=true 时只返回统计，不写文件
- preview=false 时生成完整 SeedanceAsset 对象追加到 assets.json

#### 3.4 图片访问路径

资产卡片和抽屉需要展示图片。`imagePath` 字段存储的是相对路径（如 `images/characters/叶真.png`），实际文件位于 `novels/{name}/seedance/images/characters/叶真.png`。

复用现有的图片代理 API：`/api/projects/[name]/assets/images/[...path]`。前端拼接方式：

```typescript
const imageUrl = asset.imagePath
  ? `/api/projects/${encodedName}/assets/images/${asset.imagePath.replace('images/', '')}`
  : null;
```

如果现有图片代理 API 无法覆盖 seedance 路径，需在其 route.ts 中扩展路径映射，使其能读取 `novels/{name}/seedance/images/` 下的文件。需 developer 实施时验证此路径是否可用。

---

### 4. 数据层函数设计（novels.ts）

#### 4.1 新增函数签名

```typescript
// ============ Seedance 资产 CRUD ============

/** 获取单个资产 */
export async function getSeedanceAssetById(
  name: string,
  id: string
): Promise<SeedanceAsset | null>;

/** 更新单个资产（读-改-写） */
export async function updateSeedanceAsset(
  name: string,
  id: string,
  partial: Partial<Pick<SeedanceAsset, 'name' | 'description' | 'identityAnchor' | 'prompt'>>
): Promise<SeedanceAsset>;

/** 创建新资产 */
export async function createSeedanceAsset(
  name: string,
  payload: { name: string; type: SeedanceAssetType; description: string; identityAnchor?: string[] }
): Promise<SeedanceAsset>;

/** 删除资产 */
export async function deleteSeedanceAsset(
  name: string,
  id: string
): Promise<void>;

/** 从大纲提取资产 */
export async function extractAssetsFromOutline(
  name: string,
  preview: boolean
): Promise<ExtractPreview | { created: number }>;
```

#### 4.2 实现要点

**通用模式 -- 读-改-写 assets.json**：

所有写操作（create/update/delete/extract）共用同一模式：
1. `fs.readFile` 读取 `seedance/assets.json`（不存在时用空数组）
2. 在内存中修改数组
3. `fs.writeFile` 写回整个文件（`JSON.stringify(assets, null, 2)`）

```typescript
// 内部辅助函数
async function readAssetsFile(name: string): Promise<SeedanceAsset[]> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'seedance', 'assets.json');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function writeAssetsFile(name: string, assets: SeedanceAsset[]): Promise<void> {
  const dir = path.join(NOVELS_DIR, safeName(name), 'seedance');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'assets.json'), JSON.stringify(assets, null, 2), 'utf-8');
}
```

**ID 生成逻辑**：

```typescript
function generateAssetId(assets: SeedanceAsset[], type: SeedanceAssetType): string {
  const prefix = type === 'character' ? 'char' : type;  // char-001, scene-001, prop-001
  const existing = assets
    .filter(a => a.type === type)
    .map(a => parseInt(a.id.split('-')[1], 10))
    .filter(n => !isNaN(n));
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}
```

**extractAssetsFromOutline 核心逻辑**：

```typescript
// 1. 读取 outline.json
const outline = await getOutline(name) as OutlineEpisode[] | null;
if (!outline || outline.length === 0) throw new Error('未找到大纲数据');

// 2. 遍历所有 episodes，按 name+type 去重提取
const extracted = new Map<string, { name: string; description: string; type: SeedanceAssetType }>();
for (const ep of outline) {
  for (const c of ep.characters || []) {
    const n = typeof c === 'string' ? c : c.name;
    const d = typeof c === 'string' ? '' : (c.description || '');
    const key = `character:${n}`;
    if (!extracted.has(key)) extracted.set(key, { name: n, description: d, type: 'character' });
  }
  // scenes、props 同理
}

// 3. 与已有 assets.json 比对跳过重复
const existing = await readAssetsFile(name);
const existingKeys = new Set(existing.map(a => `${a.type}:${a.name}`));
const toCreate = [...extracted.values()].filter(e => !existingKeys.has(`${e.type}:${e.name}`));
const skipped = extracted.size - toCreate.length;

// 4. preview=true 返回统计；preview=false 写入文件
```

---

### 5. 前端组件架构

#### 5.1 组件清单

| 组件 | 文件路径 | 职责 |
|------|----------|------|
| `AssetsTab` | `tabs/AssetsTab.tsx` | **替换重写**。塑造 Tab 页面主入口，组合标题区 + 筛选栏 + 卡片网格 + 空状态 + 抽屉/弹窗 |
| `AssetFilterBar` | `tabs/assets/AssetFilterBar.tsx` | 类型筛选 Tab 栏（全部/角色/场景/道具），含数量统计 |
| `AssetCardGrid` | `tabs/assets/AssetCardGrid.tsx` | 响应式卡片网格容器，含骨架屏加载态 |
| `AssetCard` | `tabs/assets/AssetCard.tsx` | 单张资产卡片：缩略图 + 名称 + 类型标签 + 状态 + 描述 |
| `AssetDetailDrawer` | `tabs/assets/AssetDetailDrawer.tsx` | 右侧详情抽屉：图片预览 + 元信息 + 编辑区 + 底部操作 |
| `AssetMetaInfo` | `tabs/assets/AssetMetaInfo.tsx` | 抽屉内元信息只读网格 |
| `AssetEditForm` | `tabs/assets/AssetEditForm.tsx` | 抽屉内可编辑区（描述 + 锚点 + 提示词） |
| `IdentityAnchorTags` | `tabs/assets/IdentityAnchorTags.tsx` | 视觉锚点标签编辑组件（增删标签） |
| `CreateAssetModal` | `tabs/assets/CreateAssetModal.tsx` | 新增资产弹窗表单 |
| `DeleteConfirmDialog` | `tabs/assets/DeleteConfirmDialog.tsx` | 删除确认对话框 |
| `ExtractFromOutlineModal` | `tabs/assets/ExtractFromOutlineModal.tsx` | 从大纲提取预览弹窗（两阶段交互） |
| `AssetEmptyState` | `tabs/assets/AssetEmptyState.tsx` | 空状态展示（全局空 / 筛选空） |
| `AssetCardSkeleton` | `tabs/assets/AssetCardSkeleton.tsx` | 卡片骨架屏 |

#### 5.2 组件层级与数据流

```
AssetsTab (页面容器，管理全局状态)
├── 标题区 (内联)
│   ├── "从大纲提取" 按钮 → 触发 ExtractFromOutlineModal
│   └── "+ 新增" 按钮 → 触发 CreateAssetModal
│
├── AssetFilterBar (筛选 Tab 栏)
│   └── activeFilter 状态上报 AssetsTab
│
├── [loading] → AssetCardGrid + AssetCardSkeleton x8
├── [assets.length === 0] → AssetEmptyState (全局空)
├── [filteredAssets.length === 0] → AssetEmptyState (筛选空)
├── [filteredAssets.length > 0] → AssetCardGrid
│   └── AssetCard[] ← 点击触发 setSelectedAsset
│
├── AssetDetailDrawer (selectedAsset !== null 时渲染)
│   ├── 标题栏 (名称编辑 + 类型标签 + 关闭)
│   ├── 图片预览区
│   ├── AssetMetaInfo (只读元信息)
│   ├── AssetEditForm (可编辑区)
│   │   ├── 描述 textarea
│   │   ├── IdentityAnchorTags (仅角色)
│   │   └── 提示词 textarea
│   └── 底部操作栏 (删除 + 保存)
│       └── 删除 → 触发 DeleteConfirmDialog
│
├── CreateAssetModal (showCreate 时渲染)
├── DeleteConfirmDialog (showDelete 时渲染)
└── ExtractFromOutlineModal (showExtract 时渲染)
```

#### 5.3 Props 接口定义

```typescript
// --- AssetsTab ---
interface AssetsTabProps {
  encodedName: string;
  // 大纲数据通过 extract API 获取，无需传入 project
}

// --- AssetFilterBar ---
interface AssetFilterBarProps {
  activeFilter: AssetFilterType;
  counts: Record<AssetFilterType, number>;  // { all: 24, character: 8, scene: 10, prop: 6 }
  onChange: (filter: AssetFilterType) => void;
}

// --- AssetCardGrid ---
interface AssetCardGridProps {
  children: React.ReactNode;
}

// --- AssetCard ---
interface AssetCardProps {
  asset: SeedanceAsset;
  encodedName: string;
  onClick: () => void;
}

// --- AssetDetailDrawer ---
interface AssetDetailDrawerProps {
  asset: SeedanceAsset;
  encodedName: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;    // 保存成功后刷新列表
  onDeleted: () => void;  // 删除成功后刷新列表
}

// --- AssetMetaInfo ---
interface AssetMetaInfoProps {
  asset: SeedanceAsset;
}

// --- AssetEditForm ---
interface AssetEditFormProps {
  asset: SeedanceAsset;
  editState: {
    name: string;
    description: string;
    identityAnchor: string[];
    prompt: string;
  };
  onChange: (field: string, value: string | string[]) => void;
}

// --- IdentityAnchorTags ---
interface IdentityAnchorTagsProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

// --- CreateAssetModal ---
interface CreateAssetModalProps {
  isOpen: boolean;
  encodedName: string;
  onClose: () => void;
  onCreated: () => void;  // 创建成功后刷新列表
}

// --- DeleteConfirmDialog ---
interface DeleteConfirmDialogProps {
  isOpen: boolean;
  assetName: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

// --- ExtractFromOutlineModal ---
interface ExtractFromOutlineModalProps {
  isOpen: boolean;
  encodedName: string;
  onClose: () => void;
  onExtracted: () => void;  // 提取成功后刷新列表
}

// --- AssetEmptyState ---
interface AssetEmptyStateProps {
  type: 'global' | 'filtered';   // 全局空 vs 筛选空
  filterType?: SeedanceAssetType; // 筛选空时的当前类型
  onExtract: () => void;
  onCreate: () => void;
}
```

#### 5.4 状态管理方案

**AssetsTab（页面层 -- 核心状态枢纽）**：

```typescript
// 数据状态
const [assets, setAssets] = useState<SeedanceAsset[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

// 筛选状态
const [activeFilter, setActiveFilter] = useState<AssetFilterType>('all');

// 弹窗/抽屉控制
const [selectedAsset, setSelectedAsset] = useState<SeedanceAsset | null>(null);
const [showCreate, setShowCreate] = useState(false);
const [showExtract, setShowExtract] = useState(false);

// 派生状态
const filteredAssets = useMemo(() => {
  if (activeFilter === 'all') return assets;
  return assets.filter(a => a.type === activeFilter);
}, [assets, activeFilter]);

const counts = useMemo(() => ({
  all: assets.length,
  character: assets.filter(a => a.type === 'character').length,
  scene: assets.filter(a => a.type === 'scene').length,
  prop: assets.filter(a => a.type === 'prop').length,
}), [assets]);

// 数据刷新
const loadAssets = useCallback(async () => { ... }, [encodedName]);
```

**AssetDetailDrawer（抽屉层）**：

```typescript
// 编辑状态（从传入的 asset 初始化，用户修改时更新）
const [editState, setEditState] = useState({
  name: asset.name,
  description: asset.description,
  identityAnchor: asset.identityAnchor || [],
  prompt: asset.prompt,
});

// 操作状态
const [saving, setSaving] = useState(false);
const [showDelete, setShowDelete] = useState(false);
const [deleting, setDeleting] = useState(false);

// 脏检查
const isDirty = useMemo(() => {
  return editState.name !== asset.name
    || editState.description !== asset.description
    || editState.prompt !== asset.prompt
    || JSON.stringify(editState.identityAnchor) !== JSON.stringify(asset.identityAnchor || []);
}, [editState, asset]);
```

**设计原则**：
- 列表数据由 AssetsTab 统一管理，子组件通过回调通知刷新
- 抽屉内的编辑状态独立管理，保存时调用 PUT API 后通知父组件刷新列表
- 筛选为纯前端操作，不发 API 请求

**ExtractFromOutlineModal（提取弹窗）**：

```typescript
const [phase, setPhase] = useState<'loading' | 'preview' | 'nodata' | 'extracting'>('loading');
const [preview, setPreview] = useState<ExtractPreview | null>(null);
```

弹窗打开时自动调用 `POST .../extract` (preview=true)，根据响应切换 phase。

---

### 6. 开发任务拆分

#### Task 1: 类型定义 + Tab 配置变更（无依赖）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 -- 基础设施 |
| **涉及文件** | `types.tsx`、`page.tsx` |
| **工作内容** | 1) 在 `types.tsx` 中新增 `SeedanceAsset`、`AssetState`、`SeedanceAssetType`、`AssetFilterType`、`CreateAssetPayload`、`UpdateAssetPayload`、`ExtractPreview` 类型定义和 `ASSET_FILTER_CONFIG` 常量 2) 修改 `Tab` 联合类型 3) 在 `TAB_ICONS` 中新增 `assets` 键（Palette 图标 path）、移除 `assets-gen` 和 `assets-lib` 4) 修改 `page.tsx` 中 tabs 数组和内容渲染区 |
| **验收标准** | TypeScript 编译无错误；Tab 导航正确显示 5 个按钮 |

#### Task 2: 数据层 CRUD 函数（无依赖）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 -- 被所有 API 依赖 |
| **涉及文件** | `app/lib/novels.ts` |
| **工作内容** | 新增 `readAssetsFile`、`writeAssetsFile`（内部辅助）、`generateAssetId`（内部辅助）、`getSeedanceAssetById`、`updateSeedanceAsset`、`createSeedanceAsset`、`deleteSeedanceAsset`、`extractAssetsFromOutline` 函数 |
| **验收标准** | 各函数能正确读写 `seedance/assets.json`；ID 自动生成不冲突；提取能正确去重 |

#### Task 3: API Routes（依赖 Task 2）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 -- 被前端依赖 |
| **涉及文件** | `api/projects/[name]/seedance/assets/route.ts`（新建）、`api/projects/[name]/seedance/assets/[id]/route.ts`（新建）、`api/projects/[name]/seedance/assets/extract/route.ts`（新建） |
| **工作内容** | 实现 5 个 API 端点，每个 route 调用对应的 novels.ts 函数，处理入参校验和错误响应 |
| **验收标准** | 用 curl 测试所有端点返回正确数据结构 |

#### Task 4: AssetsTab 主页面 + AssetFilterBar + AssetCardGrid + AssetCard + 骨架屏 + 空状态（依赖 Task 1、Task 3）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 -- 核心列表页面 |
| **涉及文件** | `tabs/AssetsTab.tsx`（重写）、`tabs/assets/` 下 6 个新建文件 |
| **工作内容** | 实现卡片网格列表，包含筛选、骨架屏、两种空状态、错误重试 |
| **验收标准** | 资产列表正确渲染；筛选切换即时响应；有图/无图/各状态卡片正确显示 |

#### Task 5: AssetDetailDrawer + AssetMetaInfo + AssetEditForm + IdentityAnchorTags（依赖 Task 4）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 -- 核心编辑功能 |
| **涉及文件** | `tabs/assets/` 下 4 个新建文件 |
| **工作内容** | 实现抽屉滑入/滑出动画、图片预览、元信息展示、描述/锚点/提示词编辑、脏检查、保存、未保存拦截 |
| **验收标准** | 抽屉动画流畅；编辑后保存数据持久化；未保存修改关闭时弹确认框 |

#### Task 6: CreateAssetModal + DeleteConfirmDialog + ExtractFromOutlineModal（依赖 Task 4）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 -- 完善 CRUD 交互 |
| **涉及文件** | `tabs/assets/` 下 3 个新建文件 |
| **工作内容** | 实现新增弹窗表单验证、删除二次确认、提取两阶段交互（加载 -> 预览/无数据） |
| **验收标准** | 新增资产后列表刷新；删除后列表更新；提取预览统计正确、确认后资产入库 |

---

### 7. 文件变更总览

```
web/app/projects/[name]/
├── page.tsx                              [修改] Tab 列表 6→5，渲染区切换
├── types.tsx                             [修改] Tab 类型更新、新增 SeedanceAsset 等类型
├── tabs/
│   ├── AssetsTab.tsx                     [重写] 替换原图片网格为塑造 Tab 主入口
│   └── assets/                           [新建目录]
│       ├── AssetFilterBar.tsx            [新建] 筛选 Tab 栏
│       ├── AssetCardGrid.tsx             [新建] 网格容器
│       ├── AssetCard.tsx                 [新建] 资产卡片
│       ├── AssetDetailDrawer.tsx         [新建] 详情抽屉
│       ├── AssetMetaInfo.tsx             [新建] 元信息区
│       ├── AssetEditForm.tsx             [新建] 编辑表单区
│       ├── IdentityAnchorTags.tsx        [新建] 锚点标签编辑
│       ├── CreateAssetModal.tsx          [新建] 新增弹窗
│       ├── DeleteConfirmDialog.tsx       [新建] 删除确认
│       ├── ExtractFromOutlineModal.tsx   [新建] 提取弹窗
│       ├── AssetEmptyState.tsx           [新建] 空状态
│       └── AssetCardSkeleton.tsx         [新建] 骨架屏

web/app/api/projects/[name]/seedance/
├── assets/
│   ├── route.ts                          [新建] GET + POST
│   ├── [id]/
│   │   └── route.ts                      [新建] PUT + DELETE
│   └── extract/
│       └── route.ts                      [新建] POST

web/app/lib/
└── novels.ts                             [扩展] 新增 5 个导出函数 + 3 个内部辅助函数
```

---

### 8. 技术风险与注意事项

1. **assets.json 并发写入风险**：多个写操作（create/update/delete/extract）都采用读-改-写模式操作同一文件。由于 Next.js 开发环境为单用户使用，且操作间隔通常足够长，V1 不做文件锁。但需注意：`extractAssetsFromOutline` 会一次性追加大量条目，与用户同时执行的 create/delete 可能产生竞争。**建议**：extract 执行时前端禁用"新增"和"删除"按钮（通过一个 extracting 状态标志）。

2. **图片路径映射**：assets.json 中的 `imagePath` 格式为 `images/characters/叶真.png`（相对于 seedance 目录），而现有的图片代理 API (`/api/projects/[name]/assets/images/`) 可能读取的是 `novels/{name}/assets/images/` 路径。developer 实施时需验证路径是否匹配，如不匹配需调整代理 API 的路径拼接逻辑，使其支持 `novels/{name}/seedance/images/` 路径。

3. **大纲提取去重策略**（回答 PRD Q15）：同名角色在不同集有不同 description 时，采用"首次出现优先"策略，即保留 episodeIndex 最小的那一集的 description。理由：越早出场的描述通常是角色的"标准形象"。

4. **抽屉滑动动画实现**：不引入额外动画库，使用 Tailwind CSS `transform translate-x` + `transition-transform duration-300` 实现。需要一个 `isAnimating` 状态防止动画中途被打断。关闭时先触发滑出动画，动画结束后（`onTransitionEnd`）再清除 selectedAsset。

5. **AssetsTab Props 扩展**：原 AssetsTab 仅接收 `encodedName`，新版需额外接收 `project`（用于 outline 数据供提取功能使用）。需同步修改 `page.tsx` 中 AssetsTab 的调用方式。

6. **新增依赖**：本模块不引入新的 npm 依赖包。Lucide 图标（User/Mountain/Box/Palette/FileDown/Plus/X/Trash2/AlertTriangle 等）如项目中尚未安装 `lucide-react`，需要评估是否引入，或使用内联 SVG 保持一致（与现有代码风格统一，现有代码使用内联 SVG）。**建议**：保持内联 SVG 方式，不引入 lucide-react，避免增加包体积。
