'use client';

export default function AssistantBar() {
  return (
    <div className="border-t border-gray-100 bg-white px-5 py-3">
      <div className="max-w-2xl mx-auto flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3">
        {/* 左侧 sparkles 图标 */}
        <svg className="w-4 h-4 text-purple-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3l1.5 3.5L10 8l-3.5 1.5L5 13l-1.5-3.5L0 8l3.5-1.5L5 3zM19 11l1 2.5 2.5 1-2.5 1L19 18l-1-2.5L15.5 14.5l2.5-1L19 11zM12 1l.8 1.8 1.8.8-1.8.8L12 6l-.8-1.8L9.4 3.4l1.8-.8L12 1z" />
        </svg>
        <input
          disabled
          placeholder="向 AI 助手提问审核建议、修改方案..."
          className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder-gray-400 cursor-not-allowed"
        />
        <button
          disabled
          className="w-8 h-8 rounded-xl bg-purple-100 text-purple-300 flex items-center justify-center cursor-not-allowed shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        </button>
      </div>
      <p className="text-[11px] text-gray-300 text-center mt-1.5">AI 助手功能即将开放</p>
    </div>
  );
}
