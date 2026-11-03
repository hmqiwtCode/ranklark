import {
  type CatalogApp,
  catalogUrl,
  DESKTOP_UA,
  PACING,
  parseCatalog,
  parseSearchPage,
  type WebResult,
  webSearchUrl,
} from "@ranklark/core/apple";
import { fetchWithRetry, schedule } from "@/server/apple/queue";
import { assertServerFetch } from "@/server/config";

/**
 * apps.apple.com (the web App Store). UNDOCUMENTED — verified live 2026-11-02.
 *  - search page → top ~12 results in App Store order, with subtitles
 *  - catalog proxy → subtitle, rating histogram, category chart position (no token needed)
 * Apple's website terms prohibit robots/scraping: kept at personal volume; ASO_WEB_SEARCH=0 turns it off.
 */
export type { CatalogApp, WebResult };
export { parseSearchPage };

const GAP = Number(process.env.WEB_GAP_MS ?? PACING.web);
export const webSearchEnabled = () => process.env.ASO_WEB_SEARCH !== "0";

export async function webSearch(term: string, country: string): Promise<WebResult[]> {
  assertServerFetch("web search");
  const html = await schedule("web", GAP, async () => {
    const res = await fetchWithRetry(webSearchUrl(term, country), { headers: { "User-Agent": DESKTOP_UA, Accept: "text/html" } });
    if (!res.ok) throw new Error(`web search ${res.status}`);
    return res.text();
  });
  return parseSearchPage(html);
}

export async function catalogApps(ids: number[], country: string): Promise<CatalogApp[]> {
  assertServerFetch("catalog request");
  const out: CatalogApp[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const json = await schedule("web", GAP, async () => {
      const res = await fetchWithRetry(catalogUrl(ids.slice(i, i + 50), country), {
        headers: { "User-Agent": DESKTOP_UA, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`catalog ${res.status}`);
      return res.json();
    });
    out.push(...parseCatalog(json));
  }
  return out;
}
