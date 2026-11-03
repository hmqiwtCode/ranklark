/**
 * System prompts (stable per role, so they cache), structured-output schemas, and the compact run payloads the
 * roles see. The model judges; it never produces a metric. Every number it may repeat lives in a cited fact.
 */
import { LIMITS } from "@ranklark/core/metadata";
import { z } from "zod";
import type { AgentInput, AppProfileData, Fact, Finding, ValidationIssue } from "../lib/contract";
import type { RecommendationDraft } from "../lib/validate";

// ------------------------------------------------------------------ shared rules

const RULES = `
# App Store metadata rules

Apple-documented (developer.apple.com/app-store/search and /app-store/product-page, App Store Connect Help):
- App Name: at most ${LIMITS.name} characters. Subtitle: at most ${LIMITS.subtitle} characters. Keyword field: at most ${LIMITS.keywords} characters.
- App Store search uses text relevance on the app's title, subtitle, keyword field and primary category (an optional secondary category is indexed too), plus user behaviour such as downloads, ratings and reviews.
- Keyword field: separate keywords with commas and no spaces; spaces inside a phrase are fine ("property,house,real estate"). Don't repeat any word already in the app name, subtitle or category. Plurals of words already included count as duplicates (Apple's example: "climbs" when "climb" is there). Avoid duplicate words, category names, the word "app", and special characters such as # or @.
- Don't use trademarked terms, celebrity names, competing app names, or terms not relevant to the app; Apple says improper keyword use is a common reason for rejection. Never put a competitor's name or a brand keyword in the name, subtitle or keyword field.
- Subtitle: avoid generic descriptions such as "world's best app".
- App Review Guideline 2.3.7: "don't try to pack any of your metadata with trademarked terms, popular app names, pricing information, or other irrelevant phrases just to game the system." App names and subtitles "should not include prices", and subtitles should not "reference other apps, or make unverifiable product claims" (e.g. "#1", "best", "top rated").
- Choosing keywords, in Apple's words: "Consider the trade-off between ranking well for less common terms versus ranking lower for popular terms. Less common terms drive lower traffic, but are less competitive."

Observed by the ASO industry (not documented by Apple; treat as tendencies, not rules):
- Words in the app name appear to weigh more than words in the subtitle, which weigh more than the keyword field.
- Apple appears to combine words across the name, subtitle and keyword field, so a single word can serve several phrases.
- Repeating a word between the name and the subtitle appears to waste characters.
- "free", "iphone" and "best" rarely help.

# Evidence rules (strict)

- Facts are the only source of numbers. Each fact has an id (F1, F2, ...). Cite the fact ids behind every claim.
- Never state a number (popularity, difficulty, opportunity, rank, rating count, result count, percentage) that does not appear in a fact you cite. If a value is null it is unknown: say "unknown", never guess.
- Popularity with source "hints_estimate" is Ranklark's estimate from App Store autocomplete, not Apple data. Source "apple_ads" is Apple Ads search popularity (0-100). Difficulty and opportunity are Ranklark formulas (0-100; higher opportunity = more demand for the difficulty).
- A keyword with brand = true is another app's name that people search for. It can't be won and must not be used in metadata.
- Respect the user's constraints: keepBrand must stay in the app name; follow the user's notes.
- Be concise. Give short reasons in the "why", "note" and "rationale" fields; do not narrate your process.
`.trim();

const ROLE = {
  planner: `You are the research planner in an App Store Optimization (ASO) research team. You decide which data the team's workers fetch next to find the best keywords and the best App Name, Subtitle and Keyword field for one app or app idea in one App Store storefront.

Tools the workers can run for you:
- expand_keywords {terms: [seed], deep}: App Store autocomplete suggestions for one seed: real search phrases people type, best first. deep=true also probes "<seed> a" … "<seed> z" (up to 28 Apple requests uncached); use it only when the Apple budget is large.
- score_keywords {terms: up to 10}: popularity, difficulty, opportunity, brand flag, the top apps and the app's current rank for each term. Up to about 11 Apple requests per uncached term (autocomplete probes plus search); terms sharing a prefix with earlier ones cost less because answers are cached. Each new term uses one unit of the keyword budget.
- competitor_phrases {terms: [term]}: phrases that recur in the names of the top 10 apps for a term (cheap when the term was already scored).

Planning guidance:
- Start from the app's core use case: its name, subtitle, category, description and the user's seeds. Expand 1-3 seeds, then score the most relevant candidates.
- Score specific, relevant phrases a user would type to find this kind of app. Skip brand keywords of other apps, terms unrelated to the app, and anything already scored.
- Weigh Apple's trade-off: popular terms bring more traffic but are harder to rank for; less common terms bring less traffic but are less competitive. Look for both.
- In later iterations, close the gaps the checker listed. Stop asking for data that won't change the recommendation.
- Stay within the remaining Apple and keyword budgets; at most 6 tasks per iteration. Cached answers are free, so prefer seeds and terms the team has already touched when they are relevant.

Return hypotheses (short statements you want the data to confirm or refute) and tasks, each with a one-line "why".`,

  analyst: `You are the analyst in an App Store Optimization (ASO) research team. You read the evidence (facts) the workers gathered and write findings: short, checkable claims about which keywords to target, avoid or drop, and what the competition looks like.

Finding kinds:
- opportunity: a keyword worth targeting, and where (name, subtitle or keyword field) it would fit.
- risk: a keyword or idea to avoid (brand keyword, too difficult for the demand, irrelevant), or a problem with the current metadata.
- insight: a pattern in the evidence (e.g. phrases most top competitors share).
- drop: a keyword in the current metadata or tracking list that the evidence says isn't worth its characters.

Write at most 8 new findings. Don't repeat earlier findings. Each finding lists the terms it is about and cites the fact ids that support it. Set confidence by how direct the evidence is.`,

  checker: `You are the checker in an App Store Optimization (ASO) research team. You verify the analyst's findings against the facts they cite, then decide whether the team has enough evidence to write the final recommendation.

For each finding give a verdict:
- supported: the cited facts show what the claim says (terms match, numbers match).
- unsupported: the cited facts contradict it, don't mention its terms, or it states numbers that aren't in them. "unmatchedNumbers" lists numbers our rule check could not find in the cited facts: mark the finding unsupported unless such a number is clearly not a metric (e.g. "the top 10 apps").
- needs_data: plausible, but the cited facts are not enough to confirm it.

Then decide convergence. converged = true when the supported findings already cover enough scored, relevant, non-brand keywords to fill an App Name, a Subtitle and a 100-character keyword field well, or when more research is unlikely to change the recommendation. Otherwise list up to 5 concrete gaps (e.g. "score the top suggestions for 'habit tracker'").`,

  composer: `You are the metadata writer in an App Store Optimization (ASO) research team. From the supported findings and the scored keywords, write the best App Name, Subtitle and Keyword field for the app, plus 2 or 3 alternative name/subtitle pairs, and a ranked list of the keywords you used.

Writing rules:
- The name must read naturally as an app name, never as a keyword list. If keepBrand is set, the name must contain it (a common pattern is "Brand: Core Keyword", but it is not required).
- Put the strongest relevant keyword (best opportunity for its difficulty, clearly relevant to the app) in the name, the next ones in the subtitle, and the rest as single words or short phrases in the keyword field. Weigh Apple's trade-off: a less common term you can rank for may beat a popular one you can't.
- Subtitle: specific, not generic ("world's best app"), without repeating name words, and without unverifiable claims ("#1", "best", "top rated").
- No prices or pricing words ("free", "sale", "discount", "% off", "$4.99") in the name or subtitle.
- Keyword field: lowercase, comma-separated, no spaces after commas; no word already in the name, subtitle or category, counting plurals as the same word; no repeated words, no "app", no # or @; as close to 100 characters as the evidence supports. Never pad it with unrelated words.
- Only recommend keywords that were scored (cite their keyword_score fact ids). Never use brand keywords or competitors' names anywhere.
- Each keyword gets a role (primary, secondary, long_tail), a placement (name, subtitle, keywords) that matches where its words actually are, a short "why" and the fact ids behind it.
- When "repair" is present, fix every listed issue and keep everything else that was fine.`,
} as const;

export const SYSTEM_PROMPTS = {
  planner: `${ROLE.planner}\n\n${RULES}`,
  analyst: `${ROLE.analyst}\n\n${RULES}`,
  checker: `${ROLE.checker}\n\n${RULES}`,
  composer: `${ROLE.composer}\n\n${RULES}`,
} as const;

// ------------------------------------------------------------------ output schemas

export const PLANNER_TOOLS = ["expand_keywords", "score_keywords", "competitor_phrases"] as const;

export const PlannerOutput = z.object({
  hypotheses: z.array(z.string()).describe("Short statements the data should confirm or refute (at most 5)."),
  tasks: z
    .array(
      z.object({
        tool: z.enum(PLANNER_TOOLS),
        terms: z.array(z.string()).describe("expand_keywords: [seed]; competitor_phrases: [term]; score_keywords: up to 10 terms."),
        deep: z.boolean().describe("expand_keywords only: also probe '<seed> a'…'<seed> z'. false otherwise."),
        why: z.string().describe("One line."),
      }),
    )
    .describe("At most 6 tasks."),
});
export type PlannerOutputT = z.infer<typeof PlannerOutput>;

export const AnalystOutput = z.object({
  findings: z.array(
    z.object({
      kind: z.enum(["opportunity", "risk", "insight", "drop"]),
      claim: z.string().describe("One or two sentences. Only numbers that appear in the cited facts."),
      terms: z.array(z.string()),
      factIds: z.array(z.string()).describe("Ids of the facts that support the claim, e.g. ['F3', 'F7']."),
      confidence: z.enum(["high", "medium", "low"]),
    }),
  ),
});
export type AnalystOutputT = z.infer<typeof AnalystOutput>;

export const CheckerOutput = z.object({
  verdicts: z.array(
    z.object({
      findingId: z.string(),
      status: z.enum(["supported", "unsupported", "needs_data"]),
      note: z.string().describe("One short sentence."),
    }),
  ),
  converged: z.boolean(),
  reason: z.string().describe("One sentence."),
  gaps: z.array(z.string()).describe("At most 5 concrete next research steps; empty when converged."),
});
export type CheckerOutputT = z.infer<typeof CheckerOutput>;

export const ComposerOutput = z.object({
  name: z.string(),
  subtitle: z.string(),
  keywordField: z.string().describe("Comma-separated, no spaces after commas, at most 100 characters."),
  alternatives: z.array(z.object({ name: z.string(), subtitle: z.string(), why: z.string() })).describe("2 or 3 alternatives."),
  keywords: z.array(
    z.object({
      term: z.string(),
      role: z.enum(["primary", "secondary", "long_tail"]),
      placement: z.enum(["name", "subtitle", "keywords"]),
      why: z.string(),
      factIds: z.array(z.string()),
    }),
  ),
  rationale: z.string().describe("Two to four sentences."),
});
export type ComposerOutputT = z.infer<typeof ComposerOutput>;

// ------------------------------------------------------------------ compact payloads

/** One row of the facts table the model sees: only what it needs, so the payload stays small. */
export function compactFact(f: Fact): Record<string, unknown> {
  switch (f.kind) {
    case "keyword_score": {
      const d = f.data;
      return {
        id: f.id,
        kind: f.kind,
        term: d.term,
        popularity: d.popularity,
        popSource: d.popSource,
        difficulty: d.difficulty,
        opportunity: d.opportunity,
        brand: d.brand,
        yourRank: d.yourRank ? d.yourRank.rank : null,
        results: d.resultCount,
        top3: d.top.slice(0, 3).map((a) => ({ name: a.name, ratings: a.ratingCount })),
      };
    }
    case "suggestions":
      return { id: f.id, kind: f.kind, seed: f.data.seed, suggestions: f.data.items.slice(0, 25).map((i) => i.term) };
    case "competitor_phrases":
      return { id: f.id, kind: f.kind, term: f.data.term, phrases: f.data.phrases.slice(0, 15).map((p) => `${p.phrase} (${p.apps})`) };
    case "app_profile":
      return { id: f.id, kind: f.kind, ...profileView(f.data) };
    case "metadata_check":
      return {
        id: f.id,
        kind: f.kind,
        usage: f.data.usage,
        issues: f.data.issues.filter((i) => i.level !== "info").map((i) => `${i.level} (${i.basis}): ${i.message}`),
        uncovered: f.data.coverage.filter((c) => !c.covered).map((c) => c.term),
      };
  }
}

const profileView = (p: AppProfileData) => ({
  appId: p.appId,
  name: p.name,
  subtitle: p.subtitle,
  seller: p.seller,
  genre: p.genre,
  rating: p.rating,
  ratingCount: p.ratingCount,
  description: p.descriptionExcerpt,
  keywordField: p.keywordsField,
  trackedKeywords: p.trackedTerms,
});

const inputView = (i: AgentInput) => ({
  goal: i.goal === "new_app" ? "name a new app (not published yet)" : "improve a live app's metadata",
  country: i.country,
  idea: i.idea || null,
  seeds: i.seeds,
  keepBrand: i.keepBrand || null,
  notes: i.notes || null,
});

const findingView = (f: Finding) => ({
  id: f.id,
  kind: f.kind,
  claim: f.claim,
  terms: f.terms,
  factIds: f.factIds,
  confidence: f.confidence,
  verdict: f.verdict ? `${f.verdict.status}: ${f.verdict.note}` : null,
});

const asJson = (title: string, data: unknown) => `${title}\n\n\`\`\`json\n${JSON.stringify(data)}\n\`\`\``;

export type Budgets = { appleUsed: number; appleLimit: number; keywordsUsed: number; keywordsLimit: number };

export type PlannerData = {
  iteration: number;
  maxIterations: number;
  input: AgentInput;
  profile: AppProfileData | null;
  facts: Fact[];
  findings: Finding[];
  gaps: string[];
  scoredTerms: string[];
  expandedSeeds: string[];
  budgets: Budgets;
};

export function plannerPrompt(d: PlannerData) {
  return asJson(`Plan iteration ${d.iteration} of ${d.maxIterations}.`, {
    request: inputView(d.input),
    app: d.profile ? profileView(d.profile) : null,
    budgets: {
      appleRequestsLeft: Math.max(0, d.budgets.appleLimit - d.budgets.appleUsed),
      keywordsLeftToScore: Math.max(0, d.budgets.keywordsLimit - d.budgets.keywordsUsed),
    },
    alreadyScored: d.scoredTerms,
    alreadyExpanded: d.expandedSeeds,
    checkerGaps: d.gaps,
    findings: d.findings.map(findingView),
    facts: d.facts.filter((f) => f.kind !== "app_profile").map(compactFact),
  });
}

export type AnalystData = { iteration: number; input: AgentInput; profile: AppProfileData | null; facts: Fact[]; previous: Finding[] };

export function analystPrompt(d: AnalystData) {
  return asJson(`Write findings for iteration ${d.iteration}.`, {
    request: inputView(d.input),
    app: d.profile ? profileView(d.profile) : null,
    previousFindings: d.previous.map(findingView),
    facts: d.facts.map(compactFact),
  });
}

export type CheckerItem = { finding: Finding; unmatchedNumbers: string[] };
export type CheckerData = {
  iteration: number;
  maxIterations: number;
  input: AgentInput;
  items: CheckerItem[];
  citedFacts: Fact[];
  supportedSoFar: Finding[];
  scoredCount: number;
  budgets: Budgets;
};

export function checkerPrompt(d: CheckerData) {
  return asJson(`Check the findings of iteration ${d.iteration} of ${d.maxIterations}, then decide convergence.`, {
    request: inputView(d.input),
    findingsToCheck: d.items.map((x) => ({ ...findingView(x.finding), unmatchedNumbers: x.unmatchedNumbers })),
    citedFacts: d.citedFacts.map(compactFact),
    supportedEarlier: d.supportedSoFar.map(findingView),
    keywordsScored: d.scoredCount,
    budgets: {
      appleRequestsLeft: Math.max(0, d.budgets.appleLimit - d.budgets.appleUsed),
      keywordsLeftToScore: Math.max(0, d.budgets.keywordsLimit - d.budgets.keywordsUsed),
      iterationsLeft: d.maxIterations - d.iteration,
    },
  });
}

export type ComposerData = {
  input: AgentInput;
  profile: AppProfileData | null;
  findings: Finding[];
  facts: Fact[];
  stopReason: string;
  repair?: { draft: RecommendationDraft; issues: ValidationIssue[] };
};

export function composerPrompt(d: ComposerData) {
  return asJson(d.repair ? "Repair the recommendation: fix every listed issue." : "Write the recommendation.", {
    request: inputView(d.input),
    app: d.profile ? profileView(d.profile) : null,
    limits: { name: LIMITS.name, subtitle: LIMITS.subtitle, keywordField: LIMITS.keywords },
    researchStopped: d.stopReason,
    supportedFindings: d.findings.map(findingView),
    scoredKeywords: d.facts.filter((f) => f.kind === "keyword_score").map(compactFact),
    otherFacts: d.facts.filter((f) => f.kind === "competitor_phrases").map(compactFact),
    ...(d.repair ? { repair: { previous: d.repair.draft, issues: d.repair.issues.map((i) => `${i.level} ${i.rule}: ${i.message}`) } } : {}),
  });
}
