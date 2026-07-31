import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "圖靈測試",
  description: "真人 / AI 雙向盲測"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
