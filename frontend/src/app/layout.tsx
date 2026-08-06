import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "研读适配器",
  description: "把技术材料改写成适合你的学习版本",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
