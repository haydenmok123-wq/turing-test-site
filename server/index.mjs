// 圖靈測試獨立伺服器：提供靜態站（out/）+ WebSocket + HTTP polling。
// 用法：node server/index.mjs（PORT 預設 3000）

import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { attachSocket, processPoll, startSweeper, getStoreSnapshot } from "./engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "out");
const PORT = Number(process.env.PORT || 3000);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".map": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "POST" && url.pathname === "/api/sync") {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      let parsed = {};
      try {
        parsed = JSON.parse(raw || "{}");
      } catch {
        // 忽略
      }
      sendJson(res, 200, processPoll(parsed));
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, store: getStoreSnapshot(), serverTime: Date.now() });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400);
    res.end("Bad Request");
    return;
  }
  if (pathname.endsWith("/")) pathname += "index.html";

  const file = path.join(ROOT, pathname);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  if (!existsSync(file) || statSync(file).isDirectory()) {
    const notFound = path.join(ROOT, "404.html");
    if (existsSync(notFound)) {
      res.writeHead(404, { "Content-Type": MIME[".html"] });
      createReadStream(notFound).pipe(res);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }

  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": "no-cache"
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server, path: "/api/ws" });
wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const deviceId = url.searchParams.get("deviceId") || "";
  const fp = url.searchParams.get("fp") || "";
  if (!deviceId) {
    ws.close(4000, "missing deviceId");
    return;
  }
  attachSocket(ws, deviceId, fp);
});

startSweeper();
server.listen(PORT, () => {
  console.log("turing-test-server listening on :" + PORT + " (static: " + ROOT + ")");
});
