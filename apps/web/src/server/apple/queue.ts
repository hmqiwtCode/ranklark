import { chargeApple } from "./budget";

/**
 * Per-host request spacing. Apple documents ~20 calls/minute for the iTunes
 * Search API; we stay under it by spacing calls instead of bursting.
 */
type Lane = { gapMs: number; next: number; chain: Promise<unknown> };

const lanes = new Map<string, Lane>();

export function lane(name: string, gapMs: number) {
  if (!lanes.has(name)) lanes.set(name, { gapMs, next: 0, chain: Promise.resolve() });
  return lanes.get(name)!;
}

export function schedule<T>(laneName: string, gapMs: number, task: () => Promise<T>): Promise<T> {
  const l = lane(laneName, gapMs);
  const run = l.chain.then(async () => {
    // AI agent runs: charge this request to the run that scheduled it (throws when its budget is spent).
    // Outside a run this is a no-op. A refused request doesn't take a pacing slot.
    chargeApple(laneName);
    const wait = l.next - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    l.next = Date.now() + l.gapMs;
    return task();
  });
  l.chain = run.catch(() => undefined);
  return run;
}

export async function fetchWithRetry(url: string, init: RequestInit = {}, tries = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(20_000) });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        await new Promise((r) => setTimeout(r, 4000 * (i + 1)));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw lastErr;
}
