import { NextResponse } from "next/server";
import { cancelRun } from "@/features/agent/server/orchestrator";
import { sameOrigin } from "@/features/agent/server/settings";
import { getRunRow } from "@/features/agent/server/store";

export const dynamic = "force-dynamic";

/** Stops a running run (its model call and queued Apple requests are aborted). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const id = (await params).id;
  if (!getRunRow(id)) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  return NextResponse.json({ ok: cancelRun(id) });
}
