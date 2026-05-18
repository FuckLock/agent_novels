'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  X,
  FlipHorizontal2,
  RotateCw,
  ZoomOut,
  ZoomIn,
  Maximize2,
  Download,
} from 'lucide-react';

interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

interface Position {
  x: number;
  y: number;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
const SCALE_STEP = 0.25;
const WHEEL_STEP = 0.1;

export default function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [scale, setScale] = useState(0.25);
  const [rotation, setRotation] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });

  const isDragging = useRef(false);
  const dragStart = useRef<Position>({ x: 0, y: 0 });
  const positionStart = useRef<Position>({ x: 0, y: 0 });

  // 入场动画
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // 重置到适应屏幕
  const resetView = useCallback(() => {
    setScale(1);
    setRotation(0);
    setFlipX(false);
    setPosition({ x: 0, y: 0 });
  }, []);

  // 缩放约束
  const clampScale = useCallback((s: number) => {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(s * 100) / 100));
  }, []);

  // 鼠标滚轮缩放
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setScale((prev) => {
        const delta = e.deltaY > 0 ? -WHEEL_STEP : WHEEL_STEP;
        return clampScale(prev + delta);
      });
    };
    window.addEventListener('wheel', handler, { passive: false });
    return () => window.removeEventListener('wheel', handler);
  }, [clampScale]);

  // 拖拽开始
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    positionStart.current = { ...position };
  }, [position]);

  // 拖拽移动 + 拖拽结束
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPosition({
        x: positionStart.current.x + dx,
        y: positionStart.current.y + dy,
      });
    };
    const handleMouseUp = () => {
      isDragging.current = false;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // 双击重置
  const handleDoubleClick = useCallback(() => {
    resetView();
  }, [resetView]);

  // 操作方法
  const handleFlipX = useCallback(() => {
    setFlipX((prev) => !prev);
  }, []);

  const handleRotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => clampScale(prev - SCALE_STEP));
  }, [clampScale]);

  const handleZoomIn = useCallback(() => {
    setScale((prev) => clampScale(prev + SCALE_STEP));
  }, [clampScale]);

  const handleDownload = useCallback(() => {
    const a = document.createElement('a');
    a.href = src;
    a.download = alt || 'image';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [src, alt]);

  // 点击遮罩关闭
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // CSS transform
  const imageTransform = `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg) scaleX(${flipX ? -1 : 1})`;
  const scalePercent = Math.round(scale * 100);

  return (
    <div
      className={`fixed inset-0 z-[60] transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
      role="dialog"
      aria-modal="true"
    >
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/85"
        onClick={handleBackdropClick}
      />

      {/* 图片区域 */}
      <div
        className="absolute inset-0 flex items-center justify-center pb-20 overflow-hidden"
        onClick={handleBackdropClick}
        onDoubleClick={handleDoubleClick}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          onMouseDown={handleMouseDown}
          className="max-w-[90vw] max-h-[85vh] object-contain select-none"
          style={{
            transform: imageTransform,
            cursor: isDragging.current ? 'grabbing' : 'grab',
            transition: isDragging.current ? 'none' : 'transform 0.2s ease',
          }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            e.stopPropagation();
            resetView();
          }}
        />
      </div>

      {/* 右上角关闭按钮 */}
      <button
        onClick={onClose}
        autoFocus
        className="fixed top-4 right-4 w-9 h-9 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition z-[61]"
      >
        <X className="w-5 h-5 text-white/80" />
      </button>

      {/* 底部工具栏 */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[61] flex items-center gap-1 bg-black/60 backdrop-blur-md rounded-full px-4 py-2">
        {/* 水平翻转 */}
        <ToolbarButton onClick={handleFlipX} title="水平翻转" active={flipX}>
          <FlipHorizontal2 className="w-[18px] h-[18px]" />
        </ToolbarButton>

        {/* 旋转 */}
        <ToolbarButton onClick={handleRotate} title="旋转 90 度">
          <RotateCw className="w-[18px] h-[18px]" />
        </ToolbarButton>

        {/* 分隔线 */}
        <div className="w-px h-5 bg-white/20 mx-1" />

        {/* 缩小 */}
        <ToolbarButton onClick={handleZoomOut} title="缩小" disabled={scale <= MIN_SCALE}>
          <ZoomOut className="w-[18px] h-[18px]" />
        </ToolbarButton>

        {/* 缩放百分比 */}
        <span className="text-white/80 text-xs font-medium min-w-[42px] text-center select-none tabular-nums">
          {scalePercent}%
        </span>

        {/* 放大 */}
        <ToolbarButton onClick={handleZoomIn} title="放大" disabled={scale >= MAX_SCALE}>
          <ZoomIn className="w-[18px] h-[18px]" />
        </ToolbarButton>

        {/* 分隔线 */}
        <div className="w-px h-5 bg-white/20 mx-1" />

        {/* 适应屏幕 */}
        <ToolbarButton onClick={resetView} title="适应屏幕">
          <Maximize2 className="w-[18px] h-[18px]" />
        </ToolbarButton>

        {/* 下载 */}
        <ToolbarButton onClick={handleDownload} title="下载">
          <Download className="w-[18px] h-[18px]" />
        </ToolbarButton>
      </div>
    </div>
  );
}

/** 工具栏按钮子组件 */
function ToolbarButton({
  onClick,
  title,
  children,
  active,
  disabled,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors duration-150
        ${active ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'}
        ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {children}
    </button>
  );
}
