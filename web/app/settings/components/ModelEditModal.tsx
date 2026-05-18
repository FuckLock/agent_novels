'use client';

import { ModelConfig } from '@/app/lib/novels';
import Modal from '@/app/components/Modal';
import Input from '@/app/components/Input';
import Button from '@/app/components/Button';
import ImageModelPresetFields from './ImageModelPresetFields';
import { inferImageAdapter, inferImagePlatform } from '@/app/lib/model-presets';

type ModelType = 'language' | 'video' | 'image';

const TYPE_LABELS: Record<ModelType, string> = {
  language: '语言模型',
  video: '视频模型',
  image: '图像模型',
};

interface ModelEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  editType: ModelType;
  draft: ModelConfig;
  onChange: (draft: ModelConfig) => void;
  onSave: () => void;
  isNew: boolean;
  saving: boolean;
}

export default function ModelEditModal({
  isOpen,
  onClose,
  editType,
  draft,
  onChange,
  onSave,
  isNew,
  saving,
}: ModelEditModalProps) {
  const isLanguage = editType === 'language';
  const isVideo = editType === 'video';
  const isImage = editType === 'image';

  const title = isNew ? `新增${TYPE_LABELS[editType]}` : `编辑${TYPE_LABELS[editType]}`;

  // BUG-5: modelId 格式校验 — 仅允许字母、数字、连字符、下划线、点号
  const modelIdPattern = /^[a-zA-Z0-9\-_.]+$/;
  const modelIdTrimmed = draft.modelId.trim();
  const modelIdInvalid = modelIdTrimmed.length > 0 && !modelIdPattern.test(modelIdTrimmed);
  const imagePlatform = isImage ? inferImagePlatform(draft) : '';
  const imageAdapter = isImage && imagePlatform ? inferImageAdapter(draft) : undefined;
  const imageRemoteModel = String(draft.defaultParams?.model || '').trim();
  const imageMissingEndpoint = isImage && imagePlatform && (
    (imageAdapter === 'openai-images' && !draft.api?.baseUrl?.trim()) ||
    (imageAdapter === 'grsai-task-polling' && (!draft.api?.submitUrl?.trim() || !draft.api?.pollUrl?.trim())) ||
    (imageAdapter === 'custom-http' && !draft.api?.baseUrl?.trim())
  );
  const imageInvalid = isImage && (
    !imagePlatform ||
    !imageRemoteModel ||
    !draft.api?.apiKey?.trim() ||
    Boolean(imageMissingEndpoint)
  );
  const imageIdentityDisabled = isImage && isNew && !imageRemoteModel;
  const saveDisabled = !draft.modelId.trim() || !draft.name.trim() || modelIdInvalid || imageInvalid;
  const identityFields = (
    <>
      {/* 模型 ID */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">模型 ID *</label>
          <Input
            value={draft.modelId}
            onChange={(v) => onChange({ ...draft, modelId: v })}
            placeholder={isImage ? '选择远端模型后自动建议，可手动修改' : '例如：deepseek-v4-pro'}
            disabled={!isNew || imageIdentityDisabled}
          />
        {!isNew && (
          <p className="text-xs text-gray-400 mt-1">编辑模式下不可修改模型 ID</p>
        )}
        {isImage && isNew && imageIdentityDisabled && (
          <p className="text-xs text-gray-400 mt-1">先选择平台和远端模型，系统会自动建议模型 ID</p>
        )}
        {isNew && modelIdInvalid && (
          <p className="text-xs text-red-500 mt-1">仅允许字母、数字、连字符、下划线和点号</p>
        )}
      </div>

      {/* 显示名称 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">显示名称 *</label>
          <Input
            value={draft.name}
            onChange={(v) => onChange({ ...draft, name: v })}
            placeholder={isImage ? '选择远端模型后自动建议，可手动修改' : '例如：DeepSeek Chat'}
            disabled={imageIdentityDisabled}
          />
        </div>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        {!isImage && identityFields}

        {/* Provider（仅语言模型） */}
        {isLanguage && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
            <Input
              value={draft.provider || ''}
              onChange={(v) => onChange({ ...draft, provider: v })}
              placeholder="例如：anthropic, openai, deepseek"
            />
          </div>
        )}

        {/* API Base URL（语言模型） */}
        {isLanguage && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Base URL</label>
            <Input
              value={draft.api?.baseUrl || ''}
              onChange={(v) => onChange({ ...draft, api: { ...(draft.api || {}), baseUrl: v } })}
              placeholder="https://api.openai.com/v1 或 https://api.anthropic.com/v1"
            />
          </div>
        )}

        {/* API Key（语言模型） */}
        {isLanguage && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
            <Input
              value={draft.api?.apiKey || ''}
              onChange={(v) => onChange({ ...draft, api: { ...(draft.api || {}), apiKey: v } })}
              placeholder="sk-..."
              type="password"
            />
          </div>
        )}

        {/* 图像模型平台/协议配置 */}
        {isImage && (
          <ImageModelPresetFields
            draft={draft}
            onChange={onChange}
            isNew={isNew}
          />
        )}
        {isImage && identityFields}

        {/* Submit URL / Poll URL（视频模型） */}
        {isVideo && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Submit URL</label>
              <Input
                value={draft.api?.submitUrl || ''}
                onChange={(v) => onChange({ ...draft, api: { ...(draft.api || {}), submitUrl: v } })}
                placeholder="API 提交接口"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Poll URL</label>
              <Input
                value={draft.api?.pollUrl || ''}
                onChange={(v) => onChange({ ...draft, api: { ...(draft.api || {}), pollUrl: v } })}
                placeholder="API 轮询接口"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <Input
                value={draft.api?.apiKey || ''}
                onChange={(v) => onChange({ ...draft, api: { ...(draft.api || {}), apiKey: v } })}
                placeholder="可选"
                type="password"
              />
            </div>
          </>
        )}

        {/* 启用 */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => onChange({ ...draft, enabled: e.target.checked })}
            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
          />
          <label className="text-sm">启用</label>
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
          <Button onClick={onSave} loading={saving} disabled={saveDisabled}>
            保存
          </Button>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
        </div>
      </div>
    </Modal>
  );
}
