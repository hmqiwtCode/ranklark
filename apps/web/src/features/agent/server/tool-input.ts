/**
 * Validation of untrusted data-tool input (from Claude or an MCP client). Pure: no DB or network, so the
 * orchestrator loop and its tests can use it without loading server modules.
 */
import { isCountry } from "@ranklark/core/apple";
import { normalize } from "@ranklark/core/metadata";
import { SCORE_BATCH, type ToolInputs, type ToolName } from "../lib/contract";

export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

export const TOOL_NAMES = ["get_app_profile", "expand_keywords", "score_keywords", "competitor_phrases", "check_metadata"] as const;
export const isToolName = (v: unknown): v is ToolName => TOOL_NAMES.includes(v as ToolName);

const isLink = (s: string) => /https?:\/\/|apps\.apple\.com/i.test(s);

/** Same rules as cleanTerms() in features/keywords/server/track.ts: normalized, 2–60 characters, no links, unique. */
export function cleanTermList(raw: unknown, max: number): string[] {
  const list = Array.isArray(raw)
    ? raw.slice(0, 200).map((t) => String(t ?? "").slice(0, 200))
    : String(raw ?? "")
        .slice(0, 4000)
        .split(/[,\n]/);
  return [
    ...new Set(
      list
        .filter((t) => !isLink(t))
        .map((t) => normalize(t))
        .filter((t) => t.length > 1 && t.length <= 60),
    ),
  ].slice(0, max);
}

const obj = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

export function parseCountry(v: unknown): string {
  const c = String(v ?? "")
    .trim()
    .toLowerCase();
  if (!isCountry(c)) throw new ToolInputError(`Unknown storefront "${String(v ?? "").slice(0, 10)}". Use a two-letter code such as "us".`);
  return c;
}

export function parseAppId(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 99_999_999_999) throw new ToolInputError("appId must be a numeric App Store ID.");
  return n;
}

export function parseTerm(v: unknown, what: string): string {
  const raw = String(v ?? "");
  if (isLink(raw)) throw new ToolInputError(`${what} is an app link, not a keyword.`);
  const t = normalize(raw.slice(0, 200));
  if (t.length < 2 || t.length > 60) throw new ToolInputError(`${what} must be 2–60 characters.`);
  return t;
}

export const cleanText = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** Validates and normalizes untrusted tool input. Throws ToolInputError with a message fit for the caller. */
export function parseToolInput<N extends ToolName>(name: N, raw: unknown): ToolInputs[N] {
  const r = obj(raw);
  switch (name) {
    case "get_app_profile":
      return { appId: parseAppId(r.appId), country: parseCountry(r.country) } as ToolInputs[N];
    case "expand_keywords":
      return { seed: parseTerm(r.seed, "seed"), country: parseCountry(r.country), deep: r.deep === true } as ToolInputs[N];
    case "score_keywords": {
      const terms = cleanTermList(r.terms, SCORE_BATCH);
      if (!terms.length) throw new ToolInputError(`terms must list 1–${SCORE_BATCH} keywords (2–60 characters each).`);
      const appId = r.appId == null || r.appId === "" ? null : parseAppId(r.appId);
      return { terms, country: parseCountry(r.country), appId } as ToolInputs[N];
    }
    case "competitor_phrases":
      return { term: parseTerm(r.term, "term"), country: parseCountry(r.country) } as ToolInputs[N];
    case "check_metadata":
      return {
        name: cleanText(r.name, 300),
        subtitle: cleanText(r.subtitle, 300),
        keywordField: String(r.keywordField ?? "").slice(0, 500),
        terms: cleanTermList(Array.isArray(r.terms) ? r.terms : [], 50),
      } as ToolInputs[N];
    default:
      throw new ToolInputError(`Unknown tool "${String(name).slice(0, 40)}".`);
  }
}
