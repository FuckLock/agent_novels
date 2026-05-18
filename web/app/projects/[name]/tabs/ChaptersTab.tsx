'use client';
import { useState } from 'react';
import Modal from '@/app/components/Modal';
import { ChapterItem, ProjectDetail } from '../types';

interface ChaptersTabProps {
  project: ProjectDetail;
  encodedName: string;
  name: string;
  onReload: () => void;
}

export default function ChaptersTab({ project, encodedName, onReload }: ChaptersTabProps) {
  // 章节 - 新增弹框（两步）
  const [showAddChapter, setShowAddChapter] = useState(false);
  const [addStep, setAddStep] = useState<1 | 2>(1);
  const [rawNovelText, setRawNovelText] = useState('');
  const [parsedChapters, setParsedChapters] = useState<{ number: number; title: string; content: string }[]>([]);

  // 章节 - 编辑弹框
  const [editChapter, setEditChapter] = useState<ChapterItem | null>(null);
  const [editChapterContent, setEditChapterContent] = useState('');
  const [editChapterTitle, setEditChapterTitle] = useState('');
  const [editChapterLoading, setEditChapterLoading] = useState(false);

  // 章节 - 删除确认
  const [deleteChapter, setDeleteChapter] = useState<ChapterItem | null>(null);

  const chapters = project.chapters || [];

  // ========== 章节：解析原文 ==========
  // 中文数字转阿拉伯数字
  const chineseNumToArabic = (str: string): number => {
    const map: Record<string, number> = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '百': 100, '千': 1000, '万': 10000 };
    if (/^\d+$/.test(str)) return parseInt(str, 10);
    let result = 0, temp = 0;
    for (const ch of str) {
      const n = map[ch];
      if (n === undefined) continue;
      if (n >= 10) {
        result += (temp || 1) * n;
        temp = 0;
      } else {
        temp = temp * 10 + n;
      }
    }
    return result + temp;
  };

  const parseNovelText = () => {
    const lines = rawNovelText.split('\n');
    const chapters: { number: number; title: string; content: string }[] = [];
    let currentNum = 0;
    let currentTitle = '';
    let currentLines: string[] = [];

    // 匹配"第X章"并捕获章节号部分
    const chapterRegex = /^第([一二三四五六七八九十百千万\d]+)章/;

    for (const line of lines) {
      const match = line.trim().match(chapterRegex);
      if (match) {
        if (currentTitle && currentLines.length > 0) {
          chapters.push({ number: currentNum, title: currentTitle, content: currentLines.join('\n').trim() });
        }
        currentNum = chineseNumToArabic(match[1]);
        currentTitle = line.trim();
        currentLines = [line];
      } else {
        currentLines.push(line);
      }
    }
    // 最后一个章节
    if (currentTitle && currentLines.length > 0) {
      chapters.push({ number: currentNum, title: currentTitle, content: currentLines.join('\n').trim() });
    }
    // 如果没有识别到章节格式，整体作为下一章
    if (chapters.length === 0 && rawNovelText.trim()) {
      const existingChapters = project.chapters || [];
      const nextNum = existingChapters.length > 0 ? Math.max(...existingChapters.map(c => c.number)) + 1 : 1;
      chapters.push({ number: nextNum, title: `第${nextNum}章`, content: rawNovelText.trim() });
    }

    setParsedChapters(chapters);
    setAddStep(2);
  };

  // ========== 章节：批量保存 ==========
  const saveNewChapters = async () => {
    await fetch(`/api/projects/${encodedName}/chapters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapters: parsedChapters.map(c => ({ number: c.number, content: c.content })) }),
    });
    setShowAddChapter(false);
    setAddStep(1);
    setRawNovelText('');
    setParsedChapters([]);
    onReload();
  };

  // ========== 章节：打开编辑 ==========
  const openEditChapter = async (ch: ChapterItem) => {
    setEditChapter(ch);
    setEditChapterTitle(ch.title || `第${ch.number}章`);
    setEditChapterLoading(true);
    try {
      const res = await fetch(`/api/projects/${encodedName}/chapters/${ch.number}`);
      const data = await res.json();
      setEditChapterContent(data.content || '');
    } catch {
      setEditChapterContent('');
    }
    setEditChapterLoading(false);
  };

  // ========== 章节：保存编辑 ==========
  const saveEditChapter = async () => {
    if (!editChapter) return;
    // 如果标题被修改，替换内容第一行
    const lines = editChapterContent.split('\n');
    const chapterRegex = /^第[一二三四五六七八九十百千万\d]+章/;
    let finalContent = editChapterContent;
    if (editChapterTitle && chapterRegex.test(lines[0]?.trim() || '')) {
      lines[0] = editChapterTitle;
      finalContent = lines.join('\n');
    } else if (editChapterTitle && !chapterRegex.test(lines[0]?.trim() || '')) {
      finalContent = editChapterTitle + '\n' + editChapterContent;
    }
    await fetch(`/api/projects/${encodedName}/chapters/${editChapter.number}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: finalContent }),
    });
    setEditChapter(null);
    onReload();
  };

  // ========== 章节：确认删除 ==========
  const confirmDeleteChapter = async () => {
    if (!deleteChapter) return;
    await fetch(`/api/projects/${encodedName}/chapters/${deleteChapter.number}`, { method: 'DELETE' });
    setDeleteChapter(null);
    onReload();
  };

  return (
    <>
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-1">小说原文</h2>
          <p className="text-sm text-gray-500">查看小说原文</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-sm font-semibold text-gray-800">原文管理</h3>
          </div>
          <button
            onClick={() => { setShowAddChapter(true); setAddStep(1); setRawNovelText(''); setParsedChapters([]); }}
            className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
          >
            + 新增
          </button>
        </div>

        {chapters.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 w-16">章</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 w-20">卷</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 w-40">章节名称</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">内容摘要</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 w-28 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {chapters.map((ch) => (
                  <tr key={ch.number} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600">{ch.number}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">正文卷</td>
                    <td className="px-4 py-3 text-sm text-gray-800">{ch.title || `第${ch.number}章`}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 truncate max-w-[300px]">{ch.preview || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => openEditChapter(ch)}
                          className="text-sm text-purple-600 hover:text-purple-800"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => setDeleteChapter(ch)}
                          className="text-sm text-red-500 hover:text-red-700"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        ) : (
          <div className="p-12 text-center text-gray-400">
            暂无章节，点击右上角「+ 新增」添加小说原文
          </div>
        )}
        </div>{/* 关闭白色卡片容器 */}
      </div>

      {/* ==================== 弹框：新增章节（两步） ==================== */}
      {showAddChapter && (
        <Modal isOpen={true} onClose={() => { setShowAddChapter(false); setAddStep(1); }} title="上传小说原文">
          {/* 步骤指示器 */}
          <div className="flex gap-4 mb-5 border-b pb-3">
            <button className={`text-sm pb-1 ${addStep === 1 ? 'text-purple-600 border-b-2 border-purple-600 font-medium' : 'text-gray-400'}`}>
              第一步：上传原文
            </button>
            <button className={`text-sm pb-1 ${addStep === 2 ? 'text-purple-600 border-b-2 border-purple-600 font-medium' : 'text-gray-400'}`}>
              第二步：确认章节
            </button>
          </div>
          {addStep === 1 ? (
            <div className="space-y-4">
              {/* 文件拖拽上传区 */}
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-purple-400 transition"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file && (file.name.endsWith('.txt') || file.name.endsWith('.docx'))) {
                    if (file.name.endsWith('.docx')) {
                      alert('暂不支持直接解析 .docx 文件，请先将内容复制粘贴到下方文本框，或转换为 .txt 格式后上传');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = (ev) => setRawNovelText(ev.target?.result as string || '');
                    reader.readAsText(file);
                  }
                }}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.txt,.docx';
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) {
                      if (file.name.endsWith('.docx')) {
                        alert('暂不支持直接解析 .docx 文件，请先将内容复制粘贴到下方文本框，或转换为 .txt 格式后上传');
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = (ev) => setRawNovelText(ev.target?.result as string || '');
                      reader.readAsText(file);
                    }
                  };
                  input.click();
                }}
              >
                <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm text-gray-500">拖拽小说原文文件到此处或点击上传</p>
                <p className="text-xs text-gray-400 mt-1">支持 .txt, .docx 格式，建议文件大小不超过 10MB</p>
              </div>
              <div className="text-center text-xs text-gray-400">或</div>
              <textarea
                value={rawNovelText}
                onChange={(e) => setRawNovelText(e.target.value)}
                rows={8}
                placeholder="直接粘贴小说原文内容..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 bg-gray-50"
              />
              <div className="flex justify-between items-center">
                <div className="flex gap-4">
                  <span className="text-xs text-gray-400">{rawNovelText.length} 字符</span>
                  <span className="text-xs text-gray-400">已解析 {rawNovelText.trim() ? (rawNovelText.match(/^第[一二三四五六七八九十百千万\d]+章/gm) || []).length || (rawNovelText.trim() ? 1 : 0) : 0} 章节</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowAddChapter(false)} className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">取消</button>
                  <button
                    onClick={parseNovelText}
                    disabled={!rawNovelText.trim()}
                    className="px-4 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                  >
                    下一步
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">共解析出 {parsedChapters.length} 个章节，确认后将保存</p>
              <div className="max-h-[300px] overflow-y-auto space-y-2">
                {parsedChapters.map((ch, i) => (
                  <div key={i} className="p-3 bg-gray-50 rounded-lg">
                    <div className="font-semibold text-sm text-gray-800">第{ch.number}章: {ch.title}</div>
                    <div className="text-xs text-gray-500 mt-1">{ch.content.substring(0, 80)}...</div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setAddStep(1)} className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">上一步</button>
                <button
                  onClick={saveNewChapters}
                  className="px-4 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  保存
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ==================== 弹框：编辑章节 ==================== */}
      {editChapter && (
        <Modal isOpen={true} onClose={() => setEditChapter(null)} title={`编辑 第${editChapter.number}章`}>
          {editChapterLoading ? (
            <div className="text-center py-8 text-gray-400">加载中...</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">章</label>
                  <input type="text" value={editChapter.number} disabled className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-100 text-gray-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">卷</label>
                  <input type="text" value="正文卷" disabled className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-100 text-gray-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">章节名称</label>
                  <input
                    type="text"
                    value={editChapterTitle}
                    onChange={(e) => setEditChapterTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-gray-50"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">章节内容</label>
                <textarea
                  value={editChapterContent}
                  onChange={(e) => setEditChapterContent(e.target.value)}
                  rows={14}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 bg-gray-50"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditChapter(null)} className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">取消</button>
                <button onClick={saveEditChapter} className="px-4 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700">确定</button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ==================== 弹框：删除章节确认 ==================== */}
      {deleteChapter && (
        <Modal isOpen={true} onClose={() => setDeleteChapter(null)} title="确认删除">
          <p className="text-gray-600 mb-4">确定删除「第{deleteChapter.number}章 {deleteChapter.title}」？此操作会删除对应的 chapter-{deleteChapter.number}.txt 文件，不可恢复！</p>
          <div className="flex gap-2">
            <button onClick={confirmDeleteChapter} className="px-4 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">确认删除</button>
            <button onClick={() => setDeleteChapter(null)} className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">取消</button>
          </div>
        </Modal>
      )}
    </>
  );
}
