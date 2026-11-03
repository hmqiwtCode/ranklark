/** apps.apple.com web search page: the server-rendered top ~12 results in true App Store order. Undocumented. */

/** Extract the embedded JSON from an App Store web page (shipped raw to the server if parsing fails). */
export function extractServerData(html: string): string | null {
  return html.match(/<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? null;
}

export type WebResult = {
  id: number;
  title: string;
  subtitle: string | null;
  rating: number | null;
  ratingCount: number | null;
  kind: "app" | "event";
};

export const webSearchUrl = (term: string, country: string) =>
  `https://apps.apple.com/${country}/iphone/search?term=${encodeURIComponent(term)}`;

type Lockup = { adamId?: string | number; title?: string; subtitle?: string; rating?: number; ratingCount?: number | string };
type Item = { lockup?: Lockup; appEvent?: { lockup?: Lockup }; $kind?: string };

/** Top ~12 results, in App Store order, from the page's server-rendered JSON. Regex + JSON.parse only (no DOM). */
export function parseSearchPage(html: string): WebResult[] {
  const raw = extractServerData(html);
  if (!raw) throw new Error("web search: serialized-server-data not found (page format changed?)");
  const data = JSON.parse(raw) as { data?: { data?: { shelves?: { items?: Item[] }[] } }[] };
  const out: WebResult[] = [];
  const seen = new Set<number>();
  for (const block of data.data ?? []) {
    for (const shelf of block.data?.shelves ?? []) {
      for (const item of shelf.items ?? []) {
        const l = item.lockup ?? item.appEvent?.lockup;
        if (!l?.adamId) continue; // editorial cards have no app lockup and don't occupy an app rank
        const id = Number(l.adamId);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({
          id,
          title: l.title ?? "",
          subtitle: l.subtitle ?? null,
          rating: typeof l.rating === "number" ? l.rating : null,
          ratingCount: l.ratingCount != null ? Number(l.ratingCount) : null,
          kind: item.appEvent ? "event" : "app",
        });
      }
    }
  }
  return out;
}
