/** "Track N keywords" on a finished run: adds the recommended keywords to the run's app. */
import { normalize } from "@ranklark/core/metadata";
import { addApp } from "@/features/apps/server/apps";
import { getApp } from "@/features/keywords/server/queries";
import { trackKeywords } from "@/features/keywords/server/track";
import type { Recommendation } from "../lib/contract";
import { getRunRow } from "./store";

export async function trackRecommendation(
  runId: string,
  only?: unknown,
): Promise<{ added: number; jobId: string | null; terms: string[] } | { error: string; status: number }> {
  const row = getRunRow(runId);
  if (!row) return { error: "Run not found.", status: 404 };
  if (row.app_id == null)
    return { error: "This run is for an app idea, not a published app, so there's nothing to track yet.", status: 400 };
  if (!row.result_json) return { error: "This run has no recommendation.", status: 400 };
  const rec = JSON.parse(row.result_json) as Recommendation;
  let terms = [...new Set(rec.keywords.map((k) => normalize(k.term)).filter((t) => t.length > 1))];
  if (Array.isArray(only)) {
    const pick = new Set(only.slice(0, 100).map((t) => normalize(String(t))));
    terms = terms.filter((t) => pick.has(t));
  }
  if (!terms.length) return { error: "No recommended keywords to track.", status: 400 };
  // keywords belong to one of your apps: add the app first when it isn't in the dashboard yet
  if (!getApp(row.app_id)) {
    try {
      await addApp(row.app_id, row.country);
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e), status: 502 };
    }
  }
  const { added, jobId } = trackKeywords(row.app_id, row.country, terms, "agent");
  return { added, jobId, terms };
}
