/**
 * Polite Apple fetching: ONE queue for every Apple host (so the total from this IP stays ≤ ~10 requests/min),
 * a hard daily cap, and per-host exponential backoff on 403/429. Cookies are never sent.
 */
import { EXT_DAILY_CAP, EXT_PACING } from "@ranklark/core/apple";
import { currentStatus, saveStatus, today } from "./state";

export class HostPaused extends Error {}
export class DailyCap extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let nextSlot = 0;

async function paced<T>(fn: () => Promise<T>): Promise<T> {
  const wait = nextSlot - Date.now();
  nextSlot = Math.max(Date.now(), nextSlot) + EXT_PACING.gapMs + Math.round(Math.random() * EXT_PACING.jitterMs);
  if (wait > 0) await sleep(wait);
  return fn();
}

export async function apple(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const host = new URL(url).host;
  let status = currentStatus();
  const hb = status.hostBackoff?.[host];
  if (hb && Date.now() < hb.until) throw new HostPaused(`${host} paused until ${new Date(hb.until).toLocaleTimeString()}`);
  if (status.requestsDay !== today()) await saveStatus({ requestsDay: today(), requestsToday: 0 });
  status = currentStatus();
  if (status.requestsToday >= EXT_DAILY_CAP) throw new DailyCap(`daily safety cap of ${EXT_DAILY_CAP} Apple requests reached`);

  const res = await paced(() => fetch(url, { headers, credentials: "omit", cache: "no-store", redirect: "follow" }));
  await saveStatus({ requestsToday: currentStatus().requestsToday + 1 });

  if (res.status === 429 || res.status === 403) {
    // Back off THIS host only: 60 → 120 → 240 … minutes, max 24 h. Other Apple hosts keep working.
    const minutes = Math.min(1440, (hb?.minutes ?? 30) * 2);
    const hostBackoff = { ...(currentStatus().hostBackoff ?? {}), [host]: { until: Date.now() + minutes * 60_000, minutes } };
    await saveStatus({ hostBackoff, backoffUntil: Math.min(...Object.values(hostBackoff).map((h) => h.until)) });
    throw new HostPaused(`${host} answered ${res.status} — pausing it for ${minutes} min`);
  }
  if (hb) {
    const { [host]: _recovered, ...rest } = currentStatus().hostBackoff ?? {};
    await saveStatus({ hostBackoff: rest });
  }
  if (!res.ok) throw new Error(`${host} HTTP ${res.status}`);
  return res;
}

/** Run an optional extra request: failures are ignored, except the daily cap which must stop the run. */
export async function optional<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DailyCap) throw e;
    return fallback;
  }
}
