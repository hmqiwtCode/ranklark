import { NextResponse } from "next/server";
import { extOverview } from "@/features/extension/server/overview";
import { fetchMode } from "@/server/config";

export const dynamic = "force-dynamic";

/** Compact status (used by the end-to-end test). */
export async function GET() {
  const o = extOverview();
  const last = o.events[0];
  return NextResponse.json({
    mode: fetchMode(),
    pending: o.pending,
    checkedToday: o.checkedToday,
    devices: o.devices.length,
    status: last ? { lastSeen: last.at, lastEvent: { kind: last.kind, term: last.term } } : null,
  });
}
