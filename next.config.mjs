/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel 部署：關閉靜態匯出，啟用 App Router API routes（/api/sync 等）
  turbopack: {
    root: process.cwd()
  }
};

export default nextConfig;
