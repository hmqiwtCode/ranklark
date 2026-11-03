import { isCountry } from "@ranklark/core/apple";
import { normalize } from "@ranklark/core/metadata";
import { NextResponse } from "next/server";
import { appleAdsPopularity, estimatePopularity } from "@/features/keywords/server/popularity";
import { fetchSerp } from "@/features/keywords/server/serp";
import { readScores } from "@/features/research/server/score";
import { runJob } from "@/server/jobs";

export const dynamic = "force-dynamic";

function parse(terms: unknown): string[] {
  const raw = Array.isArray(terms) ? terms : String(terms ?? "").split(",");
  return [...new Set(raw.map((t) => normalize(String(t))).filter((t) => t.length > 1))].slice(0, 60);
}

/** Start scoring a batch of terms (SERP difficulty + popularity estimate). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { terms?: string[]; country?: string };
  const country = isCountry(body.country) ? body.country : "us";
  const terms = parse(body.terms);
  const job = runJob(`Scoring ${terms.length} keywords`, [
    () => appleAdsPopularity(terms, country),
    ...terms.flatMap((t) => [() => fetchSerp(t, country), () => estimatePopularity(t, country)]),
  ]);
  return NextResponse.json({ jobId: job.id });
}

/** Read whatever is already scored for these terms (and, with ?appId=, where that app ranks). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const country = isCountry(url.searchParams.get("country")) ? url.searchParams.get("country")! : "us";
  const terms = parse(url.searchParams.get("terms"));
  const appId = Number(url.searchParams.get("appId")) || null; // optional: also report where THIS app ranks
  return NextResponse.json(readScores(terms, country, appId).map((s) => ({ ...s, top: s.top.slice(0, 5) })));
}
