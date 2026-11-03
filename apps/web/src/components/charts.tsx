"use client";

import { useEffect, useRef, useState } from "react";
import { shortDay } from "@/lib/format";

type Pt = { x: number; y: number };

/** Fritsch–Carlson monotone cubic: smooth like DataFast's curve, but never overshoots the data. */
function monotonePath(pts: Pt[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  const n = pts.length;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x;
    m[i] = (pts[i + 1].y - pts[i].y) / dx[i];
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++)
    t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  t[n - 1] = m[n - 2];
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i].x + h},${pts[i].y + h * t[i]} ${pts[i + 1].x - h},${pts[i + 1].y - h * t[i + 1]} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export type SeriesPoint = { day: string; value: number | null; top10?: number; ranked?: number };
export type Marker = { day: string; label: string; changes: string[] };

/**
 * Single-series area line (visibility over time) with metadata-change markers.
 * One series → no legend; the card title names it. Hover = crosshair + tooltip.
 */
export function VisibilityChart({
  data,
  markers = [],
  height = 300,
  unit = "%",
}: {
  data: SeriesPoint[];
  markers?: Marker[];
  height?: number;
  unit?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 36, r: 12, t: 28, b: 26 };
  const W = Math.max(width, 200);
  const H = height;
  const vals = data.map((d) => d.value).filter((v): v is number => v != null);
  const maxV = Math.max(10, Math.ceil((Math.max(...vals, 0) * 1.15) / 10) * 10);
  const x = (i: number) => pad.l + (i / Math.max(data.length - 1, 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / maxV) * (H - pad.t - pad.b);

  // Split the line wherever a day has no value (cheap enough to recompute every render).
  const segments: Pt[][] = [];
  let cur: Pt[] = [];
  data.forEach((d, i) => {
    if (d.value == null) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else cur.push({ x: x(i), y: y(d.value) });
  });
  if (cur.length) segments.push(cur);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxV * f));
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(W / 90))));
  const markerIdx = markers.map((m) => ({ ...m, i: data.findIndex((d) => d.day === m.day) })).filter((m) => m.i >= 0);
  const h = hover != null ? data[hover] : null;
  const hm = hover != null ? markerIdx.find((m) => m.i === hover) : undefined;
  const empty = vals.length === 0;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height: H }}>
      {width > 0 && (
        <svg
          width={W}
          height={H}
          className="block"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = e.clientX - r.left;
            const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (data.length - 1));
            setHover(Math.min(data.length - 1, Math.max(0, i)));
          }}
        >
          <defs>
            <linearGradient id="visFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-sky)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--color-sky)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={pad.l}
                x2={W - pad.r}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--color-line)"
                strokeDasharray={t === 0 ? undefined : "3 4"}
              />
              <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--color-ink-3)" className="tabular">
                {t}
                {unit}
              </text>
            </g>
          ))}
          {data.map(
            (d, i) =>
              (i % labelEvery === 0 || i === data.length - 1) &&
              !(i !== data.length - 1 && data.length - 1 - i < labelEvery / 2) && (
                <text
                  key={d.day}
                  x={x(i)}
                  y={H - 6}
                  textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
                  fontSize="11"
                  fill="var(--color-ink-3)"
                >
                  {shortDay(d.day)}
                </text>
              ),
          )}
          {segments.map((s, k) => (
            <g key={k}>
              {s.length > 1 && <path d={`${monotonePath(s)} L${s.at(-1)!.x},${y(0)} L${s[0].x},${y(0)} Z`} fill="url(#visFill)" />}
              <path d={monotonePath(s)} fill="none" stroke="var(--color-sky)" strokeWidth={2} strokeLinecap="round" />
              {s.length === 1 && <circle cx={s[0].x} cy={s[0].y} r={4} fill="var(--color-sky)" />}
            </g>
          ))}
          {markerIdx.map((m) => (
            <g key={m.day + m.label}>
              <line x1={x(m.i)} x2={x(m.i)} y1={14} y2={y(0)} stroke="var(--color-primary)" strokeOpacity={0.5} strokeDasharray="2 3" />
              <circle cx={x(m.i)} cy={12} r={7} fill="var(--color-card)" stroke="var(--color-primary)" strokeWidth={2} />
              <text x={x(m.i)} y={12} dy="0.35em" textAnchor="middle" fontSize="9" fontWeight={700} fill="var(--color-primary)">
                M
              </text>
            </g>
          ))}
          {h && hover != null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={y(0)} stroke="var(--color-ink-3)" strokeWidth={1} />
              {h.value != null && (
                <circle cx={x(hover)} cy={y(h.value)} r={5} fill="var(--color-sky)" stroke="var(--color-card)" strokeWidth={2} />
              )}
            </g>
          )}
        </svg>
      )}
      {empty && (
        <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-ink-3">
          <p>
            No rank history yet. Add keywords below and ranks appear within a minute. After that they're checked daily (
            <span className="font-semibold text-ink-2">Refresh</span>, the extension, or <code>pnpm track</code>).
          </p>
        </div>
      )}
      {h && hover != null && (
        <div
          className="pointer-events-none absolute z-10 min-w-44 rounded-xl border border-line bg-[oklch(20%_0_0)] px-3 py-2 text-xs shadow-xl"
          style={{ left: Math.min(x(hover) + 12, W - 190), top: 30 }}
        >
          <div className="mb-1 font-semibold text-ink">{shortDay(h.day)}</div>
          <div className="flex items-center justify-between gap-4 text-ink-2">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky" />
              Visibility
            </span>
            <span className="tabular font-semibold text-ink">{h.value == null ? "—" : `${h.value}${unit}`}</span>
          </div>
          {h.ranked != null && h.value != null && (
            <>
              <div className="mt-1 flex justify-between gap-4 text-ink-2">
                <span>Ranked (≤200)</span>
                <span className="tabular text-ink">{h.ranked}</span>
              </div>
              <div className="flex justify-between gap-4 text-ink-2">
                <span>Top 10</span>
                <span className="tabular text-ink">{h.top10}</span>
              </div>
            </>
          )}
          {hm && (
            <div className="mt-2 border-t border-line pt-2 text-ink-2">
              <div className="mb-0.5 font-semibold text-primary">Metadata changed</div>
              {hm.changes.map((c) => (
                <div key={c}>{c}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Rank trend sparkline: rank 1 at the top, gaps where the app was outside the top 200. */
export function RankSpark({
  history,
  width = 84,
  height = 22,
}: {
  history: { day: string; rank: number | null }[];
  width?: number;
  height?: number;
}) {
  if (history.length < 2) return <span className="text-ink-3">—</span>;
  const ranks = history.map((h) => h.rank).filter((r): r is number => r != null);
  if (!ranks.length) return <span className="text-ink-3">—</span>;
  const lo = Math.min(...ranks);
  const hi = Math.max(...ranks, lo + 4);
  const x = (i: number) => 2 + (i / (history.length - 1)) * (width - 4);
  const y = (r: number) => 2 + ((r - lo) / (hi - lo)) * (height - 4);
  const pts = history.map((h, i) => (h.rank == null ? null : { x: x(i), y: y(h.rank) }));
  const segs: Pt[][] = [];
  let cur: Pt[] = [];
  for (const p of pts) {
    if (p) cur.push(p);
    else {
      if (cur.length) segs.push(cur);
      cur = [];
    }
  }
  if (cur.length) segs.push(cur);
  const first = ranks[0];
  const last = ranks.at(-1)!;
  const color = last < first ? "var(--color-good)" : last > first ? "var(--color-bad)" : "var(--color-sky)";
  return (
    <svg width={width} height={height} aria-label={`rank ${first} → ${last}`}>
      {segs.map((s, i) => (
        <path key={i} d={monotonePath(s)} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" />
      ))}
    </svg>
  );
}

/** Tiny 14-day visibility sparkline for the apps overview. */
export function Spark({ values, width = 120, height = 32 }: { values: (number | null)[]; width?: number; height?: number }) {
  const v = values.map((x, i) => ({ x, i })).filter((p): p is { x: number; i: number } => p.x != null);
  if (v.length < 2)
    return (
      <div style={{ width, height }} className="grid place-items-center text-[11px] text-ink-3">
        no history
      </div>
    );
  const max = Math.max(...v.map((p) => p.x), 1);
  const pts = v.map((p) => ({ x: 2 + (p.i / (values.length - 1)) * (width - 4), y: height - 3 - (p.x / max) * (height - 6) }));
  const d = monotonePath(pts);
  return (
    <svg width={width} height={height}>
      <path d={`${d} L${pts.at(-1)!.x},${height} L${pts[0].x},${height} Z`} fill="var(--color-sky)" opacity={0.12} />
      <path d={d} fill="none" stroke="var(--color-sky)" strokeWidth={1.75} />
    </svg>
  );
}
