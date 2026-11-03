import { type Hint, hintsHeaders, hintsUrl, PACING, parseHints } from "@ranklark/core/apple";
import { fetchWithRetry, schedule } from "@/server/apple/queue";
import { assertServerFetch } from "@/server/config";
import { db } from "@/server/db";

/**
 * App Store search-box autocomplete ("search hints"). UNDOCUMENTED endpoint.
 * Every answer is cached per prefix for 7 days — whether it came from the server or the extension.
 */
export type { Hint };

const GAP = Number(process.env.HINTS_GAP_MS ?? PACING.hints);
const CACHE_DAYS = 7;

export function cachedHints(prefix: string, country: string): Hint[] | null {
  const since = new Date(Date.now() - CACHE_DAYS * 864e5).toISOString().slice(0, 10);
  const hit = db
    .prepare("SELECT json FROM hints_cache WHERE prefix = ? AND country = ? AND day >= ? ORDER BY day DESC LIMIT 1")
    .get(prefix, country, since) as { json: string } | undefined;
  return hit ? JSON.parse(hit.json) : null;
}

export function storeHints(prefix: string, country: string, hints: Hint[]) {
  db.prepare("INSERT OR REPLACE INTO hints_cache (prefix, country, day, json) VALUES (?, ?, ?, ?)").run(
    prefix,
    country,
    new Date().toISOString().slice(0, 10),
    JSON.stringify(hints),
  );
}

export async function searchHints(prefix: string, country: string): Promise<Hint[]> {
  const hit = cachedHints(prefix, country);
  if (hit) return hit;
  assertServerFetch("autocomplete request");
  const hints = await schedule("hints", GAP, async () => {
    const res = await fetchWithRetry(hintsUrl(prefix), { headers: { ...hintsHeaders(country), Accept: "*/*" } });
    if (!res.ok) throw new Error(`hints ${res.status}`);
    return parseHints(await res.text());
  });
  storeHints(prefix, country, hints);
  return hints;
}
