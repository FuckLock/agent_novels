// 视频质量评估协议（Phase 10）
//
// 本文件定义 RoughCut 成片质量评估的"6 维度协议 + 7 类问题枚举"，
// 来源：Product-Spec.md
//   - spec L70：成片质量是头号验收维度
//   - spec L86：QualityGate 6 维系统初筛
//   - spec L88：分母、样本范围和豁免项必须写入 QualityGate
//   - spec L102：metric / scope / denominator / passedCount / failedItems /
//                confidence / samplingRule / reviewSource / operatorDecision / waiverReason
//   - spec L336：QualityGate 暴露口径"质量检查"
//   - spec L553：retry prompt 略有变体（7 类问题）
//   - spec L598：D 任务网格问题类型
//   - spec L865：Track 问题类型 7 类枚举
//
// 注意：MVP 实现允许"AI 初筛 + 人工确认"组合（spec L87 / L102），
// 协议函数（evaluateVideoQuality）当前返回静态默认值，不调用真实视觉判定 API；
// 真实 AI 视觉判定留 Phase 11+ 接入。本文件不引入 fetch / axios。

/* ============================================================================
 * 6 维度协议字面量（spec L86 + L88 + L102 硬约束）
 *
 * character_consistency  角色一致性
 * composition            构图正确
 * motion_readability     动作可读
 * lip_sync               嘴型状态
 * cross_shot_continuity  跨镜连续性
 * compliance             合规通过
 * ========================================================================== */

export const VIDEO_QUALITY_METRICS = [
  'character_consistency',
  'composition',
  'motion_readability',
  'lip_sync',
  'cross_shot_continuity',
  'compliance',
] as const;

export type VideoQualityMetric = (typeof VIDEO_QUALITY_METRICS)[number];

export const VIDEO_QUALITY_METRIC_LABELS: Record<VideoQualityMetric, string> = {
  character_consistency: '角色一致',
  composition: '构图',
  motion_readability: '动作可读',
  lip_sync: '嘴型',
  cross_shot_continuity: '跨镜连续性',
  compliance: '合规',
};

/* ============================================================================
 * 7 类问题枚举（spec L553 + L598 + L865 硬约束）
 *
 * action_mismatch    动作不对（动作与剧本意图不匹配）
 * character_drift    角色漂移（脸、服装、发型与 AssetVersion 冲突）
 * composition_wrong  构图不对（景别、朝向偏差）
 * lip_sync_wrong     嘴型不对（开闭口与对白意图反向）
 * duration_wrong     时长不对（超过/不足 Track 时长目标）
 * props_missing      道具缺失（应出现的道具未呈现）
 * compliance_failed  合规失败（敏感画面 / 授权未知）
 * ========================================================================== */

export const ISSUE_TYPES = [
  'action_mismatch',
  'character_drift',
  'composition_wrong',
  'lip_sync_wrong',
  'duration_wrong',
  'props_missing',
  'compliance_failed',
] as const;

export type TakeIssueType = (typeof ISSUE_TYPES)[number];
export type IssueType = TakeIssueType;

export const ISSUE_TYPE_LABELS: Record<TakeIssueType, string> = {
  action_mismatch: '动作不对',
  character_drift: '角色漂移',
  composition_wrong: '构图不对',
  lip_sync_wrong: '嘴型不对',
  duration_wrong: '时长不对',
  props_missing: '道具缺失',
  compliance_failed: '合规失败',
};

/* ============================================================================
 * QualityGate 状态 + 审核来源（spec L851 + L86-87 + L765）
 * ========================================================================== */

export type QualityGateStatus = 'unchecked' | 'passed' | 'failed' | 'waived';

export const REVIEW_SOURCES = ['agent_self_review', 'manual_review', 'ai_assisted_manual'] as const;
export type ReviewSource = (typeof REVIEW_SOURCES)[number];

/* ============================================================================
 * 6 维度协议结构（spec L102）
 *
 * 每个维度协议必须包含：
 *   metric / scope / denominator / passedCount / failedItems /
 *   confidence / samplingRule / reviewSource
 *
 * 后续 operatorDecision + waiverReason 在 QualityGate 表层记录（豁免轨道）。
 * ========================================================================== */

export interface VideoQualityProtocol {
  metric: VideoQualityMetric;
  scope: 'track' | 'track_segment' | 'episode' | 'rough_cut';
  denominator: number;
  passedCount: number;
  failedItems: Array<{
    targetId: string;
    issueType?: TakeIssueType;
    note?: string;
  }>;
  confidence: number;
  samplingRule: string;
  reviewSource: ReviewSource;
}

/* ============================================================================
 * 6 维度协议元数据（spec L86 + L88 分母 / 样本范围 / 通过口径）
 *
 * 每条 metric 注释其"按 X 计算分母"的口径，供协议消费者参考。
 * ========================================================================== */

// 分母计算口径（spec L88 + L93-100）：
//   character_consistency  按主要角色出现次数（主要角色 = 该 Episode 出现 >= 2 Track 或 continuity_critical）
//   composition            按 Track 逐项（每个 locked take 必查）
//   motion_readability     按带动作目标的 TrackSegment（无动作目标段落不进入分母）
//   lip_sync               按带说话/嘴型意图的 TrackSegment（无台词段落不进入分母）
//   cross_shot_continuity  按相邻 Track 对（同场景 + continue_from_previous 必查；跨场景不进入分母）
//   compliance             按 locked take + RoughCut（导出前必查）
export const VIDEO_QUALITY_PROTOCOL_META: Record<
  VideoQualityMetric,
  { scope: VideoQualityProtocol['scope']; samplingRule: string; passThreshold: number }
> = {
  character_consistency: {
    scope: 'track',
    samplingRule: '主要角色每 Track 抽首/中/尾 3 帧',
    passThreshold: 0.95,
  },
  composition: {
    scope: 'track',
    samplingRule: '每个 locked take 必查；以 Storyboard / TrackPlan 景别为基准',
    passThreshold: 0.9,
  },
  motion_readability: {
    scope: 'track_segment',
    samplingRule: '只统计带明确动作目标的 TrackSegment',
    passThreshold: 0.9,
  },
  lip_sync: {
    scope: 'track_segment',
    samplingRule: '只统计带说话/嘴型意图的 TrackSegment；抽中点帧',
    passThreshold: 0.85,
  },
  cross_shot_continuity: {
    scope: 'track',
    samplingRule: '相邻 Track 对（同场景或 continue_from_previous 必查）',
    passThreshold: 0.9,
  },
  compliance: {
    scope: 'rough_cut',
    samplingRule: '所有 locked take + RoughCut 导出前必查',
    passThreshold: 1.0,
  },
};

/* ============================================================================
 * 协议工厂 / 检查函数（spec L86 系统初筛入口）
 * ========================================================================== */

export interface EvaluateVideoQualityInput {
  takeId: string;
  trackId?: string;
  metric: VideoQualityMetric;
  denominator?: number;
  reviewSource?: ReviewSource;
}

/**
 * MVP 协议检查（spec L87 + L102 允许"AI 初筛 + 人工确认"组合）。
 *
 * 当前实现：返回静态默认协议结果（passedCount = denominator，failedItems 空）。
 * 真实 AI 视觉判定 / 帧抽取 / 人工抽检对接留 Phase 11+。
 * 本函数不调用 HTTP，符合 K1（真实费用安全）。
 */
export function evaluateVideoQuality(input: EvaluateVideoQualityInput): VideoQualityProtocol {
  const meta = VIDEO_QUALITY_PROTOCOL_META[input.metric];
  const denominator = Math.max(0, input.denominator ?? 1);
  return {
    metric: input.metric,
    scope: meta.scope,
    denominator,
    passedCount: denominator,
    failedItems: [],
    confidence: 0,
    samplingRule: meta.samplingRule,
    reviewSource: input.reviewSource ?? 'agent_self_review',
  };
}

/**
 * 协议工厂：批量为单个 Take 生成 6 维度的默认协议结构。
 */
export function buildDefaultVideoQualityProtocols(
  takeId: string,
  options: { denominator?: number; reviewSource?: ReviewSource } = {},
): VideoQualityProtocol[] {
  return VIDEO_QUALITY_METRICS.map((metric) =>
    evaluateVideoQuality({
      takeId,
      metric,
      denominator: options.denominator,
      reviewSource: options.reviewSource,
    }),
  );
}

/**
 * 通过率（passedCount / denominator）；分母为 0 视为 1（无分母时视为合规）。
 */
export function computePassRate(protocol: VideoQualityProtocol): number {
  if (protocol.denominator <= 0) return 1;
  return protocol.passedCount / protocol.denominator;
}

/**
 * 判断单维度是否通过：通过率 >= passThreshold && failedItems 空（compliance 强制）。
 */
export function isMetricPassed(protocol: VideoQualityProtocol): boolean {
  const meta = VIDEO_QUALITY_PROTOCOL_META[protocol.metric];
  if (protocol.metric === 'compliance' && protocol.failedItems.length > 0) return false;
  return computePassRate(protocol) >= meta.passThreshold;
}
