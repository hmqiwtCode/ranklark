/** How fast we talk to Apple. Shared by the server queue and the browser extension. */

/** Request spacing per host (ms) for the self-hosted server. Apple documents ~20 calls/min for the iTunes Search API. */
export const PACING = { itunes: 3200, web: 2500, hints: 1200 } as const;

/**
 * The extension runs unattended in someone's browser, so it uses ONE queue for all Apple hosts:
 * 6 s + 0–2 s random jitter between requests → 7.5–10 requests/min in total from that IP.
 * Developers report 403s at ~30/min and occasionally at 4–6/min.
 */
export const EXT_PACING = { gapMs: 6000, jitterMs: 2000 } as const;

/** Hard ceiling of Apple requests per browser per day (the extension enforces it, the dashboard displays it). */
export const EXT_DAILY_CAP = 2500;

/** Desktop Safari UA used by the server. The extension sends the browser's own UA. */
export const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
