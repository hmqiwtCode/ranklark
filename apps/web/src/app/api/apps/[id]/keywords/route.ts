import { isCountry } from "@ranklark/core/apple";
import { normalize } from "@ranklark/core/metadata";
import { NextResponse } from "next/server";
import { appleAdsPopularity, estimatePopularity } from "@/features/keywords/server/popularity";
import { fetchSerp } from "@/features/keywords/server/serp";
import { fetchMode } from "@/server/config";
import { db } from "@/server/db";
import { runJob } from "@/server/jobs";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const appId = Number((await params).id);
  const body = (await req.json().catch(() => ({}))) as { terms?: string[] | string; country?: string; source?: string };
  const country = isCountry(body.country) ? body.country : "us";
  const raw = Array.isArray(body.terms) ? body.terms : String(body.terms ?? "").split(/[,\n]/);
  const terms = [...new Set(raw.map((t) => normalize(t)).filter((t) => t.length > 1 && t.length <= 60))].slice(0, 100);
  if (!terms.length) return NextResponse.json({ error: "No valid keywords." }, { status: 400 });
  const ins = db.prepare("INSERT OR IGNORE INTO keywords (app_id, country, term, source) VALUES (?, ?, ?, ?)");
  let added = 0;
  for (const t of terms) added += ins.run(appId, country, t, body.source ?? "manual").changes;
  if (fetchMode() === "extension") return NextResponse.json({ added, mode: "extension" }); // the extension checks them
  const job = runJob(`Checking ${terms.length} keyword${terms.length > 1 ? "s" : ""}`, [
    ...terms.map((t) => () => fetchSerp(t, country, "iphone", true)),
    () => appleAdsPopularity(terms, country),
    ...terms.map((t) => () => estimatePopularity(t, country)),
  ]);
  return NextResponse.json({ added, jobId: job.id });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const appId = Number((await params).id);
  const body = (await req.json().catch(() => ({}))) as { term?: string; country?: string };
  if (!body.term || !body.country) return NextResponse.json({ error: "term and country required" }, { status: 400 });
  db.prepare("DELETE FROM keywords WHERE app_id = ? AND country = ? AND term = ?").run(appId, body.country, body.term);
  db.prepare("DELETE FROM ranks WHERE app_id = ? AND country = ? AND term = ?").run(appId, body.country, body.term);
  return NextResponse.json({ ok: true });
}
