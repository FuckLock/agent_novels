// runtime: nodejs
// strategy-decision: D 阶段视频生成策略决策（系统决策为主，spec L462-468）
//
// 5 策略 ID（严格遵循 spec L462-468，**禁止拼写错误**）：
//   - multi_reference_text       多参考直出（多张参考图 + 文本指令 → 一次性生成）
//   - start_frame                仅首帧（只锚定首帧画面，运动由 prompt 描述）
//   - first_last_frame           首尾帧（锚定首末两帧，中间过渡由模型补全）
//   - multi_keyframe             多关键帧（多个关键帧锚定，连续动作精细控制）
//   - continue_from_previous     承接上一段尾帧（上一 Track 的末帧 = 本 Track 首帧）
//
// 决策函数 decideStrategy：根据 Track 内容（时长 / 视觉状态变化 / 是否有上一段尾帧 /
// 关键帧数 / 参考图数量）选择最合适的策略，返回 { strategyId, reason }。
// reason 是简短中文理由（spec L478：UI 显示"系统使用了策略 X + 理由"）。

/** 5 策略 ID 联合类型（严禁拼写错误 — 见 spec L462-468） */
export type StrategyId =
  | 'multi_reference_text'
  | 'start_frame'
  | 'first_last_frame'
  | 'multi_keyframe'
  | 'continue_from_previous';

/** 全部 5 策略 ID 常量数组（供 video-capability-matrix / dependency-check 枚举） */
export const STRATEGY_IDS: readonly StrategyId[] = [
  'multi_reference_text',
  'start_frame',
  'first_last_frame',
  'multi_keyframe',
  'continue_from_previous',
] as const;

/** 中文 UI 名（spec L462-468 用户语言映射） */
export const STRATEGY_LABEL: Record<StrategyId, string> = {
  multi_reference_text: '多参考直出',
  start_frame: '仅首帧',
  first_last_frame: '首尾帧',
  multi_keyframe: '多关键帧',
  continue_from_previous: '承接上一段尾帧',
};

/**
 * 策略输入要求 + 输出特征客观描述（spec L478：reason 字段，禁止"漂亮 / 流畅"等形容词）
 */
export const STRATEGY_DESCRIPTION: Record<StrategyId, { input: string; output: string }> = {
  multi_reference_text: {
    input: '输入要求：≥ 2 张参考图 + 文本指令；适合静态状态或缓慢运动场景',
    output: '输出特征：一次性直出，无中间关键帧约束，运动幅度受 prompt 控制',
  },
  start_frame: {
    input: '输入要求：1 张首帧图 + 文本指令；适合短时长（≤ 5 秒）镜头',
    output: '输出特征：仅锚定首帧画面，后续运动由模型推演',
  },
  first_last_frame: {
    input: '输入要求：首帧 + 尾帧两张图；适合视觉状态明确变化（动作起止清晰）',
    output: '输出特征：中间过渡由模型补全，时长由首尾间隔决定',
  },
  multi_keyframe: {
    input: '输入要求：≥ 3 个关键帧（含时间码）；适合长时长 / 复杂动作镜头',
    output: '输出特征：关键帧间精细插值，可控性最高',
  },
  continue_from_previous: {
    input: '输入要求：上一段视频的尾帧（自动取）+ 文本指令；适合连续叙事镜头',
    output: '输出特征：保证 Track 间画面衔接连续，禁止跳切',
  },
};

/** 决策输入：从 Track 数据中提取的关键特征 */
export interface DecisionInput {
  /** Track 时长（秒），用于区分短镜头 / 长镜头 */
  durationSeconds: number;
  /** 视觉状态变化幅度（0 静止 / 1 缓慢 / 2 明显 / 3 剧烈） */
  visualStateChange: 0 | 1 | 2 | 3;
  /** 用户提供的关键帧数量 */
  keyframeCount: number;
  /** 用户提供的参考图数量（不含关键帧） */
  referenceCount: number;
  /** 是否有上一段 Track 的尾帧可承接 */
  hasPreviousTail: boolean;
  /** 是否要求与上一段连续（叙事连贯性） */
  requireContinuity: boolean;
  /** 模型能力提示（如某模型不支持 multi_keyframe，可作为后备） */
  modelSupports?: Partial<Record<StrategyId, boolean>>;
}

/** 决策结果（含理由，spec L478） */
export interface DecisionResult {
  strategyId: StrategyId;
  reason: string;
  rationale: string[]; // 多条判断维度，UI 可折叠显示
}

/**
 * 决策函数 decideStrategy：根据 Track 特征 + 模型能力，选出最合适的策略。
 *
 * 判断维度（≥ 3 条 if/case 分支，反映多策略覆盖）：
 *   1. 用户显式连续性要求 + 有上一段尾帧 → continue_from_previous
 *   2. ≥ 3 关键帧 → multi_keyframe（长动作精细控制）
 *   3. 1 关键帧 + 时长 ≤ 5s → start_frame（短镜头仅首帧）
 *   4. 2 关键帧（首 + 尾）+ 视觉状态明显变化 → first_last_frame
 *   5. ≥ 2 参考图 + 静态/缓慢运动 → multi_reference_text
 *   6. 默认 fallback：start_frame（最低输入要求）
 *
 * 返回的 reason 不含"漂亮 / 优雅 / 流畅"等主观形容词，而是客观输入特征。
 */
export function decideStrategy(input: DecisionInput): DecisionResult {
  const rationale: string[] = [];

  // 规则 1：连续性优先
  if (input.requireContinuity && input.hasPreviousTail) {
    const sid: StrategyId = 'continue_from_previous';
    if (input.modelSupports?.[sid] !== false) {
      rationale.push('用户要求叙事连续 + 有上一段尾帧');
      return {
        strategyId: sid,
        reason: `承接上一段尾帧（连续叙事 + 时长 ${input.durationSeconds}s）`,
        rationale,
      };
    }
    rationale.push('用户要求连续但模型不支持 continue_from_previous，降级判断');
  }

  // 规则 2：多关键帧（复杂动作）
  if (input.keyframeCount >= 3) {
    const sid: StrategyId = 'multi_keyframe';
    if (input.modelSupports?.[sid] !== false) {
      rationale.push(`关键帧数 ${input.keyframeCount} ≥ 3，需要精细动作控制`);
      return {
        strategyId: sid,
        reason: `多关键帧（${input.keyframeCount} 个关键帧 / 时长 ${input.durationSeconds}s）`,
        rationale,
      };
    }
    rationale.push('多关键帧模型不支持，降级');
  }

  // 规则 3：首尾帧（明显视觉状态变化 + 2 关键帧）
  if (input.keyframeCount === 2 && input.visualStateChange >= 2) {
    const sid: StrategyId = 'first_last_frame';
    if (input.modelSupports?.[sid] !== false) {
      rationale.push('两个关键帧（首 + 尾）+ 视觉状态明显变化');
      return {
        strategyId: sid,
        reason: `首尾帧（视觉状态变化幅度 ${input.visualStateChange}）`,
        rationale,
      };
    }
  }

  // 规则 4：多参考直出（静态/缓慢运动 + 多参考图）
  if (input.referenceCount >= 2 && input.visualStateChange <= 1) {
    const sid: StrategyId = 'multi_reference_text';
    if (input.modelSupports?.[sid] !== false) {
      rationale.push(`参考图数 ${input.referenceCount} + 视觉状态变化幅度 ${input.visualStateChange}（静态/缓慢）`);
      return {
        strategyId: sid,
        reason: `多参考直出（${input.referenceCount} 参考图 / 缓慢运动）`,
        rationale,
      };
    }
  }

  // 规则 5：短镜头仅首帧（≤ 5s + 1 关键帧）
  if (input.durationSeconds <= 5 && input.keyframeCount <= 1) {
    const sid: StrategyId = 'start_frame';
    rationale.push(`短时长（${input.durationSeconds}s ≤ 5s）+ 关键帧数 ${input.keyframeCount}`);
    return {
      strategyId: sid,
      reason: `仅首帧（短镜头 ${input.durationSeconds}s）`,
      rationale,
    };
  }

  // 默认 fallback
  rationale.push('未匹配显式规则，回退默认 start_frame');
  return {
    strategyId: 'start_frame',
    reason: '默认仅首帧（输入要求最低）',
    rationale,
  };
}

/**
 * 获取策略中文 UI 名（供 UI / API 响应）
 */
export function getStrategyLabel(strategyId: StrategyId): string {
  return STRATEGY_LABEL[strategyId] || strategyId;
}

/**
 * 获取策略描述（输入要求 + 输出特征）
 */
export function getStrategyDescription(strategyId: StrategyId) {
  return STRATEGY_DESCRIPTION[strategyId] || { input: '未知策略', output: '未知' };
}

/**
 * 解释决策结果（供 UI 显示，spec L478）
 */
export function explainDecision(result: DecisionResult): string {
  return `${getStrategyLabel(result.strategyId)} · ${result.reason}`;
}
