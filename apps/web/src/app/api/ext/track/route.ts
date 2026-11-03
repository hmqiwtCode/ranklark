import { isCountry } from "@ranklark/core/apple";
import { NextResponse } from "next/server";
import { addApp } from "@/features/apps/server/apps";
import { authDevice, CORS } from "@/features/extension/server/devices";
import { cleanTerms, keywordsFor, trackKeywords } from "@/features/keywords/server/track";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * "Track this app" from the extension popup while you're on an App Store page.
 * Device-key auth like the other /api/ext routes; the popup only sends the app ID and storefront from the tab URL.
 */
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

const unauthorized = () => NextResponse.json({ error: "This browser isn't connected." }, { status: 401, headers: CORS });

function parse(appId: unknown, country: unknown) {
  const id = Number(appId);
  if (!Number.isInteger(id) || id <= 0 || id > 1e12) return null;
  return { id, country: typeof country === "string" && isCountry(country) ? country : "us" };
}

function state(id: number, country: string) {
  const row = db.prepare("SELECT name, is_mine FROM apps WHERE id = ?").get(id) as { name: string; is_mine: number } | undefined;
  return { appId: id, country, tracked: !!row?.is_mine, name: row?.name ?? null, keywords: keywordsFor(id, country) };
}

/** Is the app on this page already tracked, and with which keywords? */
export async function GET(req: Request) {
  if (!authDevice(req)) return unauthorized();
  const u = new URL(req.url);
  const p = parse(u.searchParams.get("appId"), u.searchParams.get("country"));
  if (!p) return NextResponse.json({ error: "Bad app id" }, { status: 400, headers: CORS });
  return NextResponse.json(state(p.id, p.country), { headers: CORS });
}

/** Track the app (if needed) and any keywords typed in the popup. */
export async function POST(req: Request) {
  if (!authDevice(req)) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { appId?: unknown; country?: unknown; terms?: string[] | string };
  const p = parse(body.appId, body.country);
  if (!p) return NextResponse.json({ error: "Bad app id" }, { status: 400, headers: CORS });
  try {
    // Already yours → nothing to fetch. Otherwise look it up (server mode) or create a placeholder (extension mode).
    const known = db.prepare("SELECT is_mine FROM apps WHERE id = ?").get(p.id) as { is_mine: number } | undefined;
    if (!known?.is_mine) await addApp(p.id, p.country);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 404, headers: CORS });
  }
  // The extension that sent this checks the new keywords itself right away, so don't fetch them twice.
  const { added } = trackKeywords(p.id, p.country, cleanTerms(body.terms, 30), "extension", { fetchNow: false });
  return NextResponse.json({ ...state(p.id, p.country), added }, { headers: CORS });
}
