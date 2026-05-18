'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Download } from 'lucide-react';
import { OutlineEpisode, LinkedAssetsData, SeedanceAsset } from '../../types';
import { renderScriptLine, countChars, SKELETON_WIDTHS } from '../../utils/scriptUtils';
import { parseScriptAssets } from '../../utils/scriptAssetParser';
import Modal from '@/app/components/Modal';
import Button from '@/app/components/Button';
import LinkedAssets from './LinkedAssets';

interface ScriptDetailModalProps {
  isOpen: boolean;
  episode: number;
  encodedName: string;
  outline?: OutlineEpisode[] | null;
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY_ASSETS: LinkedAssetsData = { characters: [], scenes: [], props: [], costumes: [], makeup: [] };

interface ScriptVersionItem {
  id: string;
  versionNo: number;
  status: string;
  qualityStatus: string;
  updatedAt: string;
  content: string;
}

/** 比较两个资产对象是否相同 */
function assetsEqual(a: LinkedAssetsData, b: LinkedAssetsData): boolean {
  return (
    JSON.stringify(a.characters.slice().sort()) === JSON.stringify(b.characters.slice().sort()) &&
    JSON.stringify(a.scenes.slice().sort()) === JSON.stringify(b.scenes.slice().sort()) &&
    JSON.stringify(a.props.slice().sort()) === JSON.stringify(b.props.slice().sort()) &&
    JSON.stringify(a.costumes.slice().sort()) === JSON.stringify(b.costumes.slice().sort()) &&
    JSON.stringify(a.makeup.slice().sort()) === JSON.stringify(b.makeup.slice().sort())
  );
}

function normalizeLinkedAssets(input: Partial<LinkedAssetsData> | null | undefined): LinkedAssetsData {
  return {
    characters: Array.isArray(input?.characters) ? input.characters : [],
    scenes: Array.isArray(input?.scenes) ? input.scenes : [],
    props: Array.isArray(input?.props) ? input.props : [],
    costumes: Array.isArray(input?.costumes) ? input.costumes : [],
    makeup: Array.isArray(input?.makeup) ? input.makeup : [],
  };
}

/** 从 outline 数据构建全局可选资产列表（所有集合并去重） */
function buildAllAssets(outline?: OutlineEpisode[] | null, assetCatalog: SeedanceAsset[] = []): LinkedAssetsData {
  const chars = new Set<string>();
  const scenes = new Set<string>();
  const props = new Set<string>();
  const costumes = new Set<string>();
  const makeup = new Set<string>();

  for (const ep of outline || []) {
    for (const c of ep.characters || []) chars.add(typeof c === 'string' ? c : c.name);
    for (const s of ep.scenes || []) scenes.add(typeof s === 'string' ? s : s.name);
    for (const p of ep.props || []) props.add(typeof p === 'string' ? p : p.name);
  }

  for (const asset of assetCatalog) {
    if (asset.type === 'character') chars.add(asset.name);
    if (asset.type === 'scene') scenes.add(asset.name);
    if (asset.type === 'prop') props.add(asset.name);
    if (asset.type === 'costume') costumes.add(asset.name);
    if (asset.type === 'makeup') makeup.add(asset.name);
  }

  return {
    characters: Array.from(chars),
    scenes: Array.from(scenes),
    props: Array.from(props),
    costumes: Array.from(costumes),
    makeup: Array.from(makeup),
  };
}

/** 剧本详情弹窗 -- 查看/编辑剧本内容及关联资产 */
export default function ScriptDetailModal({
  isOpen,
  episode,
  encodedName,
  outline,
  onClose,
  onSaved,
}: ScriptDetailModalProps) {
  // 内容状态
  const [scriptContent, setScriptContent] = useState('');
  const [scriptTitle, setScriptTitle] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 资产状态
  const [linkedAssets, setLinkedAssets] = useState<LinkedAssetsData>(EMPTY_ASSETS);
  const [originalAssets, setOriginalAssets] = useState<LinkedAssetsData>(EMPTY_ASSETS);
  const [assetCatalog, setAssetCatalog] = useState<SeedanceAsset[]>([]);
  const [versions, setVersions] = useState<ScriptVersionItem[]>([]);
  const [versionActionLoading, setVersionActionLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // 未保存确认弹窗
  const [showConfirm, setShowConfirm] = useState(false);

  // 所有可选资产（从 outline 构建）
  const allAssets = useMemo(() => buildAllAssets(outline, assetCatalog), [outline, assetCatalog]);

  // 当前集的 outline 数据
  const episodeOutline = useMemo(
    () => outline?.find((o) => o.episodeIndex === episode) || null,
    [outline, episode]
  );

  // 脏状态检查
  const isDirty = useMemo(() => {
    if (editTitle !== scriptTitle) return true;
    if (isEditingContent && editContent !== scriptContent) return true;
    if (!assetsEqual(linkedAssets, originalAssets)) return true;
    return false;
  }, [editTitle, scriptTitle, isEditingContent, editContent, scriptContent, linkedAssets, originalAssets]);

  // 加载剧本内容和资产
  const loadData = useCallback(async () => {
    if (!isOpen || !episode) return;

    setLoading(true);
    setIsEditingTitle(false);
    setIsEditingContent(false);

    try {
      // 并行加载剧本内容和资产
      const [scriptRes, assetsRes, assetCatalogRes] = await Promise.all([
        fetch(`/api/projects/${encodedName}/scripts/${episode}`),
        fetch(`/api/projects/${encodedName}/scripts/${episode}/assets`),
        fetch(`/api/projects/${encodedName}/seedance/assets`),
      ]);

      // 处理剧本内容
      let loadedContent = '';
      if (scriptRes.ok) {
        const data = await scriptRes.json();
        loadedContent = data.content || '';
        setScriptContent(loadedContent);
        setEditContent(loadedContent);

        // 提取标题（首行 # 开头）
        const firstHashLine = loadedContent.split('\n').find((l: string) => l.trim().startsWith('#'));
        const title = firstHashLine ? firstHashLine.replace(/^#+\s*/, '').trim() : `第${episode}集`;
        setScriptTitle(title);
        setEditTitle(title);
      }

      if (assetCatalogRes.ok) {
        const catalogData = await assetCatalogRes.json();
        setAssetCatalog(Array.isArray(catalogData) ? catalogData : catalogData.assets || []);
      }

      // 处理资产
      let assets: LinkedAssetsData = EMPTY_ASSETS;
      if (assetsRes.ok) {
        const assetsData = await assetsRes.json();
        // 如果资产文件有数据，使用持久化数据
        if (
          assetsData.characters?.length ||
          assetsData.scenes?.length ||
          assetsData.props?.length ||
          assetsData.costumes?.length ||
          assetsData.makeup?.length
        ) {
          assets = normalizeLinkedAssets(assetsData);
        }
      }

      // 如果无持久化资产，从已加载的内容中自动提取
      if (!assets.characters.length && !assets.scenes.length && !assets.props.length && !assets.costumes.length && !assets.makeup.length) {
        if (loadedContent) {
          assets = normalizeLinkedAssets(parseScriptAssets(loadedContent, episodeOutline, outline));
        }
      }

      setLinkedAssets(assets);
      setOriginalAssets(assets);
      const versionsRes = await fetch(`/api/projects/${encodedName}/scripts/${episode}/versions`);
      if (versionsRes.ok) {
        const versionsData = await versionsRes.json();
        setVersions(Array.isArray(versionsData.versions) ? versionsData.versions : []);
      }
    } catch (err) {
      console.error('加载剧本详情失败:', err);
    } finally {
      setLoading(false);
    }
  }, [isOpen, episode, encodedName, episodeOutline, outline]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  // 关闭弹窗前检查脏状态
  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  // Escape 键关闭弹窗
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, handleClose]);

  // 确认保存
  const handleSave = async () => {
    setSaving(true);
    try {
      // 如果编辑了内容，计算要保存的内容
      const finalContent = isEditingContent ? editContent : scriptContent;

      // 如果标题变化，更新内容的首行
      let contentToSave = finalContent;
      if (editTitle !== scriptTitle && contentToSave) {
        const lines = contentToSave.split('\n');
        const firstHashIdx = lines.findIndex((l) => l.trim().startsWith('#'));
        if (firstHashIdx >= 0) {
          lines[firstHashIdx] = `# ${editTitle}`;
        }
        contentToSave = lines.join('\n');
      }

      // 并行保存内容和资产
      const promises: Promise<Response>[] = [];

      // 如果内容或标题有变化，保存内容
      if (contentToSave !== scriptContent || editTitle !== scriptTitle) {
        promises.push(
          fetch(`/api/projects/${encodedName}/scripts/${episode}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: contentToSave }),
          })
        );
      }

      // 保存资产
      promises.push(
        fetch(`/api/projects/${encodedName}/scripts/${episode}/assets`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(linkedAssets),
        })
      );

      const results = await Promise.all(promises);
      const allOk = results.every((r) => r.ok);

      if (allOk) {
        onSaved();
        onClose();
      } else {
        alert('保存失败，请重试');
      }
    } catch (err) {
      console.error('保存失败:', err);
      alert('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  // 内容编辑模式切换
  const startEditContent = () => {
    setEditContent(scriptContent);
    setIsEditingContent(true);
  };

  const cancelEditContent = () => {
    setIsEditingContent(false);
    setEditContent(scriptContent);
  };

  const wordCount = isEditingContent ? countChars(editContent) : countChars(scriptContent);

  const runVersionAction = async (payload: Record<string, unknown>) => {
    setVersionActionLoading(true);
    try {
      const res = await fetch(`/api/projects/${encodedName}/scripts/${episode}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '版本操作失败');
      }
      await loadData();
      onSaved();
    } catch (error) {
      alert(error instanceof Error ? error.message : '版本操作失败');
    } finally {
      setVersionActionLoading(false);
    }
  };

  const handleExportCurrent = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/projects/${encodedName}/scripts/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodes: [episode] }),
      });
      if (!res.ok) throw new Error('导出失败');
      const data = await res.json();
      const blob = new Blob([data.content || ''], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = data.filename || `第${episode}集剧本.txt`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (error) {
      alert(error instanceof Error ? error.message : '导出失败，请重试');
    } finally {
      setExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* 主弹窗 */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
        onClick={handleClose}
      >
        <div
          className="bg-white rounded-xl shadow-lg max-w-[900px] w-[75vw] max-h-[90vh] flex flex-col animate-[fadeIn_0.15s_ease-out]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* C1: 弹窗标题栏 */}
          <div className="sticky top-0 z-10 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-xl">
            <h2 className="text-lg font-semibold text-gray-800">剧本详情</h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none transition"
            >
              &times;
            </button>
          </div>

          {/* 可滚动内容区域 */}
          <div className="overflow-y-auto flex-1">
            {/* C2: 剧本名称区 */}
            <div className="px-6 pt-5 pb-3">
              <p className="text-xs text-gray-400 mb-1.5">剧本名称</p>
              {isEditingTitle ? (
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setIsEditingTitle(false);
                      setEditTitle(scriptTitle);
                    }
                  }}
                  onBlur={() => {
                    setIsEditingTitle(false);
                    setEditTitle(scriptTitle);
                  }}
                  autoFocus
                  className="w-full text-sm font-medium text-gray-800 px-3 py-2 rounded-lg border border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-200"
                />
              ) : (
                <div
                  onClick={() => {
                    if (!loading) {
                      setIsEditingTitle(true);
                    }
                  }}
                  className="text-sm font-medium text-gray-800 px-3 py-2 rounded-lg bg-gray-50 cursor-text hover:bg-gray-100 transition"
                >
                  {loading ? (
                    <span className="inline-block h-4 w-48 bg-gray-200 rounded animate-pulse" />
                  ) : (
                    editTitle || '未命名剧本'
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">版本记录</h3>
                <div className="flex items-center gap-3">
                  <button
                    disabled={exporting || versions.length === 0}
                    onClick={handleExportCurrent}
                    className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 disabled:text-gray-300"
                  >
                    <Download className="h-4 w-4" />
                    导出本集
                  </button>
                  <button
                    disabled={versionActionLoading || versions.length === 0}
                    onClick={() => {
                      const reason = window.prompt('锁定剧本。若未通过审核，请填写人工豁免原因。') || '';
                      runVersionAction({ action: 'lock', waiverReason: reason });
                    }}
                    className="text-sm text-purple-600 hover:text-purple-700 disabled:text-gray-300"
                  >
                    锁定当前版本
                  </button>
                </div>
              </div>
              {versions.length === 0 ? (
                <p className="text-xs text-gray-400">暂无版本记录</p>
              ) : (
                <div className="space-y-2">
                  {versions.slice(0, 5).map((version) => (
                    <div key={version.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700">
                          v{version.versionNo} · {version.status} · {version.qualityStatus}
                        </p>
                        <p className="truncate text-xs text-gray-400">
                          {new Date(version.updatedAt).toLocaleString()} · {version.content.slice(0, 80)}
                        </p>
                      </div>
                      <button
                        disabled={versionActionLoading || version.versionNo === versions[0]?.versionNo}
                        onClick={() => {
                          if (window.confirm(`回滚到 v${version.versionNo}？`)) {
                            runVersionAction({ action: 'rollback', versionId: version.id });
                          }
                        }}
                        className="shrink-0 text-xs text-gray-500 hover:text-purple-700 disabled:text-gray-300"
                      >
                        回滚
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* C3: 剧本内容区 */}
            <div className="px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  剧本内容
                </h3>
                <div className="flex items-center gap-2">
                  {isEditingContent ? (
                    <>
                      <button
                        onClick={cancelEditContent}
                        className="text-sm text-gray-500 hover:text-gray-700 transition"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => setIsEditingContent(false)}
                        className="text-sm text-purple-600 hover:text-purple-700 transition"
                      >
                        完成编辑
                      </button>
                    </>
                  ) : scriptContent ? (
                    <button
                      onClick={startEditContent}
                      className="text-sm text-purple-600 hover:text-purple-700 flex items-center gap-1 transition"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      编辑
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 max-h-[400px] overflow-y-auto">
                {loading ? (
                  // 骨架屏
                  <div className="p-6 animate-pulse space-y-2">
                    {SKELETON_WIDTHS.slice(0, 8).map((w, i) => (
                      <div key={i} className="h-4 bg-gray-100 rounded" style={{ width: w }} />
                    ))}
                  </div>
                ) : isEditingContent ? (
                  // 编辑模式
                  <div className="relative">
                    <p className="px-4 pt-3 text-xs text-gray-400">
                      编辑完成后点击底部「确认」按钮统一保存
                    </p>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={20}
                      className="w-full text-sm font-mono resize-none bg-gray-50 rounded-lg border-none px-4 py-3 focus:outline-none"
                      style={{ lineHeight: '1.8' }}
                    />
                    <span className="absolute bottom-2 right-4 text-xs text-gray-400">
                      {wordCount} 字符
                    </span>
                  </div>
                ) : scriptContent ? (
                  // 只读模式
                  <div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <tbody>
                          {scriptContent.split('\n').map((line, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td
                                className="px-3 py-0.5 text-right text-sm text-gray-400 select-none w-12 align-top"
                                style={{ lineHeight: '1.8' }}
                              >
                                {i + 1}
                              </td>
                              <td
                                className="px-4 py-0.5 text-sm text-gray-700 whitespace-pre-wrap font-mono"
                                style={{ lineHeight: '1.8' }}
                              >
                                {renderScriptLine(line)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-gray-400 mt-2 text-right px-4 pb-3">
                      {wordCount} 字符
                    </p>
                  </div>
                ) : (
                  // 空内容
                  <div className="py-16 text-center">
                    <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm text-gray-500">还没有剧本内容</p>
                    <p className="text-xs text-gray-400 mt-1">在内容工作台使用生成剧本功能开始</p>
                  </div>
                )}
              </div>
            </div>

            {/* C4: 关联资产区 */}
            <LinkedAssets
              assets={linkedAssets}
              allAssets={allAssets}
              onChange={setLinkedAssets}
            />
          </div>

          {/* C6: 底部操作栏 */}
          <div className="sticky bottom-0 z-10 bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-end gap-3 rounded-b-xl">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition"
            >
              取消
            </button>
            <Button onClick={handleSave} loading={saving} size="sm">
              确认
            </Button>
          </div>
        </div>
      </div>

      {/* 未保存确认弹窗 */}
      <Modal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="未保存的修改"
      >
        <p className="text-sm text-gray-600 mb-4">有未保存的修改，确定要关闭吗？</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={() => setShowConfirm(false)}>
            继续编辑
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              setShowConfirm(false);
              onClose();
            }}
          >
            放弃修改
          </Button>
        </div>
      </Modal>
    </>
  );
}
