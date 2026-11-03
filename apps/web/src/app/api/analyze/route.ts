import { isCountry } from "@ranklark/core/apple";
import { normalize } from "@ranklark/core/metadata";
import { opportunity, type SerpApp } from "@ranklark/core/scoring";
import { NextResponse } from "next/server";
import { isBrandTerm } from "@/features/keywords/server/brand";
import { appleAdsPopularity, estimatePopularity, getPopularity } from "@/features/keywords/server/popularity";
import { fetchSerp } from "@/features/keywords/server/serp";
import { db, today } from "@/server/db";
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

/** Read whatever is already scored for these terms. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const country = isCountry(url.searchParams.get("country")) ? url.searchParams.get("country")! : "us";
  const terms = parse(url.searchParams.get("terms"));
  const serpQ = db.prepare("SELECT difficulty, result_count, top_json FROM serp WHERE term = ? AND country = ? ORDER BY day DESC LIMIT 1");
  const d = today();
  return NextResponse.json(
    terms.map((term) => {
      const s = serpQ.get(term, country) as { difficulty: number; result_count: number; top_json: string } | undefined;
      const p = getPopularity(term, country);
      const top: SerpApp[] = s ? JSON.parse(s.top_json) : [];
      const brand = isBrandTerm(term, top);
      return {
        term,
        day: d,
        difficulty: s?.difficulty ?? null,
        resultCount: s?.result_count ?? null,
        top: top.slice(0, 5),
        brand,
        popularity: p?.value ?? null,
        popSource: p?.source ?? null,
        popReason: (p?.detail?.reason as string) ?? null,
        opportunity: brand ? null : opportunity(p?.value ?? null, s?.difficulty ?? null, null),
      };
    }),
  );
}
