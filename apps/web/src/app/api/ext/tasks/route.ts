import { EXT_PACING } from "@ranklark/core/apple";
import { NextResponse } from "next/server";
import { authDevice, CORS } from "@/features/extension/server/devices";
import { buildTasks } from "@/features/extension/server/tasks";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** The extension's to-do list: only this user's apps and tracked keywords. */
export async function GET(req: Request) {
  const device = authDevice(req);
  if (!device)
    return NextResponse.json(
      { error: "This browser isn't connected (or was removed). Reconnect it from the extension popup." },
      { status: 401, headers: CORS },
    );
  return NextResponse.json({ day: new Date().toISOString().slice(0, 10), pacing: EXT_PACING, tasks: buildTasks() }, { headers: CORS });
}
