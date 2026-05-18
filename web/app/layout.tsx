import type { Metadata } from "next";
import "./globals.css";
import TitleBar from "./components/TitleBar";
import AppShell from "./components/layout/AppShell";

export const metadata: Metadata = {
  title: "Toonflow - AI 短剧生产工作台",
  description: "面向网文短剧改编、资产塑造、视频制作与粗剪交付的本地优先工作台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <TitleBar />
        <div className="app-content">
          <AppShell>{children}</AppShell>
        </div>
      </body>
    </html>
  );
}
