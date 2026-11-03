import { isCountry } from "@ranklark/core/apple";
import { NextResponse } from "next/server";
import { addApp } from "@/features/apps/server/apps";
import { listApps } from "@/features/keywords/server/queries";
import { parseAppId } from "@/server/apple/itunes";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listApps());
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { input?: string; country?: string };
  const parsed = parseAppId(body.input ?? "");
  if (!parsed) return NextResponse.json({ error: "Paste an App Store URL or a numeric app ID (e.g. 6777419376)." }, { status: 400 });
  const country = isCountry(body.country) ? body.country : parsed.country && isCountry(parsed.country) ? parsed.country : "us";
  try {
    const a = await addApp(parsed.id, country);
    return NextResponse.json({ id: a.trackId, name: a.trackName, country });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 404 });
  }
}
