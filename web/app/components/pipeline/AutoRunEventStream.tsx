'use client';

import { useEffect, useState, useRef } from 'react';

export interface AutoRunEventStreamProps {
  projectName: string;
  episode: number | null;
  // 轮询间隔（毫秒），默认 3000
  pollIntervalMs?: number;
}

interface RemoteEvent {
  ts: number;
  level: 'info' | 'warn' | 'error';
  stage: string | null;
  message: string;
}

interface RemoteState {
  runId: string;
  status: string;
  currentStage: string | null;
  completedStages: string[];
  events: RemoteEvent[];
  needsDConfirm: boolean;
  errorMessage?: string;
}

/**
 * AutoRunEventStream
 * 展示 ~sd auto 编排器的事件流（Agent 日志 + 任务事件）。
 * 实现：使用 setInterval 轮询 /api/projects/[name]/auto-run?episode=N
 *      （未引入 SSE/EventSource 以避免 Next.js dev 端 socket 中断成本）
 */
export default function AutoRunEventStream({ projectName, episode, pollIntervalMs = 3000 }: AutoRunEventStreamProps) {
  const [state, setState] = useState<RemoteState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!episode) return undefined;
    let cancelled = false;
    const encodedName = encodeURIComponent(projectName);

    const fetchEvents = async () => {
      try {
        const res = await fetch(`/api/projects/${encodedName}/auto-run?episode=${episode}`);
        if (!res.ok) {
          if (!cancelled) setError(`HTTP ${res.status}`);
          return;
        }
        const data = (await res.json()) as { autoRun: RemoteState | null };
        if (cancelled) return;
        setError(null);
        setState(data.autoRun);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '网络错误');
      }
    };

    void fetchEvents();
    const id = setInterval(() => void fetchEvents(), pollIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [projectName, episode, pollIntervalMs]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [state?.events.length]);

  if (!episode) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 text-sm text-gray-500">
        请选择集数以查看 ~sd auto 事件流。
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-amber-300 bg-amber-50 rounded-lg p-4 text-sm text-amber-700">
        事件流加载失败：{error}
      </div>
    );
  }

  if (!state) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 text-sm text-gray-400">
        当前集数尚无 auto-run 任务记录。
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between text-sm">
        <div>
          <span className="font-medium">状态</span>
          <span className="ml-2 text-gray-600">{state.status}</span>
          {state.currentStage && (
            <span className="ml-3 text-xs text-gray-500">当前阶段 {state.currentStage}</span>
          )}
        </div>
        <div className="text-xs text-gray-500">已完成 {state.completedStages.join('/')}</div>
      </div>

      {state.needsDConfirm && (
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 text-sm text-amber-800 flex items-center justify-between">
          <div>
            <span className="font-medium">A→C3 完成。</span>
            <span className="ml-1">D 阶段（视频生成）成本高，请进入路径 5 / D 提交确认。</span>
          </div>
          <a
            href={`/projects/${encodeURIComponent(projectName)}/path5`}
            className="ml-3 px-3 py-1 rounded-md bg-amber-200 hover:bg-amber-300 text-xs font-medium text-amber-900"
          >
            进入路径 5
          </a>
        </div>
      )}

      {state.errorMessage && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-sm text-red-700">
          错误：{state.errorMessage}
        </div>
      )}

      <div ref={listRef} className="max-h-72 overflow-auto px-4 py-2 space-y-1 font-mono text-xs">
        {state.events.length === 0 ? (
          <div className="text-gray-400">尚无事件…</div>
        ) : (
          state.events.map((ev, idx) => (
            <div
              key={`${ev.ts}-${idx}`}
              className={
                ev.level === 'error'
                  ? 'text-red-700'
                  : ev.level === 'warn'
                    ? 'text-amber-700'
                    : 'text-gray-700'
              }
            >
              <span className="text-gray-400">{new Date(ev.ts).toLocaleTimeString()}</span>
              {ev.stage && <span className="ml-2 text-gray-500">[{ev.stage}]</span>}
              <span className="ml-2">{ev.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
