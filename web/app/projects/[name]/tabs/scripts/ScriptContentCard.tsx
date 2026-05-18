'use client';

import Button from '@/app/components/Button';
import { SKELETON_WIDTHS, renderScriptLine } from '../../utils/scriptUtils';
import SectionCard from './SectionCard';

interface ScriptContentCardProps {
  scriptContent: string;
  scriptLoading: boolean;
  isEditing: boolean;
  editContent: string;
  saving: boolean;
  wordCount: number;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onEditChange: (val: string) => void;
}

export default function ScriptContentCard({
  scriptContent,
  scriptLoading,
  isEditing,
  editContent,
  saving,
  wordCount,
  onStartEdit,
  onCancelEdit,
  onSave,
  onEditChange,
}: ScriptContentCardProps) {
  const icon = (
    <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );

  const action = (
    <div className="flex items-center gap-3">
      {!isEditing && wordCount > 0 && (
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">{wordCount} 字符</span>
      )}
      {isEditing ? (
        <div className="flex gap-2">
          <Button size="sm" onClick={onSave} loading={saving}>保存剧本</Button>
          <Button size="sm" variant="secondary" onClick={onCancelEdit}>取消</Button>
        </div>
      ) : scriptContent ? (
        <button
          onClick={onStartEdit}
          className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700 transition"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          编辑
        </button>
      ) : null}
    </div>
  );

  return (
    <SectionCard icon={icon} title="剧本内容" action={action} noPadding>
      <div>
        {scriptLoading ? (
          <div className="p-6 animate-pulse space-y-2">
            {SKELETON_WIDTHS.slice(0, 8).map((w, i) => (
              <div key={i} className="h-4 bg-gray-100 rounded" style={{ width: w }} />
            ))}
          </div>
        ) : isEditing ? (
          <div className="relative">
            <p className="px-5 pt-3 text-xs text-gray-400">编辑完成后点击「保存剧本」，内容将写入本地文件。</p>
            <textarea
              value={editContent}
              onChange={e => onEditChange(e.target.value)}
              rows={25}
              disabled={saving}
              className="w-full px-5 py-4 text-sm font-mono resize-none focus:outline-none border-none bg-gray-50 disabled:opacity-60"
              style={{ lineHeight: '1.8' }}
            />
            <span className="absolute bottom-2 right-4 text-xs text-gray-400">{wordCount} 字符</span>
          </div>
        ) : scriptContent ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <tbody>
                {scriptContent.split('\n').map((line, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-0.5 text-right text-sm text-gray-400 select-none w-12 align-top" style={{ lineHeight: '1.8' }}>
                      {i + 1}
                    </td>
                    <td className="px-4 py-0.5 text-sm text-gray-700 whitespace-pre-wrap font-mono" style={{ lineHeight: '1.8' }}>
                      {renderScriptLine(line)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center">
            <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-gray-500">还没有剧本内容</p>
            <p className="text-xs text-gray-400 mt-1">在内容工作台使用「生成剧本」功能开始</p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
