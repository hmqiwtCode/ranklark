import fs from "node:fs";
import { signES256 } from "@/server/apple/jwt";

/**
 * App Store Connect API — official, authenticated with YOUR key.
 * Reads the metadata third-party tools can only guess: subtitle + the hidden 100-char keyword field.
 * Token: ES256, aud "appstoreconnect-v1", ≤ 20 min lifetime.
 * Env: ASC_ISSUER_ID (omit for individual keys), ASC_KEY_ID, ASC_PRIVATE_KEY or ASC_PRIVATE_KEY_PATH.
 */
const BASE = "https://api.appstoreconnect.apple.com";

export function ascConfigured() {
  return !!(process.env.ASC_KEY_ID && (process.env.ASC_PRIVATE_KEY || process.env.ASC_PRIVATE_KEY_PATH));
}

let cached: { token: string; exp: number } | null = null;

function token() {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;
  const key = process.env.ASC_PRIVATE_KEY ?? fs.readFileSync(process.env.ASC_PRIVATE_KEY_PATH!, "utf8");
  const exp = now + 15 * 60;
  const payload: Record<string, unknown> = { aud: "appstoreconnect-v1", iat: now, exp };
  if (process.env.ASC_ISSUER_ID) payload.iss = process.env.ASC_ISSUER_ID;
  else payload.sub = "user"; // individual API key
  cached = { token: signES256({ kid: process.env.ASC_KEY_ID }, payload, key), exp };
  return cached.token;
}

type JsonApi<T> = { data: T; links?: { next?: string } };
type Res<A> = { id: string; type: string; attributes: A };

async function get<T>(pathOrUrl: string): Promise<T> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : BASE + pathOrUrl;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`ASC ${res.status} ${url}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function all<A>(path: string): Promise<Res<A>[]> {
  const out: Res<A>[] = [];
  let next: string | undefined = path;
  while (next) {
    const page: JsonApi<Res<A>[]> = await get(next);
    out.push(...page.data);
    next = page.links?.next;
  }
  return out;
}

export type AscLocalization = {
  locale: string;
  name: string | null;
  subtitle: string | null;
  keywords: string | null;
  versionState: string | null;
  version: string | null;
};

export async function listAscApps() {
  return all<{ name: string; bundleId: string; primaryLocale: string }>("/v1/apps?limit=200&fields[apps]=name,bundleId,primaryLocale");
}

/** Name/subtitle (appInfoLocalizations) + keywords (appStoreVersionLocalizations) for the live version. */
export async function fetchAscLocalizations(appId: number | string): Promise<AscLocalization[]> {
  const infos = await all<{ appStoreState?: string; state?: string }>(`/v1/apps/${appId}/appInfos`);
  // prefer the info tied to the live version; fall back to the first
  const info = infos.find((i) => /READY_FOR_(SALE|DISTRIBUTION)/.test(i.attributes.appStoreState ?? i.attributes.state ?? "")) ?? infos[0];
  const infoLocs = info
    ? await all<{ locale: string; name: string | null; subtitle: string | null }>(`/v1/appInfos/${info.id}/appInfoLocalizations?limit=200`)
    : [];

  const versions = await all<{ versionString: string; appStoreState?: string; appVersionState?: string; platform: string }>(
    `/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=10`,
  );
  const state = (v: (typeof versions)[number]) => v.attributes.appVersionState ?? v.attributes.appStoreState ?? "";
  const live = versions.find((v) => /READY_FOR_(SALE|DISTRIBUTION)/.test(state(v))) ?? versions[0];
  const verLocs = live
    ? await all<{ locale: string; keywords: string | null }>(`/v1/appStoreVersions/${live.id}/appStoreVersionLocalizations?limit=200`)
    : [];

  const locales = new Set([...infoLocs.map((l) => l.attributes.locale), ...verLocs.map((l) => l.attributes.locale)]);
  return [...locales].map((locale) => {
    const i = infoLocs.find((l) => l.attributes.locale === locale)?.attributes;
    const v = verLocs.find((l) => l.attributes.locale === locale)?.attributes;
    return {
      locale,
      name: i?.name ?? null,
      subtitle: i?.subtitle ?? null,
      keywords: v?.keywords ?? null,
      versionState: live ? state(live) : null,
      version: live?.attributes.versionString ?? null,
    };
  });
}
