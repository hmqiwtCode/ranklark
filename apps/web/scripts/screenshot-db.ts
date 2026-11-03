/**
 * Makes a scratch copy of a Ranklark database for the README screenshots:
 *   - keeps only the demo app and shows it under a placeholder identity ("Tallyfinch", a tally-mark icon), so no
 *     real app's name or icon appears in published images. Its numbers stay real App Store data;
 *   - removes every other app of yours, all AI research runs and the MCP token.
 *
 *   pnpm --filter @ranklark/web exec tsx scripts/screenshot-db.ts <source.db> <scratch.db> [demoAppId]
 *   ASO_DB_PATH=<scratch.db> npx next start -p 3120    # then: APP_BASE=http://localhost:3120 pnpm screenshots
 *
 * Never point it at the database you use: it writes only <scratch.db>, but double-check the argument order.
 */
import fs from "node:fs";
import Database from "better-sqlite3";

const [src, out, idArg] = process.argv.slice(2);
if (!src || !out || src === out) {
  console.error("usage: tsx scripts/screenshot-db.ts <source.db> <scratch.db> [demoAppId]");
  process.exit(1);
}
const APP = Number(idArg ?? 1438388363);
const NAME = "Tallyfinch: Habit Tracker";
const SUBTITLE = "Daily Goals & Routines";
const SELLER = "Tallyfinch Labs";
const DESCRIPTION = "Tallyfinch is a placeholder app used for Ranklark's screenshots. Track daily habits, build streaks and plan routines.";
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#34d399"/><stop offset="1" stop-color="#0f766e"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/><g stroke="#fff" stroke-width="34" stroke-linecap="round"><line x1="150" y1="150" x2="150" y2="362"/><line x1="220" y1="150" x2="220" y2="362"/><line x1="290" y1="150" x2="290" y2="362"/><line x1="360" y1="150" x2="360" y2="362"/><line x1="112" y1="330" x2="400" y2="180"/></g></svg>';
const ICON = `data:image/svg+xml;base64,${Buffer.from(SVG).toString("base64")}`;

/** Replaces the demo app's name, subtitle, seller and icon wherever it sits inside stored JSON. */
function rename(o: unknown): number {
  let n = 0;
  if (Array.isArray(o)) for (const x of o) n += rename(x);
  else if (o && typeof o === "object") {
    const r = o as Record<string, unknown>;
    if (r.id === APP || r.trackId === APP || r.appId === APP) {
      for (const k of ["name", "trackName", "title"]) {
        if (!(k in r)) continue;
        r[k] = NAME;
        n++;
      }
      if (r.subtitle) r.subtitle = SUBTITLE;
      for (const k of ["seller", "sellerName", "artistName", "developer"]) if (r[k]) r[k] = SELLER;
      for (const k of ["icon", "artworkUrl60", "artworkUrl100", "artworkUrl512"]) if (r[k]) r[k] = ICON;
    }
    for (const v of Object.values(r)) n += rename(v);
  }
  return n;
}

async function main() {
  for (const f of [out, `${out}-wal`, `${out}-shm`]) fs.rmSync(f, { force: true });
  const source = new Database(src, { readonly: true, fileMustExist: true });
  await source.backup(out);
  source.close();
  const db = new Database(out);
  db.pragma("foreign_keys = ON");
  db.transaction(() => {
    const others = (db.prepare("SELECT id FROM apps WHERE id != ?").all(APP) as { id: number }[]).map((r) => r.id);
    for (const id of others) {
      db.prepare("DELETE FROM ranks WHERE app_id = ?").run(id);
      db.prepare("DELETE FROM apps WHERE id = ?").run(id); // keywords, snapshots and localizations cascade
    }
    db.prepare("DELETE FROM agent_runs").run();
    db.prepare("DELETE FROM settings WHERE key LIKE 'mcp.%'").run();
    db.prepare(
      "UPDATE apps SET name = ?, subtitle = ?, seller = ?, icon = ?, description = ?, url = NULL, bundle_id = NULL WHERE id = ?",
    ).run(NAME, SUBTITLE, SELLER, ICON, DESCRIPTION, APP);
    db.prepare("UPDATE metadata_snapshots SET name = ?, subtitle = ? WHERE app_id = ?").run(NAME, SUBTITLE, APP);

    let replaced = 0;
    const serp = db.prepare("SELECT term, country, day, top_json, web_json FROM serp").all() as {
      term: string;
      country: string;
      day: string;
      top_json: string;
      web_json: string | null;
    }[];
    const upSerp = db.prepare("UPDATE serp SET top_json = ?, web_json = ? WHERE term = ? AND country = ? AND day = ?");
    for (const r of serp) {
      const top = JSON.parse(r.top_json);
      const web = r.web_json ? JSON.parse(r.web_json) : null;
      replaced += rename(top) + rename(web);
      upSerp.run(JSON.stringify(top), web ? JSON.stringify(web) : null, r.term, r.country, r.day);
    }
    const shows = db.prepare("SELECT seed, country, json FROM showcase").all() as { seed: string; country: string; json: string }[];
    const upShow = db.prepare("UPDATE showcase SET json = ? WHERE seed = ? AND country = ?");
    for (const r of shows) {
      const j = JSON.parse(r.json);
      replaced += rename(j);
      upShow.run(JSON.stringify(j), r.seed, r.country);
    }
    console.log(`removed ${others.length} other app(s); placeholder applied in ${replaced} stored entries → ${out}`);
  })();
  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
