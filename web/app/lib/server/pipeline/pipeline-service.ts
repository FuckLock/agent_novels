// runtime: nodejs
// pipeline-service: A→E 节点状态机 + 产物索引（统一抽象层）
// 包装 seedance-executor / detectPipelineStatus，不替换
//
// 节点边界：
//   A   导演分析（DirectorAnalysis）
//   B   资产管理（assets）
//   C1  导演规划（DirectorPlan）
//   C2  分镜表（Storyboard）
//   C3  分镜提示词（PromptPack）
//   D   视频生成（VideoTasks，~sd auto 不含 D — 见 auto-run-service）
//   E   粗剪交付（TrackPlan，Phase 9 接入）
//
// 产物索引：DirectorAnalysis / DirectorPlan / Storyboard / PromptPack / TrackPlan

import { detectPipelineStatus, type PipelineStatus } from '@/app/lib/novels';
import { getSeedanceFlowStatus } from '@/app/lib/agent/seedance-executor';

export type PipelineNode = 'A' | 'B' | 'C1' | 'C2' | 'C3' | 'D' | 'E';

export const PIPELINE_NODES: PipelineNode[] = ['A', 'B', 'C1', 'C2', 'C3', 'D', 'E'];

export type NodeStatus =
  | 'pending'
  | 'partial'
  | 'running'
  | 'completed'
  | 'blocked'
  | 'failed';

export interface NodeState {
  node: PipelineNode;
  status: NodeStatus;
  label: string;
  productKey: ProductKey | null;
}

export type ProductKey =
  | 'DirectorAnalysis'
  | 'DirectorPlan'
  | 'Storyboard'
  | 'PromptPack'
  | 'TrackPlan';

export interface ProductIndexEntry {
  productKey: ProductKey;
  node: PipelineNode;
  artifactId?: string;
  artifactRef?: string;
  productPath?: string;
  present: boolean;
}

export interface PipelineSnapshot {
  projectName: string;
  episode: number;
  nodes: NodeState[];
  productIndex: ProductIndexEntry[];
  rawStatus: PipelineStatus;
  generatedAt: number;
}

const NODE_LABEL: Record<PipelineNode, string> = {
  A: 'A 导演分析',
  B: 'B 资产管理',
  C1: 'C1 导演规划',
  C2: 'C2 分镜表',
  C3: 'C3 分镜提示词',
  D: 'D 视频生成',
  E: 'E 粗剪交付',
};

const NODE_PRODUCT: Record<PipelineNode, ProductKey | null> = {
  A: 'DirectorAnalysis',
  B: null, // 资产不属于 5 类核心产物
  C1: 'DirectorPlan',
  C2: 'Storyboard',
  C3: 'PromptPack',
  D: null, // 视频任务作为独立任务流处理
  E: 'TrackPlan',
};

// 把 PipelineStatus 各字段映射为 NodeStatus（partial 视为 running 中间态）
function mapNodeStatus(node: PipelineNode, raw: PipelineStatus): NodeStatus {
  switch (node) {
    case 'A':
      return raw.director === 'completed' ? 'completed' : raw.director === 'running' ? 'running' : 'pending';
    case 'B':
      return raw.assets === 'completed' ? 'completed' : raw.assets === 'partial' ? 'partial' : 'pending';
    case 'C1':
      return raw.directorPlan === 'completed' ? 'completed' : raw.directorPlan === 'running' ? 'running' : 'pending';
    case 'C2':
      return raw.storyboardTable === 'completed' ? 'completed' : raw.storyboardTable === 'running' ? 'running' : 'pending';
    case 'C3':
      return raw.prompts === 'completed' ? 'completed' : raw.prompts === 'running' ? 'running' : 'pending';
    case 'D':
      return raw.videos === 'completed' ? 'completed' : raw.videos === 'partial' ? 'partial' : 'pending';
    case 'E':
      return 'pending'; // Phase 9 接入，本 phase 暂为 pending
    default:
      return 'pending';
  }
}

function buildNodeStates(raw: PipelineStatus): NodeState[] {
  return PIPELINE_NODES.map<NodeState>((node) => ({
    node,
    status: mapNodeStatus(node, raw),
    label: NODE_LABEL[node],
    productKey: NODE_PRODUCT[node],
  }));
}

function buildProductIndex(raw: PipelineStatus, projectName: string, episode: number): ProductIndexEntry[] {
  const epDir = `novels/${projectName}/seedance/ep${episode}`;
  const productPath: Record<ProductKey, string> = {
    DirectorAnalysis: `${epDir}/01-director.md`,
    DirectorPlan: `${epDir}/director-plan.json`,
    Storyboard: `${epDir}/storyboard-table.json`,
    PromptPack: `${epDir}/02-prompts.md`,
    TrackPlan: `${epDir}/track-plan.json`,
  };

  const presence: Record<ProductKey, boolean> = {
    DirectorAnalysis: raw.director === 'completed',
    DirectorPlan: raw.directorPlan === 'completed',
    Storyboard: raw.storyboardTable === 'completed',
    PromptPack: raw.prompts === 'completed',
    TrackPlan: false, // Phase 9
  };

  return (Object.keys(presence) as ProductKey[]).map<ProductIndexEntry>((productKey) => {
    const nodeEntry = (Object.entries(NODE_PRODUCT) as Array<[PipelineNode, ProductKey | null]>).find(
      ([, key]) => key === productKey,
    );
    return {
      productKey,
      node: nodeEntry ? nodeEntry[0] : 'A',
      productPath: productPath[productKey],
      present: presence[productKey],
    };
  });
}

/**
 * 获取管线状态（含节点状态机 + 产物索引）
 * 包装 detectPipelineStatus，复用 seedance 体系产物探测
 */
export async function getPipelineState(
  projectName: string,
  episode: number,
): Promise<PipelineSnapshot> {
  const raw = await detectPipelineStatus(projectName, episode);
  return {
    projectName,
    episode,
    nodes: buildNodeStates(raw),
    productIndex: buildProductIndex(raw, projectName, episode),
    rawStatus: raw,
    generatedAt: Date.now(),
  };
}

/**
 * 获取完整管线快照（含 seedance 任务历史）
 * 当 caller 需要看到任务级别细节（每个 stage 的 AgentRun / 失败原因）时调用
 */
export async function buildPipelineState(
  projectName: string,
  episode: number,
) {
  const [snapshot, seedanceStatus] = await Promise.all([
    getPipelineState(projectName, episode),
    getSeedanceFlowStatus(projectName, episode).catch(() => null),
  ]);
  return {
    ...snapshot,
    seedanceTasks: seedanceStatus?.tasks || [],
    latestByStage: seedanceStatus?.latestByStage || null,
  };
}

/**
 * 检查 ~sd auto 是否可继续推进（C3 之前任一节点 pending → 可继续；
 * 全部 ≥ C3 completed → 进入用户确认 D 阶段）
 */
export function describePipeline(snapshot: PipelineSnapshot): {
  ready: boolean;
  nextNode: PipelineNode | null;
  reachedC3: boolean;
  needsDConfirm: boolean;
} {
  const stages: PipelineNode[] = ['A', 'B', 'C1', 'C2', 'C3'];
  let nextNode: PipelineNode | null = null;
  for (const node of stages) {
    const state = snapshot.nodes.find((n) => n.node === node);
    if (!state) continue;
    if (state.status !== 'completed') {
      nextNode = node;
      break;
    }
  }
  const reachedC3 = stages.every((node) => {
    const state = snapshot.nodes.find((n) => n.node === node);
    return state?.status === 'completed';
  });
  return {
    ready: !!nextNode,
    nextNode,
    reachedC3,
    needsDConfirm: reachedC3, // C3 完成后必须用户在路径 5 确认 D
  };
}

export const PIPELINE_NODE_LABELS = NODE_LABEL;
