'use client';

import { useState, useEffect, useCallback } from 'react';
import { SeedanceAssetType } from '../../types';
import IdentityAnchorTags from './IdentityAnchorTags';

interface CreateAssetModalProps {
  isOpen: boolean;
  encodedName: string;
  onClose: () => void;
  onCreated: () => void;
}

const TYPE_OPTIONS: { value: SeedanceAssetType; label: string }[] = [
  { value: 'character', label: '角色' },
  { value: 'scene', label: '场景' },
  { value: 'prop', label: '道具' },
  { value: 'costume', label: '服装' },
  { value: 'makeup', label: '妆发' },
];

/** 新增资产弹窗 */
export default function CreateAssetModal({ isOpen, encodedName, onClose, onCreated }: CreateAssetModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<SeedanceAssetType>('character');
  const [description, setDescription] = useState('');
  const [identityAnchor, setIdentityAnchor] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 重置表单
  useEffect(() => {
    if (isOpen) {
      setName('');
      setType('character');
      setDescription('');
      setIdentityAnchor([]);
      setErrors({});
      setSubmitting(false);
    }
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    },
    [onClose, submitting]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = '请输入资产名称';
    if (!description.trim()) newErrors.description = '请输入资产描述';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        type,
        description: description.trim(),
      };
      if (type === 'character' && identityAnchor.length > 0) {
        body.identityAnchor = identityAnchor;
      }
      const res = await fetch(`/api/projects/${encodedName}/seedance/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '创建失败');
      }
      onCreated();
      onClose();
    } catch (err) {
      setErrors({ submit: err instanceof Error ? err.message : '创建失败' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const canSubmit = name.trim() && description.trim();

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={() => { if (!submitting) onClose(); }}
    >
      <div
        className="max-w-md w-full mx-auto bg-white rounded-xl shadow-lg animate-[fadeIn_0.15s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">新增资产</h3>
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 表单区 */}
        <div className="px-6 py-5 space-y-4">
          {/* 名称 */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">名称 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: '' })); }}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-300 focus:border-purple-400 ${
                errors.name ? 'border-red-300 focus:ring-red-300' : 'border-gray-200'
              }`}
              placeholder="输入资产名称"
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          {/* 类型 */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">类型 *</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as SeedanceAssetType)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-300 focus:border-purple-400 bg-white"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* 描述 */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">描述 *</label>
            <textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value); setErrors((p) => ({ ...p, description: '' })); }}
              rows={3}
              className={`w-full border rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-purple-300 focus:border-purple-400 ${
                errors.description ? 'border-red-300 focus:ring-red-300' : 'border-gray-200'
              }`}
              placeholder="输入资产描述"
            />
            {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description}</p>}
          </div>

          {/* 视觉锚点（仅角色） */}
          {type === 'character' && (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">视觉锚点</label>
              <IdentityAnchorTags tags={identityAnchor} onChange={setIdentityAnchor} />
            </div>
          )}

          {/* 提交错误 */}
          {errors.submit && (
            <p className="text-xs text-red-500">{errors.submit}</p>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors duration-150"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className={`px-4 py-2 text-sm rounded-lg transition-colors duration-150 inline-flex items-center gap-1.5 ${
              canSubmit && !submitting
                ? 'bg-purple-600 hover:bg-purple-700 text-white'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {submitting && (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
