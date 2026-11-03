import { hintsHeaders, hintsUrl, parseHints } from "@ranklark/core/apple";
import { normalize } from "@ranklark/core/metadata";
import type { Task, TaskResult } from "@ranklark/core/protocol";
import { apple } from "../apple";

/** Popularity probes: autocomplete for each prefix, shortest first; stop as soon as Apple suggests the term. */
export async function runHints(t: Extract<Task, { kind: "hints" }>): Promise<TaskResult> {
  const target = normalize(t.term);
  const responses: { prefix: string; hints: { term: string }[] }[] = [];
  for (const prefix of t.prefixes) {
    const hints = parseHints(await (await apple(hintsUrl(prefix), hintsHeaders(t.country))).text());
    responses.push({ prefix, hints: hints.map((h) => ({ term: h.term })) });
    if (hints.some((h) => normalize(h.term) === target)) break;
  }
  return { kind: "hints", country: t.country, term: t.term, responses };
}
