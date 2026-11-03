/**
 * Wire protocol between the dashboard server and the browser extension.
 *
 *   GET  /api/ext/tasks    → { tasks: Task[] }        what this browser should check (only the owner's keywords)
 *   POST /api/ext/results  ← { results: TaskResult[] } parsed Apple responses, one at a time
 *   POST /api/ext/connect  → { id, token }             no-login pairing (see apps/web/src/features/extension)
 *
 * Adding a new task kind: add it to `Task` + `TaskResult` here, a runner in apps/extension/src/background/tasks/,
 * a planner + ingester in apps/web/src/features/extension/server/. TypeScript will point at every place left.
 */
import type { CatalogApp } from "./apple/catalog";
import type { Hint } from "./apple/hints";
import type { ItunesApp } from "./apple/itunes";
import type { WebResult } from "./apple/search-page";

export type Task =
  /** iTunes lookup + catalog proxy (name, icon, subtitle, chart position) for the owner's apps. */
  | { kind: "apps"; country: string; ids: number[] }
  /** iTunes search + web search page (+ lookup of web-only top-10 ids) for one tracked keyword. */
  | { kind: "serp"; country: string; term: string }
  /** Autocomplete probes, shortest prefix first; stop once Apple suggests the term. */
  | { kind: "hints"; country: string; term: string; prefixes: string[] };

export type TaskKind = Task["kind"];

export type TaskResult =
  | { kind: "apps"; country: string; itunes: ItunesApp[]; catalog: CatalogApp[] }
  | {
      kind: "serp";
      country: string;
      term: string;
      itunes: ItunesApp[];
      web: WebResult[] | null;
      /** Raw embedded JSON, sent only when the bundled parser failed, so the server's newer parser can try. */
      webRaw?: string | null;
      extra?: ItunesApp[];
    }
  | { kind: "hints"; country: string; term: string; responses: { prefix: string; hints: Pick<Hint, "term">[] }[] }
  | { kind: "error"; task?: Task; message: string };

/** What a browser reports about itself (shown on the dashboard's Extension page). */
export type DeviceStatus = {
  state: "idle" | "running" | "error" | "backoff";
  done: number;
  total: number;
  current?: string;
  lastError?: string;
  /** Earliest time a paused Apple host is usable again. */
  backoffUntil?: number;
  requestsToday: number;
  requestsDay?: string;
  finishedAt?: string;
  lastOkDay?: string;
};

/** Device tokens look like `<prefix>_<32+ url-safe chars>`; the server stores only a SHA-256 hash. */
export const TOKEN_PREFIX = "rl";
export const TOKEN_RE = /^[a-z]+_[A-Za-z0-9_-]{20,}$/;
export const VERSION_HEADER = "x-client-version";
