/**
 * Deterministic stand-in for Claude, for tests and keyless end-to-end runs (RANKLARK_AGENT_SCRIPTED=1).
 * It makes plausible choices from the facts it is given and, like the real roles, never writes a number that
 * isn't in a cited fact. Labelled "scripted-test" everywhere; never a default.
 */
import { LIMITS, normalize, STOP_WORDS, singular, tokens } from "@ranklark/core/metadata";
import { ZERO_USAGE } from "../lib/contract";
import { brandContext, brandSegment, validateRecommendation } from "../lib/validate";
import { type AgentLlm, type LlmCall, LlmError, type LlmResult } from "./llm";
import type {
  AnalystData,
  AnalystOutputT,
  CheckerData,
  CheckerOutputT,
  ComposerData,
  ComposerOutputT,
  PlannerData,
  PlannerOutputT,
} from "./prompts";

export const SCRIPTED_MODEL = "scripted-test";

/** Scripted mode is opt-in and refused in production unless explicitly allowed for a local end-to-end check. */
export function scriptedMode(): boolean {
  if (process.env.RANKLARK_AGENT_SCRIPTED !== "1") return false;
  return process.env.NODE_ENV !== "production" || process.env.RANKLARK_AGENT_SCRIPTED_ALLOW_PRODUCTION === "1";
}

const title = (t: string) => t.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
const len = (s: string) => [...s].length;

function seedsFrom(d: PlannerData): string[] {
  const out: string[] = [];
  const push = (s: string | null | undefined) => {
    const t = normalize(s ?? "");
    if (t.length >= 2 && t.length <= 60 && !out.includes(t)) out.push(t);
  };
  for (const s of d.input.seeds) push(s);
  if (d.profile) {
    const parts = d.profile.name.split(/\s*[:|]\s*|\s+[-–—]\s+/);
    push(parts.length > 1 ? parts[1] : d.profile.name);
  }
  if (d.input.idea)
    push(
      tokens(d.input.idea)
        .filter((w) => !STOP_WORDS.has(w))
        .slice(0, 2)
        .join(" "),
    );
  return out.slice(0, 2);
}

function plan(d: PlannerData): PlannerOutputT {
  const keywordsLeft = d.budgets.keywordsLimit - d.budgets.keywordsUsed;
  const scored = new Set(d.scoredTerms);
  if (d.iteration === 1) {
    const seeds = seedsFrom(d);
    return {
      hypotheses: seeds.map((s) => `People search for "${s}" when looking for this kind of app.`),
      tasks: [
        ...seeds.map((s) => ({
          tool: "expand_keywords" as const,
          terms: [s],
          deep: false,
          why: "Find the real search phrases around the app's core use.",
        })),
        ...(seeds.length ? [{ tool: "score_keywords" as const, terms: seeds, deep: false, why: "Measure the seeds themselves." }] : []),
      ],
    };
  }
  // later: score the best autocomplete suggestions not scored yet, and look at competitor titles for the best term
  const candidates: string[] = [];
  for (const f of d.facts)
    if (f.kind === "suggestions")
      for (const i of f.data.items) if (!scored.has(i.term) && !candidates.includes(i.term)) candidates.push(i.term);
  const terms = candidates.slice(0, Math.max(0, Math.min(10, keywordsLeft)));
  const best = d.facts
    .flatMap((f) => (f.kind === "keyword_score" && !f.data.brand && f.data.opportunity != null ? [f.data] : []))
    .sort((a, b) => (b.opportunity ?? 0) - (a.opportunity ?? 0))[0];
  const phrased = new Set(d.facts.flatMap((f) => (f.kind === "competitor_phrases" ? [f.data.term] : [])));
  return {
    hypotheses: terms.length ? ["Some autocomplete suggestions have better opportunity than the seeds."] : [],
    tasks: [
      ...(terms.length ? [{ tool: "score_keywords" as const, terms, deep: false, why: "Score the top autocomplete suggestions." }] : []),
      ...(best && !phrased.has(best.term) && d.budgets.appleLimit - d.budgets.appleUsed > 5
        ? [{ tool: "competitor_phrases" as const, terms: [best.term], deep: false, why: "See which phrases the leaders use." }]
        : []),
    ],
  };
}

function analyse(d: AnalystData): AnalystOutputT {
  const covered = new Set(d.previous.flatMap((f) => f.terms));
  const out: AnalystOutputT["findings"] = [];
  const scores = d.facts
    .flatMap((f) => (f.kind === "keyword_score" && !covered.has(f.data.term) ? [{ id: f.id, s: f.data }] : []))
    .sort((a, b) => (b.s.opportunity ?? -1) - (a.s.opportunity ?? -1));
  for (const { id, s } of scores) {
    if (s.brand)
      out.push({
        kind: "risk",
        claim: `"${s.term}" is another app's brand keyword; avoid it.`,
        terms: [s.term],
        factIds: [id],
        confidence: "high",
      });
    else if (s.opportunity != null)
      out.push({
        kind: "opportunity",
        claim: `"${s.term}" has opportunity ${s.opportunity} (popularity ${s.popularity}, difficulty ${s.difficulty}).`,
        terms: [s.term],
        factIds: [id],
        confidence: s.popSource === "apple_ads" ? "high" : "medium",
      });
    else
      out.push({
        kind: "insight",
        claim: `"${s.term}" has no usable popularity signal, so its opportunity is unknown.`,
        terms: [s.term],
        factIds: [id],
        confidence: "low",
      });
  }
  for (const f of d.facts) {
    if (f.kind !== "competitor_phrases" || covered.has(f.data.term) || !f.data.phrases[0]) continue;
    const p = f.data.phrases[0];
    out.push({
      kind: "insight",
      claim: `Top apps for "${f.data.term}" share the phrase "${p.phrase}" in their names (${p.apps} apps).`,
      terms: [f.data.term],
      factIds: [f.id],
      confidence: "medium",
    });
  }
  return { findings: out.slice(0, 8) };
}

function check(d: CheckerData): CheckerOutputT {
  const appleLeft = d.budgets.appleLimit - d.budgets.appleUsed;
  const kwLeft = d.budgets.keywordsLimit - d.budgets.keywordsUsed;
  const converged = d.iteration >= 2 || appleLeft <= 0 || kwLeft <= 0;
  return {
    verdicts: d.items.map((x) =>
      x.unmatchedNumbers.length
        ? {
            findingId: x.finding.id,
            status: "unsupported" as const,
            note: `Numbers not in the cited facts: ${x.unmatchedNumbers.join(", ")}.`,
          }
        : { findingId: x.finding.id, status: "supported" as const, note: "Matches the cited facts." },
    ),
    converged,
    reason: converged ? "Scripted checker: converges after two iterations." : "Scripted checker: one more round to score suggestions.",
    gaps: converged ? [] : ["Score the top autocomplete suggestions."],
  };
}

function compose(d: ComposerData): ComposerOutputT {
  const ctx = brandContext(d.facts, d.input);
  const banned = [...ctx.brandTerms, ...ctx.competitorNames].map((b) => tokens(b));
  const usesBanned = (t: string) => {
    const w = tokens(t);
    return banned.some((b) => b.every((x) => w.includes(x)));
  };
  // the core audit's low-value words: never worth name, subtitle or keyword-field characters ("free" is also pricing)
  // plus pricing words (Guideline 2.3.7), which also keeps them out of the name and subtitle
  const LOW_VALUE = new Set(["app", "apps", "free", "iphone", "ipad", "best", "sale", "discount"]);
  const meaningful = (w: string) => !STOP_WORDS.has(w) && !LOW_VALUE.has(w);
  const ranked = d.facts
    .flatMap((f) =>
      f.kind === "keyword_score" &&
      !f.data.brand &&
      f.data.opportunity != null &&
      !usesBanned(f.data.term) &&
      !tokens(f.data.term).some((w) => LOW_VALUE.has(w)) &&
      !/\btop rated\b|\bnumber one\b/.test(f.data.term)
        ? [{ id: f.id, s: f.data }]
        : [],
    )
    .sort((a, b) => (b.s.opportunity ?? 0) - (a.s.opportunity ?? 0) || (b.s.popularity ?? 0) - (a.s.popularity ?? 0));
  const brand = d.input.keepBrand.trim() || (d.profile ? brandSegment(d.profile.name) : null);

  const fits = (s: string, max: number) => len(s) <= max;
  const nameFor = (term: string) => (brand ? `${brand}: ${title(term)}` : title(term));
  let nameIdx = ranked.findIndex((r) => fits(nameFor(r.s.term), LIMITS.name));
  if (nameIdx < 0) nameIdx = 0;
  const primary = ranked[nameIdx];
  const name = primary ? nameFor(primary.s.term) : (brand ?? "App");
  const used = new Set(tokens(name));

  // subtitle: never repeat a name word. First whole terms that share no word with the name, then only the
  // words a term adds beyond it ("habit tracker with friends" next to "Habit Tracker Widget" → "Friends")
  const subtitleTerms: typeof ranked = [];
  const parts: string[] = [];
  const tryAdd = (r: (typeof ranked)[number], phrase: string) => {
    const next = [...parts, phrase].join(" & ");
    if (!fits(next, LIMITS.subtitle)) return;
    parts.push(phrase);
    subtitleTerms.push(r);
    for (const w of tokens(r.s.term)) used.add(w);
  };
  for (const r of ranked) {
    if (subtitleTerms.length >= 2) break;
    const ws = tokens(r.s.term);
    if (r === primary || ws.some((w) => meaningful(w) && used.has(w))) continue;
    tryAdd(r, title(r.s.term));
  }
  for (const r of ranked) {
    if (subtitleTerms.length >= 2) break;
    if (r === primary || subtitleTerms.includes(r)) continue;
    const extra = tokens(r.s.term).filter((w) => meaningful(w) && !used.has(w));
    if (extra.length) tryAdd(r, title(extra.join(" ")));
  }
  const subtitle = parts.join(" & ");

  const seen = (set: Set<string>, w: string) => set.has(w) || set.has(singular(w)) || [...set].some((x) => singular(x) === singular(w));
  const category = new Set(tokens(d.profile?.genre).filter((w) => !STOP_WORDS.has(w)));
  const words: string[] = [];
  const longTail: typeof ranked = [];
  for (const r of ranked) {
    if (r === primary || subtitleTerms.includes(r)) continue;
    // Apple: no word already in the name, subtitle or category, and plurals count as the same word
    const fresh = tokens(r.s.term).filter(
      (w) => meaningful(w) && !seen(used, w) && !seen(category, w) && !words.some((x) => singular(x) === singular(w)),
    );
    if ([...words, ...fresh].join(",").length > LIMITS.keywords) continue;
    words.push(...fresh);
    longTail.push(r);
  }

  const kw = [
    ...(primary
      ? [
          {
            term: primary.s.term,
            role: "primary" as const,
            placement: "name" as const,
            why: "Best opportunity among the scored keywords.",
            factIds: [primary.id],
          },
        ]
      : []),
    ...subtitleTerms.map((r) => ({
      term: r.s.term,
      role: "secondary" as const,
      placement: "subtitle" as const,
      why: "Next-best opportunity.",
      factIds: [r.id],
    })),
    ...longTail.slice(0, 8).map((r) => ({
      term: r.s.term,
      role: "long_tail" as const,
      placement: "keywords" as const,
      why: "Covered by the keyword field.",
      factIds: [r.id],
    })),
  ];

  const alternatives = ranked
    .filter((r) => r !== primary && fits(nameFor(r.s.term), LIMITS.name))
    .slice(0, 2)
    .map((r) => {
      const altName = nameFor(r.s.term);
      // the primary keyword's words that this alternative name doesn't already have
      const rest = primary ? tokens(primary.s.term).filter((w) => meaningful(w) && !tokens(altName).includes(w)) : [];
      const altSubtitle = rest.length && fits(title(rest.join(" ")), LIMITS.subtitle) ? title(rest.join(" ")) : subtitle;
      return { name: altName, subtitle: altSubtitle, why: "Leads with another strong keyword." };
    });

  const out: ComposerOutputT = {
    name,
    subtitle,
    keywordField: words.join(","),
    alternatives,
    keywords: kw,
    rationale:
      "Scripted test model: the name leads with the highest-opportunity non-brand keyword, the subtitle adds the next ones and the keyword field holds the remaining words.",
  };
  // last resort: if a constraint still fails (e.g. keepBrand plus every term too long), fall back to the brand alone
  const report = validateRecommendation({ ...out, keywords: out.keywords }, d.facts, d.input);
  if (report.issues.some((i) => i.rule === "name.length") && brand) out.name = brand.slice(0, LIMITS.name);
  return out;
}

export function createScriptedLlm(): AgentLlm {
  return {
    model: SCRIPTED_MODEL,
    async call<T>(req: LlmCall<T>): Promise<LlmResult<T>> {
      if (req.signal?.aborted) throw new LlmError("aborted", "Cancelled.");
      const data = req.data as never;
      const raw =
        req.role === "planner" ? plan(data) : req.role === "analyst" ? analyse(data) : req.role === "checker" ? check(data) : compose(data);
      return {
        output: req.schema.parse(raw),
        usage: { ...ZERO_USAGE },
        model: SCRIPTED_MODEL,
        thinking: `Scripted ${req.role} step (no model call).`,
      };
    },
  };
}
