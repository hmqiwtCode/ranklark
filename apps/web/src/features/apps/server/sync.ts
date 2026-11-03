import { primaryLocaleFor } from "@ranklark/core/apple";
import { fillSubtitles, snapshotMetadata, upsertAppFromItunes } from "@/features/apps/server/apps";
import { ascConfigured, fetchAscLocalizations, listAscApps } from "@/server/apple/asc";
import { lookupApps } from "@/server/apple/itunes";
import { db } from "@/server/db";

/** Pull real name/subtitle/keyword field for one app from App Store Connect. */
export async function syncAppFromAsc(appId: number) {
  const locs = await fetchAscLocalizations(appId);
  const up = db.prepare(
    `INSERT INTO localizations (app_id, locale, name, subtitle, keywords, version, version_state) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(app_id, locale) DO UPDATE SET name=excluded.name, subtitle=excluded.subtitle, keywords=excluded.keywords,
       version=excluded.version, version_state=excluded.version_state, fetched_at=datetime('now')`,
  );
  for (const l of locs) up.run(appId, l.locale, l.name, l.subtitle, l.keywords, l.version, l.versionState);

  const app = db.prepare("SELECT primary_country FROM apps WHERE id = ?").get(appId) as { primary_country: string } | undefined;
  const country = app?.primary_country ?? "us";
  const loc = primaryLocaleFor(
    country,
    locs.map((l) => l.locale),
  );
  const primary = locs.find((l) => l.locale === loc);
  if (primary) {
    db.prepare(
      "UPDATE apps SET subtitle = ?, subtitle_source = 'asc', keywords_field = ?, keywords_source = 'asc', updated_at = datetime('now') WHERE id = ?",
    ).run(primary.subtitle, primary.keywords, appId);
    snapshotMetadata(appId, country);
  }
  return locs.length;
}

/** Import every app in your App Store Connect account (public data via Lookup, private fields via ASC). */
export async function importAllFromAsc(country = "us") {
  if (!ascConfigured()) throw new Error("App Store Connect key not configured (see .env.example)");
  const apps = await listAscApps();
  const ids = apps.map((a) => Number(a.id));
  const live = await lookupApps(ids, country);
  for (const a of live) upsertAppFromItunes(a, country, true);
  await fillSubtitles(
    live.map((a) => a.trackId),
    country,
  ).catch(() => 0);
  let synced = 0;
  for (const a of live) {
    try {
      await syncAppFromAsc(a.trackId);
      synced++;
    } catch {
      /* keep going; one app failing shouldn't block the rest */
    }
  }
  return {
    inAccount: apps.length,
    liveInStore: live.length,
    synced,
    notLive: apps.filter((a) => !live.some((l) => l.trackId === Number(a.id))).map((a) => a.attributes.name),
  };
}

export function localizationsFor(appId: number) {
  return db.prepare("SELECT * FROM localizations WHERE app_id = ? ORDER BY locale").all(appId) as {
    locale: string;
    name: string | null;
    subtitle: string | null;
    keywords: string | null;
    version: string | null;
    version_state: string | null;
    fetched_at: string;
  }[];
}
