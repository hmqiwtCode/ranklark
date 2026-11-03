import { type Device, type ItunesApp, itunesIcon, itunesLookupUrl, itunesSearchUrl, PACING, parseItunes } from "@ranklark/core/apple";
import { fetchWithRetry, schedule } from "@/server/apple/queue";
import { assertServerFetch } from "@/server/config";

/**
 * Official, documented iTunes Search & Lookup APIs (server-side calls).
 * https://performance-partners.apple.com/search-api
 * No rank field exists — rank = 1-based position of an app in the ordered result list.
 */
export type { Device, ItunesApp };

const GAP = Number(process.env.ITUNES_GAP_MS ?? PACING.itunes);

async function getJson(url: string) {
  assertServerFetch("iTunes request");
  return schedule("itunes", GAP, async () => {
    const res = await fetchWithRetry(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`iTunes ${res.status}: ${url}`);
    return res.json();
  });
}

export async function searchApps(term: string, country: string, device: Device = "iphone", limit = 200) {
  return parseItunes(await getJson(itunesSearchUrl(term, country, device, limit)));
}

export async function lookupApps(ids: number[], country: string) {
  const out: ItunesApp[] = [];
  for (let i = 0; i < ids.length; i += 150) out.push(...parseItunes(await getJson(itunesLookupUrl(ids.slice(i, i + 150), country)), true));
  return out;
}

/** Accepts "https://apps.apple.com/us/app/name/id6777418376", "id6777418376" or "6777418376". */
export function parseAppId(input: string): { id: number; country?: string } | null {
  const s = input.trim();
  const m = s.match(/apps\.apple\.com\/([a-z]{2})\/.*?id(\d{6,12})/i);
  if (m) return { id: Number(m[2]), country: m[1].toLowerCase() };
  const m2 = s.match(/^(?:id)?(\d{6,12})$/i);
  if (m2) return { id: Number(m2[1]) };
  const m3 = s.match(/id(\d{6,12})/);
  if (m3) return { id: Number(m3[1]) };
  return null;
}

export const icon = itunesIcon;
