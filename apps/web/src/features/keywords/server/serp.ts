/** One search-results snapshot per (term, country, day) → ranks for ALL your apps from a single fetch. */
import { difficulty, type SerpApp, titleMatch } from "@ranklark/core/scoring";
import { type Device, type ItunesApp, icon, lookupApps, searchApps } from "@/server/apple/itunes";
import { type WebResult, webSearch, webSearchEnabled } from "@/server/apple/web";
import { db, today } from "@/server/db";

// ---------------------------------------------------------------- SERP + ranks

export type SerpRow = {
  term: string;
  country: string;
  day: string;
  result_count: number;
  top_json: string;
  ids_json: string;
  web_json: string | null;
  difficulty: number | null;
};

/**
 * One keyword check = iTunes Search API (official, ≤200 deep) + web App Store search (true order, top ~12).
 * Displayed rank: web position when the app is in the web window; otherwise the API position, clamped
 * to ≥ window+1 and flagged approximate (the web page already tells us it is NOT in the top window).
 */
export async function fetchSerp(term: string, country: string, device: Device = "iphone", force = false): Promise<SerpRow> {
  const day = today();
  if (!force) {
    const cached = db.prepare("SELECT * FROM serp WHERE term = ? AND country = ? AND day = ?").get(term, country, day) as
      | SerpRow
      | undefined;
    if (cached) {
      const web = cached.web_json ? (JSON.parse(cached.web_json) as { id: number }[]).map((w) => w.id) : null;
      recordRanks(term, country, day, JSON.parse(cached.ids_json), web);
      return cached;
    }
  }
  const [results, web] = await Promise.all([
    searchApps(term, country, device, 200),
    webSearchEnabled() ? webSearch(term, country).catch(() => null as WebResult[] | null) : Promise.resolve(null),
  ]);
  // icons/ratings for web-only results in the top 10
  const known = new Set(results.map((r) => r.trackId));
  const missing = [...(web ?? []).map((w) => w.id), ...results.map((r) => r.trackId)].slice(0, 10).filter((id) => !known.has(id));
  const extra = missing.length ? await lookupApps(missing, country).catch(() => [] as ItunesApp[]) : [];
  return ingestSerp(term, country, results, web, extra);
}

/**
 * Store one SERP observation (from the server OR the extension) and derive everything from it:
 * top-10 list (web order first, API fill), difficulty, and ranks for every app of mine tracking the term.
 */
export function ingestSerp(
  term: string,
  country: string,
  results: ItunesApp[],
  web: WebResult[] | null,
  extra: ItunesApp[] = [],
  day = today(),
): SerpRow {
  const apiById = new Map([...results, ...extra].map((r) => [r.trackId, r]));
  const orderedIds: number[] = [];
  for (const w of web ?? []) orderedIds.push(w.id);
  for (const r of results) if (!orderedIds.includes(r.trackId)) orderedIds.push(r.trackId);

  const webById = new Map((web ?? []).map((w) => [w.id, w]));
  const top: SerpApp[] = orderedIds.slice(0, 10).map((id) => {
    const r = apiById.get(id);
    const w = webById.get(id);
    const name = r?.trackName ?? w?.title ?? String(id);
    const subtitle = w?.subtitle ?? null;
    return {
      id,
      name,
      subtitle,
      icon: r ? icon(r) : null,
      seller: r?.sellerName ?? r?.artistName ?? null,
      rating: r?.averageUserRating ?? w?.rating ?? null,
      ratingCount: r?.userRatingCount ?? w?.ratingCount ?? 0,
      titleMatch: titleMatch(term, `${name} ${subtitle ?? ""}`),
    };
  });

  const apiIds = results.map((r) => r.trackId);
  const row: SerpRow = {
    term,
    country,
    day,
    result_count: results.length,
    top_json: JSON.stringify(top),
    ids_json: JSON.stringify(apiIds),
    web_json: web ? JSON.stringify(web.map((w) => ({ id: w.id, title: w.title, subtitle: w.subtitle }))) : null,
    difficulty: difficulty(top, results.length),
  };
  db.prepare(
    `INSERT INTO serp (term, country, day, result_count, top_json, ids_json, web_json, difficulty)
     VALUES (@term, @country, @day, @result_count, @top_json, @ids_json, @web_json, @difficulty)
     ON CONFLICT(term, country, day) DO UPDATE SET result_count=excluded.result_count, top_json=excluded.top_json,
       ids_json=excluded.ids_json, web_json=excluded.web_json, difficulty=excluded.difficulty, fetched_at=datetime('now')`,
  ).run(row);

  recordRanks(term, country, day, apiIds, web ? web.map((w) => w.id) : null);
  return row;
}

/** Rank of every app of mine tracking this term, from one SERP. */
function recordRanks(term: string, country: string, day: string, apiIds: number[], webIds: number[] | null) {
  const mine = db.prepare("SELECT DISTINCT app_id FROM keywords WHERE term = ? AND country = ?").all(term, country) as { app_id: number }[];
  const ins = db.prepare(
    `INSERT INTO ranks (app_id, country, term, day, rank, rank_web, rank_api, approx) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(app_id, country, term, day) DO UPDATE SET rank=excluded.rank, rank_web=excluded.rank_web, rank_api=excluded.rank_api, approx=excluded.approx`,
  );
  for (const { app_id } of mine) {
    const a = apiIds.indexOf(app_id);
    const w = webIds ? webIds.indexOf(app_id) : -1;
    const rankApi = a >= 0 ? a + 1 : null;
    const rankWeb = w >= 0 ? w + 1 : null;
    let rank: number | null = null;
    let approx = 0;
    if (rankWeb != null) rank = rankWeb;
    else if (rankApi != null) {
      // the web page proved we're NOT in its window, so the API position can't be better than window+1
      rank = webIds ? Math.max(rankApi, webIds.length + 1) : rankApi;
      approx = webIds ? 1 : 0;
    }
    ins.run(app_id, country, term, day, rank, rankWeb, rankApi, approx);
  }
}

/** Steps to refresh one app in one storefront (shared by the UI job and the daily CLI). */
