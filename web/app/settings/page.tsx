'use client';
import { useEffect, useState, useCallback } from 'react';
import Button from '../components/Button';
import Modal from '../components/Modal';
import { ModelConfig } from '../lib/novels';
import { createBlankImageModelDraft } from '../lib/model-presets';
import LanguageModelSection from './components/LanguageModelSection';
import MediaModelSection from './components/MediaModelSection';
import ModelEditModal from './components/ModelEditModal';
import RuntimeCheckPanel, { RuntimeCheckResult } from './components/RuntimeCheckPanel';


type ModelType = 'language' | 'video' | 'image';

const EMPTY_CONFIG: ModelConfig = {
  modelId: '',
  name: '',
  type: '',
  enabled: true,
  api: { baseUrl: '', apiKey: '' },
};

export default function SettingsPage() {
  const [models, setModels] = useState<Record<ModelType, ModelConfig[]>>({
    language: [],
    video: [],
    image: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [runtimeCheck, setRuntimeCheck] = useState<RuntimeCheckResult | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(true);
  const [runtimeError, setRuntimeError] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editType, setEditType] = useState<ModelType>('language');
  const [editDraft, setEditDraft] = useState<ModelConfig>(EMPTY_CONFIG);
  const [isNew, setIsNew] = useState(true);
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<{ type: ModelType; config: ModelConfig } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadModels = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const modelsRes = await fetch('/api/settings/models');
      if (!modelsRes.ok) throw new Error('加载失败');
      const data = await modelsRes.json();
      setModels(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRuntimeCheck = useCallback(async () => {
    setRuntimeLoading(true);
    setRuntimeError('');
    try {
      const res = await fetch('/api/system/runtime-check');
      if (!res.ok) throw new Error('运行环境检查失败');
      const data = await res.json() as RuntimeCheckResult;
      setRuntimeCheck(data);
    } catch (err: unknown) {
      setRuntimeError(err instanceof Error ? err.message : '运行环境检查失败');
    } finally {
      setRuntimeLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
    loadRuntimeCheck();
  }, [loadModels, loadRuntimeCheck]);

  const openAdd = (type: ModelType) => {
    setEditType(type);
    if (type === 'image') {
      setEditDraft(createBlankImageModelDraft());
      setIsNew(true);
      setShowModal(true);
      return;
    }
    setEditDraft({
      ...EMPTY_CONFIG,
      type,
      authMode: type === 'language' ? 'api' : undefined,
      provider: '',
    });
    setIsNew(true);
    setShowModal(true);
  };

  const openEdit = (type: ModelType, config: ModelConfig) => {
    setEditType(type);
    setEditDraft({ ...config, api: config.api || {} });
    setIsNew(false);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!editDraft.modelId.trim() || !editDraft.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/models/${editType}/${editDraft.modelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editDraft),
      });
      if (!res.ok) throw new Error('保存失败');
      setShowModal(false);
      loadModels();
    } catch {
      setError('保存模型配置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/settings/models/${deleteTarget.type}/${deleteTarget.config.modelId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('删除失败');
      setDeleteTarget(null);
      loadModels();
    } catch {
      setError('删除模型配置失败');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleEnabled = async (config: ModelConfig) => {
    const type = config.type as ModelType;
    try {
      const res = await fetch(`/api/settings/models/${type}/${config.modelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, enabled: !config.enabled }),
      });
      if (!res.ok) throw new Error('切换失败');
      loadModels();
    } catch {
      setError('切换模型状态失败');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
        <div className="mx-auto sm:max-w-3xl lg:max-w-5xl">
          <h1 className="text-2xl font-bold text-gray-800 mb-1">设置</h1>
          <p className="text-sm text-gray-500 mb-6">管理模型供应商、模型密钥和运行环境</p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">&times;</button>
            </div>
          )}

          {loading ? (
            <div className="space-y-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl shadow-sm p-6 animate-pulse">
                  <div className="h-5 bg-gray-200 rounded w-1/4 mb-4" />
                  <div className="h-12 bg-gray-100 rounded mb-2" />
                  <div className="h-12 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-8">
              <RuntimeCheckPanel
                runtimeCheck={runtimeCheck}
                loading={runtimeLoading}
                error={runtimeError}
                onRefresh={loadRuntimeCheck}
              />

              {/* 语言模型 */}
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">语言模型</h2>
                  <span className="text-xs text-gray-400 font-normal normal-case tracking-normal">· 用于剧本生成和对话</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
                <LanguageModelSection
                  models={models.language}
                  onAdd={() => openAdd('language')}
                  onEdit={(config) => openEdit('language', config)}
                  onDelete={(config) => setDeleteTarget({ type: 'language', config })}
                  onToggleEnabled={handleToggleEnabled}
                />
              </section>

              {/* 媒体模型 */}
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">媒体模型</h2>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
                <MediaModelSection
                  videoModels={models.video}
                  imageModels={models.image}
                  onAdd={(type) => openAdd(type)}
                  onEdit={(config) => openEdit(config.type as ModelType, config)}
                  onDelete={(config) => setDeleteTarget({ type: config.type as ModelType, config })}
                  onToggleEnabled={handleToggleEnabled}
                />
              </section>
            </div>
          )}
        </div>

      {/* 新增/编辑弹框 */}
      <ModelEditModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        editType={editType}
        draft={editDraft}
        onChange={setEditDraft}
        onSave={handleSave}
        isNew={isNew}
        saving={saving}
      />

      {/* 删除确认弹框 */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="确认删除">
        <p className="text-sm text-gray-600 mb-4">
          确定删除模型「{deleteTarget?.config.name}」（{deleteTarget?.config.modelId}）？
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button variant="danger" onClick={handleDelete} loading={deleting}>确认删除</Button>
        </div>
      </Modal>
    </div>
  );
}
