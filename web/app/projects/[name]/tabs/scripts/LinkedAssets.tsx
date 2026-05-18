'use client';

import { useState, useCallback } from 'react';
import { LinkedAssetsData, AssetType, ASSET_TYPE_CONFIG } from '../../types';
import AssetTag from './AssetTag';
import AssetPicker from './AssetPicker';

interface LinkedAssetsProps {
  assets: LinkedAssetsData;
  allAssets: LinkedAssetsData;
  onChange: (assets: LinkedAssetsData) => void;
}

const ASSET_GROUPS: AssetType[] = ['characters', 'scenes', 'props', 'costumes', 'makeup'];

/** 关联资产展示区域 -- 分组展示 Tag + 选择资产入口 */
export default function LinkedAssets({ assets, allAssets, onChange }: LinkedAssetsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const closePicker = useCallback(() => setPickerOpen(false), []);

  const totalCount =
    assets.characters.length + assets.scenes.length + assets.props.length + assets.costumes.length + assets.makeup.length;

  /** 删除某个资产 */
  const handleRemove = (type: AssetType, name: string) => {
    onChange({
      ...assets,
      [type]: assets[type].filter((n) => n !== name),
    });
  };

  /** 切换资产选中状态 */
  const handleToggle = (type: AssetType, name: string) => {
    const current = assets[type];
    if (current.includes(name)) {
      onChange({ ...assets, [type]: current.filter((n) => n !== name) });
    } else {
      onChange({ ...assets, [type]: [...current, name] });
    }
  };

  const hasAnyAssets = totalCount > 0;

  return (
    <div className="px-6 py-4">
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          关联资产
          {totalCount > 0 && (
            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
              ({totalCount})
            </span>
          )}
        </h3>
        <div className="relative">
          <button
            onClick={() => setPickerOpen(!pickerOpen)}
            className="text-sm text-purple-600 hover:text-purple-700 border border-purple-200 rounded-lg px-3 py-1.5 hover:bg-purple-50 transition"
          >
            + 选择资产
          </button>
          {pickerOpen && (
            <AssetPicker
              allAssets={allAssets}
              selectedAssets={assets}
              onToggle={handleToggle}
              onClose={closePicker}
            />
          )}
        </div>
      </div>

      {/* 分组展示 */}
      {hasAnyAssets ? (
        <div className="space-y-3">
          {ASSET_GROUPS.map((type) => {
            const items = assets[type];
            if (items.length === 0) return null;
            return (
              <div key={type}>
                <p className="text-xs font-medium text-gray-500 mb-1.5">
                  {ASSET_TYPE_CONFIG[type].label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((name) => (
                    <AssetTag
                      key={name}
                      type={type}
                      name={name}
                      onRemove={() => handleRemove(type, name)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-400 py-4 text-center">
          暂无关联资产，点击上方按钮添加
        </p>
      )}
    </div>
  );
}
