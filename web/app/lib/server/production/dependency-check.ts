// runtime: nodejs
// dependency-check: 策略 × 依赖项清单 + ready/blocked 状态计算（spec L223 / L482 / L546）
//
// 每个策略所需的依赖（spec L222 + L223 + L271 + L462-468）：
//   - multi_reference_text:   ≥ 2 张参考图（reference_assets 数组）+ 文本指令
//   - start_frame:            1 张首帧图（first_frame 资产）
//   - first_last_frame:       1 张首帧图 + 1 张尾帧图
//   - multi_keyframe:         ≥ 3 个关键帧（keyframes 数组，含时间码）
//   - continue_from_previous: 上一段 Track 的尾帧已生成（previousTailReady = true）
//
// dependencyStatus = ready：所有缺失项为空
// dependencyStatus = blocked：至少一个缺失项 → UI 显示"还差什么"
// dependencyStatus = partial：部分缺失但不阻塞（如可选资源）

import type { StrategyId } from '../tracks/strategy-decision';

/** 依赖状态枚举 */
export type DependencyStatus = 'ready' | 'blocked' | 'partial';

/** 缺失项类型枚举（修复入口跳转用 — spec L482） */
export type MissingItemType =
  | 'reference_asset'
  | 'first_frame'
  | 'last_frame'
  | 'keyframe'
  | 'previous_tail'
  | 'text_prompt';

/** 缺失项明细（让 UI 知道"还差什么 + 跳哪里修") */
export interface MissingItem {
  type: MissingItemType;
  label: string; // 中文标签，UI 显示
  required: number; // 需要数量
  current: number; // 当前数量
  fixEntry?: string; // 修复入口路径（如 "/projects/{name}/?tab=assets"）
}

/** 检查结果 */
export interface DependencyCheckResult {
  status: DependencyStatus;
  strategy: StrategyId;
  missing: MissingItem[];
  blockers: MissingItem[]; // missing 中阻塞类（spec L482：阻塞才禁用提交）
  requirements: string[]; // 中文摘要，UI 顶部 toast
}

/** Track 上下文：检查依赖前必须先汇总好 */
export interface TrackContext {
  trackId: string;
  strategy: StrategyId;
  referenceAssetCount: number; // 参考图数量
  hasFirstFrame: boolean; // 是否已配置首帧资产
  hasLastFrame: boolean; // 是否已配置尾帧资产
  keyframeCount: number; // 关键帧数量
  hasPreviousTail: boolean; // 上一段尾帧是否已生成
  hasTextPrompt: boolean; // 是否有文本指令
  projectIdentifier?: string; // 修复入口跳转用
}

/**
 * 策略 → 必需依赖清单（spec L222 + L223）
 */
export const STRATEGY_DEPENDENCIES: Record<
  StrategyId,
  Array<{ type: MissingItemType; label: string; required: number }>
> = {
  multi_reference_text: [
    { type: 'reference_asset', label: '参考图（≥ 2 张）', required: 2 },
    { type: 'text_prompt', label: '文本指令', required: 1 },
  ],
  start_frame: [
    { type: 'first_frame', label: '首帧图', required: 1 },
    { type: 'text_prompt', label: '文本指令', required: 1 },
  ],
  first_last_frame: [
    { type: 'first_frame', label: '首帧图', required: 1 },
    { type: 'last_frame', label: '尾帧图', required: 1 },
  ],
  multi_keyframe: [
    { type: 'keyframe', label: '关键帧（≥ 3 个）', required: 3 },
  ],
  continue_from_previous: [
    { type: 'previous_tail', label: '上一段尾帧（已生成）', required: 1 },
    { type: 'text_prompt', label: '文本指令', required: 1 },
  ],
};

/** 给修复入口生成跳转链接（spec L482 修复入口） */
function getFixEntry(missingType: MissingItemType, projectIdentifier?: string): string | undefined {
  if (!projectIdentifier) return undefined;
  const encoded = encodeURIComponent(projectIdentifier);
  switch (missingType) {
    case 'reference_asset':
    case 'first_frame':
    case 'last_frame':
    case 'keyframe':
      return `/projects/${encoded}?tab=assets`;
    case 'previous_tail':
      return `/projects/${encoded}/auto-run`;
    case 'text_prompt':
      return `/projects/${encoded}?tab=production`;
    default:
      return `/projects/${encoded}`;
  }
}

/**
 * 取 ctx 中对应字段的当前数量
 */
function currentCount(ctx: TrackContext, type: MissingItemType): number {
  switch (type) {
    case 'reference_asset':
      return ctx.referenceAssetCount;
    case 'first_frame':
      return ctx.hasFirstFrame ? 1 : 0;
    case 'last_frame':
      return ctx.hasLastFrame ? 1 : 0;
    case 'keyframe':
      return ctx.keyframeCount;
    case 'previous_tail':
      return ctx.hasPreviousTail ? 1 : 0;
    case 'text_prompt':
      return ctx.hasTextPrompt ? 1 : 0;
    default:
      return 0;
  }
}

/**
 * 检查单个 Track 的策略依赖（核心函数）
 * - 返回 ready：可提交
 * - 返回 blocked：禁用提交按钮，UI 显示缺失清单 + 修复入口
 */
export function checkDependencies(ctx: TrackContext): DependencyCheckResult {
  const rules = STRATEGY_DEPENDENCIES[ctx.strategy] || [];
  const missing: MissingItem[] = [];
  const requirements: string[] = [];

  for (const rule of rules) {
    const current = currentCount(ctx, rule.type);
    requirements.push(`${rule.label}（需 ${rule.required} / 当前 ${current}）`);
    if (current < rule.required) {
      missing.push({
        type: rule.type,
        label: rule.label,
        required: rule.required,
        current,
        fixEntry: getFixEntry(rule.type, ctx.projectIdentifier),
      });
    }
  }

  // blockers = missing（本 phase 所有缺失项都阻塞提交，spec L482）
  const blockers = missing;
  const status: DependencyStatus = missing.length === 0 ? 'ready' : 'blocked';

  return { status, strategy: ctx.strategy, missing, blockers, requirements };
}

/**
 * 批量检查（path5 提交前调用，给整批 Track 返回 ready/blocked 摘要）
 */
export function evaluateDependencies(contexts: TrackContext[]): {
  overallStatus: DependencyStatus;
  ready: TrackContext[];
  blocked: Array<{ ctx: TrackContext; result: DependencyCheckResult }>;
  results: DependencyCheckResult[];
} {
  const results: DependencyCheckResult[] = [];
  const ready: TrackContext[] = [];
  const blocked: Array<{ ctx: TrackContext; result: DependencyCheckResult }> = [];

  for (const ctx of contexts) {
    const result = checkDependencies(ctx);
    results.push(result);
    if (result.status === 'ready') ready.push(ctx);
    else blocked.push({ ctx, result });
  }

  const overallStatus: DependencyStatus = blocked.length === 0 ? 'ready' : 'blocked';
  return { overallStatus, ready, blocked, results };
}

/**
 * 总结依赖检查摘要（给 UI 顶部 toast）
 */
export function summarizeDependencyCheck(results: DependencyCheckResult[]): string {
  const blocked = results.filter((r) => r.status === 'blocked').length;
  const total = results.length;
  if (blocked === 0) return `全部 ${total} 个 Track 依赖就绪`;
  return `${blocked}/${total} 个 Track 缺依赖，需要先在资产页修复后才能提交`;
}
