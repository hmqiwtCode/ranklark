"use client";

import {
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  CircleSlash,
  Copy,
  Hammer,
  ListChecks,
  Loader2,
  type LucideIcon,
  Microscope,
  PenLine,
  Route,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import type { AgentRole, Fact, FactSource, FindingVerdict, NodeStatus, RunSource, RunStatus } from "../lib/contract";

// ---------------------------------------------------------------- formatting

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  if (m < 60) return `${m}m ${String(r).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** "0:42", "12:05", "1:02:09" for the ticking clock. */
export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function fmtUsd(n: number | null): string {
  if (n == null) return "—";
  if (n === 0) return "$0.00";
  if (n < 0.01) return "<$0.01";
  return `$${n.toFixed(n < 10 ? 2 : 1)}`;
}

/** SQLite "2026-11-03 10:20:00" or ISO → Date. */
export function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  return Number.isFinite(t) ? t : null;
}

export function fmtDate(iso: string | null | undefined): string {
  const t = parseTime(iso);
  if (t == null) return "—";
  return new Date(t).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export const sourceLabel = (s: RunSource | null | undefined) => (s === "mcp" ? "Claude Code" : s === "api" ? "Claude API" : "—");

// ---------------------------------------------------------------- status

const RUN_STATUS: Record<RunStatus, { label: string; cls: string }> = {
  running: { label: "Running", cls: "border-primary/40 bg-primary/10 text-primary" },
  done: { label: "Done", cls: "border-good/30 bg-good/10 text-good" },
  failed: { label: "Failed", cls: "border-bad/30 bg-bad/10 text-bad" },
  cancelled: { label: "Stopped", cls: "border-line-strong bg-white/[0.03] text-ink-2" },
  interrupted: { label: "Interrupted", cls: "border-warn/30 bg-warn/10 text-warn" },
};

export function StatusPill({ status, size = "md" }: { status: RunStatus; size?: "sm" | "md" }) {
  const s = RUN_STATUS[status] ?? RUN_STATUS.failed;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold ${s.cls} ${size === "sm" ? "px-2 py-px text-[11px]" : "px-2.5 py-0.5 text-[12px]"}`}
    >
      {status === "running" ? (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
      )}
      {s.label}
    </span>
  );
}

export const NODE_STATUS: Record<NodeStatus, { label: string; text: string; border: string; icon: LucideIcon }> = {
  running: { label: "Running", text: "text-primary", border: "border-primary/70", icon: Loader2 },
  done: { label: "Done", text: "text-good", border: "border-good/35", icon: CheckCircle2 },
  failed: { label: "Failed", text: "text-bad", border: "border-bad/60", icon: XCircle },
  skipped: { label: "Skipped", text: "text-ink-3", border: "border-line-strong border-dashed", icon: CircleSlash },
};

export function NodeStatusIcon({ status, className = "h-3.5 w-3.5" }: { status: NodeStatus; className?: string }) {
  const s = NODE_STATUS[status];
  const Icon = s.icon;
  return <Icon aria-label={s.label} className={`${className} ${s.text} ${status === "running" ? "animate-spin" : ""}`} />;
}

// ---------------------------------------------------------------- roles

export const ROLE: Record<AgentRole, { label: string; icon: LucideIcon; term: string; ai: boolean }> = {
  planner: { label: "Planner", icon: Route, term: "rolePlanner", ai: true },
  worker: { label: "Worker", icon: Hammer, term: "roleWorker", ai: false },
  analyst: { label: "Analyst", icon: Microscope, term: "roleAnalyst", ai: true },
  checker: { label: "Checker", icon: ListChecks, term: "roleChecker", ai: true },
  composer: { label: "Composer", icon: PenLine, term: "roleComposer", ai: true },
  validator: { label: "Validator", icon: ShieldCheck, term: "roleValidator", ai: false },
};

// ---------------------------------------------------------------- facts

export const FACT_SOURCE: Record<FactSource, { label: string; cls: string; tip: string }> = {
  app_store_listing: {
    label: "App Store",
    cls: "text-sky border-sky/30 bg-sky/10",
    tip: "The app's App Store listing (iTunes Lookup or our saved copy)",
  },
  apple_autocomplete: { label: "Autocomplete", cls: "text-sky border-sky/30 bg-sky/10", tip: "App Store search suggestions" },
  itunes_search: { label: "iTunes API", cls: "text-sky border-sky/30 bg-sky/10", tip: "Official iTunes Search API order (up to 200 apps)" },
  app_store_web: {
    label: "App Store web",
    cls: "text-sky border-sky/30 bg-sky/10",
    tip: "apps.apple.com search page: the real order of the top ~12",
  },
  hints_estimate: {
    label: "Est.",
    cls: "text-ink-2 border-line-strong bg-white/[0.03]",
    tip: "Our popularity estimate from App Store autocomplete, not Apple search volume",
  },
  apple_ads: { label: "Apple Ads", cls: "text-sky border-sky/30 bg-sky/10", tip: "Apple Ads Search Popularity: Apple's own demand data" },
  ranklark_formula: {
    label: "Formula",
    cls: "text-ink-2 border-line-strong bg-white/[0.03]",
    tip: "Ranklark's difficulty / opportunity formulas (see Methodology)",
  },
  metadata_rules: { label: "Rules", cls: "text-ink-2 border-line-strong bg-white/[0.03]", tip: "Apple's field limits + our audit rules" },
};

export function FactSourceBadge({ source }: { source: FactSource }) {
  const s = FACT_SOURCE[source] ?? { label: source, cls: "text-ink-3 border-line", tip: source };
  return (
    <span
      title={s.tip}
      className={`inline-flex items-center whitespace-nowrap rounded-md border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

export const FACT_KIND: Record<Fact["kind"], string> = {
  app_profile: "App listing",
  suggestions: "Autocomplete",
  keyword_score: "Keyword score",
  competitor_phrases: "Competitor titles",
  metadata_check: "Metadata check",
};

/** The term or name a fact is about, for the Evidence table. */
export function factSubject(f: Fact): string {
  switch (f.kind) {
    case "app_profile":
      return f.data.name;
    case "suggestions":
      return f.data.seed;
    case "keyword_score":
      return f.data.term;
    case "competitor_phrases":
      return f.data.term;
    case "metadata_check":
      return f.data.name || "—";
  }
}

export function FactChip({ id, onClick, missing = false }: { id: string; onClick?: (id: string) => void; missing?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(id)}
      title={missing ? `${id} is not in the evidence` : `Show ${id} in Evidence`}
      className={`inline-flex items-center rounded-md border px-1.5 py-px font-mono text-[11px] transition ${missing ? "border-bad/40 text-bad" : "border-line-strong text-ink-2 hover:border-sky/50 hover:text-sky"}`}
    >
      {id}
    </button>
  );
}

// ---------------------------------------------------------------- findings

const VERDICT: Record<FindingVerdict["status"], { label: string; cls: string; icon: LucideIcon }> = {
  supported: { label: "Supported", cls: "border-good/30 bg-good/10 text-good", icon: Check },
  unsupported: { label: "Unsupported", cls: "border-bad/30 bg-bad/10 text-bad", icon: Ban },
  needs_data: { label: "Needs data", cls: "border-warn/30 bg-warn/10 text-warn", icon: CircleDashed },
};

export function VerdictChip({ verdict }: { verdict: FindingVerdict | undefined }) {
  if (!verdict)
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-px text-[11px] text-ink-3">
        <Loader2 className="h-3 w-3 animate-spin" /> Not checked yet
      </span>
    );
  const v = VERDICT[verdict.status];
  const Icon = v.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-px text-[11px] font-semibold ${v.cls}`}>
      <Icon className="h-3 w-3" />
      {v.label}
      <span className="font-normal opacity-75">· {verdict.by === "rules" ? "rules" : "checker"}</span>
    </span>
  );
}

// ---------------------------------------------------------------- small widgets

export function CopyButton({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      aria-label={label}
      title={label}
      className={`btn-ghost inline-flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-[12px] ${className}`}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-good" /> : <Copy className="h-3.5 w-3.5 text-ink-3" />}
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}

export function JsonBlock({ value, label, defaultOpen = true }: { value: unknown; label: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (value === undefined) return null;
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 py-1 text-left text-[12px] font-semibold uppercase tracking-wide text-ink-3 hover:text-ink"
      >
        {label}
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <pre className="mt-1 max-h-80 overflow-auto rounded-lg border border-line bg-well p-3 font-mono text-[11.5px] leading-relaxed text-ink-2">
          {text}
        </pre>
      )}
    </div>
  );
}

export function Empty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-ink-3">
      {icon}
      <div className="max-w-md">{children}</div>
    </div>
  );
}
