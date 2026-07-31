import { processPoll } from "../../../../server/engine.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // 忽略錯誤 body
  }
  const result = processPoll(body);
  return Response.json(result, {
    headers: { "Cache-Control": "no-store" }
  });
}

export async function GET() {
  return Response.json(
    { ok: true, serverTime: Date.now() },
    {
      headers: { "Cache-Control": "no-store" }
    }
  );
}
