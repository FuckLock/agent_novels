// runtime: nodejs
// video-capability-matrix: 视频模型 × 策略能力矩阵（不静默降级）
//
// spec L272 / L325 / L478 硬约束：
//   - 模型 × 策略不兼容时**必须显式抛错**（StrategyIncompatibleError）
//   - 禁止静默把不支持的策略改成"差不多"的策略
//   - 维度：max_references / max_duration / supported_resolutions / aspect_ratios
//
// DEFAULT_VIDEO_CAPABILITIES：默认能力表（兜底数据），让 ModelConfig.capabilities 字段缺失时仍可用。

import type { ModelConfig } from '@/app/lib/novels';
import { STRATEGY_IDS, type StrategyId } from '../tracks/strategy-decision';

/** 单条能力：modelId × strategy → 是否支持 + 维度上限 */
export interface CapabilityEntry {
  modelId: string;
  strategy: StrategyId;
  supported: boolean;
  maxReferences: number; // 0 = 不限 / -1 = 不支持
  maxDurationSeconds: number; // 单段视频最大时长
  maxResolution: string; // 最大分辨率（如 "1920x1080"）
  aspectRatios: string[]; // 支持比例（如 ["16:9", "9:16"]）
  notes: string;
}

/** 默认视频能力表（DEFAULT_VIDEO_CAPABILITIES） */
export const DEFAULT_VIDEO_CAPABILITIES: CapabilityEntry[] = [
  // seedance-video（已有 Phase 4 体系）：支持首帧 + 首尾帧
  {
    modelId: 'seedance-video',
    strategy: 'start_frame',
    supported: true,
    maxReferences: 1,
    maxDurationSeconds: 5,
    maxResolution: '1280x720',
    aspectRatios: ['16:9', '9:16'],
    notes: 'seedance v1：单首帧锚定，5 秒短镜头',
  },
  {
    modelId: 'seedance-video',
    strategy: 'first_last_frame',
    supported: true,
    maxReferences: 2,
    maxDurationSeconds: 8,
    maxResolution: '1280x720',
    aspectRatios: ['16:9', '9:16'],
    notes: 'seedance v1：首尾帧锚定，模型补间',
  },
  {
    modelId: 'seedance-video',
    strategy: 'multi_keyframe',
    supported: false,
    maxReferences: -1,
    maxDurationSeconds: 0,
    maxResolution: '',
    aspectRatios: [],
    notes: 'seedance v1 暂不支持多关键帧',
  },
  {
    modelId: 'seedance-video',
    strategy: 'multi_reference_text',
    supported: true,
    maxReferences: 4,
    maxDurationSeconds: 6,
    maxResolution: '1280x720',
    aspectRatios: ['16:9', '9:16', '1:1'],
    notes: 'seedance v1：最多 4 张参考图 + 文本',
  },
  {
    modelId: 'seedance-video',
    strategy: 'continue_from_previous',
    supported: true,
    maxReferences: 1,
    maxDurationSeconds: 5,
    maxResolution: '1280x720',
    aspectRatios: ['16:9', '9:16'],
    notes: 'seedance v1：承接上一段，等价于 start_frame 加自动尾帧',
  },
];

/**
 * 不兼容错误：策略 × 模型不匹配时**显式抛出**（禁止静默切换）
 * spec L272 / L325 / L478 硬约束。
 */
export class StrategyIncompatibleError extends Error {
  modelId: string;
  strategy: StrategyId;
  detail: string;

  constructor(modelId: string, strategy: StrategyId, detail: string) {
    super(`策略 ${strategy} 与模型 ${modelId} 不兼容：${detail}（禁止静默降级）`);
    this.name = 'StrategyIncompatibleError';
    this.modelId = modelId;
    this.strategy = strategy;
    this.detail = detail;
  }
}

/**
 * 从 ModelConfig.capabilities 读取自定义能力，回退到默认表
 */
function getEntry(modelId: string, strategy: StrategyId, modelConfig?: ModelConfig | null): CapabilityEntry {
  // 优先从 ModelConfig.capabilities.strategies 读取（用 Record 索引访问绕过严格类型）
  const caps = modelConfig?.capabilities as unknown as Record<string, unknown> | undefined;
  const customMap = caps?.strategies as Record<string, Partial<CapabilityEntry>> | undefined;
  if (customMap && customMap[strategy]) {
    const c = customMap[strategy];
    return {
      modelId,
      strategy,
      supported: c.supported ?? false,
      maxReferences: c.maxReferences ?? 0,
      maxDurationSeconds: c.maxDurationSeconds ?? 0,
      maxResolution: c.maxResolution ?? '',
      aspectRatios: c.aspectRatios ?? [],
      notes: c.notes ?? '',
    };
  }
  // 回退默认表
  const fallback = DEFAULT_VIDEO_CAPABILITIES.find(
    (e) => e.modelId === modelId && e.strategy === strategy,
  );
  if (fallback) return fallback;

  // 既无自定义也无默认：标记为不支持
  return {
    modelId,
    strategy,
    supported: false,
    maxReferences: -1,
    maxDurationSeconds: 0,
    maxResolution: '',
    aspectRatios: [],
    notes: '未在能力矩阵中注册',
  };
}

/**
 * 检查策略是否被模型支持（返回 boolean，不抛错）
 */
export function isStrategySupported(
  modelId: string,
  strategy: StrategyId,
  modelConfig?: ModelConfig | null,
): boolean {
  return getEntry(modelId, strategy, modelConfig).supported;
}

/**
 * 检查兼容性（返回完整 entry + reason，不抛错）
 */
export function checkStrategyCompatibility(
  modelId: string,
  strategy: StrategyId,
  modelConfig?: ModelConfig | null,
): { compatible: boolean; entry: CapabilityEntry; reason: string } {
  const entry = getEntry(modelId, strategy, modelConfig);
  if (!entry.supported) {
    return {
      compatible: false,
      entry,
      reason: `模型 ${modelId} 不支持策略 ${strategy}：${entry.notes || '未注册'}`,
    };
  }
  return { compatible: true, entry, reason: '' };
}

/**
 * 断言兼容性（不兼容时**显式抛错** — 禁止静默降级）
 * spec L272 / L325 / L478 硬约束。
 */
export function assertStrategyCompatible(
  modelId: string,
  strategy: StrategyId,
  modelConfig?: ModelConfig | null,
): CapabilityEntry {
  const { compatible, entry, reason } = checkStrategyCompatibility(modelId, strategy, modelConfig);
  if (!compatible) {
    throw new StrategyIncompatibleError(modelId, strategy, reason);
  }
  return entry;
}

/**
 * 列出模型支持的所有策略
 */
export function getSupportedStrategies(
  modelId: string,
  modelConfig?: ModelConfig | null,
): StrategyId[] {
  return STRATEGY_IDS.filter((sid) => isStrategySupported(modelId, sid, modelConfig));
}

/**
 * 获取所有模型对某策略的支持情况（供 UI 切换提示）
 */
export function listModelsForStrategy(strategy: StrategyId): string[] {
  return Array.from(
    new Set(
      DEFAULT_VIDEO_CAPABILITIES.filter((e) => e.strategy === strategy && e.supported).map(
        (e) => e.modelId,
      ),
    ),
  );
}
