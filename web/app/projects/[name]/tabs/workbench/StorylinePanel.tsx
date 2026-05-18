'use client';

import { useState } from 'react';
import ReviewBadge from '@/app/components/ReviewBadge';
import ReviewDrawer from '@/app/components/ReviewDrawer';
import { ReviewResult } from '@/app/lib/novels';

interface StorylinePanelProps {
  storyline?: string;
  encodedName: string;
  review: ReviewResult | null;
  onReload: () => void;
  onReview?: () => void;
}

export default function StorylinePanel({
  storyline,
  encodedName,
  review,
  onReload,
  onReview,
}: StorylinePanelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const save = async () => {
    await fetch(`/api/projects/${encodedName}/storyline`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyline: draft }),
    });
    setEditing(false);
    onReload();
  };

  return (
    <div className="relative overflow-hidden flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900">故事线</h2>
        <div className="flex items-center gap-2">
          <ReviewBadge review={review} onClick={() => setDrawerOpen(true)} />
          {!editing ? (
            <button
              onClick={() => { setDraft(storyline || ''); setEditing(true); }}
              className="text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 px-2.5 py-1.5 rounded-md transition"
            >
              编辑
            </button>
          ) : (
            <button
              onClick={() => setEditing(false)}
              className="text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 px-2.5 py-1.5 rounded-md transition"
            >
              取消
            </button>
          )}
        </div>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto">
        {editing ? (
          <div>
            <textarea
              value={draft}
              onChange={(e) => { if (e.target.value.length <= 5000) setDraft(e.target.value); }}
              rows={20}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
            />
            <div className="flex justify-between items-center mt-2">
              <span className="text-xs text-gray-400">{draft.length}/5000</span>
              <button
                onClick={save}
                className="px-4 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                保存
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
            {storyline || '暂无故事线'}
          </div>
        )}
      </div>

      {/* 审核抽屉 */}
      {review && (
        <ReviewDrawer
          open={drawerOpen}
          review={review}
          onClose={() => setDrawerOpen(false)}
          onReview={onReview ?? (() => {})}
        />
      )}
    </div>
  );
}
