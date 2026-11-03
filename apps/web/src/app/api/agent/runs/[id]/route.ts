import { NextResponse } from "next/server";
import { sameOrigin } from "@/features/agent/server/settings";
import { deleteRun, getRunRow, getSnapshot } from "@/features/agent/server/store";

export const dynamic = "force-dynamic";

/** The run and every event so far (RunSnapshot). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const snap = getSnapshot((await params).id);
  if (!snap) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  return NextResponse.json(snap);
}

/** Deletes a finished run and its events. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const id = (await params).id;
  const row = getRunRow(id);
  if (!row) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  if (row.status === "running") return NextResponse.json({ error: "Stop the run before deleting it." }, { status: 409 });
  deleteRun(id);
  return NextResponse.json({ ok: true });
}
