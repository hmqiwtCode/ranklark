import { describe, expect, it } from "vitest";
import { AppleBudgetExceeded, AppleRunCancelled, appleBudgetState, chargeApple, withAppleBudget } from "./budget";
import { schedule } from "./queue";

// No network: the scheduled tasks are plain functions. Gap 0 so lanes don't wait.
const fake = (out: string[], v: string) => async () => {
  out.push(v);
  return v;
};

describe("Apple request budget", () => {
  it("is a no-op outside a run", async () => {
    expect(chargeApple("itunes")).toBeNull();
    expect(appleBudgetState()).toBeNull();
    const out: string[] = [];
    await Promise.all([1, 2, 3].map((i) => schedule("t-free", 0, fake(out, `r${i}`))));
    expect(out).toEqual(["r1", "r2", "r3"]);
  });

  it("charges requests made through the lane chain and refuses past the limit", async () => {
    const out: string[] = [];
    const charges: number[] = [];
    const results = await withAppleBudget({ limit: 2, onCharge: (used) => charges.push(used) }, () =>
      Promise.allSettled([1, 2, 3].map((i) => schedule("t-limit", 0, fake(out, `r${i}`)))),
    );
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "rejected"]);
    expect((results[2] as PromiseRejectedResult).reason).toBeInstanceOf(AppleBudgetExceeded);
    expect(out).toEqual(["r1", "r2"]); // the third request was never sent
    expect(charges).toEqual([1, 2]);
  });

  it("keeps concurrent runs on the same lane separate (context survives the shared promise chain)", async () => {
    const out: string[] = [];
    const a = withAppleBudget({ limit: 1 }, async () => {
      const r = await Promise.allSettled([schedule("t-shared", 0, fake(out, "a1")), schedule("t-shared", 0, fake(out, "a2"))]);
      return { statuses: r.map((x) => x.status), state: appleBudgetState() };
    });
    const b = withAppleBudget({ limit: 3 }, async () => {
      const r = await Promise.allSettled([schedule("t-shared", 0, fake(out, "b1")), schedule("t-shared", 0, fake(out, "b2"))]);
      return { statuses: r.map((x) => x.status), state: appleBudgetState() };
    });
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.statuses).toEqual(["fulfilled", "rejected"]);
    expect(ra.state).toEqual({ used: 1, limit: 1 });
    expect(rb.statuses).toEqual(["fulfilled", "fulfilled"]);
    expect(rb.state).toEqual({ used: 2, limit: 3 });
    expect(out.sort()).toEqual(["a1", "b1", "b2"]);
    // a request scheduled after both runs ended is not charged to either
    expect(await schedule("t-shared", 0, fake(out, "free"))).toBe("free");
  });

  it("can share one counter between separate calls of the same run", async () => {
    const counter = { used: 0 };
    const out: string[] = [];
    const call = (v: string) => withAppleBudget({ limit: 2, counter }, () => schedule("t-counter", 0, fake(out, v)));
    const results = await Promise.allSettled([call("x1"), call("x2"), call("x3")]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "rejected"]);
    expect(counter.used).toBe(2);
  });

  it("refuses queued requests once the run is cancelled", async () => {
    const out: string[] = [];
    const ctl = new AbortController();
    const results = await withAppleBudget({ limit: 10, signal: ctl.signal }, () => {
      const first = schedule("t-cancel", 0, async () => {
        ctl.abort();
        out.push("first");
      });
      const second = schedule("t-cancel", 0, fake(out, "second"));
      return Promise.allSettled([first, second]);
    });
    expect(results[0].status).toBe("fulfilled");
    expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(AppleRunCancelled);
    expect(out).toEqual(["first"]);
  });
});
