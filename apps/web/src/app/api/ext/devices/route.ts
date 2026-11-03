import { NextResponse } from "next/server";
import { createDevice, listDevices } from "@/features/extension/server/devices";

export const dynamic = "force-dynamic";

// Dashboard-only (same origin). No CORS headers are sent, and JSON is required so cross-site
// pages can't create devices with a "simple" form POST. Add login checks here before hosting.
export async function GET() {
  return NextResponse.json(
    listDevices().map(({ id, name, version, created_at, last_seen }) => ({ id, name, version, created_at, last_seen })),
  );
}

/** New device token — returned once, only its hash is stored. */
export async function POST(req: Request) {
  if (!(req.headers.get("content-type") ?? "").includes("application/json"))
    return NextResponse.json({ error: "JSON only" }, { status: 415 });
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  return NextResponse.json(createDevice(body.name?.slice(0, 60) ?? null));
}
