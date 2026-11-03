import { getPopularity } from "@/features/keywords/server/popularity";
import { type ItunesApp, icon, lookupApps } from "@/server/apple/itunes";
import { type CatalogApp, catalogApps, webSearchEnabled } from "@/server/apple/web";
import { db } from "@/server/db";

/** Any App Store app (yours or a competitor), public data only. Cached in memory for 6 hours. */
export type StoreApp = {
  id: number;
  name: string;
  subtitle: string | null;
  seller: string | null;
  icon: string | null;
  genre: string | null;
  rating: number | null;
  ratingCount: number;
  histogram: number[] | null; // 5★ → 1★
  chart: CatalogApp["chart"];
  price: number | null;
  version: string | null;
  updatedAt: string | null;
  releasedAt: string | null;
  description: string | null;
  url: string | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __storeCache: Map<string, { at: number; app: StoreApp }> | undefined;
}
globalThis.__storeCache ??= new Map();
const cache: Map<string, { at: number; app: StoreApp }> = globalThis.__storeCache;
const TTL = 6 * 3600_000;

export async function getStoreApp(id: number, country: string): Promise<StoreApp | null> {
  const key = `${id}:${country}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.app;
  const [a]: ItunesApp[] = await lookupApps([id], country);
  if (!a) return null;
  const c = webSearchEnabled() ? (await catalogApps([id], country).catch(() => []))[0] : undefined;
  const app: StoreApp = {
    id,
    name: a.trackName,
    subtitle: c?.subtitle ?? null,
    seller: a.sellerName ?? a.artistName ?? null,
    icon: a.artworkUrl512 ?? icon(a),
    genre: a.primaryGenreName ?? null,
    rating: a.averageUserRating ?? null,
    ratingCount: c?.ratingCount ?? a.userRatingCount ?? 0,
    histogram: c?.ratingHistogram ? [...c.ratingHistogram].reverse() : null,
    chart: c?.chart ?? null,
    price: a.price ?? null,
    version: a.version ?? null,
    updatedAt: a.currentVersionReleaseDate ?? null,
    releasedAt: a.releaseDate ?? null,
    description: a.description ?? null,
    url: a.trackViewUrl ?? null,
  };
  cache.set(key, { at: Date.now(), app });
  return app;
}

/** Every keyword we have searched (in this country) where this app appears, at its latest check. */
export function whereItRanks(id: number, country: string) {
  const rows = db
    .prepare(
      "SELECT term, day, ids_json, web_json, difficulty FROM serp WHERE country = ? AND (ids_json LIKE ? OR web_json LIKE ?) ORDER BY day DESC",
    )
    .all(country, `%${id}%`, `%${id}%`) as {
    term: string;
    day: string;
    ids_json: string;
    web_json: string | null;
    difficulty: number | null;
  }[];
  const seen = new Set<string>();
  const out: {
    term: string;
    day: string;
    rank: number;
    approx: boolean;
    difficulty: number | null;
    popularity: number | null;
    popSource: string | null;
  }[] = [];
  for (const r of rows) {
    if (seen.has(r.term)) continue;
    seen.add(r.term);
    const web = r.web_json ? (JSON.parse(r.web_json) as { id: number }[]).map((w) => w.id) : [];
    const api = JSON.parse(r.ids_json) as number[];
    const w = web.indexOf(id);
    const a = api.indexOf(id);
    if (w < 0 && a < 0) continue;
    const pop = getPopularity(r.term, country);
    out.push({
      term: r.term,
      day: r.day,
      rank: w >= 0 ? w + 1 : Math.max(a + 1, web.length + 1),
      approx: w < 0,
      difficulty: r.difficulty,
      popularity: pop?.value ?? null,
      popSource: pop?.source ?? null,
    });
  }
  return out.sort((x, y) => x.rank - y.rank);
}

export const isMine = (id: number) => !!db.prepare("SELECT 1 FROM apps WHERE id = ? AND is_mine = 1").get(id);
