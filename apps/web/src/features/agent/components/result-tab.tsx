"use client";

import { LIMITS } from "@ranklark/core/metadata";
import { AlertTriangle, CheckCircle2, Loader2, Plus, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { JobBar, useJob } from "@/components/actions";
import { Help, L } from "@/components/help";
import { Meter, SourceBadge } from "@/components/ui";
import type { Fact, Recommendation, RecommendedKeyword, RunStatus, ValidationIssue } from "../lib/contract";
import type { GraphNode, RunView } from "../lib/reduce";
import { CopyButton, Empty, FactChip, ROLE } from "./bits";

const chars = (s: string) => [...s].length;

function CharMeter({ used, limit }: { used: number; limit: number }) {
  const over = used > limit;
  const pct = Math.min(100, (used / limit) * 100);
  return (
    <span className="flex items-center gap-2" title={`${used} of ${limit} characters`}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.06]">
        <span className={`block h-full rounded-full ${over ? "bg-bad" : "bg-good"}`} style={{ width: `${Math.max(2, pct)}%` }} />
      </span>
      <span className={`tabular text-[12px] ${over ? "font-semibold text-bad" : "text-ink-3"}`}>
        {used}/{limit}
      </span>
    </span>
  );
}

function FieldRow({
  label,
  term,
  value,
  used,
  limit,
  issues,
}: {
  label: string;
  term: string;
  value: string;
  used: number;
  limit: number;
  issues: ValidationIssue[];
}) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-line/60 py-3 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">
          <L term={term}>{label}</L>
        </span>
        <span className="flex items-center gap-2">
          <CharMeter used={used} limit={limit} />
          <CopyButton text={value} label="Copy" />
        </span>
      </div>
      <div
        className={`rounded-lg bg-well px-3 py-2.5 text-[16px] [overflow-wrap:anywhere] font-semibold ${value ? "text-ink" : "text-ink-3"}`}
      >
        {value || "—"}
      </div>
      {issues.length > 0 && (
        <ul className="flex flex-col gap-1">
          {issues.map((i, k) => (
            <IssueLine key={k} issue={i} />
          ))}
        </ul>
      )}
    </div>
  );
}

function IssueLine({ issue }: { issue: ValidationIssue }) {
  const err = issue.level === "error";
  return (
    <li className={`flex items-start gap-2 text-[12.5px] ${err ? "text-bad" : "text-warn"}`}>
      {err ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <span>
        {issue.message} <span className="font-mono text-[11px] opacity-70">{issue.rule}</span>
      </span>
    </li>
  );
}

const ROLE_CHIP: Record<RecommendedKeyword["role"], { label: string; cls: string }> = {
  primary: { label: "Primary", cls: "bg-primary/15 text-primary" },
  secondary: { label: "Secondary", cls: "bg-sky/15 text-sky" },
  long_tail: { label: "Long tail", cls: "bg-white/10 text-ink-2" },
};
const PLACE_CHIP: Record<RecommendedKeyword["placement"], string> = { name: "Name", subtitle: "Subtitle", keywords: "Keyword field" };

function KeywordTable({
  keywords,
  factIds,
  onFact,
  hasApp,
}: {
  keywords: RecommendedKeyword[];
  factIds: Set<string>;
  onFact: (id: string) => void;
  hasApp: boolean;
}) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-[13px]">
        <thead className="text-[12px] text-ink-3">
          <tr className="border-b border-line/70">
            <th className="w-8 py-2.5 pl-4 font-medium">#</th>
            <th className="px-3 font-medium">
              <L term="keyword">Keyword</L>
            </th>
            <th className="px-3 font-medium">
              <L term="agentKwRole">Role</L>
            </th>
            <th className="px-3 font-medium">
              <L term="agentKwPlacement">Placement</L>
            </th>
            <th className="px-3 font-medium">
              <L term="popularity">Popularity</L>
            </th>
            <th className="px-3 font-medium">
              <L term="difficulty">Difficulty</L>
            </th>
            <th className="px-3 font-medium">
              <L term="opportunity">Opportunity</L>
            </th>
            {hasApp && (
              <th className="px-3 font-medium">
                <L term="rank">Your rank</L>
              </th>
            )}
            <th className="px-3 font-medium">
              <L term="agentWhy">Why</L>
            </th>
            <th className="px-3 pr-4 font-medium">
              <L term="agentCites">Facts</L>
            </th>
          </tr>
        </thead>
        <tbody>
          {keywords.map((k, i) => {
            const m = k.metrics;
            return (
              <tr
                key={`${k.term}-${i}`}
                className={`border-b border-line/40 align-top hover:bg-white/[0.025] ${m?.brand ? "opacity-60" : ""}`}
              >
                <td className="py-2.5 pl-4 tabular text-ink-3">{i + 1}</td>
                <td className="whitespace-nowrap px-3 py-2.5 font-medium">
                  {k.term}
                  {m?.brand && (
                    <span className="ml-2 inline-flex items-center rounded bg-warn/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-warn">
                      Brand
                      <Help term="brand" className="ml-1 border-warn/40 text-warn" />
                    </span>
                  )}
                  {!m && <span className="block text-[11px] font-normal text-warn">never scored</span>}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${ROLE_CHIP[k.role]?.cls ?? ""}`}>
                    {ROLE_CHIP[k.role]?.label ?? k.role}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-ink-2">{PLACE_CHIP[k.placement] ?? k.placement}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <Meter value={m?.popularity ?? null} color="var(--color-series-blue)" />
                    {m?.popularity != null && <SourceBadge source={m.popSource} />}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <Meter value={m?.difficulty ?? null} color="var(--color-series-orange)" />
                </td>
                <td className="px-3 py-2.5 tabular font-semibold">{m?.opportunity ?? <span className="font-normal text-ink-3">—</span>}</td>
                {hasApp && (
                  <td className="px-3 py-2.5 tabular font-semibold">
                    {m?.yourRank != null ? (
                      <span className={m.yourRank <= 10 ? "text-good" : ""}>#{m.yourRank}</span>
                    ) : (
                      <span className="font-normal text-ink-3">—</span>
                    )}
                  </td>
                )}
                <td className="max-w-[280px] px-3 py-2.5 text-[12.5px] leading-snug text-ink-2">{k.why || "—"}</td>
                <td className="px-3 py-2.5 pr-4">
                  <div className="flex flex-wrap gap-1">
                    {k.factIds.length ? (
                      k.factIds.map((id) => <FactChip key={id} id={id} onClick={onFact} missing={!factIds.has(id)} />)
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TrackButton({ runId, terms, appId, country }: { runId: string; terms: string[]; appId: number; country: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { job, track } = useJob();
  const count = terms.length;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={busy || !count}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const r = await fetch(`/api/agent/runs/${encodeURIComponent(runId)}/track`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ terms }),
            });
            const j = (await r.json().catch(() => ({}))) as { added?: number; jobId?: string | null; terms?: string[]; error?: string };
            if (!r.ok) {
              setMsg({ ok: false, text: j.error ?? `Couldn't track them (the server answered ${r.status}).` });
              return;
            }
            const n = j.terms?.length ?? count;
            const added = j.added ?? 0;
            const what =
              added === 0
                ? `All ${n} were already tracked.`
                : added === n
                  ? `Tracking ${n} new keyword${n === 1 ? "" : "s"}.`
                  : `Tracking ${added} new keyword${added === 1 ? "" : "s"} (${n - added} already tracked).`;
            setMsg({
              ok: true,
              text: `${what} ${j.jobId ? "Ranks are being checked now." : "Your browser extension checks their ranks the next time it runs."}`,
            });
            if (j.jobId) track(j.jobId);
          } catch {
            setMsg({ ok: false, text: "Couldn't reach the server." });
          } finally {
            setBusy(false);
          }
        }}
        className="btn-primary flex h-9 items-center gap-1.5 px-3 text-sm"
        title="Follow these keywords' ranks for this app every day (brand names are skipped)"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Track {count} keyword{count === 1 ? "" : "s"}
      </button>
      <JobBar job={job} />
      {msg && (
        <span className={`text-[13px] ${msg.ok ? "text-good" : "text-bad"}`}>
          {msg.text}
          {msg.ok && (
            <Link href={`/apps/${appId}?country=${country}`} className="ml-2 font-semibold text-ink underline underline-offset-2">
              Open app →
            </Link>
          )}
        </span>
      )}
    </div>
  );
}

/** Plain-language "what is happening now" for the placeholder while the run works. */
export function stageText(view: RunView): string {
  const running = [...view.nodes].reverse().find((n: GraphNode) => n.status === "running");
  const max = view.config?.maxIterations;
  const it = running?.iteration ? ` (iteration ${running.iteration}${max ? ` of ${max}` : ""})` : "";
  if (!running) return view.nodes.length ? "Between steps…" : "Starting up…";
  switch (running.role) {
    case "planner":
      return `The planner is choosing what to look up${it}.`;
    case "worker":
      return running.iteration === 0 ? "Reading the app's App Store listing." : `Workers are collecting App Store data${it}.`;
    case "analyst":
      return `The analyst is turning the evidence into findings${it}.`;
    case "checker":
      return `The checker is verifying the findings${it}.`;
    case "composer":
      return "The composer is writing the name, subtitle and keyword field.";
    case "validator":
      return "Checking the recommendation against Apple's limits and our rules.";
    default:
      return "Working…";
  }
}

export function ResultTab({
  view,
  status,
  runId,
  appId,
  country,
  onFact,
}: {
  view: RunView;
  status: RunStatus;
  runId: string;
  appId: number | null;
  country: string;
  onFact: (id: string) => void;
}) {
  const rec: Recommendation | null = view.recommendation;
  if (!rec) {
    if (status === "running")
      return (
        <Empty icon={<Loader2 className="h-5 w-5 animate-spin text-primary" />}>
          <span className="text-ink-2">{stageText(view)}</span>
          <span className="mt-1 block">
            The recommendation appears here when the run finishes. You can leave this page; the run keeps going.
          </span>
        </Empty>
      );
    if (status === "failed")
      return (
        <div className="m-4 rounded-lg border border-bad/30 bg-bad/10 p-4 text-[13.5px] text-bad">
          <div className="mb-1 font-semibold">The run failed</div>
          <div className="whitespace-pre-wrap text-ink-2">{view.error ?? "No error message was recorded."}</div>
        </div>
      );
    if (status === "cancelled") return <Empty>You stopped this run before it wrote a recommendation.</Empty>;
    if (status === "interrupted")
      return <Empty>The server restarted while this run was going, so it stopped. Start a new run to try again.</Empty>;
    return <Empty>This run finished without a recommendation.{view.error ? ` ${view.error}` : ""}</Empty>;
  }

  const v = rec.validation;
  const byField = (f: ValidationIssue["field"]) => v.issues.filter((i) => i.field === f);
  const general = byField("all");
  const errors = v.issues.filter((i) => i.level === "error").length;
  const warns = v.issues.length - errors;
  const factIds = new Set(view.facts.map((f: Fact) => f.id));
  const trackable = [...new Set(rec.keywords.filter((k) => !k.metrics?.brand).map((k) => k.term))];

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0 px-4 pb-2 pt-1">
          <FieldRow
            label="App name"
            term="appName"
            value={rec.name}
            used={v.usage?.name ?? chars(rec.name)}
            limit={LIMITS.name}
            issues={byField("name")}
          />
          <FieldRow
            label="Subtitle"
            term="subtitle"
            value={rec.subtitle}
            used={v.usage?.subtitle ?? chars(rec.subtitle)}
            limit={LIMITS.subtitle}
            issues={byField("subtitle")}
          />
          <FieldRow
            label="Keyword field"
            term="keywordField"
            value={rec.keywordField}
            used={v.usage?.keywords ?? chars(rec.keywordField)}
            limit={LIMITS.keywords}
            issues={byField("keywords")}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4 border-line/70 px-4 py-4 lg:border-l">
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
              <L term="agentValidation">Validation</L>
              {v.ok ? (
                <span className="inline-flex items-center gap-1 text-[12px] font-medium text-good">
                  <CheckCircle2 className="h-3.5 w-3.5" /> no errors
                </span>
              ) : (
                <span className="text-[12px] font-medium text-bad">
                  {errors} error{errors === 1 ? "" : "s"}
                </span>
              )}
              {warns > 0 && (
                <span className="text-[12px] font-medium text-warn">
                  {warns} warning{warns === 1 ? "" : "s"}
                </span>
              )}
            </h3>
            {general.length ? (
              <ul className="flex flex-col gap-1">
                {general.map((i, k) => (
                  <IssueLine key={k} issue={i} />
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-ink-3">
                {v.issues.length
                  ? "Field issues are shown next to each field."
                  : "Within Apple's limits, no repeats, no other apps' names."}
              </p>
            )}
            {v.usage && v.usage.keywordBytes !== v.usage.keywords && (
              <p className="mt-2 text-[11.5px] text-ink-3 tabular">Keyword field: {v.usage.keywordBytes} bytes.</p>
            )}
          </div>
          {rec.alternatives.length > 0 && (
            <div>
              <h3 className="mb-2 text-[13px] font-semibold">Alternatives</h3>
              <ul className="flex flex-col gap-2">
                {rec.alternatives.map((a, i) => (
                  <li key={i} className="rounded-lg bg-well px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="break-words text-[14px] font-semibold">{a.name}</div>
                        <div className="break-words text-[13px] text-ink-2">{a.subtitle}</div>
                      </div>
                      <CopyButton text={`${a.name}\n${a.subtitle}`} label="Copy" />
                    </div>
                    {a.why && <p className="mt-1 text-[12px] text-ink-3">{a.why}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 px-4 py-3">
        <h3 className="text-[15px] font-semibold">
          Recommended keywords <span className="text-sm font-normal text-ink-3">· {rec.keywords.length}</span>
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton text={rec.keywords.map((k) => k.term).join(", ")} label="Copy list" />
          {appId != null ? (
            <TrackButton runId={runId} terms={trackable} appId={appId} country={country} />
          ) : (
            <span className="text-[12px] text-ink-3">Publish the app and add it to Ranklark to track these.</span>
          )}
        </div>
      </div>
      {rec.keywords.length ? (
        <KeywordTable keywords={rec.keywords} factIds={factIds} onFact={onFact} hasApp={appId != null} />
      ) : (
        <Empty>No keywords in the recommendation.</Empty>
      )}

      {rec.rationale && (
        <div className="border-t border-line/70 px-4 py-4">
          <h3 className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold">
            Why this recommendation
            <span className="text-[11px] font-normal text-ink-3">written by the {ROLE.composer.label.toLowerCase()}</span>
          </h3>
          <p className="max-w-3xl whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-2">{rec.rationale}</p>
        </div>
      )}
    </div>
  );
}
