'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Code,
  Quote,
  Link,
  Undo2,
  Redo2,
  X,
} from 'lucide-react';
import MarkdownPreview from './MarkdownPreview';

interface MarkdownEditorModalProps {
  isOpen: boolean;
  initialContent: string;
  title?: string;
  onSave: (content: string) => void;
  onCancel: () => void;
}

interface HistoryEntry {
  content: string;
  selectionStart: number;
  selectionEnd: number;
}

export default function MarkdownEditorModal({
  isOpen,
  initialContent,
  title = '编辑',
  onSave,
  onCancel,
}: MarkdownEditorModalProps) {
  const [content, setContent] = useState(initialContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Undo/Redo history
  const historyRef = useRef<HistoryEntry[]>([{ content: initialContent, selectionStart: 0, selectionEnd: 0 }]);
  const historyIndexRef = useRef(0);
  const skipHistoryRef = useRef(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setContent(initialContent);
      historyRef.current = [{ content: initialContent, selectionStart: 0, selectionEnd: 0 }];
      historyIndexRef.current = 0;
    }
  }, [isOpen, initialContent]);

  // ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  const pushHistory = useCallback((newContent: string, selStart: number, selEnd: number) => {
    const history = historyRef.current;
    const idx = historyIndexRef.current;
    // Trim future entries
    historyRef.current = history.slice(0, idx + 1);
    historyRef.current.push({ content: newContent, selectionStart: selStart, selectionEnd: selEnd });
    historyIndexRef.current = historyRef.current.length - 1;
  }, []);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    if (!skipHistoryRef.current) {
      const ta = textareaRef.current;
      pushHistory(newContent, ta?.selectionStart ?? 0, ta?.selectionEnd ?? 0);
    }
    skipHistoryRef.current = false;
  }, [pushHistory]);

  const undo = useCallback(() => {
    const idx = historyIndexRef.current;
    if (idx <= 0) return;
    historyIndexRef.current = idx - 1;
    const entry = historyRef.current[idx - 1];
    skipHistoryRef.current = true;
    setContent(entry.content);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.selectionStart = entry.selectionStart;
        ta.selectionEnd = entry.selectionEnd;
        ta.focus();
      }
    });
  }, []);

  const redo = useCallback(() => {
    const idx = historyIndexRef.current;
    if (idx >= historyRef.current.length - 1) return;
    historyIndexRef.current = idx + 1;
    const entry = historyRef.current[idx + 1];
    skipHistoryRef.current = true;
    setContent(entry.content);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.selectionStart = entry.selectionStart;
        ta.selectionEnd = entry.selectionEnd;
        ta.focus();
      }
    });
  }, []);

  const insertSyntax = useCallback(
    (before: string, after: string, placeholder: string) => {
      const ta = textareaRef.current;
      if (!ta) return;

      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = content.substring(start, end);
      const text = selected || placeholder;
      const newContent =
        content.substring(0, start) + before + text + after + content.substring(end);

      setContent(newContent);

      const cursorStart = start + before.length;
      const cursorEnd = cursorStart + text.length;
      pushHistory(newContent, cursorStart, cursorEnd);

      requestAnimationFrame(() => {
        ta.focus();
        ta.selectionStart = cursorStart;
        ta.selectionEnd = cursorEnd;
      });
    },
    [content, pushHistory],
  );

  const insertLinePrefix = useCallback(
    (prefix: string) => {
      const ta = textareaRef.current;
      if (!ta) return;

      const start = ta.selectionStart;
      // Find start of current line
      const lineStart = content.lastIndexOf('\n', start - 1) + 1;
      const newContent = content.substring(0, lineStart) + prefix + content.substring(lineStart);

      setContent(newContent);

      const cursor = start + prefix.length;
      pushHistory(newContent, cursor, cursor);

      requestAnimationFrame(() => {
        ta.focus();
        ta.selectionStart = cursor;
        ta.selectionEnd = cursor;
      });
    },
    [content, pushHistory],
  );

  const toolbarItems = [
    { icon: Bold, label: '加粗', action: () => insertSyntax('**', '**', 'text') },
    { icon: Italic, label: '斜体', action: () => insertSyntax('*', '*', 'text') },
    { icon: Strikethrough, label: '删除线', action: () => insertSyntax('~~', '~~', 'text') },
    { type: 'separator' as const },
    { icon: Heading1, label: 'H1', action: () => insertLinePrefix('# ') },
    { icon: Heading2, label: 'H2', action: () => insertLinePrefix('## ') },
    { type: 'separator' as const },
    { icon: ListOrdered, label: '有序列表', action: () => insertLinePrefix('1. ') },
    { icon: List, label: '无序列表', action: () => insertLinePrefix('- ') },
    { type: 'separator' as const },
    { icon: Code, label: '代码', action: () => insertSyntax('`', '`', 'code') },
    { icon: Quote, label: '引用', action: () => insertLinePrefix('> ') },
    { icon: Link, label: '链接', action: () => insertSyntax('[', '](url)', 'text') },
    { type: 'separator' as const },
    { icon: Undo2, label: '撤销', action: undo },
    { icon: Redo2, label: '重做', action: redo },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <button
          onClick={onCancel}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
          aria-label="关闭"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-6 py-2 border-b border-gray-100 bg-gray-50 flex-wrap">
        {toolbarItems.map((item, i) => {
          if ('type' in item && item.type === 'separator') {
            return <div key={i} className="w-px h-5 bg-gray-200 mx-1" />;
          }
          const Icon = item.icon!;
          return (
            <button
              key={i}
              onClick={item.action}
              title={item.label}
              className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded transition"
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </div>

      {/* Editor + Preview */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Source editor */}
        <div className="flex-1 flex flex-col border-r border-gray-200 min-w-0">
          <div className="text-xs text-gray-400 px-4 pt-2 pb-1">Markdown 源码</div>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            className="flex-1 w-full px-4 py-2 text-sm resize-none focus:outline-none bg-white font-mono leading-relaxed"
            spellCheck={false}
          />
        </div>

        {/* Right: Preview */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="text-xs text-gray-400 px-4 pt-2 pb-1">实时预览</div>
          <div className="flex-1 overflow-y-auto px-6 py-2">
            <MarkdownPreview content={content} />
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50">
        <span className="text-xs text-gray-400">{content.length} 字</span>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
          >
            取消
          </button>
          <button
            onClick={() => onSave(content)}
            className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
