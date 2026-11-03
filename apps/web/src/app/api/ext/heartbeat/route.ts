import { NextResponse } from "next/server";
import { authDevice, CORS, saveDeviceStatus } from "@/features/extension/server/devices";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Live progress from the extension, so the dashboard can show it from any device. */
export async function POST(req: Request) {
  const device = authDevice(req);
  if (!device) return NextResponse.json({ error: "not connected" }, { status: 401, headers: CORS });
  const body = (await req.json().catch(() => null)) as { status?: unknown } | null;
  saveDeviceStatus(device.id, body?.status);
  return NextResponse.json({ ok: true }, { headers: CORS });
}
