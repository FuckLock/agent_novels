'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { PipelineStatus } from '@/app/lib/novels';
import type { ModelOption } from '../workbench/ModelSelector';
import ProductionModelSelector from './ProductionModelSelector';

/** 对话消息类型 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

/** 阶段标签配置 */
type StageId = 'A' | 'B' | 'C1' | 'C2' | 'C3' | 'D';
type DirectAction = 'director' | 'director_plan' | 'storyboard_table' | 'storyboard_prompts' | 'video_tasks' | 'next' | 'all';

interface SeedanceStreamEvent {
  type?: string;
  data?: string;
}

const STAGE_LABELS: Record<StageId, { label: string; bgClass: string; textClass: string }> = {
  A: { label: '导演分析', bgClass: 'bg-purple-50', textClass: 'text-purple-600' },
  B: { label: '资产管理', bgClass: 'bg-orange-50', textClass: 'text-orange-600' },
  C1: { label: '导演规划', bgClass: 'bg-blue-50', textClass: 'text-blue-600' },
  C2: { label: '分镜表', bgClass: 'bg-blue-50', textClass: 'text-blue-600' },
  C3: { label: '提示词', bgClass: 'bg-blue-50', textClass: 'text-blue-600' },
  D: { label: '视频生成', bgClass: 'bg-green-50', textClass: 'text-green-600' },
};

const STAGE_STATUS_KEY: Record<StageId, keyof PipelineStatus> = {
  A: 'director',
  B: 'assets',
  C1: 'directorPlan',
  C2: 'storyboardTable',
  C3: 'prompts',
  D: 'videos',
};

/** 根据管线状态推断当前阶段 */
function detectCurrentStage(status: PipelineStatus | null): StageId {
  if (!status) return 'A';
  if (status.director !== 'completed') return 'A';
  if (status.assets === 'pending') return 'B';
  if (status.directorPlan !== 'completed') return 'C1';
  if (status.storyboardTable !== 'completed') return 'C2';
  if (status.prompts !== 'completed') return 'C3';
  return 'D';
}

/** 生成管线状态摘要文本 */
function buildStatusSummary(status: PipelineStatus | null, episode: number | null): string {
  if (!episode) return '请选择集数开始制作。';
  if (!status) return `第${episode}集已选中，正在加载管线状态...`;

  const lines: string[] = [`第${episode}集管线状态摘要：`];
  const map: { key: keyof PipelineStatus; label: string }[] = [
    { key: 'director', label: 'A 导演分析' },
    { key: 'assets', label: 'B 资产管理' },
    { key: 'directorPlan', label: 'C1 导演规划' },
    { key: 'storyboardTable', label: 'C2 分镜表' },
    { key: 'prompts', label: 'C3 提示词' },
    { key: 'videos', label: 'D 视频' },
  ];

  for (const item of map) {
    const val = status[item.key];
    const icon = val === 'completed' ? '✓' : val === 'running' ? '⟳' : val === 'partial' ? '◐' : '○';
    const label = val === 'completed' ? '已完成' : val === 'running' ? '运行中' : val === 'partial' ? '部分完成' : '未开始';
    lines.push(`  ${icon} ${item.label}: ${label}`);
  }

  const hasRunning = Object.values(status).includes('running');
  if (hasRunning) {
    lines.push('');
    lines.push('有任务正在后台运行，请耐心等待完成。');
  } else {
    const stage = detectCurrentStage(status);
    const stageLabel = STAGE_LABELS[stage].label;
    lines.push('');
    lines.push(`当前待执行：${stageLabel}。请输入指令开始。`);
  }

  return lines.join('\n');
}

interface ProductionChatPanelProps {
  episode: number | null;
  pipelineStatus: PipelineStatus | null;
  encodedName: string;
  onPipelineUpdate?: (status: PipelineStatus) => void;
}

export default function ProductionChatPanel({
  episode,
  pipelineStatus,
  encodedName,
  onPipelineUpdate,
}: ProductionChatPanelProps) {
  const chatStorageKey = `toonflow:production:chat:${encodedName}:${episode}`;
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem(chatStorageKey);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevEpisodeRef = useRef<number | null>(null);

  // 模型列表和选中状态
  const [languageModels, setLanguageModels] = useState<ModelOption[]>([]);
  const [imageModels, setImageModels] = useState<ModelOption[]>([]);
  const [videoModels, setVideoModels] = useState<ModelOption[]>([]);
  const [selectedLanguageModelId, setSelectedLanguageModelId] = useState<string | null>(() => {
    try { return localStorage.getItem('toonflow:production:languageModelId'); } catch { return null; }
  });
  const [selectedImageModelId, setSelectedImageModelId] = useState<string | null>(() => {
    try { return localStorage.getItem('toonflow:production:imageModelId'); } catch { return null; }
  });
  const [selectedVideoModelId, setSelectedVideoModelId] = useState<string | null>(() => {
    try { return localStorage.getItem('toonflow:production:videoModelId'); } catch { return null; }
  });
  const [modelsLoading, setModelsLoading] = useState(true);

  // 获取模型列表
  useEffect(() => {
    let cancelled = false;
    async function fetchModels() {
      try {
        const modelsRes = await fetch('/api/settings/models');
        if (!modelsRes.ok) return;
        const data = await modelsRes.json();

        const toOptions = (list: Array<{ modelId: string; name: string; enabled?: boolean }>): ModelOption[] =>
          (list || [])
            .filter((m) => m.enabled !== false)
            .map((m) => ({ modelId: m.modelId, name: m.name, authMode: 'api' }));

        if (cancelled) return;

        const lang = toOptions(data.language);
        const img = toOptions(data.image);
        const vid = toOptions(data.video);

        setLanguageModels(lang);
        setImageModels(img);
        setVideoModels(vid);

        // 自动选中第一个（如果 localStorage 里的 id 不在列表中）
        if (lang.length > 0 && !lang.find((m) => m.modelId === selectedLanguageModelId)) {
          setSelectedLanguageModelId(lang[0].modelId);
          try { localStorage.setItem('toonflow:production:languageModelId', lang[0].modelId); } catch { /* noop */ }
        }
        if (img.length > 0 && !img.find((m) => m.modelId === selectedImageModelId)) {
          setSelectedImageModelId(img[0].modelId);
          try { localStorage.setItem('toonflow:production:imageModelId', img[0].modelId); } catch { /* noop */ }
        }
        if (vid.length > 0 && !vid.find((m) => m.modelId === selectedVideoModelId)) {
          setSelectedVideoModelId(vid[0].modelId);
          try { localStorage.setItem('toonflow:production:videoModelId', vid[0].modelId); } catch { /* noop */ }
        }
      } catch {
        // 获取失败静默处理
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    }
    fetchModels();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentStage = detectCurrentStage(pipelineStatus);
  const stageCfg = STAGE_LABELS[currentStage];

  /** 将 StageId 映射到 ProductionModelSelector 的 currentStage */
  const selectorStage: 'A' | 'B-polish' | 'B-image' | 'C' | 'D' | null = (() => {
    switch (currentStage) {
      case 'A': return 'A';
      case 'B': return 'B-polish';
      case 'C1': case 'C2': case 'C3': return 'C';
      case 'D': return 'D';
      default: return null;
    }
  })();

  // 集数变化时，重置对话；管线状态变化时，更新系统消息
  useEffect(() => {
    if (!episode) return;

    if (episode !== prevEpisodeRef.current) {
      prevEpisodeRef.current = episode;
      const summary = buildStatusSummary(pipelineStatus, episode);
      // 尝试从 sessionStorage 恢复已有对话
      const key = `toonflow:production:chat:${encodedName}:${episode}`;
      let restored: ChatMessage[] = [];
      try {
        const saved = sessionStorage.getItem(key);
        if (saved) restored = JSON.parse(saved);
      } catch { /* ignore */ }

      if (restored.length > 0) {
        // 恢复已有对话，只更新 system 消息
        const systemIdx = restored.findIndex(m => m.role === 'system');
        if (systemIdx >= 0) {
          restored[systemIdx] = { ...restored[systemIdx], content: summary };
        } else {
          restored.unshift({ id: 'system-init', role: 'system', content: summary, timestamp: Date.now() });
        }
        setMessages(restored);
      } else {
        // 全新对话
        const initMessages: ChatMessage[] = [
          { id: 'system-init', role: 'system', content: summary, timestamp: Date.now() },
        ];
        if (pipelineStatus) {
          if (pipelineStatus.directorPlan === 'running') {
            initMessages.push({ id: 'running-hint', role: 'assistant', content: '导演规划正在后台运行中，请耐心等待...\n\n完成后管线状态会自动更新。', timestamp: Date.now() });
          }
          if (pipelineStatus.storyboardTable === 'running') {
            initMessages.push({ id: 'running-hint', role: 'assistant', content: '分镜表正在后台构建中，请耐心等待...\n\n完成后管线状态会自动更新。', timestamp: Date.now() });
          }
          if (pipelineStatus.prompts === 'running') {
            initMessages.push({ id: 'running-hint-prompts', role: 'assistant', content: '分镜提示词正在后台生成中，请耐心等待...\n\n完成后管线状态会自动更新。', timestamp: Date.now() });
          }
        }
        setMessages(initMessages);
      }
    } else {
      // 同一集数，管线状态更新：更新已有系统消息
      const summary = buildStatusSummary(pipelineStatus, episode);
      setMessages(prev => {
        const systemIdx = prev.findIndex(m => m.role === 'system');
        if (systemIdx >= 0) {
          const updated = [...prev];
          updated[systemIdx] = { ...updated[systemIdx], content: summary };
          return updated;
        }
        return [{ id: 'system-init', role: 'system', content: summary, timestamp: Date.now() }, ...prev];
      });
    }
  }, [episode, pipelineStatus]);

  // 自动滚动到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // 持久化聊天消息到 sessionStorage
  useEffect(() => {
    if (messages.length > 0) {
      try { sessionStorage.setItem(chatStorageKey, JSON.stringify(messages)); } catch { /* ignore */ }
    }
  }, [messages, chatStorageKey]);

  // 已知指令 → 直接调对应 API（不走 chat 对话绕一圈）
  const DIRECT_ACTIONS: { pattern: RegExp; action: DirectAction }[] = [
    { pattern: /^(继续|下一步|执行下一步|开始下一步)$/i, action: 'next' },
    { pattern: /^(全部生成|都生成吧|全链路|从当前开始生成)$/i, action: 'all' },
    { pattern: /^(开始|重新生成)?\s*导演(分析|讲戏)\s*(开始|重新生成)?$/i, action: 'director' },
    { pattern: /^(开始|重新生成)?\s*导演规划\s*(开始|重新生成)?$/i, action: 'director_plan' },
    { pattern: /^(开始|构建|重新生成)?\s*分镜表\s*(开始|构建|重新生成)?$/i, action: 'storyboard_table' },
    { pattern: /^(开始|生成|重新生成)?\s*(分镜)?提示词\s*(开始|生成|重新生成)?$/i, action: 'storyboard_prompts' },
    { pattern: /^(开始|生成|重新生成)?\s*(D|视频|视频任务)\s*(开始|生成|重新生成)?$/i, action: 'video_tasks' },
  ];

  /** 直接执行导演分析（不经过 chat API） */
  const executeDirectorAnalysis = useCallback(async (assistantId: string) => {
    // 立即显示进度
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantId ? { ...m, content: '正在执行导演分析，请稍候...\n\n（AI 正在阅读剧本并生成导演讲戏本，这可能需要 30-60 秒）' } : m
      )
    );

    try {
      const res = await fetch(`/api/projects/${encodedName}/seedance/${episode}/director`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: selectedLanguageModelId || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '请求失败' }));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `导演分析执行失败：${errData.error || '请求失败'}` }
              : m
          )
        );
        return;
      }

      // 异步模式：后台执行中，轮询 pipeline-status 等待完成
      let pollCount = 0;
      const pollInterval = setInterval(async () => {
        pollCount++;
        if (pollCount > 120) {
          clearInterval(pollInterval);
          setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: '导演分析超时，请刷新页面查看是否已完成。' } : m));
          return;
        }
        try {
          const statusRes = await fetch(`/api/projects/${encodedName}/seedance/${episode}/pipeline-status`);
          if (!statusRes.ok) return;
          const statusData = await statusRes.json();
          if (statusData.status) {
            onPipelineUpdate?.(statusData.status);
            if (statusData.status.director === 'completed') {
              clearInterval(pollInterval);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: `✅ 导演分析已完成！\n\n下一步建议：前往「塑造」Tab 为资产生成提示词和图片，或输入其他指令。` }
                    : m
                )
              );
            }
          }
        } catch { /* ignore */ }
      }, 3000);
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: '导演分析执行失败：网络错误，请稍后重试。' }
            : m
        )
      );
    }
  }, [encodedName, episode, selectedLanguageModelId, onPipelineUpdate]);

  /** 直接执行导演规划（非阻塞：发起后轮询 pipeline status） */
  const executeDirectorPlan = useCallback(async (assistantId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantId ? { ...m, content: '正在执行导演规划，请稍候...\n\n（AI 正在基于导演分析和资产数据生成六维度导演规划，这可能需要 60-120 秒）' } : m
      )
    );

    try {
      const res = await fetch(`/api/projects/${encodedName}/seedance/${episode}/director-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: selectedLanguageModelId || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '请求失败' }));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `导演规划执行失败：${errData.error || '请求失败'}` }
              : m
          )
        );
        return;
      }

      // 后台已启动，轮询 pipeline status 直到完成
      let pollCount = 0;
      const MAX_POLLS = 60; // 最多轮询 60 次 × 3s = 3 分钟
      const pollInterval = setInterval(async () => {
        pollCount++;
        if (pollCount > MAX_POLLS) {
          clearInterval(pollInterval);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: '导演规划执行超时，请刷新页面查看是否已完成。' }
                : m
            )
          );
          return;
        }
        try {
          const statusRes = await fetch(`/api/projects/${encodedName}/seedance/${episode}/pipeline-status`);
          if (!statusRes.ok) return;
          const statusData = await statusRes.json();
          if (statusData.status) {
            onPipelineUpdate?.(statusData.status);
            if (statusData.status.directorPlan === 'completed') {
              clearInterval(pollInterval);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: '导演规划已完成！\n\n六维度导演规划已生成并保存。点击流程图中的 C1 节点查看详情。\n\n下一步建议：输入「分镜表」开始 C2 分镜表构建，或输入其他指令。' }
                    : m
                )
              );
            }
          }
        } catch { /* ignore */ }
      }, 3000);
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: '导演规划执行失败：网络错误，请稍后重试。' }
            : m
        )
      );
    }
  }, [encodedName, episode, selectedLanguageModelId, onPipelineUpdate]);

  const executeStoryboardTable = useCallback(async (assistantId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantId ? { ...m, content: '正在构建分镜表，请稍候...\n\n（AI 正在基于导演规划和资产数据生成结构化分镜表，这可能需要 60-120 秒）' } : m
      )
    );

    try {
      const res = await fetch(`/api/projects/${encodedName}/seedance/${episode}/storyboard-table`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: selectedLanguageModelId || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '请求失败' }));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `分镜表执行失败：${errData.error || '请求失败'}` }
              : m
          )
        );
        return;
      }

      let pollCount = 0;
      const MAX_POLLS = 60;
      const pollInterval = setInterval(async () => {
        pollCount++;
        if (pollCount > MAX_POLLS) {
          clearInterval(pollInterval);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: '分镜表生成超时，请刷新页面查看是否已完成。' }
                : m
            )
          );
          return;
        }
        try {
          const statusRes = await fetch(`/api/projects/${encodedName}/seedance/${episode}/pipeline-status`);
          if (!statusRes.ok) return;
          const statusData = await statusRes.json();
          if (statusData.status) {
            onPipelineUpdate?.(statusData.status);
            if (statusData.status.storyboardTable === 'completed') {
              clearInterval(pollInterval);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: '分镜表已完成！\n\n结构化分镜表已生成并保存。点击流程图中的 C2 节点查看详情。\n\n下一步建议：输入「分镜提示词」进入 C3 阶段，或输入其他指令。' }
                    : m
                )
              );
            }
          }
        } catch { /* ignore */ }
      }, 3000);
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: '分镜表执行失败：网络错误，请稍后重试。' }
            : m
        )
      );
    }
  }, [encodedName, episode, selectedLanguageModelId, onPipelineUpdate]);

  const executeStoryboardPrompts = useCallback(async (assistantId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantId ? { ...m, content: '正在生成分镜提示词，请稍候...\n\n（AI 正在基于分镜表为每个镜头编写 Seedance 2.0 视频提示词，这可能需要 2-5 分钟）' } : m
      )
    );
    try {
      const res = await fetch(`/api/projects/${encodedName}/seedance/${episode}/prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: selectedLanguageModelId || undefined }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '请求失败' }));
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: `提示词生成失败：${errData.error || '请求失败'}` } : m));
        return;
      }
      let pollCount = 0;
      const pollInterval = setInterval(async () => {
        pollCount++;
        if (pollCount > 120) { clearInterval(pollInterval); setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: '提示词生成超时，请刷新页面查看是否已完成。' } : m)); return; }
        try {
          const statusRes = await fetch(`/api/projects/${encodedName}/seedance/${episode}/pipeline-status`);
          if (!statusRes.ok) return;
          const statusData = await statusRes.json();
          if (statusData.status) {
            onPipelineUpdate?.(statusData.status);
            if (statusData.status.prompts === 'completed') {
              clearInterval(pollInterval);
              setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: '分镜提示词已完成！\n\n所有镜头的 Seedance 2.0 视频提示词已生成。点击流程图 C3 节点查看详情。' } : m));
            }
          }
        } catch { /* ignore */ }
      }, 3000);
    } catch {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: '提示词生成失败：网络错误，请稍后重试。' } : m));
    }
  }, [encodedName, episode, selectedLanguageModelId, onPipelineUpdate]);

  const executeSeedanceFlow = useCallback(async (
    assistantId: string,
    fromStage: StageId,
    toStage: StageId,
    label: string,
    modelId?: string
  ) => {
    if (!episode) return;

    const progressLines: string[] = [`正在执行${label}...`];
    const setAssistantContent = (content: string) => {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content } : m));
    };
    const pushProgress = (line: string) => {
      progressLines.push(line);
      setAssistantContent(progressLines.join('\n'));
    };

    try {
      const res = await fetch('/api/seedance/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: decodeURIComponent(encodedName),
          episode,
          fromStage,
          toStage,
          modelId: modelId || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '请求失败' }));
        setAssistantContent(`${label}执行失败：${errData.error || '请求失败'}`);
        return;
      }
      if (!res.body) {
        setAssistantContent(`${label}执行失败：服务端没有返回进度流。`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let doneSeen = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';

        for (const chunk of chunks) {
          const dataLine = chunk.split('\n').find((line) => line.startsWith('data: '));
          if (!dataLine) continue;

          let event: SeedanceStreamEvent;
          try {
            event = JSON.parse(dataLine.slice(6));
          } catch {
            continue;
          }

          if (event.type === 'status' && event.data) {
            pushProgress(event.data);
          } else if (event.type === 'content_saved' && event.data) {
            try {
              const saved = JSON.parse(event.data);
              if (saved.type === 'seedance-video-tasks') {
                pushProgress(`视频任务处理完成：共 ${saved.taskCount} 条，提交 ${saved.submittedCount ?? 0} 条，成功 ${saved.successCount ?? 0} 条，失败 ${saved.failedCount ?? 0} 条。`);
                pushProgress(`任务清单：${saved.filePath}`);
              }
            } catch {
              pushProgress('阶段产物已保存');
            }
          } else if (event.type === 'error' && event.data) {
            pushProgress(event.data);
          } else if (event.type === 'done') {
            doneSeen = true;
          }
        }
      }

      const statusRes = await fetch(`/api/seedance/status?projectName=${encodeURIComponent(decodeURIComponent(encodedName))}&episode=${episode}`);
      const statusData = await statusRes.json().catch(() => null);
      if (statusData?.pipeline) {
        onPipelineUpdate?.(statusData.pipeline);
      }

      const statusKey = STAGE_STATUS_KEY[toStage];
      const endStatus = statusData?.pipeline?.[statusKey];
      const suffix = endStatus === 'completed'
        ? '已完成。'
        : endStatus === 'partial'
          ? '已生成任务，等待后续真实视频产物。'
          : doneSeen
            ? '执行已结束，请查看产物。'
            : '执行结束但未收到完成标记，请刷新状态确认。';
      pushProgress(`${label}${suffix}`);
    } catch {
      setAssistantContent(`${label}执行失败：网络错误，请稍后重试。`);
    }
  }, [encodedName, episode, onPipelineUpdate]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !episode || sending) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setSending(true);

    const assistantId = `assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: 'assistant',
        content: '处理中...',
        timestamp: Date.now(),
      },
    ]);

    // 检查是否匹配已知指令 → 直接执行，不走 chat API
    const matchedAction = DIRECT_ACTIONS.find(a => a.pattern.test(text));
    if (matchedAction) {
      try {
        if (matchedAction.action === 'director') {
          await executeDirectorAnalysis(assistantId);
        } else if (matchedAction.action === 'director_plan') {
          await executeDirectorPlan(assistantId);
        } else if (matchedAction.action === 'storyboard_table') {
          await executeStoryboardTable(assistantId);
        } else if (matchedAction.action === 'storyboard_prompts') {
          await executeStoryboardPrompts(assistantId);
        } else if (matchedAction.action === 'video_tasks') {
          await executeSeedanceFlow(assistantId, 'D', 'D', '视频任务', selectedVideoModelId || undefined);
        } else if (matchedAction.action === 'next') {
          const nextStage = detectCurrentStage(pipelineStatus);
          const modelId = nextStage === 'D' ? selectedVideoModelId : selectedLanguageModelId;
          await executeSeedanceFlow(assistantId, nextStage, nextStage, STAGE_LABELS[nextStage].label, modelId || undefined);
        } else if (matchedAction.action === 'all') {
          const fromStage = detectCurrentStage(pipelineStatus);
          await executeSeedanceFlow(assistantId, fromStage, 'D', `从${STAGE_LABELS[fromStage].label}到视频任务`, selectedLanguageModelId || undefined);
        }
      } finally {
        setSending(false);
      }
      return;
    }

    // 其他消息走 chat API
    try {
      const res = await fetch(`/api/projects/${encodedName}/production/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          episode,
          pipelineStatus,
          languageModelId: selectedLanguageModelId || undefined,
          imageModelId: selectedImageModelId || undefined,
          videoModelId: selectedVideoModelId || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '请求失败' }));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `[错误] ${errData.error || '请求失败'}` }
              : m
          )
        );
        return;
      }

      const data = await res.json();
      const replyContent = data.reply || '（无回复）';

      // 如果 chat API 触发了后台任务，追加进度轮询
      if (data.actionResult?.action && data.actionResult?.success) {
        const actionLabel: Record<string, string> = {
          director_plan: '导演规划',
          storyboard_table: '分镜表',
          storyboard_prompts: '分镜提示词',
        };
        const statusKey: Record<string, keyof PipelineStatus> = {
          director_plan: 'directorPlan',
          storyboard_table: 'storyboardTable',
          storyboard_prompts: 'prompts',
        };
        const label = actionLabel[data.actionResult.action];
        const key = statusKey[data.actionResult.action];

        if (label && key) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: `${replyContent}\n\n正在后台生成${label}，请稍候...` } : m
            )
          );
          let pollCount = 0;
          const pollInterval = setInterval(async () => {
            pollCount++;
            if (pollCount > 120) {
              clearInterval(pollInterval);
              setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: `${label}生成超时，请刷新页面查看。` } : m));
              return;
            }
            try {
              const statusRes = await fetch(`/api/projects/${encodedName}/seedance/${episode}/pipeline-status`);
              if (!statusRes.ok) return;
              const statusData = await statusRes.json();
              if (statusData.status) {
                onPipelineUpdate?.(statusData.status);
                if (statusData.status[key] === 'completed') {
                  clearInterval(pollInterval);
                  setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: `${label}已完成！` } : m));
                }
              }
            } catch { /* ignore */ }
          }, 3000);
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: replyContent } : m
            )
          );
        }
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: replyContent } : m
          )
        );
      }

      if (data.pipelineStatus && onPipelineUpdate) {
        onPipelineUpdate(data.pipelineStatus);
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: '[错误] 网络请求失败，请检查连接后重试。' }
            : m
        )
      );
    } finally {
      setSending(false);
    }
  }, [inputText, episode, sending, encodedName, pipelineStatus, onPipelineUpdate, selectedLanguageModelId, selectedImageModelId, selectedVideoModelId, executeSeedanceFlow, executeDirectorAnalysis, executeDirectorPlan, executeStoryboardTable, executeStoryboardPrompts]);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 顶部：阶段标签栏 */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800">
            {episode ? `第${episode}集` : '未选择'}
          </span>
          <span className="text-gray-300 mx-1">-</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${stageCfg.bgClass} ${stageCfg.textClass}`}
          >
            {stageCfg.label}
          </span>
        </div>
        {/* 连接状态指示 */}
        <div className="flex items-center gap-1.5">
          {sending && (
            <span className="text-xs text-gray-400">处理中...</span>
          )}
          <span className={`w-2 h-2 rounded-full ${sending ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} title={sending ? '处理中' : '在线'} />
        </div>
      </div>

      {/* 消息列表 */}
      <div
        className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0"
        ref={scrollRef}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 h-full">
            <svg
              className="w-10 h-10 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            <span className="text-sm text-gray-500">选择集数开始制作</span>
            <span className="text-xs text-gray-400">AI 助手将引导你完成整个管线</span>
          </div>
        ) : (
          messages.map((msg, msgIdx) => {
            if (msg.role === 'system') {
              return (
                <div key={msg.id}>
                  <div className="text-xs text-gray-400 mb-1">系统</div>
                  <div className="bg-gray-50 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-600 max-w-[90%] whitespace-pre-line">
                    {msg.content}
                  </div>
                  {messages.length <= 1 && !sending && episode && (
                    <div className="mt-4 p-3 bg-purple-50 rounded-lg">
                      <p className="text-xs text-purple-600 mb-2">试试这些指令：</p>
                      <div className="flex flex-wrap gap-2">
                        {['开始导演分析', '全部生成', '查看当前状态'].map(cmd => (
                          <button
                            key={cmd}
                            onClick={() => { setInputText(cmd); }}
                            className="px-3 py-1 text-xs bg-white border border-purple-200 rounded-full text-purple-600 hover:bg-purple-100 transition"
                          >
                            {cmd}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            }
            if (msg.role === 'assistant') {
              return (
                <div key={msg.id}>
                  <div className="text-xs text-gray-400 mb-1">制作助手</div>
                  <div className="bg-gray-50 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-700 max-w-[90%] whitespace-pre-line">
                    {msg.content}
                  </div>
                </div>
              );
            }
            // user
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="bg-gray-800 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm max-w-[90%]">
                  {msg.content}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 底部输入区 */}
      <div className="px-4 py-3 border-t border-gray-100 shrink-0">
        {/* 模型选择器行 */}
        <div className="mb-2">
          <ProductionModelSelector
            languageModels={languageModels}
            imageModels={imageModels}
            videoModels={videoModels}
            selectedLanguageModelId={selectedLanguageModelId}
            selectedImageModelId={selectedImageModelId}
            selectedVideoModelId={selectedVideoModelId}
            onLanguageModelChange={setSelectedLanguageModelId}
            onImageModelChange={setSelectedImageModelId}
            onVideoModelChange={setSelectedVideoModelId}
            currentStage={selectorStage}
            disabled={modelsLoading}
          />
        </div>
        {/* 输入行 */}
        <div className="flex items-center gap-2">
          <input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && inputText.trim()) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={sending ? '等待回复...' : '输入指令...'}
            disabled={sending}
            className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-full text-sm outline-none focus:ring-2 focus:ring-purple-300 text-gray-700 placeholder-gray-400 disabled:bg-gray-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || sending}
            className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white hover:bg-purple-700 transition shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {sending ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
