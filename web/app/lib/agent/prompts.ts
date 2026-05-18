// runtime: nodejs
/**
 * Deprecated prompt builders.
 *
 * 剧本链 prompt 已迁移到 /agents + /skills，并由 agent-runtime.ts 的 runAgent 统一组装。
 * 这些导出仅保留旧调用签名，便于灰度期内发现误用。
 */

function warnDeprecated(name: string) {
  console.warn(`[deprecated] ${name} 已迁移到 runAgent，请不要再依赖硬编码 prompt。`);
}

export function buildChatPrompt(
  userMessage: string,
  projectInfo: string,
  _ctx: unknown,
  history: Array<{ role: string; content: string }> = [],
  modelName = '当前模型'
): { role: string; content: string }[] {
  warnDeprecated('buildChatPrompt');
  return [
    {
      role: 'system',
      content: `你是 Toonflow 的统筹助手。模型身份：${modelName}。请基于项目进度与对话历史，用中文简洁回复。`,
    },
    ...history,
    {
      role: 'user',
      content: `项目进度：\n${projectInfo}\n\n用户消息：\n${userMessage}`,
    },
  ];
}

export function buildSkeletonPrompt(
  chapters: unknown,
  projectName: string,
  description: string,
  userInstruction = '',
  config?: unknown
): { role: string; content: string }[] {
  warnDeprecated('buildSkeletonPrompt');
  return [
    {
      role: 'user',
      content: `请改用 runAgent({ agentName: 'scriptAgent-skeleton' })。兼容上下文：${JSON.stringify({
        projectName,
        description,
        userInstruction,
        config,
        chapters,
      })}`,
    },
  ];
}

export function buildAdaptationPrompt(
  skeleton: string,
  chapters: unknown,
  projectName: string,
  description: string,
  userInstruction = ''
): { role: string; content: string }[] {
  warnDeprecated('buildAdaptationPrompt');
  return [
    {
      role: 'user',
      content: `请改用 runAgent({ agentName: 'scriptAgent-adaptation' })。兼容上下文：${JSON.stringify({
        projectName,
        description,
        userInstruction,
        skeleton,
        chapters,
      })}`,
    },
  ];
}

export function buildScriptPrompt(
  skeleton: string,
  adaptation: string,
  episode: number,
  projectName: string,
  description: string,
  prevScript = '',
  userInstruction = '',
  continuity?: unknown,
  config?: unknown
): { role: string; content: string }[] {
  warnDeprecated('buildScriptPrompt');
  return [
    {
      role: 'user',
      content: `请改用 runAgent({ agentName: 'scriptAgent-script' })。兼容上下文：${JSON.stringify({
        projectName,
        episode,
        description,
        userInstruction,
        skeleton,
        adaptation,
        prevScript,
        continuity,
        config,
      })}`,
    },
  ];
}

export function buildProgressSummary(
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
  lines.push(
    ctx.totalEpisodes > 0
      ? `- 剧本：${Math.min(ctx.scriptCount, ctx.totalEpisodes)}/${ctx.totalEpisodes} 集`
      : `- 剧本：${ctx.scriptCount} 集（总集数待定）`
  );
  return lines.join('\n');
}

export function buildExtractParamsPrompt(
  userMessage: string
): { role: string; content: string }[] {
  warnDeprecated('buildExtractParamsPrompt');
  return [
    {
      role: 'system',
      content: '你是参数提取器。只返回 JSON，不要其他内容。',
    },
    { role: 'user', content: userMessage },
  ];
}
