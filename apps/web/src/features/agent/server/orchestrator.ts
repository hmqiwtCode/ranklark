/**
 * Starts and cancels AI research runs in the background (like runDynamicJob): the run is persisted, its events
 * stream to the page, and the loop itself lives in loop.ts. The API key stays inside `llm` for the run's lifetime.
 */
import { getApp } from "@/features/keywords/server/queries";
import type { AgentConfig, AgentInput, RunSource } from "../lib/contract";
import type { AgentLlm } from "./llm";
import { type LoopResult, runAgentLoop } from "./loop";
import { appendEvent, createRun, finishRun, getRunRow, setRunTitle } from "./store";
import { runTool } from "./tools";

declare global {
  // eslint-disable-next-line no-var
  var __agentRunControllers: Map<string, AbortController> | undefined;
}
globalThis.__agentRunControllers ??= new Map();
const active: Map<string, AbortController> = globalThis.__agentRunControllers;

export function runTitle(input: AgentInput): string {
  if (input.appId != null) {
    const row = getApp(input.appId);
    return row && row.name !== `App ${row.id}` ? row.name : `App ${input.appId}`;
  }
  const idea = input.idea.replace(/\s+/g, " ").trim();
  return idea.length > 60 ? `${idea.slice(0, 57)}…` : idea || "New app idea";
}

/** Creates the run and starts it in the background. Returns the run id. */
export function startRun(opts: { input: AgentInput; config: AgentConfig; llm: AgentLlm; source?: RunSource }): string {
  const { input, config, llm } = opts;
  const source = opts.source ?? "api";
  const title = runTitle(input);
  const runId = createRun({ title, appId: input.appId, country: input.country, source, model: llm.model, input, config });
  const ctl = new AbortController();
  active.set(runId, ctl);
  let finished = false;
  void runAgentLoop({
    runId,
    title,
    source,
    input,
    config,
    llm,
    tools: runTool,
    emit: (e) => appendEvent(runId, e),
    signal: ctl.signal,
    onProfile: (p) => setRunTitle(runId, p.name),
    finish: (r: LoopResult) => {
      finished = true;
      finishRun(runId, r.status, { recommendation: r.recommendation, error: r.error });
    },
  })
    .catch((e) => {
      // the loop reports its own failures; this only guards against a bug escaping it
      if (finished) return;
      const error = e instanceof Error ? e.message : String(e);
      finishRun(runId, "failed", { error });
      appendEvent(runId, { type: "run.finished", status: "failed", error });
    })
    .finally(() => active.delete(runId));
  return runId;
}

export const isRunActive = (id: string) => active.has(id);

/**
 * Cancels a run. A run driven by this process is aborted (its model call and queued Apple requests stop);
 * a run that is still marked running but has no driver here (an MCP run) is closed directly.
 */
export function cancelRun(id: string): boolean {
  const ctl = active.get(id);
  if (ctl) {
    ctl.abort();
    return true;
  }
  const row = getRunRow(id);
  if (row?.status !== "running") return false;
  finishRun(id, "cancelled", { error: "Cancelled." });
  appendEvent(id, { type: "run.finished", status: "cancelled", error: "Cancelled." });
  return true;
}
