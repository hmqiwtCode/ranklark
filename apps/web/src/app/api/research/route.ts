import { isCountry } from "@ranklark/core/apple";
import { normalize } from "@ranklark/core/metadata";
import type { SerpApp } from "@ranklark/core/scoring";
import { NextResponse } from "next/server";
import { expandSeed } from "@/features/keywords/server/popularity";
import { fetchSerp } from "@/features/keywords/server/serp";
import { competitorPhrases } from "@/features/research/server/score";

export const dynamic = "force-dynamic";

/**
 * Keyword discovery for a seed term:
 *   - autocomplete expansions (what Apple suggests while typing)
 *   - phrases from the titles of the apps that rank top-10 for the seed
 * Description/URL n-grams are deliberately NOT used (that is where junk like "terms term" comes from).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("seed") ?? "";
  if (/https?:\/\/|apps\.apple\.com/i.test(raw))
    return NextResponse.json({ error: "That's an app link, not a keyword. Paste it on the home page to track the app." }, { status: 400 });
  const seed = normalize(raw);
  const country = isCountry(url.searchParams.get("country")) ? url.searchParams.get("country")! : "us";
  const deep = url.searchParams.get("deep") === "1";
  if (seed.length < 2) return NextResponse.json({ error: "Seed must be at least 2 characters." }, { status: 400 });

  const [hints, serp] = await Promise.all([expandSeed(seed, country, deep).catch(() => []), fetchSerp(seed, country).catch(() => null)]);

  const top: SerpApp[] = serp ? JSON.parse(serp.top_json) : [];
  const competitor = competitorPhrases(top);

  return NextResponse.json({ seed, country, hints, competitor, top, difficulty: serp?.difficulty ?? null });
}
