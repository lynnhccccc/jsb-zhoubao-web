import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "嘉士伯即时零售经营周报",
  description: "嘉士伯淘宝闪购与京东秒送周报数据看板",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
