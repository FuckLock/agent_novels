'use client';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { ProjectDetail, ScriptCardData } from '../types';
import { ReviewResult } from '@/app/lib/novels';
import ReviewPanel from '@/app/components/ReviewPanel';
import Modal from '@/app/components/Modal';
import Button from '@/app/components/Button';
import EmptyScripts from './scripts/EmptyScripts';
import ScriptHeader from './scripts/ScriptHeader';
import ScriptCard from './scripts/ScriptCard';
import ScriptDetailModal from './scripts/ScriptDetailModal';

interface ScriptsTabProps {
  project: ProjectDetail;
  encodedName: string;
  name: string;
  onReload: () => void;
  onSwitchToProduction?: () => void;
}

export default function ScriptsTab({ project, encodedName, name, onReload, onSwitchToProduction }: ScriptsTabProps) {
  const scripts = useMemo(() => project.scripts || [], [project.scripts]);
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(null);

  // 搜索
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState('');

  // 批量选择
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<number[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 内容预览缓存
  const [previewCache, setPreviewCache] = useState<Record<number, string>>({});

  // 加载内容预览（不加载资产）
  useEffect(() => {
    if (scripts.length === 0) return;

    const loadPreviews = async () => {
      const newPreviews: Record<number, string> = {};

      await Promise.all(
        scripts.map(async (s) => {
          try {
            const res = await fetch(`/api/projects/${encodedName}/scripts/${s.episode}`);
            if (res.ok) {
              const data = await res.json();
              const content = data.content || '';
              if (content) {
                const lines = content.split('\n').filter((l: string) => l.trim() && !l.trim().startsWith('#'));
                newPreviews[s.episode] = lines.slice(0, 2).join(' ').substring(0, 150);
              }
            }
          } catch { /* ignore */ }
        })
      );

      setPreviewCache(newPreviews);
    };

    loadPreviews();
  }, [scripts, encodedName]);

  // 构建卡片数据
  const cardDataList: ScriptCardData[] = useMemo(() => {
    return scripts.map((s) => {
      const epOutline = project.outline?.find((o) => o.episodeIndex === s.episode);
      const title = s.name || epOutline?.title || '';
      return {
        episode: s.episode,
        title,
        charCount: s.charCount || 0,
        sceneCount: s.sceneCount || 0,
        versionNo: s.versionNo,
        qualityStatus: s.qualityStatus,
        status: s.status,
        hasContent: (s.charCount || 0) > 0,
        contentPreview: previewCache[s.episode] || '',
      };
    });
  }, [scripts, project.outline, previewCache]);

  // 搜索过滤
  const filteredCards = useMemo(() => {
    if (!activeSearch.trim()) return cardDataList;
    const query = activeSearch.toLowerCase();
    return cardDataList.filter(
      (card) =>
        card.title.toLowerCase().includes(query) ||
        `ep${String(card.episode).padStart(2, '0')}`.includes(query) ||
        `第${card.episode}集`.includes(query)
    );
  }, [cardDataList, activeSearch]);

  const handleSearch = useCallback(() => {
    setActiveSearch(searchQuery);
    setSelectedIds(new Set());
  }, [searchQuery]);

  // 全选/取消
  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredCards.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCards.map((c) => c.episode)));
    }
  }, [selectedIds.size, filteredCards]);

  const allSelected = filteredCards.length > 0 && selectedIds.size === filteredCards.length;

  const toggleSelect = useCallback((episode: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(episode)) next.delete(episode);
      else next.add(episode);
      return next;
    });
  }, []);

  // 导出选中
  const handleExportSelected = useCallback(async () => {
    const episodes = selectedIds.size > 0
      ? Array.from(selectedIds).sort((a, b) => a - b)
      : scripts.map((s) => s.episode);
    if (episodes.length === 0) return;

    try {
      const res = await fetch(`/api/projects/${encodedName}/scripts/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodes }),
      });
      if (!res.ok) throw new Error('导出失败');
      const data = await res.json();
      const blob = new Blob([data.content || ''], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename || `${name}-剧本-${episodes.length}集.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch {
      alert('导出失败，请重试');
    }
  }, [selectedIds, scripts, encodedName, name]);

  // 开始制作 — 切换到 Tab 5
  const handleStartProduction = useCallback(() => {
    if (onSwitchToProduction) {
      onSwitchToProduction();
    }
  }, [onSwitchToProduction]);

  // 删除
  const handleDeleteSelected = useCallback(() => {
    const episodes = Array.from(selectedIds).sort((a, b) => a - b);
    if (episodes.length === 0) return;
    setDeleteTarget(episodes);
  }, [selectedIds]);

  const handleDeleteSingle = useCallback((episode: number) => {
    setDeleteTarget([episode]);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || deleteTarget.length === 0) return;
    setDeleting(true);
    try {
      const results = await Promise.all(
        deleteTarget.map((ep) =>
          fetch(`/api/projects/${encodedName}/scripts/${ep}`, { method: 'DELETE' })
        )
      );
      if (results.every((r) => r.ok)) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const ep of deleteTarget) next.delete(ep);
          return next;
        });
        setDeleteTarget(null);
        onReload();
      } else {
        alert('部分剧本删除失败');
      }
    } catch {
      alert('删除失败，请重试');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, encodedName, onReload]);

  // 弹窗保存后刷新
  const handleSaved = useCallback(() => {
    setSelectedEpisode(null);
    onReload();
  }, [onReload]);

  // 审核
  const [reviewEpisode, setReviewEpisode] = useState<number | null>(null);
  const [scriptReview, setScriptReview] = useState<ReviewResult | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  const triggerScriptReview = async (ep: number) => {
    setReviewEpisode(ep);
    setReviewLoading(true);
    try {
      const res = await fetch(`/api/projects/${encodedName}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'script', episode: ep }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || '审核失败');
        return;
      }
      const result: ReviewResult = await res.json();
      setScriptReview(result);
    } catch { alert('审核请求失败'); }
    finally { setReviewLoading(false); }
  };

  if (scripts.length === 0) return <EmptyScripts />;

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <ScriptHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearch={handleSearch}
        selectedCount={selectedIds.size}
        totalScripts={filteredCards.length}
        onSelectAll={handleSelectAll}
        onExportSelected={handleExportSelected}
        onStartProduction={handleStartProduction}
        onDeleteSelected={handleDeleteSelected}
        allSelected={allSelected}
        hasScripts={scripts.length > 0}
      />

      {/* 审核 */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            const ep = selectedEpisode || scripts[0]?.episode;
            if (ep) triggerScriptReview(ep);
          }}
          disabled={reviewLoading}
          className="inline-flex items-center gap-1.5 text-sm text-purple-600 hover:text-purple-800 hover:bg-purple-50 px-3 py-1.5 rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {reviewLoading ? '审核中...' : '审核剧本'}
        </button>
      </div>

      {(reviewLoading || scriptReview) && (
        <ReviewPanel
          review={scriptReview}
          loading={reviewLoading}
          onReview={() => reviewEpisode && triggerScriptReview(reviewEpisode)}
        />
      )}

      {/* 卡片网格 — 与参考产品一致的窄卡片 */}
      {filteredCards.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
          <p className="text-sm text-gray-500">未找到匹配的剧本</p>
          <p className="text-xs text-gray-400 mt-1">尝试修改搜索关键词</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCards.map((card) => (
            <ScriptCard
              key={card.episode}
              episode={card.episode}
              title={card.title}
              contentPreview={card.contentPreview}
              charCount={card.charCount}
              sceneCount={card.sceneCount}
              versionNo={card.versionNo}
              qualityStatus={card.qualityStatus}
              status={card.status}
              assetTags={undefined}
              selected={selectedIds.has(card.episode)}
              onSelect={() => toggleSelect(card.episode)}
              onClick={() => setSelectedEpisode(card.episode)}
              onDelete={() => handleDeleteSingle(card.episode)}
            />
          ))}
        </div>
      )}

      {/* 详情弹窗 */}
      {selectedEpisode !== null && (
        <ScriptDetailModal
          isOpen={selectedEpisode !== null}
          episode={selectedEpisode}
          encodedName={encodedName}
          outline={project.outline}
          onClose={() => setSelectedEpisode(null)}
          onSaved={handleSaved}
        />
      )}

      {/* 删除确认 */}
      <Modal isOpen={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="确认删除">
        <p className="text-sm text-gray-600 mb-4">
          确定要删除{deleteTarget && deleteTarget.length > 1
            ? ` ${deleteTarget.length} 集剧本`
            : deleteTarget ? ` 第${deleteTarget[0]}集剧本` : ''}
          吗？此操作不可撤销。
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button variant="danger" size="sm" onClick={confirmDelete} loading={deleting}>确认删除</Button>
        </div>
      </Modal>
    </div>
  );
}
