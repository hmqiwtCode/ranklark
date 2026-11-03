import { placement } from "@ranklark/core/metadata";
import { opportunity, type SerpApp, visibility } from "@ranklark/core/scoring";
import { isBrandTerm } from "@/features/keywords/server/brand";
import { getPopularity } from "@/features/keywords/server/popularity";
import { db, today } from "@/server/db";
import type { AppRow } from "@/server/db/rows";

export type KeywordRow = {
  term: string;
  source: string;
  rank: number | null;
  prevRank: number | null;
  delta: number | null; // positive = improved
  approx: boolean; // rank from the API beyond the web App Store window
  rankWeb: number | null;
  rankApi: number | null;
  popularity: number | null;
  popSource: "apple_ads" | "hints_estimate" | null;
  popReason: string | null;
  difficulty: number | null;
  opportunity: number | null;
  brand: boolean;
  top: SerpApp[];
  resultCount: number | null;
  placement: ReturnType<typeof placement>;
  history: { day: string; rank: number | null }[];
  checkedAt: string | null;
};

export function getApp(id: number) {
  return db.prepare("SELECT * FROM apps WHERE id = ?").get(id) as AppRow | undefined;
}

export function listApps() {
  return db.prepare("SELECT * FROM apps WHERE is_mine = 1 ORDER BY name COLLATE NOCASE").all() as AppRow[];
}

export function appCountries(appId: number): string[] {
  const rows = db.prepare("SELECT DISTINCT country FROM keywords WHERE app_id = ? ORDER BY country").all(appId) as { country: string }[];
  return rows.map((r) => r.country);
}

function rankHistory(appId: number, country: string, days: number) {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  return db
    .prepare("SELECT term, day, rank, rank_web, rank_api, approx FROM ranks WHERE app_id = ? AND country = ? AND day >= ? ORDER BY day")
    .all(appId, country, since) as {
    term: string;
    day: string;
    rank: number | null;
    rank_web: number | null;
    rank_api: number | null;
    approx: number;
  }[];
}

export function keywordRows(app: AppRow, country: string, days = 30): KeywordRow[] {
  const terms = db.prepare("SELECT term, source FROM keywords WHERE app_id = ? AND country = ? ORDER BY added_at").all(app.id, country) as {
    term: string;
    source: string;
  }[];
  const hist = rankHistory(app.id, country, days);
  const byTerm = new Map<
    string,
    { day: string; rank: number | null; rank_web: number | null; rank_api: number | null; approx: number }[]
  >();
  for (const h of hist) byTerm.set(h.term, [...(byTerm.get(h.term) ?? []), h]);
  const latestSerp = db.prepare("SELECT * FROM serp WHERE term = ? AND country = ? ORDER BY day DESC LIMIT 1");

  const fields = { name: app.name, subtitle: app.subtitle, keywords: app.keywords_field, seller: app.seller };

  return terms.map(({ term, source }) => {
    const h = byTerm.get(term) ?? [];
    const last = h.at(-1);
    // compare against the oldest snapshot within the last 7 days
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const prev = h.find((x) => x.day >= weekAgo && x.day !== last?.day) ?? (h.length > 1 ? h.at(-2) : undefined);
    const rank = last?.rank ?? null;
    const prevRank = prev ? prev.rank : null;
    const delta = prev && last ? (prevRank ?? 201) - (rank ?? 201) : null;
    const serp = latestSerp.get(term, country) as
      | { top_json: string; difficulty: number | null; result_count: number; fetched_at: string }
      | undefined;
    const pop = getPopularity(term, country);
    const top = serp ? (JSON.parse(serp.top_json) as SerpApp[]) : [];
    const brand = isBrandTerm(term, top) && !top.slice(0, 1).some((a) => a.id === app.id);
    return {
      term,
      source,
      rank,
      prevRank,
      delta: delta === 0 ? 0 : delta,
      approx: !!last?.approx,
      rankWeb: last?.rank_web ?? null,
      rankApi: last?.rank_api ?? null,
      popularity: pop?.value ?? null,
      popSource: pop?.source ?? null,
      popReason: (pop?.detail?.reason as string) ?? null,
      difficulty: serp?.difficulty ?? null,
      opportunity: brand ? null : opportunity(pop?.value ?? null, serp?.difficulty ?? null, rank),
      brand,
      top,
      resultCount: serp?.result_count ?? null,
      placement: placement(term, fields),
      history: h.map((x) => ({ day: x.day, rank: x.rank })),
      checkedAt: serp?.fetched_at ?? null,
    };
  });
}

export function kpis(rows: KeywordRow[]) {
  const ranked = rows.filter((r) => r.rank != null);
  const pops = rows.map((r) => r.popularity).filter((p): p is number => p != null);
  return {
    total: rows.length,
    ranked: ranked.length,
    top10: ranked.filter((r) => r.rank! <= 10).length,
    top50: ranked.filter((r) => r.rank! <= 50).length,
    unranked: rows.length - ranked.length,
    avgPop: pops.length ? Math.round(pops.reduce((a, b) => a + b, 0) / pops.length) : null,
    visibility: visibility(rows.map((r) => ({ rank: r.rank, popularity: r.popularity }))),
    improved: rows.filter((r) => (r.delta ?? 0) > 0).length,
    declined: rows.filter((r) => (r.delta ?? 0) < 0).length,
  };
}

/** Daily visibility series (current popularity weights applied to each day's ranks). */
export function visibilitySeries(rows: KeywordRow[], days = 30) {
  const dayMap = new Map<string, { rank: number | null; popularity: number | null }[]>();
  for (const r of rows)
    for (const h of r.history) dayMap.set(h.day, [...(dayMap.get(h.day) ?? []), { rank: h.rank, popularity: r.popularity }]);
  const series: { day: string; value: number | null; top10: number; ranked: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    const v = dayMap.get(d);
    series.push({
      day: d,
      value: v ? visibility(v) : null,
      top10: v ? v.filter((x) => x.rank != null && x.rank <= 10).length : 0,
      ranked: v ? v.filter((x) => x.rank != null).length : 0,
    });
  }
  return series;
}

export function metadataMarkers(appId: number, country: string, days = 30) {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 19).replace("T", " ");
  const rows = db
    .prepare(
      "SELECT id, version, name, subtitle, keywords_field, description_hash, captured_at FROM metadata_snapshots WHERE app_id = ? AND country = ? ORDER BY id",
    )
    .all(appId, country) as {
    id: number;
    version: string | null;
    name: string | null;
    subtitle: string | null;
    keywords_field: string | null;
    description_hash: string | null;
    captured_at: string;
  }[];
  const out: { day: string; label: string; changes: string[] }[] = [];
  // a field going from unknown (NULL) to a value is us *learning* it (first sync), not the app changing
  const changed = (a: string | null, b: string | null) => a != null && a !== b;
  rows.forEach((r, i) => {
    if (i === 0 || r.captured_at < since) return;
    const p = rows[i - 1];
    const changes: string[] = [];
    if (changed(p.version, r.version)) changes.push(`v${p.version} → v${r.version ?? "?"}`);
    if (changed(p.name, r.name)) changes.push(`Title: “${r.name}”`);
    if (changed(p.subtitle, r.subtitle)) changes.push(`Subtitle: “${r.subtitle ?? ""}”`);
    if (changed(p.keywords_field, r.keywords_field)) changes.push("Keyword field edited");
    if (changed(p.description_hash, r.description_hash)) changes.push("Description edited");
    if (changes.length) out.push({ day: r.captured_at.slice(0, 10), label: changes[0], changes });
  });
  return out;
}

/** Chart window: the requested days, but never much wider than the history we actually have. */
export function historyWindow(rows: KeywordRow[], maxDays = 30) {
  const first = rows.flatMap((r) => r.history.map((h) => h.day)).sort()[0];
  if (!first) return Math.min(7, maxDays);
  const have = Math.round((Date.parse(today()) - Date.parse(first)) / 864e5) + 1;
  return Math.max(7, Math.min(maxDays, have));
}

export function overview() {
  const apps = listApps();
  const d = today();
  return apps.map((a) => {
    const country = a.primary_country;
    const rows = keywordRows(a, country, 14);
    const k = kpis(rows);
    const spark = visibilitySeries(rows, 14).map((s) => s.value);
    return { app: a, country, kpis: k, spark, checkedToday: rows.some((r) => r.history.at(-1)?.day === d) };
  });
}
