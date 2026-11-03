import fs from "node:fs";
import { signES256 } from "@/server/apple/jwt";

/**
 * Apple Ads Platform API 1.0 (api.ads.apple.com/v1, released Aug 2026).
 * The old Campaign Management API v5 is deprecated and sunsets 26 Jan 2027, so we don't use it.
 *
 * Popularity for arbitrary phrases: POST /v1/suggestions/phrases/query with
 *   filters: queryType EQUALS SEARCH, phrase IN [...]  →  result: [{ phrase, popularity (0–100) }]
 * Docs list no country filter for this route, so the value may be storefront-agnostic. Shown as "Apple Ads" in the UI.
 *
 * Env: ADS_CLIENT_ID, ADS_TEAM_ID, ADS_KEY_ID, ADS_PRIVATE_KEY or ADS_PRIVATE_KEY_PATH, ADS_AD_ACCOUNT_ID
 */
const BASE = "https://api.ads.apple.com/v1";

export function adsConfigured() {
  const e = process.env;
  return !!(e.ADS_CLIENT_ID && e.ADS_TEAM_ID && e.ADS_KEY_ID && e.ADS_AD_ACCOUNT_ID && (e.ADS_PRIVATE_KEY || e.ADS_PRIVATE_KEY_PATH));
}

let access: { token: string; exp: number } | null = null;

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (access && access.exp - 120 > now) return access.token;
  const e = process.env;
  const key = e.ADS_PRIVATE_KEY ?? fs.readFileSync(e.ADS_PRIVATE_KEY_PATH!, "utf8");
  const clientSecret = signES256(
    { kid: e.ADS_KEY_ID },
    { aud: "https://appleid.apple.com", iss: e.ADS_TEAM_ID, sub: e.ADS_CLIENT_ID, iat: now, exp: now + 86400 },
    key,
  );
  const res = await fetch("https://appleid.apple.com/auth/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: e.ADS_CLIENT_ID!,
      client_secret: clientSecret,
      scope: "searchadsorg",
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Apple Ads OAuth ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  access = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return access.token;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "X-AP-Context": `adAccountId=${process.env.ADS_AD_ACCOUNT_ID}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Apple Ads ${res.status} ${path}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/** Exact popularity lookup (phrase IN [...]). Request shape copied from Apple's docs; untested without an account. */
export async function phrasePopularity(phrases: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  // 20 per call = the documented default page size, so no result can fall off the first page.
  for (let i = 0; i < phrases.length; i += 20) {
    const chunk = phrases.slice(i, i + 20);
    const j = await post<{ result: { phrase: string; popularity: number }[] }>("/suggestions/phrases/query", {
      filters: [
        { field: "queryType", operator: "EQUALS", value: ["SEARCH"] },
        { field: "phrase", operator: "IN", value: chunk },
      ],
      pagination: { offset: 0, pageSize: 20 },
    });
    for (const r of j.result ?? []) out.set(r.phrase.toLowerCase(), r.popularity);
  }
  return out;
}

/** Phrase discovery seeded by one of your apps (SUGGESTION route). */
export async function phraseSuggestionsForApp(appId: number) {
  const j = await post<{ result: { phrase: string; popularity: number }[] }>("/suggestions/phrases/query", {
    filters: [
      { field: "promotedObjectId", operator: "EQUALS", value: [String(appId)] },
      { field: "promotedObjectType", operator: "EQUALS", value: ["APPSTORE_APP"] },
      { field: "queryType", operator: "EQUALS", value: ["SUGGESTION"] },
    ],
    pagination: { offset: 0, pageSize: 200 },
  });
  return j.result ?? [];
}
