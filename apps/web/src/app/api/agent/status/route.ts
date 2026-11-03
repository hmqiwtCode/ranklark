import { NextResponse } from "next/server";
import { agentStatus } from "@/features/agent/server/settings";

export const dynamic = "force-dynamic";

/** Whether the server may use its own Claude credentials, the fetch mode, MCP settings. */
export function GET(req: Request) {
  return NextResponse.json(agentStatus(req));
}
