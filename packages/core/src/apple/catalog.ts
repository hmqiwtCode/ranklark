/** apps.apple.com catalog proxy: subtitle, rating histogram and chart position, no token. Undocumented. */

export type CatalogApp = {
  id: number;
  name: string;
  subtitle: string | null;
  ratingCount: number | null;
  ratingHistogram: number[] | null; // 1★ → 5★
  chart: { genre: string; position: number; chart: string } | null;
};

export const catalogUrl = (ids: number[], country: string) =>
  `https://apps.apple.com/api/apps/v1/catalog/${country}/apps?ids=${ids.join(",")}&platform=iphone`;

export function parseCatalog(json: { data?: { id: string; attributes: Record<string, unknown> }[] }): CatalogApp[] {
  return (json.data ?? []).map((d) => {
    const a = d.attributes as {
      name?: string;
      platformAttributes?: { ios?: { subtitle?: string } };
      userRating?: { ratingCount?: number; ratingCountList?: number[] };
      chartPositions?: { appStore?: { genreName?: string; position?: number; chart?: string } };
    };
    const c = a.chartPositions?.appStore;
    return {
      id: Number(d.id),
      name: a.name ?? "",
      subtitle: a.platformAttributes?.ios?.subtitle ?? null,
      ratingCount: a.userRating?.ratingCount ?? null,
      ratingHistogram: a.userRating?.ratingCountList ?? null,
      chart: c?.position ? { genre: c.genreName ?? "", position: c.position, chart: c.chart ?? "" } : null,
    };
  });
}
