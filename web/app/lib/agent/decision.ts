import { AgentIntent, IntentResult, ProjectContext } from './types';
import { callModel, resolveModel } from './stream-model';

interface KeywordRule {
  keywords: string[];
  intent: AgentIntent;
}

const INTENT_RULES: KeywordRule[] = [
  {
    keywords: ['故事骨架', '骨架', '分集', '三幕结构', 'skeleton'],
    intent: 'generate_skeleton',
  },
  {
    keywords: ['改编策略', '改编', '改编决策', '改编原则', 'adaptation'],
    intent: 'generate_adaptation',
  },
  {
    keywords: ['写剧本', '剧本编写', '编剧', '生成剧本', '剧本', 'script'],
    intent: 'generate_script',
  },
  {
    keywords: ['进度', '当前状态', '完成了什么', '做到哪了'],
    intent: 'check_progress',
  },
];

/** "修复/修改" + 阶段关键词 → fix_* 意图 */
const FIX_RULES: { keywords: string[]; intent: AgentIntent }[] = [
  { keywords: ['骨架'], intent: 'fix_skeleton' },
  { keywords: ['改编', '策略'], intent: 'fix_adaptation' },
  { keywords: ['剧本'], intent: 'fix_script' },
];
const FIX_TRIGGERS = ['修复', '修', '修改', '修正', '改进', '优化', '都修复', '都改'];

/** 修改类/疑问句式检测 — 这些请求应先提问再执行，不能直接生成 */
const MODIFY_INDICATORS = ['改', '调整', '修改', '优化', '换', '重新', '重做'];
const QUESTION_INDICATORS = ['能', '可以', '怎么', '吗', '？', '?', '不太好', '不满意', '不对'];

function isModifyOrQuestion(text: string): boolean {
  const hasModify = MODIFY_INDICATORS.some((w) => text.includes(w));
  const hasQuestion = QUESTION_INDICATORS.some((w) => text.includes(w));
  // "重新/重做" + 动作词（生成/做/来/写）= 明确的再次执行指令，不是修改提问
  const ACTION_WORDS = ['生成', '做', '来', '写', '创建'];
  const hasAction = ACTION_WORDS.some((w) => text.includes(w));
  // 同时包含修改词和疑问词 → 一定是修改/模糊请求
  // 只包含修改词但没有动作词 → 也是修改请求（如"改故事线"、"调整节奏"）
  // 包含修改词+动作词 → 是明确的再次执行指令（如"重新生成"、"重做"、"重新写"）
  return (hasModify && hasQuestion) || (hasModify && !hasAction);
}

/** 中文数字 → 阿拉伯数字映射 */
const CN_NUM_MAP: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
};

/** 解析中文数字字符串（支持到99） */
function parseCnNumber(s: string): number | null {
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (s === '十') return 10;
  if (s.startsWith('十')) return 10 + (CN_NUM_MAP[s[1]] || 0);
  let result = 0;
  for (const ch of s) {
    if (ch === '十') { result = (result || 1) * 10; }
    else if (CN_NUM_MAP[ch] !== undefined) { result += CN_NUM_MAP[ch]; }
    else return null;
  }
  return result || null;
}

/** 从文本中提取集数（支持阿拉伯数字和中文数字） */
export function extractEpisode(text: string): number | null {
  const m1 = text.match(/第\s*(\d+)\s*集/);
  if (m1) return parseInt(m1[1], 10);
  const m2 = text.match(/第\s*([一二三四五六七八九十]+)\s*集/);
  if (m2) return parseCnNumber(m2[1]);
  return null;
}

/** Tier 1: 关键词快速匹配 */
function matchKeywords(text: string): IntentResult | null {
  const lower = text.toLowerCase();
  for (const rule of INTENT_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      const params: Record<string, unknown> = {};
      if (rule.intent === 'generate_script') {
        const ep = extractEpisode(text);
        if (ep) params.episode = ep;
      }
      return { intent: rule.intent, params };
    }
  }
  return null;
}

/** Tier 2: LLM 意图分类 */
async function classifyWithLLM(
  text: string,
  ctx: ProjectContext,
  modelId?: string
): Promise<IntentResult> {
  const model = await resolveModel('chat', modelId);

  const systemPrompt = `你是一个意图分类器。根据用户消息和项目状态，判断用户想要执行的操作。

项目状态：
- 故事骨架：${ctx.hasSkeleton ? '已完成' : '未生成'}
- 改编策略：${ctx.hasAdaptation ? '已完成' : '未生成'}
- 剧本：已完成 ${ctx.scriptCount} 集，共 ${ctx.totalEpisodes} 集

只返回 JSON，不要其他内容：
{"intent": "chat|generate_skeleton|generate_adaptation|generate_script|fix_skeleton|fix_adaptation|fix_script|check_progress", "episode": null}

规则：
- 用户要求**生成/创建/开始/重新生成/重做/重新写**某阶段产出时，返回对应的 generate_* 类型
- 用户要求**修复/修改/优化/改进**某阶段产出时，返回对应的 fix_* 类型
- 如果用户笼统说"修复"/"都修复下"但未指定阶段，根据项目状态推断（优先 fix_script）
- 如果用户在**提问、表达不确定、表达不满但未指定行动**（如"能改吗？""这个不太好""想调整但不确定"），返回 chat — 需要先了解用户具体需求
- 如果用户在闲聊、问问题、打招呼，返回 chat
- 如果用户说"开始"或"下一步"，根据项目状态推断下一个阶段
- 如果用户想写剧本且指定了集数，填 episode 字段`;

  const raw = await callModel(model, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: text },
  ]);

  try {
    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        intent: parsed.intent || 'chat',
        params: parsed.episode ? { episode: parsed.episode } : {},
      };
    }
  } catch {
    // 解析失败，当作闲聊
  }
  return { intent: 'chat', params: {} };
}

/** 根据项目状态推断下一步（支持多集按集推进） */
function inferNextStep(ctx: ProjectContext): IntentResult {
  // 全局骨架不存在 → 先生成骨架
  if (!ctx.hasSkeleton) {
    return { intent: 'generate_skeleton', params: {} };
  }
  // 全局策略不存在 → 先生成策略
  if (!ctx.hasAdaptation) {
    return { intent: 'generate_adaptation', params: {} };
  }

  // 按集推进：找到第一个阶段未完成的集
  for (const ep of ctx.episodeStatuses) {
    if (!ep.hasSkeleton) {
      return { intent: 'generate_skeleton', params: { episode: ep.episode } };
    }
    if (!ep.hasAdaptation) {
      return { intent: 'generate_adaptation', params: { episode: ep.episode } };
    }
    if (!ep.hasScript) {
      return { intent: 'generate_script', params: { episode: ep.episode } };
    }
  }

  // 所有集完成 → 重新生成最后一集剧本
  return {
    intent: 'generate_script',
    params: { episode: ctx.totalEpisodes },
  };
}

/** 主入口：意图分类 */
export async function classifyIntent(
  text: string,
  ctx: ProjectContext,
  modelId?: string
): Promise<IntentResult> {
  // 快速路径："开始"、"下一步"、"继续"
  const quickWords = ['开始', '下一步', '继续', '下一个阶段'];
  if (quickWords.some((w) => text.includes(w))) {
    return inferNextStep(ctx);
  }

  // Tier 0.5: 修复类请求快速匹配 — "修复"/"修改"等 + 阶段关键词
  if (FIX_TRIGGERS.some((w) => text.includes(w))) {
    // 尝试匹配具体阶段
    for (const rule of FIX_RULES) {
      if (rule.keywords.some((kw) => text.includes(kw))) {
        const params: Record<string, unknown> = {};
        if (rule.intent === 'fix_script') {
          const ep = extractEpisode(text);
          if (ep) params.episode = ep;
        }
        return { intent: rule.intent, params };
      }
    }
    // 没有匹配到具体阶段 → 根据项目状态推断最需修复的阶段
    if (ctx.scriptCount > 0) {
      const ep = extractEpisode(text);
      return { intent: 'fix_script' as AgentIntent, params: ep ? { episode: ep } : {} };
    }
    if (ctx.hasAdaptation) return { intent: 'fix_adaptation' as AgentIntent, params: {} };
    if (ctx.hasSkeleton) return { intent: 'fix_skeleton' as AgentIntent, params: {} };
  }

  // Tier 0.6: 修改/模糊请求检测 — 跳过关键词匹配，让 LLM 判断是否需要先提问
  if (isModifyOrQuestion(text)) {
    return classifyWithLLM(text, ctx, modelId);
  }

  // Tier 1: 关键词匹配（仅对明确生成指令生效）
  const matched = matchKeywords(text);
  if (matched) {
    return matched;
  }

  // Tier 2: LLM 分类
  return classifyWithLLM(text, ctx, modelId);
}
