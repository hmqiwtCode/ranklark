/**
 * Daily rank snapshot for every app × storefront you track.
 *   npm run track                 # ranks only
 *   npm run track -- --popularity # ranks + popularity (Apple Ads if configured, else autocomplete estimate)
 * Schedule it once a day, e.g. crontab:  15 7 * * *  cd /path/to/web && npm run track >> data/track.log 2>&1
 */

import { refreshSteps } from "../src/features/keywords/server/refresh";
import { db } from "../src/server/db";

async function main() {
  const popularity = process.argv.includes("--popularity");
  const pairs = db.prepare("SELECT DISTINCT app_id, country FROM keywords ORDER BY app_id, country").all() as {
    app_id: number;
    country: string;
  }[];
  const started = Date.now();
  let ok = 0;
  let failed = 0;
  // de-dupe terms across apps: fetchSerp records ranks for every app tracking the term, and caches per day
  for (const { app_id, country } of pairs) {
    const { terms, steps } = refreshSteps(app_id, country, { popularity });
    process.stdout.write(`app ${app_id} [${country}] ${terms.length} keywords `);
    for (const step of steps) {
      try {
        await step();
        ok++;
        process.stdout.write(".");
      } catch (e) {
        failed++;
        process.stdout.write("x");
        console.error(`\n  ${e instanceof Error ? e.message : e}`);
      }
    }
    process.stdout.write("\n");
  }
  console.log(`done: ${ok} ok, ${failed} failed, ${Math.round((Date.now() - started) / 1000)}s`);
}

main();
