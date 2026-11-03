/**
 * Folds the run's event log into the view the UI renders (graph nodes, evidence, findings, budget, answer).
 * Pure and client-safe. The server stores events; the page replays them and then applies live ones.
 */
import {
  AGENT_MODELS,
  type AgentConfig,
  type AgentEvent,
  type AgentInput,
  type AgentRole,
  type BudgetState,
  type Fact,
  type Finding,
  type NodeStatus,
  type Recommendation,
  type RunSource,
  type RunStatus,
  type StoredEvent,
  type TokenUsage,
  type ToolName,
  ZERO_USAGE,
} from "./contract";

export type GraphNode = {
  id: string;
  role: AgentRole;
  label: string;
  iteration: number;
  parents: string[];
  status: NodeStatus;
  tool?: ToolName;
  input?: unknown;
  output?: unknown;
  summary?: string;
  thinking?: string;
  usage?: TokenUsage;
  model?: string;
  durationMs?: number;
  error?: string;
  logs: string[];
  startedAt: string;
  /** Facts this node produced (workers). */
  factIds: string[];
  /** Findings this node produced (analyst / MCP). */
  findingIds: string[];
};

export type IterationView = { n: number; converged?: boolean; reason?: string; gaps: string[] };

export type RunView = {
  runId: string | null;
  title: string;
  source: RunSource | null;
  input: AgentInput | null;
  config: AgentConfig | null;
  status: RunStatus;
  /** In start order. */
  nodes: GraphNode[];
  facts: Fact[];
  findings: Finding[];
  iterations: IterationView[];
  budget: BudgetState | null;
  /** Sum of every model call's usage. */
  tokens: TokenUsage;
  recommendation: Recommendation | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastSeq: number;
};

export const emptyRun = (): RunView => ({
  runId: null,
  title: "",
  source: null,
  input: null,
  config: null,
  status: "running",
  nodes: [],
  facts: [],
  findings: [],
  iterations: [],
  budget: null,
  tokens: { ...ZERO_USAGE },
  recommendation: null,
  error: null,
  startedAt: null,
  finishedAt: null,
  lastSeq: 0,
});

const addUsage = (a: TokenUsage, b: TokenUsage | undefined): TokenUsage =>
  b
    ? {
        input: a.input + b.input,
        output: a.output + b.output,
        cacheRead: a.cacheRead + b.cacheRead,
        cacheWrite: a.cacheWrite + b.cacheWrite,
      }
    : a;

function patchNode(v: RunView, id: string, patch: (n: GraphNode) => GraphNode): GraphNode[] {
  return v.nodes.map((n) => (n.id === id ? patch(n) : n));
}

/** Apply one event. Returns a new object (safe for React state); events at or below lastSeq are ignored. */
export function applyEvent(v: RunView, e: StoredEvent): RunView {
  if (e.seq <= v.lastSeq) return v;
  const next = { ...v, lastSeq: e.seq };
  const ev = e as AgentEvent;
  switch (ev.type) {
    case "run.started":
      return {
        ...next,
        runId: ev.runId,
        title: ev.title,
        source: ev.source,
        input: ev.input,
        config: ev.config,
        status: "running",
        startedAt: e.at,
      };
    case "iteration.started":
      return next.iterations.some((i) => i.n === ev.iteration)
        ? next
        : { ...next, iterations: [...next.iterations, { n: ev.iteration, gaps: [] }] };
    case "iteration.finished":
      return {
        ...next,
        iterations: next.iterations.some((i) => i.n === ev.iteration)
          ? next.iterations.map((i) => (i.n === ev.iteration ? { ...i, converged: ev.converged, reason: ev.reason, gaps: ev.gaps } : i))
          : [...next.iterations, { n: ev.iteration, converged: ev.converged, reason: ev.reason, gaps: ev.gaps }],
      };
    case "node.started":
      return {
        ...next,
        nodes: [
          ...next.nodes.filter((n) => n.id !== ev.nodeId),
          {
            id: ev.nodeId,
            role: ev.role,
            label: ev.label,
            iteration: ev.iteration,
            parents: ev.parents,
            status: "running",
            tool: ev.tool,
            input: ev.input,
            logs: [],
            startedAt: e.at,
            factIds: [],
            findingIds: [],
          },
        ],
      };
    case "node.log":
      return { ...next, nodes: patchNode(next, ev.nodeId, (n) => ({ ...n, logs: [...n.logs, ev.message].slice(-200) })) };
    case "node.finished":
      return {
        ...next,
        tokens: addUsage(next.tokens, ev.usage),
        nodes: patchNode(next, ev.nodeId, (n) => ({
          ...n,
          status: "done",
          summary: ev.summary,
          output: ev.output,
          thinking: ev.thinking,
          usage: ev.usage,
          model: ev.model,
          durationMs: ev.durationMs,
        })),
      };
    case "node.failed":
      return {
        ...next,
        nodes: patchNode(next, ev.nodeId, (n) => ({ ...n, status: "failed", error: ev.error, durationMs: ev.durationMs })),
      };
    case "fact.added":
      return {
        ...next,
        facts: [...next.facts.filter((f) => f.id !== ev.fact.id), ev.fact],
        nodes: patchNode(next, ev.fact.nodeId, (n) => ({ ...n, factIds: [...new Set([...n.factIds, ev.fact.id])] })),
      };
    case "finding.added":
      return {
        ...next,
        findings: [...next.findings.filter((f) => f.id !== ev.finding.id), ev.finding],
        nodes: patchNode(next, ev.finding.nodeId, (n) => ({ ...n, findingIds: [...new Set([...n.findingIds, ev.finding.id])] })),
      };
    case "finding.checked":
      return { ...next, findings: next.findings.map((f) => (f.id === ev.findingId ? { ...f, verdict: ev.verdict } : f)) };
    case "budget":
      return { ...next, budget: ev.budget };
    case "run.finished":
      return {
        ...next,
        status: ev.status,
        recommendation: ev.recommendation ?? next.recommendation,
        error: ev.error ?? null,
        finishedAt: e.at,
        // anything still "running" when the run ends did not complete
        nodes: next.nodes.map((n) => (n.status === "running" ? { ...n, status: "skipped" } : n)),
      };
    default:
      return next;
  }
}

export const reduceRun = (events: StoredEvent[], from: RunView = emptyRun()): RunView =>
  [...events].sort((a, b) => a.seq - b.seq).reduce(applyEvent, from);

/** Latest keyword_score fact per term (later facts win). */
export function latestScores(facts: Fact[]) {
  const out = new Map<string, Extract<Fact, { kind: "keyword_score" }>>();
  for (const f of facts) if (f.kind === "keyword_score") out.set(f.data.term, f);
  return out;
}

/**
 * Estimated USD cost from Anthropic list prices. Cache writes are billed at 1.25× input (5-minute TTL).
 * Returns null (shown as "—") when the model is unknown or a needed price isn't published to us.
 */
export function estimateCost(model: string | null | undefined, u: TokenUsage): number | null {
  const m = AGENT_MODELS.find((x) => x.id === model);
  if (!m) return null;
  const { input, output, cacheRead } = m.price;
  if (u.cacheRead > 0 && cacheRead == null) return null;
  const usd = (u.input * input + u.cacheWrite * input * 1.25 + u.output * output + u.cacheRead * (cacheRead ?? 0)) / 1e6;
  return Math.round(usd * 10000) / 10000;
}
