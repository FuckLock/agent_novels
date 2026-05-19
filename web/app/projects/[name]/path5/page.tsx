'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import TrackExpandedRow from '@/app/components/tracks/TrackExpandedRow';

/**
 * /projects/[name]/path5 — 路径 5 / D 提交确认页（Phase 7 链接目标）
 *
 * 5 维度展示（spec L382 模式 3 / L543）：
 *   1. 消费 Phase 7 pipeline reachedC3 / needsDConfirm（spec L539-541）
 *   2. Track 列表 + 策略 + 依赖状态
 *   3. 预算预估（占位 — Phase 9 接入真实定价）
 *   4. 并发上限（占位 — Phase 9 接入 真实并发服务 真实上限）
 *   5. amber 警示 + 二次确认（spec L552 D 阶段最烧钱）
 *
 * 缺依赖 → 禁用提交按钮（spec L482 硬约束）
 * reachedC3 = false → 引导回 /projects/[name]/auto-run（spec L539-541）
 *
 * 提交按钮**只**创建 AgentRun 'path5-submit' 占位 + toast "Phase 9 接入真实视频任务"
 * 严禁调用 Phase 9 视频任务接口（spec 硬约束，本 phase 边界）
 */

interface MissingItem {
  type: string;
  label: string;
  required: number;
  current: number;
  fixEntry?: string;
}

interface TrackData {
  id: string;
  orderIndex: number;
  objective: string;
  motion: string;
  shot: string;
  durationSeconds: number;
  strategy: string;
  strategyReason: string;
  dependencyStatus: 'ready' | 'blocked' | 'partial';
  dependencyMissing: MissingItem[];
  status: string;
}

interface PlanData {
  id: string;
  status: string;
  tracks: TrackData[];
}

interface Path5Response {
  reachedC3: boolean;
  needsDConfirm: boolean;
  plan: PlanData;
  dependencyEvaluation: {
    overallStatus: 'ready' | 'blocked' | 'partial';
    readyTrackIds: string[];
    blockedTrackIds: string[];
    summary: string;
  };
  budgetEstimate: {
    trackCount: number;
    readyCount: number;
    blockedCount: number;
    estimatedTokens: number;
    estimatedCostUsd: number;
    currency: string;
    notes: string;
  };
  concurrency: { maxConcurrent: number; notes: string };
  warning: string;
}

export default function Path5Page() {
  const params = useParams<{ name: string }>();
  const rawName = params?.name || '';
  const projectName = useMemo(() => {
    try {
      return decodeURIComponent(rawName);
    } catch {
      return rawName;
    }
  }, [rawName]);
  const encodedName = useMemo(() => encodeURIComponent(projectName), [projectName]);

  const [episode] = useState<number>(1);
  const [data, setData] = useState<Path5Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<{ ok?: boolean; message?: string; submitting?: boolean }>({});
  const [confirmStep, setConfirmStep] = useState<0 | 1>(0); // 0 = 未确认 / 1 = 二次确认

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${encodedName}/path5?episode=${episode}`);
      if (!res.ok) {
        setData(null);
        return;
      }
      const payload = (await res.json()) as Path5Response;
      setData(payload);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [encodedName, episode]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const isBlocked = data?.dependencyEvaluation.overallStatus === 'blocked';
  const blockedCount = data?.dependencyEvaluation.blockedTrackIds.length || 0;
  const readyCount = data?.dependencyEvaluation.readyTrackIds.length || 0;

  const handleSubmit = useCallback(async () => {
    if (!data || isBlocked) return;
    if (confirmStep === 0) {
      setConfirmStep(1);
      setSubmitState({ message: '请二次确认（不可撤销操作）' });
      return;
    }
    setSubmitState({ submitting: true, message: '提交中...' });
    try {
      const res = await fetch(`/api/projects/${encodedName}/path5`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episode }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; message?: string; agentRunId?: string };
      if (!res.ok) {
        setSubmitState({ ok: false, message: `提交失败：${payload.error || res.status}` });
        return;
      }
      setSubmitState({
        ok: true,
        message: `${payload.message || '提交成功'}（agentRunId=${payload.agentRunId || 'n/a'}） — Phase 9 接入真实视频任务`,
      });
      setConfirmStep(0);
      void loadData();
    } catch (err) {
      setSubmitState({ ok: false, message: `网络错误：${err instanceof Error ? err.message : '未知'}` });
    }
  }, [data, isBlocked, confirmStep, encodedName, episode, loadData]);

  // reachedC3 = false → 引导回 auto-run 大屏（spec L539-541 硬约束）
  if (!loading && data && !data.reachedC3) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--tf-bg-canvas)] p-6">
        <div className="max-w-md rounded-lg border border-amber-300 bg-amber-50 p-6 text-center">
          <h1 className="text-lg font-semibold text-amber-900">未完成 C3 阶段</h1>
          <p className="mt-2 text-sm text-amber-800">
            请先完成 A→C3 自动管线（导演 / 资产 / 导演规划 / 分镜表 / 分镜提示词），
            才能进入路径 5 / D 提交确认。
          </p>
          <a
            href={`/projects/${encodedName}/auto-run`}
            className="mt-4 inline-block rounded-md bg-amber-200 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-300"
          >
            返回 ~sd auto 大屏
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--tf-bg-canvas)] p-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-[var(--tf-text-primary)]">
          路径 5 · D 提交确认
        </h1>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          项目 {projectName} · 第 {episode} 集 · TrackPlan + 视频生成策略
        </p>
      </header>

      {/* amber 警示（spec L552 D 阶段最烧钱） */}
      <section className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
        <h2 className="text-sm font-semibold text-amber-900">
          视频生成成本警示（不可撤销）
        </h2>
        <p className="mt-1 text-sm text-amber-800">
          D 阶段（视频生成）是整个管线**最烧钱**的环节，~sd auto 不会自动进入。
          确认后将批量提交视频生成任务，**不可撤销**。
          {data?.warning && <span className="block mt-1 text-xs">{data.warning}</span>}
        </p>
      </section>

      {loading && (
        <div className="text-sm text-[var(--tf-text-muted)]">加载中...</div>
      )}

      {/* 5 维度展示 */}
      {!loading && data && (
        <>
          {/* 维度 1 + 2：Track 列表 + 策略 + 依赖 */}
          <section className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--tf-text-primary)]">
                Track 列表（{data.plan.tracks.length} 个）
              </h2>
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">
                  就绪 {readyCount}
                </span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                  缺依赖 {blockedCount}
                </span>
              </div>
            </div>
            <p className="mb-2 text-xs text-[var(--tf-text-muted)]">
              {data.dependencyEvaluation.summary}
            </p>

            {data.plan.tracks.length === 0 ? (
              <p className="text-sm text-[var(--tf-text-muted)]">
                当前 TrackPlan 没有 Track，请先在 ~sd auto 中完成 Track 生成。
              </p>
            ) : (
              <ul className="space-y-2">
                {data.plan.tracks.map((track) => (
                  <li key={track.id} className="rounded border border-gray-200">
                    <div
                      className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 ${
                        track.dependencyStatus === 'blocked' ? 'bg-amber-50' : ''
                      }`}
                      onClick={() =>
                        setExpandedTrackId(expandedTrackId === track.id ? null : track.id)
                      }
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-500">
                          #{track.orderIndex + 1}
                        </span>
                        <span className="text-[var(--tf-text-primary)]">
                          {track.objective || '（无目标）'}
                        </span>
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                          策略 {track.strategy}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            track.dependencyStatus === 'ready'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          依赖 {track.dependencyStatus === 'ready' ? '就绪' : '缺'}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">
                        {track.durationSeconds.toFixed(1)}s
                      </span>
                    </div>
                    {expandedTrackId === track.id && (
                      <TrackExpandedRow track={track} onClose={() => setExpandedTrackId(null)} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 维度 3：预算预估 */}
          <section className="mb-4 grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="text-xs font-medium text-[var(--tf-text-muted)]">预算预估</h3>
              <p className="mt-1 text-lg font-semibold text-[var(--tf-text-primary)]">
                ~${data.budgetEstimate.estimatedCostUsd.toFixed(2)} {data.budgetEstimate.currency}
              </p>
              <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">
                {data.budgetEstimate.trackCount} Track · 预估{' '}
                {data.budgetEstimate.estimatedTokens.toLocaleString()} tokens
              </p>
              <p className="mt-1 text-xs text-gray-400">{data.budgetEstimate.notes}</p>
            </div>

            {/* 维度 4：并发上限 */}
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="text-xs font-medium text-[var(--tf-text-muted)]">并发上限</h3>
              <p className="mt-1 text-lg font-semibold text-[var(--tf-text-primary)]">
                {data.concurrency.maxConcurrent} 并发
              </p>
              <p className="mt-1 text-xs text-gray-400">{data.concurrency.notes}</p>
            </div>
          </section>

          {/* 缺依赖警告 + 修复入口（spec L482） */}
          {isBlocked && (
            <section className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
              <p className="font-medium text-amber-900">
                {blockedCount} 个 Track 缺依赖，无法提交。
              </p>
              <p className="mt-1 text-xs text-amber-800">
                点开 Track 行查看缺什么 + 修复入口。常见修复路径：
                <a
                  href={`/projects/${encodedName}?tab=assets`}
                  className="ml-2 text-blue-700 underline"
                >
                  → 资产页
                </a>
              </p>
            </section>
          )}

          {/* 维度 5：amber 提交按钮 + 二次确认 */}
          <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
            <h2 className="text-sm font-semibold text-amber-900">
              批量提交（路径 5 / D 阶段）
            </h2>
            <p className="mt-1 text-xs text-amber-800">
              {isBlocked
                ? '禁用：缺依赖时不允许提交（spec 硬约束）'
                : confirmStep === 0
                ? '点击下方按钮发起首次提交（将进入二次确认）'
                : '点击"确认提交"完成不可撤销操作'}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                disabled={isBlocked || submitState.submitting}
                onClick={() => void handleSubmit()}
                className={`rounded-md px-4 py-2 text-sm font-medium ${
                  isBlocked || submitState.submitting
                    ? 'cursor-not-allowed bg-gray-200 text-gray-400'
                    : confirmStep === 1
                    ? 'bg-amber-600 text-white hover:bg-amber-700'
                    : 'bg-amber-200 text-amber-900 hover:bg-amber-300'
                }`}
              >
                {submitState.submitting
                  ? '提交中...'
                  : confirmStep === 1
                  ? '确认提交（不可撤销）'
                  : '发起提交'}
              </button>
              {confirmStep === 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmStep(0);
                    setSubmitState({});
                  }}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  取消
                </button>
              )}
              {submitState.message && (
                <span
                  className={`text-xs ${
                    submitState.ok
                      ? 'text-emerald-700'
                      : submitState.ok === false
                      ? 'text-red-700'
                      : 'text-amber-700'
                  }`}
                >
                  {submitState.message}
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-amber-700">
              注：本 phase 提交按钮仅创建 AgentRun `path5-submit` 占位，
              Phase 9 接入真实视频任务后才会真正下发视频生成请求。
            </p>
          </section>
        </>
      )}
    </div>
  );
}
