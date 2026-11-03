/** Validation of a run request (from the start form or the MCP start_research_run tool). Pure. */
import { isCountry } from "@ranklark/core/apple";
import type { AgentGoal, AgentInput } from "../lib/contract";
import { cleanTermList, cleanText, parseAppId, ToolInputError } from "./tool-input";

/** Returns a clean AgentInput, or an error message for the user. */
export function parseAgentInput(raw: unknown): { input: AgentInput } | { error: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  let appId: number | null = null;
  if (r.appId != null && r.appId !== "") {
    try {
      appId = parseAppId(r.appId);
    } catch (e) {
      return { error: e instanceof ToolInputError ? e.message : "Invalid appId." };
    }
  }
  const country = String(r.country ?? "")
    .trim()
    .toLowerCase();
  if (!isCountry(country)) return { error: "Pick a storefront (country) from the list." };
  const idea = cleanText(r.idea, 1000);
  if (appId == null && idea.length < 3) return { error: "Pick an app, paste its App Store link, or describe your idea." };
  const goal: AgentGoal = r.goal === "new_app" || r.goal === "improve" ? r.goal : appId == null ? "new_app" : "improve";
  return {
    input: {
      appId,
      country,
      idea,
      seeds: cleanTermList(r.seeds ?? [], 10),
      goal,
      keepBrand: cleanText(r.keepBrand, 30),
      notes: cleanText(r.notes, 500),
    },
  };
}
