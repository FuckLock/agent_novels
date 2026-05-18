/**
 * 剧本文本资产自动提取工具函数
 * 从剧本纯文本中提取角色、场景、道具，并与 outline.json 交叉验证合并
 */
import { LinkedAssetsData, OutlineEpisode } from '../types';

/** 非具名角色过滤前缀 */
const FILTER_PREFIXES = ['若干', '等', '众', '数', '几', '一群', '一帮', '路人'];

/** 台词行排除关键词（避免误匹配场景描述中的冒号用法） */
const EXCLUDE_NAMES = ['时间', '地点', '场景', '天气', '音效', '备注', '画面', '人物'];

/**
 * 从剧本文本行中提取角色名
 */
function extractCharacters(lines: string[]): string[] {
  const characters = new Set<string>();

  const personLineRegex = /^人物[：:]\s*(.+)$/;
  const dialogueRegex = /^([^\s（(△※$【][^：:（(]{0,5})[：:](?!\/)/;

  for (const line of lines) {
    const trimmed = line.trim();

    // 规则 1：人物行
    const personMatch = trimmed.match(personLineRegex);
    if (personMatch) {
      const names = personMatch[1].split(/[、，,\s]+/);
      for (const name of names) {
        const cleaned = name.trim();
        if (cleaned && !FILTER_PREFIXES.some(p => cleaned.startsWith(p))) {
          characters.add(cleaned);
        }
      }
      continue;
    }

    // 规则 2：台词行（名字：台词）
    const dialogueMatch = trimmed.match(dialogueRegex);
    if (dialogueMatch) {
      const name = dialogueMatch[1].trim();
      // 排除场景标题行（如 "S01 xxx 日:晴"）和排除关键词
      if (
        !name.match(/^S?\d+\s/) &&
        name.length >= 1 &&
        name.length <= 6 &&
        !EXCLUDE_NAMES.includes(name)
      ) {
        characters.add(name);
      }
    }
  }

  return Array.from(characters);
}

/**
 * 从剧本文本行中提取场景名
 */
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

/**
 * 从剧本△动作行中匹配已知道具名
 */
function extractProps(lines: string[], knownProps: string[]): string[] {
  if (knownProps.length === 0) return [];

  const found = new Set<string>();

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

/**
 * 从 OutlineEpisode 的 item 中提取名称字符串
 */
function getItemName(item: string | { name: string; description?: string }): string {
  return typeof item === 'string' ? item : item.name;
}

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
): LinkedAssetsData {
  const lines = scriptContent.split('\n');

  // 构建已知道具词典（所有集合并去重）
  const knownProps: string[] = [];
  if (allOutlineEpisodes) {
    const propSet = new Set<string>();
    for (const ep of allOutlineEpisodes) {
      for (const p of ep.props || []) {
        propSet.add(getItemName(p));
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
      outlineCharacters.push(getItemName(c));
    }
    for (const s of episodeOutline.scenes || []) {
      outlineScenes.push(getItemName(s));
    }
    for (const p of episodeOutline.props || []) {
      outlineProps.push(getItemName(p));
    }
  }

  // Step 3: 合并去重（文本提取 + outline 补充）
  return {
    characters: [...new Set([...textCharacters, ...outlineCharacters])],
    scenes: [...new Set([...textScenes, ...outlineScenes])],
    props: [...new Set([...textProps, ...outlineProps])],
    costumes: [],
    makeup: [],
  };
}
