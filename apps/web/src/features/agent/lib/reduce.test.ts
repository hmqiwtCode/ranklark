import { describe, expect, it } from "vitest";
import { type AgentEvent, DEFAULT_CONFIG, type StoredEvent, sanitizeConfig } from "./contract";
import { applyEvent, emptyRun, estimateCost, latestScores, reduceRun } from "./reduce";

let seq = 0;
const ev = (e: AgentEvent): StoredEvent => ({ ...e, seq: ++seq, at: `2026-11-03T10:00:${String(seq).padStart(2, "0")}Z` }) as StoredEvent;

const score = (term: string, popularity: number | null) => ({
  term,
  popularity,
  popSource: "hints_estimate" as const,
  popReason: null,
  difficulty: 40,
  resultCount: 200,
  brand: false,
  opportunity: popularity == null ? null : 50,
  yourRank: null,
  top: [],
});

describe("reduceRun", () => {
  seq = 0;
  const events: StoredEvent[] = [
    ev({
      type: "run.started",
      runId: "r1",
      title: "Habit app",
      source: "api",
      input: { appId: null, country: "us", idea: "habit tracker", seeds: [], goal: "new_app", keepBrand: "", notes: "" },
      config: DEFAULT_CONFIG,
    }),
    ev({ type: "iteration.started", iteration: 1 }),
    ev({ type: "node.started", nodeId: "plan-1", role: "planner", label: "Plan", iteration: 1, parents: [] }),
    ev({
      type: "node.finished",
      nodeId: "plan-1",
      summary: "3 tasks",
      usage: { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0 },
      model: "claude-opus-5-5",
      durationMs: 1200,
    }),
    ev({ type: "node.started", nodeId: "w-1", role: "worker", label: "Score", iteration: 1, parents: ["plan-1"], tool: "score_keywords" }),
    ev({
      type: "fact.added",
      fact: {
        id: "F1",
        nodeId: "w-1",
        iteration: 1,
        summary: "x",
        sources: ["hints_estimate"],
        kind: "keyword_score",
        data: score("habit", 40),
      },
    }),
    ev({
      type: "fact.added",
      fact: {
        id: "F2",
        nodeId: "w-1",
        iteration: 1,
        summary: "x",
        sources: ["hints_estimate"],
        kind: "keyword_score",
        data: score("habit", 55),
      },
    }),
    ev({ type: "node.started", nodeId: "w-2", role: "worker", label: "Autocomplete", iteration: 1, parents: ["plan-1"] }),
    ev({ type: "node.started", nodeId: "an-1", role: "analyst", label: "Analyse", iteration: 1, parents: ["w-1"] }),
    ev({
      type: "finding.added",
      finding: {
        id: "N1",
        iteration: 1,
        nodeId: "an-1",
        kind: "opportunity",
        claim: "habit is popular",
        terms: ["habit"],
        factIds: ["F2"],
        confidence: "high",
      },
    }),
    ev({ type: "finding.checked", findingId: "N1", verdict: { status: "supported", note: "cites F2", by: "rules" } }),
    ev({ type: "iteration.finished", iteration: 1, converged: true, reason: "enough evidence", gaps: [] }),
    ev({ type: "run.finished", status: "done" }),
  ];
  const v = reduceRun(events);

  it("builds nodes with parents, facts and findings", () => {
    expect(v.runId).toBe("r1");
    expect(v.nodes.map((n) => n.id)).toEqual(["plan-1", "w-1", "w-2", "an-1"]);
    expect(v.nodes.find((n) => n.id === "w-1")?.factIds).toEqual(["F1", "F2"]);
    expect(v.nodes.find((n) => n.id === "an-1")?.findingIds).toEqual(["N1"]);
    expect(v.findings[0].verdict?.status).toBe("supported");
    expect(v.iterations).toEqual([{ n: 1, converged: true, reason: "enough evidence", gaps: [] }]);
  });

  it("sums token usage and finishes the run", () => {
    expect(v.tokens).toEqual({ input: 1000, output: 500, cacheRead: 0, cacheWrite: 0 });
    expect(v.status).toBe("done");
    // nodes that never finished are marked skipped, not left spinning
    expect(v.nodes.find((n) => n.id === "w-2")?.status).toBe("skipped");
  });

  it("ignores replayed events", () => {
    const again = applyEvent(v, events[3]);
    expect(again).toBe(v);
  });

  it("keeps the latest score per term", () => {
    expect(latestScores(v.facts).get("habit")?.data.popularity).toBe(55);
  });

  it("starts empty", () => {
    expect(emptyRun().nodes).toEqual([]);
  });
});

describe("estimateCost", () => {
  it("uses list prices", () => {
    // 1M input × $4 + 1M output × $20
    expect(estimateCost("claude-opus-5-5", { input: 1e6, output: 1e6, cacheRead: 0, cacheWrite: 0 })).toBe(24);
  });
  it("is unknown when a needed price is missing", () => {
    expect(estimateCost("claude-haiku-5-5", { input: 10, output: 10, cacheRead: 5, cacheWrite: 0 })).toBeNull();
    expect(estimateCost("some-other-model", { input: 10, output: 10, cacheRead: 0, cacheWrite: 0 })).toBeNull();
  });
});

describe("sanitizeConfig", () => {
  it("clamps and falls back to defaults", () => {
    expect(sanitizeConfig({ model: "gpt", effort: "turbo", maxIterations: 99, appleBudget: -5, maxKeywords: "x" })).toEqual({
      ...DEFAULT_CONFIG,
      maxIterations: 5,
      appleBudget: 20,
    });
  });
});
