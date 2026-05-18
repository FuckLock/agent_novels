'use client';

import { useState, useEffect, useRef } from 'react';
import { LinkedAssetsData, AssetType, ASSET_TYPE_CONFIG } from '../../types';

interface AssetPickerProps {
  allAssets: LinkedAssetsData;
  selectedAssets: LinkedAssetsData;
  onToggle: (type: AssetType, name: string) => void;
  onClose: () => void;
}

const TABS: AssetType[] = ['characters', 'scenes', 'props', 'costumes', 'makeup'];

/** 资产选择 Popover 面板 -- 分 Tab 展示可选资产 */
export default function AssetPicker({
  allAssets,
  selectedAssets,
  onToggle,
  onClose,
}: AssetPickerProps) {
  const [activeTab, setActiveTab] = useState<AssetType>('characters');
  const panelRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // 延迟绑定，避免触发按钮的 click 事件立即关闭
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const currentList = allAssets[activeTab] || [];
  const currentSelected = selectedAssets[activeTab] || [];

  return (
    <div
      ref={panelRef}
      className="absolute top-full left-0 mt-2 w-80 bg-white rounded-xl shadow-md border border-gray-200 z-20 animate-[fadeIn_0.1s_ease-out]"
    >
      {/* Tab 栏 */}
      <div className="flex border-b border-gray-100 px-3">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2.5 text-xs transition ${
              activeTab === tab
                ? 'text-purple-700 font-medium border-b-2 border-purple-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {ASSET_TYPE_CONFIG[tab].label}
          </button>
        ))}
      </div>

      {/* 资产列表 */}
      <div className="overflow-y-auto max-h-[300px] py-1">
        {currentList.length === 0 ? (
          <p className="text-xs text-gray-400 py-6 text-center">项目中暂无该类型资产</p>
        ) : (
          currentList.map((name) => {
            const isSelected = currentSelected.includes(name);
            return (
              <button
                key={name}
                onClick={() => onToggle(activeTab, name)}
                className="flex items-center gap-2.5 px-4 py-2 hover:bg-gray-50 cursor-pointer transition text-sm text-gray-700 w-full text-left"
              >
                {/* 勾选图标 */}
                {isSelected ? (
                  <span className="w-4 h-4 rounded bg-purple-600 text-white flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                ) : (
                  <span className="w-4 h-4 rounded border border-gray-300 flex-shrink-0" />
                )}
                <span className={isSelected ? 'text-purple-700 font-medium' : ''}>
                  {name}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
