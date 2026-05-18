'use client';

import { useState, useRef, useEffect } from 'react';
import MarkdownPreview from '@/app/components/MarkdownPreview';
import ModelSelector, { ModelOption } from './ModelSelector';

export type StageType = 'skeleton' | 'adaptation' | 'script';

export interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  agentLabel?: string;
  content: string;
  isStreaming?: boolean;
  actions?: { id: string; label: string }[];
}

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onActionClick: (actionId: string) => void;
  isConnected?: boolean;
  isLoading?: boolean;
  onStop?: () => void;
  models: ModelOption[];
  selectedModelId: string | null;
  onModelChange: (modelId: string) => void;
}

export default function ChatPanel({ messages, onSendMessage, onActionClick, isConnected = true, isLoading = false, onStop, models, selectedModelId, onModelChange }: ChatPanelProps) {
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const noModels = models.length === 0;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text) return;
    onSendMessage(text);
    setInputText('');
  };

  return (
    <div className="w-[35%] shrink-0 border-r border-gray-200 flex flex-col">
      {/* 顶部状态指示 */}
      <div className="px-5 py-3 flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
      </div>

      {/* 消息流 */}
      <div className="flex-1 overflow-y-auto px-5 py-2 space-y-4 min-h-0" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 h-full">
            <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3v-3z" />
            </svg>
            <span className="text-gray-400 text-sm">向 AI 助手提问</span>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id}>
              {msg.role === 'assistant' ? (
                <div>
                  {msg.agentLabel && (
                    <div className="text-xs text-gray-400 mb-1">{msg.agentLabel}</div>
                  )}
                  <div className="bg-gray-50 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-700 max-w-[90%]">
                    <MarkdownPreview content={msg.content} />
                    {msg.isStreaming && (
                      <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
                    )}
                  </div>
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="flex justify-end mt-2 gap-2">
                      {msg.actions.map((action) => (
                        <button
                          key={action.id}
                          onClick={() => onActionClick(action.id)}
                          className="px-4 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex justify-end">
                  <div className="bg-gray-800 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm max-w-[90%]">
                    {msg.content}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 底部输入区 */}
      <div className="px-4 py-3 border-t border-gray-100">
        {/* 工具行：左侧模型选择器，右侧角色标签 */}
        <div className="flex items-center justify-between mb-2">
          <ModelSelector
            models={models}
            selectedModelId={selectedModelId}
            onModelChange={onModelChange}
            disabled={isLoading}
          />
          <span className="text-xs text-gray-400">统筹</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
          <input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && inputText.trim() && !isLoading && !noModels) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={isLoading}
            placeholder={isLoading ? 'AI 正在生成中...' : '输入消息...'}
            className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-full text-sm outline-none focus:ring-2 focus:ring-gray-300 text-gray-700 placeholder-gray-400 disabled:bg-gray-50 disabled:cursor-not-allowed"
          />
          {isLoading ? (
            <button
              onClick={onStop}
              className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition shrink-0"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || noModels}
              className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center text-white hover:bg-gray-700 transition shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
