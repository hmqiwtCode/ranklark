import { isCountry } from "@ranklark/core/apple";
import { NextResponse } from "next/server";
import { cleanTerms, trackKeywords } from "@/features/keywords/server/track";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const appId = Number((await params).id);
  const body = (await req.json().catch(() => ({}))) as { terms?: string[] | string; country?: string; source?: string };
  const country = isCountry(body.country) ? body.country : "us";
  const terms = cleanTerms(body.terms);
  if (!terms.length) return NextResponse.json({ error: "No valid keywords." }, { status: 400 });
  const { added, jobId } = trackKeywords(appId, country, terms, body.source ?? "manual");
  return NextResponse.json(jobId ? { added, jobId } : { added, mode: "extension" });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const appId = Number((await params).id);
  const body = (await req.json().catch(() => ({}))) as { term?: string; country?: string };
  if (!body.term || !body.country) return NextResponse.json({ error: "term and country required" }, { status: 400 });
  db.prepare("DELETE FROM keywords WHERE app_id = ? AND country = ? AND term = ?").run(appId, body.country, body.term);
  db.prepare("DELETE FROM ranks WHERE app_id = ? AND country = ? AND term = ?").run(appId, body.country, body.term);
  return NextResponse.json({ ok: true });
}
