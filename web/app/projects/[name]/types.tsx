export type Tab = 'chapters' | 'workbench' | 'scripts' | 'assets' | 'production' | 'delivery';

export type ProductionMode = 'seedance';

export interface ChapterItem {
  id?: string;
  number: number;
  filename: string;
  title: string;
  content?: string;
  preview?: string;
  charCount?: number;
  revision?: number;
  updatedAt?: string;
}

export interface OutlineEpisode {
  episodeIndex: number;
  title: string;
  outline?: string;
  chapterRange?: number[];
  scenes?: (string | { name: string; description?: string })[];
  characters?: (string | { name: string; description?: string })[];
  props?: (string | { name: string; description?: string })[];
  coreConflict?: string;
  openingHook?: string;
  keyEvents?: string[];
  emotionalCurve?: string;
  visualHighlights?: string[];
  endingHook?: string;
  classicQuotes?: string[];
}

export interface ProjectDetail {
  name: string;
  description: string;
  storyline?: string;
  outline?: OutlineEpisode[] | null;
  chapters?: ChapterItem[];
  scripts?: {
    episode: number;
    name?: string;
    charCount?: number;
    sceneCount?: number;
    versionNo?: number;
    qualityStatus?: string;
    status?: string;
  }[];
  assets?: { type: string; name: string; path: string }[];
  productionMode?: 'seedance' | null;
  [key: string]: unknown;
}

export function getItemName(item: string | { name: string; description?: string }): string {
  return typeof item === 'string' ? item : item.name;
}

export function parseDescription(raw: string) {
  const lines = raw.split('\n');
  const result: Record<string, string> = {};
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx > -1) {
      result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return result;
}

export function buildDescription(projectName: string, fields: { projectType: string; novelType: string; style: string; ratio: string; summary: string }) {
  return `项目名称:${projectName}\n项目类型:${fields.projectType}\n小说类型:${fields.novelType}\n影片画风:${fields.style}\n影片比例:${fields.ratio}\n小说简介:${fields.summary}\n`;
}

export const TAB_ICONS: Record<string, string> = {
  chapters: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  workbench: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  scripts: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  assets: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
  production: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
  delivery: 'M14.121 14.121L19 19M4.879 4.879L12 12m0 0l7.121-7.121M12 12l-7.121 7.121M8.5 8.5l-3-3m10 0l-3 3m-4 7l-3 3m10 0l-3-3',
};

export const STAT_ICONS = [
  { icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', color: 'text-purple-500 bg-purple-50' },
  { icon: 'M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z', color: 'text-blue-500 bg-blue-50' },
  { icon: 'M15 10l4.553-2.069A1 1 0 0121 8.868V15.13a1 1 0 01-1.447.899L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z', color: 'text-green-500 bg-green-50' },
  { icon: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z', color: 'text-orange-500 bg-orange-50' },
];

/** 关联资产数据结构 */
export interface LinkedAssetsData {
  characters: string[];
  scenes: string[];
  props: string[];
  costumes: string[];
  makeup: string[];
}

/** 资产类型枚举 */
export type AssetType = 'characters' | 'scenes' | 'props' | 'costumes' | 'makeup';

/** 资产类型显示配置 */
export const ASSET_TYPE_CONFIG: Record<AssetType, {
  label: string;
  bgColor: string;
  textColor: string;
  hoverColor: string;
}> = {
  characters: {
    label: '角色',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-700',
    hoverColor: 'hover:text-orange-900',
  },
  scenes: {
    label: '场景',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    hoverColor: 'hover:text-green-900',
  },
  props: {
    label: '道具',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-700',
    hoverColor: 'hover:text-purple-900',
  },
  costumes: {
    label: '服装',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
    hoverColor: 'hover:text-blue-900',
  },
  makeup: {
    label: '妆发',
    bgColor: 'bg-pink-100',
    textColor: 'text-pink-700',
    hoverColor: 'hover:text-pink-900',
  },
};

/** 剧本卡片展示所需数据 */
export interface ScriptCardData {
  episode: number;
  title: string;
  charCount: number;
  sceneCount: number;
  versionNo?: number;
  qualityStatus?: string;
  status?: string;
  hasContent: boolean;
  contentPreview: string;
  assets?: LinkedAssetsData;
}

export const EDIT_BTN = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

// ============ 塑造模块类型定义 ============

/** 资产状态枚举 */
export type AssetState = 'pending' | 'generating' | 'success' | 'failed';

/** 资产类型枚举（Seedance 格式） */
export type SeedanceAssetType = 'character' | 'scene' | 'prop' | 'costume' | 'makeup';

/** 提示词生成状态 */
export type PromptState = 'pending' | 'generating' | 'completed' | 'failed';

/** Seedance 资产完整数据结构 */
export interface SeedanceAsset {
  id: string;
  name: string;
  type: SeedanceAssetType;
  description: string;
  identityAnchor?: string[];
  prompt: string;
  artStyle: string;
  state: AssetState;
  imagePath: string;
  generatedAt: string | null;
  promptState?: PromptState;
  promptError?: string;
  promptGeneratedAt?: string | null;
  apiTaskId: string;
  modelId: string;
  resolution: string;
  sourceEpisode: string;
  episodeRefs: string[];
  createdAt: string;
  updatedAt: string;
  error?: string;
  assetRecordId?: string;
  canonicalVersionId?: string | null;
  latestVersionId?: string | null;
  canonicalVersionNo?: number | null;
  versionCount?: number;
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
  modelId?: string;
  resolution?: string;
}

/** 筛选 Tab 类型 */
export type AssetFilterType = 'all' | 'character' | 'scene' | 'prop' | 'costume' | 'makeup';

/** 筛选 Tab 显示配置 */
export const ASSET_FILTER_CONFIG: Record<AssetFilterType, { label: string }> = {
  all: { label: '全部' },
  character: { label: '角色' },
  scene: { label: '场景' },
  prop: { label: '道具' },
  costume: { label: '服装' },
  makeup: { label: '妆发' },
};

/** 大纲提取预览结果 */
export interface ExtractPreview {
  characters: { name: string; description: string }[];
  scenes: { name: string; description: string }[];
  props: { name: string; description: string }[];
  skipped: number;
}

/** 批量操作进度 */
export interface BatchProgress {
  batchId: string;
  type: 'polish' | 'generate';
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  isComplete: boolean;
}
