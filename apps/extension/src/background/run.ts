/** The check loop: ask the dashboard what's due, fetch it from Apple, post each result immediately. */
import type { TaskResult } from "@ranklark/core/protocol";
import { DailyCap } from "./apple";
import { fetchTasks, heartbeat, postResult } from "./server";
import { currentStatus, getConfig, loadStatus, saveStatus, today } from "./state";
import { describeTask, runTask } from "./tasks";

let running = false;
export const isRunning = () => running;

export async function run(reason: string) {
  if (running) return;
  const cfg = await getConfig();
  if (!cfg || cfg.paused) return;
  await loadStatus();
  running = true;
  const counts = { serp: 0, hints: 0, apps: 0, errors: 0 };
  try {
    const tasks = await fetchTasks(cfg);
    await saveStatus({
      state: "running",
      startedAt: new Date().toISOString(),
      done: 0,
      total: tasks.length,
      lastError: undefined,
      current: reason,
    });
    await heartbeat(cfg);
    for (const t of tasks) {
      if ((await getConfig())?.paused) break;
      await saveStatus({ current: describeTask(t) });
      let result: TaskResult;
      try {
        result = await runTask(t);
        counts[t.kind]++;
      } catch (e) {
        counts.errors++;
        result = { kind: "error", task: t, message: e instanceof Error ? e.message : String(e) };
        if (e instanceof DailyCap) {
          await postResult(cfg, result);
          throw e;
        }
      }
      await saveStatus({ done: currentStatus().done + 1 });
      // Post each result right away: nothing is lost if Chrome closes mid-run, and the dashboard updates live.
      await postResult(cfg, result);
    }
    const paused = Object.values(currentStatus().hostBackoff ?? {}).some((h) => h.until > Date.now());
    await saveStatus({
      state: paused ? "backoff" : "idle",
      finishedAt: new Date().toISOString(),
      lastOkDay: counts.errors === 0 ? today() : currentStatus().lastOkDay,
      current: undefined,
      last: counts,
      lastError: paused ? "Apple asked us to slow down on one of its servers — that part resumes automatically." : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await saveStatus({ state: "error", lastError: msg, finishedAt: new Date().toISOString(), last: counts, current: undefined });
  } finally {
    running = false;
    const c = await getConfig();
    if (c) await heartbeat(c);
  }
}

/** Hourly (and after a restart): a cheap check with the dashboard; only touches Apple when something is due. */
export async function tick(reason: string) {
  const cfg = await getConfig();
  if (!cfg || cfg.paused || running) return;
  const status = await loadStatus();
  if (status.state === "running") await saveStatus({ state: "idle" }); // a previous worker was killed mid-run; tasks are idempotent
  try {
    const tasks = await fetchTasks(cfg);
    if (tasks.length) await run(reason);
    else await heartbeat(cfg);
  } catch (e) {
    await saveStatus({ state: "error", lastError: e instanceof Error ? e.message : String(e) });
  }
}
