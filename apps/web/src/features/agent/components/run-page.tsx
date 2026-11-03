"use client";

import { STOREFRONTS } from "@ranklark/core/apple";
import { ArrowLeft, Lightbulb, Loader2, RotateCw, Square } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { L } from "@/components/help";
import { AppIcon, KpiStrip } from "@/components/ui";
import { compact } from "@/lib/format";
import { isScriptedModel, modelEntry, modelLabel } from "../lib/browser";
import { PRICES_AS_OF, type RunSnapshot, type RunStatus, type StoredEvent } from "../lib/contract";
import { estimateCost, type RunView } from "../lib/reduce";
import { fmtClock, fmtDate, fmtUsd, parseTime, StatusPill, sourceLabel } from "./bits";
import { EvidenceTab } from "./evidence-tab";
import { FindingsTab } from "./findings-tab";
import { NodeDrawer } from "./node-drawer";
import { ResultTab, stageText } from "./result-tab";
import { RunGraph } from "./run-graph";
import { TimelineTab } from "./timeline-tab";
import { type LiveState, useRun } from "./use-run";

type Tab = "result" | "findings" | "evidence" | "timeline";

function useNow(ticking: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking]);
  return now;
}

/** Sum of each model call's estimated cost, priced by the model that actually served it. Null → "—". */
function runCost(view: RunView, requested: string | null): number | null {
  let total = 0;
  for (const n of view.nodes) {
    if (!n.usage) continue;
    const m = modelEntry(n.model ?? requested);
    const c = m ? estimateCost(m.id, n.usage) : null;
    if (c == null) return null;
    total += c;
  }
  return Math.round(total * 10000) / 10000;
}

function LiveBadge({ live, status }: { live: LiveState; status: RunStatus }) {
  if (status !== "running") return null;
  if (live === "live")
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">
        <span className="h-1.5 w-1.5 rounded-full bg-good" /> Live
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-warn">
      <Loader2 className="h-3 w-3 animate-spin" /> {live === "reconnecting" ? "Reconnecting…" : "Connecting…"}
    </span>
  );
}

export function RunPage({ id }: { id: string }) {
  const { run, view, events, status, live, error, retry } = useRun(id);

  if (error)
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <Link href="/agent" className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> AI research
        </Link>
        <div className="card mt-4 p-6">
          <h1 className="text-[20px] font-bold">{error.notFound ? "Run not found" : "Couldn't load this run"}</h1>
          <p className="mt-1 text-[14px] text-ink-2">
            {error.notFound ? "It may have been deleted, or the link is wrong." : error.message}
          </p>
          {!error.notFound && (
            <button type="button" onClick={retry} className="btn-ghost mt-4 inline-flex h-9 items-center gap-2 px-3 text-sm">
              <RotateCw className="h-4 w-4" /> Try again
            </button>
          )}
        </div>
      </main>
    );

  if (!view || !run)
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="card flex items-center gap-3 p-6 text-[14px] text-ink-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading the run…
        </div>
      </main>
    );

  return <RunScreen id={id} run={run} view={view} events={events} status={status} live={live} />;
}

export function RunScreen({
  id,
  run,
  view,
  events,
  status,
  live,
}: {
  id: string;
  run: RunSnapshot["run"];
  view: RunView;
  events: StoredEvent[];
  status: RunStatus;
  live: LiveState;
}) {
  const [tab, setTab] = useState<Tab>("result");
  const [selected, setSelected] = useState<string | null>(null);
  // `n` changes on every request, so asking for the same node again re-centres the graph on it
  const [highlight, setHighlight] = useState<{ id: string; n: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [stopErr, setStopErr] = useState<string | null>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const now = useNow(status === "running");

  const onSelect = useCallback((nodeId: string) => setSelected(nodeId), []);
  const closeDrawer = useCallback(() => setSelected(null), []);

  const onFact = useCallback(
    (factId: string) => {
      const f = view.facts.find((x) => x.id === factId);
      if (!f) return;
      setSelected(null);
      setTab("evidence");
      setFlash(factId);
      setHighlight((h) => ({ id: f.nodeId, n: (h?.n ?? 0) + 1 }));
    },
    [view.facts],
  );

  const onShowNode = useCallback((nodeId: string) => {
    setHighlight((h) => ({ id: nodeId, n: (h?.n ?? 0) + 1 }));
    graphRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Scroll the cited fact into view once the Evidence tab has rendered, then let the highlight fade.
  useEffect(() => {
    if (!flash || tab !== "evidence") return;
    const raf = requestAnimationFrame(() =>
      document.getElementById(`fact-${flash}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
    const t = setTimeout(() => setFlash(null), 2600);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [flash, tab]);

  useEffect(() => {
    if (status !== "running") setStopping(false);
  }, [status]);

  const factIds = useMemo(() => new Set(view.facts.map((f) => f.id)), [view.facts]);

  const cfg = view.config ?? run.config;
  const input = view.input ?? run.input;
  const title = view.title || run.title;
  // The run row holds the model the run was started with ("scripted-test" for the test model); config.model is
  // only what was asked for.
  const requested = run.model ?? cfg?.model ?? null;
  const scripted = isScriptedModel(requested);
  // Calls the API answered with a different model than requested (server-side fallback).
  const fellBack = requested ? view.nodes.filter((n) => n.model && modelLabel(n.model) !== modelLabel(requested)) : [];
  const fallbackModels = [...new Set(fellBack.map((n) => modelLabel(n.model)))];
  const shownModel = requested ?? view.nodes.find((n) => n.model)?.model ?? null;
  const source = view.source ?? run.source;
  const iterNow = view.iterations.length ? Math.max(...view.iterations.map((i) => i.n)) : 0;
  const lastIt = view.iterations.find((i) => i.n === iterNow);
  const cost = source === "mcp" || scripted ? null : runCost(view, requested);
  const startMs = parseTime(view.startedAt ?? run.createdAt);
  const endMs = parseTime(view.finishedAt ?? run.finishedAt) ?? (status === "running" ? now : parseTime(events.at(-1)?.at));
  const elapsed = startMs != null && endMs != null ? endMs - startMs : null;
  const supported = view.findings.filter((f) => f.verdict?.status === "supported").length;
  const country = run.country || input?.country || "us";
  const sf = STOREFRONTS[country];
  const appId = run.appId ?? input?.appId ?? null;
  const selectedNode = selected ? (view.nodes.find((n) => n.id === selected) ?? null) : null;
  const tokensKnown = view.tokens.input + view.tokens.output > 0;

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "result", label: "Result" },
    { key: "findings", label: "Findings", count: view.findings.length },
    { key: "evidence", label: "Evidence", count: view.facts.length },
    { key: "timeline", label: "Timeline" },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <Link href="/agent" className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> AI research
      </Link>

      <header className="mt-3 flex flex-wrap items-start gap-3">
        {run.appIcon || run.appName ? (
          <AppIcon src={run.appIcon} name={run.appName ?? title} size={48} />
        ) : (
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-[11px] bg-well text-warn"
            title="An idea that isn't on the App Store yet"
          >
            <Lightbulb className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="min-w-0 break-words text-[24px] font-extrabold leading-tight tracking-tight">{title || "Research run"}</h1>
            <StatusPill status={status} />
            <LiveBadge live={live} status={status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-ink-3">
            {!scripted && (
              <>
                <span>{source === "mcp" ? "Claude Code (MCP)" : sourceLabel(source)}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <span className={scripted ? "font-medium text-warn" : undefined}>
              {modelLabel(shownModel)}
              {scripted && " (no Claude calls)"}
              {fellBack.length > 0 && (
                <span className="text-warn" title="Claude's server-side fallback answered these calls with another model">
                  {" "}
                  ({fellBack.length} call{fellBack.length === 1 ? "" : "s"} fell back to {fallbackModels.join(", ")})
                </span>
              )}
            </span>
            {cfg?.effort && source !== "mcp" && !scripted && (
              <>
                <span aria-hidden>·</span>
                <span>{cfg.effort} effort</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span>{sf ? `${sf.flag} ${sf.name}` : country.toUpperCase()}</span>
            <span aria-hidden>·</span>
            <span>started {fmtDate(view.startedAt ?? run.createdAt)}</span>
          </div>
        </div>
        {status === "running" && (
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              disabled={stopping}
              onClick={async () => {
                setStopping(true);
                setStopErr(null);
                try {
                  const r = await fetch(`/api/agent/runs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
                  if (!r.ok) {
                    const j = (await r.json().catch(() => ({}))) as { error?: string };
                    setStopErr(j.error ?? `Couldn't stop it (the server answered ${r.status}).`);
                    setStopping(false);
                  }
                } catch {
                  setStopErr("Couldn't reach the server.");
                  setStopping(false);
                }
              }}
              className="btn-ghost flex h-9 items-center gap-2 px-3 text-sm"
            >
              {stopping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-3.5 w-3.5 fill-current text-bad" />}
              {stopping ? "Stopping…" : "Stop"}
            </button>
            {stopErr && <span className="max-w-60 text-right text-[12px] text-bad">{stopErr}</span>}
          </div>
        )}
      </header>

      <section className="card mt-4 p-4 pb-3">
        <KpiStrip
          items={[
            {
              label: <L term="agentIteration">Iteration</L>,
              value: cfg ? `${iterNow}/${cfg.maxIterations}` : iterNow || "—",
              sub: lastIt?.converged
                ? "converged"
                : status === "running"
                  ? "in progress"
                  : lastIt?.converged === false
                    ? "not converged"
                    : "\u00a0",
            },
            {
              label: <L term="agentAppleBudget">Apple requests</L>,
              value: view.budget ? `${view.budget.apple.used}/${view.budget.apple.limit}` : "—",
              sub: "cache is free",
            },
            {
              label: <L term="agentKeywordBudget">Keywords scored</L>,
              value: view.budget ? `${view.budget.keywords.used}/${view.budget.keywords.limit}` : "—",
              sub: "distinct terms",
            },
            { label: <L term="agentFacts">Facts</L>, value: view.facts.length, sub: "evidence" },
            { label: <L term="agentFindings">Findings</L>, value: view.findings.length, sub: `${supported} supported` },
            {
              label: <L term="agentTokens">Tokens</L>,
              value:
                (source === "mcp" || scripted) && !tokensKnown ? (
                  "—"
                ) : (
                  <span className="whitespace-nowrap">
                    {compact(view.tokens.input)}
                    <span className="mx-0.5 font-normal text-ink-3">/</span>
                    {compact(view.tokens.output)}
                  </span>
                ),
              sub: scripted ? "no Claude calls" : source === "mcp" && !tokensKnown ? "in Claude Code" : "in / out",
            },
            {
              label: <L term="agentCost">Est. cost</L>,
              value: fmtUsd(cost),
              sub: scripted ? "no Claude calls" : source === "mcp" ? "Claude plan" : `prices ${PRICES_AS_OF}`,
              hint: `Estimated from Anthropic list prices as of ${PRICES_AS_OF}. Your bill can differ.`,
            },
            {
              label: <L term="agentElapsed">Elapsed</L>,
              value: elapsed == null ? "—" : fmtClock(elapsed),
              sub: status === "running" ? "ticking" : "\u00a0",
            },
          ]}
        />
      </section>

      <section ref={graphRef} className="card mt-4 scroll-mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line/70 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold">How the research is going</h2>
            <p className="text-[12.5px] text-ink-3">
              {status === "running" ? stageText(view) : `${view.nodes.length} steps.`} Click a step to see what it did.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" /> running
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-good" /> done
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-bad" /> failed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full border border-dashed border-ink-3" /> skipped
            </span>
          </div>
        </div>
        {view.nodes.length ? (
          <RunGraph
            nodes={view.nodes}
            iterations={view.iterations}
            selectedId={selected}
            highlightId={highlight?.id ?? null}
            highlightKey={highlight?.n ?? 0}
            onSelect={onSelect}
          />
        ) : (
          <div className="grid h-[240px] place-items-center px-4 text-center text-[13.5px] text-ink-3">
            {status === "running" ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" /> Waiting for the first step…
              </span>
            ) : (
              "This run has no steps."
            )}
          </div>
        )}
      </section>

      <section className="card mt-4">
        <div className="flex items-center gap-3 overflow-x-auto border-b border-line/70 px-4 py-3">
          <div className="seg" role="tablist" aria-label="Run details">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                data-active={tab === t.key}
                onClick={() => setTab(t.key)}
              >
                {t.label}
                {t.count != null && <span className="ml-1.5 tabular text-ink-3">{t.count}</span>}
              </button>
            ))}
          </div>
        </div>
        <div role="tabpanel">
          {tab === "result" && <ResultTab view={view} status={status} runId={id} appId={appId} country={country} onFact={onFact} />}
          {tab === "findings" && <FindingsTab findings={view.findings} iterations={view.iterations} factIds={factIds} onFact={onFact} />}
          {tab === "evidence" && <EvidenceTab facts={view.facts} flashId={flash} onShowNode={onShowNode} />}
          {tab === "timeline" && <TimelineTab events={events} nodes={view.nodes} />}
        </div>
      </section>

      <NodeDrawer
        node={selectedNode}
        facts={view.facts}
        findings={view.findings}
        requestedModel={requested}
        onClose={closeDrawer}
        onFact={onFact}
      />
    </main>
  );
}
