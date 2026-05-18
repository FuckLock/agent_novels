'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';

import { ProjectDetail } from '../types';
import ChatPanel, { StageType, ChatMessage } from './workbench/ChatPanel';
import WorkbenchPanel from './workbench/WorkbenchPanel';
import { ModelOption } from './workbench/ModelSelector';

interface ContentWorkbenchProps {
  project: ProjectDetail;
  encodedName: string;
  name: string;
  onReload: () => Promise<void> | void;
}

interface SSEEvent {
  type: 'text' | 'status' | 'content_saved' | 'error' | 'done';
  data: string;
  agentLabel?: string;
}

export default function ContentWorkbench({ project, encodedName, name, onReload }: ContentWorkbenchProps) {
  const [activeStage, setActiveStage] = useState<StageType>('skeleton');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const sendMessageRef = useRef<(text: string) => void>(() => {});
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  // 加载语言模型列表
  useEffect(() => {
    async function loadModels() {
      try {
        const modelsRes = await fetch('/api/settings/models');
        if (!modelsRes.ok) return;
        const data = await modelsRes.json();

        const languageModels: ModelOption[] = (data.language || [])
          .filter((m: { enabled: boolean }) => m.enabled)
          .map((m: { modelId: string; name: string }) => ({
            modelId: m.modelId,
            name: m.name,
            authMode: 'api',
          }));
        setModels(languageModels);

        // 默认选中逻辑
        const LS_KEY = 'toonflow:selectedModelId';
        let savedId: string | null = null;
        try {
          savedId = localStorage.getItem(LS_KEY);
        } catch {
          // localStorage 不可用
        }

        if (savedId && languageModels.some((m) => m.modelId === savedId)) {
          setSelectedModelId(savedId);
        } else if (languageModels.length > 0) {
          setSelectedModelId(languageModels[0].modelId);
        } else {
          setSelectedModelId(null);
        }
      } catch {
        // 加载失败不影响使用
      }
    }
    loadModels();
  }, []);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsGenerating(false);
  }, []);

  const handleModelChange = useCallback((modelId: string) => {
    setSelectedModelId(modelId);
    try {
      localStorage.setItem('toonflow:selectedModelId', modelId);
    } catch {
      // localStorage 不可用
    }
  }, []);

  // 页面加载时从后端获取对话历史
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch(`/api/projects/${encodedName}/chat-history`);
        if (res.ok) {
          const data = await res.json();
          if (data.messages?.length) {
            const loaded: ChatMessage[] = data.messages.map((m: { role: string; content: string }, i: number) => ({
              id: `history-${i}`,
              role: m.role as 'user' | 'assistant',
              agentLabel: m.role === 'assistant' ? '统筹' : undefined,
              content: m.content,
            }));
            setChatHistory(loaded);
          }
        }
      } catch {
        // 加载失败不影响使用
      }
    }
    loadHistory();
  }, [encodedName]);

  const scripts = useMemo(
    () => (project.scripts || []).map((s) => ({
      episode: s.episode,
      name: (s as { episode: number; name?: string }).name || '',
    })),
    [project.scripts]
  );

  const scriptEpisodes = useMemo(
    () => scripts.map((s) => s.episode),
    [scripts]
  );

  // 根据项目数据生成状态消息
  const statusMessages = useMemo<ChatMessage[]>(() => {
    const msgs: ChatMessage[] = [];

    const skeletonDone = !!project['skeleton'];
    const adaptationDone = !!project['adaptation'];
    const scriptCount = scriptEpisodes.length;
    const totalEps = (project.outline || []).length;

    if (!skeletonDone && !adaptationDone && scriptCount === 0) {
      return msgs;
    }

    if (skeletonDone) {
      msgs.push({
        id: 'skeleton-done',
        role: 'assistant',
        agentLabel: '统筹',
        content: '故事骨架已生成完成，请在右侧「故事骨架」标签页查看详细内容。',
        actions: !adaptationDone ? [{ id: 'goto-adaptation', label: '下一个阶段' }] : undefined,
      });
    }

    if (adaptationDone) {
      msgs.push({
        id: 'adaptation-done',
        role: 'assistant',
        agentLabel: '统筹',
        content: '改编策略已制定完成，请在右侧「改编策略」标签页查看详细内容。',
        actions: scriptCount === 0 ? [{ id: 'goto-script', label: '开始生成剧本' }] : undefined,
      });
    }

    if (scriptCount > 0) {
      msgs.push({
        id: 'script-done',
        role: 'assistant',
        agentLabel: '统筹',
        content: `剧本已生成 **${scriptCount}/${totalEps || scriptCount} 集**。请在右侧「剧本」标签页选择集数查看。`,
      });
    }

    return msgs;
  }, [project, scriptEpisodes]);

  // 共享的 SSE 流读取逻辑
  const readSSEStream = useCallback(async (response: Response, assistantId: string, signal?: AbortSignal) => {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      // 检查中止信号，立即停止读取
      if (signal?.aborted) {
        await reader.cancel().catch(() => {});
        setChatHistory((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: msg.content + '\n\n*（已停止生成）*', isStreaming: false }
              : msg
          )
        );
        return;
      }
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        let event: SSEEvent;
        try {
          event = JSON.parse(trimmed.slice(6));
        } catch {
          continue;
        }

        switch (event.type) {
          case 'text':
            setChatHistory((prev) =>
              prev.map((msg) =>
                msg.id === assistantId
                  ? {
                      ...msg,
                      content: msg.content + event.data,
                      agentLabel: event.agentLabel || msg.agentLabel,
                    }
                  : msg
              )
            );
            break;

          case 'status':
            setChatHistory((prev) =>
              prev.map((msg) =>
                msg.id === assistantId
                  ? {
                      ...msg,
                      agentLabel: event.agentLabel || msg.agentLabel,
                    }
                  : msg
              )
            );
            break;

          case 'content_saved': {
            const saved = JSON.parse(event.data);
            await onReload();
            setRefreshTrigger((n) => n + 1);
            if (saved.type === 'skeleton') setActiveStage('skeleton');
            else if (saved.type === 'adaptation') setActiveStage('adaptation');
            else if (saved.type === 'script') setActiveStage('script');
            break;
          }

          case 'error':
            setChatHistory((prev) =>
              prev.map((msg) =>
                msg.id === assistantId
                  ? {
                      ...msg,
                      content: msg.content + `\n\n**错误：** ${event.data}`,
                      isStreaming: false,
                    }
                  : msg
              )
            );
            break;

          case 'done':
            setChatHistory((prev) =>
              prev.map((msg) =>
                msg.id === assistantId
                  ? { ...msg, isStreaming: false }
                  : msg
              )
            );
            break;
        }
      }
    }

    // 确保流式标记关闭
    setChatHistory((prev) =>
      prev.map((msg) =>
        msg.id === assistantId ? { ...msg, isStreaming: false } : msg
      )
    );
  }, [onReload]);

  const handleSendMessage = useCallback(async (text: string) => {
    // 中止前一个请求
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // 添加用户消息
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };

    // 创建流式助手消息
    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      agentLabel: '统筹',
      content: '',
      isStreaming: true,
    };

    setChatHistory((prev) => [...prev, userMsg, assistantMsg]);
    setIsGenerating(true);

    try {
      const response = await fetch(`/api/projects/${encodedName}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, modelId: selectedModelId ?? undefined }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: '请求失败' }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      await readSSEStream(response, assistantId, controller.signal);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setChatHistory((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: msg.content + '\n\n*（已停止生成）*', isStreaming: false }
              : msg
          )
        );
        return;
      }
      setChatHistory((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                content:
                  msg.content ||
                  `请求失败：${(err as Error).message}。请检查模型配置是否正确。`,
                isStreaming: false,
              }
            : msg
        )
      );
    } finally {
      setIsGenerating(false);
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [encodedName, onReload, selectedModelId, readSSEStream]);

  sendMessageRef.current = handleSendMessage;

  // 确定性操作入口：按钮直接调用 execute API，跳过意图分类
  const handleExecuteAction = useCallback(async (action: string, params?: Record<string, unknown>) => {
    // 中止前一个请求
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // 合成用户消息展示在聊天中
    const ACTION_LABELS: Record<string, string> = {
      generate_skeleton: '生成故事骨架',
      generate_adaptation: '生成改编策略',
      generate_script: '生成剧本',
      fix_skeleton: '修复故事骨架',
      fix_adaptation: '修复改编策略',
      fix_script: '修复剧本',
    };
    const displayText = ACTION_LABELS[action] || action;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: displayText,
    };

    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      agentLabel: '统筹',
      content: '',
      isStreaming: true,
    };

    setChatHistory((prev) => [...prev, userMsg, assistantMsg]);
    setIsGenerating(true);

    try {
      const response = await fetch(`/api/projects/${encodedName}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, params, modelId: selectedModelId ?? undefined }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: '请求失败' }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      await readSSEStream(response, assistantId, controller.signal);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setChatHistory((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: msg.content + '\n\n*（已停止生成）*', isStreaming: false }
              : msg
          )
        );
        return;
      }
      setChatHistory((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                content:
                  msg.content ||
                  `请求失败：${(err as Error).message}。请检查模型配置是否正确。`,
                isStreaming: false,
              }
            : msg
        )
      );
    } finally {
      setIsGenerating(false);
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [encodedName, onReload, selectedModelId, readSSEStream]);

  const handleActionClick = useCallback(async (actionId: string) => {
    if (actionId === 'goto-adaptation') {
      setActiveStage('adaptation');
      await handleExecuteAction('generate_adaptation');
    }
    if (actionId === 'goto-script') {
      setActiveStage('script');
      await handleExecuteAction('generate_script');
    }
    if (actionId === 'fix-skeleton') {
      await handleExecuteAction('fix_skeleton');
    }
    if (actionId === 'fix-adaptation') {
      await handleExecuteAction('fix_adaptation');
    }
    if (actionId === 'fix-script') {
      await handleExecuteAction('fix_script');
    }
  }, [handleExecuteAction]);

  const allMessages = useMemo(
    () => [...statusMessages, ...chatHistory],
    [statusMessages, chatHistory]
  );

  return (
    <div className="h-[calc(100vh-140px)] flex flex-row bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* 左侧聊天区 */}
      <ChatPanel
        messages={allMessages}
        onSendMessage={handleSendMessage}
        onActionClick={handleActionClick}
        isConnected={true}
        isLoading={isGenerating}
        onStop={handleStop}
        models={models}
        selectedModelId={selectedModelId}
        onModelChange={handleModelChange}
      />

      {/* 右侧工作台 */}
      <WorkbenchPanel
        activeStage={activeStage}
        onStageChange={setActiveStage}
        encodedName={encodedName}
        scripts={scripts}
        onReload={onReload}
        refreshTrigger={refreshTrigger}
      />
    </div>
  );
}
