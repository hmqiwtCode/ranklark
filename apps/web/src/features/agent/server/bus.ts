/**
 * In-process pub/sub for live run events (SSE subscribers). Kept on globalThis so it survives dev hot reloads,
 * like server/jobs.ts. Events are persisted by the store first; the bus only fans them out.
 */
import type { StoredEvent } from "../lib/contract";

type Listener = (e: StoredEvent) => void;

declare global {
  // eslint-disable-next-line no-var
  var __agentBus: Map<string, Set<Listener>> | undefined;
}
globalThis.__agentBus ??= new Map();
const listeners: Map<string, Set<Listener>> = globalThis.__agentBus;

/** Listen to one run's new events. Returns the unsubscribe function. */
export function subscribe(runId: string, fn: Listener): () => void {
  let set = listeners.get(runId);
  if (!set) {
    set = new Set();
    listeners.set(runId, set);
  }
  set.add(fn);
  return () => {
    const s = listeners.get(runId);
    if (!s) return;
    s.delete(fn);
    if (!s.size) listeners.delete(runId);
  };
}

export function publish(runId: string, e: StoredEvent) {
  for (const fn of listeners.get(runId) ?? []) {
    try {
      fn(e);
    } catch {
      /* a broken subscriber must not break the run */
    }
  }
}
