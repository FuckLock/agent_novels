"use client";

import { useEffect, useState } from "react";

export default function TitleBar() {
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    const electron =
      typeof window !== "undefined" &&
      !!(window as unknown as Record<string, unknown>).electronAPI;

    setIsElectron(electron);
    document.documentElement.classList.toggle("toonflow-electron", electron);

    return () => {
      document.documentElement.classList.remove("toonflow-electron");
    };
  }, []);

  if (!isElectron) return null;

  return (
    <div
      className="toonflow-titlebar"
      style={{
        height: 36,
        backgroundColor: "#ffffff",
        borderBottom: "1px solid #e5e5e5",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        WebkitAppRegion: "drag",
        flexShrink: 0,
      } as React.CSSProperties}
    >
      {/* 左侧留空：Mac 红绿灯按钮区域 */}
      <div style={{ width: 70, flexShrink: 0 }} />

      {/* 右侧按钮组 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          paddingRight: 12,
          gap: 8,
          WebkitAppRegion: "no-drag",
        } as React.CSSProperties}
      >
        {/* 用户头像占位 */}
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            backgroundColor: "#d1d5db",
          }}
        />
      </div>
    </div>
  );
}
