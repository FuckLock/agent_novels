'use client';

import { useState } from 'react';
import { ModelConfig } from '@/app/lib/novels';
import { getImageAdapterLabel, getImageProviderLabel } from '@/app/lib/model-presets';

interface ModelConfigItemProps {
  config: ModelConfig;
  onEdit: () => void;
  onDelete: () => void;
  onToggleEnabled: () => void;
}

type TestStatus = 'idle' | 'testing' | 'success' | 'warn' | 'fail';

export default function ModelConfigItem({ config, onEdit, onDelete, onToggleEnabled }: ModelConfigItemProps) {
  const enabled = config.enabled;
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMsg, setTestMsg] = useState('');
  const remoteModel = config.defaultParams?.model ? String(config.defaultParams.model) : '';
  const providerLabel = config.type === 'image'
    ? getImageProviderLabel(config)
    : config.provider || '';
  const adapterLabel = config.type === 'image'
    ? getImageAdapterLabel(config)
    : config.api?.protocol || '';

  const handleTest = async () => {
    setTestStatus('testing');
    setTestMsg('');
    try {
      const res = await fetch(`/api/settings/models/${config.type}/${config.modelId}/test`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success && data.warn) {
        setTestStatus('warn');
        setTestMsg(data.message || '配置正确，服务暂时繁忙');
      } else if (data.success) {
        setTestStatus('success');
        setTestMsg(data.message || '连接成功');
      } else {
        setTestStatus('fail');
        setTestMsg(data.error || '测试失败');
      }
    } catch {
      setTestStatus('fail');
      setTestMsg('网络错误');
    }
    // 3 秒后恢复 idle
    setTimeout(() => {
      setTestStatus('idle');
      setTestMsg('');
    }, 3000);
  };

  return (
    <div
      className={`relative min-w-0 p-4 rounded-lg transition-all duration-200 ${
        enabled
          ? 'bg-white border-2 border-purple-200'
          : 'bg-gray-50 border border-gray-200 opacity-75'
      }`}
    >
      {/* 左侧色条（仅启用状态） */}
      {enabled && (
        <div className="absolute top-0 left-0 w-1 h-full bg-purple-500 rounded-l-lg" />
      )}

      {/* 模型名称 */}
      <div
        className={`truncate ${
          enabled ? 'text-sm font-semibold text-gray-800' : 'text-sm font-medium text-gray-500'
        }`}
      >
        {config.name}
      </div>

      {/* 模型 ID */}
      <div
        className={`truncate mt-0.5 ${
          enabled ? 'text-xs text-gray-400' : 'text-xs text-gray-300'
        }`}
      >
        {config.modelId}
      </div>

      {(providerLabel || adapterLabel || remoteModel) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {providerLabel && (
            <span className="max-w-full truncate rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
              {providerLabel}
            </span>
          )}
          {adapterLabel && (
            <span className="max-w-full truncate rounded-md bg-purple-50 px-1.5 py-0.5 text-[11px] text-purple-700">
              {adapterLabel}
            </span>
          )}
          {remoteModel && (
            <span className="max-w-full truncate rounded-md bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600">
              {remoteModel}
            </span>
          )}
        </div>
      )}

      {/* 测试结果提示 */}
      {testStatus !== 'idle' && testStatus !== 'testing' && testMsg && (
        <div
          className={`mt-2 text-xs px-2 py-1 rounded ${
            testStatus === 'success'
              ? 'bg-green-50 text-green-600'
              : testStatus === 'warn'
                ? 'bg-amber-50 text-amber-600'
                : 'bg-red-50 text-red-600'
          }`}
        >
          {testMsg}
        </div>
      )}

      {/* 操作行 */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
        {/* 状态徽章（可点击切换） */}
        <button
          onClick={onToggleEnabled}
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium transition-colors duration-200 ${
            enabled
              ? 'bg-purple-50 text-purple-700 hover:bg-purple-100'
              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
          }`}
        >
          {enabled ? (
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full border border-gray-300" />
          )}
          {enabled ? '已启用' : '已禁用'}
        </button>

        {/* 操作按钮 */}
        <div className="flex gap-0.5">
          {/* 测试按钮 */}
          <button
            onClick={handleTest}
            disabled={testStatus === 'testing'}
            className={`p-1 rounded transition ${
              testStatus === 'testing'
                ? 'text-purple-400 animate-pulse cursor-wait'
                : testStatus === 'success'
                  ? 'text-green-500'
                  : testStatus === 'warn'
                    ? 'text-amber-500'
                    : testStatus === 'fail'
                      ? 'text-red-500'
                      : 'text-gray-400 hover:text-purple-600 hover:bg-purple-50'
            }`}
            title="测试连接"
          >
            {testStatus === 'testing' ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            )}
          </button>
          <button
            onClick={onEdit}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded transition"
            title="编辑"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition"
            title="删除"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
