import { normalize } from "@ranklark/core/metadata";
import { opportunity, type SerpApp } from "@ranklark/core/scoring";
import { getStoreApp } from "@/features/apps/server/store";
import { isBrandTerm } from "@/features/keywords/server/brand";
import { appleAdsPopularity, estimatePopularity, expandSeed, getPopularity } from "@/features/keywords/server/popularity";
import { fetchSerp } from "@/features/keywords/server/serp";
import { fetchMode } from "@/server/config";
import { db } from "@/server/db";
import { getJob, type Job, runDynamicJob } from "@/server/jobs";

/** Landing page: real, live App Store data for a few topics (rebuilt every 3 days). */
export const PRESETS = [
  { seed: "habit tracker", label: "Habit tracker" },
  { seed: "budget planner", label: "Budget planner" },
  { seed: "meditation", label: "Meditation" },
];
const MAX_TERMS = 12;
const STALE_HOURS = 72;

export type ShowPoint = {
  term: string;
  popularity: number | null;
  popSource: string | null;
  popReason: string | null;
  difficulty: number | null;
  opportunity: number | null;
  brand: boolean;
  top: SerpApp[];
  webIds: number[];
  apiIds: number[];
};
export type Showcase = {
  seed: string;
  country: string;
  builtAt: string;
  points: ShowPoint[];
  spotlight: {
    id: number;
    name: string;
    subtitle: string | null;
    icon: string | null;
    seller: string | null;
    genre: string | null;
    rating: number | null;
    ratingCount: number;
    histogram: number[] | null;
    chart: { genre: string; position: number; chart: string } | null;
    ranks: { term: string; rank: number | null; approx: boolean }[];
  } | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __showJobs: Map<string, string> | undefined;
}
globalThis.__showJobs ??= new Map();
const running: Map<string, string> = globalThis.__showJobs;

export function readShowcase(seed: string, country: string) {
  const row = db.prepare("SELECT json, built_at FROM showcase WHERE seed = ? AND country = ?").get(seed, country) as
    | { json: string; built_at: string }
    | undefined;
  if (!row) return { data: null as Showcase | null, stale: true };
  const age = (Date.now() - Date.parse(`${row.built_at.replace(" ", "T")}Z`)) / 3600_000;
  const data = JSON.parse(row.json) as Showcase;
  // re-score at read time so formula fixes apply without new App Store requests
  for (const p of data.points) {
    const pop = getPopularity(p.term, country);
    if (pop) {
      p.popularity = pop.value;
      p.popSource = pop.source;
      p.popReason = (pop.detail?.reason as string) ?? p.popReason;
    }
    p.brand = isBrandTerm(p.term, p.top);
    p.opportunity = p.brand ? null : opportunity(p.popularity, p.difficulty, null);
  }
  return { data, stale: age > STALE_HOURS };
}

/** Start (or join) the build for a seed. */
export function ensureShowcase(seedRaw: string, country: string): Job | null {
  if (fetchMode() === "extension") return null; // the hosted server never calls Apple; show cached data only
  const seed = normalize(seedRaw);
  const key = `${seed}:${country}`;
  const existing = running.get(key);
  if (existing) {
    const j = getJob(existing);
    if (j && !j.finished) return j;
  }
  const job = runDynamicJob(`Reading the App Store for “${seed}”`, async (job) => {
    const hints = await expandSeed(seed, country);
    const terms = [seed, ...hints.map((h) => h.term).filter((t) => t !== seed)].slice(0, MAX_TERMS);
    job.total = terms.length * 2 + 3;
    job.done = 1;
    await appleAdsPopularity(terms, country).catch(() => 0);
    for (const t of terms) {
      await fetchSerp(t, country).catch((e) => job.errors.push(String(e)));
      job.done++;
      await estimatePopularity(t, country).catch((e) => job.errors.push(String(e)));
      job.done++;
    }
    const serpQ = db.prepare(
      "SELECT top_json, ids_json, web_json, difficulty FROM serp WHERE term = ? AND country = ? ORDER BY day DESC LIMIT 1",
    );
    const points: ShowPoint[] = terms.map((term) => {
      const s = serpQ.get(term, country) as
        | { top_json: string; ids_json: string; web_json: string | null; difficulty: number | null }
        | undefined;
      const top: SerpApp[] = s ? JSON.parse(s.top_json) : [];
      const pop = getPopularity(term, country);
      const brand = isBrandTerm(term, top);
      return {
        term,
        popularity: pop?.value ?? null,
        popSource: pop?.source ?? null,
        popReason: (pop?.detail?.reason as string) ?? null,
        difficulty: s?.difficulty ?? null,
        opportunity: brand ? null : opportunity(pop?.value ?? null, s?.difficulty ?? null, null),
        brand,
        top,
        webIds: s?.web_json ? (JSON.parse(s.web_json) as { id: number }[]).map((w) => w.id) : [],
        apiIds: s ? JSON.parse(s.ids_json) : [],
      };
    });

    // spotlight = the app that wins the seed keyword today
    let spotlight: Showcase["spotlight"] = null;
    const winner = points[0]?.top[0];
    if (winner) {
      const a = await getStoreApp(winner.id, country).catch(() => null);
      job.done++;
      if (a) {
        spotlight = {
          id: a.id,
          name: a.name,
          subtitle: a.subtitle,
          icon: a.icon,
          seller: a.seller,
          genre: a.genre,
          rating: a.rating,
          ratingCount: a.ratingCount,
          histogram: a.histogram,
          chart: a.chart,
          ranks: points.map((p) => {
            const w = p.webIds.indexOf(a.id);
            const i = p.apiIds.indexOf(a.id);
            return { term: p.term, rank: w >= 0 ? w + 1 : i >= 0 ? Math.max(i + 1, p.webIds.length + 1) : null, approx: w < 0 && i >= 0 };
          }),
        };
      }
    }
    const data: Showcase = { seed, country, builtAt: new Date().toISOString(), points, spotlight };
    db.prepare(
      "INSERT INTO showcase (seed, country, json, built_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(seed, country) DO UPDATE SET json = excluded.json, built_at = excluded.built_at",
    ).run(seed, country, JSON.stringify(data));
  });
  running.set(key, job.id);
  return job;
}
