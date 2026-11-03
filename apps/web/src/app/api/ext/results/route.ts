import { NextResponse } from "next/server";
import { authDevice, CORS } from "@/features/extension/server/devices";
import { ingestResults } from "@/features/extension/server/ingest";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  const device = authDevice(req);
  if (!device) return NextResponse.json({ error: "This browser isn't connected (or was removed)." }, { status: 401, headers: CORS });
  if (Number(req.headers.get("content-length") ?? 0) > 8_000_000)
    return NextResponse.json({ error: "Batch too large" }, { status: 413, headers: CORS });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  return NextResponse.json(ingestResults(body, device), { headers: CORS });
}
