'use client';

import { useState } from 'react';

interface IdentityAnchorTagsProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

/** 视觉锚点标签编辑组件（增删标签） */
export default function IdentityAnchorTags({ tags, onChange }: IdentityAnchorTagsProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const handleRemove = (index: number) => {
    const newTags = tags.filter((_, i) => i !== index);
    onChange(newTags);
  };

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInputValue('');
    setIsAdding(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    } else if (e.key === 'Escape') {
      setInputValue('');
      setIsAdding(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((tag, index) => (
        <span
          key={`${tag}-${index}`}
          className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded-lg"
        >
          {tag}
          <button
            onClick={() => handleRemove(index)}
            className="w-3.5 h-3.5 text-purple-400 hover:text-purple-600 cursor-pointer flex items-center justify-center"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      ))}

      {isAdding ? (
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleAdd}
          autoFocus
          className="border border-purple-300 rounded-lg px-2 py-1 text-xs w-24 outline-none"
          placeholder="输入锚点..."
        />
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center gap-1 px-2 py-1 border border-dashed border-gray-300 text-gray-400 text-xs rounded-lg cursor-pointer hover:border-purple-300 hover:text-purple-500 transition-colors duration-150"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          添加
        </button>
      )}
    </div>
  );
}
