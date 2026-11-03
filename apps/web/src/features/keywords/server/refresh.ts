/** Refresh one app in one storefront: app details, every keyword's SERP, optionally popularity. */
import { fillSubtitles, upsertAppFromItunes } from "@/features/apps/server/apps";
import { lookupApps } from "@/server/apple/itunes";
import { db } from "@/server/db";
import { runJob } from "@/server/jobs";
import { appleAdsPopularity, estimatePopularity } from "./popularity";
import { fetchSerp } from "./serp";

export function refreshSteps(appId: number, country: string, opts: { popularity?: boolean; force?: boolean } = {}) {
  const terms = (
    db.prepare("SELECT term FROM keywords WHERE app_id = ? AND country = ? ORDER BY term").all(appId, country) as { term: string }[]
  ).map((r) => r.term);
  const steps: (() => Promise<unknown>)[] = [
    async () => {
      const [a] = await lookupApps([appId], country);
      if (a) upsertAppFromItunes(a, country, true);
      await fillSubtitles([appId], country).catch(() => 0);
    },
    ...terms.map((t) => () => fetchSerp(t, country, "iphone", opts.force ?? false)),
  ];
  if (opts.popularity) {
    steps.push(() => appleAdsPopularity(terms, country));
    steps.push(...terms.map((t) => () => estimatePopularity(t, country)));
  }
  return { terms, steps };
}

export function refreshAppJob(appId: number, country: string, opts: { popularity?: boolean } = {}) {
  const { terms, steps } = refreshSteps(appId, country, { force: true, ...opts });
  return runJob(`Checking ${terms.length} keywords`, steps);
}
