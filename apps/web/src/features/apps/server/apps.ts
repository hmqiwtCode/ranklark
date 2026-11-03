/** Your apps: create/update from Apple data, subtitles, metadata snapshots. */
import crypto from "node:crypto";
import type { CatalogApp } from "@ranklark/core/apple";
import { type ItunesApp, icon, lookupApps } from "@/server/apple/itunes";
import { catalogApps, webSearchEnabled } from "@/server/apple/web";
import { fetchMode } from "@/server/config";
import { db } from "@/server/db";
import type { AppRow } from "@/server/db/rows";

export function upsertAppFromItunes(a: ItunesApp, country: string, isMine = true) {
  db.prepare(
    `INSERT INTO apps (id, bundle_id, name, seller, icon, genre, genre_id, rating, rating_count, price, version, released_at, url, description, primary_country, is_mine)
     VALUES (@id, @bundle_id, @name, @seller, @icon, @genre, @genre_id, @rating, @rating_count, @price, @version, @released_at, @url, @description, @country, @is_mine)
     ON CONFLICT(id) DO UPDATE SET
       bundle_id=excluded.bundle_id, name=excluded.name, seller=excluded.seller, icon=excluded.icon,
       genre=excluded.genre, genre_id=excluded.genre_id, rating=excluded.rating, rating_count=excluded.rating_count,
       price=excluded.price, version=excluded.version, released_at=excluded.released_at, url=excluded.url,
       description=excluded.description, updated_at=datetime('now')`,
  ).run({
    id: a.trackId,
    bundle_id: a.bundleId ?? null,
    name: a.trackName,
    seller: a.sellerName ?? a.artistName ?? null,
    icon: icon(a),
    genre: a.primaryGenreName ?? null,
    genre_id: a.primaryGenreId ?? null,
    rating: a.averageUserRating ?? null,
    rating_count: a.userRatingCount ?? 0,
    price: a.price ?? 0,
    version: a.version ?? null,
    released_at: a.currentVersionReleaseDate ?? a.releaseDate ?? null,
    url: a.trackViewUrl ?? null,
    description: a.description ?? null,
    country,
    is_mine: isMine ? 1 : 0,
  });
  snapshotMetadata(a.trackId, country);
}

/** Public subtitle + chart position from the web store's catalog proxy (skipped when ASC is the source). */
export async function fillSubtitles(ids: number[], country: string) {
  if (!webSearchEnabled() || !ids.length) return 0;
  return ingestCatalog(await catalogApps(ids, country), country);
}

export function ingestCatalog(rows: CatalogApp[], country: string) {
  const up = db.prepare(
    `UPDATE apps SET chart_json = ?,
       subtitle = CASE WHEN subtitle_source IN ('asc','manual') THEN subtitle ELSE ? END,
       subtitle_source = CASE WHEN subtitle_source IN ('asc','manual') THEN subtitle_source ELSE 'web' END
     WHERE id = ?`,
  );
  for (const r of rows) {
    up.run(r.chart ? JSON.stringify(r.chart) : null, r.subtitle, r.id);
    snapshotMetadata(r.id, country);
  }
  return rows.length;
}

/** Records a metadata snapshot only when something indexed (or the version) changed. */
export function snapshotMetadata(appId: number, country: string) {
  const app = db.prepare("SELECT * FROM apps WHERE id = ?").get(appId) as AppRow | undefined;
  if (!app) return;
  const descHash = crypto
    .createHash("sha1")
    .update(app.description ?? "")
    .digest("hex")
    .slice(0, 12);
  const last = db
    .prepare("SELECT * FROM metadata_snapshots WHERE app_id = ? AND country = ? ORDER BY id DESC LIMIT 1")
    .get(appId, country) as
    | { version: string; name: string; subtitle: string | null; keywords_field: string | null; description_hash: string }
    | undefined;
  const changed =
    !last ||
    last.version !== app.version ||
    last.name !== app.name ||
    (last.subtitle ?? null) !== (app.subtitle ?? null) ||
    (last.keywords_field ?? null) !== (app.keywords_field ?? null) ||
    last.description_hash !== descHash;
  if (changed) {
    db.prepare(
      "INSERT INTO metadata_snapshots (app_id, country, version, name, subtitle, keywords_field, description_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(appId, country, app.version, app.name, app.subtitle, app.keywords_field, descHash);
  }
}

export async function addApp(id: number, country: string) {
  if (fetchMode() === "extension") {
    // the extension fills in name/icon/ratings on its next check
    db.prepare("INSERT OR IGNORE INTO apps (id, name, primary_country, is_mine) VALUES (?, ?, ?, 1)").run(id, `App ${id}`, country);
    db.prepare("UPDATE apps SET is_mine = 1 WHERE id = ?").run(id); // it may exist already as a competitor
    const row = db.prepare("SELECT name FROM apps WHERE id = ?").get(id) as { name: string };
    return { trackId: id, trackName: row.name } as ItunesApp;
  }
  const [a] = await lookupApps([id], country);
  if (!a) throw new Error(`App ${id} not found in the ${country.toUpperCase()} store`);
  upsertAppFromItunes(a, country, true);
  db.prepare("UPDATE apps SET is_mine = 1 WHERE id = ?").run(id); // it may exist already as a competitor
  void fillSubtitles([id], country).catch(() => 0); // optional; don't make the caller wait for it
  return a;
}
