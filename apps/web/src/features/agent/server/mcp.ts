/**
 * MCP adapter: the research tools for a user's own Claude Code session (Streamable HTTP, stateless).
 * Claude Code plays the planner, analyst and composer; Ranklark supplies the data, the rule checks and the
 * validator. With a runId, every call is appended to that run's event log so the page draws the graph live.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { normalize } from "@ranklark/core/metadata";
import { z } from "zod";
import { AppleRunCancelled, isAppleBudgetExceeded, withAppleBudget } from "@/server/apple/budget";
import { checkFinding } from "../lib/citations";
import {
  type AgentEvent,
  type AgentInput,
  type Finding,
  type FindingVerdict,
  type KeywordMetrics,
  type Recommendation,
  sanitizeConfig,
  TOOL_INFO,
  type ToolInputs,
  type ToolName,
} from "../lib/contract";
import { latestScores } from "../lib/reduce";
import { normalizeDraft, type RecommendationDraft, validateRecommendation } from "../lib/validate";
import { runTitle } from "./orchestrator";
import { compactFact } from "./prompts";
import { parseAgentInput } from "./run-input";
import { appendEvent, createRun, finishRun, getRunRow, listEvents, runEvidence, setRunTitle } from "./store";
import { parseToolInput, runTool, ToolInputError, type ToolOutcome } from "./tools";

export const MCP_MODEL_LABEL = "claude-code (MCP)";
/** Apple requests one data-tool call may make when it isn't part of a run. */
const RUNLESS_APPLE_LIMIT = 60;

// ------------------------------------------------------------------ per-run counters (shared by parallel calls)

type Counters = {
  fact: number;
  finding: number;
  iteration: number;
  workers: Map<number, number>;
  planned: Set<number>;
  nodes: Set<string>;
  drafts: number;
  apple: { used: number };
  scored: Set<string>;
};

declare global {
  // eslint-disable-next-line no-var
  var __mcpRunCounters: Map<string, Counters> | undefined;
}
globalThis.__mcpRunCounters ??= new Map();
const countersByRun: Map<string, Counters> = globalThis.__mcpRunCounters;

const num = (id: string) => Number(id.replace(/^\D+/, "")) || 0;

/** IDs and budgets for a run, rebuilt from its event log once per process, then kept in memory. */
function counters(runId: string): Counters {
  const hit = countersByRun.get(runId);
  if (hit) return hit;
  const c: Counters = {
    fact: 0,
    finding: 0,
    iteration: 1,
    workers: new Map(),
    planned: new Set(),
    nodes: new Set(),
    drafts: 0,
    apple: { used: 0 },
    scored: new Set(),
  };
  for (const e of listEvents(runId)) {
    if (e.type === "fact.added") {
      c.fact = Math.max(c.fact, num(e.fact.id));
      if (e.fact.kind === "keyword_score") c.scored.add(e.fact.data.term);
    } else if (e.type === "finding.added") c.finding = Math.max(c.finding, num(e.finding.id));
    else if (e.type === "iteration.finished") c.iteration = Math.max(c.iteration, e.iteration + 1);
    else if (e.type === "budget") c.apple.used = Math.max(c.apple.used, e.budget.apple.used);
    else if (e.type === "node.started") {
      c.nodes.add(e.nodeId);
      const w = e.nodeId.match(/^w-(\d+)-(\d+)$/);
      if (w) c.workers.set(Number(w[1]), Math.max(c.workers.get(Number(w[1])) ?? 0, Number(w[2])));
      const p = e.nodeId.match(/^plan-(\d+)$/);
      if (p) c.planned.add(Number(p[1]));
      const d = e.nodeId.match(/^compose(?:-(\d+))?$/);
      if (d) c.drafts = Math.max(c.drafts, d[1] ? Number(d[1]) : 1);
    }
  }
  countersByRun.set(runId, c);
  return c;
}

class McpRunError extends Error {}

function openRun(runId: string) {
  const row = getRunRow(String(runId).slice(0, 64));
  if (!row) throw new McpRunError(`Run ${String(runId).slice(0, 64)} not found. Start one with start_research_run.`);
  if (row.source !== "mcp") throw new McpRunError("That run was started from the Ranklark page, not from Claude Code.");
  if (row.status !== "running") throw new McpRunError(`Run is ${row.status}. Start a new one with start_research_run.`);
  const config = sanitizeConfig(JSON.parse(row.config_json));
  return { row, config, input: JSON.parse(row.input_json) as AgentInput, c: counters(row.id) };
}

function emit(runId: string, e: AgentEvent) {
  const c = counters(runId);
  if (e.type === "node.started") c.nodes.add(e.nodeId);
  appendEvent(runId, e);
}

function emitBudget(runId: string, c: Counters, limits: { apple: number; keywords: number }) {
  emit(runId, {
    type: "budget",
    budget: { apple: { used: c.apple.used, limit: limits.apple }, keywords: { used: c.scored.size, limit: limits.keywords } },
  });
}

/** Claude Code acts as the planner: one plan node per iteration, so worker edges have a source. */
function ensurePlanNode(runId: string, c: Counters, i: number) {
  if (c.planned.has(i)) return;
  c.planned.add(i);
  if (i > 1) emit(runId, { type: "iteration.started", iteration: i });
  emit(runId, {
    type: "node.started",
    nodeId: `plan-${i}`,
    role: "planner",
    label: "Claude Code",
    iteration: i,
    parents: i > 1 && c.nodes.has(`check-${i - 1}`) ? [`check-${i - 1}`] : [],
  });
  emit(runId, { type: "node.finished", nodeId: `plan-${i}`, summary: "Claude Code picks the tools for this round", durationMs: 0 });
}

const text = (data: unknown, isError = false): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
  ...(isError ? { isError } : {}),
});
const errorResult = (e: unknown) => text({ error: e instanceof Error ? e.message.slice(0, 400) : String(e).slice(0, 400) }, true);

// ------------------------------------------------------------------ data tools

async function dataTool(name: ToolName, args: Record<string, unknown>): Promise<CallToolResult> {
  let input: ToolInputs[ToolName];
  try {
    input = parseToolInput(name, args);
  } catch (e) {
    return errorResult(e instanceof ToolInputError ? e : new Error("Invalid input."));
  }
  const runId = typeof args.runId === "string" && args.runId ? args.runId : null;
  const payload = (out: ToolOutcome, extra: Record<string, unknown> = {}) => ({
    summary: out.summary,
    facts: out.facts.map(compactFact),
    ...(out.errors.length ? { errors: out.errors } : {}),
    ...(out.budgetExceeded ? { note: "The Apple request budget is spent; only cached answers work now." } : {}),
    ...extra,
  });

  if (!runId) {
    let n = 0;
    try {
      const out = await withAppleBudget({ limit: RUNLESS_APPLE_LIMIT }, () =>
        runTool(name, input, { nodeId: "mcp", iteration: 0, nextFactId: () => `F${++n}` }),
      );
      return text(payload(out, { note: "Not part of a run: pass runId to log facts on the Ranklark page and cite them." }));
    } catch (e) {
      return errorResult(e);
    }
  }

  let run: ReturnType<typeof openRun>;
  try {
    run = openRun(runId);
  } catch (e) {
    return errorResult(e);
  }
  const { row, config, c } = run;
  const limits = { apple: config.appleBudget, keywords: config.maxKeywords };
  const dropped: string[] = [];
  if (name === "score_keywords") {
    // the run's keyword budget: only terms not scored before count, and only as many as are left
    const si = input as ToolInputs["score_keywords"];
    const fresh = si.terms.filter((t) => !c.scored.has(t));
    const left = Math.max(0, config.maxKeywords - c.scored.size);
    const keep = new Set([...si.terms.filter((t) => c.scored.has(t)), ...fresh.slice(0, left)]);
    for (const t of si.terms) if (!keep.has(t)) dropped.push(t);
    if (!keep.size)
      return errorResult(new Error(`Keyword budget spent (${config.maxKeywords} keywords). Record findings and submit a recommendation.`));
    input = { ...si, terms: si.terms.filter((t) => keep.has(t)), appId: si.appId ?? row.app_id };
  }

  const i = c.iteration;
  ensurePlanNode(row.id, c, i);
  const k = (c.workers.get(i) ?? 0) + 1;
  c.workers.set(i, k);
  const nodeId = `w-${i}-${k}`;
  const t0 = Date.now();
  emit(row.id, {
    type: "node.started",
    nodeId,
    role: "worker",
    label: TOOL_INFO[name].label,
    iteration: i,
    parents: [`plan-${i}`],
    tool: name,
    input,
  });
  try {
    const out = await withAppleBudget({ limit: config.appleBudget, counter: c.apple }, () =>
      runTool(name, input, { nodeId, iteration: i, nextFactId: () => `F${++c.fact}` }),
    );
    for (const f of out.facts) {
      emit(row.id, { type: "fact.added", fact: f });
      if (f.kind === "keyword_score") c.scored.add(f.data.term);
      if (f.kind === "app_profile" && f.data.appId === row.app_id) setRunTitle(row.id, f.data.name);
    }
    for (const err of out.errors.slice(0, 10)) emit(row.id, { type: "node.log", nodeId, message: err });
    if (!out.facts.length && out.errors.length)
      emit(row.id, { type: "node.failed", nodeId, error: out.errors[0], durationMs: Date.now() - t0 });
    else
      emit(row.id, {
        type: "node.finished",
        nodeId,
        summary: out.summary,
        output: { facts: out.facts.map((f) => f.id), errors: out.errors },
        durationMs: Date.now() - t0,
      });
    emitBudget(row.id, c, limits);
    return text(
      payload(out, {
        ...(dropped.length ? { dropped: `Over the keyword budget, not scored: ${dropped.join(", ")}` } : {}),
        budget: {
          appleUsed: c.apple.used,
          appleLimit: config.appleBudget,
          keywordsScored: c.scored.size,
          keywordsLimit: config.maxKeywords,
        },
      }),
    );
  } catch (e) {
    const msg = isAppleBudgetExceeded(e)
      ? (e as Error).message
      : e instanceof AppleRunCancelled
        ? "Cancelled."
        : e instanceof Error
          ? e.message
          : String(e);
    emit(row.id, { type: "node.failed", nodeId, error: msg.slice(0, 400), durationMs: Date.now() - t0 });
    emitBudget(row.id, c, limits);
    return errorResult(new Error(msg));
  }
}

// ------------------------------------------------------------------ run tools

function startResearchRun(args: Record<string, unknown>, origin: string): CallToolResult {
  const parsed = parseAgentInput(args);
  if ("error" in parsed) return errorResult(new Error(parsed.error));
  const input = parsed.input;
  const config = sanitizeConfig({ maxIterations: 5, appleBudget: args.appleBudget, maxKeywords: args.maxKeywords });
  const title = runTitle(input);
  const runId = createRun({ title, appId: input.appId, country: input.country, source: "mcp", model: MCP_MODEL_LABEL, input, config });
  const c = counters(runId);
  emit(runId, { type: "run.started", runId, title, source: "mcp", input, config });
  emit(runId, { type: "iteration.started", iteration: 1 });
  ensurePlanNode(runId, c, 1);
  emitBudget(runId, c, { apple: config.appleBudget, keywords: config.maxKeywords });
  return text({
    runId,
    page: `${origin}/agent/${runId}`,
    budgets: { appleRequests: config.appleBudget, keywords: config.maxKeywords },
    next:
      input.appId != null
        ? "Call get_app_profile with this runId, then expand_keywords and score_keywords."
        : "Call expand_keywords on 1-3 seeds from the idea, then score_keywords on the best candidates.",
  });
}

const FindingIn = z.object({
  kind: z.enum(["opportunity", "risk", "insight", "drop"]),
  claim: z.string().describe("One or two sentences. Only numbers that appear in the cited facts."),
  terms: z.array(z.string()).describe("Keywords the finding is about."),
  factIds: z.array(z.string()).describe("Fact ids from this run's tool results, e.g. ['F3']."),
  confidence: z.enum(["high", "medium", "low"]),
});

function recordFindings(args: { runId: string; findings: z.infer<typeof FindingIn>[] }): CallToolResult {
  let run: ReturnType<typeof openRun>;
  try {
    run = openRun(args.runId);
  } catch (e) {
    return errorResult(e);
  }
  const { row, c } = run;
  const i = c.iteration;
  ensurePlanNode(row.id, c, i);
  const workers = Array.from({ length: c.workers.get(i) ?? 0 }, (_, k) => `w-${i}-${k + 1}`);
  const analystId = `analyst-${i}`;
  const checkId = `check-${i}`;
  const t0 = Date.now();
  emit(row.id, {
    type: "node.started",
    nodeId: analystId,
    role: "analyst",
    label: "Findings (Claude Code)",
    iteration: i,
    parents: workers.length ? workers : [`plan-${i}`],
  });
  const added: Finding[] = [];
  for (const f of (args.findings ?? []).slice(0, 20)) {
    const finding: Finding = {
      id: `N${++c.finding}`,
      iteration: i,
      nodeId: analystId,
      kind: f.kind,
      claim: String(f.claim ?? "").slice(0, 500),
      terms: [...new Set((f.terms ?? []).map((t) => normalize(String(t)).slice(0, 60)).filter(Boolean))].slice(0, 8),
      factIds: [...new Set((f.factIds ?? []).map((x) => String(x).trim().slice(0, 12)).filter(Boolean))].slice(0, 12),
      confidence: f.confidence,
    };
    added.push(finding);
    emit(row.id, { type: "finding.added", finding });
  }
  emit(row.id, {
    type: "node.finished",
    nodeId: analystId,
    summary: `${added.length} finding${added.length === 1 ? "" : "s"}`,
    durationMs: Date.now() - t0,
  });

  // rule check (there is no checker model in an MCP run): citations must exist and numbers must match them
  emit(row.id, { type: "node.started", nodeId: checkId, role: "checker", label: "Rule check", iteration: i, parents: [analystId] });
  const { facts } = runEvidence(row.id);
  const byId = new Map(facts.map((f) => [f.id, f]));
  const results = added.map((f) => {
    const r = checkFinding(f, byId);
    const verdict: FindingVerdict =
      r.verdict ??
      (r.unmatchedNumbers.length
        ? { status: "unsupported", note: `Numbers not found in the cited facts: ${r.unmatchedNumbers.join(", ")}.`, by: "rules" }
        : { status: "supported", note: "Cites existing facts and its numbers match them (rule check).", by: "rules" });
    emit(row.id, { type: "finding.checked", findingId: f.id, verdict });
    return { id: f.id, status: verdict.status, note: verdict.note };
  });
  const ok = results.filter((r) => r.status === "supported").length;
  emit(row.id, {
    type: "node.finished",
    nodeId: checkId,
    summary: `${ok}/${results.length} pass the rule check`,
    durationMs: Date.now() - t0,
  });
  emit(row.id, { type: "iteration.finished", iteration: i, converged: false, reason: "Findings recorded by Claude Code.", gaps: [] });
  c.iteration = i + 1;
  return text({
    findings: results,
    next: "Fix or drop unsupported findings (cite the right fact ids, use only numbers from those facts). Then research more, or check_metadata and submit_recommendation.",
  });
}

const KeywordIn = z.object({
  term: z.string(),
  role: z.enum(["primary", "secondary", "long_tail"]),
  placement: z.enum(["name", "subtitle", "keywords"]),
  why: z.string(),
  factIds: z.array(z.string()).describe("keyword_score fact ids for this term."),
});

async function submitRecommendation(args: {
  runId: string;
  name: string;
  subtitle: string;
  keywordField: string;
  alternatives?: { name: string; subtitle: string; why: string }[];
  keywords: z.infer<typeof KeywordIn>[];
  rationale: string;
}): Promise<CallToolResult> {
  let run: ReturnType<typeof openRun>;
  try {
    run = openRun(args.runId);
  } catch (e) {
    return errorResult(e);
  }
  const { row, config, input, c } = run;
  const i = Math.max(1, c.planned.has(c.iteration) ? c.iteration : c.iteration - 1);
  const n = ++c.drafts;
  const composeId = n === 1 ? "compose" : `compose-${n}`;
  const validateId = n === 1 ? "validate" : `validate-${n}`;
  const prev = n === 1 ? null : n === 2 ? "validate" : `validate-${n - 1}`;
  const lastWorker = c.workers.get(i) ? `w-${i}-${c.workers.get(i)}` : null;
  const parent = prev ?? [`check-${i}`, lastWorker, `plan-${i}`].find((id) => id && c.nodes.has(id)) ?? `plan-${i}`;

  const draft: RecommendationDraft = normalizeDraft({
    name: args.name,
    subtitle: args.subtitle,
    keywordField: args.keywordField,
    alternatives: args.alternatives ?? [],
    keywords: args.keywords ?? [],
    rationale: args.rationale,
  });
  const t0 = Date.now();
  emit(row.id, {
    type: "node.started",
    nodeId: composeId,
    role: "composer",
    label: n === 1 ? "Draft (Claude Code)" : `Draft ${n} (Claude Code)`,
    iteration: i,
    parents: [parent],
  });
  emit(row.id, {
    type: "node.finished",
    nodeId: composeId,
    summary: `${draft.name} · ${draft.keywords.length} keywords`,
    output: draft,
    durationMs: Date.now() - t0,
  });
  emit(row.id, {
    type: "node.started",
    nodeId: validateId,
    role: "validator",
    label: "Validate",
    iteration: i,
    parents: [composeId],
    input: { name: draft.name, subtitle: draft.subtitle, keywordField: draft.keywordField },
  });

  // coverage evidence (pure, no Apple calls), then the same validator as API runs
  const check = parseToolInput("check_metadata", {
    name: draft.name,
    subtitle: draft.subtitle,
    keywordField: draft.keywordField,
    terms: draft.keywords.map((k) => k.term),
  });
  const out = await runTool("check_metadata", check, { nodeId: validateId, iteration: i, nextFactId: () => `F${++c.fact}` });
  for (const f of out.facts) emit(row.id, { type: "fact.added", fact: f });
  const { facts } = runEvidence(row.id);
  const report = validateRecommendation(draft, facts, input);
  const errors = report.issues.filter((x) => x.level === "error").length;
  emit(row.id, {
    type: "node.finished",
    nodeId: validateId,
    summary: `${errors ? `${errors} error${errors > 1 ? "s" : ""}` : "Valid"}${report.issues.length - errors ? `, ${report.issues.length - errors} warning(s)` : ""}`,
    output: report,
    durationMs: Date.now() - t0,
  });
  emitBudget(row.id, c, { apple: config.appleBudget, keywords: config.maxKeywords });
  if (!report.ok)
    return text({ ok: false, issues: report.issues, usage: report.usage, next: "Fix every error and call submit_recommendation again." });

  const scores = latestScores(facts);
  const metrics = (term: string): KeywordMetrics | null => {
    const s = scores.get(normalize(term))?.data;
    return s
      ? {
          popularity: s.popularity,
          popSource: s.popSource,
          difficulty: s.difficulty,
          opportunity: s.opportunity,
          yourRank: s.yourRank?.rank ?? null,
          brand: s.brand,
        }
      : null;
  };
  const recommendation: Recommendation = {
    ...draft,
    keywords: draft.keywords.map((k) => ({ ...k, metrics: metrics(k.term) })),
    validation: report,
  };
  finishRun(row.id, "done", { recommendation });
  emit(row.id, { type: "run.finished", status: "done", recommendation });
  countersByRun.delete(row.id);
  return text({ ok: true, issues: report.issues, usage: report.usage, page: "The recommendation is on the run page." });
}

// ------------------------------------------------------------------ server

const INSTRUCTIONS = `Ranklark is the user's self-hosted App Store Optimization tool. Use these tools to research keywords and recommend an App Name (max 30 characters), Subtitle (max 30) and Keyword field (max 100, comma-separated, no spaces) for one app or app idea in one storefront.

Workflow: 1) start_research_run (returns runId; pass it to every other call so the user sees a live graph). 2) get_app_profile for a published app. 3) expand_keywords on 1-3 seeds, then score_keywords on the most relevant candidates (max 10 per call; the run has an Apple request budget and a keyword budget). 4) competitor_phrases for the strongest terms. 5) record_findings: claims that cite fact ids; Ranklark rule-checks every citation and number. 6) check_metadata on a draft. 7) submit_recommendation; fix any errors and resubmit until ok.

Rules: every number comes from a fact (F1, F2, ...) returned by these tools; never state a popularity, difficulty, opportunity, rank or count that isn't in a cited fact, and treat null as unknown. Popularity "hints_estimate" is Ranklark's autocomplete-based estimate; "apple_ads" is Apple data; difficulty and opportunity are Ranklark formulas. Never put other apps' names or brand keywords (brand=true) in the metadata (App Review Guideline 2.3.7). Keep the user's brand in the name when they ask. Write a natural, readable name, not a keyword list.`;

const runIdField = z
  .string()
  .optional()
  .describe("The runId from start_research_run. Without it the call isn't logged and facts can't be cited.");
const countryField = z.string().describe('Two-letter storefront code, e.g. "us".');

export function createMcpServer(origin: string): McpServer {
  const server = new McpServer({ name: "ranklark", version: "0.1.0" }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "start_research_run",
    {
      description:
        "Step 1. Start a research run for a published app (appId) or an idea. Returns runId and the page that shows the live graph.",
      inputSchema: {
        appId: z.number().int().optional().describe("App Store ID of a published app."),
        idea: z.string().optional().describe("What the app does, when it isn't published (required without appId)."),
        country: countryField,
        goal: z.enum(["new_app", "improve"]).optional(),
        seeds: z.array(z.string()).optional().describe("Starting keywords."),
        keepBrand: z.string().optional().describe("Brand word the name must keep."),
        notes: z.string().optional().describe("The user's constraints."),
        appleBudget: z.number().int().optional().describe("Apple request budget (20-600, default 200)."),
        maxKeywords: z.number().int().optional().describe("Keyword budget (5-80, default 30)."),
      },
    },
    async (args) => startResearchRun(args, origin),
  );

  server.registerTool(
    "get_app_profile",
    {
      description: `Step 2. ${TOOL_INFO.get_app_profile.description}`,
      inputSchema: { appId: z.number().int(), country: countryField, runId: runIdField },
    },
    async (args) => dataTool("get_app_profile", args),
  );
  server.registerTool(
    "expand_keywords",
    {
      description: `Step 3. ${TOOL_INFO.expand_keywords.description} deep=true probes 28 prefixes (costly).`,
      inputSchema: { seed: z.string(), country: countryField, deep: z.boolean().optional(), runId: runIdField },
    },
    async (args) => dataTool("expand_keywords", args),
  );
  server.registerTool(
    "score_keywords",
    {
      description: `Step 3. ${TOOL_INFO.score_keywords.description} Each new term uses one unit of the run's keyword budget.`,
      inputSchema: {
        terms: z.array(z.string()).describe("1-10 keywords."),
        country: countryField,
        appId: z.number().int().optional(),
        runId: runIdField,
      },
    },
    async (args) => dataTool("score_keywords", args),
  );
  server.registerTool(
    "competitor_phrases",
    {
      description: `Step 4. ${TOOL_INFO.competitor_phrases.description}`,
      inputSchema: { term: z.string(), country: countryField, runId: runIdField },
    },
    async (args) => dataTool("competitor_phrases", args),
  );
  server.registerTool(
    "record_findings",
    {
      description:
        "Step 5. Record findings (claims citing fact ids). Returns a rule-check verdict per finding: unknown fact ids or numbers missing from the cited facts are unsupported.",
      inputSchema: { runId: z.string(), findings: z.array(FindingIn).describe("At most 20.") },
    },
    async (args) => recordFindings(args),
  );
  server.registerTool(
    "check_metadata",
    {
      description: `Step 6. ${TOOL_INFO.check_metadata.description} No Apple requests.`,
      inputSchema: {
        name: z.string(),
        subtitle: z.string(),
        keywordField: z.string(),
        terms: z.array(z.string()).describe("Target keywords to check coverage for."),
        runId: runIdField,
      },
    },
    async (args) => dataTool("check_metadata", args),
  );
  server.registerTool(
    "submit_recommendation",
    {
      description:
        "Step 7. Submit the final App Name, Subtitle and Keyword field with 2-3 alternatives and the keywords used. Ranklark validates it (Apple limits, competitor names, duplicates, evidence). When ok the run finishes; otherwise fix the listed errors and resubmit.",
      inputSchema: {
        runId: z.string(),
        name: z.string(),
        subtitle: z.string(),
        keywordField: z.string().describe("Comma-separated, no spaces after commas, max 100 characters."),
        alternatives: z.array(z.object({ name: z.string(), subtitle: z.string(), why: z.string() })).optional(),
        keywords: z.array(KeywordIn),
        rationale: z.string(),
      },
    },
    async (args) => submitRecommendation(args),
  );
  return server;
}
