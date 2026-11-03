"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RunSnapshot, RunStatus, StoredEvent } from "../lib/contract";
import { applyEvent, type RunView, reduceRun } from "../lib/reduce";

export type LiveState = "loading" | "connecting" | "live" | "reconnecting" | "closed";

const MAX_DELAY = 15_000;

/**
 * Loads a run's snapshot, folds it with reduceRun, then follows the live event stream (SSE) with applyEvent.
 * Reconnects with exponential backoff from the latest seq until the run finishes. Closes on unmount.
 */
export function useRun(id: string) {
  const [run, setRun] = useState<RunSnapshot["run"] | null>(null);
  const [view, setView] = useState<RunView | null>(null);
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [live, setLive] = useState<LiveState>("loading");
  const [attempt, setAttempt] = useState(0);
  const lastSeq = useRef(0);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the whole load after a manual retry
  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let finished = false;
    lastSeq.current = 0;
    setError(null);
    setView(null);
    setEvents([]);
    setLive("loading");

    const take = (incoming: StoredEvent[]) => {
      const fresh = incoming.filter((e) => e.seq > lastSeq.current);
      if (!fresh.length) return;
      lastSeq.current = Math.max(lastSeq.current, ...fresh.map((e) => e.seq));
      setEvents((prev) => [...prev, ...fresh]);
      setView((v) => (v ? fresh.reduce(applyEvent, v) : v));
      if (fresh.some((e) => e.type === "run.finished")) finished = true;
    };

    const loadSnapshot = async (): Promise<RunSnapshot | null> => {
      const r = await fetch(`/api/agent/runs/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        throw Object.assign(new Error(j?.error ?? `The server answered ${r.status}.`), { notFound: r.status === 404 });
      }
      return (await r.json()) as RunSnapshot;
    };

    const stillRunning = (status: RunStatus) => status === "running";

    const connect = () => {
      if (cancelled || finished) return;
      setLive(failures ? "reconnecting" : "connecting");
      es = new EventSource(`/api/agent/runs/${encodeURIComponent(id)}/events?after=${lastSeq.current}`);
      es.onopen = () => {
        failures = 0;
        setLive("live");
      };
      es.onmessage = (m) => {
        let ev: StoredEvent | null = null;
        try {
          ev = JSON.parse(m.data) as StoredEvent;
        } catch {
          return; // heartbeats or anything that isn't an event
        }
        if (!ev || typeof ev.seq !== "number" || typeof ev.type !== "string") return;
        take([ev]);
        if (ev.type === "run.finished") {
          es?.close();
          setLive("closed");
        }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        if (cancelled || finished) return;
        failures++;
        setLive("reconnecting");
        const delay = Math.min(MAX_DELAY, 1000 * 2 ** Math.min(failures - 1, 4));
        timer = setTimeout(async () => {
          if (cancelled) return;
          // After a few failures, check whether the run is still going (it may have ended or been deleted).
          if (failures >= 3) {
            try {
              const s = await loadSnapshot();
              if (cancelled || !s) return;
              setRun(s.run);
              take(s.events);
              if (!stillRunning(s.run.status) || finished) {
                setLive("closed");
                return;
              }
            } catch (e) {
              if ((e as { notFound?: boolean }).notFound) {
                setError({ message: "This run no longer exists.", notFound: true });
                setLive("closed");
                return;
              }
            }
          }
          connect();
        }, delay);
      };
    };

    (async () => {
      try {
        const s = await loadSnapshot();
        if (cancelled || !s) return;
        const sorted = [...s.events].sort((a, b) => a.seq - b.seq);
        let v = reduceRun(sorted);
        lastSeq.current = v.lastSeq;
        finished = sorted.some((e) => e.type === "run.finished");
        // A run cut off by a server restart has no run.finished event: its "running" steps never completed.
        if (!finished && !stillRunning(s.run.status))
          v = { ...v, nodes: v.nodes.map((n) => (n.status === "running" ? { ...n, status: "skipped" as const } : n)) };
        setRun(s.run);
        setEvents(sorted);
        setView(v);
        if (stillRunning(s.run.status) && !finished) connect();
        else setLive("closed");
      } catch (e) {
        if (cancelled) return;
        setError({ message: (e as Error).message || "Couldn't load this run.", notFound: !!(e as { notFound?: boolean }).notFound });
        setLive("closed");
      }
    })();

    return () => {
      cancelled = true;
      es?.close();
      if (timer) clearTimeout(timer);
    };
  }, [id, attempt]);

  // The run row knows things no event says (a run cut off by a server restart is "interrupted").
  const status: RunStatus = view && view.status !== "running" ? view.status : run && run.status !== "running" ? run.status : "running";

  return { run, view, events, status, live, error, retry };
}
