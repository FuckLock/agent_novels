// runtime: nodejs
/**
 * Deprecated review prompt builders.
 *
 * 审核 prompt 已迁移到 /skills/script-supervision.md，并由
 * runAgent({ agentName: 'scriptAgent-supervisor' }) 统一组装。
 */

function warnDeprecated(name: string) {
  console.warn(`[deprecated] ${name} 已迁移到 scriptAgent-supervisor。`);
}

function buildReviewCompatibilityPrompt(type: string, payload: unknown): string {
  return `请改用 runAgent({ agentName: 'scriptAgent-supervisor', action: '${type}' })。\n\n兼容上下文：\n${JSON.stringify(payload, null, 2)}`;
}

export function buildSkeletonReviewPrompt(
  skeleton: string,
  configSummary?: string,
  previousReview?: unknown
): string {
  warnDeprecated('buildSkeletonReviewPrompt');
  return buildReviewCompatibilityPrompt('review_skeleton', { skeleton, configSummary, previousReview });
}

export function buildAdaptationReviewPrompt(
  adaptation: string,
  skeletonSummary?: string,
  previousReview?: unknown
): string {
  warnDeprecated('buildAdaptationReviewPrompt');
  return buildReviewCompatibilityPrompt('review_adaptation', { adaptation, skeletonSummary, previousReview });
}

export function buildStorylineReviewPrompt(storyline: string): string {
  warnDeprecated('buildStorylineReviewPrompt');
  return buildReviewCompatibilityPrompt('review_storyline', { storyline });
}

export function buildOutlineReviewPrompt(
  episodeData: string,
  storyline: string,
  episodeIndex: number
): string {
  warnDeprecated('buildOutlineReviewPrompt');
  return buildReviewCompatibilityPrompt('review_outline', { episodeData, storyline, episodeIndex });
}

export function buildScriptReviewPrompt(
  script: string,
  outlineEpisode: string,
  storyline: string,
  episodeIndex: number
): string {
  warnDeprecated('buildScriptReviewPrompt');
  return buildReviewCompatibilityPrompt('review_script', { script, outlineEpisode, storyline, episodeIndex });
}
