// runtime: nodejs
/**
 * Skill 加载层 — 扫描 /skills 目录，解析 frontmatter，提供按名/按 metaData/按画风/按故事类型加载能力。
 *
 * 设计要点：
 * - 启动时全量扫描，结果缓存到 Map<name, Skill>
 * - loadSkill 递归解析 depends_on（支持路径形式如 "shared/storyboard-prompt-techniques"）
 * - loadSkillPack 按画风/故事类型/阶段动态装配
 * - 路径越界保护：所有读文件前用 isPathInside 校验
 */

import matter from 'gray-matter';
import fg from 'fast-glob';
import isPathInside from 'is-path-inside';
import path from 'path';
import fs from 'fs/promises';

const SKILLS_ROOT = path.join(process.cwd(), '..', 'skills');

export interface SkillFrontmatter {
  name: string;
  version: string;
  description: string;
  metaData:
    | 'script_skills'
    | 'seedance_skills'
    | 'review_skills'
    | 'shared_skills'
    | 'asset_skills'
    | 'art_skills'
    | 'story_skills';
  depends_on: string[];
  output_tag?: string;
}

export interface Skill {
  frontmatter: SkillFrontmatter;
  body: string;
  /** 相对 SKILLS_ROOT，使用 posix 风格分隔（如 "shared/storyboard-prompt-techniques.md"） */
  filePath: string;
  /** 绝对路径，用于读资源文件 */
  absPath: string;
}

let _cache: Map<string, Skill> | null = null;

/** 把 fs.readFile 后的 frontmatter 强制转为 SkillFrontmatter（含字段补全） */
function normalizeFrontmatter(data: Record<string, unknown>): SkillFrontmatter | null {
  const name = data.name;
  const metaData = data.metaData;
  if (typeof name !== 'string' || !name) return null;
  if (typeof metaData !== 'string' || !metaData) return null;

  const depends_on: string[] = Array.isArray(data.depends_on)
    ? (data.depends_on as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];

  return {
    name,
    version: typeof data.version === 'string' ? data.version : '1.0.0',
    description: typeof data.description === 'string' ? data.description : '',
    metaData: metaData as SkillFrontmatter['metaData'],
    depends_on,
    output_tag: typeof data.output_tag === 'string' ? data.output_tag : undefined,
  };
}

/** 全量扫描 /skills/**\/*.md，缓存到内存 Map */
export async function loadAllSkills(): Promise<Map<string, Skill>> {
  if (_cache) return _cache;

  const cache = new Map<string, Skill>();
  // 路径用 posix 风格供 fast-glob 使用
  const pattern = path.posix.join(SKILLS_ROOT.split(path.sep).join('/'), '**', '*.md');
  const files = await fg(pattern, { onlyFiles: true, absolute: true });

  for (const absPath of files) {
    if (!isPathInside(absPath, SKILLS_ROOT) && absPath !== SKILLS_ROOT) continue;
    let raw = '';
    try {
      raw = await fs.readFile(absPath, 'utf8');
    } catch {
      continue;
    }
    let parsed;
    try {
      parsed = matter(raw);
    } catch {
      continue;
    }
    const fm = normalizeFrontmatter(parsed.data || {});
    if (!fm) continue;
    const rel = path.relative(SKILLS_ROOT, absPath).split(path.sep).join('/');
    cache.set(fm.name, {
      frontmatter: fm,
      body: parsed.content,
      filePath: rel,
      absPath,
    });
  }

  _cache = cache;
  return cache;
}

/** 按名加载主 Skill + 递归解析 depends_on */
export async function loadSkill(name: string): Promise<{ main: Skill; resolved: Skill[] }> {
  const all = await loadAllSkills();
  const main = all.get(name);
  if (!main) {
    throw new Error(`Skill 未找到：${name}`);
  }

  const resolved: Skill[] = [];
  const visited = new Set<string>([name]);

  /** 把 depends_on 的字符串解析成 Skill name；支持 "shared/foo" 形式 → 末段做 name */
  function depToName(dep: string): string {
    if (dep.includes('/')) {
      const parts = dep.split('/');
      return parts[parts.length - 1];
    }
    return dep;
  }

  function resolveDeps(skill: Skill) {
    for (const dep of skill.frontmatter.depends_on) {
      const depName = depToName(dep);
      if (visited.has(depName)) continue;
      const depSkill = all.get(depName);
      if (!depSkill) {
        // 找不到依赖的 skill 时跳过，不阻塞主流程
        visited.add(depName);
        continue;
      }
      visited.add(depName);
      resolved.push(depSkill);
      resolveDeps(depSkill);
    }
  }

  resolveDeps(main);
  return { main, resolved };
}

/** 按 metaData 标签筛选 */
export async function listSkillsByMeta(tag: SkillFrontmatter['metaData']): Promise<Skill[]> {
  const all = await loadAllSkills();
  return [...all.values()].filter((s) => s.frontmatter.metaData === tag);
}

/** description 中文画风名 → 目录名映射 */
export function mapArtStyleToDir(text: string): string | null {
  if (!text) return null;
  const t = text.trim();
  // 顺序：长 / 更具体在前
  if (t.includes('3D国漫') || t.includes('3D 国漫')) return '3D_chinese_traditional';
  if (t.includes('3D动画') || t.includes('3D 动画')) return '3D_anime_render';
  if (t.includes('黏土定格') || t.includes('粘土定格')) return '3D_clay_stopmotion';
  if (t.includes('国风二次元')) return '2D_chinese_guofeng';
  if (t.includes('90年代日漫') || t.includes('90 年代日漫') || t.includes('九十年代日漫')) {
    return '2D_90s_japanese_anime';
  }
  if (t.includes('平面设计')) return '2D_flat_design';
  if (t.includes('都市言情写实2D') || t.includes('都市言情写实 2D')) return '2D_mature_urban_romance';
  if (t.includes('古装真人')) return 'realpeople_ancient_chinese';
  if (t.includes('都市真人')) return 'realpeople_urban_modern';
  return null;
}

/** description 中文小说类型 → 目录名映射 */
export function mapStoryGenreToDir(text: string): string | null {
  if (!text) return null;
  const t = text.trim();
  if (t.includes('甜宠') || t.includes('言情')) return 'Sweet_romance_novel';
  if (t.includes('仙侠') || t.includes('玄幻') || t.includes('修仙')) return 'Xianxia_fantasy';
  if (t.includes('都市') || t.includes('职场')) return 'Urban_workplace_drama';
  if (t.includes('热血') || t.includes('动作')) return 'Hot_blooded_action';
  if (t.includes('悬疑') || t.includes('推理')) return 'Mystery_thriller';
  if (t.includes('恐怖') || t.includes('灵异')) return 'Horror_supernatural';
  if (t.includes('喜剧') || t.includes('搞笑')) return 'Comedy_humor';
  if (t.includes('家庭') || t.includes('亲情')) return 'Family_warmth';
  if (t.includes('青春') || t.includes('校园') || t.includes('成长')) return 'Coming_of_age';
  if (t.includes('历史') || t.includes('古风')) return 'Historical_epic';
  if (t.includes('心理')) return 'Psychological_drama';
  if (t.includes('科幻') || t.includes('末日')) return 'Scifi_post_apocalypse';
  return null;
}

/** 安全读取 SKILLS_ROOT 下的相对路径文件，越界返回 null */
async function safeReadFile(absPath: string): Promise<string | null> {
  if (!isPathInside(absPath, SKILLS_ROOT)) return null;
  try {
    return await fs.readFile(absPath, 'utf8');
  } catch {
    return null;
  }
}

/** 列出某个目录下所有 .md 文件的 { name, content }，按文件名排序 */
async function listMdFiles(dirAbs: string): Promise<Array<{ name: string; content: string }>> {
  if (!isPathInside(dirAbs, SKILLS_ROOT)) return [];
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dirAbs);
  } catch {
    return [];
  }
  const mdFiles = entries.filter((f) => f.endsWith('.md')).sort();
  const out: Array<{ name: string; content: string }> = [];
  for (const f of mdFiles) {
    const abs = path.join(dirAbs, f);
    const raw = await safeReadFile(abs);
    if (raw == null) continue;
    // 去 frontmatter 后的正文
    let content = raw;
    try {
      const parsed = matter(raw);
      content = parsed.content;
    } catch {
      // 解析失败用原文
    }
    out.push({ name: f.replace(/\.md$/, ''), content });
  }
  return out;
}

export interface SkillPack {
  prefix: string;
  artPromptResources: Array<{ name: string; content: string }>;
  artDirectorResources: Array<{ name: string; content: string }>;
  storyDirectorResources: Array<{ name: string; content: string }>;
}

/**
 * 按画风+故事类型+阶段加载资源包
 * - artStyle / storyGenre 已是目录名（用 mapArtStyleToDir / mapStoryGenreToDir 转换）
 * - stage:
 *   - 'B' → 仅返回 art_prompt 资源
 *   - 'C1' / 'C2' / 'C3' → 同时返回画风 director_skills + 故事类型 director_skills
 */
export async function loadSkillPack(opts: {
  artStyle?: string;
  storyGenre?: string;
  stage?: 'B' | 'C1' | 'C2' | 'C3';
}): Promise<SkillPack> {
  const result: SkillPack = {
    prefix: '',
    artPromptResources: [],
    artDirectorResources: [],
    storyDirectorResources: [],
  };

  if (opts.artStyle) {
    const styleDir = path.join(SKILLS_ROOT, 'art-styles', opts.artStyle);
    // prefix
    const prefixAbs = path.join(styleDir, 'prefix.md');
    const prefixRaw = await safeReadFile(prefixAbs);
    if (prefixRaw) {
      try {
        result.prefix = matter(prefixRaw).content;
      } catch {
        result.prefix = prefixRaw;
      }
    }
    // 阶段 B：art_prompt
    if (opts.stage === 'B') {
      result.artPromptResources = await listMdFiles(path.join(styleDir, 'art_prompt'));
    }
    // 阶段 C1/C2/C3：director_skills
    if (opts.stage === 'C1' || opts.stage === 'C2' || opts.stage === 'C3') {
      result.artDirectorResources = await listMdFiles(path.join(styleDir, 'director_skills'));
    }
  }

  if (opts.storyGenre && (opts.stage === 'C1' || opts.stage === 'C2' || opts.stage === 'C3')) {
    const genreDir = path.join(SKILLS_ROOT, 'story-genres', opts.storyGenre, 'director_skills');
    result.storyDirectorResources = await listMdFiles(genreDir);
  }

  return result;
}

/** 开发模式 hot reload 用：清缓存 */
export function invalidateCache(): void {
  _cache = null;
}
