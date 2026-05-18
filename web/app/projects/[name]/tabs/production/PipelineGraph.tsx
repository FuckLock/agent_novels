'use client';

import React from 'react';
import type { PipelineStatus } from '@/app/lib/novels';

type NodeId = 'A' | 'B' | 'C1' | 'C2' | 'C3' | 'D';
type NodeStatus = 'pending' | 'completed' | 'partial' | 'running';

interface NodeDef {
  id: NodeId;
  label: string;
  statusKey: keyof PipelineStatus;
}

const NODES: NodeDef[] = [
  { id: 'A', label: 'A 导演分析', statusKey: 'director' },
  { id: 'B', label: 'B 资产管理', statusKey: 'assets' },
  { id: 'C1', label: 'C1 导演规划', statusKey: 'directorPlan' },
  { id: 'C2', label: 'C2 分镜表', statusKey: 'storyboardTable' },
  { id: 'C3', label: 'C3 提示词', statusKey: 'prompts' },
  { id: 'D', label: 'D 视频', statusKey: 'videos' },
];

/** 将 PipelineStatus 中的值映射为统一的 NodeStatus */
function resolveStatus(value: string): NodeStatus {
  if (value === 'completed') return 'completed';
  if (value === 'partial') return 'partial';
  if (value === 'running') return 'running';
  return 'pending';
}

/** 节点图标 SVG path */
function NodeIcon({ nodeId, status }: { nodeId: NodeId; status: NodeStatus }) {
  const isCompleted = status === 'completed';

  // 已完成显示勾号
  if (isCompleted) {
    return (
      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    );
  }

  const colorClass =
    status === 'running' ? 'text-purple-600' : status === 'partial' ? 'text-yellow-600' : 'text-gray-400';

  const paths: Record<NodeId, string> = {
    A: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
    B: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01',
    C1: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
    C2: 'M3 10h18M3 14h18M3 6h18M3 18h18',
    C3: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
    D: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  };

  return (
    <svg className={`w-4 h-4 ${colorClass}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={paths[nodeId]} />
    </svg>
  );
}

interface PipelineGraphProps {
  pipelineStatus: PipelineStatus | null;
  activeNode?: NodeId | null;
  onNodeClick?: (nodeId: NodeId) => void;
}

export default function PipelineGraph({
  pipelineStatus,
  activeNode,
  onNodeClick,
}: PipelineGraphProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-start overflow-x-auto px-2 py-3">
        {NODES.map((node, idx) => {
          const status = pipelineStatus
            ? resolveStatus(pipelineStatus[node.statusKey])
            : 'pending';
          const isActive = activeNode === node.id;
          const isCompleted = status === 'completed';
          const isRunning = status === 'running';
          const isPartial = status === 'partial';

          // 图标容器样式
          let iconContainerClass = 'w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ';
          if (isCompleted) {
            iconContainerClass += 'bg-green-50 border-2 border-green-400';
          } else if (isRunning) {
            iconContainerClass += 'bg-purple-50 border-2 border-purple-400 shadow-[0_0_0_4px_rgba(139,92,246,0.12)]';
          } else if (isPartial) {
            iconContainerClass += 'bg-yellow-50 border-2 border-yellow-400';
          } else {
            iconContainerClass += 'bg-gray-100 border-2 border-gray-200';
          }

          // 节点名称样式
          let labelClass = 'text-xs mt-2 text-center whitespace-nowrap ';
          if (isCompleted) {
            labelClass += 'text-green-700';
          } else if (isRunning) {
            labelClass += 'text-purple-600 font-medium';
          } else if (isPartial) {
            labelClass += 'text-yellow-700';
          } else {
            labelClass += 'text-gray-400';
          }

          // 连接线样式
          let lineClass = '';
          if (idx > 0) {
            const prevStatus = pipelineStatus
              ? resolveStatus(pipelineStatus[NODES[idx - 1].statusKey])
              : 'pending';
            const prevDone = prevStatus === 'completed';
            if (prevDone && isCompleted) {
              lineClass = 'h-[2px] bg-green-400';
            } else if (prevDone && !isCompleted) {
              lineClass = 'h-[2px] border-t-2 border-dashed border-gray-200 bg-transparent';
            } else {
              lineClass = 'h-[2px] bg-gray-200';
            }
          }

          return (
            <React.Fragment key={node.id}>
              {/* 连接线 — 独立 flex item，flex-1 均分 */}
              {idx > 0 && (
                <div className="flex-1 flex items-center min-w-[24px] mt-5">
                  <div className={`w-full ${lineClass}`} />
                </div>
              )}

              {/* 节点 — shrink-0 固定宽度 */}
              <div
                className={`flex flex-col items-center shrink-0 cursor-pointer group/node transition-transform duration-150 hover:scale-105 ${isActive ? 'scale-110' : ''}`}
                onClick={() => {
                  if (onNodeClick) {
                    onNodeClick(node.id);
                  }
                }}
              >
                <div className={`${iconContainerClass}${isActive ? ' ring-2 ring-offset-2 ring-purple-400' : ''} group-hover/node:shadow-md transition-shadow`}>
                  <NodeIcon nodeId={node.id} status={status} />
                </div>
                <span className={`${labelClass}${isActive ? ' !text-purple-600 !font-semibold' : ''}`}>{node.label}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
