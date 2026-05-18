'use client';

type ModelEmptyType = 'language' | 'video' | 'image';

interface ModelEmptyStateProps {
  type: ModelEmptyType;
  onAdd: () => void;
}

const CONFIG: Record<ModelEmptyType, { icon: React.ReactNode; title: string; desc: string }> = {
  language: {
    icon: (
      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    title: '尚未配置语言模型',
    desc: '语言模型用于剧本生成和 AI 对话，请先添加至少一个模型',
  },
  video: {
    icon: (
      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
      </svg>
    ),
    title: '尚未配置视频模型',
    desc: '视频模型用于视频片段合成，请先添加至少一个模型',
  },
  image: {
    icon: (
      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    title: '尚未配置图像模型',
    desc: '图像模型用于角色立绘和场景图，请先添加至少一个模型',
  },
};

export default function ModelEmptyState({ type, onAdd }: ModelEmptyStateProps) {
  const { icon, title, desc } = CONFIG[type];

  return (
    <div className="py-10 text-center">
      <div className="mx-auto mb-3 text-gray-200">{icon}</div>
      <p className="text-sm text-gray-500 mb-1">{title}</p>
      <p className="text-xs text-gray-400 mb-4">{desc}</p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors duration-200"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        快速添加
      </button>
    </div>
  );
}
