'use client';

import Input from '@/app/components/Input';
import type { ModelConfig } from '@/app/lib/novels';
import {
  applyImagePlatform,
  applyRemoteImageModel,
  getImageAdapterLabel,
  getImageProviderLabel,
  inferImageAdapter,
  inferImagePlatform,
  isSystemSuggestedImageIdentity,
  type ImagePlatformId,
} from '@/app/lib/model-presets';

interface ImageModelPresetFieldsProps {
  draft: ModelConfig;
  onChange: (draft: ModelConfig) => void;
  isNew: boolean;
}

const selectClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-400 transition';

function updateDefaultParam(draft: ModelConfig, key: string, value: unknown): ModelConfig {
  return {
    ...draft,
    defaultParams: {
      ...(draft.defaultParams || {}),
      [key]: value,
    },
  };
}

function updateApi(draft: ModelConfig, key: string, value: string): ModelConfig {
  return {
    ...draft,
    api: {
      ...(draft.api || {}),
      [key]: value,
    },
  };
}

function clearIdentityIfSystemSuggested(draft: ModelConfig): ModelConfig {
  if (!isSystemSuggestedImageIdentity(draft)) return draft;
  return {
    ...draft,
    modelId: '',
    name: '',
  };
}

export default function ImageModelPresetFields({ draft, onChange, isNew }: ImageModelPresetFieldsProps) {
  const platform = inferImagePlatform(draft);
  const adapter = platform ? inferImageAdapter(draft) : undefined;
  const isOpenAI = adapter === 'openai-images';
  const isGrsai = adapter === 'grsai-task-polling';
  const isCustom = platform === 'custom';
  const capabilities = draft.capabilities || {};
  const defaultParams = draft.defaultParams || {};
  const remoteModel = String(defaultParams.model || '');
  const aspectRatios = capabilities.aspectRatios && capabilities.aspectRatios.length > 0
    ? capabilities.aspectRatios
    : ['1:1', '16:9', '9:16'];
  const sizeOptions = capabilities.sizeOptions && capabilities.sizeOptions.length > 0
    ? capabilities.sizeOptions
    : isOpenAI
      ? ['auto', '1024x1024', '1536x1024', '1024x1536']
      : [];
  const qualityOptions = capabilities.qualityOptions || ['auto', 'low', 'medium', 'high'];
  const outputFormats = capabilities.outputFormats || ['png', 'webp', 'jpeg'];
  const knownRemoteModels = isGrsai ? ['gpt-image-2', 'nano-banana-2'] : isOpenAI ? ['gpt-image-2'] : [];
  const remoteSelectValue = remoteModel
    ? knownRemoteModels.includes(remoteModel)
      ? remoteModel
      : 'custom'
    : '';

  const handlePlatformChange = (value: string) => {
    const next = applyImagePlatform(draft, value as ImagePlatformId);
    onChange(clearIdentityIfSystemSuggested(next));
  };

  const handleRemoteModelChange = (value: string) => {
    if (value === 'custom') {
      onChange(clearIdentityIfSystemSuggested(updateDefaultParam(draft, 'model', '')));
      return;
    }
    onChange(applyRemoteImageModel(draft, value, { forceIdentity: isSystemSuggestedImageIdentity(draft) }));
  };

  const handleRemoteInputChange = (value: string) => {
    const trimmed = value.trim();
    if (knownRemoteModels.includes(trimmed)) {
      handleRemoteModelChange(trimmed);
      return;
    }
    onChange(clearIdentityIfSystemSuggested(updateDefaultParam(draft, 'model', value)));
  };

  const regenerateIdentity = () => {
    if (!remoteModel.trim()) return;
    onChange(applyRemoteImageModel(draft, remoteModel.trim(), { forceIdentity: true }));
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">平台来源 *</label>
        <select
          value={platform}
          onChange={(e) => handlePlatformChange(e.target.value)}
          disabled={!isNew}
          className={`${selectClass} ${!isNew ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
        >
          <option value="">请选择平台</option>
          <option value="openai">官方 OpenAI</option>
          <option value="grsai">第三方 GRSAI</option>
          <option value="custom">自定义 HTTP</option>
        </select>
        {!isNew && (
          <p className="text-xs text-gray-400 mt-1">编辑模式下锁定平台来源和调用适配器，避免把旧配置切成另一种协议</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
          <p className="text-[11px] text-gray-400">平台来源</p>
          <p className="text-sm font-medium text-gray-700 truncate">{getImageProviderLabel(draft)}</p>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
          <p className="text-[11px] text-gray-400">调用适配器</p>
          <p className="text-sm font-medium text-gray-700 truncate">{getImageAdapterLabel(draft)}</p>
        </div>
      </div>

      {!platform && (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-500">
          选择平台来源后，系统会自动填入对应接口地址，再继续选择或填写远端模型。
        </div>
      )}

      {platform && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">远端模型 *</label>
            {!isCustom && (
              <select
                value={remoteSelectValue}
                onChange={(e) => handleRemoteModelChange(e.target.value)}
                className={`${selectClass} mb-2`}
              >
                <option value="">请选择远端模型</option>
                {knownRemoteModels.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
                <option value="custom">自定义填写</option>
              </select>
            )}
            <Input
              value={remoteModel}
              onChange={handleRemoteInputChange}
              placeholder={isCustom ? '例如：your-image-model' : '可从上方选择，也可手动填写'}
            />
            <div className="flex items-center justify-between gap-3 mt-1">
              <p className="text-xs text-gray-400">远端模型用于请求体里的 model 字段；本地模型 ID 只是本项目的配置名。</p>
              <button
                type="button"
                onClick={regenerateIdentity}
                disabled={!remoteModel.trim()}
                className="text-xs text-purple-600 hover:text-purple-700 disabled:text-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
              >
                重新生成建议名称
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key *</label>
            <Input
              value={draft.api?.apiKey || ''}
              onChange={(v) => onChange(updateApi(draft, 'apiKey', v))}
              placeholder="sk-..."
              type="password"
            />
          </div>
        </>
      )}

      {isOpenAI && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Base URL</label>
            <Input
              value={draft.api?.baseUrl || ''}
              onChange={(v) => onChange(updateApi(draft, 'baseUrl', v))}
              placeholder="https://api.openai.com/v1"
            />
            <p className="text-xs text-gray-400 mt-1">Endpoint：/images/generations</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
              <select
                value={String(defaultParams.size || '1024x1024')}
                onChange={(e) => onChange(updateDefaultParam(draft, 'size', e.target.value))}
                className={selectClass}
              >
                {sizeOptions.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quality</label>
              <select
                value={String(defaultParams.quality || 'auto')}
                onChange={(e) => onChange(updateDefaultParam(draft, 'quality', e.target.value))}
                className={selectClass}
              >
                {qualityOptions.map((quality) => (
                  <option key={quality} value={quality}>{quality}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Format</label>
              <select
                value={String(defaultParams.output_format || 'png')}
                onChange={(e) => onChange(updateDefaultParam(draft, 'output_format', e.target.value))}
                className={selectClass}
              >
                {outputFormats.map((format) => (
                  <option key={format} value={format}>{format}</option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}

      {isGrsai && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Submit URL</label>
            <Input
              value={draft.api?.submitUrl || ''}
              onChange={(v) => onChange(updateApi(draft, 'submitUrl', v))}
              placeholder="API 提交接口"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Poll URL</label>
            <Input
              value={draft.api?.pollUrl || ''}
              onChange={(v) => onChange(updateApi(draft, 'pollUrl', v))}
              placeholder="API 轮询接口"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Aspect ratio</label>
              <select
                value={String(defaultParams.aspectRatio || '1:1')}
                onChange={(e) => onChange(updateDefaultParam(draft, 'aspectRatio', e.target.value))}
                className={selectClass}
              >
                {aspectRatios.map((ratio) => (
                  <option key={ratio} value={ratio}>{ratio}</option>
                ))}
              </select>
            </div>
            {sizeOptions.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
                <select
                  value={String(defaultParams.imageSize || defaultParams.size || sizeOptions[0])}
                  onChange={(e) => onChange(updateDefaultParam(draft, draft.capabilities?.sizeParam || 'imageSize', e.target.value))}
                  className={selectClass}
                >
                  {sizeOptions.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">webHook</label>
              <Input
                value={String(defaultParams.webHook || '-1')}
                onChange={(v) => onChange(updateDefaultParam(draft, 'webHook', v))}
                placeholder="-1"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={Boolean(defaultParams.shutProgress)}
              onChange={(e) => onChange(updateDefaultParam(draft, 'shutProgress', e.target.checked))}
              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            关闭过程进度，只返回最终结果
          </label>
        </>
      )}

      {isCustom && (
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            自定义 HTTP 当前仅保存配置，批量生成运行时暂不建议使用。
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Base URL</label>
            <Input
              value={draft.api?.baseUrl || ''}
              onChange={(v) => onChange(updateApi(draft, 'baseUrl', v))}
              placeholder="https://example.com/v1"
            />
          </div>
        </div>
      )}

      {platform && (
        <details className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-gray-600">高级配置</summary>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">请求方法</label>
              <Input
                value={draft.api?.method || 'POST'}
                onChange={(v) => onChange(updateApi(draft, 'method', v))}
                placeholder="POST"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Size 参数名</label>
              <Input
                value={draft.capabilities?.sizeParam || ''}
                onChange={(v) => onChange({
                  ...draft,
                  capabilities: {
                    ...(draft.capabilities || {}),
                    sizeParam: v === 'size' || v === 'imageSize' ? v : null,
                  },
                })}
                placeholder="size / imageSize / 留空"
              />
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
