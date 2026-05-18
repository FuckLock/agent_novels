export default function EmptyScripts() {
  return (
    <div className="bg-white rounded-xl p-12 text-center shadow-sm w-full">
      <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
      </svg>
      <p className="text-sm text-gray-500 mb-1">暂无剧本</p>
      <p className="text-xs text-gray-400 mt-1">请在内容工作台使用 AI 生成剧本</p>
    </div>
  );
}
