"use client";

import { STOREFRONTS } from "@ranklark/core/apple";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Gauge,
  Loader2,
  MonitorSmartphone,
  PlugZap,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Help, L } from "@/components/help";
import { AppIcon } from "@/components/ui";
import { ActivityBars, HourStrip } from "@/features/extension/components/activity-charts";
import { connectThisBrowser, extSend, type Ping } from "@/features/extension/messaging";
import { ago } from "@/lib/format";

// ---------------------------------------------------------------- types (mirror /api/ext/overview)

type DevStatus = {
  state: "idle" | "running" | "error" | "backoff";
  done: number;
  total: number;
  current?: string;
  lastError?: string;
  backoffUntil?: number;
  requestsToday: number;
  finishedAt?: string;
};
type Dev = {
  id: string;
  name: string;
  version: string | null;
  createdAt: string;
  lastSeen: string | null;
  status: DevStatus | null;
  requestsToday: number;
  today: { serp: number; hints: number; apps: number; errors: number };
};
type Ev = { id: number; at: string; kind: string; country: string | null; term: string | null; detail: Record<string, unknown> };
type Overview = {
  mode: "server" | "extension";
  day: string;
  devices: Dev[];
  tracked: number;
  checkedToday: number;
  pending: number;
  requestsToday: number;
  cap: number;
  days: { day: string; serp: number; hints: number; apps: number; errors: number }[];
  hours: number[];
  events: Ev[];
};

const minutesSince = (sqlUtc: string | null) => (sqlUtc ? (Date.now() - Date.parse(`${sqlUtc.replace(" ", "T")}Z`)) / 60000 : Infinity);

// ---------------------------------------------------------------- small pieces

function Tone({ tone, children }: { tone: "good" | "run" | "warn" | "bad" | "idle"; children: React.ReactNode }) {
  const cls = {
    good: "bg-good/15 text-good",
    run: "bg-primary/15 text-primary",
    warn: "bg-warn/15 text-warn",
    bad: "bg-bad/15 text-bad",
    idle: "bg-white/[0.06] text-ink-2",
  }[tone];
  const dot = { good: "bg-good", run: "bg-primary animate-pulse", warn: "bg-warn", bad: "bg-bad", idle: "bg-ink-3" }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <label className="flex flex-col gap-1 text-[12px] text-ink-3">
      {label}
      <div className="flex gap-2">
        <input
          readOnly
          value={value}
          className="field h-9 min-w-0 flex-1 px-3 font-mono text-[12px]"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          className="btn-ghost grid h-9 w-9 place-items-center"
          title="Copy"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="h-4 w-4 text-good" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </label>
  );
}

function Cmd({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(children);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="group inline-flex items-center gap-2 rounded-md bg-well px-2 py-1 font-mono text-[12px] text-ink hover:bg-white/[0.06]"
      title="Copy"
    >
      {children}
      {copied ? <Check className="h-3 w-3 text-good" /> : <Copy className="h-3 w-3 text-ink-3 opacity-0 group-hover:opacity-100" />}
    </button>
  );
}

function Step({
  n,
  done,
  title,
  children,
  right,
}: {
  n: number;
  done: boolean;
  title: React.ReactNode;
  children?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="relative flex gap-4 pb-6 last:pb-0">
      <div className="flex flex-col items-center">
        <span
          className={`z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold ${done ? "bg-good/20 text-good" : "bg-primary/15 text-primary"}`}
        >
          {done ? <Check className="h-4 w-4" /> : n}
        </span>
        <span className="mt-1 w-px flex-1 bg-line" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[15px] font-semibold">{title}</div>
          {right}
        </div>
        {children && <div className="mt-2 text-[14px] text-ink-2">{children}</div>}
      </div>
    </div>
  );
}

function EventRow({ e }: { e: Ev }) {
  const flag = e.country ? (STOREFRONTS[e.country]?.flag ?? e.country.toUpperCase()) : "";
  let icon = <Search className="h-3.5 w-3.5" />;
  let what = "Rank check";
  let result: React.ReactNode = null;
  if (e.kind === "serp") {
    const ranks = (e.detail.ranks as { appId: number; name: string; icon: string | null; rank: number | null; approx: boolean }[]) ?? [];
    result = ranks.length ? (
      <span className="flex flex-wrap items-center gap-2">
        {ranks.map((r) => (
          <span key={r.appId} className="inline-flex items-center gap-1.5">
            <AppIcon src={r.icon} name={r.name} size={16} />
            {r.rank == null ? (
              <span className="text-ink-3">not in top 200</span>
            ) : (
              <b className={r.rank <= 10 ? "text-good" : "text-ink"}>
                {r.approx ? "≈" : "#"}
                {r.rank}
              </b>
            )}
          </span>
        ))}
      </span>
    ) : (
      <span className="text-ink-3">#1 is {String(e.detail.top1 ?? "—")}</span>
    );
  } else if (e.kind === "hints") {
    icon = <Gauge className="h-3.5 w-3.5" />;
    what = "Popularity";
    result =
      e.detail.popularity != null ? (
        <span>
          <b className="text-ink">{String(e.detail.popularity)}</b> <span className="text-ink-3">· {String(e.detail.reason ?? "")}</span>
        </span>
      ) : (
        <span className="text-ink-3">collecting suggestions…</span>
      );
  } else if (e.kind === "apps") {
    icon = <Smartphone className="h-3.5 w-3.5" />;
    what = "App info";
    result = <span className="text-ink-2">{String(e.detail.count ?? 0)} app(s) updated (name, ratings, subtitle)</span>;
  } else if (e.kind === "error") {
    icon = <AlertTriangle className="h-3.5 w-3.5 text-bad" />;
    what = "Problem";
    result = <span className="text-bad">{String(e.detail.message ?? "")}</span>;
  }
  return (
    <tr className="border-b border-line/40 hover:bg-white/[0.02]">
      <td className="whitespace-nowrap py-2 pl-4 pr-3 text-ink-3">{ago(e.at)}</td>
      <td className="whitespace-nowrap px-3">
        <span className="inline-flex items-center gap-1.5 text-ink-2">
          {icon}
          {what}
        </span>
      </td>
      <td className="px-3 font-medium text-ink">
        {e.term ? (
          <>
            “{e.term}” <span className="ml-1 text-xs">{flag}</span>
          </>
        ) : (
          <span className="text-ink-3">{flag}</span>
        )}
      </td>
      <td className="px-3 py-2">{result}</td>
    </tr>
  );
}

// ---------------------------------------------------------------- the page

export function ExtensionClient({ extensionId, storeUrl }: { extensionId: string; storeUrl: string | null }) {
  const [ov, setOv] = useState<Overview | null>(null);
  const [ping, setPing] = useState<Ping | "none" | null>(null);
  const [msg, setMsg] = useState<{ tone: "good" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSteps, setShowSteps] = useState<boolean | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const refresh = useCallback(async () => {
    const o = (await fetch("/api/ext/overview").then((r) => r.json())) as Overview;
    setOv(o);
    setPing((await extSend<Ping>({ type: "ping" }, 1500)) ?? "none");
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  const installedHere = !!ping && ping !== "none";
  const pairedHere = installedHere && (ping as Ping).paired;
  const devices = ov?.devices ?? [];
  const hasEvents = (ov?.events.length ?? 0) > 0;
  const setupDone = devices.length > 0 && hasEvents;
  const stepsOpen = showSteps ?? !setupDone;

  const connect = async () => {
    setBusy(true);
    setMsg(null);
    if (!installedHere) {
      setBusy(false);
      setMsg({ tone: "warn", text: "The extension isn't installed in this browser yet — do step 1, then reload this page." });
      return;
    }
    const r = await connectThisBrowser();
    setBusy(false);
    setMsg(
      r.ok
        ? { tone: "good", text: "Connected. The extension starts checking now." }
        : { tone: "warn", text: r.error ?? "The extension didn't answer. Reload this page and try again." },
    );
    refresh();
  };

  const remove = async (d: Dev) => {
    if (!confirm(`Remove “${d.name}”? It stops checking immediately.`)) return;
    await fetch(`/api/ext/devices/${d.id}`, { method: "DELETE" });
    refresh();
  };

  // ---------------------------------------------------------------- health headline
  const health = useMemo(() => {
    if (!ov) return { tone: "idle" as const, label: "Loading…", headline: "Loading…", sub: "" };
    const running = devices.find((d) => d.status?.state === "running" && minutesSince(d.lastSeen) < 10);
    const problem = devices.find((d) => d.status?.state === "error" || d.status?.state === "backoff");
    const freshest = Math.min(...devices.map((d) => minutesSince(d.lastSeen)));
    const nextIn = Number.isFinite(freshest) ? Math.max(0, Math.round(60 - freshest)) : null;
    const pct = ov.tracked ? Math.round((ov.checkedToday / ov.tracked) * 100) : 0;
    if (!devices.length && !installedHere)
      return {
        tone: "idle" as const,
        label: "Not set up",
        headline: "Install the extension to start checking",
        sub: "It runs in your Chrome and checks your keywords with your own Apple limit.",
      };
    if (!devices.length)
      return {
        tone: "warn" as const,
        label: "Not connected",
        headline: "Extension found — connect it to this dashboard",
        sub: "One click below. It gets its own key that you can remove any time.",
      };
    if (running?.status)
      return {
        tone: "run" as const,
        label: "Checking now",
        headline: `Checking ${running.status.current ?? "…"}`,
        sub: `${running.status.done} of ${running.status.total} done on ${running.name} · ~15 s each, gentle on Apple`,
        progress: running.status.total ? running.status.done / running.status.total : 0,
      };
    if (problem?.status)
      return {
        tone: "bad" as const,
        label: "Needs attention",
        headline: problem.status.state === "backoff" ? "Apple asked us to slow down" : "The last run hit a problem",
        sub: problem.status.lastError ?? "See Troubleshooting below.",
      };
    if (freshest > 26 * 60)
      return {
        tone: "warn" as const,
        label: "No check-ins",
        headline: `No check-in for ${Math.round(freshest / 60)} hours`,
        sub: "Checks only run while Chrome is open on a connected computer. Opening Chrome catches up within a minute.",
      };
    if (!ov.tracked)
      return {
        tone: "good" as const,
        label: "Ready",
        headline: "Connected — add keywords to start tracking",
        sub: "Add keywords on an app's page; the extension checks them within the hour.",
      };
    if (ov.pending === 0 && pct === 100)
      return {
        tone: "good" as const,
        label: "Healthy",
        headline: "All keywords checked today ✓",
        sub: `${ov.checkedToday} of ${ov.tracked} keywords have today's App Store results.${nextIn != null ? ` Next check-in in ~${nextIn} min.` : ""}`,
      };
    return {
      tone: "good" as const,
      label: "Healthy",
      headline: `${ov.checkedToday} of ${ov.tracked} keywords checked today`,
      sub: `${ov.pending} job${ov.pending === 1 ? "" : "s"} waiting.${nextIn != null ? ` Next automatic check in ~${nextIn} min.` : ""}`,
    };
  }, [ov, devices, installedHere]);

  const runNow = async () => {
    const r = await extSend<{ ok: boolean; error?: string }>({ type: "run" });
    setMsg(
      r?.ok
        ? { tone: "good", text: "Started — results appear below as they arrive." }
        : { tone: "warn", text: r?.error ?? "Open this page in the Chrome where the extension is connected to run it now." },
    );
    refresh();
  };

  const firstEvent = ov?.events.at(-1);

  return (
    <div className="flex flex-col gap-4">
      {/* ---------------------------------------------------------- hero status */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <Tone tone={health.tone}>{health.label}</Tone>
              <Help term="extHealth" />
            </div>
            <div className="text-[22px] font-extrabold leading-tight tracking-tight">{health.headline}</div>
            <p className="mt-1 max-w-2xl text-[14px] text-ink-2">{health.sub}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {devices.length > 0 && (
              <button
                onClick={runNow}
                disabled={!pairedHere || health.tone === "run"}
                title={pairedHere ? "Check everything that's due, now" : "Open this page in a connected Chrome to run now"}
                className="btn-ghost flex h-10 items-center gap-2 px-4 text-sm"
              >
                <RefreshCw className={`h-4 w-4 ${health.tone === "run" ? "animate-spin" : ""}`} />
                Run now
              </button>
            )}
            {!devices.length && (
              <button onClick={connect} disabled={busy || ping === null} className="btn-primary flex h-10 items-center gap-2 px-4 text-sm">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}Connect extension
              </button>
            )}
          </div>
        </div>
        {"progress" in health && (
          <div className="h-1 bg-white/[0.06]">
            <div className="h-full bg-primary transition-all duration-500" style={{ width: `${(health.progress ?? 0) * 100}%` }} />
          </div>
        )}
        {msg && (
          <div className={`border-t border-line/70 px-5 py-2.5 text-sm ${msg.tone === "good" ? "text-good" : "text-warn"}`}>{msg.text}</div>
        )}
      </section>

      {/* ---------------------------------------------------------- setup */}
      <section className="card">
        <button onClick={() => setShowSteps(!stepsOpen)} className="flex w-full items-center justify-between px-5 py-3.5 text-left">
          <span className="flex items-center gap-2 text-[15px] font-semibold">
            {setupDone ? <CheckCircle2 className="h-4 w-4 text-good" /> : <PlugZap className="h-4 w-4 text-primary" />}
            {setupDone ? "Setup complete" : "Set up in 3 steps"}
            <span className="text-xs font-normal text-ink-3">· about 1 minute</span>
          </span>
          <ChevronDown className={`h-4 w-4 text-ink-3 transition ${stepsOpen ? "rotate-180" : ""}`} />
        </button>
        {stepsOpen && (
          <div className="border-t border-line/70 px-5 py-5">
            <Step
              n={1}
              done={installedHere || devices.length > 0}
              title={<>Install the extension</>}
              right={
                installedHere ? <span className="text-xs text-good">installed in this browser · v{(ping as Ping).version}</span> : null
              }
            >
              {storeUrl ? (
                <div className="flex flex-wrap items-center gap-3">
                  <a href={storeUrl} target="_blank" rel="noreferrer" className="btn-primary flex h-10 items-center gap-2 px-4 text-sm">
                    <MonitorSmartphone className="h-4 w-4" />
                    Add to Chrome — free
                  </a>
                  <span className="text-xs text-ink-3">Chrome, Edge or Brave on a computer (not phones).</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[13px] text-ink-3">Chrome Web Store listing coming soon. For now, install the developer build:</p>
                  <ol className="ml-5 list-decimal space-y-2">
                    <li>
                      Build it once (repo root): <Cmd>pnpm install && pnpm ext:build</Cmd>
                    </li>
                    <li>
                      Open <Cmd>chrome://extensions</Cmd> and switch on <b className="text-ink">Developer mode</b> (top right).
                    </li>
                    <li>
                      Click <b className="text-ink">Load unpacked</b> and choose the <Cmd>apps/extension/dist</Cmd> folder. Then reload this
                      page.
                    </li>
                  </ol>
                </div>
              )}
            </Step>
            <Step
              n={2}
              done={devices.length > 0}
              title="Connect it to this dashboard"
              right={
                pairedHere ? (
                  <span className="text-xs text-good">this browser is connected</span>
                ) : ping !== "none" && ping && (ping as Ping).pairedElsewhere ? (
                  <span className="text-xs text-warn">connected to another dashboard</span>
                ) : null
              }
            >
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={connect}
                  disabled={busy || ping === null}
                  className={`${pairedHere ? "btn-ghost" : "btn-primary"} flex h-10 items-center gap-2 px-4 text-sm`}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                  {pairedHere ? "Reconnect" : "Connect extension"}
                </button>
                <span className="text-xs text-ink-3">
                  Usually automatic: opening the dashboard connects an installed extension. No login, nothing to copy.
                </span>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-[13px] text-ink-3 hover:text-ink-2">Extension on another computer?</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <CopyField label="Dashboard address" value={origin} />
                  <p className="self-end text-xs text-ink-3">
                    Open the extension popup there, paste this address, click Connect. No account or key needed.
                  </p>
                </div>
              </details>
            </Step>
            <Step n={3} done={hasEvents} title="First results arrive">
              {hasEvents ? (
                <span className="text-good">First results arrived {ago(firstEvent?.at)}.</span>
              ) : devices.length ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Waiting for the first check… usually under a minute.
                </span>
              ) : (
                "Happens automatically right after you connect."
              )}
            </Step>
          </div>
        )}
      </section>

      {ov && devices.length > 0 && (
        <>
          {/* ---------------------------------------------------------- KPIs */}
          <section className="card grid grid-cols-2 gap-y-4 px-1 py-4 sm:flex sm:flex-wrap">
            {[
              {
                k: "checkedToday",
                label: "Checked today",
                value: `${ov.checkedToday}/${ov.tracked}`,
                sub: ov.tracked ? `${Math.round((ov.checkedToday / ov.tracked) * 100)}% of keywords` : "no keywords yet",
              },
              { k: "waiting", label: "Waiting", value: String(ov.pending), sub: "jobs for the extension" },
              {
                k: "appleRequests",
                label: "Apple requests today",
                value: String(ov.requestsToday),
                sub: null,
                meter: ov.requestsToday / (ov.cap * Math.max(1, devices.length)),
              },
              {
                k: "devices",
                label: "Connected browsers",
                value: String(devices.length),
                sub: devices
                  .map((d) => d.name)
                  .slice(0, 1)
                  .join(""),
              },
              {
                k: "lastCheckIn",
                label: "Last check-in",
                value: ago(
                  devices
                    .map((d) => d.lastSeen)
                    .filter(Boolean)
                    .sort()
                    .at(-1) ?? null,
                ),
                sub: "about every hour",
              },
            ].map((x, i) => (
              <div key={x.k} className={`px-4 sm:min-w-36 ${i > 0 ? "sm:border-l sm:border-line" : ""}`}>
                <div className="text-[13px] text-ink-2">
                  <L term={x.k}>{x.label}</L>
                </div>
                <div className="mt-0.5 text-[26px] font-bold leading-tight tracking-tight tabular">{x.value}</div>
                {x.meter != null ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-series-blue"
                        style={{ width: `${Math.max(2, Math.min(100, x.meter * 100))}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-ink-3">of {(ov.cap * devices.length).toLocaleString()} cap</span>
                  </div>
                ) : (
                  <div className="mt-0.5 truncate text-xs text-ink-3">{x.sub}</div>
                )}
              </div>
            ))}
          </section>

          {/* ---------------------------------------------------------- charts */}
          <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
            <section className="card p-4">
              <h3 className="mb-3 text-[15px] font-semibold">
                <L term="activity14">Activity · last 14 days</L>
              </h3>
              <ActivityBars days={ov.days} />
            </section>
            <section className="card p-4">
              <h3 className="mb-6 text-[15px] font-semibold">
                <L term="todayByHour">Today by hour</L>
              </h3>
              <HourStrip utcHours={ov.hours} />
            </section>
          </div>

          {/* ---------------------------------------------------------- live feed */}
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line/70 px-4 py-3">
              <h3 className="text-[15px] font-semibold">
                <L term="activityFeed">Live activity</L>
              </h3>
              <span className="flex items-center gap-1.5 text-xs text-ink-3">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" />
                updates every 3 s
              </span>
            </div>
            {ov.events.length ? (
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full min-w-[640px] text-left text-[13px]">
                  <thead className="sticky top-0 bg-card text-[12px] text-ink-3">
                    <tr className="border-b border-line/70">
                      <th className="py-2 pl-4 font-medium">When</th>
                      <th className="px-3 font-medium">What</th>
                      <th className="px-3 font-medium">
                        <L term="keyword">Keyword</L>
                      </th>
                      <th className="px-3 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ov.events.map((e) => (
                      <EventRow key={e.id} e={e} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-ink-3">
                Nothing yet — results appear here the moment the extension sends them.
              </p>
            )}
          </section>

          {/* ---------------------------------------------------------- devices */}
          <section className="card overflow-hidden">
            <div className="border-b border-line/70 px-4 py-3 text-[15px] font-semibold">
              <L term="devices">Connected browsers</L>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead className="text-[12px] text-ink-3">
                  <tr className="border-b border-line/70">
                    <th className="py-2 pl-4 font-medium">Browser</th>
                    <th className="px-3 font-medium">Status</th>
                    <th className="px-3 font-medium">
                      <L term="lastCheckIn">Last check-in</L>
                    </th>
                    <th className="px-3 font-medium">Today</th>
                    <th className="px-3 font-medium">
                      <L term="appleRequests">Apple requests</L>
                    </th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d) => {
                    const st = d.status?.state ?? "idle";
                    const stale = minutesSince(d.lastSeen) > 26 * 60;
                    return (
                      <tr key={d.id} className="border-b border-line/40">
                        <td className="py-2.5 pl-4">
                          <div className="flex items-center gap-2.5">
                            <span className="grid h-8 w-8 place-items-center rounded-lg bg-well">
                              <MonitorSmartphone className="h-4 w-4 text-ink-2" />
                            </span>
                            <div>
                              <div className="font-semibold text-ink">{d.name}</div>
                              <div className="text-[11px] text-ink-3">
                                {d.version ? `extension v${d.version}` : "not seen yet"} · connected {ago(d.createdAt)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3">
                          {stale ? (
                            <Tone tone="warn">Offline</Tone>
                          ) : st === "running" ? (
                            <Tone tone="run">
                              Checking {d.status!.done}/{d.status!.total}
                            </Tone>
                          ) : st === "error" ? (
                            <Tone tone="bad">Problem</Tone>
                          ) : st === "backoff" ? (
                            <Tone tone="warn">Slowed down</Tone>
                          ) : (
                            <Tone tone="good">Ready</Tone>
                          )}
                        </td>
                        <td className="px-3 text-ink-2">{ago(d.lastSeen)}</td>
                        <td className="px-3 tabular text-ink-2">
                          {d.today.serp} kw · {d.today.hints} pop
                          {d.today.errors ? <span className="text-bad"> · {d.today.errors} err</span> : null}
                        </td>
                        <td className="px-3">
                          <div className="flex items-center gap-2">
                            <span className="w-10 text-right tabular text-ink">{d.requestsToday}</span>
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.06]">
                              <div
                                className="h-full rounded-full bg-series-blue"
                                style={{ width: `${Math.max(2, Math.min(100, (d.requestsToday / ov.cap) * 100))}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="pr-3">
                          <button
                            onClick={() => remove(d)}
                            title="Remove this browser"
                            className="grid h-8 w-8 place-items-center rounded-md text-ink-3 hover:bg-bad/10 hover:text-bad"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ---------------------------------------------------------- privacy & safety */}
      <section className="card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-[15px] font-semibold">
          <ShieldCheck className="h-4 w-4 text-good" />
          What the extension does — and never does
        </h3>
        <div className="grid gap-6 md:grid-cols-2">
          <ul className="space-y-2.5 text-[14px] text-ink-2">
            {[
              "Checks only the keywords and apps you track on this dashboard",
              "Talks only to itunes.apple.com, search.itunes.apple.com, apps.apple.com — and this dashboard",
              "At most ~10 Apple requests a minute and 2,500 a day per browser",
              "If Apple says “slow down”, pauses that Apple server for 1–24 h automatically",
              "Sends each result right away, so nothing is lost if Chrome closes",
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                {t}
              </li>
            ))}
          </ul>
          <ul className="space-y-2.5 text-[14px] text-ink-2">
            {[
              "Never sends your Apple login or cookies",
              "Never reads your tabs, history or other websites",
              "Never checks keywords on behalf of other people",
              "Never runs code downloaded from the internet",
              "Never touches your App Store Connect account",
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <X className="mt-0.5 h-4 w-4 shrink-0 text-bad" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------------------------------------------------- troubleshooting */}
      <section className="card">
        <div className="px-5 pt-4 text-[15px] font-semibold">Troubleshooting</div>
        <div className="divide-y divide-line/60 px-5 pb-2">
          {[
            [
              "This page says the extension isn't installed",
              <>
                Open <Cmd>chrome://extensions</Cmd> and check Ranklark is switched on, then reload this page. Extensions only work in
                Chrome, Edge or Brave on a computer. The developer build&apos;s ID should be{" "}
                <code className="text-ink-3">{extensionId}</code>.
              </>,
            ],
            [
              "Checks stopped, or a browser shows “Offline”",
              "Checks only run while Chrome is open on that computer (a sleeping laptop doesn't count). When Chrome opens again, the extension catches up within about a minute. Missed days show as gaps on your charts.",
            ],
            [
              "“Apple asked us to slow down”",
              "Apple temporarily refused requests from your internet connection. The extension pauses only that Apple server (1 hour, then longer if it repeats) and keeps the rest going. Shared connections and VPNs make this more likely.",
            ],
            [
              "“Already connected to another dashboard”",
              "One browser can be connected to one Ranklark dashboard. Open the extension popup, click Disconnect, then connect here.",
            ],
            [
              "Chrome asks to allow access to devices on your local network",
              "Newer Chrome versions ask this when a dashboard runs on your own computer (localhost). Allow it for this dashboard. A dashboard on a normal https:// address doesn't trigger it.",
            ],
            [
              "I want to stop a computer from checking",
              "Click the bin icon next to it under Connected browsers. Its key stops working immediately.",
            ],
          ].map(([q, a]) => (
            <details key={q as string} className="group py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] text-ink hover:text-ink">
                {q}
                <ChevronDown className="h-4 w-4 text-ink-3 transition group-open:rotate-180" />
              </summary>
              <div className="mt-2 text-[13px] leading-relaxed text-ink-2">{a}</div>
            </details>
          ))}
        </div>
      </section>

      <p className="flex items-center px-1 text-[12px] text-ink-3">
        Who calls Apple:{" "}
        <b className="mx-1 text-ink-2">
          {ov?.mode === "extension" ? "only your browsers (extension mode)" : "this server and your browsers"}
        </b>
        <Help term="fetchMode" />
      </p>
    </div>
  );
}
