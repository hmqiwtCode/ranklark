/**
 * Who talks to Apple?
 *   server    (default) — this Next.js process calls Apple directly (fine for 1 self-hosted user)
 *   extension — the server NEVER calls Apple; the browser extension fetches from each user's own
 *               browser/IP and posts results to /api/ext/results. Use this when hosting for many users.
 */
export const fetchMode = (): "server" | "extension" => (process.env.ASO_FETCH_MODE === "extension" ? "extension" : "server");

export class NeedsExtension extends Error {
  constructor(what: string) {
    super(`${what}: waiting for the Ranklark browser extension (server is in extension mode)`);
    this.name = "NeedsExtension";
  }
}

export function assertServerFetch(what: string) {
  if (fetchMode() === "extension") throw new NeedsExtension(what);
}
