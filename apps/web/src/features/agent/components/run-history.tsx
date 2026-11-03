"use client";

import { STOREFRONTS } from "@ranklark/core/apple";
import { ChevronRight, Lightbulb, Loader2, RotateCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppIcon } from "@/components/ui";
import { ago } from "@/lib/format";
import { isScriptedModel, modelLabel } from "../lib/browser";
import type { RunSummary } from "../lib/contract";
import { fmtDate, StatusPill, sourceLabel } from "./bits";

/** Past and running research runs, newest first. Refreshes every few seconds while one is running. */
export function RunHistory() {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/agent/runs", { cache: "no-store" });
      if (!r.ok)
        throw new Error(r.status === 404 ? "The AI research API isn't available on this server." : `The server answered ${r.status}.`);
      const j = (await r.json()) as RunSummary[] | { runs?: RunSummary[] };
      setRuns(Array.isArray(j) ? j : (j.runs ?? []));
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Couldn't load past runs.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const anyRunning = !!runs?.some((r) => r.status === "running");
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [anyRunning, load]);

  return (
    <section className="card">
      <div className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-3">
        <h2 className="text-[15px] font-semibold">
          Past runs {runs && runs.length > 0 && <span className="text-sm font-normal text-ink-3">· {runs.length}</span>}
        </h2>
        <button
          type="button"
          onClick={load}
          className="btn-ghost grid h-8 w-8 place-items-center"
          aria-label="Refresh runs"
          title="Refresh"
        >
          <RotateCw className="h-3.5 w-3.5 text-ink-3" />
        </button>
      </div>
      {error ? (
        <p className="px-4 py-6 text-center text-[13px] text-ink-3">{error}</p>
      ) : !runs ? (
        <p className="flex items-center justify-center gap-2 px-4 py-6 text-[13px] text-ink-3">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : !runs.length ? (
        <p className="px-4 py-8 text-center text-[13.5px] text-ink-3">
          No runs yet. Your first one will show up here, and so will runs started from Claude Code.
        </p>
      ) : (
        <ul>
          {runs.map((r) => {
            const sf = STOREFRONTS[r.country];
            return (
              <li key={r.id} className="border-b border-line/40 last:border-0">
                <Link
                  href={`/agent/${encodeURIComponent(r.id)}`}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.025]"
                >
                  {r.appIcon || r.appName ? (
                    <AppIcon src={r.appIcon} name={r.appName ?? r.title} size={34} />
                  ) : (
                    <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[8px] bg-well text-warn" title="App idea">
                      <Lightbulb className="h-4 w-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="truncate text-[14px] font-semibold">{r.title || r.appName || "Research run"}</span>
                      <StatusPill status={r.status} size="sm" />
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-ink-3">
                      {r.appName && r.appName !== r.title ? `${r.appName} · ` : ""}
                      {sf ? `${sf.flag} ${sf.name}` : r.country.toUpperCase()} ·{" "}
                      {isScriptedModel(r.model)
                        ? "Scripted test model (no Claude calls)"
                        : r.source === "mcp"
                          ? sourceLabel(r.source)
                          : `${sourceLabel(r.source)} · ${modelLabel(r.model)}`}
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-right text-[12px] text-ink-3 sm:block" title={fmtDate(r.createdAt)}>
                    {ago(r.createdAt)}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
