/**
 * XML / meta 注释解析工具
 *
 * 抽离自 web/app/lib/agent/executor.ts，供 executor 与 agent-runtime 共用。
 * 正则与原 executor 实现一致，不做任何行为改动。
 */

/** 从文本中提取 XML 标签内容 */
export function extractXml(text: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

/** 从 scriptItem 标签提取剧本内容和名称 */
export function extractScriptItem(text: string): { name: string; content: string } | null {
  const regex = /<scriptItem\s+name="([^"]*)">([\s\S]*?)<\/scriptItem>/i;
  const match = text.match(regex);
  if (!match) return null;
  return { name: match[1], content: match[2].trim() };
}

/** Agent 运行结果 meta 注释（status / stage_reached / failure_count） */
export interface AgentMeta {
  status: 'passed' | 'stage1_blocked' | 'stage2_blocked' | 'skill_failed';
  stage_reached: number;
  failure_count: { critical: number; high: number; medium: number };
}

/**
 * 提取 LLM 输出末尾的 `<!-- meta: {...} -->` 注释。
 * 解析失败时返回默认 passed 容错值。
 */
export function extractMeta(text: string): AgentMeta {
  const fallback: AgentMeta = {
    status: 'passed',
    stage_reached: 1,
    failure_count: { critical: 0, high: 0, medium: 0 },
  };
  const match = text.match(/<!--\s*meta:\s*({[\s\S]+?})\s*-->/);
  if (!match) return fallback;
  try {
    const parsed = JSON.parse(match[1]);
    return {
      status: parsed.status ?? fallback.status,
      stage_reached: parsed.stage_reached ?? fallback.stage_reached,
      failure_count: {
        critical: parsed.failure_count?.critical ?? 0,
        high: parsed.failure_count?.high ?? 0,
        medium: parsed.failure_count?.medium ?? 0,
      },
    };
  } catch {
    return fallback;
  }
}
