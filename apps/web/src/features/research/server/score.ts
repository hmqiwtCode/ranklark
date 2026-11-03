/**
 * The keyword read shared by GET /api/analyze, GET /api/research and the AI research agent, so every surface
 * shows the same numbers for the same term. Reads only what is already stored (no Apple requests).
 */
import { phrasesFrom } from "@ranklark/core/metadata";
import { opportunity, type SerpApp, serpRank } from "@ranklark/core/scoring";
import { isBrandTerm } from "@/features/keywords/server/brand";
import { getPopularity } from "@/features/keywords/server/popularity";
import { db, today } from "@/server/db";

export type TermScore = {
  term: string;
  day: string;
  difficulty: number | null;
  resultCount: number | null;
  /** The stored top 10 (GET /api/analyze returns the first 5). */
  top: SerpApp[];
  brand: boolean;
  popularity: number | null;
  popSource: "apple_ads" | "hints_estimate" | null;
  popReason: string | null;
  opportunity: number | null;
  yourRank: { rank: number | null; approx: boolean } | null;
};

const webIdsRank = (appId: number, idsJson: string, webJson: string | null) => {
  const web = webJson ? (JSON.parse(webJson) as { id: number }[]).map((w) => w.id) : null;
  const r = serpRank(appId, JSON.parse(idsJson) as number[], web);
  return { rank: r.rank, approx: r.approx };
};

/** Whatever is already scored for these (normalized) terms, and with appId, where that app ranks. */
export function readScores(terms: string[], country: string, appId: number | null = null): TermScore[] {
  const serpQ = db.prepare(
    "SELECT difficulty, result_count, top_json, ids_json, web_json FROM serp WHERE term = ? AND country = ? ORDER BY day DESC LIMIT 1",
  );
  const d = today();
  return terms.map((term) => {
    const s = serpQ.get(term, country) as
      | { difficulty: number; result_count: number; top_json: string; ids_json: string; web_json: string | null }
      | undefined;
    const p = getPopularity(term, country);
    const top: SerpApp[] = s ? JSON.parse(s.top_json) : [];
    const brand = isBrandTerm(term, top);
    return {
      term,
      day: d,
      difficulty: s?.difficulty ?? null,
      resultCount: s?.result_count ?? null,
      top,
      brand,
      popularity: p?.value ?? null,
      popSource: p?.source ?? null,
      popReason: (p?.detail?.reason as string) ?? null,
      opportunity: brand ? null : opportunity(p?.value ?? null, s?.difficulty ?? null, null),
      yourRank: appId && s ? webIdsRank(appId, s.ids_json, s.web_json) : null,
    };
  });
}

/** True when the latest stored SERP for the term has a web App Store order (vs. iTunes Search API only). */
export function hasWebOrder(term: string, country: string): boolean {
  const r = db.prepare("SELECT web_json FROM serp WHERE term = ? AND country = ? ORDER BY day DESC LIMIT 1").get(term, country) as
    | { web_json: string | null }
    | undefined;
  return !!r?.web_json;
}

/**
 * Phrases that recur in the names of the top apps for a term (a phrase used by 2+ apps, or any multi-word one),
 * most shared first, at most 40. Description/URL n-grams are deliberately not used.
 */
export function competitorPhrases(top: SerpApp[]): { term: string; apps: number }[] {
  const fromTitles = new Map<string, number>();
  for (const a of top) for (const p of phrasesFrom(a.name)) fromTitles.set(p, (fromTitles.get(p) ?? 0) + 1);
  return [...fromTitles]
    .filter(([p, n]) => n >= 2 || p.split(" ").length >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([term, apps]) => ({ term, apps }));
}
