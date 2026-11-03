import { catalogUrl, itunesLookupUrl, parseCatalog, parseItunes } from "@ranklark/core/apple";
import type { Task, TaskResult } from "@ranklark/core/protocol";
import { apple, optional } from "../apple";

/** Name, icon, ratings (iTunes Lookup) + subtitle and chart position (catalog proxy, optional). */
export async function runApps(t: Extract<Task, { kind: "apps" }>): Promise<TaskResult> {
  const itunes = parseItunes(await (await apple(itunesLookupUrl(t.ids, t.country))).json(), true);
  const catalog = [];
  for (let i = 0; i < t.ids.length; i += 50) {
    const url = catalogUrl(t.ids.slice(i, i + 50), t.country);
    catalog.push(...(await optional(async () => parseCatalog(await (await apple(url, { Accept: "application/json" })).json()), [])));
  }
  return { kind: "apps", country: t.country, itunes, catalog };
}
