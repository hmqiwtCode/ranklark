import crypto from "node:crypto";

/**
 * In-process background jobs (add keywords, refresh an app, build the showcase…).
 * The UI polls GET /api/jobs/[id] for progress. Jobs live in memory and vanish 10 minutes after finishing.
 */
export type Job = { id: string; label: string; total: number; done: number; errors: string[]; finished: boolean; startedAt: number };
declare global {
  // eslint-disable-next-line no-var
  var __asoJobs: Map<string, Job> | undefined;
}
globalThis.__asoJobs ??= new Map();
const jobs: Map<string, Job> = globalThis.__asoJobs;
export const getJob = (id: string) => jobs.get(id) ?? null;

export function runJob(label: string, steps: (() => Promise<unknown>)[]): Job {
  const job: Job = { id: crypto.randomUUID(), label, total: steps.length, done: 0, errors: [], finished: false, startedAt: Date.now() };
  jobs.set(job.id, job);
  (async () => {
    for (const step of steps) {
      try {
        await step();
      } catch (e) {
        job.errors.push(e instanceof Error ? e.message : String(e));
      }
      job.done++;
    }
    job.finished = true;
    setTimeout(() => jobs.delete(job.id), 10 * 60_000);
  })();
  return job;
}

/** A job whose number of steps is only known once it starts (e.g. after autocomplete expansion). */
export function runDynamicJob(label: string, fn: (job: Job) => Promise<void>): Job {
  const job: Job = { id: crypto.randomUUID(), label, total: 1, done: 0, errors: [], finished: false, startedAt: Date.now() };
  jobs.set(job.id, job);
  fn(job)
    .catch((e) => job.errors.push(e instanceof Error ? e.message : String(e)))
    .finally(() => {
      job.done = job.total;
      job.finished = true;
      setTimeout(() => jobs.delete(job.id), 10 * 60_000);
    });
  return job;
}
