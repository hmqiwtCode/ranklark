/**
 * The research agent's data tools, shared by the orchestrator's workers and the MCP endpoint.
 * Each one wraps existing Ranklark server code and returns Facts with code-written summaries and source labels.
 * Inputs come from Claude or an MCP client, so every field is validated and normalized here.
 */
import { audit, placement } from "@ranklark/core/metadata";
import { getStoreApp } from "@/features/apps/server/store";
import { appleAdsPopularity, estimatePopularity, expandSeed } from "@/features/keywords/server/popularity";
import { getApp } from "@/features/keywords/server/queries";
import { fetchSerp } from "@/features/keywords/server/serp";
import { keywordsFor } from "@/features/keywords/server/track";
import { competitorPhrases, hasWebOrder, readScores } from "@/features/research/server/score";
import { AppleRunCancelled, isAppleBudgetExceeded } from "@/server/apple/budget";
import type {
  AppProfileData,
  CompetitorApp,
  Fact,
  FactSource,
  KeywordScore,
  MetadataCheckData,
  ToolInputs,
  ToolName,
} from "../lib/contract";

export { isToolName, parseToolInput, TOOL_NAMES, ToolInputError } from "./tool-input";

// ------------------------------------------------------------------ running a tool

export type ToolContext = {
  /** Worker (or MCP) node that will own the facts. */
  nodeId: string;
  iteration: number;
  /** Allocates the run's next fact ID ("F1", "F2", …). */
  nextFactId: () => string;
  signal?: AbortSignal;
};

export type ToolOutcome = {
  facts: Fact[];
  /** One line written by code for the node. */
  summary: string;
  /** Items that failed without failing the whole tool (e.g. one term of a batch). */
  errors: string[];
  /** An Apple request was refused because the run's request budget is spent. */
  budgetExceeded: boolean;
};

export type ToolRunner = <N extends ToolName>(name: N, input: ToolInputs[N], ctx: ToolContext) => Promise<ToolOutcome>;

const fmt = (v: number | null | undefined) => (v == null ? "—" : String(Math.round(v * 10) / 10));
const fmtCount = (n: number) => (n >= 1e6 ? `${fmt(n / 1e6)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : String(n));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
const throwIfCancelled = (e: unknown, signal?: AbortSignal) => {
  if (e instanceof AppleRunCancelled || signal?.aborted) throw e instanceof Error ? e : new AppleRunCancelled();
};

function fact<K extends Fact["kind"]>(
  ctx: ToolContext,
  kind: K,
  data: Extract<Fact, { kind: K }>["data"],
  summary: string,
  sources: FactSource[],
): Fact {
  return {
    id: ctx.nextFactId(),
    nodeId: ctx.nodeId,
    iteration: ctx.iteration,
    summary,
    sources: [...new Set(sources)],
    kind,
    data,
  } as Fact;
}

async function getAppProfile(input: ToolInputs["get_app_profile"], ctx: ToolContext): Promise<ToolOutcome> {
  const row = getApp(input.appId);
  let data: AppProfileData;
  // extension mode inserts "App <id>" placeholders until the extension fills the listing in
  if (row && row.name !== `App ${row.id}`) {
    data = {
      appId: row.id,
      name: row.name,
      subtitle: row.subtitle,
      seller: row.seller,
      genre: row.genre,
      rating: row.rating,
      ratingCount: row.rating_count ?? 0,
      descriptionExcerpt: (row.description ?? "").slice(0, 600),
      keywordsField: row.keywords_field,
      trackedTerms: keywordsFor(row.id, input.country),
    };
  } else {
    const a = await getStoreApp(input.appId, input.country); // iTunes Lookup (+ catalog subtitle), cached 6 h in memory
    if (!a) throw new Error(`App ${input.appId} was not found in the ${input.country.toUpperCase()} App Store.`);
    data = {
      appId: a.id,
      name: a.name,
      subtitle: a.subtitle,
      seller: a.seller,
      genre: a.genre,
      rating: a.rating,
      ratingCount: a.ratingCount,
      descriptionExcerpt: (a.description ?? "").slice(0, 600),
      keywordsField: null,
      trackedTerms: keywordsFor(a.id, input.country),
    };
  }
  const parts = [
    `${data.name}${data.seller ? ` by ${data.seller}` : ""}`,
    data.subtitle ? `subtitle "${data.subtitle}"` : "no subtitle on file",
    data.genre ?? null,
    data.rating != null ? `${fmt(data.rating)}★ from ${fmtCount(data.ratingCount)} ratings` : "no ratings",
    data.trackedTerms.length ? `${data.trackedTerms.length} tracked keyword${data.trackedTerms.length > 1 ? "s" : ""}` : null,
  ].filter(Boolean);
  const f = fact(ctx, "app_profile", data, parts.join(" · "), ["app_store_listing"]);
  return { facts: [f], summary: f.summary, errors: [], budgetExceeded: false };
}

async function expandKeywords(input: ToolInputs["expand_keywords"], ctx: ToolContext): Promise<ToolOutcome> {
  // expandSeed reads the 7-day autocomplete cache first and skips prefixes that fail (budget, network, extension mode)
  const items = (await expandSeed(input.seed, input.country, input.deep)).slice(0, 60);
  if (ctx.signal?.aborted) throw new AppleRunCancelled();
  if (!items.length) {
    return { facts: [], summary: `No autocomplete suggestions for "${input.seed}"`, errors: [], budgetExceeded: false };
  }
  const data = { seed: input.seed, items: items.map((i) => ({ term: i.term, position: i.position, prefix: i.from })) };
  const preview = items
    .slice(0, 4)
    .map((i) => i.term)
    .join(", ");
  const f = fact(
    ctx,
    "suggestions",
    data,
    `${items.length} autocomplete suggestion${items.length > 1 ? "s" : ""} for "${input.seed}": ${preview}${items.length > 4 ? "…" : ""}`,
    ["apple_autocomplete"],
  );
  return { facts: [f], summary: f.summary, errors: [], budgetExceeded: false };
}

const toCompetitor = (a: {
  id: number;
  name: string;
  subtitle?: string | null;
  rating: number | null;
  ratingCount: number;
}): CompetitorApp => ({
  id: a.id,
  name: a.name,
  subtitle: a.subtitle ?? null,
  rating: a.rating,
  ratingCount: a.ratingCount ?? 0,
});

function scoreSummary(s: KeywordScore): string {
  const pop =
    s.popularity == null ? "popularity —" : `popularity ${fmt(s.popularity)} (${s.popSource === "apple_ads" ? "Apple Ads" : "estimate"})`;
  const parts = [`"${s.term}": ${pop}`, `difficulty ${fmt(s.difficulty)}`];
  parts.push(s.brand ? "brand keyword (no opportunity)" : `opportunity ${fmt(s.opportunity)}`);
  if (s.yourRank)
    parts.push(
      s.yourRank.rank == null ? "you're not in the top 200" : `you rank #${s.yourRank.rank}${s.yourRank.approx ? " (approx.)" : ""}`,
    );
  if (s.top[0]) parts.push(`#1 ${s.top[0].name} (${fmtCount(s.top[0].ratingCount)} ratings)`);
  return parts.join(", ");
}

async function scoreKeywords(input: ToolInputs["score_keywords"], ctx: ToolContext): Promise<ToolOutcome> {
  const { terms, country } = input;
  const errors: string[] = [];
  let budgetExceeded = false;
  const note = (term: string | null, e: unknown) => {
    throwIfCancelled(e, ctx.signal);
    if (isAppleBudgetExceeded(e)) budgetExceeded = true;
    const line = term ? `${term}: ${errMsg(e)}` : errMsg(e);
    if (!errors.includes(line)) errors.push(line);
  };
  // same steps as POST /api/analyze; the Apple queue paces and budgets every request
  await appleAdsPopularity(terms, country).catch((e) => note(null, e));
  const failed = new Set<string>();
  await Promise.all(
    terms.map(async (t) => {
      const [serp, pop] = await Promise.allSettled([fetchSerp(t, country), estimatePopularity(t, country)]);
      if (serp.status === "rejected") note(t, serp.reason);
      if (pop.status === "rejected") note(t, pop.reason);
      if (serp.status === "rejected" && pop.status === "rejected") failed.add(t);
    }),
  );
  if (ctx.signal?.aborted) throw new AppleRunCancelled();

  const facts: Fact[] = [];
  for (const s of readScores(terms, country, input.appId ?? null)) {
    // nothing known at all (not even an older snapshot): no fact, the term stays unscored
    if (s.difficulty == null && s.popularity == null && failed.has(s.term)) continue;
    const data: KeywordScore = {
      term: s.term,
      popularity: s.popularity,
      popSource: s.popSource,
      popReason: s.popReason,
      difficulty: s.difficulty,
      resultCount: s.resultCount,
      brand: s.brand,
      opportunity: s.opportunity,
      yourRank: s.yourRank,
      top: s.top.slice(0, 10).map(toCompetitor),
    };
    const sources: FactSource[] = ["itunes_search"];
    if (hasWebOrder(s.term, country)) sources.push("app_store_web");
    if (s.popSource) sources.push(s.popSource);
    sources.push("ranklark_formula");
    facts.push(fact(ctx, "keyword_score", data, scoreSummary(data), sources));
  }
  const summary =
    `Scored ${facts.length}/${terms.length} keyword${terms.length > 1 ? "s" : ""}` +
    (errors.length ? ` (${errors.length} problem${errors.length > 1 ? "s" : ""})` : "") +
    (budgetExceeded ? "; Apple budget spent" : "");
  return { facts, summary, errors, budgetExceeded };
}

async function competitorPhrasesTool(input: ToolInputs["competitor_phrases"], ctx: ToolContext): Promise<ToolOutcome> {
  const serp = await fetchSerp(input.term, input.country); // today's snapshot is reused when the term was just scored
  const phrases = competitorPhrases(JSON.parse(serp.top_json))
    .slice(0, 25)
    .map((p) => ({ phrase: p.term, apps: p.apps }));
  const preview = phrases
    .slice(0, 4)
    .map((p) => `${p.phrase} (${p.apps} app${p.apps > 1 ? "s" : ""})`)
    .join(", ");
  const f = fact(
    ctx,
    "competitor_phrases",
    { term: input.term, phrases },
    phrases.length
      ? `Top-10 titles for "${input.term}" share: ${preview}${phrases.length > 4 ? "…" : ""}`
      : `No shared title phrases for "${input.term}"`,
    serp.web_json ? ["itunes_search", "app_store_web"] : ["itunes_search"],
  );
  return { facts: [f], summary: f.summary, errors: [], budgetExceeded: false };
}

/** Pure (no Apple calls): Apple's limits, wasted words and keyword coverage of a proposed name/subtitle/keyword field. */
export function checkMetadataData(input: ToolInputs["check_metadata"]): MetadataCheckData {
  const fields = { name: input.name, subtitle: input.subtitle, keywords: input.keywordField };
  const { issues, usage } = audit(fields, input.terms);
  return {
    name: input.name,
    subtitle: input.subtitle,
    keywordField: input.keywordField,
    issues,
    usage: { name: usage.name.used, subtitle: usage.subtitle.used, keywords: usage.keywords.used, keywordBytes: usage.keywords.bytes ?? 0 },
    coverage: input.terms.map((term) => {
      const p = placement(term, fields);
      return { term, covered: p.covered, where: p.where, missing: p.missing };
    }),
  };
}

function checkMetadata(input: ToolInputs["check_metadata"], ctx: ToolContext): ToolOutcome {
  const data = checkMetadataData(input);
  const covered = data.coverage.filter((c) => c.covered).length;
  const problems = data.issues.filter((i) => i.level !== "info").length;
  const f = fact(
    ctx,
    "metadata_check",
    data,
    `Name ${data.usage.name}/30, subtitle ${data.usage.subtitle}/30, keywords ${data.usage.keywords}/100; ` +
      `${covered}/${data.coverage.length} target keywords covered; ${problems} issue${problems === 1 ? "" : "s"}`,
    ["metadata_rules"],
  );
  return { facts: [f], summary: f.summary, errors: [], budgetExceeded: false };
}

/** Runs one data tool with already-validated input (see parseToolInput). */
export const runTool: ToolRunner = async (name, input, ctx) => {
  switch (name) {
    case "get_app_profile":
      return getAppProfile(input as ToolInputs["get_app_profile"], ctx);
    case "expand_keywords":
      return expandKeywords(input as ToolInputs["expand_keywords"], ctx);
    case "score_keywords":
      return scoreKeywords(input as ToolInputs["score_keywords"], ctx);
    case "competitor_phrases":
      return competitorPhrasesTool(input as ToolInputs["competitor_phrases"], ctx);
    case "check_metadata":
      return checkMetadata(input as ToolInputs["check_metadata"], ctx);
    default:
      throw new Error(`Unknown tool "${String(name)}".`);
  }
};
