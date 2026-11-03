"use client";

import { CheckCircle2, CircleDot, Flag, Play, Repeat, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import type { StoredEvent } from "../lib/contract";
import type { GraphNode } from "../lib/reduce";
import { Empty, fmtClock, fmtDuration, parseTime, ROLE } from "./bits";

type Entry = { seq: number; at: string; icon: ReactNode; text: ReactNode; detail?: ReactNode };

const RUN_END: Record<string, string> = { done: "Run finished", failed: "Run failed", cancelled: "Run stopped" };

/** Chronological list of what happened: node starts / finishes / failures and each iteration's verdict. */
export function TimelineTab({ events, nodes }: { events: StoredEvent[]; nodes: GraphNode[] }) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const start = parseTime(events.find((e) => e.type === "run.started")?.at ?? events[0]?.at);
  const name = (id: string) => {
    const n = byId.get(id);
    return n ? `${ROLE[n.role].label} · ${n.label}` : id;
  };
  const entries: Entry[] = [];
  for (const e of events) {
    switch (e.type) {
      case "run.started":
        entries.push({ seq: e.seq, at: e.at, icon: <Play className="h-3.5 w-3.5 text-primary" />, text: <>Run started</> });
        break;
      case "iteration.started":
        entries.push({
          seq: e.seq,
          at: e.at,
          icon: <Repeat className="h-3.5 w-3.5 text-ink-3" />,
          text: <span className="font-semibold">Iteration {e.iteration} started</span>,
        });
        break;
      case "node.started":
        entries.push({
          seq: e.seq,
          at: e.at,
          icon: <CircleDot className="h-3.5 w-3.5 text-primary" />,
          text: <>{name(e.nodeId)} started</>,
        });
        break;
      case "node.finished":
        entries.push({
          seq: e.seq,
          at: e.at,
          icon: <CheckCircle2 className="h-3.5 w-3.5 text-good" />,
          text: (
            <>
              {name(e.nodeId)} finished <span className="text-ink-3">· {fmtDuration(e.durationMs)}</span>
            </>
          ),
          detail: e.summary || undefined,
        });
        break;
      case "node.failed":
        entries.push({
          seq: e.seq,
          at: e.at,
          icon: <XCircle className="h-3.5 w-3.5 text-bad" />,
          text: (
            <>
              {name(e.nodeId)} failed <span className="text-ink-3">· {fmtDuration(e.durationMs)}</span>
            </>
          ),
          detail: <span className="text-bad">{e.error}</span>,
        });
        break;
      case "iteration.finished":
        entries.push({
          seq: e.seq,
          at: e.at,
          icon: <Flag className={`h-3.5 w-3.5 ${e.converged ? "text-good" : "text-warn"}`} />,
          text: (
            <span className="font-semibold">
              Iteration {e.iteration}:{" "}
              {e.converged ? (
                <span className="text-good">evidence good enough</span>
              ) : (
                <span className="text-warn">needs more evidence</span>
              )}
            </span>
          ),
          detail: (
            <>
              {e.reason}
              {e.gaps.length > 0 && (
                <ul className="mt-1 list-disc pl-4">
                  {e.gaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              )}
            </>
          ),
        });
        break;
      case "run.finished":
        entries.push({
          seq: e.seq,
          at: e.at,
          icon: <Flag className={`h-3.5 w-3.5 ${e.status === "done" ? "text-good" : e.status === "failed" ? "text-bad" : "text-ink-3"}`} />,
          text: <span className="font-semibold">{RUN_END[e.status] ?? e.status}</span>,
          detail: e.error ? <span className="text-bad">{e.error}</span> : undefined,
        });
        break;
      default:
        break;
    }
  }
  if (!entries.length) return <Empty>Nothing has happened yet.</Empty>;
  return (
    <ol className="flex flex-col py-2">
      {entries.map((x) => {
        const t = parseTime(x.at);
        return (
          <li key={x.seq} className="grid grid-cols-[56px_18px_1fr] items-start gap-2 px-4 py-1.5 text-[13px]">
            <span
              className="pt-px text-right font-mono text-[11.5px] text-ink-3 tabular"
              title={t ? new Date(t).toLocaleTimeString() : undefined}
            >
              {t != null && start != null ? `+${fmtClock(t - start)}` : "—"}
            </span>
            <span className="grid h-5 place-items-center">{x.icon}</span>
            <div className="min-w-0">
              <div className="break-words text-ink">{x.text}</div>
              {x.detail && <div className="mt-0.5 break-words text-[12.5px] leading-relaxed text-ink-3">{x.detail}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
