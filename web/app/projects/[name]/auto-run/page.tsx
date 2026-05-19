'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import AutoRunEventStream from '@/app/components/pipeline/AutoRunEventStream';

/**
 * /projects/[name]/auto-run — 自动管线运行独立大屏
 *
 * 5 种视图模式（沿用 Product-Spec.md#5.0 路径 0 + 5.5 路径 5）：
 *   mode 1: A→C3 跑通进度（运行中视图）
 *   mode 2: C3 完成确认（A→C3 完成、D 提交前的检阅态）
 *   mode 3: D 提交确认入口（跳转路径 5，D 阶段成本警示）
 *   mode 4: 路径 5 进行中（视频任务跟踪占位）
 *   mode 5: 全部完成（粗剪交付占位）
 *
 * 本 phase 至少把 mode 1 / mode 2 / mode 3 渲染为可交互区域；mode 4 / mode 5 为占位标识。
 */

interface PipelineNode {
  node: string;
  status: string;
  label: string;
}

interface PipelineSnapshot {
  nodes: PipelineNode[];
  productIndex: Array<{ productKey: string; node: string; present: boolean; productPath?: string }>;
  generatedAt: number;
}

interface AutoRunSnapshot {
  status: string;
  currentStage: string | null;
  completedStages: string[];
  needsDConfirm: boolean;
  events: Array<{ ts: number; level: string; stage: string | null; message: string }>;
}

interface PipelineApiResponse {
  snapshot: PipelineSnapshot;
  description: { reachedC3: boolean; needsDConfirm: boolean; nextNode: string | null };
  autoRun: AutoRunSnapshot | null;
}

type ViewMode = 1 | 2 | 3 | 4 | 5;

const VIEW_MODE_TITLE: Record<ViewMode, string> = {
  1: '模式 1 · A→C3 跑通进度',
  2: '模式 2 · C3 完成确认',
  3: '模式 3 · D 提交确认入口',
  4: '模式 4 · 路径 5 进行中',
  5: '模式 5 · 全部完成',
};

function pickViewMode(data: PipelineApiResponse | null): ViewMode {
  if (!data) return 1;
  if (!data.description.reachedC3) return 1;
  if (data.description.reachedC3 && !data.autoRun?.needsDConfirm) return 2;
  if (data.description.needsDConfirm) return 3;
  return 4;
}

export default function AutoRunDashboardPage() {
  const params = useParams<{ name: string }>();
  const rawName = params?.name || '';
  const projectName = useMemo(() => {
    try {
      return decodeURIComponent(rawName);
    } catch {
      return rawName;
    }
  }, [rawName]);

  const [episode, setEpisode] = useState<number>(1);
  const [data, setData] = useState<PipelineApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const encodedName = useMemo(() => encodeURIComponent(projectName), [projectName]);

  const loadPipeline = useCallback(
    async (silent = false) => {
      if (!episode) return;
      if (!silent) setLoading(true);
      try {
        const res = await fetch(`/api/projects/${encodedName}/pipeline?episode=${episode}&detail=1`);
        if (!res.ok) {
          if (!silent) setData(null);
          return;
        }
        const payload = (await res.json()) as PipelineApiResponse;
        setData(payload);
      } catch {
        if (!silent) setData(null);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [encodedName, episode],
  );

  useEffect(() => {
    void loadPipeline();
    const interval = setInterval(() => void loadPipeline(true), 5000);
    return () => clearInterval(interval);
  }, [loadPipeline]);

  const callAction = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      setActionMsg(null);
      try {
        const res = await fetch(`/api/projects/${encodedName}/auto-run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, episode, ...extra }),
        });
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setActionMsg(`操作失败：${payload.error || res.status}`);
          return;
        }
        setActionMsg(`${action} 成功`);
        void loadPipeline(true);
      } catch (err) {
        setActionMsg(`网络错误：${err instanceof Error ? err.message : '未知'}`);
      }
    },
    [encodedName, episode, loadPipeline],
  );

  const viewMode = pickViewMode(data);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">自动管线运行 / ~sd auto</h1>
          <p className="mt-1 text-sm text-gray-500">
            项目 {projectName} · 视图 {VIEW_MODE_TITLE[viewMode]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">集数</label>
          <input
            type="number"
            min={1}
            value={episode}
            onChange={(e) => setEpisode(Math.max(1, Number(e.target.value) || 1))}
            className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
      </header>

      {/* mode 1 / 2：A→C3 阶段进度 */}
      <section className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-medium text-gray-700">阶段进度（A→C3）</h2>
        {loading ? (
          <p className="mt-2 text-sm text-gray-400">加载中…</p>
        ) : data ? (
          <div className="mt-2 grid grid-cols-5 gap-2">
            {data.snapshot.nodes
              .filter((n) => ['A', 'B', 'C1', 'C2', 'C3'].includes(n.node))
              .map((n) => (
                <div
                  key={n.node}
                  className={`rounded-md border p-3 text-center text-sm ${
                    n.status === 'completed'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : n.status === 'running'
                        ? 'border-blue-300 bg-blue-50 text-blue-800'
                        : 'border-gray-200 bg-gray-50 text-gray-500'
                  }`}
                >
                  <div className="text-xs">{n.label}</div>
                  <div className="mt-1 font-mono text-xs">{n.status}</div>
                </div>
              ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-400">未加载到数据</p>
        )}
      </section>

      {/* 控制按钮 */}
      <section className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void callAction('start')}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          启动自动 ~sd auto
        </button>
        <button
          type="button"
          onClick={() => void callAction('pause')}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          暂停
        </button>
        <button
          type="button"
          onClick={() => void callAction('resume')}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          恢复
        </button>
        <button
          type="button"
          onClick={() => void callAction('terminate')}
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-100"
        >
          终止（不可撤销）
        </button>
        {actionMsg && <span className="text-xs text-gray-500">{actionMsg}</span>}
      </section>

      {/* mode 3：C3 完成 → D 提交确认入口（amber 警示） */}
      {data?.description.reachedC3 && (
        <section className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-800">D 提交确认（视频生成成本警示）</h2>
          <p className="mt-1 text-sm text-amber-700">
            A→C3 已完成。D 阶段视频生成最为烧钱，~sd auto 不会自动进入。请确认后进入路径 5 / D 提交确认。
          </p>
          <div className="mt-2 flex gap-2">
            <a
              href={`/projects/${encodedName}/path5`}
              className="rounded-md bg-amber-200 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-300"
            >
              进入路径 5
            </a>
            <span className="text-xs text-amber-700">（不可撤销操作，请二次确认）</span>
          </div>
        </section>
      )}

      {/* Agent 日志 + 任务事件流 */}
      <section className="mb-4">
        <h2 className="mb-2 text-sm font-medium text-gray-700">Agent 日志 / 任务事件流</h2>
        <AutoRunEventStream projectName={projectName} episode={episode} />
      </section>

      {/* 产物摘要 */}
      <section className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-medium text-gray-700">产物摘要</h2>
        {data?.snapshot.productIndex.length ? (
          <ul className="mt-2 space-y-1 text-xs text-gray-600">
            {data.snapshot.productIndex.map((p) => (
              <li key={p.productKey} className="flex justify-between">
                <span>
                  {p.productKey} <span className="text-gray-400">({p.node})</span>
                </span>
                <span className={p.present ? 'text-emerald-600' : 'text-gray-400'}>
                  {p.present ? '已存在' : '待生成'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-gray-400">暂无产物</p>
        )}
      </section>

      {/* mode 4 / mode 5 占位 */}
      <section className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
          <h3 className="text-sm font-medium text-gray-700">模式 4 · 路径 5 进行中</h3>
          <p className="mt-1 text-xs text-gray-500">D 阶段视频任务跟踪（占位，Phase 8 接入）</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
          <h3 className="text-sm font-medium text-gray-700">模式 5 · 全部完成</h3>
          <p className="mt-1 text-xs text-gray-500">粗剪交付（占位，Phase 9 接入 TrackPlan）</p>
        </div>
      </section>

      {/* Token / 预算占位（设计意图占位） */}
      <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-medium text-gray-700">Token / 预算</h2>
        <p className="mt-1 text-xs text-gray-500">
          Token 和预算指标待 Phase 5 AgentRun + UsageRecord 链路全量贯通后渲染（占位）。
        </p>
      </section>
    </div>
  );
}
