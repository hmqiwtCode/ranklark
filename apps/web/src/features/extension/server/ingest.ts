/**
 * Validates and stores results posted by the extension. Everything from the client is treated as untrusted:
 * fields are type-checked and size-capped, and only the owner's tracked keywords/apps are accepted.
 * One ingester per task kind (see INGESTERS); add a kind here when you add one to @ranklark/core/protocol.
 */
import type { CatalogApp, ItunesApp, WebResult } from "@ranklark/core/apple";
import { parseSearchPage } from "@ranklark/core/apple";
import { ingestCatalog, upsertAppFromItunes } from "@/features/apps/server/apps";
import { getPopularity, popularityPlan } from "@/features/keywords/server/popularity";
import { ingestSerp } from "@/features/keywords/server/serp";
import { storeHints } from "@/server/apple/hints";
import { db } from "@/server/db";
import { type Device, saveDeviceStatus } from "./devices";

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const country = (v: unknown) => (typeof v === "string" && /^[a-z]{2}$/.test(v) ? v : null);

function cleanItunes(v: unknown, max = 200): ItunesApp[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, max).flatMap((r) => {
    const id = num(r?.trackId);
    const name = str(r?.trackName, 200);
    if (!id || !name) return [];
    return [
      {
        trackId: id,
        trackName: name,
        bundleId: str(r.bundleId, 200),
        sellerName: str(r.sellerName, 200),
        artistName: str(r.artistName, 200),
        artworkUrl100: str(r.artworkUrl100, 500),
        artworkUrl512: str(r.artworkUrl512, 500),
        userRatingCount: num(r.userRatingCount),
        averageUserRating: num(r.averageUserRating),
        primaryGenreName: str(r.primaryGenreName, 100),
        primaryGenreId: num(r.primaryGenreId),
        price: num(r.price),
        version: str(r.version, 50),
        currentVersionReleaseDate: str(r.currentVersionReleaseDate, 40),
        releaseDate: str(r.releaseDate, 40),
        trackViewUrl: str(r.trackViewUrl, 500),
        description: str(r.description, 4000),
        wrapperType: "software",
      },
    ];
  });
}

function cleanWeb(v: unknown): WebResult[] | null {
  if (v === null || !Array.isArray(v)) return null;
  return v.slice(0, 40).flatMap((w) => {
    const id = num(w?.id);
    if (!id) return [];
    return [
      {
        id,
        title: str(w.title, 200) ?? "",
        subtitle: str(w.subtitle, 200) ?? null,
        rating: num(w.rating) ?? null,
        ratingCount: num(w.ratingCount) ?? null,
        kind: w.kind === "event" ? "event" : "app",
      } as WebResult,
    ];
  });
}

function cleanCatalog(v: unknown): CatalogApp[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 150).flatMap((c) => {
    const id = num(c?.id);
    if (!id) return [];
    const hist = Array.isArray(c.ratingHistogram) ? c.ratingHistogram.slice(0, 5).map((n: unknown) => num(n) ?? 0) : null;
    const ch =
      c.chart && num(c.chart.position)
        ? { genre: str(c.chart.genre, 100) ?? "", position: num(c.chart.position)!, chart: str(c.chart.chart, 40) ?? "" }
        : null;
    return [
      {
        id,
        name: str(c.name, 200) ?? "",
        subtitle: str(c.subtitle, 200) ?? null,
        ratingCount: num(c.ratingCount) ?? null,
        ratingHistogram: hist,
        chart: ch,
      },
    ];
  });
}

function recordEvent(deviceId: string, kind: string, c: string | null, term: string | null, detail: unknown) {
  db.prepare("INSERT INTO ext_events (device_id, kind, country, term, detail) VALUES (?, ?, ?, ?, ?)").run(
    deviceId,
    kind,
    c,
    term,
    JSON.stringify(detail),
  );
}

type Summary = { apps: number; serp: number; hints: number; errors: string[]; rejected: number };
type Ctx = { device: Device; summary: Summary; mine: Set<number>; isTracked: (term: string, country: string) => boolean };
type Ingester = (raw: Record<string, unknown>, country: string, ctx: Ctx) => void;

const reject = (ctx: Ctx) => void ctx.summary.rejected++;

/** One ingester per task kind. The extension sends `{ kind, country, ... }`; anything unknown is rejected. */
const INGESTERS: Record<string, Ingester> = {
  apps(raw, c, ctx) {
    let n = 0;
    for (const a of cleanItunes(raw.itunes, 150)) {
      if (!ctx.mine.has(a.trackId)) continue;
      upsertAppFromItunes(a, c, true);
      n++;
    }
    ingestCatalog(
      cleanCatalog(raw.catalog).filter((x) => ctx.mine.has(x.id)),
      c,
    );
    ctx.summary.apps += n;
    recordEvent(ctx.device.id, "apps", c, null, { count: n });
  },

  serp(raw, c, ctx) {
    if (typeof raw.term !== "string") return reject(ctx);
    const term = raw.term.slice(0, 80);
    if (!ctx.isTracked(term, c)) return reject(ctx);
    let web = cleanWeb(raw.web);
    if (!web && typeof raw.webRaw === "string" && raw.webRaw.length < 2_000_000) {
      // The extension's bundled parser failed (Apple changed the page?). Try the server's, which ships without store review.
      try {
        web = parseSearchPage(`<script id="serialized-server-data">${raw.webRaw}</script>`);
      } catch (e) {
        ctx.summary.errors.push(`web parse: ${e instanceof Error ? e.message : e}`);
      }
    }
    const row = ingestSerp(term, c, cleanItunes(raw.itunes), web, cleanItunes(raw.extra, 10));
    ctx.summary.serp++;
    const top = JSON.parse(row.top_json) as { name: string }[];
    const ranks = myRanks(term, c, row.day);
    recordEvent(ctx.device.id, "serp", c, term, { ranks, top1: top[0]?.name ?? null, webOk: !!web, results: row.result_count });
  },

  hints(raw, c, ctx) {
    if (typeof raw.term !== "string" || !Array.isArray(raw.responses)) return reject(ctx);
    const term = raw.term.slice(0, 80);
    if (!ctx.isTracked(term, c)) return reject(ctx);
    const responses = (raw.responses as { prefix?: unknown; hints?: unknown }[]).slice(0, 20);
    for (const r of responses) {
      const prefix = str(r?.prefix, 80);
      if (!prefix || !Array.isArray(r.hints)) continue;
      const hints = (r.hints as { term?: unknown }[])
        .slice(0, 20)
        .flatMap((h) => (typeof h?.term === "string" ? [{ term: h.term.slice(0, 120).toLowerCase() }] : []));
      storeHints(prefix, c, hints);
    }
    popularityPlan(term, c); // computes + saves the estimate once the probes are complete
    ctx.summary.hints++;
    const pop = getPopularity(term, c);
    recordEvent(ctx.device.id, "hints", c, term, {
      popularity: pop?.value ?? null,
      reason: pop?.detail?.reason ?? null,
      probes: responses.length,
    });
  },
};

function myRanks(term: string, c: string, day: string) {
  const rows = db
    .prepare(
      "SELECT r.app_id, a.name, a.icon, r.rank, r.approx FROM ranks r JOIN apps a ON a.id = r.app_id WHERE r.term = ? AND r.country = ? AND r.day = ?",
    )
    .all(term, c, day) as { app_id: number; name: string; icon: string | null; rank: number | null; approx: number }[];
  return rows.map((r) => ({ appId: r.app_id, name: r.name, icon: r.icon, rank: r.rank, approx: !!r.approx }));
}

function recordError(raw: Record<string, unknown>, ctx: Ctx) {
  const message = str(raw.message, 300) ?? "unknown error";
  ctx.summary.errors.push(message);
  const t = raw.task as { term?: unknown; country?: unknown } | undefined;
  recordEvent(ctx.device.id, "error", country(t?.country), typeof t?.term === "string" ? t.term.slice(0, 80) : null, { message });
}

export function ingestResults(body: unknown, device: Device) {
  const list = (body as { results?: unknown })?.results;
  const results = (Array.isArray(list) ? list.slice(0, 100) : []) as Record<string, unknown>[];
  const tracked = db.prepare("SELECT 1 FROM keywords WHERE term = ? AND country = ?");
  const ctx: Ctx = {
    device,
    summary: { apps: 0, serp: 0, hints: 0, errors: [], rejected: 0 },
    mine: new Set((db.prepare("SELECT id FROM apps WHERE is_mine = 1").all() as { id: number }[]).map((r) => r.id)),
    isTracked: (term, c) => !!tracked.get(term, c),
  };

  for (const raw of results) {
    try {
      if (raw?.kind === "error") {
        recordError(raw, ctx);
        continue;
      }
      const ingest = INGESTERS[String(raw?.kind)];
      const c = country(raw?.country);
      if (!ingest || !c) reject(ctx);
      else ingest(raw, c, ctx);
    } catch (e) {
      ctx.summary.errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  saveDeviceStatus(device.id, (body as { status?: unknown })?.status);
  db.prepare("DELETE FROM ext_events WHERE at < datetime('now', '-30 days')").run();
  return ctx.summary;
}
