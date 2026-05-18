'use client';
import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseDirectorNotes } from './directorParser';
import DirectorDetailModal from './DirectorDetailModal';

interface DirectorSectionProps {
  encodedName: string;
  episode: number;
}

export default function DirectorSection({ encodedName, episode }: DirectorSectionProps) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ title: string; fullTable: Record<string, string> } | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/projects/${encodedName}/seedance/${episode}/director`)
      .then(res => res.ok ? res.json() : { content: '' })
      .then(data => setContent(data.content || ''))
      .catch(() => setContent(''))
      .finally(() => setLoading(false));
  }, [encodedName, episode]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 animate-pulse space-y-3">
        {(['60%', '85%', '72%', '90%', '68%', '78%'] as const).map((w, i) => (
          <div key={i} className="h-4 bg-gray-100 rounded" style={{ width: w }} />
        ))}
      </div>
    );
  }

  if (!content) {
    return (
      <div className="bg-white rounded-xl py-12 text-center text-gray-500 shadow-sm">
        <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.069A1 1 0 0121 8.868V15.13a1 1 0 01-1.447.899L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <p className="text-sm">暂无导演讲戏本</p>
        <p className="text-xs mt-1">在制作面板中使用 Seedance 模式生成</p>
      </div>
    );
  }

  const data = parseDirectorNotes(content);

  // 解析失败时降级到 markdown 渲染
  if (data.characters.length === 0 && data.scenes.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="bg-gray-800 border-l-4 border-purple-400 px-5 py-3">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.868V15.13a1 1 0 01-1.447.899L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            导演讲戏本
          </h3>
        </div>
        <div className="p-5 prose prose-sm max-w-none prose-table:w-full prose-th:bg-gray-50 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-th:text-left prose-table:border-collapse prose-th:border prose-td:border prose-th:border-gray-200 prose-td:border-gray-200">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* 情绪弧线区块 */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <span>情绪弧线</span>
          </h3>
          {(data.emotionalArc || data.summary) ? (
            <>
              {data.emotionalArc && (
                <div className="bg-purple-50 rounded-lg p-4 text-sm text-gray-700">
                  {data.emotionalArc}
                </div>
              )}
              {data.emotionalKeywords && (
                <p className="text-xs text-gray-500 mt-2">{data.emotionalKeywords}</p>
              )}
              {data.summary && !data.emotionalArc && (
                <div className="bg-purple-50 rounded-lg p-4 text-sm text-gray-700">
                  {data.summary}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">情绪弧线未生成</p>
          )}
        </div>

        {/* 人物清单 */}
        {data.characters.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">
              人物清单（{data.characters.length}人）
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.characters.map((char, i) => (
                <div
                  key={i}
                  className="bg-white rounded-lg border border-gray-100 p-4 hover:shadow-md transition"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold text-gray-800">{char.name}</span>
                    {char.role && (
                      <span className="text-xs text-purple-600 bg-purple-100 px-2 py-0.5 rounded">
                        {char.role}
                      </span>
                    )}
                  </div>
                  {char.age && (
                    <p className="text-xs text-gray-500">年龄：{char.age}</p>
                  )}
                  {char.appearance && (
                    <p className="text-xs text-gray-500 line-clamp-1">外形：{char.appearance}</p>
                  )}
                  {char.costume && (
                    <p className="text-xs text-gray-500 line-clamp-1">服装：{char.costume}</p>
                  )}
                  {char.emotion && (
                    <p className="text-xs text-gray-400 italic mt-1 line-clamp-1">{char.emotion}</p>
                  )}
                  <button
                    onClick={() => setModal({ title: `${char.name}（${char.role}）`, fullTable: char.fullTable })}
                    className="text-xs text-purple-600 hover:text-purple-700 mt-2 px-2 py-0.5 rounded hover:bg-purple-50 transition -ml-2"
                  >
                    查看详情
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 场景清单 */}
        {data.scenes.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">
              场景清单（{data.scenes.length}个）
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.scenes.map((scene, i) => (
                <div
                  key={i}
                  className="bg-white rounded-lg border border-gray-100 p-4 hover:shadow-md transition"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">
                      {scene.id}
                    </span>
                    <span className="text-sm font-semibold text-gray-800">{scene.name}</span>
                  </div>
                  {scene.time && (
                    <p className="text-xs text-gray-500">时间：{scene.time}</p>
                  )}
                  {scene.atmosphere && (
                    <p className="text-xs text-gray-500 line-clamp-1">氛围：{scene.atmosphere}</p>
                  )}
                  {scene.lighting && (
                    <p className="text-xs text-gray-500">光线：{scene.lighting}</p>
                  )}
                  <button
                    onClick={() => setModal({ title: `场景 ${scene.id}：${scene.name}`, fullTable: scene.fullTable })}
                    className="text-xs text-purple-600 hover:text-purple-700 mt-2 px-2 py-0.5 rounded hover:bg-purple-50 transition -ml-2"
                  >
                    查看详情
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 详情模态框 */}
      {modal && (
        <DirectorDetailModal
          title={modal.title}
          fullTable={modal.fullTable}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
