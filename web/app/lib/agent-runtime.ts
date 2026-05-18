// runtime: nodejs
/**
 * Agent 运行时层 — 加载 /agents/<name>.md，组装 system+user prompt，调模型流。
 *
 * 设计要点：
 * - 一次性预组装 prompt（不走 agentic loop）
 * - 解析 packet → resolveStageForAgent → resolveModel
 * - 加载主 Skill + depends_on + 画风/故事类型包（按 stage）
 * - 流式 yield text 事件，结束时 extractXml + extractMeta 返回业务正文
 * - 内置 createThinkStreamFilter 剥离 <think> 块
 */

import matter from 'gray-matter';
import path from 'path';
import fs from 'fs/promises';
import {
  loadSkill,
  loadSkillPack,
  mapArtStyleToDir,
  mapStoryGenreToDir,
  type Skill,
  type SkillPack,
} from './skill-loader';
import { resolveModel, callModelStream } from './agent/stream-model';
import { stripThink, createThinkStreamFilter } from './agent/strip-think';
import { extractXml, extractMeta, type AgentMeta } from './xml-utils';

const AGENTS_ROOT = path.join(process.cwd(), '..', 'agents');
const NOVELS_ROOT = path.join(process.cwd(), '..', 'novels');

export interface AgentFrontmatter {
  name: string;
  version: string;
  description: string;
  skills: string[];
  attached_skills: string[];
  tools: string[];
  color: string;
  memory?: string;
}

export interface AgentConfig {
  frontmatter: AgentFrontmatter;
  body: string;
}

export interface AgentPacket {
  projectName: string;
  action?: string;
  episode?: number;
  mode?: 'full' | 'extend' | 'revise_episode' | 'revise_global' | 'rewrite_episode';
  range?: [number, number];
  history?: { role: string; content: string }[];
  modelOverride?: string;
  /** 用于 Seedance 链阶段细分（B/C1/C2/C3） */
  stage?: string;
  [k: string]: unknown;
}

export interface RunAgentResult {
  status: 'passed' | 'stage1_blocked' | 'stage2_blocked' | 'skill_failed';
  stage_reached: number;
  failure_count: { critical: number; high: number; medium: number };
  /** extractXml(raw, output_tag) 提取的业务正文 */
  output: string;
  /** LLM 完整返回（已剥离 think） */
  raw: string;
}

/** agent-runtime 内部事件类型 — 不混入 SSEEvent */
export type RuntimeEvent =
  | { type: 'status'; data: string }
  | { type: 'text'; data: string }
  | { type: 'done'; result: RunAgentResult };

/** 加载 /agents/<name>.md，解析 frontmatter + body */
export async function loadAgent(name: string): Promise<AgentConfig> {
  const abs = path.join(AGENTS_ROOT, `${name}.md`);
  const raw = await fs.readFile(abs, 'utf8');
  const parsed = matter(raw);
  const data = parsed.data || {};

  const frontmatter: AgentFrontmatter = {
    name: typeof data.name === 'string' ? data.name : name,
    version: typeof data.version === 'string' ? data.version : '1.0.0',
    description: typeof data.description === 'string' ? data.description : '',
    skills: Array.isArray(data.skills)
      ? (data.skills as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
    attached_skills: Array.isArray(data.attached_skills)
      ? (data.attached_skills as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
    tools: Array.isArray(data.tools)
      ? (data.tools as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
    color: typeof data.color === 'string' ? data.color : 'gray',
    memory: typeof data.memory === 'string' ? data.memory : undefined,
  };

  return { frontmatter, body: parsed.content };
}

/** Agent → stage 静态映射 + action 分流（参考计划 §3.2） */
const STAGE_MAP: Record<string, string | ((action?: string) => string)> = {
  'scriptAgent-main': 'chat',
  'scriptAgent-skeleton': 'storyline',
  'scriptAgent-adaptation': 'outline',
  'scriptAgent-script': 'script',
  'scriptAgent-supervisor': (a) =>
    a === 'review_skeleton'
      ? 'review-storyline'
      : a === 'review_adaptation'
        ? 'review-outline'
        : a === 'review_script'
          ? 'review-script'
          : 'review',
  'seedance-main': (a) => a || 'seedance-main',
  director: (a) => (a === 'analyze' ? 'seedance-director' : 'review'),
  'storyboard-artist': 'seedance-storyboard',
};

export function resolveStageForAgent(agentName: string, action?: string, packetStage?: string): string {
  if (agentName === 'seedance-main') {
    const stage = packetStage || action;
    if (stage === 'B' || stage === 'asset' || stage === 'seedance-asset') return 'seedance-asset';
    if (stage === 'C1' || stage === 'director-plan' || stage === 'seedance-director-plan') return 'seedance-director-plan';
    if (stage === 'C2' || stage === 'storyboard-table' || stage === 'seedance-storyboard-table') return 'seedance-storyboard-table';
    if (stage === 'C3' || stage === 'storyboard-prompt' || stage === 'seedance-storyboard') return 'seedance-storyboard';
    if (stage === 'D' || stage === 'video' || stage === 'seedance-video') return 'seedance-video';
    return 'seedance-main';
  }

  const entry = STAGE_MAP[agentName];
  if (typeof entry === 'function') return entry(action);
  if (typeof entry === 'string') return entry;
  return 'chat';
}

function selectMainSkill(agentName: string, packet: AgentPacket, skills: string[]): string | null {
  if (skills.length === 0) return null;

  if (agentName === 'seedance-main') {
    const stage = packet.stage || packet.action;
    if ((stage === 'B' || stage === 'asset' || stage === 'seedance-asset') && skills.includes('seedance-asset')) {
      return 'seedance-asset';
    }
    if (
      (stage === 'C1' || stage === 'director-plan' || stage === 'seedance-director-plan') &&
      skills.includes('seedance-director-plan')
    ) {
      return 'seedance-director-plan';
    }
    if (
      (stage === 'C2' || stage === 'storyboard-table' || stage === 'seedance-storyboard-table') &&
      skills.includes('seedance-storyboard-table')
    ) {
      return 'seedance-storyboard-table';
    }
    if (
      (stage === 'C3' || stage === 'storyboard-prompt' || stage === 'seedance-storyboard') &&
      skills.includes('seedance-storyboard-prompt')
    ) {
      return 'seedance-storyboard-prompt';
    }
    if ((stage === 'D' || stage === 'video' || stage === 'seedance-video') && skills.includes('seedance-video')) {
      return 'seedance-video';
    }
  }

  return skills[0];
}

/** Seedance / 剧本链 stage 推断 — 用于 loadSkillPack 选择资源 */
function inferSkillPackStage(agentName: string, packet: AgentPacket): 'B' | 'C1' | 'C2' | 'C3' | undefined {
  // 优先信任 packet.stage
  if (packet.stage === 'B' || packet.stage === 'C1' || packet.stage === 'C2' || packet.stage === 'C3') {
    return packet.stage;
  }
  // 剧本链：复用故事类型 director_skills（C 阶段）
  if (
    agentName === 'scriptAgent-skeleton' ||
    agentName === 'scriptAgent-adaptation' ||
    agentName === 'scriptAgent-script'
  ) {
    return 'C1';
  }
  // Seedance 链
  if (agentName === 'seedance-main') {
    if (packet.action === 'asset' || packet.action === 'seedance-asset') return 'B';
    if (packet.action === 'director-plan' || packet.action === 'seedance-director-plan') return 'C1';
    if (packet.action === 'storyboard-table' || packet.action === 'seedance-storyboard-table') return 'C2';
    if (packet.action === 'storyboard-prompt' || packet.action === 'seedance-storyboard') return 'C3';
    return 'C1';
  }
  if (agentName === 'director') {
    return packet.action === 'analyze' ? 'C1' : undefined;
  }
  if (agentName === 'storyboard-artist') {
    return 'C3';
  }
  return undefined;
}

/** 从项目 description 中读取画风/故事类型 */
async function readArtAndGenre(projectName: string): Promise<{ artStyle?: string; storyGenre?: string }> {
  const descPath = path.join(NOVELS_ROOT, projectName, 'description');
  let raw = '';
  try {
    raw = await fs.readFile(descPath, 'utf8');
  } catch {
    return {};
  }
  // 简单正则提取
  const styleMatch = raw.match(/影片画风[:：]\s*(.+)/);
  const genreMatch = raw.match(/小说类型[:：]\s*(.+)/);
  const artStyleText = styleMatch?.[1]?.trim();
  const storyGenreText = genreMatch?.[1]?.trim();
  return {
    artStyle: artStyleText ? mapArtStyleToDir(artStyleText) || undefined : undefined,
    storyGenre: storyGenreText ? mapStoryGenreToDir(storyGenreText) || undefined : undefined,
  };
}

/** 序列化 packet 成人类可读"任务描述"（不直接 JSON.stringify） */
function buildUserPrompt(packet: AgentPacket): string {
  const parts: string[] = [];
  parts.push(`# 任务上下文`);
  parts.push(`- 项目名称：${packet.projectName}`);
  if (packet.action) parts.push(`- 动作：${packet.action}`);
  if (packet.episode != null) parts.push(`- 集数：${packet.episode}`);
  if (packet.mode) parts.push(`- 模式：${packet.mode}`);
  if (packet.range) parts.push(`- 范围：${packet.range[0]} - ${packet.range[1]}`);
  if (packet.stage) parts.push(`- 阶段：${packet.stage}`);

  // 其他自定义字段（排除已展示的 + 内部字段）
  const omit = new Set([
    'projectName',
    'action',
    'episode',
    'mode',
    'range',
    'stage',
    'history',
    'modelOverride',
  ]);
  const extras: string[] = [];
  for (const [k, v] of Object.entries(packet)) {
    if (omit.has(k)) continue;
    if (v == null) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      extras.push(`- ${k}: ${v}`);
    } else {
      try {
        extras.push(`- ${k}: ${JSON.stringify(v)}`);
      } catch {
        // 忽略不可序列化字段
      }
    }
  }
  if (extras.length > 0) {
    parts.push(`\n## 附加参数`);
    parts.push(...extras);
  }

  return parts.join('\n');
}

/** 把 history 转为 message 格式（仅 chat 类 Agent 用） */
function historyToMessages(history?: { role: string; content: string }[]): { role: string; content: string }[] {
  if (!history || history.length === 0) return [];
  return history
    .filter((m) => m && typeof m.role === 'string' && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content }));
}

/** 拼装 system prompt — 主分支：Agent.body + 主 Skill + depends + 画风/故事类型 */
function assembleSystemPrompt(args: {
  agent: AgentConfig;
  mainSkill: Skill | null;
  resolvedDeps: Skill[];
  pack: SkillPack | null;
  stage?: 'B' | 'C1' | 'C2' | 'C3';
}): string {
  const { agent, mainSkill, resolvedDeps, pack, stage } = args;
  const sections: string[] = [];

  sections.push(agent.body.trim());

  if (mainSkill) {
    sections.push(`---\n\n## 主技能（${mainSkill.frontmatter.name}）\n\n${mainSkill.body.trim()}`);
  }

  if (resolvedDeps.length > 0) {
    const depBodies = resolvedDeps
      .map((s) => `### ${s.frontmatter.name}\n\n${s.body.trim()}`)
      .join('\n\n');
    sections.push(`---\n\n## 共享技法\n\n${depBodies}`);
  }

  if (pack?.prefix) {
    sections.push(`---\n\n## 画风全局基础\n\n${pack.prefix.trim()}`);
  }

  if (stage === 'B' && pack?.artPromptResources && pack.artPromptResources.length > 0) {
    const body = pack.artPromptResources
      .map((r) => `### ${r.name}\n\n${r.content.trim()}`)
      .join('\n\n');
    sections.push(`---\n\n## 画风专属资源（资产阶段）\n\n${body}`);
  }

  if (
    (stage === 'C1' || stage === 'C2' || stage === 'C3') &&
    pack?.artDirectorResources &&
    pack.artDirectorResources.length > 0
  ) {
    const body = pack.artDirectorResources
      .map((r) => `### ${r.name}\n\n${r.content.trim()}`)
      .join('\n\n');
    sections.push(`---\n\n## 画风专属资源（导演阶段）\n\n${body}`);
  }

  if (
    (stage === 'C1' || stage === 'C2' || stage === 'C3') &&
    pack?.storyDirectorResources &&
    pack.storyDirectorResources.length > 0
  ) {
    const body = pack.storyDirectorResources
      .map((r) => `### ${r.name}\n\n${r.content.trim()}`)
      .join('\n\n');
    sections.push(`---\n\n## 故事类型叙事手法\n\n${body}`);
  }

  return sections.join('\n\n');
}

/** scriptAgent-main 的 action → output_tag 映射 */
function getMainAgentOutputTag(action?: string): string {
  if (action === 'extract_params') return 'extracted_params';
  return 'chat_response';
}

/** 失败时构造一个 RunAgentResult */
function buildFailedResult(rawError: string): RunAgentResult {
  return {
    status: 'skill_failed',
    stage_reached: 0,
    failure_count: { critical: 1, high: 0, medium: 0 },
    output: '',
    raw: rawError,
  };
}

/** 流式运行 Agent */
export async function* runAgent(params: {
  agentName: string;
  packet: AgentPacket;
  signal?: AbortSignal;
}): AsyncGenerator<RuntimeEvent> {
  const { agentName, packet, signal } = params;

  // 顶层 try-catch，运行时异常都转 done(skill_failed)
  let agent: AgentConfig;
  try {
    agent = await loadAgent(agentName);
  } catch (err) {
    yield {
      type: 'done',
      result: buildFailedResult(`加载 Agent 失败：${err instanceof Error ? err.message : String(err)}`),
    };
    return;
  }

  // 基础 packet 校验
  if (!packet.projectName) {
    yield {
      type: 'done',
      result: buildFailedResult('packet.projectName 必传'),
    };
    return;
  }

  // 模型解析
  const stageKey = resolveStageForAgent(agentName, packet.action, packet.stage);
  let model;
  try {
    model = await resolveModel(stageKey, packet.modelOverride);
  } catch (err) {
    yield {
      type: 'done',
      result: buildFailedResult(`模型解析失败：${err instanceof Error ? err.message : String(err)}`),
    };
    return;
  }

  // 主 Skill 加载（skills=[] 跳过）
  let mainSkill: Skill | null = null;
  let resolvedDeps: Skill[] = [];
  const selectedSkill = selectMainSkill(agentName, packet, agent.frontmatter.skills);
  if (selectedSkill) {
    try {
      const { main, resolved } = await loadSkill(selectedSkill);
      mainSkill = main;
      resolvedDeps = resolved;
    } catch (err) {
      yield {
        type: 'done',
        result: buildFailedResult(
          `主 Skill 加载失败（${selectedSkill}）：${err instanceof Error ? err.message : String(err)}`,
        ),
      };
      return;
    }
  }

  // 画风/故事类型包（Seedance 链 + 剧本链含 storyGenre）
  const skillPackStage = inferSkillPackStage(agentName, packet);
  let pack: SkillPack | null = null;
  if (skillPackStage) {
    try {
      const { artStyle, storyGenre } = await readArtAndGenre(packet.projectName);
      if (artStyle || storyGenre) {
        pack = await loadSkillPack({ artStyle, storyGenre, stage: skillPackStage });
      }
    } catch {
      // 包加载失败不阻塞，prompt 退化到无画风
      pack = null;
    }
  }

  // 组装 system prompt
  const systemPrompt = assembleSystemPrompt({
    agent,
    mainSkill,
    resolvedDeps,
    pack,
    stage: skillPackStage,
  });

  // 拼 user prompt
  const userPrompt = buildUserPrompt(packet);
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt },
  ];
  // 注入 history（主要给 chat 类 Agent 用）
  const histMessages = historyToMessages(packet.history);
  if (histMessages.length > 0) {
    messages.push(...histMessages);
  }
  messages.push({ role: 'user', content: userPrompt });

  // 状态事件
  const modelLabel = (model as { name?: string }).name || (model as { modelId?: string }).modelId || 'model';
  const apiModel = ((model as { defaultParams?: Record<string, unknown> }).defaultParams?.model as string | undefined)
    || (model as { modelId?: string }).modelId
    || 'model';
  yield { type: 'status', data: `正在调用 ${agentName}（${modelLabel} / ${apiModel}）...` };

  // 流式调用 + think 过滤
  const thinkFilter = createThinkStreamFilter();
  let raw = '';

  try {
    for await (const chunk of callModelStream(model, messages, signal)) {
      const filtered = thinkFilter.push(chunk);
      if (filtered) {
        raw += filtered;
        yield { type: 'text', data: filtered };
      }
    }
    const tail = thinkFilter.flush();
    if (tail) {
      raw += tail;
      yield { type: 'text', data: tail };
    }
  } catch (err) {
    yield {
      type: 'done',
      result: buildFailedResult(`模型调用失败：${err instanceof Error ? err.message : String(err)}`),
    };
    return;
  }

  // 输出 tag 解析
  let outputTag: string | undefined;
  if (mainSkill && mainSkill.frontmatter.output_tag) {
    outputTag = mainSkill.frontmatter.output_tag;
  } else if (agentName === 'scriptAgent-main') {
    outputTag = getMainAgentOutputTag(packet.action);
  }

  let output = '';
  if (outputTag) {
    output = extractXml(raw, outputTag) ?? '';
  }
  const meta: AgentMeta = extractMeta(raw);

  // 容错：output 空但 raw 非空 → skill_failed
  let finalStatus = meta.status;
  let finalFailure = meta.failure_count;
  if (outputTag && !output && raw.trim().length > 0) {
    finalStatus = 'skill_failed';
    finalFailure = {
      critical: Math.max(finalFailure.critical, 1),
      high: finalFailure.high,
      medium: finalFailure.medium,
    };
  }

  yield {
    type: 'done',
    result: {
      status: finalStatus,
      stage_reached: meta.stage_reached,
      failure_count: finalFailure,
      output,
      raw,
    },
  };
}

/** 非流式版本（用于 extract_params 等短请求） */
export async function runAgentSync(params: {
  agentName: string;
  packet: AgentPacket;
  signal?: AbortSignal;
}): Promise<RunAgentResult> {
  let result: RunAgentResult | null = null;
  let raw = '';
  for await (const ev of runAgent(params)) {
    if (ev.type === 'text') {
      raw += ev.data;
    } else if (ev.type === 'done') {
      result = ev.result;
    }
  }
  if (!result) {
    return buildFailedResult('runAgent 未产出 done 事件');
  }
  // 万一 result.raw 因异常路径为空，补上 stripThink 后的累计 raw
  if (!result.raw && raw) {
    return { ...result, raw: stripThink(raw) };
  }
  return result;
}
