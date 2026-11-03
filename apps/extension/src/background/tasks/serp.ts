import {
  extractServerData,
  type ItunesApp,
  itunesLookupUrl,
  itunesSearchUrl,
  parseItunes,
  parseSearchPage,
  type WebResult,
  webSearchUrl,
} from "@ranklark/core/apple";
import type { Task, TaskResult } from "@ranklark/core/protocol";
import { apple, optional } from "../apple";

/** One keyword: official API order (≤200) + true App Store order (web page top ~12) + icons for web-only apps. */
export async function runSerp(t: Extract<Task, { kind: "serp" }>): Promise<TaskResult> {
  // Sequential on purpose (one queue): never two Apple requests at the same moment.
  const itunes = parseItunes(await (await apple(itunesSearchUrl(t.term, t.country))).json());

  let web: WebResult[] | null = null;
  let webRaw: string | null = null; // sent only if the bundled parser fails, so the server's newer parser can try
  const html = await optional(async () => (await apple(webSearchUrl(t.term, t.country), { Accept: "text/html" })).text(), null);
  if (html) {
    try {
      web = parseSearchPage(html);
    } catch {
      const data = extractServerData(html);
      webRaw = data && data.length < 2_000_000 ? data : null;
    }
  }

  const known = new Set(itunes.map((r) => r.trackId));
  const missing = [...(web ?? []).map((w) => w.id), ...itunes.map((r) => r.trackId)].slice(0, 10).filter((id) => !known.has(id));
  const extra = missing.length
    ? await optional(async () => parseItunes(await (await apple(itunesLookupUrl(missing, t.country))).json()), [] as ItunesApp[])
    : [];

  return { kind: "serp", country: t.country, term: t.term, itunes, web, webRaw, extra };
}
