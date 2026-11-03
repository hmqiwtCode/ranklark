/**
 * The research loop (spec §3): profile → [planner → workers → analyst → checker] × N → composer → validator.
 * Code owns the loop, budgets and data; the model owns judgment. Everything is injected (model, tools, event
 * sink), so the loop runs in tests without a DB, the network or an API key.
 */
import { normalize } from "@ranklark/core/metadata";
import { AppleRunCancelled, isAppleBudgetExceeded, withAppleBudget } from "@/server/apple/budget";
import { checkFinding } from "../lib/citations";
import {
  type AgentConfig,
  type AgentEvent,
  type AgentInput,
  type AgentRole,
  type AppProfileData,
  type Fact,
  type Finding,
  type FindingVerdict,
  type KeywordMetrics,
  type Recommendation,
  type RunSource,
  SCORE_BATCH,
  TOOL_INFO,
  type TokenUsage,
  type ToolInputs,
  type ToolName,
  type ValidationReport,
} from "../lib/contract";
import { latestScores } from "../lib/reduce";
import { normalizeDraft, type RecommendationDraft, validateRecommendation } from "../lib/validate";
import { type AgentLlm, LlmError } from "./llm";
import {
  AnalystOutput,
  analystPrompt,
  type Budgets,
  CheckerOutput,
  ComposerOutput,
  type ComposerOutputT,
  checkerPrompt,
  composerPrompt,
  PLANNER_TOOLS,
  PlannerOutput,
  type PlannerOutputT,
  plannerPrompt,
  SYSTEM_PROMPTS,
} from "./prompts";
import { cleanTermList, parseTerm } from "./tool-input";
import type { ToolOutcome, ToolRunner } from "./tools";

export const MAX_TASKS_PER_ITERATION = 6;
const MAX_FINDINGS_PER_ITERATION = 8;
/** expand_keywords deep=true probes 28 prefixes; only allowed with this much Apple budget left. */
const DEEP_EXPAND_MIN_BUDGET = 60;

export type LoopResult = { status: "done" | "failed" | "cancelled"; recommendation?: Recommendation; error?: string };

export type LoopDeps = {
  runId: string;
  title: string;
  source: RunSource;
  input: AgentInput;
  config: AgentConfig;
  llm: AgentLlm;
  tools: ToolRunner;
  /** Persists and publishes an event. */
  emit: (e: AgentEvent) => void;
  signal: AbortSignal;
  /** Called with the app profile once it is known (e.g. to retitle the run). */
  onProfile?: (p: AppProfileData) => void;
  /** Persist the outcome; called right before run.finished is emitted. */
  finish?: (r: LoopResult) => void;
};

/** A run-ending problem with a message meant for the user. */
export class RunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunError";
  }
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 400);
const isCancel = (e: unknown, signal: AbortSignal) =>
  signal.aborted || e instanceof AppleRunCancelled || (e instanceof LlmError && e.kind === "aborted");
const isFatal = (e: unknown, signal: AbortSignal) => isCancel(e, signal) || (e instanceof LlmError && e.fatal);

type NodeSpec = { id: string; role: AgentRole; label: string; iteration: number; parents: string[]; tool?: ToolName; input?: unknown };
type NodeDone<T> = { value: T; summary: string; output?: unknown; thinking?: string; usage?: TokenUsage; model?: string };
type Task =
  | { tool: "expand_keywords"; input: ToolInputs["expand_keywords"]; why: string }
  | { tool: "score_keywords"; input: ToolInputs["score_keywords"]; why: string }
  | { tool: "competitor_phrases"; input: ToolInputs["competitor_phrases"]; why: string };

export async function runAgentLoop(d: LoopDeps): Promise<LoopResult> {
  const { input, config, llm, signal } = d;
  const country = input.country;
  // nothing may follow run.finished: on cancel, sibling workers can settle after the run has ended
  let closed = false;
  const emit = (e: AgentEvent) => {
    if (!closed) d.emit(e);
  };

  // ---------------------------------------------------------------- run state
  const facts: Fact[] = [];
  const factById = new Map<string, Fact>();
  const findings: Finding[] = [];
  let factSeq = 0;
  let findingSeq = 0;
  const attempted = new Set<string>(); // distinct terms sent to score_keywords (the keyword budget)
  const expanded = new Set<string>();
  const phrased = new Set<string>();
  let appleUsed = 0;
  let appleSpent = false;
  let profile: AppProfileData | null = null;

  const budgets = (): Budgets => ({
    appleUsed,
    appleLimit: config.appleBudget,
    keywordsUsed: attempted.size,
    keywordsLimit: config.maxKeywords,
  });
  const emitBudget = () =>
    emit({
      type: "budget",
      budget: { apple: { used: appleUsed, limit: config.appleBudget }, keywords: { used: attempted.size, limit: config.maxKeywords } },
    });
  const throwIfCancelled = () => {
    if (signal.aborted) throw new AppleRunCancelled();
  };

  function addFacts(list: Fact[]) {
    for (const f of list) {
      facts.push(f);
      factById.set(f.id, f);
      if (f.kind === "app_profile" && (input.appId == null || f.data.appId === input.appId)) profile ??= f.data;
      emit({ type: "fact.added", fact: f });
    }
  }

  function setVerdict(f: Finding, verdict: FindingVerdict) {
    f.verdict = verdict;
    emit({ type: "finding.checked", findingId: f.id, verdict });
  }

  /** One graph node: started → (work) → finished | failed, then a budget update. */
  async function node<T>(spec: NodeSpec, fn: () => Promise<NodeDone<T>>): Promise<T> {
    const t0 = Date.now();
    emit({
      type: "node.started",
      nodeId: spec.id,
      role: spec.role,
      label: spec.label,
      iteration: spec.iteration,
      parents: spec.parents,
      tool: spec.tool,
      input: spec.input,
    });
    try {
      const r = await fn();
      emit({
        type: "node.finished",
        nodeId: spec.id,
        summary: r.summary,
        output: r.output,
        thinking: r.thinking,
        usage: r.usage,
        model: r.model,
        durationMs: Date.now() - t0,
      });
      return r.value;
    } catch (e) {
      emit({ type: "node.failed", nodeId: spec.id, error: isCancel(e, signal) ? "Cancelled." : errMsg(e), durationMs: Date.now() - t0 });
      throw e;
    } finally {
      emitBudget();
    }
  }

  const toolCtx = (nodeId: string, iteration: number) => ({ nodeId, iteration, nextFactId: () => `F${++factSeq}`, signal });

  // ---------------------------------------------------------------- steps

  async function runProfile() {
    if (input.appId != null) {
      const appId = input.appId;
      try {
        await node(
          {
            id: "profile",
            role: "worker",
            label: TOOL_INFO.get_app_profile.label,
            iteration: 0,
            parents: [],
            tool: "get_app_profile",
            input: { appId, country },
          },
          async () => {
            const out = await d.tools("get_app_profile", { appId, country }, toolCtx("profile", 0));
            addFacts(out.facts);
            return { value: out, summary: out.summary, output: { facts: out.facts.map((f) => f.id) } };
          },
        );
      } catch (e) {
        if (isCancel(e, signal)) throw e;
        if (isAppleBudgetExceeded(e)) appleSpent = true;
        // without the listing there's nothing to research unless the user gave an idea or seeds
        if (!input.idea && !input.seeds.length) throw new RunError(`Couldn't read app ${appId}: ${errMsg(e)}`);
      }
      if (profile) d.onProfile?.(profile);
    } else {
      await node(
        {
          id: "profile",
          role: "worker",
          label: "Your idea",
          iteration: 0,
          parents: [],
          input: { idea: input.idea.slice(0, 300), seeds: input.seeds },
        },
        async () => ({
          value: null,
          summary: `Idea: ${input.idea.slice(0, 140)}${input.idea.length > 140 ? "…" : ""}`,
          output: { idea: input.idea, seeds: input.seeds },
        }),
      );
    }
  }

  /** A seed to start from when the planner proposes nothing usable in the first iteration. */
  function fallbackSeed(): string | null {
    const candidates = [
      ...input.seeds,
      profile ? (profile.name.split(/\s*[:|]\s*|\s+[-–—]\s+/)[1] ?? profile.name) : "",
      input.idea.split(/\s+/).slice(0, 3).join(" "),
    ];
    for (const c of candidates) {
      try {
        return parseTerm(c, "seed");
      } catch {
        /* try the next */
      }
    }
    return null;
  }

  /** Validate the planner's tasks: allowed tools, clean terms, no repeats, within the keyword budget. */
  function acceptTasks(plan: PlannerOutputT, iteration: number): { tasks: Task[]; dropped: string[] } {
    const tasks: Task[] = [];
    const dropped: string[] = [];
    const appleLeft = config.appleBudget - appleUsed;
    for (const t of plan.tasks ?? []) {
      if (tasks.length >= MAX_TASKS_PER_ITERATION) {
        dropped.push(`${t.tool}: more than ${MAX_TASKS_PER_ITERATION} tasks`);
        continue;
      }
      if (!PLANNER_TOOLS.includes(t.tool)) {
        dropped.push(`${String(t.tool).slice(0, 30)}: not a planner tool`);
        continue;
      }
      const why = String(t.why ?? "").slice(0, 200);
      if (t.tool === "score_keywords") {
        const left = config.maxKeywords - attempted.size;
        const fresh = cleanTermList(t.terms, 50).filter((x) => !attempted.has(x));
        const take = fresh.slice(0, Math.min(SCORE_BATCH, Math.max(0, left)));
        if (!take.length) {
          dropped.push(left <= 0 ? "score_keywords: keyword budget spent" : "score_keywords: every term already scored");
          continue;
        }
        if (take.length < fresh.length)
          dropped.push(`score_keywords: ${fresh.length - take.length} term(s) over the batch or keyword budget`);
        for (const x of take) attempted.add(x); // reserved now so parallel tasks can't double-spend the budget
        tasks.push({ tool: "score_keywords", input: { terms: take, country, appId: input.appId }, why });
        continue;
      }
      let term: string;
      try {
        term = parseTerm(t.terms?.[0], t.tool === "expand_keywords" ? "seed" : "term");
      } catch (e) {
        dropped.push(`${t.tool}: ${errMsg(e)}`);
        continue;
      }
      if (t.tool === "expand_keywords") {
        if (expanded.has(term)) {
          dropped.push(`expand_keywords: "${term}" already expanded`);
          continue;
        }
        expanded.add(term);
        const deep = t.deep === true && appleLeft >= DEEP_EXPAND_MIN_BUDGET;
        if (t.deep && !deep) dropped.push(`expand_keywords "${term}": deep probe skipped (Apple budget too small)`);
        tasks.push({ tool: "expand_keywords", input: { seed: term, country, deep }, why });
      } else {
        if (phrased.has(term)) {
          dropped.push(`competitor_phrases: "${term}" already done`);
          continue;
        }
        phrased.add(term);
        tasks.push({ tool: "competitor_phrases", input: { term, country }, why });
      }
    }
    if (!tasks.length && iteration === 1) {
      const seed = fallbackSeed();
      if (seed && !expanded.has(seed)) {
        expanded.add(seed);
        tasks.push({ tool: "expand_keywords", input: { seed, country, deep: false }, why: "Fallback: the plan had no usable task" });
      }
    }
    return { tasks, dropped };
  }

  const taskLabel = (t: Task) =>
    `${TOOL_INFO[t.tool].label}: ${t.tool === "score_keywords" ? `${t.input.terms.length} term${t.input.terms.length > 1 ? "s" : ""}` : t.tool === "expand_keywords" ? t.input.seed : t.input.term}`;

  async function runWorker(t: Task, id: string, iteration: number, parent: string) {
    try {
      await node(
        { id, role: "worker", label: taskLabel(t), iteration, parents: [parent], tool: t.tool, input: { ...t.input, why: t.why } },
        async () => {
          const out: ToolOutcome = await d.tools(t.tool, t.input as never, toolCtx(id, iteration));
          addFacts(out.facts);
          if (out.budgetExceeded) appleSpent = true;
          for (const err of out.errors.slice(0, 10)) emit({ type: "node.log", nodeId: id, message: err });
          if (!out.facts.length && out.errors.length) throw new Error(out.errors[0]);
          return { value: out, summary: out.summary, output: { facts: out.facts.map((f) => f.id), errors: out.errors } };
        },
      );
    } catch (e) {
      if (isCancel(e, signal)) throw e;
      if (isAppleBudgetExceeded(e)) appleSpent = true;
      // a failed worker is shown on the graph; the run goes on with the rest of the evidence
    }
  }

  async function runPlanner(i: number, parent: string, gaps: string[]): Promise<Task[]> {
    const data = {
      iteration: i,
      maxIterations: config.maxIterations,
      input,
      profile,
      facts,
      findings,
      gaps,
      scoredTerms: [...attempted],
      expandedSeeds: [...expanded],
      budgets: budgets(),
    };
    return node(
      {
        id: `plan-${i}`,
        role: "planner",
        label: "Plan",
        iteration: i,
        parents: [parent],
        input: { iteration: i, facts: facts.length, keywordsScored: attempted.size, gaps, budgets: budgets() },
      },
      async () => {
        const res = await llm.call({
          role: "planner",
          system: SYSTEM_PROMPTS.planner,
          user: plannerPrompt(data),
          data,
          schema: PlannerOutput,
          signal,
        });
        const { tasks, dropped } = acceptTasks(res.output, i);
        return {
          value: tasks,
          summary: `${tasks.length} task${tasks.length === 1 ? "" : "s"}${dropped.length ? `, ${dropped.length} dropped` : ""}`,
          output: {
            hypotheses: (res.output.hypotheses ?? []).slice(0, 5),
            tasks: tasks.map((t) => ({ tool: t.tool, input: t.input, why: t.why })),
            dropped,
          },
          thinking: res.thinking,
          usage: res.usage,
          model: res.model,
        };
      },
    );
  }

  async function runAnalyst(i: number, parents: string[]): Promise<Finding[]> {
    const previous = [...findings];
    const data = { iteration: i, input, profile, facts, previous };
    return node(
      {
        id: `analyst-${i}`,
        role: "analyst",
        label: "Analyse",
        iteration: i,
        parents,
        input: { facts: facts.length, previousFindings: previous.length },
      },
      async () => {
        const res = await llm.call({
          role: "analyst",
          system: SYSTEM_PROMPTS.analyst,
          user: analystPrompt(data),
          data,
          schema: AnalystOutput,
          signal,
        });
        const added: Finding[] = [];
        for (const f of (res.output.findings ?? []).slice(0, MAX_FINDINGS_PER_ITERATION)) {
          const finding: Finding = {
            id: `N${++findingSeq}`,
            iteration: i,
            nodeId: `analyst-${i}`,
            kind: ["opportunity", "risk", "insight", "drop"].includes(f.kind) ? f.kind : "insight",
            claim: String(f.claim ?? "").slice(0, 500),
            terms: [...new Set((f.terms ?? []).map((t) => normalize(String(t)).slice(0, 60)).filter(Boolean))].slice(0, 8),
            factIds: [...new Set((f.factIds ?? []).map((x) => String(x).trim().slice(0, 12)).filter(Boolean))].slice(0, 12),
            confidence: ["high", "medium", "low"].includes(f.confidence) ? f.confidence : "low",
          };
          findings.push(finding);
          added.push(finding);
          emit({ type: "finding.added", finding });
        }
        return {
          value: added,
          summary: `${added.length} finding${added.length === 1 ? "" : "s"}`,
          output: { findings: added.map((f) => f.id) },
          thinking: res.thinking,
          usage: res.usage,
          model: res.model,
        };
      },
    );
  }

  async function runChecker(i: number, fresh: Finding[]): Promise<{ converged: boolean; reason: string; gaps: string[] }> {
    return node(
      { id: `check-${i}`, role: "checker", label: "Check", iteration: i, parents: [`analyst-${i}`], input: { findings: fresh.length } },
      async () => {
        // rules first: citations must exist; numbers must appear in the cited facts (or be ruled on by the model)
        const items: { finding: Finding; unmatchedNumbers: string[] }[] = [];
        let rejected = 0;
        for (const f of fresh) {
          const r = checkFinding(f, factById);
          if (r.verdict) {
            setVerdict(f, r.verdict);
            rejected++;
          } else items.push({ finding: f, unmatchedNumbers: r.unmatchedNumbers });
        }
        const cited = new Set(items.flatMap((x) => x.finding.factIds));
        const data = {
          iteration: i,
          maxIterations: config.maxIterations,
          input,
          items,
          citedFacts: facts.filter((f) => cited.has(f.id)),
          supportedSoFar: findings.filter((f) => f.verdict?.status === "supported" && !fresh.includes(f)),
          scoredCount: facts.filter((f) => f.kind === "keyword_score").length,
          budgets: budgets(),
        };
        const res = await llm.call({
          role: "checker",
          system: SYSTEM_PROMPTS.checker,
          user: checkerPrompt(data),
          data,
          schema: CheckerOutput,
          signal,
        });
        const byId = new Map(items.map((x) => [x.finding.id, x.finding]));
        for (const v of res.output.verdicts ?? []) {
          const f = byId.get(v.findingId);
          if (!f || f.verdict) continue;
          const status = ["supported", "unsupported", "needs_data"].includes(v.status) ? v.status : "needs_data";
          setVerdict(f, { status, note: String(v.note ?? "").slice(0, 300), by: "checker" });
        }
        for (const f of byId.values())
          if (!f.verdict) setVerdict(f, { status: "needs_data", note: "The checker gave no verdict.", by: "checker" });

        let converged = res.output.converged === true;
        let reason = String(res.output.reason ?? "").slice(0, 300);
        const gaps = (res.output.gaps ?? []).map((g) => String(g).slice(0, 200)).slice(0, 5);
        // guard: nothing scored yet while budgets and iterations remain → keep researching
        const scored = facts.some((f) => f.kind === "keyword_score");
        if (converged && !scored && !appleSpent && attempted.size < config.maxKeywords && i < config.maxIterations) {
          converged = false;
          reason = "No keyword has been scored yet.";
          if (!gaps.length) gaps.push("Score candidate keywords for the app's core use case.");
        }
        const count = (s: string) => fresh.filter((f) => f.verdict?.status === s).length;
        return {
          value: { converged, reason, gaps },
          summary: `${count("supported")} supported, ${count("unsupported")} unsupported, ${count("needs_data")} need data · ${converged ? "converged" : "continue"}`,
          output: { converged, reason, gaps, rulesRejected: rejected },
          thinking: res.thinking,
          usage: res.usage,
          model: res.model,
        };
      },
    );
  }

  function metricsFor(term: string): KeywordMetrics | null {
    const f = latestScores(facts).get(normalize(term));
    if (!f) return null;
    const s = f.data;
    return {
      popularity: s.popularity,
      popSource: s.popSource,
      difficulty: s.difficulty,
      opportunity: s.opportunity,
      yourRank: s.yourRank?.rank ?? null,
      brand: s.brand,
    };
  }

  const toDraft = (o: ComposerOutputT): RecommendationDraft =>
    normalizeDraft({
      name: o.name,
      subtitle: o.subtitle,
      keywordField: o.keywordField,
      alternatives: o.alternatives ?? [],
      keywords: (o.keywords ?? []).map((k) => ({
        term: k.term,
        role: k.role,
        placement: k.placement,
        why: k.why,
        factIds: k.factIds ?? [],
      })),
      rationale: o.rationale,
    });

  async function runComposer(
    id: "compose" | "compose-2",
    parent: string,
    iteration: number,
    stopReason: string,
    repair?: { draft: RecommendationDraft; report: ValidationReport },
  ): Promise<RecommendationDraft> {
    const supported = findings.filter((f) => f.verdict?.status === "supported");
    const data = {
      input,
      profile,
      findings: supported,
      facts,
      stopReason,
      ...(repair ? { repair: { draft: repair.draft, issues: repair.report.issues } } : {}),
    };
    return node(
      {
        id,
        role: "composer",
        label: repair ? "Repair" : "Compose",
        iteration,
        parents: [parent],
        input: repair
          ? { errors: repair.report.issues.filter((x) => x.level === "error").map((x) => x.rule) }
          : { supportedFindings: supported.length, scoredKeywords: facts.filter((f) => f.kind === "keyword_score").length, stopReason },
      },
      async () => {
        const res = await llm.call({
          role: "composer",
          system: SYSTEM_PROMPTS.composer,
          user: composerPrompt(data),
          data,
          schema: ComposerOutput,
          signal,
        });
        const draft = toDraft(res.output);
        return {
          value: draft,
          summary: `${draft.name} · ${draft.keywords.length} keywords`,
          output: draft,
          thinking: res.thinking,
          usage: res.usage,
          model: res.model,
        };
      },
    );
  }

  async function runValidator(
    id: "validate" | "validate-2",
    parent: string,
    iteration: number,
    draft: RecommendationDraft,
  ): Promise<ValidationReport> {
    return node(
      {
        id,
        role: "validator",
        label: "Validate",
        iteration,
        parents: [parent],
        input: { name: draft.name, subtitle: draft.subtitle, keywordField: draft.keywordField },
      },
      async () => {
        // coverage evidence for the UI (no Apple calls)
        const check = await d
          .tools(
            "check_metadata",
            { name: draft.name, subtitle: draft.subtitle, keywordField: draft.keywordField, terms: draft.keywords.map((k) => k.term) },
            toolCtx(id, iteration),
          )
          .catch(() => null);
        if (check) addFacts(check.facts);
        const report = validateRecommendation(draft, facts, input);
        const errors = report.issues.filter((x) => x.level === "error").length;
        const warns = report.issues.length - errors;
        return {
          value: report,
          summary: `${errors ? `${errors} error${errors > 1 ? "s" : ""}` : "Valid"}${warns ? `, ${warns} warning${warns > 1 ? "s" : ""}` : ""}`,
          output: report,
        };
      },
    );
  }

  // ---------------------------------------------------------------- the run
  let result: LoopResult;
  try {
    result = await withAppleBudget(
      {
        limit: config.appleBudget,
        signal,
        onCharge: (used) => {
          appleUsed = used;
        },
      },
      async (): Promise<LoopResult> => {
        emit({ type: "run.started", runId: d.runId, title: d.title, source: d.source, input, config });
        emitBudget();
        await runProfile();

        let parent = "profile";
        let gaps: string[] = [];
        let stopReason = "";
        let lastIteration = 1;
        for (let i = 1; i <= config.maxIterations; i++) {
          throwIfCancelled();
          lastIteration = i;
          emit({ type: "iteration.started", iteration: i });
          let verdict: { converged: boolean; reason: string; gaps: string[] };
          try {
            const tasks = await runPlanner(i, parent, gaps);
            parent = `plan-${i}`;
            if (!tasks.length && i > 1) {
              stopReason = "The planner found nothing more worth fetching.";
              emit({ type: "iteration.finished", iteration: i, converged: true, reason: stopReason, gaps: [] });
              break;
            }
            const workerIds = tasks.map((_, k) => `w-${i}-${k + 1}`);
            await Promise.all(tasks.map((t, k) => runWorker(t, workerIds[k], i, `plan-${i}`)));
            throwIfCancelled();
            if (appleUsed >= config.appleBudget) appleSpent = true;
            const fresh = await runAnalyst(i, workerIds.length ? workerIds : [`plan-${i}`]);
            parent = `analyst-${i}`;
            verdict = await runChecker(i, fresh);
          } catch (e) {
            if (isFatal(e, signal)) throw e;
            // a model step failed (refusal, rate limit, bad output): stop researching and compose from what we have,
            // attached to the last node that completed
            stopReason = `Research stopped early: ${errMsg(e)}`;
            emit({ type: "iteration.finished", iteration: i, converged: false, reason: stopReason, gaps: [] });
            break;
          }
          parent = `check-${i}`;
          gaps = verdict.gaps;
          const reason = appleSpent ? `Apple request budget spent. ${verdict.reason}`.trim() : verdict.reason;
          emit({ type: "iteration.finished", iteration: i, converged: verdict.converged, reason, gaps: verdict.gaps });
          if (verdict.converged) {
            stopReason = `Converged: ${verdict.reason}`;
            break;
          }
          if (appleSpent) {
            stopReason = `Apple request budget spent (${config.appleBudget} requests).`;
            break;
          }
          if (attempted.size >= config.maxKeywords) {
            stopReason = `Keyword budget spent (${config.maxKeywords} keywords scored).`;
            break;
          }
          if (i === config.maxIterations) stopReason = `Reached the iteration limit (${config.maxIterations}).`;
        }

        throwIfCancelled();
        if (!facts.some((f) => f.kind === "keyword_score")) {
          throw new RunError(`No keyword could be scored, so there is no evidence to base a name on. ${stopReason}`.trim());
        }
        // the parent of the composer is the last node that completed the loop
        const draft = await runComposer("compose", parent, lastIteration, stopReason);
        let final = draft;
        let report = await runValidator("validate", "compose", lastIteration, draft);
        if (!report.ok) {
          try {
            const repaired = await runComposer("compose-2", "validate", lastIteration, stopReason, { draft, report });
            const report2 = await runValidator("validate-2", "compose-2", lastIteration, repaired);
            final = repaired;
            report = report2;
          } catch (e) {
            if (isFatal(e, signal)) throw e;
            // the repair failed: keep the first draft and its report (issues stay visible)
          }
        }
        const recommendation: Recommendation = {
          ...final,
          keywords: final.keywords.map((k) => ({ ...k, metrics: metricsFor(k.term) })),
          validation: report,
        };
        return { status: "done", recommendation };
      },
    );
  } catch (e) {
    result = isCancel(e, signal) ? { status: "cancelled", error: "Cancelled." } : { status: "failed", error: errMsg(e) };
  }
  emitBudget();
  d.finish?.(result);
  emit({ type: "run.finished", status: result.status, recommendation: result.recommendation, error: result.error });
  closed = true;
  return result;
}
