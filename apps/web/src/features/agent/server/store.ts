/**
 * AI research runs: persistence (agent_runs / agent_events) + live fan-out through the bus.
 * The API key is never passed to this module, so it can't end up in a row or an event.
 */
import crypto from "node:crypto";
import { db } from "@/server/db";
import type { AgentEventRow, AgentRunRow } from "@/server/db/rows";
import {
  type AgentConfig,
  type AgentEvent,
  type AgentInput,
  type Fact,
  type Finding,
  type Recommendation,
  type RunSnapshot,
  type RunSource,
  type RunStatus,
  type RunSummary,
  type StoredEvent,
  sanitizeConfig,
} from "../lib/contract";
import { publish } from "./bus";

declare global {
  // eslint-disable-next-line no-var
  var __agentStoreBooted: boolean | undefined;
}

// At boot, runs still marked running belong to a process that is gone. Once per process (not per hot reload,
// which would orphan this process's live runs), and never while `next build` collects page data.
if (!globalThis.__agentStoreBooted && process.env.NEXT_PHASE !== "phase-production-build") {
  globalThis.__agentStoreBooted = true;
  db.prepare(
    "UPDATE agent_runs SET status = 'interrupted', finished_at = datetime('now'), error = COALESCE(error, 'The server restarted while this run was in progress.') WHERE status = 'running'",
  ).run();
}

// ------------------------------------------------------------------ runs

export function createRun(r: {
  title: string;
  appId: number | null;
  country: string;
  source: RunSource;
  model: string | null;
  input: AgentInput;
  config: AgentConfig;
}): string {
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO agent_runs (id, title, app_id, country, status, source, model, input_json, config_json)
     VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?)`,
  ).run(id, r.title.slice(0, 120), r.appId, r.country, r.source, r.model, JSON.stringify(r.input), JSON.stringify(r.config));
  return id;
}

export const getRunRow = (id: string) => db.prepare("SELECT * FROM agent_runs WHERE id = ?").get(id) as AgentRunRow | undefined;

export function setRunTitle(id: string, title: string) {
  db.prepare("UPDATE agent_runs SET title = ? WHERE id = ?").run(title.slice(0, 120), id);
}

export function finishRun(
  id: string,
  status: Exclude<RunStatus, "running">,
  opts: { recommendation?: Recommendation | null; error?: string | null } = {},
) {
  db.prepare(
    "UPDATE agent_runs SET status = ?, result_json = COALESCE(?, result_json), error = ?, finished_at = datetime('now') WHERE id = ?",
  ).run(status, opts.recommendation ? JSON.stringify(opts.recommendation) : null, opts.error ?? null, id);
}

/** Deletes a run that isn't running. Returns false when it doesn't exist or is still running. */
export function deleteRun(id: string): boolean {
  return db.prepare("DELETE FROM agent_runs WHERE id = ? AND status != 'running'").run(id).changes > 0;
}

// ------------------------------------------------------------------ events

/** Persist an event with the run's next sequence number, then publish it to live subscribers. */
export function appendEvent(runId: string, event: AgentEvent): StoredEvent {
  // better-sqlite3 is synchronous, so read-max + insert can't interleave with another append in this process
  const { next } = db.prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM agent_events WHERE run_id = ?").get(runId) as {
    next: number;
  };
  const at = new Date().toISOString();
  db.prepare("INSERT INTO agent_events (run_id, seq, at, type, json) VALUES (?, ?, ?, ?, ?)").run(
    runId,
    next,
    at,
    event.type,
    JSON.stringify(event),
  );
  const stored = { ...event, seq: next, at } as StoredEvent;
  publish(runId, stored);
  return stored;
}

const toStored = (r: AgentEventRow): StoredEvent => ({ ...(JSON.parse(r.json) as AgentEvent), seq: r.seq, at: r.at }) as StoredEvent;

export function listEvents(runId: string, afterSeq = 0): StoredEvent[] {
  return (db.prepare("SELECT * FROM agent_events WHERE run_id = ? AND seq > ? ORDER BY seq").all(runId, afterSeq) as AgentEventRow[]).map(
    toStored,
  );
}

/** Facts and findings recorded so far (used to continue a run across stateless MCP calls). */
export function runEvidence(runId: string): { facts: Fact[]; findings: Finding[] } {
  const rows = db
    .prepare("SELECT * FROM agent_events WHERE run_id = ? AND type IN ('fact.added', 'finding.added', 'finding.checked') ORDER BY seq")
    .all(runId) as AgentEventRow[];
  const facts = new Map<string, Fact>();
  const findings = new Map<string, Finding>();
  for (const r of rows) {
    const e = JSON.parse(r.json) as AgentEvent;
    if (e.type === "fact.added") facts.set(e.fact.id, e.fact);
    else if (e.type === "finding.added") findings.set(e.finding.id, e.finding);
    else if (e.type === "finding.checked") {
      const f = findings.get(e.findingId);
      if (f) findings.set(f.id, { ...f, verdict: e.verdict });
    }
  }
  return { facts: [...facts.values()], findings: [...findings.values()] };
}

// ------------------------------------------------------------------ read models

type RunJoinRow = AgentRunRow & { app_name: string | null; app_icon: string | null };

function summary(r: RunJoinRow): RunSummary {
  // apps we don't track aren't in the DB; the public-store cache of features/apps (memory only, no network)
  // may still know their name and icon
  const cached = r.app_id != null ? globalThis.__storeCache?.get(`${r.app_id}:${r.country}`)?.app : undefined;
  return {
    id: r.id,
    title: r.title,
    appId: r.app_id,
    appName: r.app_name ?? cached?.name ?? null,
    appIcon: r.app_icon ?? cached?.icon ?? null,
    country: r.country,
    status: r.status,
    source: r.source,
    model: r.model,
    createdAt: r.created_at,
    finishedAt: r.finished_at,
  };
}

const JOIN = "SELECT r.*, a.name AS app_name, a.icon AS app_icon FROM agent_runs r LEFT JOIN apps a ON a.id = r.app_id";

export function listRuns(limit = 50): RunSummary[] {
  return (db.prepare(`${JOIN} ORDER BY r.created_at DESC, r.rowid DESC LIMIT ?`).all(limit) as RunJoinRow[]).map(summary);
}

export function getSnapshot(id: string): RunSnapshot | null {
  const r = db.prepare(`${JOIN} WHERE r.id = ?`).get(id) as RunJoinRow | undefined;
  if (!r) return null;
  return {
    run: { ...summary(r), input: JSON.parse(r.input_json) as AgentInput, config: sanitizeConfig(JSON.parse(r.config_json)) },
    events: listEvents(id),
  };
}
