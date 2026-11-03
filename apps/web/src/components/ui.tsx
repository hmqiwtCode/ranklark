/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";

export function AppIcon({ src, name, size = 28 }: { src: string | null | undefined; name: string; size?: number }) {
  const r = Math.round(size * 0.225);
  return src ? (
    <img
      src={src}
      alt=""
      title={name}
      width={size}
      height={size}
      style={{ borderRadius: r }}
      className="shrink-0 border border-white/5 bg-well"
      loading="lazy"
    />
  ) : (
    <div style={{ width: size, height: size, borderRadius: r }} className="grid shrink-0 place-items-center bg-well text-[10px] text-ink-3">
      {name.slice(0, 1)}
    </div>
  );
}

/** DataFast-style KPI strip: label on top, big number, small delta under it, hairline dividers. */
export function KpiStrip({ items }: { items: { label: ReactNode; value: ReactNode; sub?: ReactNode; hint?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-y-4 sm:flex sm:flex-wrap">
      {items.map((it, i) => (
        <div key={i} title={it.hint} className={`px-4 sm:min-w-28 ${i > 0 ? "sm:border-l sm:border-line" : ""}`}>
          <div className="text-[13px] text-ink-2">{it.label}</div>
          <div className="mt-0.5 text-[26px] font-bold leading-tight tracking-tight tabular">{it.value}</div>
          {it.sub != null && <div className="mt-0.5 text-xs text-ink-3">{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export function Delta({ value, suffix = "" }: { value: number | null | undefined; suffix?: string }) {
  if (value == null || value === 0) return <span className="text-ink-3">{value === 0 ? "=" : "—"}</span>;
  const up = value > 0;
  return (
    <span className={`tabular font-medium ${up ? "text-good" : "text-bad"}`}>
      {up ? "↑" : "↓"}
      {Math.abs(value)}
      {suffix}
    </span>
  );
}

/** Thin magnitude meter with the number beside it (text stays in ink colour, the bar carries identity). */
export function Meter({ value, color, title }: { value: number | null; color: string; title?: string }) {
  return (
    <div className="flex items-center gap-2" title={title}>
      <span className="w-6 text-right tabular text-[13px] text-ink">{value ?? "—"}</span>
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-white/[0.06]">
        {value != null && (
          <div className="h-full rounded-full" style={{ width: `${Math.max(3, Math.min(100, value))}%`, background: color }} />
        )}
      </div>
    </div>
  );
}

const SOURCE: Record<string, { label: string; cls: string; tip: string }> = {
  apple_ads: { label: "Apple Ads", cls: "text-sky border-sky/30 bg-sky/10", tip: "Apple Ads Search Popularity — Apple's own demand data" },
  hints_estimate: {
    label: "Est.",
    cls: "text-ink-2 border-line-strong bg-white/[0.03]",
    tip: "Our estimate from App Store autocomplete — not Apple search volume",
  },
  asc: { label: "ASC", cls: "text-good border-good/30 bg-good/10", tip: "Read from your App Store Connect account" },
  manual: { label: "Manual", cls: "text-ink-2 border-line-strong bg-white/[0.03]", tip: "Entered by you" },
  itunes: { label: "Apple", cls: "text-sky border-sky/30 bg-sky/10", tip: "Official iTunes Search/Lookup API" },
};

export function SourceBadge({ source, title }: { source: string | null | undefined; title?: string }) {
  if (!source) return null;
  const s = SOURCE[source] ?? { label: source, cls: "text-ink-3 border-line", tip: source };
  return (
    <span
      title={title ?? s.tip}
      className={`inline-flex items-center rounded-md border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

const PLACE: Record<string, { cls: string; tip: string }> = {
  T: { cls: "bg-primary/15 text-primary", tip: "in the app name (title)" },
  S: { cls: "bg-sky/15 text-sky", tip: "in the subtitle" },
  K: { cls: "bg-good/15 text-good", tip: "in the keyword field" },
  D: { cls: "bg-white/10 text-ink-2", tip: "in the developer name" },
};

export function Placement({ where, missing, exact }: { where: string[]; missing: string[]; exact: boolean }) {
  if (!where.length)
    return (
      <span className="text-xs text-ink-3" title="No word of this keyword is in your indexed metadata">
        not in metadata
      </span>
    );
  return (
    <span
      className="inline-flex items-center gap-1"
      title={missing.length ? `missing: ${missing.join(", ")}` : exact ? "exact phrase in title" : "all words covered"}
    >
      {where.map((w) => (
        <span key={w} title={PLACE[w]?.tip} className={`grid h-5 w-5 place-items-center rounded-md text-[10px] font-bold ${PLACE[w]?.cls}`}>
          {w}
        </span>
      ))}
      {missing.length > 0 && <span className="text-[11px] text-warn">+{missing.length} missing</span>}
    </span>
  );
}

/** DataFast bar-list: row background bar proportional to value, label left, value right. */
export function BarList({
  rows,
  color = "var(--color-series-blue)",
  empty = "Nothing yet",
}: {
  rows: { key: string; label: ReactNode; value: number; display?: ReactNode }[];
  color?: string;
  empty?: string;
}) {
  if (!rows.length) return <div className="px-4 py-8 text-center text-sm text-ink-3">{empty}</div>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="flex flex-col gap-[3px]">
      {rows.map((r) => (
        <div key={r.key} className="relative flex h-9 items-center justify-between overflow-hidden rounded-md px-3 text-[14px]">
          <div
            className="absolute inset-y-0 left-0 rounded-md"
            style={{ width: `${(r.value / max) * 100}%`, background: color, opacity: 0.32 }}
          />
          <div className="relative flex min-w-0 items-center gap-2 truncate">{r.label}</div>
          <div className="relative tabular font-semibold">{r.display ?? r.value}</div>
        </div>
      ))}
    </div>
  );
}

export function Card({
  title,
  right,
  children,
  className = "",
  pad = true,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-3">
          <div className="text-[15px] font-semibold">{title}</div>
          {right}
        </div>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}
