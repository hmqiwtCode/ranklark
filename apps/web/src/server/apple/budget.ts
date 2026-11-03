import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-run Apple request budget (AI research agent).
 *
 * A run wraps its work in `withAppleBudget()`. Every request that reaches `schedule()` (server/apple/queue.ts)
 * is charged to the run whose async context scheduled it. Cached answers never reach `schedule()`, so they are
 * free. Outside a budget context nothing is counted or limited, so every other caller behaves as before.
 *
 * The budget only ever LOWERS how many requests are made. It never changes pacing (PACING still applies).
 */
export class AppleBudgetExceeded extends Error {
  constructor(readonly limit: number) {
    super(`Apple request budget spent (${limit} requests). Cached answers still work.`);
    this.name = "AppleBudgetExceeded";
  }
}

export class AppleRunCancelled extends Error {
  constructor() {
    super("Run cancelled: Apple request not sent.");
    this.name = "AppleRunCancelled";
  }
}

export type AppleBudgetOptions = {
  limit: number;
  /** Called after each charged request with the new total. */
  onCharge?: (used: number, limit: number, lane: string) => void;
  /** When aborted, queued and future requests of this run are refused instead of sent. */
  signal?: AbortSignal;
  /** Share one counter between several calls of the same run (e.g. parallel MCP tool calls). */
  counter?: { used: number };
};

type BudgetCtx = AppleBudgetOptions & { counter: { used: number } };

declare global {
  // eslint-disable-next-line no-var
  var __appleBudgetAls: AsyncLocalStorage<BudgetCtx> | undefined;
}
// one instance per process, so a hot-reloaded module still sees runs started before the reload
globalThis.__appleBudgetAls ??= new AsyncLocalStorage<BudgetCtx>();
const als: AsyncLocalStorage<BudgetCtx> = globalThis.__appleBudgetAls;

/** Run `fn` with its own Apple request budget. Nested calls get their own (inner) budget. */
export function withAppleBudget<T>(opts: AppleBudgetOptions, fn: () => Promise<T>): Promise<T> {
  const limit = Math.max(0, Math.floor(opts.limit));
  return als.run({ ...opts, limit, counter: opts.counter ?? { used: 0 } }, fn);
}

/**
 * Charge one Apple request to the current run. Throws AppleBudgetExceeded once the limit is reached and
 * AppleRunCancelled when the run was cancelled. No-op (returns null) outside a budget context.
 */
export function chargeApple(lane: string): { used: number; limit: number } | null {
  const ctx = als.getStore();
  if (!ctx) return null;
  if (ctx.signal?.aborted) throw new AppleRunCancelled();
  if (ctx.counter.used >= ctx.limit) throw new AppleBudgetExceeded(ctx.limit);
  ctx.counter.used++;
  ctx.onCharge?.(ctx.counter.used, ctx.limit, lane);
  return { used: ctx.counter.used, limit: ctx.limit };
}

/** The current run's budget, or null outside a budget context. */
export function appleBudgetState(): { used: number; limit: number } | null {
  const ctx = als.getStore();
  return ctx ? { used: ctx.counter.used, limit: ctx.limit } : null;
}

export const isAppleBudgetExceeded = (e: unknown): e is AppleBudgetExceeded =>
  e instanceof AppleBudgetExceeded || (e instanceof Error && e.name === "AppleBudgetExceeded");
