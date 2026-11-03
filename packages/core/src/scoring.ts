import { normalize, tokens } from "./metadata";

/**
 * All scores here are OUR estimates and are labelled "Estimate" in the UI.
 * Formulas are intentionally simple and fully disclosed (see /methodology).
 */

export type SerpApp = {
  id: number;
  name: string;
  subtitle?: string | null;
  icon: string | null;
  seller: string | null;
  rating: number | null;
  ratingCount: number;
  titleMatch: 0 | 0.5 | 1; // none / partial / all words of the term in title (+ subtitle when known)
};

export function titleMatch(term: string, title: string): 0 | 0.5 | 1 {
  const words = tokens(term);
  const t = new Set(tokens(title));
  if (!words.length) return 0;
  if (normalize(title).includes(normalize(term))) return 1;
  const hit = words.filter((w) => t.has(w)).length;
  if (hit === words.length) return 1;
  return hit > 0 ? 0.5 : 0;
}

/**
 * Difficulty 0–100 from the top-10 search results.
 *   strength  = log10(ratings+1)/5   (100k ratings → 1.0)
 *   relevance = title contains the term (1) / some words (0.5) / none (0)
 *   quality   = average rating / 5
 *   per-app   = 0.6·strength + 0.25·relevance + 0.15·quality
 *   weighted by 1/√position, then scaled down when fewer than 10 apps compete.
 */
export function difficulty(top: SerpApp[], resultCount: number): number {
  const ten = top.slice(0, 10);
  if (!ten.length) return 0;
  let num = 0;
  let den = 0;
  ten.forEach((a, i) => {
    const w = 1 / Math.sqrt(i + 1);
    const strength = Math.min(1, Math.log10((a.ratingCount ?? 0) + 1) / 5);
    const quality = (a.rating ?? 0) / 5;
    num += w * (0.6 * strength + 0.25 * a.titleMatch + 0.15 * quality);
    den += w;
  });
  const crowd = Math.min(1, resultCount / 10);
  return Math.round((num / den) * 100 * crowd);
}

/**
 * Tap-through share by search position, normalised so #1 = 1.0.
 * Anchors: SplitMetrics 2018 study — #1 28.4%, #2 6.2%, #3 2.7%, then ≈1%. Positions past 10 are our
 * own tapering assumption. Apple publishes no CTR data; treat visibility as directional.
 */
const TTR: [number, number][] = [
  [1, 0.284],
  [2, 0.062],
  [3, 0.027],
  [10, 0.01],
  [25, 0.004],
  [50, 0.002],
  [200, 0.0005],
];
export function ctrWeight(rank: number | null): number {
  if (!rank || rank < 1) return 0;
  for (const [maxRank, ttr] of TTR) if (rank <= maxRank) return ttr / TTR[0][1];
  return 0;
}

/** Visibility 0–100: how much of the attainable (rank-1) traffic you capture across tracked keywords. */
export function visibility(rows: { rank: number | null; popularity: number | null }[]): number {
  if (!rows.length) return 0;
  let got = 0;
  let max = 0;
  for (const r of rows) {
    const p = r.popularity ?? 20; // unknown demand → small neutral weight, never shown as data
    got += p * ctrWeight(r.rank);
    max += p;
  }
  return max ? Math.round((got / max) * 1000) / 10 : 0;
}

/**
 * Opportunity 0–100. Only computed when popularity has a real signal.
 * Rewards demand, penalises difficulty, and discounts terms you already own (top 3).
 */
export function opportunity(pop: number | null, diff: number | null, rank: number | null): number | null {
  if (pop == null || diff == null) return null;
  const owned = rank != null && rank <= 3 ? 0.4 : 1;
  return Math.round(Math.sqrt(pop * (100 - diff)) * owned);
}

/**
 * Autocomplete popularity estimate (0–100) from how many letters Apple needed before suggesting the
 * term and where it sat in the list. Uses ABSOLUTE letters typed (as the open-source aso package does
 * for Google Play) so long phrases aren't favoured over short words. Never suggested → 5.
 */
export function hintsScore(foundAt: number | null, position: number | null, listSize: number): number {
  if (foundAt == null || position == null) return 5;
  const prefix = Math.min(1, Math.max(0.1, 1 - (foundAt - 2) * 0.09));
  const pos = 1 - (position - 1) / Math.max(listSize, 10);
  return Math.round(10 + 90 * (0.75 * prefix + 0.25 * pos));
}
