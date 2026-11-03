import { opportunity } from "@ranklark/core/scoring";
import { describe, expect, it } from "vitest";
import { isAppleBudgetExceeded } from "@/server/apple/budget";
import { schedule } from "@/server/apple/queue";
import { type AgentConfig, type AgentEvent, type AgentInput, DEFAULT_CONFIG, type Fact, type StoredEvent } from "../lib/contract";
import { reduceRun } from "../lib/reduce";
import { type AgentLlm, type LlmCall, LlmError } from "./llm";
import { createScriptedLlm } from "./llm-scripted";
import { runAgentLoop } from "./loop";
import type { ComposerOutputT } from "./prompts";
import type { ToolContext, ToolOutcome, ToolRunner } from "./tools";

const APP = 1438388363;
const input: AgentInput = { appId: APP, country: "us", idea: "", seeds: ["habit tracker"], goal: "improve", keepBrand: "", notes: "" };
const config: AgentConfig = { ...DEFAULT_CONFIG, maxIterations: 3, appleBudget: 200, maxKeywords: 20 };

/** Deterministic Apple-free tools. Each scored term costs one "Apple request" through the real queue + budget. */
function fakeTools(opts: { hang?: boolean; slowScore?: number } = {}): ToolRunner & { calls: string[] } {
  const calls: string[] = [];
  const mk = (ctx: ToolContext, kind: Fact["kind"], data: unknown, summary: string): Fact =>
    ({ id: ctx.nextFactId(), nodeId: ctx.nodeId, iteration: ctx.iteration, summary, sources: ["ranklark_formula"], kind, data }) as Fact;
  const run = (async (name: string, raw: unknown, ctx: ToolContext): Promise<ToolOutcome> => {
    calls.push(name);
    const input = raw as Record<string, never>;
    // a worker stuck in an in-flight request: it ignores the abort and settles later
    if (opts.slowScore && name === "score_keywords") await new Promise((r) => setTimeout(r, opts.slowScore));
    else if (opts.hang && name !== "get_app_profile") {
      await new Promise((_, reject) => ctx.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    }
    switch (name) {
      case "get_app_profile":
        return {
          facts: [
            mk(
              ctx,
              "app_profile",
              {
                appId: APP,
                name: "Habit Tracker",
                subtitle: null,
                seller: "Acme",
                genre: "Health & Fitness",
                rating: 4.6,
                ratingCount: 900,
                descriptionExcerpt: "Track habits.",
                keywordsField: null,
                trackedTerms: [],
              },
              "Habit Tracker by Acme",
            ),
          ],
          summary: "Habit Tracker by Acme",
          errors: [],
          budgetExceeded: false,
        };
      case "expand_keywords": {
        const seed = input.seed as string;
        const items = ["daily", "routine", "planner", "goals", "streak", "app"].map((w, i) => ({
          term: `${seed} ${w}`,
          position: i + 1,
          prefix: seed,
        }));
        return {
          facts: [mk(ctx, "suggestions", { seed, items }, `${items.length} suggestions`)],
          summary: "ok",
          errors: [],
          budgetExceeded: false,
        };
      }
      case "score_keywords": {
        const facts: Fact[] = [];
        const errors: string[] = [];
        let budgetExceeded = false;
        for (const term of input.terms as string[]) {
          try {
            await schedule("fake-apple", 0, async () => 1);
          } catch (e) {
            if (isAppleBudgetExceeded(e)) budgetExceeded = true;
            errors.push(`${term}: ${(e as Error).message}`);
            continue;
          }
          const popularity = 30 + ((term.length * 7) % 50);
          const difficulty = 20 + ((term.length * 13) % 60);
          const brand = term === "streaks";
          facts.push(
            mk(
              ctx,
              "keyword_score",
              {
                term,
                popularity,
                popSource: "hints_estimate",
                popReason: null,
                difficulty,
                resultCount: 200,
                brand,
                opportunity: brand ? null : opportunity(popularity, difficulty, null),
                yourRank: { rank: 40, approx: true },
                top: [{ id: 5, name: "Streaks: Habit Tracker", subtitle: null, rating: 4.8, ratingCount: 50000 }],
              },
              `"${term}" scored`,
            ),
          );
        }
        return { facts, summary: `Scored ${facts.length}`, errors, budgetExceeded };
      }
      case "competitor_phrases":
        return {
          facts: [mk(ctx, "competitor_phrases", { term: input.term, phrases: [{ phrase: "habit tracker", apps: 4 }] }, "phrases")],
          summary: "ok",
          errors: [],
          budgetExceeded: false,
        };
      default:
        return {
          facts: [
            mk(
              ctx,
              "metadata_check",
              {
                name: "",
                subtitle: "",
                keywordField: "",
                issues: [],
                usage: { name: 0, subtitle: 0, keywords: 0, keywordBytes: 0 },
                coverage: [],
              },
              "check",
            ),
          ],
          summary: "ok",
          errors: [],
          budgetExceeded: false,
        };
    }
  }) as ToolRunner & { calls: string[] };
  run.calls = calls;
  return run;
}

/** Wraps the scripted model so a test can replace one role's answer or make it throw. */
function llmWith(override: (req: LlmCall<unknown>, n: number) => unknown | undefined): AgentLlm {
  const base = createScriptedLlm();
  const counts: Record<string, number> = {};
  return {
    model: "test",
    async call<T>(req: LlmCall<T>) {
      counts[req.role] = (counts[req.role] ?? 0) + 1;
      const o = override(req as LlmCall<unknown>, counts[req.role]);
      if (o instanceof Error) throw o;
      if (o !== undefined)
        return { output: req.schema.parse(o), usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 }, model: "test" };
      return base.call(req);
    },
  };
}

async function run(opts: {
  llm?: AgentLlm;
  tools?: ToolRunner;
  config?: Partial<AgentConfig>;
  input?: Partial<AgentInput>;
  ctl?: AbortController;
  onEvent?: (e: AgentEvent) => void;
}) {
  const events: StoredEvent[] = [];
  const ctl = opts.ctl ?? new AbortController();
  let finished: unknown = null;
  const result = await runAgentLoop({
    runId: "r1",
    title: "Test",
    source: "api",
    input: { ...input, ...opts.input },
    config: { ...config, ...opts.config },
    llm: opts.llm ?? createScriptedLlm(),
    tools: opts.tools ?? fakeTools(),
    emit: (e) => {
      events.push({ ...e, seq: events.length + 1, at: new Date().toISOString() } as StoredEvent);
      opts.onEvent?.(e);
    },
    signal: ctl.signal,
    finish: (r) => {
      finished = r;
    },
  });
  return { result, events, view: reduceRun(events), finished };
}

describe("research loop", () => {
  it("converges, composes a valid recommendation and draws a correct graph", async () => {
    const { result, events, view, finished } = await run({});
    expect(result.status).toBe("done");
    expect(finished).toEqual(result);
    expect(events[0].type).toBe("run.started");
    expect(events.at(-1)?.type).toBe("run.finished");

    // the scripted checker converges after two iterations
    expect(view.iterations.map((i) => [i.n, i.converged])).toEqual([
      [1, false],
      [2, true],
    ]);
    const ids = view.nodes.map((n) => n.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "profile",
        "plan-1",
        "w-1-1",
        "analyst-1",
        "check-1",
        "plan-2",
        "analyst-2",
        "check-2",
        "compose",
        "validate",
      ]),
    );
    expect(ids).not.toContain("compose-2");
    const node = (id: string) => view.nodes.find((n) => n.id === id)!;
    expect(node("plan-1").parents).toEqual(["profile"]);
    expect(node("plan-2").parents).toEqual(["check-1"]);
    expect(node("w-1-1").parents).toEqual(["plan-1"]);
    expect(node("analyst-1").parents.every((p) => p.startsWith("w-1-"))).toBe(true);
    expect(node("check-1").parents).toEqual(["analyst-1"]);
    expect(node("compose").parents).toEqual(["check-2"]);
    expect(node("validate").parents).toEqual(["compose"]);
    expect(view.nodes.every((n) => n.status === "done")).toBe(true);

    // facts are numbered per run and owned by their worker; findings all got a verdict
    expect(view.facts.map((f) => f.id)).toEqual(view.facts.map((_, i) => `F${i + 1}`));
    expect(view.findings.length).toBeGreaterThan(0);
    expect(view.findings.every((f) => f.verdict)).toBe(true);
    expect(view.budget?.keywords.used).toBeGreaterThan(0);

    const rec = view.recommendation!;
    expect(rec.validation.ok).toBe(true);
    expect([...rec.name].length).toBeLessThanOrEqual(30);
    expect(rec.keywordField).not.toMatch(/,\s/);
    // every scored term shares "habit tracker", yet the subtitle doesn't repeat name words
    expect(rec.validation.issues.map((i) => i.rule)).not.toContain("subtitle.repeats_name");
    expect(rec.subtitle).not.toBe("");
    // metrics are attached by code from the facts, never by the model
    for (const k of rec.keywords) {
      const f = view.facts.find((x) => x.kind === "keyword_score" && x.data.term === k.term);
      expect(f).toBeTruthy();
      if (f?.kind === "keyword_score") expect(k.metrics?.opportunity).toBe(f.data.opportunity);
    }
    // the brand keyword never makes it into the metadata
    expect(`${rec.name} ${rec.subtitle} ${rec.keywordField}`.toLowerCase()).not.toContain("streaks");
  });

  it("stops on the Apple budget and still composes from the evidence", async () => {
    // two seeds are scored in iteration 1, but only one Apple request is allowed
    const { result, view } = await run({ config: { appleBudget: 1 }, input: { seeds: ["habit tracker", "habit journal"] } });
    expect(result.status).toBe("done");
    expect(view.budget?.apple).toEqual({ used: 1, limit: 1 });
    expect(view.iterations).toHaveLength(1); // stopped before the checker's second round
    expect(view.iterations[0].reason).toContain("Apple request budget spent");
    expect(view.facts.filter((f) => f.kind === "keyword_score")).toHaveLength(1);
    const scoreNode = view.nodes.find((n) => n.tool === "score_keywords")!;
    expect(scoreNode.logs.join(" ")).toContain("Apple request budget spent");
    expect(view.recommendation).not.toBeNull();
  });

  it("stops when the keyword budget is spent", async () => {
    const { result, view } = await run({ config: { maxKeywords: 1 } });
    expect(result.status).toBe("done");
    expect(view.budget?.keywords).toEqual({ used: 1, limit: 1 });
    expect(view.iterations).toHaveLength(1);
  });

  it("takes the repair path once when the first draft breaks a rule", async () => {
    const bad: ComposerOutputT = {
      name: "Habit Tracker Daily Routine Planner Pro",
      subtitle: "Streaks for your goals",
      keywordField: "goals, routine",
      alternatives: [],
      keywords: [{ term: "habit tracker", role: "primary", placement: "name", why: "x", factIds: ["F999"] }],
      rationale: "first try",
    };
    const llm = llmWith((req, n) => (req.role === "composer" && n === 1 ? bad : undefined));
    const { result, view } = await run({ llm });
    expect(result.status).toBe("done");
    const ids = view.nodes.map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining(["compose", "validate", "compose-2", "validate-2"]));
    const first = view.nodes.find((n) => n.id === "validate")!.output as { ok: boolean; issues: { rule: string }[] };
    expect(first.ok).toBe(false);
    expect(first.issues.map((i) => i.rule)).toEqual(
      expect.arrayContaining(["name.length", "brand.competitor_name", "keyword.unknown_fact"]),
    );
    expect(view.nodes.find((n) => n.id === "compose-2")?.parents).toEqual(["validate"]);
    expect(view.recommendation?.validation.ok).toBe(true);
    expect(view.recommendation?.rationale).not.toBe("first try");
  });

  it("rejects findings by rules before the checker model sees them", async () => {
    const llm = llmWith((req, n) =>
      req.role === "analyst" && n === 1
        ? {
            findings: [
              { kind: "opportunity", claim: "habit tracker is great", terms: ["habit tracker"], factIds: [], confidence: "high" },
              { kind: "opportunity", claim: "huge demand", terms: [], factIds: ["F404"], confidence: "high" },
              {
                kind: "opportunity",
                claim: "habit tracker has popularity 99",
                terms: ["habit tracker"],
                factIds: ["F2"],
                confidence: "high",
              },
            ],
          }
        : undefined,
    );
    const { view } = await run({ llm });
    const [a, b, c] = view.findings;
    expect(a.verdict).toMatchObject({ status: "unsupported", by: "rules" });
    expect(b.verdict).toMatchObject({ status: "unsupported", by: "rules" });
    // a number missing from the cited fact goes to the checker, which (scripted) marks it unsupported
    expect(c.verdict).toMatchObject({ status: "unsupported", by: "checker" });
  });

  it("handles cancel: aborts in-flight work and finishes as cancelled", async () => {
    const ctl = new AbortController();
    const { result, view } = await run({
      ctl,
      tools: fakeTools({ hang: true }),
      onEvent: (e) => {
        if (e.type === "node.started" && e.role === "worker" && e.nodeId !== "profile") setTimeout(() => ctl.abort(), 5);
      },
    });
    expect(result.status).toBe("cancelled");
    expect(view.status).toBe("cancelled");
    expect(view.recommendation).toBeNull();
    expect(view.nodes.some((n) => n.id === "compose")).toBe(false);
    expect(view.nodes.filter((n) => n.status === "running")).toEqual([]);
  });

  it("emits nothing after run.finished, even when a worker settles after the cancel", async () => {
    const ctl = new AbortController();
    const { result, events } = await run({
      ctl,
      tools: fakeTools({ hang: true, slowScore: 40 }),
      onEvent: (e) => {
        if (e.type === "node.started" && e.role === "worker" && e.nodeId !== "profile") setTimeout(() => ctl.abort(), 5);
      },
    });
    expect(result.status).toBe("cancelled");
    await new Promise((r) => setTimeout(r, 80)); // the slow score worker has settled by now
    expect(events.at(-1)?.type).toBe("run.finished");
    expect(events.filter((e) => e.type === "run.finished")).toHaveLength(1);
  });

  it("survives a refusal in the loop: the step fails and the run composes from the evidence", async () => {
    const llm = llmWith((req, n) =>
      req.role === "analyst" && n === 2 ? new LlmError("refusal", "Claude declined the analyst step.") : undefined,
    );
    const { result, view } = await run({ llm });
    expect(result.status).toBe("done");
    expect(view.nodes.find((n) => n.id === "analyst-2")).toMatchObject({ status: "failed", error: "Claude declined the analyst step." });
    expect(view.iterations.at(-1)?.reason).toContain("Research stopped early");
    expect(view.nodes.find((n) => n.id === "compose")?.parents).toEqual(["plan-2"]);
    expect(view.recommendation).not.toBeNull();
  });

  it("fails the run when the composer refuses", async () => {
    const llm = llmWith((req) =>
      req.role === "composer" ? new LlmError("refusal", "Claude declined the composer step (category: general_harms).") : undefined,
    );
    const { result, view } = await run({ llm });
    expect(result).toMatchObject({ status: "failed", error: "Claude declined the composer step (category: general_harms)." });
    expect(view.status).toBe("failed");
    expect(view.error).toContain("declined");
  });

  it("stops immediately on a bad key without composing", async () => {
    const llm = llmWith((req) => (req.role === "planner" ? new LlmError("auth", "Claude rejected the API key (401).") : undefined));
    const { result, view } = await run({ llm });
    expect(result.status).toBe("failed");
    expect(result.error).toContain("401");
    expect(view.nodes.some((n) => n.role === "composer")).toBe(false);
  });

  it("records an idea node when there is no app, and fails clearly with no evidence", async () => {
    const tools = (async (name, inp, ctx) => {
      if (name === "check_metadata") return fakeTools()(name, inp, ctx);
      return { facts: [], summary: "nothing", errors: ["NeedsExtension"], budgetExceeded: false };
    }) as ToolRunner;
    const { result, view } = await run({ tools, input: { appId: null, idea: "A calm habit tracker for students", seeds: [] } });
    expect(view.nodes[0]).toMatchObject({ id: "profile", label: "Your idea", status: "done" });
    expect(result.status).toBe("failed");
    expect(result.error).toContain("No keyword could be scored");
  });
});
