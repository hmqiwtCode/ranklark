"use client";

import { useEffect, useRef, useState } from "react";
import { shortDay } from "@/lib/format";

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

const SERIES = [
  { key: "serp", label: "Keyword rank checks", color: "var(--color-series-blue)" },
  { key: "hints", label: "Popularity lookups", color: "var(--color-series-orange)" },
] as const;

/** Stacked bars, last 14 days: what the extension delivered each day. Legend + hover tooltip. */
export function ActivityBars({ days }: { days: { day: string; serp: number; hints: number; apps: number; errors: number }[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 190;
  const pad = { l: 30, r: 6, t: 10, b: 24 };
  const W = Math.max(width, 240);
  const max = Math.max(4, ...days.map((d) => d.serp + d.hints));
  const nice = Math.ceil(max / 4) * 4;
  const bw = (W - pad.l - pad.r) / days.length;
  const barW = Math.max(4, Math.min(22, bw * 0.6));
  const y = (v: number) => pad.t + (1 - v / nice) * (H - pad.t - pad.b);
  const step = Math.ceil(days.length / Math.max(2, Math.floor(W / 70))); // one date label per ~70px, never colliding with "Today"
  const h = hover != null ? days[hover] : null;
  const empty = days.every((d) => d.serp + d.hints === 0);
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-[12px] text-ink-2">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div ref={ref} className="relative" style={{ height: H }} onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={W} height={H} className="block">
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line
                  x1={pad.l}
                  x2={W - pad.r}
                  y1={y(nice * f)}
                  y2={y(nice * f)}
                  stroke="var(--color-line)"
                  strokeDasharray={f ? "3 4" : undefined}
                />
                <text
                  x={pad.l - 6}
                  y={y(nice * f)}
                  dy="0.32em"
                  textAnchor="end"
                  fontSize="10"
                  fill="var(--color-ink-3)"
                  className="tabular"
                >
                  {Math.round(nice * f)}
                </text>
              </g>
            ))}
            {days.map((d, i) => {
              const cx = pad.l + bw * i + bw / 2;
              const x0 = cx - barW / 2;
              const ySerp = y(d.serp);
              const yTop = y(d.serp + d.hints);
              const gap = d.serp && d.hints ? 2 : 0; // 2px surface gap between stacked segments
              return (
                <g key={d.day} onMouseEnter={() => setHover(i)}>
                  <rect
                    x={pad.l + bw * i}
                    y={pad.t}
                    width={bw}
                    height={H - pad.t - pad.b}
                    fill={hover === i ? "rgba(255,255,255,0.035)" : "transparent"}
                  />
                  {d.serp > 0 && (
                    <rect x={x0} y={ySerp} width={barW} height={y(0) - ySerp} rx={d.hints ? 0 : 3} fill="var(--color-series-blue)" />
                  )}
                  {d.hints > 0 && (
                    <rect x={x0} y={yTop} width={barW} height={Math.max(1, ySerp - yTop - gap)} rx={3} fill="var(--color-series-orange)" />
                  )}
                  {(i === days.length - 1 || (i % step === 0 && days.length - 1 - i >= Math.max(2, Math.ceil(step * 0.75)))) && (
                    <text x={cx} y={H - 6} textAnchor={i === days.length - 1 ? "end" : "middle"} fontSize="10" fill="var(--color-ink-3)">
                      {i === days.length - 1 ? "Today" : shortDay(d.day)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {empty && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-ink-3">
            No activity yet. Bars appear as the extension reports in.
          </div>
        )}
        {h && hover != null && (
          <div
            className="pointer-events-none absolute z-10 w-48 rounded-xl border border-line bg-[oklch(19%_0_0)] px-3 py-2 text-xs shadow-xl"
            style={{ left: Math.min(pad.l + bw * hover + bw, W - 196), top: 4 }}
          >
            <div className="mb-1 font-semibold text-ink">{hover === days.length - 1 ? "Today" : shortDay(h.day)}</div>
            {SERIES.map((s) => (
              <div key={s.key} className="flex justify-between text-ink-2">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="tabular text-ink">{h[s.key]}</span>
              </div>
            ))}
            {h.apps > 0 && (
              <div className="flex justify-between text-ink-2">
                <span>App info updates</span>
                <span className="tabular text-ink">{h.apps}</span>
              </div>
            )}
            {h.errors > 0 && (
              <div className="flex justify-between text-bad">
                <span>Problems</span>
                <span className="tabular">{h.errors}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 24 hourly bars for today, shifted to the viewer's local time; the current hour is outlined. */
export function HourStrip({ utcHours }: { utcHours: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [local, setLocal] = useState<{ counts: number[]; now: number } | null>(null);
  useEffect(() => {
    const offset = Math.round(-new Date().getTimezoneOffset() / 60);
    const counts = Array.from({ length: 24 }, (_, h) => utcHours[(h - offset + 48) % 24]);
    setLocal({ counts, now: new Date().getHours() });
  }, [utcHours]);
  if (!local) return <div className="h-[150px]" />;
  const max = Math.max(1, ...local.counts);
  return (
    <div>
      <div className="relative flex h-[120px] items-end gap-[3px]" onMouseLeave={() => setHover(null)}>
        {local.counts.map((n, h) => (
          <div key={h} className="relative flex h-full flex-1 items-end" onMouseEnter={() => setHover(h)}>
            <div
              className={`w-full rounded-t-[3px] ${h === local.now ? "outline outline-1 outline-offset-1 outline-ink-3" : ""}`}
              style={{ height: n ? `${Math.max(6, (n / max) * 100)}%` : "2px", background: n ? "var(--color-sky)" : "var(--color-line)" }}
            />
          </div>
        ))}
        {hover != null && (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-y-full rounded-lg border border-line bg-[oklch(19%_0_0)] px-2 py-1 text-[11px] text-ink-2 shadow-xl"
            style={{ left: `${Math.min(85, (hover / 24) * 100)}%` }}
          >
            <span className="text-ink">{String(hover).padStart(2, "0")}:00</span> · {local.counts[hover]} result
            {local.counts[hover] === 1 ? "" : "s"}
          </div>
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-ink-3">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:00</span>
      </div>
    </div>
  );
}
