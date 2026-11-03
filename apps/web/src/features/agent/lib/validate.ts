/**
 * Validates a recommended App Name / Subtitle / Keyword field against Apple's documented limits, App Review
 * Guideline 2.3.7 (no other apps' names), duplicate rules and the run's evidence. Pure and client-safe.
 *
 * Rule ids are stable (the UI and tests key on them). Lengths count characters as Unicode code points; the
 * keyword field's UTF-8 byte count is reported alongside.
 */
import { keywordFieldTokens, LIMITS, normalize, STOP_WORDS, singular, tokens, utf8Bytes } from "@ranklark/core/metadata";
import type {
  AgentInput,
  AppProfileData,
  Fact,
  KeywordMetrics,
  Recommendation,
  RecommendedKeyword,
  ValidationIssue,
  ValidationReport,
} from "./contract";

export type DraftKeyword = Omit<RecommendedKeyword, "metrics"> & { metrics?: KeywordMetrics | null };
/** What the composer (or an MCP client) proposes, before code attaches metrics and the validation report. */
export type RecommendationDraft = Omit<Recommendation, "validation" | "keywords"> & { keywords: DraftKeyword[] };

const chars = (s: string) => [...s].length;
const PRICING = new Set(["free", "sale", "discount"]);
/** A price written with a currency symbol: "$4.99", "€2", "4,99 €", "£1". */
const PRICE_RE = /[$€£¥]\s?\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s?[$€£¥]/g;

/** Trim, lowercase, collapse spaces, drop spaces after commas and empty or repeated entries. */
export function normalizeKeywordField(raw: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,，]/)) {
    const p = part.trim().toLowerCase().replace(/\s+/g, " ");
    if (p && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out.join(",");
}

const clean = (s: unknown, max: number) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** Normalizes a draft from the composer or an untrusted MCP client: trims fields, formats the keyword field, dedupes keywords. */
export function normalizeDraft(d: RecommendationDraft): RecommendationDraft {
  const seen = new Set<string>();
  const keywords: DraftKeyword[] = [];
  for (const k of d.keywords ?? []) {
    const term = normalize(String(k.term ?? "")).slice(0, 60);
    if (term.length < 2 || seen.has(term)) continue;
    seen.add(term);
    keywords.push({
      term,
      role: k.role === "primary" || k.role === "long_tail" ? k.role : "secondary",
      placement: k.placement === "name" || k.placement === "subtitle" ? k.placement : "keywords",
      why: clean(k.why, 400),
      factIds: [...new Set((k.factIds ?? []).map((f) => clean(f, 12)).filter(Boolean))].slice(0, 12),
      ...(k.metrics !== undefined ? { metrics: k.metrics } : {}),
    });
  }
  return {
    name: clean(d.name, 200),
    subtitle: clean(d.subtitle, 200),
    keywordField: normalizeKeywordField(String(d.keywordField ?? "").slice(0, 1000)),
    alternatives: (d.alternatives ?? [])
      .slice(0, 3)
      .map((a) => ({ name: clean(a.name, 200), subtitle: clean(a.subtitle, 200), why: clean(a.why, 400) }))
      .filter((a) => a.name),
    keywords: keywords.slice(0, 40),
    rationale: clean(d.rationale, 2000),
  };
}

// ------------------------------------------------------------------ helpers

/** A word set where each word also stands for its singular form, so "climbs" matches "climb" and back. */
const wordSet = (words: string[]) => new Set(words.flatMap((w) => [w, singular(w)]));
const hasWord = (set: Set<string>, w: string) => set.has(w) || set.has(singular(w));

/** The run's own app listing, when the evidence has one. */
export function ownProfile(facts: Fact[], input: Pick<AgentInput, "appId">): AppProfileData | null {
  const f = facts.find((x) => x.kind === "app_profile" && (input.appId == null || x.data.appId === input.appId));
  return f?.kind === "app_profile" ? f.data : null;
}

const hasPhrase = (hay: string[], needle: string[]) => {
  if (!needle.length || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) if (needle.every((w, j) => hay[i + j] === w)) return true;
  return false;
};

/** "Day One: Daily Journal & Diary" → "Day One". Null when the title has no "Name: descriptor" split. */
export function brandSegment(title: string): string | null {
  const parts = title.split(/\s*[:|]\s*|\s+[-–—]\s+/);
  return parts.length > 1 && parts[0].trim() ? parts[0].trim() : null;
}

type FieldTexts = { name: string; subtitle: string; keywordField: string };

/** Which fields contain the phrase (contiguous words; within one keyword entry or across adjacent ones). */
function fieldsWith(phrase: string[], f: FieldTexts): ("name" | "subtitle" | "keywords")[] {
  const out: ("name" | "subtitle" | "keywords")[] = [];
  if (hasPhrase(tokens(f.name), phrase)) out.push("name");
  if (hasPhrase(tokens(f.subtitle), phrase)) out.push("subtitle");
  if (hasPhrase(keywordFieldTokens(f.keywordField), phrase)) out.push("keywords");
  return out;
}

export type BrandContext = {
  /** Brand-flagged scored terms (another app's name people search for). */
  brandTerms: string[];
  /** Distinctive "Name" parts of the top competitors' titles. */
  competitorNames: string[];
};

/**
 * Competitor brands seen in the evidence, minus the run's own app (name, seller, keepBrand).
 * A competitor title segment counts only when it's distinctive: it isn't a non-brand keyword we scored, and not
 * all of its words are vocabulary (words of non-brand scored keywords, or words 3+ competitors use in their names).
 */
export function brandContext(facts: Fact[], input: Pick<AgentInput, "appId" | "keepBrand">): BrandContext {
  const ownData = ownProfile(facts, input);
  const exemptPhrases = [input.keepBrand, ownData?.name, ownData ? brandSegment(ownData.name) : null, ownData?.seller]
    .map((s) => normalize(s ?? ""))
    .filter((s) => s.length > 1);
  const isExempt = (phrase: string) => exemptPhrases.some((e) => e === phrase || hasPhrase(tokens(e), tokens(phrase)));

  const scores = facts.flatMap((f) => (f.kind === "keyword_score" ? [f.data] : []));
  const genericTerms = new Set(scores.filter((s) => !s.brand).map((s) => normalize(s.term)));

  const brandTerms = new Set<string>();
  for (const s of scores) {
    if (!s.brand) continue;
    const t = normalize(s.term);
    // when the #1 app for the term is the run's own app, the "brand" is ours
    if (input.appId != null && s.top[0]?.id === input.appId) continue;
    if (t.length > 1 && !isExempt(t)) brandTerms.add(t);
  }

  const apps = new Map<number, string>();
  for (const s of scores) for (const a of s.top) if (a.id !== input.appId) apps.set(a.id, a.name);
  const wordApps = new Map<string, number>();
  for (const name of apps.values()) for (const w of new Set(tokens(name))) wordApps.set(w, (wordApps.get(w) ?? 0) + 1);
  // vocabulary: words of keywords we scored as non-brand, and words 3+ competitors use in their names
  const vocab = new Set([...genericTerms].flatMap((t) => tokens(t)));
  const isVocab = (w: string) => STOP_WORDS.has(w) || vocab.has(w) || (wordApps.get(w) ?? 0) >= 3;

  const competitorNames = new Set<string>();
  for (const name of apps.values()) {
    const seg = brandSegment(name);
    if (!seg) continue;
    const words = tokens(seg);
    const phrase = words.join(" ");
    if (phrase.length < 3 || words.every((w) => STOP_WORDS.has(w))) continue;
    if (genericTerms.has(phrase) || isExempt(phrase)) continue;
    if (words.every(isVocab)) continue;
    competitorNames.add(phrase);
  }
  return { brandTerms: [...brandTerms], competitorNames: [...competitorNames] };
}

function brandIssues(f: FieldTexts, ctx: BrandContext, where: "main" | "alternative"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const check = (phrase: string, rule: string, what: string) => {
    for (const field of fieldsWith(tokens(phrase), f)) {
      issues.push({
        level: "error",
        field,
        rule,
        message:
          where === "main"
            ? `"${phrase}" is ${what}. App Review Guideline 2.3.7 forbids other apps' names in your metadata.`
            : `Alternative "${f.name}" uses "${phrase}", ${what} (Guideline 2.3.7).`,
      });
    }
  };
  for (const t of ctx.brandTerms)
    check(t, where === "main" ? "brand.competitor" : "alternative.brand", "another app's brand (search data flags it as a brand keyword)");
  for (const n of ctx.competitorNames)
    if (!ctx.brandTerms.includes(n)) check(n, where === "main" ? "brand.competitor_name" : "alternative.brand", "a competitor's app name");
  return issues;
}

/** Do the term's words sit in the field the keyword claims? */
function placementOk(term: string, placement: RecommendedKeyword["placement"], f: FieldTexts): boolean {
  const words = tokens(term).filter((w) => !STOP_WORDS.has(w) || tokens(term).length === 1);
  if (!words.length) return false;
  const has = (set: Set<string>, w: string) => set.has(w) || set.has(singular(w));
  const N = new Set(tokens(f.name));
  const S = new Set(tokens(f.subtitle));
  const K = new Set(keywordFieldTokens(f.keywordField));
  if (placement === "name") return words.every((w) => has(N, w));
  if (placement === "subtitle") return words.every((w) => has(S, w) || has(N, w)) && words.some((w) => has(S, w));
  return words.every((w) => has(N, w) || has(S, w) || has(K, w));
}

// ------------------------------------------------------------------ the validator

export function validateRecommendation(
  draft: RecommendationDraft,
  facts: Fact[],
  input: Pick<AgentInput, "appId" | "keepBrand">,
): ValidationReport {
  const issues: ValidationIssue[] = [];
  const add = (level: ValidationIssue["level"], field: ValidationIssue["field"], rule: string, message: string) =>
    issues.push({ level, field, rule, message });

  const name = draft.name ?? "";
  const subtitle = draft.subtitle ?? "";
  const kw = draft.keywordField ?? "";
  const usage = { name: chars(name), subtitle: chars(subtitle), keywords: chars(kw), keywordBytes: utf8Bytes(kw) };
  const f: FieldTexts = { name, subtitle, keywordField: kw };

  // Apple-documented limits (App Store Connect Help: name 30, subtitle 30, keywords 100 characters)
  if (!name.trim()) add("error", "name", "name.empty", "The app name is empty.");
  if (usage.name > LIMITS.name)
    add("error", "name", "name.length", `App name is ${usage.name}/${LIMITS.name} characters. App Store Connect rejects names over 30.`);
  if (usage.subtitle > LIMITS.subtitle)
    add("error", "subtitle", "subtitle.length", `Subtitle is ${usage.subtitle}/${LIMITS.subtitle} characters. The limit is 30.`);
  if (!subtitle.trim()) add("warn", "subtitle", "subtitle.empty", "No subtitle: it's an indexed field with 30 characters to use.");
  if (usage.keywords > LIMITS.keywords)
    add(
      "error",
      "keywords",
      "keywords.length",
      `Keyword field is ${usage.keywords}/${LIMITS.keywords} characters (${usage.keywordBytes} bytes in UTF-8). The limit is 100.`,
    );
  if (!kw.trim()) add("warn", "keywords", "keywords.empty", "The keyword field is empty: 100 indexed characters unused.");
  if (/,\s/.test(kw))
    add("warn", "keywords", "keywords.spaces", "Spaces after commas waste characters. Separate keywords with commas only.");

  // Apple: don't repeat words in the keyword field, and plurals of included words count as duplicates ("climb"/"climbs")
  const kwTokens = keywordFieldTokens(kw);
  const bySingular = new Map<string, string[]>();
  for (const t of kwTokens) bySingular.set(singular(t), [...(bySingular.get(singular(t)) ?? []), t]);
  const repeated = [...bySingular.values()].filter((v) => v.length > 1).map((v) => [...new Set(v)].join("/"));
  if (repeated.length)
    add(
      "warn",
      "keywords",
      "keywords.duplicate",
      `Repeated inside the keyword field: ${repeated.join(", ")}. Apple counts plurals as duplicates; each word only needs to appear once.`,
    );
  const nameSub = wordSet([...tokens(name), ...tokens(subtitle)]);
  const inName = [...new Set(kwTokens.filter((t) => hasWord(nameSub, t)))];
  if (inName.length)
    add(
      "warn",
      "keywords",
      "keywords.in_name",
      `Already in the name or subtitle (wasted in the keyword field): ${inName.join(", ")}. Apple says not to repeat those words, plurals included.`,
    );
  const genre = ownProfile(facts, input)?.genre ?? null;
  const category = wordSet(tokens(genre).filter((w) => !STOP_WORDS.has(w)));
  const inCategory = [...new Set(kwTokens.filter((t) => hasWord(category, t)))];
  if (inCategory.length)
    add(
      "warn",
      "keywords",
      "keywords.category",
      `Words of the app's category (${genre}) are in the keyword field: ${inCategory.join(", ")}. Apple says not to repeat category words there.`,
    );
  // industry-observed (not Apple): a name word repeated in the subtitle adds no coverage
  const nameWords = wordSet(tokens(name).filter((w) => !STOP_WORDS.has(w)));
  const repeatsName = [...new Set(tokens(subtitle).filter((w) => !STOP_WORDS.has(w) && hasWord(nameWords, w)))];
  if (repeatsName.length)
    add(
      "warn",
      "subtitle",
      "subtitle.repeats_name",
      `Subtitle repeats words from the name: ${repeatsName.join(", ")}. Industry-observed, not documented by Apple: repeating a name word in the subtitle doesn't appear to add search coverage, so those characters could target other keywords.`,
    );

  // App Review Guideline 2.3.7: no "pricing information" in metadata; names and subtitles "should not include prices"
  for (const [field, text] of [
    ["name", name],
    ["subtitle", subtitle],
  ] as const) {
    const found = [...new Set(tokens(text).filter((w) => PRICING.has(w) || PRICING.has(singular(w))))];
    if (/%\s*off\b/i.test(text)) found.push("% off");
    for (const m of text.matchAll(PRICE_RE)) found.push(m[0].trim());
    if (found.length)
      add(
        "warn",
        field,
        "metadata.pricing",
        `The ${field} mentions pricing (${[...new Set(found)].map((w) => `"${w}"`).join(", ")}). App Review Guideline 2.3.7: metadata such as app names and subtitles should not include prices or pricing information.`,
      );
  }

  // Guideline 2.3.7: subtitles should not "make unverifiable product claims"
  const claims: string[] = [];
  const sub = normalize(subtitle);
  if (/#\s?1(?!\d)/.test(subtitle)) claims.push("#1");
  if (/\bnumber one\b|\bno\.?\s?1(?!\d)/i.test(subtitle)) claims.push("number one");
  if (/\bworlds best\b/.test(sub)) claims.push("world's best");
  else if (/\bbest\b/.test(sub)) claims.push("best");
  if (/\btop rated\b/.test(sub)) claims.push("top rated");
  if (claims.length)
    add(
      "warn",
      "subtitle",
      "subtitle.claims",
      `The subtitle makes an unverifiable claim (${claims.map((c) => `"${c}"`).join(", ")}). App Review Guideline 2.3.7: subtitles should not make unverifiable product claims.`,
    );

  // Apple's keyword guidance (App Store product page): avoid the word "app" and special characters such as # or @
  const appWords = [...new Set(kwTokens.filter((t) => t === "app" || t === "apps"))];
  const special = [...new Set(kw.match(/[#@]/g) ?? [])];
  if (appWords.length || special.length)
    add(
      "warn",
      "keywords",
      "keywords.app_word",
      `The keyword field contains ${[...appWords.map((w) => `"${w}"`), ...special.map((c) => `"${c}"`)].join(", ")}. Apple's keyword guidance says to avoid the word "app" and special characters such as # or @.`,
    );

  // Guideline 2.3.7: no other apps' names
  const ctx = brandContext(facts, input);
  issues.push(...brandIssues(f, ctx, "main"));

  const keep = normalize(input.keepBrand ?? "");
  if (keep && !hasPhrase(tokens(name), tokens(keep)))
    add("error", "name", "brand.keep_missing", `The name must keep your brand "${input.keepBrand}".`);

  // alternatives follow the same limits and brand rules
  for (const a of draft.alternatives ?? []) {
    if (chars(a.name) > LIMITS.name)
      add("error", "name", "alternative.length", `Alternative name "${a.name}" is ${chars(a.name)}/30 characters.`);
    if (chars(a.subtitle) > LIMITS.subtitle)
      add("error", "subtitle", "alternative.length", `Alternative subtitle "${a.subtitle}" is ${chars(a.subtitle)}/30 characters.`);
    issues.push(...brandIssues({ name: a.name, subtitle: a.subtitle, keywordField: "" }, ctx, "alternative"));
    if (keep && !hasPhrase(tokens(a.name), tokens(keep)))
      add("warn", "name", "alternative.keep_missing", `Alternative "${a.name}" drops your brand "${input.keepBrand}".`);
  }

  // recommended keywords must rest on evidence
  const ids = new Set(facts.map((x) => x.id));
  const scored = new Map<string, boolean>();
  for (const x of facts) if (x.kind === "keyword_score") scored.set(normalize(x.data.term), x.data.brand);
  for (const k of draft.keywords ?? []) {
    const term = normalize(k.term);
    const unknown = (k.factIds ?? []).filter((id) => !ids.has(id));
    if (unknown.length) add("error", "all", "keyword.unknown_fact", `"${k.term}" cites facts that don't exist: ${unknown.join(", ")}.`);
    if (!scored.has(term))
      add("warn", "all", "keyword.unscored", `"${k.term}" was never scored, so its popularity and difficulty are unknown.`);
    else if (scored.get(term) && ctx.brandTerms.includes(term))
      add("warn", "all", "keyword.brand", `"${k.term}" is another app's brand keyword: it can't be won and can't go in your metadata.`);
    if (!placementOk(term, k.placement, f)) {
      const where = k.placement === "keywords" ? "the name, subtitle or keyword field" : `the ${k.placement}`;
      add(
        "warn",
        k.placement === "keywords" ? "keywords" : k.placement,
        "keyword.placement",
        `"${k.term}" is meant for ${where}, but its words aren't all there.`,
      );
    }
  }

  return { ok: !issues.some((i) => i.level === "error"), issues, usage };
}
