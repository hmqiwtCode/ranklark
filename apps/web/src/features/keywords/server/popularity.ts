import { probeLengths } from "@ranklark/core/apple";
import { normalize } from "@ranklark/core/metadata";
import { hintsScore } from "@ranklark/core/scoring";
import { cachedHints, searchHints } from "@/server/apple/hints";
import { db } from "@/server/db";

/**
 * Popularity sources, best first:
 *   1. apple_ads      — Apple Ads Search Popularity (real Apple demand data; needs your Ads account)
 *   2. hints_estimate — our autocomplete-based estimate (how few letters a user must type before
 *                       Apple suggests the term, and how high it sits in the list)
 * A term that never appears in autocomplete gets a LOW score with reason "not suggested" —
 * that is an observed signal, not a default. If the lookup fails we store NULL ("—" in the UI).
 */

export type Popularity = { value: number | null; source: "apple_ads" | "hints_estimate"; detail: Record<string, unknown> };

export function getPopularity(term: string, country: string): Popularity | null {
  const rows = db.prepare("SELECT source, value, detail FROM popularity WHERE term = ? AND country = ?").all(term, country) as {
    source: Popularity["source"];
    value: number | null;
    detail: string | null;
  }[];
  const pick = rows.find((r) => r.source === "apple_ads" && r.value != null) ?? rows.find((r) => r.source === "hints_estimate");
  if (!pick) return null;
  const detail = pick.detail ? JSON.parse(pick.detail) : {};
  // estimates are re-scored from the stored raw observation, so formula changes need no new requests
  if (pick.source === "hints_estimate" && "foundAt" in detail) {
    return { value: hintsScore(detail.foundAt, detail.position, detail.listSize ?? 10), source: pick.source, detail };
  }
  return { value: pick.value, source: pick.source, detail };
}

export function savePopularity(term: string, country: string, p: Popularity) {
  db.prepare(
    `INSERT INTO popularity (term, country, source, value, detail) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(term, country, source) DO UPDATE SET value=excluded.value, detail=excluded.detail, fetched_at=datetime('now')`,
  ).run(term, country, p.source, p.value, JSON.stringify(p.detail));
}

function isFresh(term: string, country: string, maxAgeDays: number) {
  const existing = db
    .prepare("SELECT value, detail, fetched_at FROM popularity WHERE term = ? AND country = ? AND source = 'hints_estimate'")
    .get(term, country) as { value: number | null; detail: string; fetched_at: string } | undefined;
  if (existing && existing.value != null && Date.now() - Date.parse(`${existing.fetched_at}Z`) < maxAgeDays * 864e5) {
    return { value: existing.value, source: "hints_estimate" as const, detail: JSON.parse(existing.detail) };
  }
  return null;
}

function finish(term: string, country: string, foundAt: number | null, position: number | null, listSize: number): Popularity {
  const value = hintsScore(foundAt, position, listSize);
  const reason =
    foundAt == null
      ? "Apple never suggests it, even fully typed"
      : `Apple suggests it after ${foundAt} letter${foundAt > 1 ? "s" : ""}, at #${position}`;
  const p: Popularity = { value, source: "hints_estimate", detail: { foundAt, position, listSize, length: term.length, reason } };
  savePopularity(term, country, p);
  return p;
}

export async function estimatePopularity(rawTerm: string, country: string, maxAgeDays = 7): Promise<Popularity> {
  const term = normalize(rawTerm);
  const fresh = isFresh(term, country, maxAgeDays);
  if (fresh) return fresh;
  for (const n of probeLengths(term.length)) {
    const hints = await searchHints(term.slice(0, n), country); // cache first; throws NeedsExtension in extension mode
    const idx = hints.findIndex((h) => normalize(h.term) === term);
    if (idx >= 0) return finish(term, country, n, idx + 1, hints.length);
  }
  return finish(term, country, null, null, 0);
}

/**
 * Extension mode: estimate from cached autocomplete answers only. Returns the prefixes the extension
 * still has to fetch (in probe order — it stops as soon as Apple suggests the term), or done.
 */
export function popularityPlan(rawTerm: string, country: string, maxAgeDays = 7): { done: true } | { done: false; prefixes: string[] } {
  const term = normalize(rawTerm);
  if (isFresh(term, country, maxAgeDays)) return { done: true };
  const lengths = probeLengths(term.length);
  for (let k = 0; k < lengths.length; k++) {
    const hints = cachedHints(term.slice(0, lengths[k]), country);
    if (!hints) return { done: false, prefixes: lengths.slice(k).map((n) => term.slice(0, n)) };
    const idx = hints.findIndex((h) => normalize(h.term) === term);
    if (idx >= 0) {
      finish(term, country, lengths[k], idx + 1, hints.length);
      return { done: true };
    }
  }
  finish(term, country, null, null, 0);
  return { done: true };
}

/** Autocomplete expansions of a seed — the raw material for keyword discovery. */
export async function expandSeed(seed: string, country: string, deep = false) {
  const base = normalize(seed);
  const prefixes = [base, `${base} `];
  if (deep) for (const c of "abcdefghijklmnopqrstuvwxyz") prefixes.push(`${base} ${c}`);
  const out = new Map<string, { term: string; from: string; position: number }>();
  for (const p of prefixes) {
    try {
      const hints = await searchHints(p, country);
      hints.forEach((h, i) => {
        const t = normalize(h.term);
        if (t && !out.has(t)) out.set(t, { term: t, from: p, position: i + 1 });
      });
    } catch {
      /* skip a failed prefix, keep the rest */
    }
  }
  return [...out.values()];
}

/** Real Apple Ads popularity (0–100) for a batch of terms. No-op when Ads credentials are absent. */
export async function appleAdsPopularity(terms: string[], country: string) {
  const { adsConfigured, phrasePopularity } = await import("@/server/apple/ads");
  if (!adsConfigured() || !terms.length) return 0;
  const norm = [...new Set(terms.map(normalize))];
  const map = await phrasePopularity(norm);
  for (const t of norm) {
    const v = map.get(t);
    // Apple returns nothing for phrases it has no data on → store NULL, never a made-up floor
    savePopularity(t, country, {
      value: v ?? null,
      source: "apple_ads",
      detail: {
        reason: v == null ? "no Apple Ads data for this phrase" : "Apple Ads phrase popularity (0–100)",
        scope: "account-wide; no country filter documented",
      },
    });
  }
  return map.size;
}
