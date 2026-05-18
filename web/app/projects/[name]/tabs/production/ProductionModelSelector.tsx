'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ModelOption } from '../workbench/ModelSelector';

export interface ProductionModelSelectorProps {
  languageModels: ModelOption[];
  imageModels: ModelOption[];
  videoModels: ModelOption[];
  selectedLanguageModelId: string | null;
  selectedImageModelId: string | null;
  selectedVideoModelId: string | null;
  onLanguageModelChange: (modelId: string) => void;
  onImageModelChange: (modelId: string) => void;
  onVideoModelChange: (modelId: string) => void;
  currentStage?: 'A' | 'B-polish' | 'B-image' | 'C' | 'D' | null;
  disabled?: boolean;
}

const LS_KEYS = {
  language: 'toonflow:production:languageModelId',
  image: 'toonflow:production:imageModelId',
  video: 'toonflow:production:videoModelId',
} as const;

/** 六边形模型图标 */
function HexagonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    </svg>
  );
}

/** AlertCircle 图标 */
function AlertCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

/** 下拉箭头 */
function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/** 勾号 */
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/** 设置图标 */
function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

/** 渲染单个分组 */
function ModelGroup({
  title,
  models,
  selectedModelId,
  onSelect,
}: {
  title: string;
  models: ModelOption[];
  selectedModelId: string | null;
  onSelect: (modelId: string) => void;
}) {
  return (
    <div>
      <div className="text-[11px] text-gray-400 uppercase tracking-wide px-3 pt-2 pb-1">
        {title}
      </div>
      {models.length === 0 ? (
        <div className="flex items-center gap-2 px-3 py-2">
          <SettingsIcon className="w-4 h-4 text-gray-300" />
          <span className="text-xs text-gray-400">未配置</span>
        </div>
      ) : (
        models.map((model) => {
          const isSelected = model.modelId === selectedModelId;
          return (
            <button
              key={model.modelId}
              onClick={() => onSelect(model.modelId)}
              className={`flex items-center gap-2 px-3 py-2 w-full cursor-pointer hover:bg-gray-50 transition-colors duration-100 ${
                isSelected ? 'bg-gray-50 font-medium' : ''
              }`}
            >
              {isSelected ? (
                <CheckIcon className="w-4 h-4 text-purple-600 shrink-0" />
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <span className="text-sm text-gray-700 flex-1 truncate text-left">
                {model.name}
              </span>
              <span
                className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 bg-purple-50 text-purple-600"
              >
                {model.authMode}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}

/** 根据当前阶段决定显示哪类模型的名称 */
function getDisplayName(
  props: ProductionModelSelectorProps
): { name: string; isEmpty: boolean } {
  const { currentStage } = props;

  if (currentStage === 'B-image') {
    const model = props.imageModels.find((m) => m.modelId === props.selectedImageModelId);
    if (props.imageModels.length === 0) return { name: '未配置模型', isEmpty: true };
    return { name: model?.name || '未选择', isEmpty: false };
  }

  if (currentStage === 'D') {
    const model = props.videoModels.find((m) => m.modelId === props.selectedVideoModelId);
    if (props.videoModels.length === 0) return { name: '未配置模型', isEmpty: true };
    return { name: model?.name || '未选择', isEmpty: false };
  }

  // 'A' | 'B-polish' | 'C' | null → 语言模型
  const model = props.languageModels.find((m) => m.modelId === props.selectedLanguageModelId);
  if (props.languageModels.length === 0) return { name: '未配置模型', isEmpty: true };
  return { name: model?.name || '未选择', isEmpty: false };
}

export default function ProductionModelSelector(props: ProductionModelSelectorProps) {
  const {
    languageModels,
    imageModels,
    videoModels,
    selectedLanguageModelId,
    selectedImageModelId,
    selectedVideoModelId,
    onLanguageModelChange,
    onImageModelChange,
    onVideoModelChange,
    disabled = false,
  } = props;

  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const { name: displayName, isEmpty } = getDisplayName(props);
  const allEmpty = languageModels.length === 0 && imageModels.length === 0 && videoModels.length === 0;

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return;

    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    }

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  // 计算浮层位置（Portal 向上弹出）
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      bottom: window.innerHeight - rect.top + 4,
      zIndex: 9999,
    });
  }, [isOpen]);

  const handleToggle = () => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
  };

  const handleLanguageSelect = (modelId: string) => {
    onLanguageModelChange(modelId);
    try { localStorage.setItem(LS_KEYS.language, modelId); } catch { /* noop */ }
  };

  const handleImageSelect = (modelId: string) => {
    onImageModelChange(modelId);
    try { localStorage.setItem(LS_KEYS.image, modelId); } catch { /* noop */ }
  };

  const handleVideoSelect = (modelId: string) => {
    onVideoModelChange(modelId);
    try { localStorage.setItem(LS_KEYS.video, modelId); } catch { /* noop */ }
  };

  const dropdown = isOpen ? (
    <div
      ref={dropdownRef}
      style={dropdownStyle}
      className="w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-1 transition duration-150 ease-out"
    >
      {allEmpty ? (
        <div className="flex flex-col items-center gap-2 px-4 py-3">
          <SettingsIcon className="w-5 h-5 text-gray-300" />
          <span className="text-xs text-gray-400 text-center">
            请先在设置页面配置模型
          </span>
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          {/* 文本模型 */}
          <ModelGroup
            title="文本模型"
            models={languageModels}
            selectedModelId={selectedLanguageModelId}
            onSelect={handleLanguageSelect}
          />

          {/* 分隔线 */}
          <div className="border-t border-gray-100" />

          {/* 图片模型 */}
          <ModelGroup
            title="图片模型"
            models={imageModels}
            selectedModelId={selectedImageModelId}
            onSelect={handleImageSelect}
          />

          {/* 分隔线 */}
          <div className="border-t border-gray-100" />

          {/* 视频模型 */}
          <ModelGroup
            title="视频模型"
            models={videoModels}
            selectedModelId={selectedVideoModelId}
            onSelect={handleVideoSelect}
          />
        </div>
      )}

      {/* 底部：前往设置 */}
      <a
        href="/settings"
        className="flex items-center gap-1.5 px-3 py-2 text-xs text-purple-600 hover:bg-gray-50 border-t border-gray-100"
      >
        <SettingsIcon className="w-3.5 h-3.5" />
        前往设置
      </a>
    </div>
  ) : null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={handleToggle}
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 cursor-pointer transition-colors duration-150 ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        {isEmpty ? (
          <AlertCircleIcon className="w-3.5 h-3.5 text-gray-400" />
        ) : (
          <HexagonIcon className="w-3.5 h-3.5 text-gray-400" />
        )}
        <span
          className={`text-xs font-medium max-w-[120px] truncate ${
            isEmpty ? 'text-gray-400 italic' : 'text-gray-600'
          } ${disabled ? 'animate-pulse' : ''}`}
        >
          {disabled ? '...' : displayName}
        </span>
        <ChevronDownIcon
          className={`w-3 h-3 text-gray-400 transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {typeof document !== 'undefined' && dropdown
        ? createPortal(dropdown, document.body)
        : null}
    </div>
  );
}
