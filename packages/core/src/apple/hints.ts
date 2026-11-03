/** App Store autocomplete (MZSearchHints). Undocumented. Used for the popularity estimate. */
import { STOREFRONTS } from "./storefronts";

export type Hint = { term: string; priority?: number };

export const hintsUrl = (prefix: string) =>
  "https://search.itunes.apple.com/WebObjects/MZSearchHints.woa/wa/hints?" +
  new URLSearchParams({ clientApplication: "Software", term: prefix }).toString();

/** Without this header Apple answers 200 with an EMPTY list (verified 2026-11-02). */
export const hintsHeaders = (country: string) => ({ "X-Apple-Store-Front": `${STOREFRONTS[country]?.id ?? 143441}-1,29` });

/** Handles both the plist (XML) and JSON shapes the endpoint has served over time. */
export function parseHints(body: string): Hint[] {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try {
      const j = JSON.parse(trimmed);
      const list = j.hints ?? j.results?.suggestions ?? [];
      return list
        .map((h: { term?: string; displayTerm?: string; searchTerm?: string; priority?: number }) => ({
          term: (h.term ?? h.searchTerm ?? h.displayTerm ?? "").toLowerCase(),
          priority: typeof h.priority === "number" ? h.priority : undefined,
        }))
        .filter((h: Hint) => h.term);
    } catch {
      return [];
    }
  }
  const out: Hint[] = [];
  for (const [, d] of trimmed.matchAll(/<dict>([\s\S]*?)<\/dict>/g)) {
    const term = d.match(/<key>term<\/key>\s*<string>([^<]*)<\/string>/)?.[1];
    if (!term) continue;
    const pr = d.match(/<key>priority<\/key>\s*<(?:integer|real)>([^<]*)<\/(?:integer|real)>/)?.[1];
    out.push({ term: decodeXml(term).toLowerCase(), priority: pr ? Number(pr) : undefined });
  }
  return out;
}

const decodeXml = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

/** Prefix lengths probed for the popularity estimate (stop at the first one that suggests the term). */
export function probeLengths(len: number): number[] {
  const set = new Set<number>();
  for (const n of [1, 2, 3, 4, 6, 9, 13]) if (n < len) set.add(n);
  set.add(len);
  return [...set].sort((a, b) => a - b);
}
