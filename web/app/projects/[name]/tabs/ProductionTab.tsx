'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ProjectDetail } from '../types';
import type { PipelineStatus } from '@/app/lib/novels';
import EpisodeDropdown from './production/EpisodeDropdown';
import type { EpisodeOption } from './production/EpisodeDropdown';
import PipelineGraph from './production/PipelineGraph';
import NodeDetailPanel from './production/NodeDetailPanel';
import ProductionChatPanel from './production/ProductionChatPanel';

// Phase 7: ~sd auto / 自动管线 入口（pipeline-service + auto-run-service）
// 保留 seedance 手动入口（manual 模式），新增一键全自动启动按钮跳转 /auto-run 大屏。

interface ProductionTabProps {
  project: ProjectDetail;
  encodedName: string;
  name: string;
  onReload: () => void;
}

export default function ProductionTab({ project, encodedName, name, onReload }: ProductionTabProps) {
  const scripts = project.scripts || [];

  // 集数列表
  const episodes: EpisodeOption[] = scripts.map((s) => ({
    episode: s.episode,
    name: s.name || `第${s.episode}集`,
  }));

  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(
    episodes.length > 0 ? episodes[0].episode : null
  );
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const hasUserInteracted = useRef(false);
  const [runningEpisodes, setRunningEpisodes] = useState<number[]>([]);

  // 加载管线状态（silent=true 时不触发 loading，用于轮询刷新）
  const loadPipelineStatus = useCallback((silent = false) => {
    if (!selectedEpisode) return;
    if (!silent) setLoading(true);
    fetch(`/api/projects/${encodedName}/seedance/${selectedEpisode}/pipeline-status`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.status) {
          setPipelineStatus(data.status);
        } else {
          setPipelineStatus(null);
        }
      })
      .catch(() => { if (!silent) setPipelineStatus(null); })
      .finally(() => { if (!silent) setLoading(false); });
  }, [selectedEpisode, encodedName]);

  useEffect(() => {
    loadPipelineStatus();
  }, [loadPipelineStatus]);

  // 有 running 状态时自动轮询，完成后停止
  useEffect(() => {
    const hasRunning = pipelineStatus && Object.values(pipelineStatus).includes('running');
    if (!hasRunning) return;
    const interval = setInterval(() => loadPipelineStatus(true), 3000);
    return () => clearInterval(interval);
  }, [pipelineStatus, loadPipelineStatus]);

  // 轮询跨集 running 状态
  useEffect(() => {
    let cancelled = false;

    const fetchRunningEpisodes = () => {
      fetch(`/api/projects/${encodedName}/running-episodes`)
        .then((res) => (res.ok ? res.json() : { episodes: [] }))
        .then((data) => {
          if (!cancelled) setRunningEpisodes(data.episodes || []);
        })
        .catch(() => {
          if (!cancelled) setRunningEpisodes([]);
        });
    };

    // 挂载时请求一次
    fetchRunningEpisodes();

    // 如果有 running episodes，每 5 秒轮询；否则不轮询
    const interval = setInterval(() => {
      // 读取最新值：利用 setState 回调获取
      setRunningEpisodes((prev) => {
        if (prev.length > 0) fetchRunningEpisodes();
        return prev;
      });
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [encodedName]);

  // 首次加载时，如果导演分析已完成，自动展开节点 A
  useEffect(() => {
    if (
      pipelineStatus &&
      pipelineStatus.director === 'completed' &&
      !hasUserInteracted.current
    ) {
      setExpandedNode('A');
    }
  }, [pipelineStatus]);

  // Agent 执行动作后更新管线状态
  const handlePipelineUpdate = useCallback((status: PipelineStatus) => {
    setPipelineStatus(status);
    onReload();
  }, [onReload]);

  // Phase 7 接入：~sd auto / pipeline-service 启动入口（手动 seedance 入口仍保留在右侧 ProductionChatPanel）
  const handleStartAutoRun = useCallback(async () => {
    if (!selectedEpisode) return;
    try {
      const res = await fetch(`/api/projects/${encodedName}/auto-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', episode: selectedEpisode }),
      });
      if (!res.ok && res.status !== 409 && res.status !== 202) {
        const payload = await res.json().catch(() => ({}));
        alert(`启动一键全自动失败：${(payload as { error?: string }).error || res.status}`);
        return;
      }
    } catch (err) {
      alert(`网络错误：${err instanceof Error ? err.message : '未知'}`);
      return;
    }
    // 跳转 auto-run 大屏（5 模式视图）
    window.location.href = `/projects/${encodedName}/auto-run`;
  }, [encodedName, selectedEpisode]);

  // 同时支持 Phase 7 pipeline-service 状态快照查询（与现有 seedance pipeline-status 并行）
  const fetchPipelineSnapshot = useCallback(async () => {
    if (!selectedEpisode) return;
    try {
      await fetch(`/api/projects/${encodedName}/pipeline?episode=${selectedEpisode}`);
    } catch {
      // 静默失败，不影响 manual 模式
    }
  }, [encodedName, selectedEpisode]);

  useEffect(() => {
    void fetchPipelineSnapshot();
  }, [fetchPipelineSnapshot]);

  return (
    <div className="flex h-full -m-6">
      {/* 左侧画布区 60% */}
      <div className="w-[60%] flex flex-col border-r border-gray-200 bg-gray-50">
        {/* 顶部：集数下拉选择器 + 一键全自动入口 */}
        <div className="px-5 py-4 border-b border-gray-200 bg-white shrink-0 flex items-center gap-3">
          <div className="flex-1">
            <EpisodeDropdown
              projectName={name}
              episodes={episodes}
              selectedEpisode={selectedEpisode}
              onSelect={setSelectedEpisode}
              runningEpisodes={runningEpisodes}
            />
          </div>
          <button
            type="button"
            onClick={() => void handleStartAutoRun()}
            disabled={!selectedEpisode}
            className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
            title="启动 ~sd auto（A→C3 自动管线；D 阶段需路径 5 确认）"
          >
            一键全自动 ~sd auto
          </button>
          <a
            href={`/projects/${encodedName}/auto-run`}
            className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50"
          >
            自动管线大屏
          </a>
        </div>

        {/* 跨集运行信息条：其他集有 running 任务时显示 */}
        {(() => {
          const otherRunning = runningEpisodes.filter((ep) => ep !== selectedEpisode);
          if (otherRunning.length === 0) return null;
          return (
            <div className="px-5 pt-4 shrink-0">
              <div className="flex items-center gap-2 px-4 py-2 bg-purple-50 border border-purple-200 rounded-lg text-sm">
                <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse shrink-0" />
                <span className="text-purple-700">
                  {otherRunning.map((ep) => `EP${String(ep).padStart(2, '0')}`).join('、')} 有任务正在运行中
                </span>
                <button
                  onClick={() => setSelectedEpisode(otherRunning[0])}
                  className="text-purple-600 hover:text-purple-800 underline ml-auto text-xs shrink-0"
                >
                  切换查看
                </button>
              </div>
            </div>
          );
        })()}

        {/* 管线节点图 */}
        <div className="px-5 py-4 shrink-0">
          {loading ? (
            <div className="bg-white border border-gray-200 rounded-xl p-6 flex items-center justify-center">
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                加载管线状态...
              </div>
            </div>
          ) : (
            <PipelineGraph
              pipelineStatus={pipelineStatus}
              activeNode={expandedNode as 'A' | 'B' | 'C1' | 'C2' | 'C3' | 'D' | null}
              onNodeClick={(nodeId) => {
                hasUserInteracted.current = true;
                setExpandedNode(nodeId);
              }}
            />
          )}
        </div>

        {/* 节点详情展开区 */}
        <div className="flex-1 overflow-auto px-5">
          {expandedNode && selectedEpisode ? (
            <div className="transition-all duration-300 ease-in-out mt-4 h-full">
              <NodeDetailPanel
                nodeId={expandedNode as 'A' | 'B' | 'C1' | 'C2' | 'C3' | 'D'}
                encodedName={encodedName}
                episode={selectedEpisode}
                onClose={() => { hasUserInteracted.current = true; setExpandedNode(null); }}
                promptsStatus={pipelineStatus?.prompts}
                nodeStatus={pipelineStatus?.[({
                  A: 'director', B: 'assets', C1: 'directorPlan',
                  C2: 'storyboardTable', C3: 'prompts', D: 'videos',
                } as Record<string, keyof import('@/app/lib/novels').PipelineStatus>)[expandedNode!]]}
              />
            </div>
          ) : (
            !selectedEpisode && (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                选择集数查看管线详情
              </div>
            )
          )}
        </div>
      </div>

      {/* 右侧对话面板 40% */}
      <div className="w-[40%] flex flex-col">
        <ProductionChatPanel
          episode={selectedEpisode}
          pipelineStatus={pipelineStatus}
          encodedName={encodedName}
          onPipelineUpdate={handlePipelineUpdate}
        />
      </div>
    </div>
  );
}
