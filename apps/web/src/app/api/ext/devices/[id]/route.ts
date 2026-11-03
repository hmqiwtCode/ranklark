import { NextResponse } from "next/server";
import { revokeDevice } from "@/features/extension/server/devices";

export const dynamic = "force-dynamic";

/** Remove a connected browser: its token stops working immediately. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return NextResponse.json({ ok: revokeDevice((await params).id) });
}
