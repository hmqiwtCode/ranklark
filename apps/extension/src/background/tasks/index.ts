/**
 * Task runners, one per task kind from @ranklark/core/protocol.
 * Adding a kind: write `tasks/<kind>.ts` and register it below. The mapped type makes TypeScript
 * fail until every kind in the protocol has a runner.
 */
import type { Task, TaskKind, TaskResult } from "@ranklark/core/protocol";
import { runApps } from "./apps";
import { runHints } from "./hints";
import { runSerp } from "./serp";

type Runners = { [K in TaskKind]: (t: Extract<Task, { kind: K }>) => Promise<TaskResult> };

const RUNNERS: Runners = { apps: runApps, serp: runSerp, hints: runHints };

export const runTask = (t: Task): Promise<TaskResult> => (RUNNERS[t.kind] as (t: Task) => Promise<TaskResult>)(t);

export const describeTask = (t: Task) =>
  t.kind === "apps" ? `${t.ids.length} app(s) · ${t.country.toUpperCase()}` : `“${t.term}” · ${t.country.toUpperCase()}`;
