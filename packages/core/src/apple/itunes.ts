/**
 * iTunes Search + Lookup API (official, documented by Apple).
 * https://performance-partners.apple.com/search-api — about 20 calls/minute per IP.
 * Note: Search API order differs from App Store order (live test 2026-11-02).
 */
export type Device = "iphone" | "ipad";

export type ItunesApp = {
  wrapperType?: string;
  kind?: string;
  trackId: number;
  trackName: string;
  bundleId?: string;
  sellerName?: string;
  artistName?: string;
  artworkUrl100?: string;
  artworkUrl512?: string;
  userRatingCount?: number;
  averageUserRating?: number;
  primaryGenreName?: string;
  primaryGenreId?: number;
  price?: number;
  version?: string;
  currentVersionReleaseDate?: string;
  releaseDate?: string;
  trackViewUrl?: string;
  description?: string;
};

export const itunesSearchUrl = (term: string, country: string, device: Device = "iphone", limit = 200) =>
  "https://itunes.apple.com/search?" +
  new URLSearchParams({
    term,
    country,
    entity: device === "ipad" ? "iPadSoftware" : "software",
    media: "software",
    limit: String(limit),
  }).toString();

export const itunesLookupUrl = (ids: number[], country: string) =>
  `https://itunes.apple.com/lookup?id=${ids.join(",")}&country=${country}&entity=software`;

/** Keep only software rows (ids can collide with music) and only the fields we use — results travel over the wire. */
export function parseItunes(json: { results?: ItunesApp[] }, keepDescription = false): ItunesApp[] {
  return (json.results ?? [])
    .filter((r) => r.trackId && (r.wrapperType === "software" || r.kind === "software"))
    .map((r) => ({
      trackId: r.trackId,
      trackName: r.trackName,
      bundleId: r.bundleId,
      sellerName: r.sellerName,
      artistName: r.artistName,
      artworkUrl100: r.artworkUrl100,
      artworkUrl512: keepDescription ? r.artworkUrl512 : undefined,
      userRatingCount: r.userRatingCount,
      averageUserRating: r.averageUserRating,
      primaryGenreName: r.primaryGenreName,
      primaryGenreId: r.primaryGenreId,
      price: r.price,
      version: r.version,
      currentVersionReleaseDate: r.currentVersionReleaseDate,
      releaseDate: r.releaseDate,
      trackViewUrl: r.trackViewUrl,
      description: keepDescription ? r.description : undefined,
      wrapperType: "software",
    }));
}

export const itunesIcon = (a: ItunesApp) => a.artworkUrl100 ?? a.artworkUrl512 ?? null;
