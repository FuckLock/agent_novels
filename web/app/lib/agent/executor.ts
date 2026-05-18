import { SSEEvent, ProjectContext, IntentResult, ExecuteAction } from './types';
import { extractEpisode } from './decision';
import { runAgent, runAgentSync, type AgentPacket, type RunAgentResult } from '@/app/lib/agent-runtime';
import { extractXml, extractScriptItem } from '@/app/lib/xml-utils';
import {
  getGlobalSkeleton,
  getEpisodeSkeleton,
  updateGlobalSkeleton,
  updateEpisodeSkeleton,
  listEpisodeSkeletons,
  listEpisodeAdaptations,
  saveReviewResult,
  type ReviewResult,
  getGlobalAdaptation,
  getEpisodeAdaptation,
  updateGlobalAdaptation,
  updateEpisodeAdaptation,
  getContinuity,
  getChapters,
  getChapterContent,
  getProjectDescription,
  getOutline,
  getProjectConfig,
  updateProjectConfig,
  isConfigComplete,
  getReviewResult,
  getAllReviews,
  getReviewFixCount,
  incrementReviewFixCount,
  getChatHistory,
  appendChatMessage,
  getStoryline,
} from '@/app/lib/novels';
import {
  getLatestScriptContent as getScriptContent,
  listScriptVersions as getScripts,
  saveScriptVersion as updateScript,
} from '@/app/lib/server/script/script-service';
import { recordAgentRun } from '@/app/lib/server/agent/agent-run-service';
import {
  appendAgentConversation,
  getCombinedAdaptationPlan,
  getCombinedStoryOutline,
  getLatestAdaptationPlan,
  getLatestStoryOutline,
  saveAdaptationPlan,
  saveStoryOutline,
} from '@/app/lib/server/script/text-artifact-service';
import { recordQualityGateFromReview } from '@/app/lib/server/quality/quality-gate-service';

type SendFn = (event: SSEEvent) => void;

async function storyOutlineForAgent(name: string, episode?: number) {
  const globalContent = (await getLatestStoryOutline(name, 'global').catch(() => '')) || await getGlobalSkeleton(name).catch(() => '');
  if (episode) {
    const episodeContent = (await getLatestStoryOutline(name, 'episode', episode).catch(() => '')) || await getEpisodeSkeleton(name, episode).catch(() => '');
    return [
      globalContent ? `## 全局骨架\n\n${globalContent}` : '',
      episodeContent ? `## 第${episode}集骨架\n\n${episodeContent}` : '',
    ].filter(Boolean).join('\n\n---\n\n');
  }

  const combined = await getCombinedStoryOutline(name).catch(() => '');
  if (combined) return combined;
  const episodes = await listEpisodeSkeletons(name).catch(() => []);
  const parts = [globalContent];
  for (const item of episodes) {
    const content = await getEpisodeSkeleton(name, item.episode).catch(() => '');
    if (content) parts.push(`## 第${item.episode}集骨架\n\n${content}`);
  }
  return parts.filter(Boolean).join('\n\n---\n\n');
}

async function adaptationForAgent(name: string, episode?: number) {
  const globalContent = (await getLatestAdaptationPlan(name, 'global').catch(() => '')) || await getGlobalAdaptation(name).catch(() => '');
  if (episode) {
    const episodeContent = (await getLatestAdaptationPlan(name, 'episode', episode).catch(() => '')) || await getEpisodeAdaptation(name, episode).catch(() => '');
    return [
      globalContent ? `## 全局改编策略\n\n${globalContent}` : '',
      episodeContent ? `## 第${episode}集改编策略\n\n${episodeContent}` : '',
    ].filter(Boolean).join('\n\n---\n\n');
  }

  const combined = await getCombinedAdaptationPlan(name).catch(() => '');
  if (combined) return combined;
  const episodes = await listEpisodeAdaptations(name).catch(() => []);
  const parts = [globalContent];
  for (const item of episodes) {
    const content = await getEpisodeAdaptation(name, item.episode).catch(() => '');
    if (content) parts.push(`## 第${item.episode}集改编策略\n\n${content}`);
  }
  return parts.filter(Boolean).join('\n\n---\n\n');
}

function buildProgressSummary(
  ctx: {
    name: string;
    hasSkeleton: boolean;
    hasAdaptation: boolean;
    scriptCount: number;
    totalEpisodes: number;
  }
): string {
  const lines: string[] = [`**项目「${ctx.name}」当前进度：**\n`];

  lines.push(ctx.hasSkeleton ? '- 故事骨架：已完成' : '- 故事骨架：未生成');
  lines.push(ctx.hasAdaptation ? '- 改编策略：已完成' : '- 改编策略：未生成');

  if (ctx.totalEpisodes > 0) {
    lines.push(
      ctx.scriptCount >= ctx.totalEpisodes
        ? `- 剧本：全部完成（${ctx.scriptCount}/${ctx.totalEpisodes} 集）`
        : `- 剧本：${ctx.scriptCount}/${ctx.totalEpisodes} 集`
    );
  } else {
    lines.push(`- 剧本：${ctx.scriptCount} 集（总集数待定）`);
  }

  if (!ctx.hasSkeleton) {
    lines.push('\n建议下一步：输入「生成故事骨架」开始创作');
  } else if (!ctx.hasAdaptation) {
    lines.push('\n建议下一步：输入「生成改编策略」继续');
  } else if (ctx.scriptCount < ctx.totalEpisodes) {
    lines.push(`\n建议下一步：输入「写剧本」生成第 ${ctx.scriptCount + 1} 集`);
  } else {
    lines.push('\n所有阶段已完成。');
  }

  return lines.join('\n');
}

async function runAgentWithStream(
  send: SendFn,
  agentLabel: string,
  agentName: string,
  packet: AgentPacket,
  signal?: AbortSignal
): Promise<RunAgentResult> {
  let result: RunAgentResult | null = null;

  for await (const ev of runAgent({ agentName, packet, signal })) {
    if (ev.type === 'status') {
      send({ type: 'status', data: ev.data, agentLabel });
    } else if (ev.type === 'text') {
      send({ type: 'text', data: ev.data, agentLabel });
    } else if (ev.type === 'done') {
      result = ev.result;
    }
  }

  if (!result) {
    return {
      status: 'skill_failed',
      stage_reached: 0,
      failure_count: { critical: 1, high: 0, medium: 0 },
      output: '',
      raw: 'Agent 未返回结果',
    };
  }

  return result;
}

function agentBusinessText(result: RunAgentResult): string {
  return (result.output || result.raw || '').trim();
}

function shouldStopForAgentFailure(result: RunAgentResult): boolean {
  return result.status !== 'passed' && !result.output;
}

function parseJsonPayload(raw: string): Record<string, unknown> {
  let jsonStr = raw.trim();
  const fenced = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) jsonStr = fenced[1].trim();
  const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (braceMatch) jsonStr = braceMatch[0];
  return JSON.parse(jsonStr) as Record<string, unknown>;
}

function normalizeReview(raw: string) {
  const parsed = parseJsonPayload(raw);
  return {
    totalScore: Math.round(Number(parsed.totalScore || 0)),
    dimensions: Array.isArray(parsed.dimensions)
      ? parsed.dimensions.map((d) => {
        const item = d as { name?: string; weight?: number; score?: number; comment?: string };
        return {
          name: item.name || '',
          weight: Math.round(Number(item.weight || 0)),
          score: Math.round(Number(item.score || 0)),
          comment: item.comment || '',
        };
      })
      : [],
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : [],
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
  };
}

async function runSupervisorReview(
  projectName: string,
  action: 'review_skeleton' | 'review_adaptation' | 'review_storyline' | 'review_outline' | 'review_script',
  packet: Record<string, unknown>,
  modelOverride?: string
) {
  const result = await runAgentSync({
    agentName: 'scriptAgent-supervisor',
    packet: {
      projectName,
      action,
      ...packet,
      ...(modelOverride ? { modelOverride } : {}),
    },
  });

  const raw = agentBusinessText(result);
  if (!raw) {
    throw new Error(result.raw || '审核 Agent 未返回内容');
  }

  return normalizeReview(raw);
}

/** 执行闲聊 */
async function executeChat(
  send: SendFn,
  userMessage: string,
  ctx: ProjectContext,
  modelId?: string,
  signal?: AbortSignal
) {
  // 1. 从后端文件读取对话历史
  const chatHistory = await getChatHistory(ctx.name);
  const recentHistory = chatHistory
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content }));

  // 2. 保���当前用户消息到历史
  await appendChatMessage(ctx.name, 'user', userMessage);
  await appendAgentConversation(ctx.name, 'user', userMessage);

  // 3. 清洗历史中的模型身份信息，防止切换模型后被旧回复误导
  const MODEL_NAMES_RE = /\b(Claude|GPT-?[34o]?|Gemini|DeepSeek|Kimi|通义千问|文心一言|Opus|Sonnet|Haiku)\b/i;
  const cleanedHistory = recentHistory
    .map((m) => {
      if (m.role === 'assistant' && MODEL_NAMES_RE.test(m.content)) {
        const cleaned = m.content.replace(
          /(我是|I am|I'm)\s*[^\n。，]{0,30}(Claude|GPT-?[34o]?|Gemini|DeepSeek|Kimi|通义千问|文心一言|Opus|Sonnet|Haiku)[\w\s.]*(?=[。，\n]|$)/gi,
          '我是 Toonflow AI 助手'
        );
        return { ...m, content: cleaned };
      }
      return m;
    })
    // 过滤掉只包含模型名称的短回复（如纯 "Claude Opus 4.6"）
    .filter((m) => {
      if (m.role === 'assistant' && m.content.length < 20 && MODEL_NAMES_RE.test(m.content)) {
        return false;
      }
      return true;
    });

  send({ type: 'status', data: '正在思考...', agentLabel: '统筹' });

  const projectInfo = buildProgressSummary(ctx);
  const result = await runAgentSync({
    agentName: 'scriptAgent-main',
    packet: {
      projectName: ctx.name,
      action: 'chat',
      userMessage,
      projectInfo,
      hasConfig: ctx.hasConfig,
      config: ctx.config,
      description: ctx.description,
      history: cleanedHistory,
      ...(modelId ? { modelOverride: modelId } : {}),
    },
    signal,
  });
  const fullText = agentBusinessText(result);
  if (fullText) {
    send({ type: 'text', data: fullText, agentLabel: '统筹' });
  } else {
    send({ type: 'error', data: result.raw || '统筹 Agent 未返回内容' });
    return;
  }

  // 4. 保存 AI 回复到历史
  if (fullText.trim()) {
    await appendChatMessage(ctx.name, 'assistant', fullText);
    await appendAgentConversation(ctx.name, 'assistant', fullText);
  }

  // 检查 LLM 输出中是否包含项目配置（用户回答参数后 LLM 会提取并输出）
  const configXml = extractXml(fullText, 'projectConfig');
  if (configXml) {
    try {
      const config = JSON.parse(configXml);
      if (config.totalEpisodes && config.episodeDuration) {
        config.wordsPerEpisode = config.wordsPerEpisode || config.episodeDuration * 150;
        await updateProjectConfig(ctx.name, config);
        send({
          type: 'content_saved',
          data: JSON.stringify({ type: 'config' }),
        });
      }
    } catch {
      // 配置解析失败，忽略
    }
  }

  // 兜底：检查 AI 输出中是否包含生成内容标签，若有则保存到文件
  // 防止意图分类错误时内容丢失
  const scriptMatch = extractScriptItem(fullText);
  if (scriptMatch) {
    const ep = extractEpisode(userMessage) || extractEpisode(fullText) || ctx.scriptCount || 1;
    await updateScript(ctx.name, ep, scriptMatch.content);
    send({ type: 'content_saved', data: JSON.stringify({ type: 'script', episode: ep }) });
  } else {
    // 无 XML 标签时的额外兜底：检测剧本格式特征（场景标题行）
    const scriptLineMatch = fullText.match(/\n(\d+\s+.+\s+(?:日|夜|晨|黄昏)\/(?:内|外))/);
    if (scriptLineMatch && scriptLineMatch.index !== undefined) {
      const ep = extractEpisode(userMessage) || extractEpisode(fullText) || ctx.scriptCount || 1;
      const scriptContent = fullText.slice(scriptLineMatch.index).trim();
      await updateScript(ctx.name, ep, scriptContent);
      send({ type: 'content_saved', data: JSON.stringify({ type: 'script', episode: ep }) });
    }
  }

  // 骨架内容
  const globalSkel = extractXml(fullText, 'globalSkeleton') || extractXml(fullText, 'storySkeleton');
  if (globalSkel) {
    await updateGlobalSkeleton(ctx.name, globalSkel);
    await saveStoryOutline(ctx.name, { content: globalSkel, title: '全局故事骨架', scope: 'global' });
    send({ type: 'content_saved', data: JSON.stringify({ type: 'skeleton' }) });
  }

  // 改编策略
  const globalAdapt = extractXml(fullText, 'globalAdaptation') || extractXml(fullText, 'adaptationStrategy');
  if (globalAdapt) {
    await updateGlobalAdaptation(ctx.name, globalAdapt);
    await saveAdaptationPlan(ctx.name, { content: globalAdapt, title: '全局改编策略', scope: 'global' });
    send({ type: 'content_saved', data: JSON.stringify({ type: 'adaptation' }) });
  }
}

/** 从 description 自动推断配置参数 */
function inferConfigFromDescription(description: string): Partial<{ platform: string; style: string }> {
  const result: Partial<{ platform: string; style: string }> = {};

  // 影片比例 → platform
  if (description.includes('16:9')) result.platform = '横屏';
  else if (description.includes('9:16')) result.platform = '竖屏';

  // 小说类型 → style
  const typeMatch = description.match(/小说类型[:：]\s*(.+)/);
  if (typeMatch) result.style = typeMatch[1].trim();

  return result;
}

/** 执行配置参数收集（代码追踪状态，不靠 LLM 记忆） */
async function executeConfigCollection(
  send: SendFn,
  userMessage: string,
  ctx: ProjectContext,
  modelId?: string
) {
  // 1. 读取现有 partial config
  const existingConfig = await getProjectConfig(ctx.name) || {};

  // 2. 用 Agent 从用户当前消息中提取参数（单次提取，不依赖历史）
  const extractResult = await runAgentSync({
    agentName: 'scriptAgent-main',
    packet: {
      projectName: ctx.name,
      action: 'extract_params',
      userMessage,
      ...(modelId ? { modelOverride: modelId } : {}),
    },
  });
  const raw = agentBusinessText(extractResult);

  let extracted: Record<string, unknown> = {};
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
  } catch { /* 提取失败，继续 */ }

  // 3. 合并：现有 + 提取的（null 值不覆盖）
  const merged: Record<string, unknown> = { ...existingConfig };
  for (const [key, value] of Object.entries(extracted)) {
    if (value != null) merged[key] = value;
  }

  // 4. 从 description 自动填充
  const descInferred = inferConfigFromDescription(ctx.description);
  if (!merged.platform && descInferred.platform) merged.platform = descInferred.platform;
  if (!merged.style && descInferred.style) merged.style = descInferred.style;

  // 5. 自动计算 wordsPerEpisode
  if (merged.episodeDuration && !merged.wordsPerEpisode) {
    merged.wordsPerEpisode = (merged.episodeDuration as number) * 150;
  }

  // 6. 保存 partial config
  await updateProjectConfig(ctx.name, merged as Partial<import('@/app/lib/novels').ProjectConfig>);

  // 7. 检查缺失参数，用代码生成追问消息
  const PARAM_LABELS: Record<string, string> = {
    totalEpisodes: '总集数（拆分为几集）',
    episodeDuration: '每集时长（多少分钟）',
    chapterRange: '改编章节范围（如第1-10章）',
    platform: '平台规格（竖屏/横屏）',
    style: '风格定位（如甜宠、复仇、玄幻等）',
    paywall: '付费策略（如"全部免费"或"前3集免费，第4集起付费"）',
  };

  const missing: string[] = [];
  if (!merged.totalEpisodes) missing.push(PARAM_LABELS.totalEpisodes);
  if (!merged.episodeDuration) missing.push(PARAM_LABELS.episodeDuration);
  if (!merged.chapterRange) missing.push(PARAM_LABELS.chapterRange);
  if (!merged.platform) missing.push(PARAM_LABELS.platform);
  if (!merged.style) missing.push(PARAM_LABELS.style);
  if (!merged.paywall) missing.push(PARAM_LABELS.paywall);

  // 保存到对话历史
  await appendChatMessage(ctx.name, 'user', userMessage);

  if (missing.length === 0) {
    // 全部收齐
    const summary = `项目配置已完成：\n- 总集数：${merged.totalEpisodes}集\n- 每集时长：${merged.episodeDuration}分钟\n- 章节范围：第${(merged.chapterRange as number[])[0]}-${(merged.chapterRange as number[])[1]}章\n- 平台规格：${merged.platform}\n- 风格定位：${merged.style}\n- 付费策略：${merged.paywall}\n\n现在可以输入「生成故事骨架」开始创作。`;
    await appendChatMessage(ctx.name, 'assistant', summary);
    send({ type: 'text', data: summary, agentLabel: '统筹' });
    send({ type: 'content_saved', data: JSON.stringify({ type: 'config' }) });
  } else {
    // 列出已收集和缺失的
    const collected: string[] = [];
    if (merged.totalEpisodes) collected.push(`总集数：${merged.totalEpisodes}集`);
    if (merged.episodeDuration) collected.push(`每集时长：${merged.episodeDuration}分钟`);
    if (merged.chapterRange) collected.push(`章节范围：第${(merged.chapterRange as number[])[0]}-${(merged.chapterRange as number[])[1]}章`);
    if (merged.platform) collected.push(`平台规格：${merged.platform}`);
    if (merged.style) collected.push(`风格定位：${merged.style}`);
    if (merged.paywall) collected.push(`付费策略：${merged.paywall}`);

    let response = '';
    if (collected.length > 0) {
      response += `已记录：\n${collected.map(c => `- ${c}`).join('\n')}\n\n`;
    }
    response += `还需要以下参数：\n${missing.map((m, i) => `${i + 1}. **${m}**`).join('\n')}`;

    await appendChatMessage(ctx.name, 'assistant', response);
    send({ type: 'text', data: response, agentLabel: '统筹' });
  }
}

/** 执行生成故事骨架 */
async function executeSkeleton(
  send: SendFn,
  userMessage: string,
  ctx: ProjectContext,
  modelId?: string,
  signal?: AbortSignal
) {
  // 前置检查：项目配置
  const currentConfig = await getProjectConfig(ctx.name);
  if (!isConfigComplete(currentConfig)) {
    // 配置不完整，列出缺失参数
    const PARAM_LABELS: Record<string, string> = {
      totalEpisodes: '总集数（拆分为几集）',
      episodeDuration: '每集时长（多少分钟）',
      chapterRange: '改编章节范围（如第1-10章）',
      platform: '平台规格（竖屏/横屏）',
      style: '风格定位（如甜宠、复仇、玄幻等）',
      paywall: '付费策略（如"全部免费"或"前3集免费，第4集起付费"）',
    };

    // 先从 description 推断
    const descInferred = inferConfigFromDescription(ctx.description);
    const cfg = currentConfig || ({} as Record<string, unknown>);

    const missing: string[] = [];
    if (!cfg.totalEpisodes) missing.push(PARAM_LABELS.totalEpisodes);
    if (!cfg.episodeDuration) missing.push(PARAM_LABELS.episodeDuration);
    if (!cfg.chapterRange) missing.push(PARAM_LABELS.chapterRange);
    if (!cfg.platform && !descInferred.platform) missing.push(PARAM_LABELS.platform);
    if (!cfg.style && !descInferred.style) missing.push(PARAM_LABELS.style);
    if (!cfg.paywall) missing.push(PARAM_LABELS.paywall);

    const configPrompt = `在生成故事骨架之前，需要先确认项目参数。\n\n还缺以下参数：\n${missing.map((m, i) => `${i + 1}. **${m}**`).join('\n')}\n\n请告诉我这些参数，可以一次性回答。`;
    await appendChatMessage(ctx.name, 'user', userMessage);
    await appendChatMessage(ctx.name, 'assistant', configPrompt);
    send({ type: 'text', data: configPrompt, agentLabel: '统筹' });
    return;
  }

  // 前置检查：章节数据
  const chapters = await getChapters(ctx.name);
  if (chapters.length === 0) {
    send({
      type: 'text',
      data: '当前项目没有章节数据，无法生成故事骨架。请先确保小说文件已导入到项目中。',
      agentLabel: '统筹',
    });
    return;
  }

  send({ type: 'status', data: '正在生成故事骨架...', agentLabel: '编剧' });

  const description = await getProjectDescription(ctx.name).catch(() => '');

  // 确定要读取的章节范围
  const rangeStart = ctx.config?.chapterRange?.[0] ?? 1;
  const rangeEnd = ctx.config?.chapterRange?.[1] ?? chapters.length;

  // 读取章节内容（在配置范围内的章节）
  const chaptersWithContent: { index: number; title: string; content: string }[] = [];
  for (const ch of chapters) {
    const num = typeof ch === 'object' && 'number' in ch ? (ch as { number: number }).number : 0;
    const idx = num || (chapters.indexOf(ch) + 1);
    if (idx < rangeStart || idx > rangeEnd) continue;

    const title = typeof ch === 'string' ? ch : (ch as { title?: string }).title || `第${idx}章`;
    let content = '';
    try {
      content = await getChapterContent(ctx.name, idx);
    } catch {
      // 章节读取失败，跳过内容
    }
    chaptersWithContent.push({ index: idx, title, content });
  }

  const agentResult = await runAgentWithStream(
    send,
    '编剧',
    'scriptAgent-skeleton',
    {
      projectName: ctx.name,
      action: 'generate_skeleton',
      mode: 'full',
      range: [rangeStart, rangeEnd],
      userMessage,
      description,
      config: ctx.config,
      chapters: chaptersWithContent,
      ...(modelId ? { modelOverride: modelId } : {}),
    },
    signal
  );

  if (shouldStopForAgentFailure(agentResult)) {
    send({ type: 'text', data: agentResult.raw || '故事骨架生成失败。', agentLabel: '编剧' });
    return;
  }

  const fullText = agentBusinessText(agentResult);

  // 尝试提取分层 XML（新格式），若不存在则回退到旧格式
  const globalSkeleton = extractXml(fullText, 'globalSkeleton');
  const episodeSkeletonMatches = [...fullText.matchAll(/<episodeSkeleton\s+episode="(\d+)">([\s\S]*?)<\/episodeSkeleton>/gi)];

  let contentToSave: string;
  let reviewContent = '';
  const outlineVersions: Array<{ content: string; title: string; scope: 'global' | 'episode'; episodeIndex?: number }> = [];

  if (globalSkeleton && episodeSkeletonMatches.length > 0) {
    // 新分层格式：分别写入 global + 各集
    const globalContent = globalSkeleton.trim();
    await updateGlobalSkeleton(ctx.name, globalContent);
    outlineVersions.push({ content: globalContent, title: '全局故事骨架', scope: 'global' });
    for (const match of episodeSkeletonMatches) {
      const epNum = parseInt(match[1], 10);
      const epContent = match[2].trim();
      await updateEpisodeSkeleton(ctx.name, epNum, epContent);
      outlineVersions.push({ content: epContent, title: `第${epNum}集故事骨架`, scope: 'episode', episodeIndex: epNum });
    }
    const allParts = [globalContent, ...episodeSkeletonMatches.map(m => m[2].trim())];
    contentToSave = allParts.join('\n\n---\n\n');
    reviewContent = globalContent;
  } else {
    // 旧格式（单个 <storySkeleton>）或 fallback
    const skeleton = extractXml(fullText, 'storySkeleton');
    contentToSave = skeleton || fullText.trim();
    if (contentToSave) {
      // 兼容：旧格式也同步写入新分层路径，确保页面能读到
      await updateGlobalSkeleton(ctx.name, contentToSave);
      outlineVersions.push({ content: contentToSave, title: '全局故事骨架', scope: 'global' });
      reviewContent = contentToSave;
    }
  }

  if (contentToSave) {
    const agentRunId = await recordAgentRun(ctx.name, {
      action: 'generate_story_outline',
      agentName: 'scriptAgent-skeleton',
      skillName: 'scriptAgent-skeleton',
      modelId,
      input: { userMessage },
    });
    for (const version of outlineVersions) {
      await saveStoryOutline(ctx.name, { ...version, agentRunId: agentRunId || undefined });
    }

    send({
      type: 'content_saved',
      data: JSON.stringify({ type: 'skeleton' }),
    });

    // 自动调用 supervisor 审核
    send({ type: 'status', data: '正在审核故事骨架...', agentLabel: '编辑' });

    try {
      const configSummary = ctx.config
        ? `集数：${ctx.config.totalEpisodes}集，时长：${ctx.config.episodeDuration}分钟，范围：第${ctx.config.chapterRange[0]}-${ctx.config.chapterRange[1]}章，风格：${ctx.config.style}，付费：${ctx.config.paywall}`
        : undefined;
      const prevReview = await getReviewResult(ctx.name, 'skeleton');
      const parsed = await runSupervisorReview(ctx.name, 'review_skeleton', {
        skeleton: reviewContent || contentToSave,
        configSummary,
        previousReview: prevReview,
      }, modelId);
      {
        const totalScore = parsed.totalScore;
        const grade = totalScore >= 90 ? 'A' : totalScore >= 80 ? 'B' : totalScore >= 60 ? 'C' : 'D';

        // 保存审核结果
        const reviewResult: ReviewResult = {
          type: 'skeleton' as ReviewResult['type'],
          scope: 'global',
          totalScore,
          dimensions: (parsed.dimensions || []).map((d: { name: string; weight: number; score: number; comment: string }) => ({
            name: d.name || '', weight: Math.round(d.weight || 0), score: Math.round(d.score || 0), comment: d.comment || '',
          })),
          suggestions: parsed.suggestions || [],
          summary: parsed.summary || '',
          status: totalScore >= 80 ? 'pass' : 'fail',
          reviewedAt: new Date().toISOString(),
          modelId: modelId || 'default-model',
        };
        await saveReviewResult(ctx.name, reviewResult);
        await recordQualityGateFromReview(ctx.name, reviewResult);

        // 格式化审核报告展示在聊天中
        const dimTable = (parsed.dimensions || [])
          .map((d: { name: string; score: number; comment: string }) => `| ${d.name} | ${d.score}分 | ${d.comment} |`)
          .join('\n');

        const GUIDE: Record<string, string> = {
          A: '审核通过，是否进入下一阶段（改编策略）？',
          B: '有一些小问题，是否需要修复还是直接继续？',
          C: '建议修复以下问题，您希望修复哪些？',
          D: '建议重做此阶段，您确认吗？',
        };

        const report = `\n\n---\n\n## 审核报告\n\n**评分：${grade}（${totalScore}分）**\n\n| 维度 | 得分 | 评语 |\n|------|------|------|\n${dimTable}\n\n**总体评价：** ${parsed.summary || ''}\n\n${(parsed.suggestions || []).length > 0 ? `**改进建议：**\n${parsed.suggestions.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}` : ''}\n\n${GUIDE[grade]}`;

        send({ type: 'text', data: report, agentLabel: '编辑' });
        await appendChatMessage(ctx.name, 'assistant', `故事骨架已生成。${report}`);
      }
    } catch (err) {
      const errMsg = `\n\n审核未能完成：${err instanceof Error ? err.message : '未知错误'}。您可以手动在审核面板中发起审核。`;
      send({ type: 'text', data: errMsg, agentLabel: '编辑' });
    }
  }
}

/** 执行生成改编策略 */
async function executeAdaptation(
  send: SendFn,
  userMessage: string,
  ctx: ProjectContext,
  modelId?: string,
  signal?: AbortSignal
) {
  // 前置检查：运行时重新读取骨架，不依赖缓存的 ctx.hasSkeleton
  const skeletonContent = await storyOutlineForAgent(ctx.name);
  if (!skeletonContent) {
    send({
      type: 'text',
      data: '需要先完成故事骨架才能生成改编策略。请先输入「生成故事骨架」。',
      agentLabel: '统筹',
    });
    return;
  }

  send({ type: 'status', data: '正在制定改编策略...', agentLabel: '编剧' });

  const skeleton = skeletonContent;
  const description = await getProjectDescription(ctx.name).catch(() => '');
  const chapters = await getChapters(ctx.name);
  const continuity = await getContinuity(ctx.name);

  const chapterList = chapters.map((c, i) => ({
    index: i + 1,
    title: typeof c === 'string' ? c : (c as { title?: string }).title || `第${i + 1}章`,
  }));

  const agentResult = await runAgentWithStream(
    send,
    '编剧',
    'scriptAgent-adaptation',
    {
      projectName: ctx.name,
      action: 'generate_adaptation',
      mode: 'full',
      userMessage,
      description,
      skeleton,
      chapterList,
      continuity,
      config: ctx.config,
      ...(modelId ? { modelOverride: modelId } : {}),
    },
    signal
  );

  if (shouldStopForAgentFailure(agentResult)) {
    send({ type: 'text', data: agentResult.raw || '改编策略生成失败。', agentLabel: '编剧' });
    return;
  }

  const fullText = agentBusinessText(agentResult);

  // 尝试提取分层 XML（新格式）
  const globalAdaptation = extractXml(fullText, 'globalAdaptation');
  const episodeAdaptMatches = [...fullText.matchAll(/<episodeAdaptation\s+episode="(\d+)">([\s\S]*?)<\/episodeAdaptation>/gi)];

  let adaptToSave: string;
  let reviewContent = '';
  const adaptationVersions: Array<{ content: string; title: string; scope: 'global' | 'episode'; episodeIndex?: number }> = [];

  if (globalAdaptation && episodeAdaptMatches.length > 0) {
    // 新分层格式
    const globalContent = globalAdaptation.trim();
    await updateGlobalAdaptation(ctx.name, globalContent);
    adaptationVersions.push({ content: globalContent, title: '全局改编策略', scope: 'global' });
    for (const match of episodeAdaptMatches) {
      const epNum = parseInt(match[1], 10);
      const epContent = match[2].trim();
      await updateEpisodeAdaptation(ctx.name, epNum, epContent);
      adaptationVersions.push({ content: epContent, title: `第${epNum}集改编策略`, scope: 'episode', episodeIndex: epNum });
    }
    const allParts = [globalContent, ...episodeAdaptMatches.map(m => m[2].trim())];
    adaptToSave = allParts.join('\n\n---\n\n');
    reviewContent = globalContent;
  } else {
    // 旧格式
    const adaptation = extractXml(fullText, 'adaptationStrategy');
    adaptToSave = adaptation || fullText.trim();
    if (adaptToSave) {
      // 兼容：旧格式也同步写入新分层路径
      await updateGlobalAdaptation(ctx.name, adaptToSave);
      adaptationVersions.push({ content: adaptToSave, title: '全局改编策略', scope: 'global' });
      reviewContent = adaptToSave;
    }
  }

  if (adaptToSave) {
    const agentRunId = await recordAgentRun(ctx.name, {
      action: 'generate_adaptation',
      agentName: 'scriptAgent-adaptation',
      skillName: 'scriptAgent-adaptation',
      modelId,
      input: { userMessage },
    });
    for (const version of adaptationVersions) {
      await saveAdaptationPlan(ctx.name, { ...version, agentRunId: agentRunId || undefined });
    }

    send({
      type: 'content_saved',
      data: JSON.stringify({ type: 'adaptation' }),
    });

    // 自动调用 supervisor 审核
    send({ type: 'status', data: '正在审核改编策略...', agentLabel: '编辑' });

    try {
      const skeletonContent = await storyOutlineForAgent(ctx.name).catch(() => '');
      const prevAdaptReview = await getReviewResult(ctx.name, 'adaptation');
      const parsed = await runSupervisorReview(ctx.name, 'review_adaptation', {
        adaptation: reviewContent || adaptToSave,
        skeletonSummary: skeletonContent || undefined,
        previousReview: prevAdaptReview,
      }, modelId);
      {
        const totalScore = parsed.totalScore;
        const grade = totalScore >= 90 ? 'A' : totalScore >= 80 ? 'B' : totalScore >= 60 ? 'C' : 'D';

        const reviewResult: ReviewResult = {
          type: 'adaptation' as ReviewResult['type'],
          scope: 'global',
          totalScore,
          dimensions: (parsed.dimensions || []).map((d: { name: string; weight: number; score: number; comment: string }) => ({
            name: d.name || '', weight: Math.round(d.weight || 0), score: Math.round(d.score || 0), comment: d.comment || '',
          })),
          suggestions: parsed.suggestions || [],
          summary: parsed.summary || '',
          status: totalScore >= 80 ? 'pass' : 'fail',
          reviewedAt: new Date().toISOString(),
          modelId: modelId || 'default-model',
        };
        await saveReviewResult(ctx.name, reviewResult);
        await recordQualityGateFromReview(ctx.name, reviewResult);

        const dimTable = (parsed.dimensions || [])
          .map((d: { name: string; score: number; comment: string }) => `| ${d.name} | ${d.score}分 | ${d.comment} |`)
          .join('\n');

        const GUIDE: Record<string, string> = {
          A: '审核通过，是否进入下一阶段（剧本编写）？',
          B: '有一些小问题，是否需要修复还是直接继续？',
          C: '建议修复以下问题，您希望修复哪些？',
          D: '建议重做此阶段，您确认吗？',
        };

        const report = `\n\n---\n\n## 改编策略审核报告\n\n**评分：${grade}（${totalScore}分）**\n\n| 维度 | 得分 | 评语 |\n|------|------|------|\n${dimTable}\n\n**总体评价：** ${parsed.summary || ''}\n\n${(parsed.suggestions || []).length > 0 ? `**改进建议：**\n${parsed.suggestions.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}` : ''}\n\n${GUIDE[grade]}`;

        send({ type: 'text', data: report, agentLabel: '编辑' });
        await appendChatMessage(ctx.name, 'assistant', `改编策略已生成。${report}`);
      }
    } catch (err) {
      const errMsg = `\n\n审核未能完成（内容已保存）：${err instanceof Error ? err.message : '未知错误'}。您可以稍后重新触发审核。`;
      send({ type: 'text', data: errMsg, agentLabel: '编辑' });
    }
  }
}

/** 执行剧本编写 */
async function executeScript(
  send: SendFn,
  userMessage: string,
  ctx: ProjectContext,
  params: Record<string, unknown>,
  modelId?: string,
  signal?: AbortSignal
) {
  // 前置检查：运行时重新读取，不依赖缓存的 ctx
  const skeletonCheck = await storyOutlineForAgent(ctx.name);
  const adaptationCheck = await adaptationForAgent(ctx.name);
  if (!skeletonCheck || !adaptationCheck) {
    const missing = [];
    if (!skeletonCheck) missing.push('故事骨架');
    if (!adaptationCheck) missing.push('改编策略');
    send({
      type: 'text',
      data: `需要先完成${missing.join('和')}才能编写剧本。`,
      agentLabel: '统筹',
    });
    return;
  }

  const episode = (params.episode as number) || ctx.scriptCount + 1;
  send({
    type: 'status',
    data: `正在编写第 ${episode} 集剧本...`,
    agentLabel: '编剧',
  });

  const description = await getProjectDescription(ctx.name).catch(() => '');
  const config = await getProjectConfig(ctx.name);

  const skeleton = await storyOutlineForAgent(ctx.name, episode);
  const adaptation = await adaptationForAgent(ctx.name, episode);

  // 读取连贯性数据
  const continuity = await getContinuity(ctx.name);

  // 获取上一集剧本用于衔接（只取最后500字）
  let prevScript = '';
  if (episode > 1) {
    try {
      const fullPrev = await getScriptContent(ctx.name, episode - 1);
      prevScript = fullPrev.slice(-500);
    } catch {
      // 没有上一集不影响生成
    }
  }

  const agentResult = await runAgentWithStream(
    send,
    '编剧',
    'scriptAgent-script',
    {
      projectName: ctx.name,
      action: 'generate_script',
      mode: 'full',
      episode,
      userMessage,
      description,
      skeleton,
      adaptation,
      prevScript,
      continuity,
      config,
      ...(modelId ? { modelOverride: modelId } : {}),
    },
    signal
  );

  if (shouldStopForAgentFailure(agentResult)) {
    send({ type: 'text', data: agentResult.raw || '剧本生成失败。', agentLabel: '编剧' });
    return;
  }

  const fullText = agentBusinessText(agentResult);

  // 提取并保存（XML 提取失败时 fallback 用完整输出）
  const scriptItem = extractScriptItem(fullText);
  const contentToSave = scriptItem?.content || fullText.trim();
  if (contentToSave) {
    const agentRunId = await recordAgentRun(ctx.name, {
      action: 'generate_script',
      agentName: 'scriptAgent-script',
      skillName: 'scriptAgent-script',
      modelId,
      input: { episode, userMessage },
    });
    await updateScript(ctx.name, episode, {
      content: contentToSave,
      source: 'agent_generated',
      agentRunId: agentRunId || undefined,
      metadata: { episode },
    });
    send({
      type: 'content_saved',
      data: JSON.stringify({ type: 'script', episode }),
    });

    // 自动审核剧本
    send({ type: 'status', data: `正在审核第 ${episode} 集剧本...`, agentLabel: '编辑' });

    try {
      const storyline = await getStoryline(ctx.name).catch(() => '');
      const outline = await getOutline(ctx.name).catch(() => null) as Record<string, unknown>[] | null;
      const outlineEp = outline?.[episode - 1];
      const parsed = await runSupervisorReview(ctx.name, 'review_script', {
        script: contentToSave,
        outlineEpisode: outlineEp ? JSON.stringify(outlineEp, null, 2) : '无大纲',
        storyline,
        episodeIndex: episode,
      }, modelId);
      {
        const totalScore = parsed.totalScore;
        const grade = totalScore >= 90 ? 'A' : totalScore >= 80 ? 'B' : totalScore >= 60 ? 'C' : 'D';

        const reviewResult: ReviewResult = {
          type: 'script' as ReviewResult['type'],
          episode,
          totalScore,
          dimensions: (parsed.dimensions || []).map((d: { name: string; weight: number; score: number; comment: string }) => ({
            name: d.name || '', weight: Math.round(d.weight || 0), score: Math.round(d.score || 0), comment: d.comment || '',
          })),
          suggestions: parsed.suggestions || [],
          summary: parsed.summary || '',
          status: totalScore >= 80 ? 'pass' : 'fail',
          reviewedAt: new Date().toISOString(),
          modelId: modelId || 'default-model',
        };
        await saveReviewResult(ctx.name, reviewResult);
        await recordQualityGateFromReview(ctx.name, reviewResult);

        const dimTable = (parsed.dimensions || [])
          .map((d: { name: string; score: number; comment: string }) => `| ${d.name} | ${d.score}分 | ${d.comment} |`)
          .join('\n');

        const nextEp = episode + 1;
        const hasMore = nextEp <= (ctx.totalEpisodes || 0);
        const GUIDE: Record<string, string> = {
          A: hasMore ? `审核通过！是否继续生成第 ${nextEp} 集？` : '审核通过！所有剧本已完成。',
          B: hasMore ? `有一些小问题，是否需要修复还是继续生成第 ${nextEp} 集？` : '有一些小问题，是否需要修复？',
          C: '建议修复以下问题，您希望修复哪些？',
          D: '建议重写此集剧本，您确认吗？',
        };

        const report = `\n\n---\n\n## 第 ${episode} 集剧本审核报告\n\n**评分：${grade}（${totalScore}分）**\n\n| 维度 | 得分 | 评语 |\n|------|------|------|\n${dimTable}\n\n**总体评价：** ${parsed.summary || ''}\n\n${(parsed.suggestions || []).length > 0 ? `**改进建议：**\n${parsed.suggestions.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}` : ''}\n\n${GUIDE[grade]}`;

        send({ type: 'text', data: report, agentLabel: '编辑' });
        await appendChatMessage(ctx.name, 'assistant', `第${episode}集剧本已生成。${report}`);
      }
    } catch (err) {
      const errMsg = `\n\n审核未能完成（内容已保存）：${err instanceof Error ? err.message : '未知错误'}。您可以稍后重新触发审核。`;
      send({ type: 'text', data: errMsg, agentLabel: '编辑' });
    }
  }
}

/** 检查进度 */
function executeCheckProgress(send: SendFn, ctx: ProjectContext) {
  const summary = buildProgressSummary(ctx);
  send({ type: 'text', data: summary, agentLabel: '统筹' });
}

/** 构建项目上下文 */
export async function buildProjectContext(
  name: string
): Promise<ProjectContext> {
  const [description, storyOutline, globalSkeleton, dbSkeleton, adaptationPlan, globalAdaptation, dbAdaptation, scripts, outline, config, skeletonEps, adaptationEps] =
    await Promise.all([
      getProjectDescription(name).catch(() => ''),
      storyOutlineForAgent(name).catch(() => ''),
      getGlobalSkeleton(name).catch(() => ''),
      getLatestStoryOutline(name).catch(() => ''),
      adaptationForAgent(name).catch(() => ''),
      getGlobalAdaptation(name).catch(() => ''),
      getLatestAdaptationPlan(name).catch(() => ''),
      getScripts(name).catch(() => [] as { episode: number }[]),
      getOutline(name).catch(() => null),
      getProjectConfig(name).catch(() => null),
      listEpisodeSkeletons(name).catch(() => []),
      listEpisodeAdaptations(name).catch(() => []),
    ]);

  // 取 config、outline、scripts 三者的最大值，避免 config 过时导致集数错误
  const configEps = config?.totalEpisodes ?? 0;
  const outlineEps = Array.isArray(outline) ? outline.length : 0;
  const scriptEps = scripts.length;
  const totalEpisodes = Math.max(configEps, outlineEps, scriptEps) || 1;

  // 自动修正过时的 config.totalEpisodes
  if (config && totalEpisodes > config.totalEpisodes) {
    config.totalEpisodes = totalEpisodes;
    await updateProjectConfig(name, { totalEpisodes }).catch(() => {});
  }

  // 构建每集的阶段完成状态
  const skeletonEpSet = new Set(skeletonEps.map((e: { episode: number }) => e.episode));
  const adaptationEpSet = new Set(adaptationEps.map((e: { episode: number }) => e.episode));
  const scriptEpSet = new Set(scripts.map((s: { episode: number }) => s.episode));
  const episodeStatuses = [];
  for (let i = 1; i <= totalEpisodes; i++) {
    episodeStatuses.push({
      episode: i,
      hasSkeleton: skeletonEpSet.has(i),
      hasAdaptation: adaptationEpSet.has(i),
      hasScript: scriptEpSet.has(i),
    });
  }

  return {
    name,
    description,
    chapterCount: 0,
    hasSkeleton: !!(dbSkeleton || storyOutline || globalSkeleton),
    hasAdaptation: !!(dbAdaptation || adaptationPlan || globalAdaptation),
    scriptCount: scripts.length,
    totalEpisodes,
    hasConfig: !!config,
    config: config ?? null,
    episodeStatuses,
  };
}

/** 修复辅助：根据类型查找最近审核并执行修复 */
async function executeFixByType(
  send: SendFn,
  type: 'skeleton' | 'adaptation' | 'script',
  ctx: ProjectContext,
  modelId?: string,
  episode?: number,
  signal?: AbortSignal
) {
  // 查找对应类型的审核结果
  const allReviews = await getAllReviews(ctx.name);
  const withSuggestions = allReviews
    .filter((r) => r.type === type && r.suggestions && r.suggestions.length > 0 && r.reviewedAt)
    .sort((a, b) => new Date(b.reviewedAt!).getTime() - new Date(a.reviewedAt!).getTime());

  const latest = withSuggestions[0];
  if (!latest) {
    send({ type: 'text', data: `未找到${type === 'skeleton' ? '故事骨架' : type === 'adaptation' ? '改编策略' : '剧本'}的审核记录，无法执行修复。`, agentLabel: '统筹' });
    return;
  }

  const targetEpisode = type === 'script' ? (episode || latest.episode) : undefined;
  if (type === 'script' && !targetEpisode) {
    send({ type: 'text', data: '无法确定要修复的剧本集数。', agentLabel: '统筹' });
    return;
  }

  const fixKey = type === 'script' ? `script-ep${targetEpisode}` : type;
  const currentFixCount = await getReviewFixCount(ctx.name, fixKey);
  if (currentFixCount >= 2) {
    send({
      type: 'error',
      data: '已达修复轮数上限（2 轮），请人工介入或调整提示词后重新生成。',
    });
    return;
  }

  const sugList = latest.suggestions!.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n');
  const dimReport = latest.dimensions
    .map((d) => `- ${d.name}：${d.score}分（${d.comment}）`)
    .join('\n');
  const reviewContext = `## 上轮审核报告（总分 ${latest.totalScore} 分）\n\n### 各维度得分\n${dimReport}\n\n### 需要修复的问题\n${sugList}\n\n### 总评\n${latest.summary}`;

  if (type === 'skeleton') {
    const existingContent = await storyOutlineForAgent(ctx.name);
    const fixInstructions = `## 任务：局部修复故事骨架\n\n**重要：只修改审核建议指出的问题，其他部分原封不动保留。不要重写整个骨架。**\n\n${reviewContext}\n\n## 当前骨架内容（在此基础上局部修改）\n\n${existingContent}`;
    await executeSkeleton(send, fixInstructions, ctx, modelId, signal);
  } else if (type === 'adaptation') {
    const existingContent = await adaptationForAgent(ctx.name);
    const fixInstructions = `## 任务：局部修复改编策略\n\n**重要：只修改审核建议指出的问题，其他部分原封不动保留。不要重写整个策略。**\n\n${reviewContext}\n\n## 当前改编策略内容（在此基础上局部修改）\n\n${existingContent}`;
    await executeAdaptation(send, fixInstructions, ctx, modelId, signal);
  } else if (type === 'script') {
    const ep = targetEpisode;
    if (!ep) {
      send({ type: 'text', data: '无法确定要修复的剧本集数。', agentLabel: '统筹' });
      return;
    }
    const existingContent = await getScriptContent(ctx.name, ep);
    const fixInstructions = `## 任务：局部修复第${ep}集剧本\n\n**重要：只修改审核建议指出的问题，其他部分原封不动保留。不要重写整集剧本。**\n\n${reviewContext}\n\n## 当前剧本内容（在此基础上局部修改）\n\n${existingContent}`;
    await executeScript(send, fixInstructions, ctx, { episode: ep }, modelId, signal);
  }

  await incrementReviewFixCount(ctx.name, fixKey);
}

/** 确定性执行入口（按钮操作直接调用，不经过意图分类） */
export async function executeAction(
  send: SendFn,
  action: ExecuteAction,
  params: Record<string, unknown>,
  ctx: ProjectContext,
  modelId?: string,
  signal?: AbortSignal
) {
  switch (action) {
    case 'generate_skeleton':
      await executeSkeleton(send, '请生成故事骨架', ctx, modelId, signal);
      break;
    case 'generate_adaptation':
      await executeAdaptation(send, '请基于故事骨架生成改编策略', ctx, modelId, signal);
      break;
    case 'generate_script': {
      const episode = (params.episode as number) || ctx.scriptCount + 1;
      await executeScript(send, `请编写第${episode}集剧本`, ctx, { episode }, modelId, signal);
      break;
    }
    case 'fix_skeleton':
      await executeFixByType(send, 'skeleton', ctx, modelId, undefined, signal);
      break;
    case 'fix_adaptation':
      await executeFixByType(send, 'adaptation', ctx, modelId, undefined, signal);
      break;
    case 'fix_script':
      await executeFixByType(send, 'script', ctx, modelId, params.episode as number | undefined, signal);
      break;
    default:
      send({ type: 'error', data: `未知操作：${action}` });
  }
}

/** 对话执行入口（输入框消息经过意图分类后调用） */
export async function executeChatFlow(
  send: SendFn,
  userMessage: string,
  intent: IntentResult,
  ctx: ProjectContext,
  modelId?: string,
  signal?: AbortSignal
) {
  // 如果配置不完整且不是明确的生成指令以外的操作，路由到配置收集
  const currentConfig = await getProjectConfig(ctx.name);
  const configComplete = isConfigComplete(currentConfig);

  if (!configComplete && intent.intent === 'chat') {
    // 用户可能在回答配置参数，走配置收集逻辑
    await executeConfigCollection(send, userMessage, ctx, modelId);
    return;
  }

  switch (intent.intent) {
    case 'generate_skeleton':
      await executeSkeleton(send, userMessage, ctx, modelId, signal);
      break;
    case 'generate_adaptation':
      await executeAdaptation(send, userMessage, ctx, modelId, signal);
      break;
    case 'generate_script':
      await executeScript(send, userMessage, ctx, intent.params, modelId, signal);
      break;
    case 'fix_skeleton':
      await executeFixByType(send, 'skeleton', ctx, modelId, undefined, signal);
      break;
    case 'fix_adaptation':
      await executeFixByType(send, 'adaptation', ctx, modelId, undefined, signal);
      break;
    case 'fix_script':
      await executeFixByType(send, 'script', ctx, modelId, intent.params.episode as number | undefined, signal);
      break;
    case 'check_progress':
      executeCheckProgress(send, ctx);
      break;
    case 'chat':
    default:
      await executeChat(send, userMessage, ctx, modelId, signal);
      break;
  }
}

/** 主执行入口（兼容别名，等同于 executeChatFlow） */
export const execute = executeChatFlow;
