'use client';

interface PipelineProgressProps {
  hasDirector: boolean;
  hasDesign: boolean;
  hasPrompts: boolean;
}

export default function PipelineProgress({
  hasDirector,
  hasDesign,
  hasPrompts,
}: PipelineProgressProps) {
  const steps = [
    { label: '导演讲戏', done: hasDirector },
    { label: '服化道设计', done: hasDesign },
    { label: '分镜提示词', done: hasPrompts },
  ];

  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-1">
          {/* 步骤：纵向圆点+标签 */}
          <div className="flex flex-col items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${
              step.done
                ? 'bg-green-500 text-white'
                : 'bg-gray-200 text-gray-400'
            }`}>
              {step.done ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span className={`text-xs mt-2 ${
              step.done
                ? 'text-green-600 font-medium'
                : 'text-gray-400'
            }`}>
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 min-w-[20px] h-0.5 mx-1 mb-5 ${step.done ? 'bg-green-400' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}
