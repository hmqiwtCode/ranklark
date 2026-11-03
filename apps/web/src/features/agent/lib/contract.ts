/**
 * AI research agent: the contract shared by the server (orchestrator, API routes, MCP endpoint) and the UI.
 *
 * Client-safe: no Node APIs, no DB, no fetch.
 *
 * The one rule that shapes everything here: every number the user sees comes from a Fact, which is either
 * Apple data or one of our disclosed formulas. The model never produces a metric. It cites fact IDs, and
 * code attaches the numbers.
 */
import type { AuditIssue } from "@ranklark/core/metadata";

// ------------------------------------------------------------------ models & config

/**
 * Prices are Anthropic list prices in USD per million tokens (cached 2026-10-06). They are only used for the
 * labelled "Est. cost" figure. `cacheRead` is null where no price is published to us, and then cost shows "—".
 */
export const AGENT_MODELS = [
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    note: "Best quality (default)",
    fallbacks: true,
    price: { input: 4, output: 20, cacheRead: 0.2 },
  },
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    note: "Faster and cheaper",
    fallbacks: true,
    price: { input: 2, output: 10, cacheRead: 0.2 },
  },
  {
    id: "claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    note: "Cheapest, least thorough",
    fallbacks: false, // no server-side fallback exists for Haiku 5.5
    price: { input: 0.1, output: 0.5, cacheRead: null },
  },
] as const;
export const PRICES_AS_OF = "2026-10-06";

export type AgentModelId = (typeof AGENT_MODELS)[number]["id"];
export const isAgentModel = (v: unknown): v is AgentModelId => AGENT_MODELS.some((m) => m.id === v);

export const AGENT_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type AgentEffort = (typeof AGENT_EFFORTS)[number];
export const isAgentEffort = (v: unknown): v is AgentEffort => AGENT_EFFORTS.includes(v as AgentEffort);

export type AgentConfig = {
  model: AgentModelId;
  effort: AgentEffort;
  /** Plan → work → analyse → check rounds before composing, 1–5. */
  maxIterations: number;
  /** Hard ceiling of Apple requests this run may make (cached answers are free). Enforced in the Apple queue. */
  appleBudget: number;
  /** Most distinct keywords the run may score. */
  maxKeywords: number;
};

export const DEFAULT_CONFIG: AgentConfig = {
  model: "claude-opus-5-5",
  effort: "high",
  maxIterations: 3,
  appleBudget: 200,
  maxKeywords: 30,
};

export const CONFIG_LIMITS = {
  maxIterations: { min: 1, max: 5 },
  appleBudget: { min: 20, max: 600 },
  maxKeywords: { min: 5, max: 80 },
} as const;

/** Clamp untrusted config (request body, MCP args) into the allowed ranges. */
export function sanitizeConfig(raw: Partial<Record<keyof AgentConfig, unknown>> | null | undefined): AgentConfig {
  const r = raw ?? {};
  const num = (v: unknown, k: keyof typeof CONFIG_LIMITS) => {
    const n = Math.round(Number(v));
    const { min, max } = CONFIG_LIMITS[k];
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : DEFAULT_CONFIG[k];
  };
  return {
    model: isAgentModel(r.model) ? r.model : DEFAULT_CONFIG.model,
    effort: isAgentEffort(r.effort) ? r.effort : DEFAULT_CONFIG.effort,
    maxIterations: num(r.maxIterations, "maxIterations"),
    appleBudget: num(r.appleBudget, "appleBudget"),
    maxKeywords: num(r.maxKeywords, "maxKeywords"),
  };
}

// ------------------------------------------------------------------ run input

export type AgentGoal =
  /** The app isn't published yet: find keywords and name it from scratch. */
  | "new_app"
  /** A live app: find better keywords and suggest a stronger name / subtitle / keyword field. */
  | "improve";

export type AgentInput = {
  /** A published app (one of yours or any App Store ID). Null for an idea that isn't on the store yet. */
  appId: number | null;
  /** Storefront, e.g. "us". */
  country: string;
  /** What the app does, in the user's own words. Required when appId is null. */
  idea: string;
  /** Optional starting keywords. */
  seeds: string[];
  goal: AgentGoal;
  /** Optional brand word the name must keep (e.g. "Fudget"). */
  keepBrand: string;
  /** Optional free-text constraints ("no 'AI' in the name", "targets students"). */
  notes: string;
};

// ------------------------------------------------------------------ facts (evidence)

/** Where a fact's numbers come from. Shown as a badge next to every value. */
export type FactSource =
  | "app_store_listing" // iTunes Lookup / our DB copy of it
  | "apple_autocomplete" // App Store search suggestions
  | "itunes_search" // iTunes Search API order (≤200)
  | "app_store_web" // apps.apple.com search page (true top ~12 order)
  | "hints_estimate" // our popularity estimate from autocomplete
  | "apple_ads" // Apple Ads search popularity
  | "ranklark_formula" // difficulty / opportunity formulas (see /methodology)
  | "metadata_rules"; // Apple field limits + our audit rules

export type CompetitorApp = {
  id: number;
  name: string;
  subtitle: string | null;
  rating: number | null;
  ratingCount: number;
};

export type AppProfileData = {
  appId: number;
  name: string;
  subtitle: string | null;
  seller: string | null;
  genre: string | null;
  rating: number | null;
  ratingCount: number;
  /** First ~600 characters of the description. */
  descriptionExcerpt: string;
  /** Hidden keyword field, only known for your own app (ASC or entered by you). */
  keywordsField: string | null;
  /** Keywords you already track for this app in this storefront. */
  trackedTerms: string[];
};

export type SuggestionsData = {
  seed: string;
  items: { term: string; position: number; prefix: string }[];
};

/** Mirrors what /api/analyze returns for one term. Nulls mean "no signal" and render as "—". */
export type KeywordScore = {
  term: string;
  popularity: number | null;
  popSource: "apple_ads" | "hints_estimate" | null;
  popReason: string | null;
  difficulty: number | null;
  resultCount: number | null;
  brand: boolean;
  opportunity: number | null;
  /** Where the run's app ranks for the term today; null when there is no app or no snapshot. */
  yourRank: { rank: number | null; approx: boolean } | null;
  top: CompetitorApp[];
};

export type CompetitorPhrasesData = {
  term: string;
  phrases: { phrase: string; apps: number }[];
};

export type MetadataCheckData = {
  name: string;
  subtitle: string;
  keywordField: string;
  issues: AuditIssue[];
  usage: { name: number; subtitle: number; keywords: number; keywordBytes: number };
  coverage: { term: string; covered: boolean; where: ("T" | "S" | "K" | "D")[]; missing: string[] }[];
};

type FactBase = {
  /** "F1", "F2", … unique within a run. */
  id: string;
  /** Worker node that produced it. */
  nodeId: string;
  iteration: number;
  /** One line written by CODE from the data, never by the model. */
  summary: string;
  sources: FactSource[];
};

export type Fact = FactBase &
  (
    | { kind: "app_profile"; data: AppProfileData }
    | { kind: "suggestions"; data: SuggestionsData }
    | { kind: "keyword_score"; data: KeywordScore }
    | { kind: "competitor_phrases"; data: CompetitorPhrasesData }
    | { kind: "metadata_check"; data: MetadataCheckData }
  );
export type FactKind = Fact["kind"];

// ------------------------------------------------------------------ findings (claims about the facts)

export type FindingVerdict = {
  status: "supported" | "unsupported" | "needs_data";
  note: string;
  /** "rules" = our deterministic citation check, "checker" = the checker model. */
  by: "rules" | "checker";
};

export type Finding = {
  /** "N1", "N2", … unique within a run. */
  id: string;
  iteration: number;
  /** Analyst node that wrote it (or the MCP call that recorded it). */
  nodeId: string;
  kind: "opportunity" | "risk" | "insight" | "drop";
  claim: string;
  terms: string[];
  factIds: string[];
  confidence: "high" | "medium" | "low";
  verdict?: FindingVerdict;
};

// ------------------------------------------------------------------ the answer

export type KeywordMetrics = {
  popularity: number | null;
  popSource: KeywordScore["popSource"];
  difficulty: number | null;
  opportunity: number | null;
  yourRank: number | null;
  brand: boolean;
};

export type RecommendedKeyword = {
  term: string;
  role: "primary" | "secondary" | "long_tail";
  placement: "name" | "subtitle" | "keywords";
  why: string;
  factIds: string[];
  /** Filled by CODE from the latest keyword_score fact for the term. Null when the term was never scored. */
  metrics: KeywordMetrics | null;
};

export type ValidationIssue = {
  level: "error" | "warn";
  field: "name" | "subtitle" | "keywords" | "all";
  /** Stable rule id, e.g. "name.length", "keywords.duplicate", "brand.competitor", "keyword.unscored". */
  rule: string;
  message: string;
};

export type ValidationReport = {
  ok: boolean; // no "error" issues
  issues: ValidationIssue[];
  usage: { name: number; subtitle: number; keywords: number; keywordBytes: number };
};

export type Recommendation = {
  name: string;
  subtitle: string;
  /** Comma-separated, no spaces after commas, ≤100 characters. */
  keywordField: string;
  alternatives: { name: string; subtitle: string; why: string }[];
  keywords: RecommendedKeyword[];
  rationale: string;
  validation: ValidationReport;
};

// ------------------------------------------------------------------ graph events (the live log)

export type AgentRole = "planner" | "worker" | "analyst" | "checker" | "composer" | "validator";
export type NodeStatus = "running" | "done" | "failed" | "skipped";
export type RunStatus = "running" | "done" | "failed" | "cancelled" | "interrupted";
export type RunSource = "api" | "mcp";

export type TokenUsage = { input: number; output: number; cacheRead: number; cacheWrite: number };
export const ZERO_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export type BudgetState = {
  apple: { used: number; limit: number };
  keywords: { used: number; limit: number };
};

export type AgentEvent =
  | { type: "run.started"; runId: string; title: string; source: RunSource; input: AgentInput; config: AgentConfig }
  | { type: "iteration.started"; iteration: number }
  | {
      type: "node.started";
      nodeId: string;
      role: AgentRole;
      label: string;
      iteration: number;
      /** Nodes whose output fed this one; these become graph edges. */
      parents: string[];
      tool?: ToolName;
      /** Small, display-safe summary of the input (never the API key, never full prompts). */
      input?: unknown;
    }
  | { type: "node.log"; nodeId: string; message: string }
  | {
      type: "node.finished";
      nodeId: string;
      summary: string;
      output?: unknown;
      /** Summarized thinking returned by the API (display: "summarized"), when there is any. */
      thinking?: string;
      usage?: TokenUsage;
      /** Model that actually served the call (differs from the requested one after a fallback). */
      model?: string;
      durationMs: number;
    }
  | { type: "node.failed"; nodeId: string; error: string; durationMs: number }
  | { type: "fact.added"; fact: Fact }
  | { type: "finding.added"; finding: Finding }
  | { type: "finding.checked"; findingId: string; verdict: FindingVerdict }
  | { type: "iteration.finished"; iteration: number; converged: boolean; reason: string; gaps: string[] }
  | { type: "budget"; budget: BudgetState }
  | { type: "run.finished"; status: Exclude<RunStatus, "running" | "interrupted">; recommendation?: Recommendation; error?: string };

export type StoredEvent = AgentEvent & { seq: number; at: string };

// ------------------------------------------------------------------ data tools (orchestrator workers + MCP)

export type ToolInputs = {
  get_app_profile: { appId: number; country: string };
  expand_keywords: { seed: string; country: string; deep?: boolean };
  score_keywords: { terms: string[]; country: string; appId?: number | null };
  competitor_phrases: { term: string; country: string };
  check_metadata: { name: string; subtitle: string; keywordField: string; terms: string[] };
};
export type ToolName = keyof ToolInputs;

export const TOOL_INFO: Record<ToolName, { label: string; description: string; apple: boolean }> = {
  get_app_profile: {
    label: "Read app listing",
    description: "Name, subtitle, category, ratings and description of an App Store app, plus the keywords you track for it.",
    apple: true,
  },
  expand_keywords: {
    label: "Autocomplete",
    description: "What the App Store suggests while people type a seed word: real search phrases, best first.",
    apple: true,
  },
  score_keywords: {
    label: "Score keywords",
    description: "Popularity, difficulty, opportunity, brand flag, the top apps and your rank for up to 10 keywords.",
    apple: true,
  },
  competitor_phrases: {
    label: "Competitor titles",
    description: "Phrases that recur in the names of the top 10 apps for a keyword.",
    apple: true,
  },
  check_metadata: {
    label: "Check metadata",
    description: "Apple's length limits, wasted or repeated words, and which target keywords a name/subtitle/keyword field covers.",
    apple: false,
  },
};

/** Most terms one score_keywords call may take. */
export const SCORE_BATCH = 10;

// ------------------------------------------------------------------ HTTP + browser settings

/** The browser sends its key in this header when it starts a run or tests the key. Never in a URL or body. */
export const KEY_HEADER = "x-anthropic-api-key";

/** Browser-only settings (localStorage). The API key never leaves this browser except in KEY_HEADER. */
export const LOCAL_KEYS = {
  apiKey: "ranklark.ai.apiKey",
  model: "ranklark.ai.model",
  effort: "ranklark.ai.effort",
} as const;

export type StartRunBody = { input: AgentInput; config: Partial<AgentConfig> };
export type StartRunResult = { runId: string } | { error: string };

export type KeyCheckResult = { ok: true; model: string } | { ok: false; error: string };

export type AgentStatus = {
  /** True when the server may use its own credentials (ANTHROPIC_API_KEY), so a browser key is optional. */
  serverCredentials: boolean;
  fetchMode: "server" | "extension";
  mcp: McpSettings;
  /** True when the server runs the deterministic scripted test model (RANKLARK_AGENT_SCRIPTED=1) instead of Claude. */
  scripted?: boolean;
};

export type McpSettings = {
  enabled: boolean;
  /** Last 4 characters of the token, to tell tokens apart. */
  tokenHint: string | null;
  /** Full endpoint URL as seen by this server, e.g. http://localhost:3100/api/mcp. */
  url: string;
  /** Present only in the response that created the token: it is shown once and stored only as a hash. */
  token?: string;
};

export type RunSummary = {
  id: string;
  title: string;
  appId: number | null;
  appName: string | null;
  appIcon: string | null;
  country: string;
  status: RunStatus;
  source: RunSource;
  model: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export type RunSnapshot = {
  run: RunSummary & { input: AgentInput; config: AgentConfig };
  events: StoredEvent[];
};
