/** Start tracking keywords for an app (shared by the dashboard route and the extension's "Track this app"). */
import { normalize } from "@ranklark/core/metadata";
import { fetchMode } from "@/server/config";
import { db } from "@/server/db";
import { runJob } from "@/server/jobs";
import { appleAdsPopularity, estimatePopularity } from "./popularity";
import { fetchSerp } from "./serp";

/** Normalizes, de-duplicates and length-checks raw keyword input ("a, b" or ["a", "b"]). */
export function cleanTerms(raw: string[] | string | undefined, max = 100): string[] {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(/[,\n]/);
  return [...new Set(list.map((t) => normalize(t)).filter((t) => t.length > 1 && t.length <= 60))].slice(0, max);
}

/**
 * Inserts the keywords and, in server mode, starts checking them right away.
 * In extension mode the browser extension picks them up on its next run.
 */
export function trackKeywords(appId: number, country: string, terms: string[], source = "manual", opts: { fetchNow?: boolean } = {}) {
  const ins = db.prepare("INSERT OR IGNORE INTO keywords (app_id, country, term, source) VALUES (?, ?, ?, ?)");
  let added = 0;
  for (const t of terms) added += ins.run(appId, country, t, source).changes;
  if (!terms.length || fetchMode() === "extension" || opts.fetchNow === false) return { added, jobId: null as string | null };
  const job = runJob(`Checking ${terms.length} keyword${terms.length > 1 ? "s" : ""}`, [
    ...terms.map((t) => () => fetchSerp(t, country, "iphone", true)),
    () => appleAdsPopularity(terms, country),
    ...terms.map((t) => () => estimatePopularity(t, country)),
  ]);
  return { added, jobId: job.id as string | null };
}

export const keywordsFor = (appId: number, country: string) =>
  (db.prepare("SELECT term FROM keywords WHERE app_id = ? AND country = ? ORDER BY term").all(appId, country) as { term: string }[]).map(
    (r) => r.term,
  );
