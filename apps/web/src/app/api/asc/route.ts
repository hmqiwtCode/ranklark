import { NextResponse } from "next/server";
import { importAllFromAsc, syncAppFromAsc } from "@/features/apps/server/sync";
import { adsConfigured } from "@/server/apple/ads";
import { ascConfigured } from "@/server/apple/asc";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ asc: ascConfigured(), ads: adsConfigured() });
}

/** { appId } → sync one app; {} → import every app in the account. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { appId?: number; country?: string };
  try {
    if (body.appId) return NextResponse.json({ locales: await syncAppFromAsc(body.appId) });
    return NextResponse.json(await importAllFromAsc(body.country ?? "us"));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
