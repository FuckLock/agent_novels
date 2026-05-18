import fs from 'fs/promises';
import path from 'path';
import type { SeedanceAsset, SeedanceAssetType, ExtractPreview } from '@/app/projects/[name]/types';

// 数据目录路径（符合 CLAUDE.md 约定）
const NOVELS_DIR = path.join(process.cwd(), '..', 'novels');
const CONFIG_DIR = path.join(process.cwd(), '..', 'config');
const SKILLS_DIR = path.join(process.cwd(), '..', 'skills');

/** 路径安全校验：防止路径穿越攻击 */
function safeName(name: string): string {
  const sanitized = path.basename(name);
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    throw new Error('非法的名称参数');
  }
  return sanitized;
}

/** 校验路径片段数组 */
function safeSegments(segments: string[]): string[] {
  return segments.map((s) => {
    if (s.includes('..') || s.includes('/') || s.includes('\\')) {
      throw new Error('非法的路径参数');
    }
    return s;
  });
}

// ============ 项目管理 ============

export interface ProjectInfo {
  name: string;
  description: string;
  chapterCount: number;
  createdAt: string;
}

/** 获取所有小说项目列表 */
export async function getProjectList(): Promise<ProjectInfo[]> {
  const entries = await fs.readdir(NOVELS_DIR, { withFileTypes: true });
  const projects: ProjectInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

    let description = '';
    let chapterCount = 0;
    let createdAt = '';

    try {
      const descPath = path.join(NOVELS_DIR, entry.name, 'description');
      description = await fs.readFile(descPath, 'utf-8');
      const stat = await fs.stat(descPath);
      createdAt = stat.birthtime.toISOString();
    } catch { /* 没有 description 文件 */ }

    try {
      const files = await fs.readdir(path.join(NOVELS_DIR, entry.name, 'chapters'));
      chapterCount = files.filter(
        (f) => f.startsWith('chapter-') && f.endsWith('.txt')
      ).length;
    } catch { /* 目录读取失败 */ }

    projects.push({ name: entry.name, description, chapterCount, createdAt });
  }

  return projects;
}

/** 读取项目描述 */
export async function getProjectDescription(name: string): Promise<string> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'description');
  return await fs.readFile(filePath, 'utf-8');
}

/** 更新项目描述 */
export async function updateProjectDescription(
  name: string,
  content: string
): Promise<void> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'description');
  await fs.writeFile(filePath, content, 'utf-8');
}

/** 创建新项目 */
export async function createProject(projectInfo: {
  name: string;
  type: string;
  style: string;
  ratio: string;
  summary: string;
}): Promise<void> {
  const projectDir = path.join(NOVELS_DIR, safeName(projectInfo.name));
  await fs.mkdir(projectDir, { recursive: true });
  await fs.mkdir(path.join(projectDir, 'scripts'), { recursive: true });
  await fs.mkdir(path.join(projectDir, 'chapters'), { recursive: true });
  await fs.mkdir(path.join(projectDir, 'skeleton', 'episodes'), { recursive: true });
  await fs.mkdir(path.join(projectDir, 'adaptation', 'episodes'), { recursive: true });

  const description = `项目名称:${projectInfo.name}\n小说类型:${projectInfo.type}\n影片画风:${projectInfo.style}\n影片比例:${projectInfo.ratio}\n小说简介:${projectInfo.summary}\n`;
  await fs.writeFile(path.join(projectDir, 'description'), description, 'utf-8');
}

/** 删除项目 */
export async function deleteProject(name: string): Promise<void> {
  const projectDir = path.join(NOVELS_DIR, safeName(name));
  await fs.rm(projectDir, { recursive: true, force: true });
}

// ============ 章节管理 ============

export interface ChapterInfo {
  number: number;
  filename: string;
  title?: string;
  preview?: string;
}

/** 获取章节列表 */
export async function getChapters(name: string): Promise<ChapterInfo[]> {
  const projectDir = path.join(NOVELS_DIR, safeName(name));
  const chaptersDir = path.join(projectDir, 'chapters');
  const files = await fs.readdir(chaptersDir);

  const chapters = files
    .filter((f) => f.startsWith('chapter-') && f.endsWith('.txt'))
    .map((f) => {
      const num = parseInt(f.replace('chapter-', '').replace('.txt', ''), 10);
      return { number: num, filename: f, title: '', preview: '' };
    })
    .sort((a, b) => a.number - b.number);

  // 读取每个章节的第一行作为标题，后续内容作为摘要
  for (const ch of chapters) {
    try {
      const content = await fs.readFile(
        path.join(chaptersDir, ch.filename),
        'utf-8'
      );
      const lines = content.split('\n');
      const firstLine = lines[0]?.trim();
      ch.title = firstLine || `第${ch.number}章`;
      // 取标题行之后的内容前80字符作为摘要
      const restContent = lines.slice(1).join('\n').trim();
      ch.preview = restContent.substring(0, 80) || '';
    } catch {
      ch.title = `第${ch.number}章`;
      ch.preview = '';
    }
  }

  return chapters;
}

/** 读取章节内容 */
export async function getChapterContent(
  name: string,
  chapterNum: number
): Promise<string> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'chapters', `chapter-${chapterNum}.txt`);
  return await fs.readFile(filePath, 'utf-8');
}

/** 更新章节内容 */
export async function updateChapter(
  name: string,
  chapterNum: number,
  content: string
): Promise<void> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'chapters', `chapter-${chapterNum}.txt`);
  await fs.writeFile(filePath, content, 'utf-8');
}

/** 创建章节 */
export async function createChapter(
  name: string,
  chapterNum: number,
  content: string
): Promise<void> {
  const dir = path.join(NOVELS_DIR, safeName(name), 'chapters');
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `chapter-${chapterNum}.txt`);
  await fs.writeFile(filePath, content, 'utf-8');
}

/** 删除章节 */
export async function deleteChapter(
  name: string,
  chapterNum: number
): Promise<void> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'chapters', `chapter-${chapterNum}.txt`);
  await fs.unlink(filePath);
}

// ============ 故事骨架管理（分层存储） ============

/** 读取全局骨架 */
export async function getGlobalSkeleton(name: string): Promise<string> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'skeleton', 'global.md');
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/** 更新全局骨架 */
export async function updateGlobalSkeleton(name: string, content: string): Promise<void> {
  const dir = path.join(NOVELS_DIR, safeName(name), 'skeleton');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'global.md'), content, 'utf-8');
}

/** 读取单集骨架 */
export async function getEpisodeSkeleton(name: string, episode: number): Promise<string> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'skeleton', 'episodes', `ep-${String(episode).padStart(2, '0')}.md`);
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/** 更新单集骨架 */
export async function updateEpisodeSkeleton(name: string, episode: number, content: string): Promise<void> {
  const dir = path.join(NOVELS_DIR, safeName(name), 'skeleton', 'episodes');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `ep-${String(episode).padStart(2, '0')}.md`), content, 'utf-8');
}

/** 列出所有集骨架（返回按集号排序的列表） */
export async function listEpisodeSkeletons(name: string): Promise<{ episode: number; filename: string }[]> {
  const dir = path.join(NOVELS_DIR, safeName(name), 'skeleton', 'episodes');
  try {
    const files = await fs.readdir(dir);
    return files
      .filter(f => f.startsWith('ep-') && f.endsWith('.md'))
      .map(f => {
        const ep = parseInt(f.replace('ep-', '').replace('.md', ''), 10);
        return { episode: ep, filename: f };
      })
      .sort((a, b) => a.episode - b.episode);
  } catch {
    return [];
  }
}

/** 读取故事骨架（拼接 global + 所有 episodes） */
export async function getSkeleton(name: string): Promise<string> {
  const globalContent = await getGlobalSkeleton(name);
  if (!globalContent) return '';
  const episodes = await listEpisodeSkeletons(name);
  const parts = [globalContent];
  for (const ep of episodes) {
    const epContent = await getEpisodeSkeleton(name, ep.episode);
    if (epContent) parts.push(epContent);
  }
  return parts.join('\n\n---\n\n');
}

/** 更新故事骨架（写入 skeleton/global.md） */
export async function updateSkeleton(name: string, content: string): Promise<void> {
  const dir = path.join(NOVELS_DIR, safeName(name), 'skeleton');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'global.md'), content, 'utf-8');
}

// ============ 对话历史管理 ============

interface ChatHistoryMessage {
  role: string;
  content: string;
  timestamp: number;
}

/** 读取对话历史 */
export async function getChatHistory(name: string): Promise<ChatHistoryMessage[]> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'chat-history.json');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    return data.messages || [];
  } catch {
    return [];
  }
}

/** 截断过长的消息内容，防止单条消息过大 */
function truncateMessage(content: string, maxLength: number = 2000): string {
  if (content.length <= maxLength) return content;
  const headLen = 500;
  const tailLen = 200;
  return content.slice(0, headLen) + '\n\n...（内容已省略，原文' + content.length + '字）...\n\n' + content.slice(-tailLen);
}

/** 追加一条对话消息 */
export async function appendChatMessage(name: string, role: string, content: string): Promise<void> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'chat-history.json');
  const messages = await getChatHistory(name);
  // 截断过长的 assistant 消息（如审核报告），防止文件膨胀
  const safeContent = role === 'assistant' ? truncateMessage(content) : content;
  messages.push({ role, content: safeContent, timestamp: Date.now() });
  // 只保留最近 50 条，防止文件无限增长
  const trimmed = messages.slice(-50);
  await fs.writeFile(filePath, JSON.stringify({ messages: trimmed }, null, 2), 'utf-8');
}

/** 清空对话历史 */
export async function clearChatHistory(name: string): Promise<void> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'chat-history.json');
  await fs.writeFile(filePath, JSON.stringify({ messages: [] }), 'utf-8');
}

// ============ 项目配置管理 ============

export interface ProjectConfig {
  totalEpisodes: number;
  episodeDuration: number;
  wordsPerEpisode: number;
  chapterRange: [number, number];
  platform: string;
  style: string;
  paywall: string;
}

/** 读取项目配置 */
export async function getProjectConfig(name: string): Promise<ProjectConfig | null> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'config.json');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as ProjectConfig;
  } catch {
    return null;
  }
}

/** 保存项目配置（partial merge 模式） */
export async function updateProjectConfig(name: string, partial: Partial<ProjectConfig>): Promise<void> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'config.json');
  const existing = await getProjectConfig(name) || {} as Partial<ProjectConfig>;
  const merged = { ...existing, ...partial };
  await fs.writeFile(filePath, JSON.stringify(merged, null, 2), 'utf-8');
}

/** 检查配置是否完整（6个必需字段全部有值） */
export function isConfigComplete(config: Partial<ProjectConfig> | null): boolean {
  if (!config) return false;
  return !!(
    config.totalEpisodes &&
    config.episodeDuration &&
    config.chapterRange?.[0] != null &&
    config.chapterRange?.[1] != null &&
    config.platform &&
    config.style &&
    config.paywall
  );
}

// ============ 改编策略管理（分层存储） ============

/** 读取全局改编原则 */
export async function getGlobalAdaptation(name: string): Promise<string> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'adaptation', 'global.md');
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/** 更新全局改编原则 */
export async function updateGlobalAdaptation(name: string, content: string): Promise<void> {
  const dir = path.join(NOVELS_DIR, safeName(name), 'adaptation');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'global.md'), content, 'utf-8');
}

/** 读取单集改编细节 */
export async function getEpisodeAdaptation(name: string, episode: number): Promise<string> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'adaptation', 'episodes', `ep-${String(episode).padStart(2, '0')}.md`);
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/** 更新单集改编细节 */
export async function updateEpisodeAdaptation(name: string, episode: number, content: string): Promise<void> {
  const dir = path.join(NOVELS_DIR, safeName(name), 'adaptation', 'episodes');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `ep-${String(episode).padStart(2, '0')}.md`), content, 'utf-8');
}

/** 列出所有集改编策略 */
export async function listEpisodeAdaptations(name: string): Promise<{ episode: number; filename: string }[]> {
  const dir = path.join(NOVELS_DIR, safeName(name), 'adaptation', 'episodes');
  try {
    const files = await fs.readdir(dir);
    return files
      .filter(f => f.startsWith('ep-') && f.endsWith('.md'))
      .map(f => {
        const ep = parseInt(f.replace('ep-', '').replace('.md', ''), 10);
        return { episode: ep, filename: f };
      })
      .sort((a, b) => a.episode - b.episode);
  } catch {
    return [];
  }
}

/** 读取改编策略（拼接 global + 所有 episodes） */
export async function getAdaptation(name: string): Promise<string> {
  const globalContent = await getGlobalAdaptation(name);
  if (!globalContent) return '';
  const episodes = await listEpisodeAdaptations(name);
  const parts = [globalContent];
  for (const ep of episodes) {
    const epContent = await getEpisodeAdaptation(name, ep.episode);
    if (epContent) parts.push(epContent);
  }
  return parts.join('\n\n---\n\n');
}

/** 更新改编策略（写入 adaptation/global.md） */
export async function updateAdaptation(name: string, content: string): Promise<void> {
  const dir = path.join(NOVELS_DIR, safeName(name), 'adaptation');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'global.md'), content, 'utf-8');
}

// ============ 连贯性追踪管理 ============

export interface ContinuityData {
  lastUpdatedPhase?: string;
  lastUpdatedEpisode?: number;
  characterArcs?: Record<string, unknown>;
  characterStates?: Record<string, unknown>;
  foreshadowing?: unknown[];
  plotThreads?: unknown[];
  episodeLinks?: Record<string, string>;
  episodeEndStates?: Record<string, unknown>;
  adaptationImpact?: unknown[];
}

/** 读取连贯性追踪数据 */
export async function getContinuity(name: string): Promise<ContinuityData | null> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'continuity.json');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as ContinuityData;
  } catch {
    return null;
  }
}

/** 更新连贯性追踪数据（partial merge 模式） */
export async function updateContinuity(name: string, partial: Partial<ContinuityData>): Promise<void> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'continuity.json');
  const existing = await getContinuity(name) || {};
  const merged = { ...existing, ...partial };
  await fs.writeFile(filePath, JSON.stringify(merged, null, 2), 'utf-8');
}

/** 读取连贯性归档数据 */
export async function getContinuityArchive(name: string): Promise<unknown> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'continuity-archive.json');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// ============ 故事线管理 ============

/** 读取故事线 */
export async function getStoryline(name: string): Promise<string> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'storyline.md');
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/** 更新故事线 */
export async function updateStoryline(
  name: string,
  content: string
): Promise<void> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'storyline.md');
  await fs.writeFile(filePath, content, 'utf-8');
}

// ============ 大纲管理 ============

/** 读取大纲 */
export async function getOutline(name: string): Promise<unknown> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'outline.json');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/** 更新大纲 */
export async function updateOutline(
  name: string,
  content: unknown
): Promise<void> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'outline.json');
  await fs.writeFile(filePath, JSON.stringify(content, null, 2), 'utf-8');
}

/** 删除大纲 */
export async function deleteOutline(name: string): Promise<void> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'outline.json');
  await fs.unlink(filePath);
}

// ============ 剧本管理 ============

export interface ScriptInfo {
  episode: number;
  filename: string;
  name: string;
  charCount: number;
  sceneCount: number;
}

/** 统计字符数（与前端 countChars 保持一致） */
function countChars(text: string): number {
  return text.length;
}

/** 从剧本内容首行提取标题 */
function extractScriptName(content: string): string {
  const firstLine = content.split('\n').find((l) => l.trim().startsWith('#'));
  if (firstLine) {
    return firstLine.replace(/^#+\s*/, '').trim();
  }
  return '';
}

/** 统计剧本中的场景数（匹配场景标题行） */
function countScenes(content: string): number {
  const lines = content.split('\n');
  let count = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.match(/^S\d+\s+.+\s+(日|夜|晨|昏|午)\//)) {
      count++;
    } else if (trimmed.match(/^\d+\s+.+\s+(日|夜|晨|昏|午)\/(内|外|内外)/)) {
      count++;
    }
  }
  return count;
}

/** 获取剧本列表（含标题） */
export async function getScripts(name: string): Promise<ScriptInfo[]> {
  const scriptsDir = path.join(NOVELS_DIR, safeName(name), 'scripts');
  try {
    const files = await fs.readdir(scriptsDir);
    const scripts = files
      .filter((f) => f.startsWith('episode-') && f.endsWith('.txt'))
      .map((f) => {
        const ep = parseInt(f.replace('episode-', '').replace('.txt', ''), 10);
        return { episode: ep, filename: f };
      })
      .sort((a, b) => a.episode - b.episode);

    // 读取每个文件提取标题、字数、场景数
    const results: ScriptInfo[] = [];
    for (const s of scripts) {
      let scriptName = '';
      let charCount = 0;
      let sceneCount = 0;
      try {
        const content = await fs.readFile(path.join(scriptsDir, s.filename), 'utf-8');
        scriptName = extractScriptName(content);
        charCount = countChars(content);
        sceneCount = countScenes(content);
      } catch { /* 读取失败用默认值 */ }
      results.push({ ...s, name: scriptName, charCount, sceneCount });
    }
    return results;
  } catch {
    return [];
  }
}

/** 读取单集剧本 */
export async function getScriptContent(
  name: string,
  episode: number
): Promise<string> {
  const filePath = path.join(
    NOVELS_DIR,
    safeName(name),
    'scripts',
    `episode-${episode}.txt`
  );
  return await fs.readFile(filePath, 'utf-8');
}

/** 更新剧本 */
export async function updateScript(
  name: string,
  episode: number,
  content: string
): Promise<void> {
  const filePath = path.join(
    NOVELS_DIR,
    safeName(name),
    'scripts',
    `episode-${episode}.txt`
  );
  await fs.writeFile(filePath, content, 'utf-8');
}

/** 删除剧本 */
export async function deleteScript(
  name: string,
  episode: number
): Promise<void> {
  const filePath = path.join(
    NOVELS_DIR,
    safeName(name),
    'scripts',
    `episode-${episode}.txt`
  );
  await fs.unlink(filePath);
}

/** 关联资产数据结构 */
export interface ScriptAssetsData {
  characters: string[];
  scenes: string[];
  props: string[];
  costumes: string[];
  makeup: string[];
}

function normalizeScriptAssetsData(input: Partial<ScriptAssetsData> | null | undefined): ScriptAssetsData {
  return {
    characters: Array.isArray(input?.characters) ? input.characters.filter((item): item is string => typeof item === 'string') : [],
    scenes: Array.isArray(input?.scenes) ? input.scenes.filter((item): item is string => typeof item === 'string') : [],
    props: Array.isArray(input?.props) ? input.props.filter((item): item is string => typeof item === 'string') : [],
    costumes: Array.isArray(input?.costumes) ? input.costumes.filter((item): item is string => typeof item === 'string') : [],
    makeup: Array.isArray(input?.makeup) ? input.makeup.filter((item): item is string => typeof item === 'string') : [],
  };
}

/** 读取单集关联资产 JSON */
export async function getScriptAssets(
  name: string,
  episode: number
): Promise<ScriptAssetsData> {
  const filePath = path.join(
    NOVELS_DIR,
    safeName(name),
    'scripts',
    `episode-${episode}-assets.json`
  );
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return normalizeScriptAssetsData(JSON.parse(raw) as Partial<ScriptAssetsData>);
  } catch {
    return normalizeScriptAssetsData(null);
  }
}

/** 写入单集关联资产 JSON */
export async function updateScriptAssets(
  name: string,
  episode: number,
  assets: ScriptAssetsData
): Promise<void> {
  const filePath = path.join(
    NOVELS_DIR,
    safeName(name),
    'scripts',
    `episode-${episode}-assets.json`
  );
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(normalizeScriptAssetsData(assets), null, 2), 'utf-8');
}

// ============ 资产管理 ============

export interface AssetItem {
  type: string;
  name: string;
  path: string;
}

/** 获取资产列表 */
export async function getAssets(name: string): Promise<AssetItem[]> {
  const assets: AssetItem[] = [];
  const safe = safeName(name);

  // Seedance 模式：seedance/images/
  const seedanceDir = path.join(NOVELS_DIR, safe, 'seedance', 'images');
  try {
    const categories = ['characters', 'scenes', 'props'];
    for (const cat of categories) {
      const catDir = path.join(seedanceDir, cat);
      try {
        const files = await fs.readdir(catDir);
        for (const f of files) {
          if (f.startsWith('.')) continue;
          assets.push({
            type: cat,
            name: f,
            path: `novels/${safe}/seedance/images/${cat}/${f}`,
          });
        }
      } catch { /* 目录不存在 */ }
    }
  } catch { /* seedance 目录不存在 */ }

  return assets;
}

/** 读取 Seedance 资产 manifest（读取 assets.json） */
export async function getSeedanceManifest(name: string): Promise<unknown> {
  const safe = safeName(name);
  const assetsPath = path.join(NOVELS_DIR, safe, 'seedance', 'assets.json');
  try {
    const content = await fs.readFile(assetsPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/** 获取资产图片的绝对路径（供图片服务 API 使用） */
export function getAssetImagePath(name: string, ...segments: string[]): string {
  return path.join(NOVELS_DIR, safeName(name), ...safeSegments(segments));
}

// ============ 制作模式检测 ============

export interface ProductionModes {
  seedance: { hasData: boolean; episodes: number[] };
}

/** 检测项目有哪些制作模式的数据 */
export async function getProductionModes(name: string): Promise<ProductionModes> {
  const safe = safeName(name);
  const result: ProductionModes = {
    seedance: { hasData: false, episodes: [] },
  };

  // Seedance: 扫描 seedance/ep*/01-director.md
  const seedanceDir = path.join(NOVELS_DIR, safe, 'seedance');
  try {
    const entries = await fs.readdir(seedanceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('ep')) continue;
      const epNum = parseInt(entry.name.replace('ep', ''), 10);
      if (isNaN(epNum)) continue;
      try {
        await fs.access(path.join(seedanceDir, entry.name, '01-director.md'));
        result.seedance.episodes.push(epNum);
      } catch { /* 文件不存在 */ }
    }
    result.seedance.episodes.sort((a, b) => a - b);
    result.seedance.hasData = result.seedance.episodes.length > 0;
  } catch { /* seedance 目录不存在 */ }

  return result;
}

// ============ Seedance 数据读取 ============

/** 读取 Seedance 导演讲戏本 */
export async function getSeedanceDirector(name: string, episode: number): Promise<string> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'seedance', `ep${episode}`, '01-director.md');
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/** 读取 Seedance 分镜提示词 */
export async function getSeedancePrompts(name: string, episode: number): Promise<string> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'seedance', `ep${episode}`, '02-prompts.md');
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/** 保存分镜提示词 */
export async function saveStoryboardPrompts(name: string, episode: number, content: string): Promise<void> {
  const epDir = path.join(NOVELS_DIR, safeName(name), 'seedance', `ep${episode}`);
  await fs.mkdir(epDir, { recursive: true });
  await fs.writeFile(path.join(epDir, '02-prompts.md'), content, 'utf-8');
}

/** 执行分镜提示词生成：读取分镜表+导演规划+资产+模板，生成 Seedance 2.0 提示词 */
export async function runStoryboardPrompts(
  name: string,
  episode: number,
  modelId?: string
): Promise<void> {
  const { callLanguageModel } = await import('@/app/lib/ai-client');

  // 1. 读取分镜表（C2 输出）
  const storyboardTable = await getSeedanceStoryboardTable(name, episode) as Record<string, unknown> | null;
  if (!storyboardTable || !Array.isArray(storyboardTable.rows)) {
    throw new Error('未找到分镜表，请先完成 C2 分镜表');
  }

  // 2. 读取导演规划（取 visualStyle）
  const directorPlan = await getSeedanceDirectorPlan(name, episode) as Record<string, unknown> | null;
  if (!directorPlan) {
    throw new Error('未找到导演规划，请先完成 C1');
  }

  // 3. 读取资产（含 identityAnchor）
  const assets = await getSeedanceAssets(name);
  const assetSummary = assets.map(a => ({
    id: a.id, name: a.name, type: a.type,
    identityAnchor: a.identityAnchor || [],
  }));

  // 4. 读取视频提示词风格模板
  let videoStyleTemplate = '';
  try {
    const descPath = path.join(NOVELS_DIR, safeName(name), 'description');
    const desc = await fs.readFile(descPath, 'utf-8');
    const styleMatch = desc.match(/影片画风[:：]\s*(.+)/);
    if (styleMatch) {
      const styleMap: Record<string, string> = { '3D 国漫': '3d-guoman' };
      const artStyle = styleMap[styleMatch[1].trim()] || styleMatch[1].trim().toLowerCase().replace(/\s+/g, '-');
      videoStyleTemplate = await getArtTemplate(artStyle, 'art_storyboard_video.md');
    }
  } catch { /* ignore */ }

  // 5. 读取情绪面部映射表
  let emotionMapping = '';
  try {
    emotionMapping = await fs.readFile(path.join(SKILLS_DIR, 'shared', 'emotion-face-mapping.md'), 'utf-8');
  } catch { /* ignore */ }

  // 6. 精简分镜表数据，按 Track 分组
  const rows = (storyboardTable.rows as Array<Record<string, unknown>>).map(r => ({
    seq: r.seq, scene: r.scene, duration: r.duration, shotType: r.shotType,
    cameraMove: r.cameraMove, action: r.action, emotion: r.emotion,
    lighting: r.lighting, dialogue: r.dialogue, soundEffect: r.soundEffect,
    assetIds: r.assetIds, trackId: r.trackId,
  }));

  // 按 trackId 分组
  const trackGroups: Record<number, typeof rows> = {};
  for (const row of rows) {
    const tid = Number(row.trackId) || 1;
    if (!trackGroups[tid]) trackGroups[tid] = [];
    trackGroups[tid].push(row);
  }
  const trackIds = Object.keys(trackGroups).map(Number).sort((a, b) => a - b);

  // 构建 assetId → globalIndex 映射（1-based）
  const assetIdToIndex: Record<string, number> = {};
  assets.forEach((a: { id: string }, i: number) => { assetIdToIndex[a.id] = i + 1; });

  const trackSummary = trackIds.map(tid => {
    const shots = trackGroups[tid];
    const totalDuration = Math.round(shots.reduce((sum, s) => sum + Number(s.duration), 0));

    // 预计算该 Track 必须引用的全部资产（去重）
    const allAssetIds = [...new Set(shots.flatMap(s => (s.assetIds as string[]) || []))];
    const requiredAssets = allAssetIds
      .map(aid => {
        const globalIndex = assetIdToIndex[aid];
        if (!globalIndex) return null;
        const asset = assets[globalIndex - 1];
        return asset ? { assetId: aid, globalIndex, name: asset.name, type: asset.type } : null;
      })
      .filter(Boolean)
      // 排序：角色优先 → 场景 → 道具
      .sort((a, b) => {
        const order: Record<string, number> = { character: 0, scene: 1, prop: 2 };
        return (order[a!.type] ?? 3) - (order[b!.type] ?? 3);
      });

    return { trackId: tid, shots, totalDuration, shotCount: shots.length, requiredAssets };
  });

  // 7. 构建消息
  const systemPrompt = `你是 Seedance 2.0 平台的专业分镜提示词编写师。根据分镜表按 Track（轨道）编写视频生成提示词。

## 核心规则：Track 级生成
- 每个 Track 对应一条提示词、一次 Seedance 2.0 视频生成
- Track 内包含多个分镜 shot，你需要将它们合成为一段连贯的时间轴叙事
- Track 视频时长为整数秒（已在数据中标注 totalDuration）
- Seedance 2.0 只接受整数秒 [4,5,6,7,8,9,10,11,12,13,14,15]

## 输出格式
输出为 Markdown，每个 Track 一个段落，格式：
\`\`\`
## T{Track编号} 【Track 叙事主题】
（连续叙事段落，融合 Track 内所有 shot 为一段完整视觉叙事）
\`\`\`

## 资产引用规则（最重要！零遗漏！）
每个 Track 数据中的 requiredAssets 字段列出了该 Track 必须引用的全部资产。
- requiredAssets 中的**每一个**资产都必须出现在 @图N 引用中，不可遗漏任何一个
- @图N 编号从 1 开始（Track 内局部编号），按 requiredAssets 顺序编号
- 格式：@图N（素材表@图{globalIndex}-{name}）
- 即使某个资产只在 Track 末尾的 shot 中出现，也必须引用

## Track 合成要点
- 景别/运镜过渡：shot 之间的景别变化用运镜描述平滑连接（如"镜头从全景缓推至近景"）
- 情绪弧线：将 Track 内多个 shot 的 emotion 编织为连续情绪变化
- 台词衔接：多条台词按时间轴自然排列
- 动作连续：shot 间动作终态→起始态自然过渡

## 五层写法框架（融合为连续叙事，禁止XML标签）
- L0 参考图声明：@图N（素材表@图M-名称），每条从@图1重新编号，≤9张
- L1 前缀：风格锚点词 + 画质词 + 时长（整数秒） + 转场方式 + 色彩方案关键词
- L2 场景：@场景参考图 + 光影叙事（1-2句）
- L3 蒙太奇核心：精确时间轴(0-Xs) + 景别 + 运镜 + 动作 + 情绪面部 + 台词 + 音效
- L4 嘴型：旁白→闭嘴 | 对话→张嘴说话 | 独白→嘴唇翕动

## L3 时间轴分段建议
4-6s → 2-3段 | 7-9s → 3-4段 | 10-12s → 4-5段 | 13-15s → 5-6段
每段不超过3s，头尾各留0.5s安全区

## 首帧原则（最重要）
描述动作的准备姿态（起始1/3），而非动作顶点。
✗ "叶真挥剑斩出剑气" → ✓ "叶真持剑于身侧，剑尖微抬蓄力"

## 风格锚点词（每条必含）
国风3D渲染，PBR材质，体积光，东方美学，电影风格

## 柔化词系统（零容忍）
环境：破旧→古朴，死寂→宁静，逼仄→紧凑
表情：冷汗→略带疲惫，猛睁眼→缓缓睁眼，惊恐→微微惊讶
情绪：绝望→迷茫，恐惧→不安，愤怒→不甘
规则：单条≤2个负面词，优先用动态变化替代静态负面

## 去人化规则
面部描写用"情绪动态变化"（如"表情从迷茫转为坚定"），禁止静态写实细节（瞳孔颜色/肤质纹理）

## 角色 @图 引用规则（极重要！）
- 每个时间段（如 0-5s、5-10s）切换时，该段第一次提及角色必须使用 @图N 前缀
- 同一时间段内再次提及同一角色可只用名字
- identityAnchor（3-5个核心视觉词）仅在整条提示词的首次出现时包含
- 禁止用"父亲""母亲""儿子""丈夫"等关系词指代角色——Seedance 不理解关系，必须用 @图N+名字
- 禁止用"他""她"等代词指代角色（有歧义时），必须用 @图N+名字
- 焦点角色详写，次要角色简写，背景角色极简
- 格式：@图N（素材表@图M-角色名）
- 场景 @图 只需在 L2 层引用一次

## 远景/大远景人物禁令（Seedance 硬限制）
- 大远景、远景时间段内，禁止描写任何可辨识的人物形态（人影、身影、剪影、小人 等全部禁止）
- 远景段只描写环境/建筑/自然元素
- 角色 @图N 只在中景及更近的景别中使用
- 原因：Seedance 会将参考图中的角色强制渲染到远景画面中，导致人物变形崩盘

## 时间轴规则
- L3 时间轴标记只使用整数秒，禁止小数
- ✗ 错误：(0-5.5s)、(5.5-10.5s)  ✓ 正确：(0-6s)、(6-11s)

${videoStyleTemplate ? `## 视频风格模板\n${videoStyleTemplate}\n\n` : ''}${emotionMapping ? `## 情绪→面部映射\n${emotionMapping}\n\n` : ''}只输出 Markdown 内容，不要输出额外说明。`;

  const visualStyle = directorPlan.visualStyle ? JSON.stringify(directorPlan.visualStyle) : '';

  const userMessage = `## 视觉风格基调
${visualStyle}

## 分镜表（按 Track 分组）
${JSON.stringify(trackSummary)}

## 可用资产（含身份锚点）
${JSON.stringify(assetSummary)}

请为每个 Track (T1-T${trackIds.length}) 编写 Seedance 2.0 视频提示词，每个 Track 一条连贯叙事。`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  const result = await callLanguageModel(modelId || '', messages);

  // 8. 保存（纯文本，不需要 JSON 解析）
  await saveStoryboardPrompts(name, episode, result);
}

/** 读取 Seedance 服化道设计数据（兼容新旧格式） */
export async function getSeedanceDesign(name: string): Promise<{
  characterPrompts: string;
  scenePrompts: string;
  manifest: unknown;
  assets: unknown;
}> {
  const manifest = await getSeedanceManifest(name);

  // 如果 manifest 是新格式 assets.json（数组），从中提取 prompt
  if (Array.isArray(manifest)) {
    const characters = (manifest as Array<{ type: string; name: string; prompt?: string; description?: string }>)
      .filter(a => a.type === 'character');
    const scenes = (manifest as Array<{ type: string; name: string; prompt?: string; description?: string }>)
      .filter(a => a.type === 'scene');
    const characterPrompts = characters
      .map(c => `### ${c.name}\n${c.prompt || c.description || ''}`)
      .join('\n\n');
    const scenePrompts = scenes
      .map(s => `### ${s.name}\n${s.prompt || s.description || ''}`)
      .join('\n\n');
    return { characterPrompts, scenePrompts, manifest, assets: manifest };
  }

  return { characterPrompts: '', scenePrompts: '', manifest: null, assets: null };
}

/** 读取 Seedance 资产列表（新格式） */
export async function getSeedanceAssets(name: string): Promise<SeedanceAsset[]> {
  return readAssetsFile(name);
}

/** 读取 Seedance 任务队列 */
export async function getSeedanceTasks(name: string): Promise<unknown[]> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'seedance', 'tasks.json');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

/** 读取导演规划 */
export async function getSeedanceDirectorPlan(name: string, episode: number): Promise<unknown> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'seedance', `ep${episode}`, 'director-plan.json');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/** 保存导演规划 */
export async function saveSeedanceDirectorPlan(
  name: string,
  episode: number,
  plan: Record<string, unknown>
): Promise<void> {
  const epDir = path.join(NOVELS_DIR, safeName(name), 'seedance', `ep${episode}`);
  await fs.mkdir(epDir, { recursive: true });
  await fs.writeFile(path.join(epDir, 'director-plan.json'), JSON.stringify(plan, null, 2), 'utf-8');
}

/** 执行导演规划：读取讲戏本+资产+风格模板，调用语言模型生成六维度规划 JSON */
export async function runDirectorPlan(
  name: string,
  episode: number,
  modelId?: string
): Promise<void> {
  const { callLanguageModel } = await import('@/app/lib/ai-client');

  // 1. 读取讲戏本
  const directorContent = await getSeedanceDirector(name, episode);
  if (!directorContent.trim()) {
    throw new Error('未找到导演分析内容，请先完成阶段A');
  }

  // 2. 读取资产数据
  const assets = await getSeedanceAssets(name);
  if (assets.length === 0) {
    throw new Error('未找到资产数据，请先完成阶段B');
  }

  // 3. 读取风格模板
  let styleTemplate = '';
  try {
    const descPath = path.join(NOVELS_DIR, safeName(name), 'description');
    const desc = await fs.readFile(descPath, 'utf-8');
    const styleMatch = desc.match(/影片画风[:：]\s*(.+)/);
    if (styleMatch) {
      const styleMap: Record<string, string> = { '3D 国漫': '3d-guoman' };
      const artStyle = styleMap[styleMatch[1].trim()] || styleMatch[1].trim().toLowerCase().replace(/\s+/g, '-');
      styleTemplate = await getArtTemplate(artStyle, 'director_planning_style.md');
    }
  } catch {
    console.warn('读取导演规划风格模板失败，使用空模板');
  }

  // 4. 精简资产数据（减少 token）
  const assetSummary = assets.map(a => ({
    id: a.id, name: a.name, type: a.type,
    description: a.description,
    identityAnchor: a.identityAnchor || [],
  }));

  // 5. 构建消息
  const systemPrompt = `你是一位经验丰富的短剧导演，正在为一集短剧做全面的视觉与叙事规划。
你已经完成了剧本的导演分析（讲戏本），现在需要将分析转化为可执行的六维度导演规划。

${styleTemplate ? `以下是当前美术风格的导演规划约束，你必须严格遵守：\n\n${styleTemplate}\n\n` : ''}请根据导演分析和资产数据，产出严格符合以下 JSON 结构的导演规划。只输出 JSON，不要输出任何额外文字或 markdown 代码块标记。

JSON 结构要求（9个顶层必填字段）：
{
  "episode": "ep${String(episode).padStart(2, '0')}",
  "themeCore": { "emotionalArc": "全集情感主线", "viewerTakeaway": "观众带走什么" },
  "visualStyle": { "colorPalette": "情绪色彩方案", "lightingPlan": "光线方案", "compositionStyle": "构图风格", "textureDirection": "材质方向" },
  "sceneGroups": [{ "sceneId": "scene-001", "sceneName": "场景名", "shots": [1,2,3], "mood": "情绪", "lightingKey": "主光调", "colorScheme": "色彩方案" }],
  "rhythm": [{ "act": "opening|rising|climax|falling|ending", "shotRange": [1,5], "pacing": "slow|medium|fast", "note": "说明" }],
  "sceneIntents": [{ "sceneId": "scene-001", "directorNote": "导演意图", "audienceDistance": "旁观者|共情者|窥视者" }],
  "soundDesign": { "bgmDirection": "BGM方向", "keyEffects": ["音效1"], "silenceUsage": "静默说明" },
  "turningPoints": [{ "afterShot": 5, "type": "emotional|plot|visual", "description": "转折描述" }],
  "transitions": [{ "fromScene": "scene-001", "toScene": "scene-002", "method": "切换方式", "emotionBridge": "情绪衔接" }]
}`;

  const userMessage = `## 导演分析（讲戏本）

${directorContent}

## 资产数据

${JSON.stringify(assetSummary, null, 2)}

请基于以上内容，输出本集的六维度导演规划 JSON。`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  const result = await callLanguageModel(modelId || '', messages);

  // 6. 解析 JSON
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(result);
  } catch {
    const jsonMatch = result.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error('AI 返回内容无法解析为 JSON，请重试');
    }
  }

  // 7. 校验必要字段
  const requiredKeys = ['episode', 'themeCore', 'visualStyle', 'sceneGroups', 'rhythm', 'sceneIntents', 'soundDesign', 'turningPoints', 'transitions'];
  const missing = requiredKeys.filter(k => !(k in parsed));
  if (missing.length > 0) {
    throw new Error(`导演规划 JSON 缺少必要字段: ${missing.join(', ')}`);
  }

  // 8. 强制正确 episode
  parsed.episode = `ep${String(episode).padStart(2, '0')}`;

  // 9. 保存
  await saveSeedanceDirectorPlan(name, episode, parsed);
}

/** 读取分镜表 */
export async function getSeedanceStoryboardTable(name: string, episode: number): Promise<unknown> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'seedance', `ep${episode}`, 'storyboard-table.json');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/** 保存分镜表 */
export async function saveStoryboardTable(
  name: string,
  episode: number,
  table: Record<string, unknown>
): Promise<void> {
  const epDir = path.join(NOVELS_DIR, safeName(name), 'seedance', `ep${episode}`);
  await fs.mkdir(epDir, { recursive: true });
  await fs.writeFile(path.join(epDir, 'storyboard-table.json'), JSON.stringify(table, null, 2), 'utf-8');
}

/** 执行分镜表构建：读取导演规划+讲戏本+资产+规范模板，调用语言模型生成结构化分镜表 */
export async function runStoryboardTable(
  name: string,
  episode: number,
  modelId?: string
): Promise<void> {
  const { callLanguageModel } = await import('@/app/lib/ai-client');

  // 1. 读取导演规划（C1 输出）
  const directorPlan = await getSeedanceDirectorPlan(name, episode);
  if (!directorPlan) {
    throw new Error('未找到导演规划，请先完成 C1 导演规划');
  }

  // 2. 读取讲戏本
  const directorContent = await getSeedanceDirector(name, episode);
  if (!directorContent.trim()) {
    throw new Error('未找到导演分析内容，请先完成阶段A');
  }

  // 3. 读取资产数据
  const assets = await getSeedanceAssets(name);
  if (assets.length === 0) {
    throw new Error('未找到资产数据，请先完成阶段B');
  }

  // 4. 读取美术风格分镜约束（保留，体积适中）
  let styleTemplate = '';
  try {
    const descPath = path.join(NOVELS_DIR, safeName(name), 'description');
    const desc = await fs.readFile(descPath, 'utf-8');
    const styleMatch = desc.match(/影片画风[:：]\s*(.+)/);
    if (styleMatch) {
      const styleMap: Record<string, string> = { '3D 国漫': '3d-guoman' };
      const artStyle = styleMap[styleMatch[1].trim()] || styleMatch[1].trim().toLowerCase().replace(/\s+/g, '-');
      styleTemplate = await getArtTemplate(artStyle, 'director_storyboard_style.md');
    }
  } catch {
    console.warn('分镜风格模板读取失败');
  }

  // 5. 资产数据极简化（只传 id/name/type，省掉大量描述文本）
  const assetSummary = assets.map(a => ({ id: a.id, name: a.name, type: a.type }));

  const epPadded = String(episode).padStart(2, '0');

  // 6. 构建消息（精简 prompt，不嵌入 techniques.md 全文）
  const systemPrompt = `你是一位经验丰富的短剧分镜师，正在为一集短剧构建结构化分镜表 JSON。

${styleTemplate ? `美术风格分镜约束：\n\n${styleTemplate}\n\n` : ''}## 分镜表核心规则

1. 台词原文锁定：dialogue 字段必须与讲戏本中台词一字不差，含标点
2. 台词时长公式：duration = 字数÷语速 + 停顿 + 1s余量（愤怒4字/s，正常3字/s，悲伤2字/s；逗号+0.3s，句号/问号+0.5s）
3. 景别七级：大远景→远景→全景→中景→近景→特写→大特写，相邻跨度≤2级，禁止连续3镜同景别
4. 动作连续性：上镜终态=下镜起始态
5. 黄金6秒：无台词镜头≤6s（一镜到底例外≤12s）
6. 10方位朝向：action 末尾必须标注（面朝右/面朝左/正面/3/4正面朝右/3/4正面朝左/正侧面朝右/正侧面朝左/3/4背面朝右/3/4背面朝左/背面），可叠加微仰头/微低头
7. 180度线：对话场景朝向不跳轴
8. Track分组：按15s累计上限分组，场景切换处优先切分
9. 资产引用：角色出现即引用ID，每行必须引用场景资产ID
10. 定场精简：同场景最多1-2镜定场
11. 节拍密度：2-3s最多1拍，4-6s最多2拍
12. 头尾安全区：每镜前后0.5s不放关键动作
13. 转场：同场硬切，跨场景插空镜过渡

## 10项校验（生成后自检，结果写入 _validationLog）
景别递进 | 连续同景别 | 动作连续性 | 180度线 | 情绪连贯 | Track时长 | 资产引用完整 | 台词时长 | 黄金6秒 | 场景资产必选

只输出 JSON，不要输出任何额外文字。JSON 结构：
{
  "episode": "ep${epPadded}",
  "totalDuration": <所有duration之和>,
  "rows": [{ "seq": 1, "description": "15-50字画面描述", "scene": "场景名", "assetIds": ["char-001","scene-001"], "duration": 3.5, "shotType": "全景", "cameraMove": "静止", "action": "动作链｜朝向：角色-面朝右", "emotion": "具象情绪", "lighting": "光源+色调+明暗", "dialogue": "台词原文或无台词", "soundEffect": "环境音+动作音或无", "trackId": 1 }],
  "_validationLog": [{ "rule": "规则名", "seq": 1, "issue": "问题", "action": "fixed|warning" }]
}`;

  const userMessage = `## 导演规划
${JSON.stringify(directorPlan, null, 2)}

## 讲戏本
${directorContent}

## 可用资产（分镜表中 assetIds 必须从此列表选取）
${JSON.stringify(assetSummary)}

输出本集分镜表 JSON。`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  const result = await callLanguageModel(modelId || '', messages);

  // 8. 解析 JSON
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(result);
  } catch {
    const jsonMatch = result.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error('AI 返回内容无法解析为 JSON，请重试');
    }
  }

  // 9. 校验必要字段
  if (!parsed.rows || !Array.isArray(parsed.rows)) {
    throw new Error('分镜表 JSON 缺少 rows 数组');
  }

  // 10. 强制正确 episode + 重算 totalDuration
  parsed.episode = `ep${epPadded}`;
  const rows = parsed.rows as Array<Record<string, unknown>>;
  parsed.totalDuration = rows.reduce((sum, r) => sum + (Number(r.duration) || 0), 0);

  // 11. 保存
  await saveStoryboardTable(name, episode, parsed);
}

// ============ 设置/模型配置 ============

export interface ModelConfig {
  modelId: string;
  name: string;
  type: string;
  mode?: string;
  enabled: boolean;
  isDefault?: boolean;
  authMode?: 'api';
  provider?: string;
  adapter?: 'openai-images' | 'grsai-task-polling' | 'custom-http';
  api: {
    submitUrl?: string;
    pollUrl?: string;
    apiKey?: string;
    apiKeyEnv?: string;
    baseUrl?: string;
    method?: string;
    protocol?: 'openai-compatible' | 'anthropic';
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
  requestTemplate?: Record<string, unknown>;
}

/** 获取所有模型配置 */
export async function getModelConfigs(): Promise<{
  language: ModelConfig[];
  video: ModelConfig[];
  image: ModelConfig[];
}> {
  const result: { language: ModelConfig[]; video: ModelConfig[]; image: ModelConfig[] } = {
    language: [],
    video: [],
    image: [],
  };

  const modelsDir = path.join(CONFIG_DIR, 'models');
  try {
    const types = await fs.readdir(modelsDir);
    for (const type of types) {
      const typeDir = path.join(modelsDir, type);
      const stat = await fs.stat(typeDir);
      if (!stat.isDirectory()) continue;

      const files = await fs.readdir(typeDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const content = await fs.readFile(path.join(typeDir, file), 'utf-8');
          const config = JSON.parse(content) as ModelConfig;
          const DIR_TO_KEY: Record<string, string> = { text: 'language' };
          const key = DIR_TO_KEY[type] || type;
          if (key in result) {
            (result as Record<string, ModelConfig[]>)[key].push(config);
          }
        } catch { /* 解析失败跳过 */ }
      }
    }
  } catch { /* models 目录不存在 */ }

  for (const key of Object.keys(result) as Array<keyof typeof result>) {
    result[key].sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return (a.name || a.modelId).localeCompare(b.name || b.modelId, 'zh-Hans-CN');
    });
  }

  return result;
}

/** 保存模型配置 */
export async function saveModelConfig(
  type: string,
  id: string,
  config: ModelConfig
): Promise<void> {
  const dir = path.join(CONFIG_DIR, 'models', safeName(type));
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${safeName(id)}.json`);
  await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf-8');
}

/** 删除模型配置 */
export async function deleteModelConfig(
  type: string,
  id: string
): Promise<void> {
  const filePath = path.join(CONFIG_DIR, 'models', safeName(type), `${safeName(id)}.json`);
  await fs.unlink(filePath);
}

// ============ 审核结果 ============

export interface ReviewDimension {
  name: string;
  weight: number;
  score: number;
  comment: string;
}

export interface ReviewResult {
  type: 'skeleton' | 'adaptation' | 'storyline' | 'outline' | 'script';
  scope?: 'global' | 'episode';
  episode?: number;
  totalScore: number;
  status: 'pass' | 'fail';
  dimensions: ReviewDimension[];
  suggestions: string[];
  summary: string;
  reviewedAt: string;
  modelId: string;
}

function reviewFileName(type: string, episode?: number): string {
  if (episode !== undefined) return `${type}-ep${episode}.json`;
  return `${type}.json`;
}

function reviewFixKey(type: string, episode?: number): string {
  return type === 'script' && episode !== undefined ? `script-ep${episode}` : type;
}

async function readReviewFixCounts(name: string): Promise<Record<string, number>> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'reviews', 'fix-count.json');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const counts: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        counts[key] = value;
      }
    }
    return counts;
  } catch {
    return {};
  }
}

async function writeReviewFixCounts(name: string, counts: Record<string, number>): Promise<void> {
  const dir = path.join(NOVELS_DIR, safeName(name), 'reviews');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'fix-count.json'), JSON.stringify(counts, null, 2), 'utf-8');
}

export async function getReviewFixCount(name: string, key: string): Promise<number> {
  const counts = await readReviewFixCounts(name);
  return counts[key] || 0;
}

export async function incrementReviewFixCount(name: string, key: string): Promise<void> {
  const counts = await readReviewFixCounts(name);
  counts[key] = (counts[key] || 0) + 1;
  await writeReviewFixCounts(name, counts);
}

export async function resetReviewFixCount(name: string, key: string): Promise<void> {
  const counts = await readReviewFixCounts(name);
  if (counts[key] === undefined) return;
  delete counts[key];
  await writeReviewFixCounts(name, counts);
}

/** 获取审核结果 */
export async function getReviewResult(
  name: string,
  type: string,
  episode?: number
): Promise<ReviewResult | null> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'reviews', reviewFileName(type, episode));
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as ReviewResult;
  } catch {
    return null;
  }
}

/** 保存审核结果 */
export async function saveReviewResult(name: string, result: ReviewResult): Promise<void> {
  const dir = path.join(NOVELS_DIR, safeName(name), 'reviews');
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, reviewFileName(result.type, result.episode));
  await fs.writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');
  if (result.status === 'pass') {
    await resetReviewFixCount(name, reviewFixKey(result.type, result.episode));
  }
}

/** 获取项目所有审核结果 */
export async function getAllReviews(name: string): Promise<ReviewResult[]> {
  const dir = path.join(NOVELS_DIR, safeName(name), 'reviews');
  const results: ReviewResult[] = [];
  try {
    const files = await fs.readdir(dir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      if (file === 'fix-count.json') continue;
      try {
        const content = await fs.readFile(path.join(dir, file), 'utf-8');
        results.push(JSON.parse(content) as ReviewResult);
      } catch { /* skip */ }
    }
  } catch { /* dir not exist */ }
  return results;
}

// ============ Seedance 资产 CRUD ============

/** 内部辅助：per-project 互斥锁，防止并发读-改-写导致数据丢失 */
const assetLocks = new Map<string, Promise<void>>();

async function withAssetLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const key = safeName(name);
  const prev = assetLocks.get(key) ?? Promise.resolve();
  let resolve: () => void;
  const next = new Promise<void>(r => { resolve = r; });
  assetLocks.set(key, next);
  await prev;
  try {
    return await fn();
  } finally {
    resolve!();
    if (assetLocks.get(key) === next) assetLocks.delete(key);
  }
}

/** 内部辅助：读取 assets.json */
async function readAssetsFile(name: string): Promise<SeedanceAsset[]> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'seedance', 'assets.json');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

/** 内部辅助：写入 assets.json */
async function writeAssetsFile(name: string, assets: SeedanceAsset[]): Promise<void> {
  const dir = path.join(NOVELS_DIR, safeName(name), 'seedance');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'assets.json'), JSON.stringify(assets, null, 2), 'utf-8');
}

/** 内部辅助：生成资产 ID */
function generateAssetId(assets: SeedanceAsset[], type: SeedanceAssetType): string {
  const prefix = type === 'character' ? 'char' : type;
  const existing = assets
    .filter(a => a.type === type)
    .map(a => parseInt(a.id.split('-')[1], 10))
    .filter(n => !isNaN(n));
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

/** 获取单个资产 */
export async function getSeedanceAssetById(
  name: string,
  id: string
): Promise<SeedanceAsset | null> {
  const assets = await readAssetsFile(name);
  return assets.find(a => a.id === id) ?? null;
}

/** 更新单个资产（读-改-写，带并发锁） */
export async function updateSeedanceAsset(
  name: string,
  id: string,
  partial: Partial<Pick<SeedanceAsset, 'name' | 'description' | 'identityAnchor' | 'prompt' | 'modelId' | 'resolution' | 'promptState' | 'promptError' | 'promptGeneratedAt'>>
): Promise<SeedanceAsset> {
  return withAssetLock(name, async () => {
    const assets = await readAssetsFile(name);
    const index = assets.findIndex(a => a.id === id);
    if (index === -1) {
      throw new Error('资产不存在');
    }
    const updated: SeedanceAsset = {
      ...assets[index],
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    assets[index] = updated;
    await writeAssetsFile(name, assets);
    return updated;
  });
}

/** 创建新资产（带并发锁） */
export async function createSeedanceAsset(
  name: string,
  payload: { name: string; type: SeedanceAssetType; description: string; identityAnchor?: string[] }
): Promise<SeedanceAsset> {
  return withAssetLock(name, async () => {
    const assets = await readAssetsFile(name);
    const now = new Date().toISOString();
    const newAsset: SeedanceAsset = {
      id: generateAssetId(assets, payload.type),
      name: payload.name,
      type: payload.type,
      description: payload.description,
      identityAnchor: payload.identityAnchor,
      prompt: '',
      artStyle: '',
      state: 'pending',
      imagePath: '',
      generatedAt: null,
      apiTaskId: '',
      modelId: '',
      resolution: '',
      sourceEpisode: '',
      episodeRefs: [],
      createdAt: now,
      updatedAt: now,
    };
    assets.push(newAsset);
    await writeAssetsFile(name, assets);
    return newAsset;
  });
}

/** 批量更新资产字段（读-改-写，带并发锁） */
export async function batchUpdateAssetField(
  name: string,
  updates: Array<{ id: string; fields: Partial<SeedanceAsset> }>
): Promise<void> {
  return withAssetLock(name, async () => {
    const assets = await readAssetsFile(name);
    const now = new Date().toISOString();
    for (const { id, fields } of updates) {
      const index = assets.findIndex(a => a.id === id);
      if (index === -1) continue;
      assets[index] = { ...assets[index], ...fields, updatedAt: now };
    }
    await writeAssetsFile(name, assets);
  });
}

/**
 * 条件批量标记停滞资产为 failed（锁内重新读取 state，避免竞态覆盖已成功的资产）。
 * 返回实际被标记的资产 ID 列表。
 */
export async function batchMarkStuckAssetsFailed(
  name: string,
  candidateIds: string[],
  errorMessage: string
): Promise<string[]> {
  return withAssetLock(name, async () => {
    const assets = await readAssetsFile(name);
    const now = new Date().toISOString();
    const markedIds: string[] = [];
    for (const id of candidateIds) {
      const index = assets.findIndex(a => a.id === id);
      if (index === -1) continue;
      // 仅对当前仍处于 generating 状态的资产执行覆盖
      if (assets[index].state !== 'generating') continue;
      assets[index] = { ...assets[index], state: 'failed', error: errorMessage, updatedAt: now };
      markedIds.push(id);
    }
    if (markedIds.length > 0) {
      await writeAssetsFile(name, assets);
    }
    return markedIds;
  });
}

/** 删除资产（仅删 JSON 条目，不删图片文件，带并发锁） */
export async function deleteSeedanceAsset(
  name: string,
  id: string
): Promise<void> {
  return withAssetLock(name, async () => {
    const assets = await readAssetsFile(name);
    const index = assets.findIndex(a => a.id === id);
    if (index === -1) {
      throw new Error('资产不存在');
    }
    assets.splice(index, 1);
    await writeAssetsFile(name, assets);
  });
}

/** 从大纲提取资产（写入时带并发锁） */
export async function extractAssetsFromOutline(
  name: string,
  preview: boolean
): Promise<ExtractPreview | { created: number }> {
  const outline = await getOutline(name) as Array<{
    characters?: (string | { name: string; description?: string })[];
    scenes?: (string | { name: string; description?: string })[];
    props?: (string | { name: string; description?: string })[];
  }> | null;

  if (!outline || outline.length === 0) {
    throw new Error('未找到大纲数据');
  }

  // 遍历所有 episodes，按 name+type 去重提取（首次出现优先）
  const extracted = new Map<string, { name: string; description: string; type: SeedanceAssetType }>();

  for (const ep of outline) {
    for (const c of ep.characters || []) {
      const n = typeof c === 'string' ? c : c.name;
      const d = typeof c === 'string' ? '' : (c.description || '');
      const key = `character:${n}`;
      if (!extracted.has(key)) extracted.set(key, { name: n, description: d, type: 'character' });
    }
    for (const s of ep.scenes || []) {
      const n = typeof s === 'string' ? s : s.name;
      const d = typeof s === 'string' ? '' : (s.description || '');
      const key = `scene:${n}`;
      if (!extracted.has(key)) extracted.set(key, { name: n, description: d, type: 'scene' });
    }
    for (const p of ep.props || []) {
      const n = typeof p === 'string' ? p : p.name;
      const d = typeof p === 'string' ? '' : (p.description || '');
      const key = `prop:${n}`;
      if (!extracted.has(key)) extracted.set(key, { name: n, description: d, type: 'prop' });
    }
  }

  // 与已有 assets.json 比对，跳过已存在的
  const existing = await readAssetsFile(name);
  const existingKeys = new Set(existing.map(a => `${a.type}:${a.name}`));
  const toCreate = [...extracted.values()].filter(e => !existingKeys.has(`${e.type}:${e.name}`));
  const skipped = extracted.size - toCreate.length;

  if (preview) {
    return {
      characters: toCreate.filter(e => e.type === 'character').map(e => ({ name: e.name, description: e.description })),
      scenes: toCreate.filter(e => e.type === 'scene').map(e => ({ name: e.name, description: e.description })),
      props: toCreate.filter(e => e.type === 'prop').map(e => ({ name: e.name, description: e.description })),
      skipped,
    };
  }

  // 生成完整 SeedanceAsset 对象并追加到 assets.json（带并发锁）
  return withAssetLock(name, async () => {
    // 在锁内重新读取，确保拿到最新数据
    const latestAssets = await readAssetsFile(name);
    const latestKeys = new Set(latestAssets.map(a => `${a.type}:${a.name}`));
    const finalToCreate = toCreate.filter(e => !latestKeys.has(`${e.type}:${e.name}`));

    const now = new Date().toISOString();
    const allAssets = [...latestAssets];
    for (const item of finalToCreate) {
      const newAsset: SeedanceAsset = {
        id: generateAssetId(allAssets, item.type),
        name: item.name,
        type: item.type,
        description: item.description,
        prompt: '',
        artStyle: '',
        state: 'pending',
        imagePath: '',
        generatedAt: null,
        apiTaskId: '',
        modelId: '',
        resolution: '',
        sourceEpisode: '',
        episodeRefs: [],
        createdAt: now,
        updatedAt: now,
      };
      allAssets.push(newAsset);
    }
    await writeAssetsFile(name, allAssets);
    return { created: finalToCreate.length };
  });
}

// ============ 导演分析核心逻辑 ============

/** 导演分析系统提示词 */
const DIRECTOR_SYSTEM_PROMPT = `你是一位专业的短剧导演。请阅读以下剧本，输出导演讲戏本，包含：
1. 本集情绪弧线
2. 人物清单（每个角色用 ### 角色名 作为标题，然后用表格格式，含字段：年龄、外形、服装、发型、性格、本集情绪状态、关键肢体细节）
3. 场景清单（每个场景用 ### 场景名 作为标题，然后用表格格式，含字段：空间描述、时段、光影、氛围、关键视觉元素）
4. 道具清单（每个道具用 ### 道具名 作为标题，然后用表格格式，含字段：分类、外观描述、剧情用途）。只列有独立剧情功能或特写镜头的道具，场景陈设和服装不列入。如无道具则输出"本集无符合标准的独立道具"。
5. 镜头分组建议

输出格式使用 markdown。人物清单、场景清单和道具清单的每个条目必须用 ### 标题 + | 字段 | 描述 | 表格的格式。`;

/**
 * 执行导演分析：读取剧本 -> 调用 LLM -> 写入讲戏本 -> 提取资产
 * 被 director/route.ts POST 和 chat/route.ts 共用
 */
export async function runDirectorAnalysis(
  name: string,
  episode: number,
  modelId?: string
): Promise<{ assetsCreated: number }> {
  // 延迟导入避免循环依赖
  const { callLanguageModel } = await import('@/app/lib/ai-client');

  const safe = safeName(name);
  const scriptPath = path.join(NOVELS_DIR, safe, 'scripts', `episode-${episode}.txt`);
  let scriptContent: string;
  try {
    scriptContent = await fs.readFile(scriptPath, 'utf-8');
  } catch {
    throw new Error(`未找到第${episode}集剧本`);
  }

  if (!scriptContent.trim()) {
    throw new Error('剧本内容为空');
  }

  const messages = [
    { role: 'system', content: DIRECTOR_SYSTEM_PROMPT },
    { role: 'user', content: scriptContent },
  ];

  const result = await callLanguageModel(modelId || '', messages);

  const epDir = path.join(NOVELS_DIR, safe, 'seedance', `ep${episode}`);
  await fs.mkdir(epDir, { recursive: true });
  await fs.writeFile(path.join(epDir, '01-director.md'), result, 'utf-8');

  const assetsCreated = await parseDirectorToAssets(name, episode);
  return { assetsCreated };
}

// ============ 导演讲戏本解析提取资产 ============

/** 正规化资产名称：去 Markdown 标记、序号、竖线、括号后缀 */
function normalizeAssetName(raw: string): string {
  return raw
    .replace(/^#+\s*/, '')       // 去 Markdown 标题符号
    .replace(/^\d+\.\s*/, '')    // 去序号 "1. "
    .replace(/\s*\|+\s*$/, '')   // 去尾部竖线
    .replace(/[（(].+[)）]$/, '') // 去括号后缀
    .trim();
}

/** 从导演讲戏本中解析人物和场景，写入 assets.json，返回新建资产数量 */
export async function parseDirectorToAssets(name: string, episode: number): Promise<number> {
  try {
    const directorPath = path.join(NOVELS_DIR, safeName(name), 'seedance', `ep${episode}`, '01-director.md');
    const content = await fs.readFile(directorPath, 'utf-8');
    if (!content) return 0;

    // 读取画风
    let artStyle = '';
    try {
      const descPath = path.join(NOVELS_DIR, safeName(name), 'description');
      const desc = await fs.readFile(descPath, 'utf-8');
      const styleMatch = desc.match(/影片画风[:：]\s*(.+)/);
      if (styleMatch) {
        const styleMap: Record<string, string> = { '3D 国漫': '3d-guoman' };
        artStyle = styleMap[styleMatch[1].trim()] || styleMatch[1].trim().toLowerCase().replace(/\s+/g, '-');
      }
    } catch { /* 忽略读取失败 */ }

    const extracted: { name: string; description: string; type: SeedanceAssetType }[] = [];

    // 分割为人物清单和场景清单部分
    const sections = content.split(/^## /m);

    for (const section of sections) {
      const isCharacterSection = /人物清单/i.test(section.substring(0, 30));
      const isSceneSection = /场景清单/i.test(section.substring(0, 30));
      const isPropsSection = /道具清单/i.test(section.substring(0, 30));

      if (!isCharacterSection && !isSceneSection && !isPropsSection) continue;

      // 找到 ### 开头的子标题（角色名 或 场景名）
      const subSections = section.split(/^### /m).slice(1);

      for (const sub of subSections) {
        const nameMatch = sub.match(/^(.+?)[\n\r]/);
        if (!nameMatch) continue;
        const assetName = normalizeAssetName(nameMatch[1]);
        if (!assetName) continue;

        // 提取表格内容：| 字段 | 描述 | 格式
        const tableRows: string[] = [];
        const lines = sub.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          // 跳过表头分隔行
          if (/^\|[\s-:|]+\|$/.test(trimmed)) continue;
          // 匹配表格行
          const rowMatch = trimmed.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/);
          if (rowMatch) {
            const field = rowMatch[1].trim();
            const value = rowMatch[2].trim();
            // 跳过表头行
            if (field === '字段' && value === '描述') continue;
            tableRows.push(`${field}: ${value}`);
          }
        }

        const description = tableRows.join('；');

        if (isCharacterSection) {
          extracted.push({ name: assetName, description, type: 'character' });
        } else if (isSceneSection) {
          // 场景名可能包含 "场景 X：" 前缀
          const sceneName = assetName.replace(/^场景\s*[A-Za-z0-9]+[：:]\s*/, '');
          extracted.push({ name: sceneName || assetName, description, type: 'scene' });
        } else if (isPropsSection) {
          extracted.push({ name: assetName, description, type: 'prop' });
        }
      }
    }

    if (extracted.length === 0) return 0;

    // 写入 assets.json（先删后建：重跑同一集时清理旧资产再重新提取）
    return withAssetLock(name, async () => {
      const allAssets = await readAssetsFile(name);
      const now = new Date().toISOString();
      const epKey = `ep${String(episode).padStart(2, '0')}`;
      const epKeyAlt = `ep${episode}`;

      // 移除当前集的所有旧资产
      const assets = allAssets.filter(a =>
        a.sourceEpisode !== epKey && a.sourceEpisode !== epKeyAlt
      );

      // 修正其他集资产的脏名称
      for (const a of assets) {
        const normalized = normalizeAssetName(a.name);
        if (normalized !== a.name) {
          a.name = normalized;
          a.updatedAt = now;
        }
      }

      const existingKeys = new Set(assets.map(a => `${a.type}:${a.name}`));

      for (const item of extracted) {
        const key = `${item.type}:${item.name}`;
        if (existingKeys.has(key)) continue;

        const newAsset: SeedanceAsset = {
          id: generateAssetId(assets, item.type),
          name: item.name,
          type: item.type,
          description: item.description,
          prompt: '',
          artStyle,
          state: 'pending',
          imagePath: '',
          generatedAt: null,
          apiTaskId: '',
          modelId: '',
          resolution: '',
          sourceEpisode: epKey,
          episodeRefs: [epKey],
          createdAt: now,
          updatedAt: now,
        };
        assets.push(newAsset);
        existingKeys.add(key);
      }

      await writeAssetsFile(name, assets);
      return extracted.length;
    });
  } catch {
    // 解析失败不抛错，返回 0
    return 0;
  }
}

// ============ 批量任务管理（tasks.json） ============

export interface BatchTask {
  batchId: string;
  type: 'polish' | 'generate';
  assetIds: string[];
  total: number;
  createdAt: string;
  completedAt?: string;
  modelId?: string;
  resolution?: string;
  completed?: number;
  succeeded?: number;
  failed?: number;
  isComplete?: boolean;
}

/** 读取 tasks.json 中所有批次任务 */
export async function readTasksFile(name: string): Promise<BatchTask[]> {
  const filePath = path.join(NOVELS_DIR, safeName(name), 'seedance', 'tasks.json');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

/** 写入 tasks.json（全量覆盖） */
export async function writeTasksFile(name: string, tasks: BatchTask[]): Promise<void> {
  const dir = path.join(NOVELS_DIR, safeName(name), 'seedance');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'tasks.json'), JSON.stringify(tasks, null, 2), 'utf-8');
}

/** 新增一条批次任务记录 */
export async function saveBatchTask(name: string, task: BatchTask): Promise<void> {
  const tasks = await readTasksFile(name);
  tasks.push(task);
  await writeTasksFile(name, tasks);
}

/** 根据 batchId 查询批次任务 */
export async function getBatchTask(name: string, batchId: string): Promise<BatchTask | null> {
  const tasks = await readTasksFile(name);
  return tasks.find(t => t.batchId === batchId) ?? null;
}

/** 更新批次任务（按 batchId 匹配） */
export async function updateBatchTask(name: string, batchId: string, partial: Partial<BatchTask>): Promise<void> {
  const tasks = await readTasksFile(name);
  const index = tasks.findIndex(t => t.batchId === batchId);
  if (index !== -1) {
    tasks[index] = { ...tasks[index], ...partial };
    await writeTasksFile(name, tasks);
  }
}

// ============ 美术模板管理 ============

/** 读取美术风格目录列表 */
export async function getArtStyles(): Promise<string[]> {
  const stylesDir = path.join(SKILLS_DIR, 'art-styles');
  try {
    const entries = await fs.readdir(stylesDir, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}

/** 读取指定美术风格的模板文件内容 */
export async function getArtTemplate(
  style: string,
  templateName: string
): Promise<string> {
  const safeStyle = safeName(style);
  const safeTpl = safeName(templateName);
  const styleRoot = path.join(SKILLS_DIR, 'art-styles', safeStyle);
  const candidates = [
    path.join(styleRoot, safeTpl),
    path.join(styleRoot, 'art_prompt', safeTpl),
    path.join(styleRoot, 'director_skills', safeTpl),
  ];

  if (safeTpl === 'director_storyboard_style.md') {
    candidates.push(path.join(styleRoot, 'director_skills', 'director_storyboard_table_style.md'));
  }

  for (const filePath of candidates) {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      // try next location
    }
  }

  throw new Error(`美术模板不存在：skills/art-styles/${safeStyle}/${safeTpl}`);
}

// ============ 管线状态检测 ============

/** 管线各节点状态 */
export interface PipelineStatus {
  director: 'pending' | 'running' | 'completed';
  assets: 'pending' | 'partial' | 'completed';
  directorPlan: 'pending' | 'running' | 'completed';
  storyboardTable: 'pending' | 'running' | 'completed';
  prompts: 'pending' | 'running' | 'completed';
  videos: 'pending' | 'partial' | 'completed';
}

/** 辅助：判断文件是否存在 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** 辅助：检测视频目录状态 */
async function checkVideoStatus(videosDir: string): Promise<'pending' | 'partial' | 'completed'> {
  try {
    const entries = await fs.readdir(videosDir);
    if (entries.includes('video-tasks.json')) {
      try {
        const tasks = JSON.parse(await fs.readFile(path.join(videosDir, 'video-tasks.json'), 'utf-8')) as Array<{ status?: string }>;
        if (tasks.length > 0 && tasks.every((task) => task.status === 'success')) return 'completed';
        if (tasks.some((task) => task.status === 'success' || task.status === 'running')) return 'partial';
      } catch {
        // fall back to checking video files
      }
    }
    const videoFiles = entries.filter(f => f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mov'));
    if (videoFiles.length === 0) {
      const hasTaskManifest = entries.includes('video-tasks.json');
      return hasTaskManifest ? 'partial' : 'pending';
    }
    // 有视频文件但无法确定是否全部完成，标记为 partial
    // 如果目录中有 manifest 或其他完成标记，可改为 completed
    return 'partial';
  } catch {
    return 'pending';
  }
}

/** 辅助：检测资产状态（支持按集过滤） */
async function checkAssetStatus(name: string, episode?: number): Promise<'pending' | 'partial' | 'completed'> {
  try {
    let assets = await readAssetsFile(name);
    // 按集过滤：只检查属于当前集的资产
    if (episode) {
      const epKey = `ep${String(episode).padStart(2, '0')}`;
      assets = assets.filter(a =>
        (Array.isArray(a.episodeRefs) && a.episodeRefs.includes(epKey)) ||
        a.sourceEpisode === epKey
      );
    }
    if (assets.length === 0) return 'pending';
    const allSuccess = assets.every(a => a.state === 'success' && a.imagePath);
    if (allSuccess) return 'completed';
    const anySuccess = assets.some(a => a.state === 'success' && a.imagePath);
    if (anySuccess) return 'partial';
    // 有资产但都没生成图片
    return 'pending';
  } catch {
    return 'pending';
  }
}

/** 检测管线各节点状态 */
export async function detectPipelineStatus(
  name: string,
  episode: number
): Promise<PipelineStatus> {
  const safePrj = safeName(name);
  const epDir = path.join(NOVELS_DIR, safePrj, 'seedance', `ep${episode}`);

  const [directorExists, planExists, tableExists, promptsExists, videoStatus, assetStatus] =
    await Promise.all([
      fileExists(path.join(epDir, '01-director.md')),
      fileExists(path.join(epDir, 'director-plan.json')),
      fileExists(path.join(epDir, 'storyboard-table.json')),
      fileExists(path.join(epDir, '02-prompts.md')),
      checkVideoStatus(path.join(epDir, 'videos')),
      checkAssetStatus(safePrj, episode),
    ]);

  return {
    director: directorExists ? 'completed' : 'pending',
    assets: assetStatus,
    directorPlan: planExists ? 'completed' : 'pending',
    storyboardTable: tableExists ? 'completed' : 'pending',
    prompts: promptsExists ? 'completed' : 'pending',
    videos: videoStatus,
  };
}
