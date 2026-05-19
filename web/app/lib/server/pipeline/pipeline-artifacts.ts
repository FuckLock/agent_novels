// runtime: nodejs
// pipeline-artifacts: 5 类产物（DirectorAnalysis / DirectorPlan / Storyboard / PromptPack / TrackPlan）
// 统一 Artifact 写入入口。
//
// 注：seedance-executor 已在各 stage 处理产物落盘（novels/ 文件系统）。
// 本文件是 Phase 2 Artifact 仓库的薄封装，把 5 类产物显式登记到 artifacts 表，
// 以便管线视图 / 审计层能基于 Artifact ID 反查。

import { writeArtifact, type ArtifactRecord } from '../artifacts/store';

export type PipelineProductKey =
  | 'DirectorAnalysis'
  | 'DirectorPlan'
  | 'Storyboard'
  | 'PromptPack'
  | 'TrackPlan';

const PRODUCT_MIME: Record<PipelineProductKey, string> = {
  DirectorAnalysis: 'text/markdown',
  DirectorPlan: 'application/json',
  Storyboard: 'application/json',
  PromptPack: 'text/markdown',
  TrackPlan: 'application/json',
};

const PRODUCT_OBJECT_TYPE: Record<PipelineProductKey, string> = {
  DirectorAnalysis: 'pipeline.director_analysis',
  DirectorPlan: 'pipeline.director_plan',
  Storyboard: 'pipeline.storyboard',
  PromptPack: 'pipeline.prompt_pack',
  TrackPlan: 'pipeline.track_plan',
};

export interface PersistArtifactInput {
  productKey: PipelineProductKey;
  episode: number;
  projectName: string;
  content: string | Buffer | Uint8Array;
}

/**
 * 把 5 类产物之一登记为 Artifact（复用 Phase 2 artifacts/store）
 * 若 seedance-executor 已经写过文件系统产物，此处仍可独立调用以把内容快照入 artifacts 表
 */
export async function persistArtifact(input: PersistArtifactInput): Promise<ArtifactRecord> {
  const objectId = `${input.projectName}::ep${input.episode}::${input.productKey}`;
  return writeArtifact({
    content: input.content,
    mimeType: PRODUCT_MIME[input.productKey],
    sourceType: 'system',
    originalName: `${input.productKey}-${input.projectName}-ep${input.episode}`,
    objectType: PRODUCT_OBJECT_TYPE[input.productKey],
    objectId,
  });
}

/**
 * 批量登记多个产物（A→C3 完成时由 auto-run 收尾时调用）
 */
export async function persistPipelineArtifacts(
  projectName: string,
  episode: number,
  products: Array<{ productKey: PipelineProductKey; content: string | Buffer }>,
): Promise<ArtifactRecord[]> {
  const results: ArtifactRecord[] = [];
  for (const product of products) {
    const record = await persistArtifact({
      projectName,
      episode,
      productKey: product.productKey,
      content: product.content,
    });
    results.push(record);
  }
  return results;
}

/**
 * 列出本 phase 已知的 5 类产物 key（用于 UI 渲染产物索引列）
 */
export function listProductKeys(): PipelineProductKey[] {
  return ['DirectorAnalysis', 'DirectorPlan', 'Storyboard', 'PromptPack', 'TrackPlan'];
}

export function describeProductKey(key: PipelineProductKey): { mime: string; objectType: string } {
  return { mime: PRODUCT_MIME[key], objectType: PRODUCT_OBJECT_TYPE[key] };
}
