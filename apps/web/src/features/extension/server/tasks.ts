/** The extension's to-do list: only the owner's apps and tracked keywords that weren't checked today. */
import type { Task } from "@ranklark/core/protocol";
import { popularityPlan } from "@/features/keywords/server/popularity";
import { db, today } from "@/server/db";

export function buildTasks(limit = 400): Task[] {
  const day = today();
  const tasks: Task[] = [];
  const apps = db.prepare("SELECT id, primary_country, updated_at, name FROM apps WHERE is_mine = 1").all() as {
    id: number;
    primary_country: string;
    updated_at: string;
    name: string;
  }[];
  const byCountry = new Map<string, number[]>();
  for (const a of apps) {
    if (a.updated_at.slice(0, 10) === day && !a.name.startsWith("App ")) continue;
    byCountry.set(a.primary_country, [...(byCountry.get(a.primary_country) ?? []), a.id]);
  }
  for (const [country, ids] of byCountry) tasks.push({ kind: "apps", country, ids: ids.slice(0, 150) });

  const pairs = trackedPairs();
  const have = db.prepare("SELECT 1 FROM serp WHERE term = ? AND country = ? AND day = ?");
  for (const p of pairs) if (!have.get(p.term, p.country, day)) tasks.push({ kind: "serp", country: p.country, term: p.term });
  for (const p of pairs) {
    const plan = popularityPlan(p.term, p.country);
    if (!plan.done) tasks.push({ kind: "hints", country: p.country, term: p.term, prefixes: plan.prefixes });
  }
  return tasks.slice(0, limit);
}

export const trackedPairs = () =>
  db.prepare("SELECT DISTINCT term, country FROM keywords ORDER BY country, term").all() as { term: string; country: string }[];
