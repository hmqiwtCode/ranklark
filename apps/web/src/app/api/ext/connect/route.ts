import { NextResponse } from "next/server";
import { createDevice, deviceName } from "@/features/extension/server/devices";

export const dynamic = "force-dynamic";

/**
 * No-login pairing: the extension POSTs here and gets its own device token.
 *
 * Only browser extensions may call it. Browsers set the Origin header themselves and web pages cannot fake
 * `chrome-extension://…`, so a random website you visit can't mint a token for your local dashboard.
 * Optionally pin the allowed extension IDs with EXT_ALLOWED_IDS="id1,id2".
 */
function allowedOrigin(req: Request): string | null {
  const origin = req.headers.get("origin") ?? "";
  const m = origin.match(/^chrome-extension:\/\/([a-p]{32})$/);
  if (!m) return null;
  const pinned = (process.env.EXT_ALLOWED_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return pinned.length && !pinned.includes(m[1]) ? null : origin;
}

const cors = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
});

export function OPTIONS(req: Request) {
  const origin = allowedOrigin(req);
  return new Response(null, { status: origin ? 204 : 403, headers: origin ? cors(origin) : {} });
}

export async function POST(req: Request) {
  const origin = allowedOrigin(req);
  if (!origin) return NextResponse.json({ error: "Only the browser extension can connect here." }, { status: 403 });
  return NextResponse.json(createDevice(deviceName(req.headers.get("user-agent"))), { headers: cors(origin) });
}
