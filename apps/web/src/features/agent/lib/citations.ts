/**
 * Deterministic citation check for a finding (the "rules" half of the checker). Pure and client-safe.
 *
 *  - A finding that cites no facts, or cites a fact ID that doesn't exist, is unsupported (by "rules").
 *  - Every number written in the claim should appear in one of the cited facts (data or code-written summary).
 *    Numbers that don't are NOT auto-rejected (they may be harmless, e.g. "top 10"); they are returned as
 *    `unmatchedNumbers` so the checker model has to rule on them explicitly.
 */
import { tokens } from "@ranklark/core/metadata";
import type { Fact, Finding, FindingVerdict } from "./contract";

export type ClaimNumber = {
  /** As written, e.g. "120k", "4.8", "45%". */
  raw: string;
  /** Digits as written, before any k/M/B scale (120 for "120k"). */
  base: number;
  /** Multiplier from the suffix: 1, 1e3, 1e6, 1e9. */
  scale: number;
  /** Decimal places as written (1 for "4.8"). */
  decimals: number;
  percent: boolean;
};

const NUM_RE =
  /(?<![\p{L}\p{N}.])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:(\s?%)|\s?(million|thousand|billion)\b|([kKmMbB])(?![\p{L}\p{N}]))?(?![\p{L}\p{N}])/gu;

const SCALE: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, billion: 1e9 };

/** Numbers written in free text: "118,836", "4.8", "120k", "1.2M", "45%", "#3". Digits glued to letters (F12, 3x) are ignored. */
export function extractNumbers(text: string): ClaimNumber[] {
  const out: ClaimNumber[] = [];
  for (const m of text.matchAll(NUM_RE)) {
    const int = m[1].replace(/,/g, "");
    const dec = m[2] ?? "";
    const word = m[4]?.toLowerCase();
    const letter = m[5]?.toLowerCase();
    out.push({
      raw: m[0].trim(),
      base: Number(dec ? `${int}.${dec}` : int),
      scale: SCALE[word ?? letter ?? ""] ?? 1,
      decimals: dec.length,
      percent: !!m[3],
    });
  }
  return out;
}

/** Every number in a fact: numeric fields at any depth, numbers inside its strings, and its code-written summary. */
export function factNumbers(fact: Fact): number[] {
  const out: number[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 8 || v == null) return;
    if (typeof v === "number") {
      if (Number.isFinite(v)) out.push(v);
    } else if (typeof v === "string") {
      for (const n of extractNumbers(v)) out.push(n.base * n.scale);
    } else if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
    } else if (typeof v === "object") {
      for (const x of Object.values(v as Record<string, unknown>)) walk(x, depth + 1);
    }
  };
  walk(fact.data, 0);
  walk(fact.summary, 0);
  return out;
}

const roundTo = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
const truncTo = (x: number, d: number) => Math.trunc(x * 10 ** d) / 10 ** d;
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** Does a number written in a claim match a fact value, allowing the rounding and k/M/% styles people write? */
export function numberMatches(c: ClaimNumber, value: number): boolean {
  const candidates = [value / c.scale];
  if (c.percent) candidates.push((value * 100) / c.scale);
  for (const v of candidates) {
    if (close(roundTo(v, c.decimals), c.base) || close(truncTo(v, c.decimals), c.base)) return true;
  }
  return false;
}

export type CitationCheck = {
  /** Set only when the rules alone decide the finding is unsupported. */
  verdict: FindingVerdict | null;
  unknownFactIds: string[];
  /** Numbers in the claim found in none of the cited facts (the checker model must rule on these). */
  unmatchedNumbers: string[];
};

export function checkFinding(
  finding: Pick<Finding, "claim" | "terms" | "factIds">,
  facts: ReadonlyMap<string, Fact> | Fact[],
): CitationCheck {
  const byId = Array.isArray(facts) ? new Map(facts.map((f) => [f.id, f])) : facts;
  const ids = [...new Set(finding.factIds)];
  if (!ids.length) {
    return { verdict: { status: "unsupported", note: "Cites no facts.", by: "rules" }, unknownFactIds: [], unmatchedNumbers: [] };
  }
  const unknown = ids.filter((id) => !byId.has(id));
  if (unknown.length) {
    return {
      verdict: { status: "unsupported", note: `Cites facts that don't exist: ${unknown.join(", ")}.`, by: "rules" },
      unknownFactIds: unknown,
      unmatchedNumbers: [],
    };
  }
  // numbers that are part of the finding's own keywords ("2048 puzzle", "top 10 games") are not claims
  const termNumbers = new Set(
    finding.terms
      .flatMap((t) => tokens(t))
      .filter((w) => /^\d+$/.test(w))
      .map(Number),
  );
  const values = ids.flatMap((id) => factNumbers(byId.get(id)!));
  const unmatched: string[] = [];
  for (const n of extractNumbers(finding.claim)) {
    if (n.scale === 1 && !n.percent && n.decimals === 0 && termNumbers.has(n.base)) continue;
    if (!values.some((v) => numberMatches(n, v))) unmatched.push(n.raw);
  }
  return { verdict: null, unknownFactIds: [], unmatchedNumbers: [...new Set(unmatched)] };
}
