import { NextResponse } from "next/server";
import { disableMcp, mcpSettings, rotateMcpToken, sameOrigin } from "@/features/agent/server/settings";

export const dynamic = "force-dynamic";

/** MCP endpoint status (never the token). */
export function GET(req: Request) {
  return NextResponse.json(mcpSettings(req));
}

/** Enables MCP and rotates the token. The new token is in this response only; the server keeps its hash. */
export function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  return NextResponse.json(rotateMcpToken(req), { headers: { "Cache-Control": "no-store" } });
}

/** Disables MCP and forgets the token. */
export function DELETE(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  return NextResponse.json(disableMcp(req));
}
