"use client";

import { normalize, tokens } from "@ranklark/core/metadata";
import { ArrowUpRight, Loader2, Search } from "lucide-react";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Help, L } from "@/components/help";
import { RatingBars } from "@/components/rating-bars";
import { AppIcon, KpiStrip, Meter, SourceBadge } from "@/components/ui";
import type { Showcase, ShowPoint } from "@/features/showcase/server/showcase";
import { ago, compact } from "@/lib/format";

type Preset = { seed: string; label: string };

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

/* ------------------------------------------------------------------ opportunity map */

/**
 * Scatter: x = difficulty, y = popularity. Top-left quadrant = "sweet spot".
 * One series (blue), brand terms hollow/grey, selected keyword ringed in orange.
 */
function OpportunityMap({ points, selected, onSelect }: { points: ShowPoint[]; selected: string; onSelect: (t: string) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const H = 380;
  const pad = { l: 44, r: 16, t: 16, b: 40 };
  const W = Math.max(width, 280);
  const x = (d: number) => pad.l + (d / 100) * (W - pad.l - pad.r);
  const y = (p: number) => pad.t + (1 - p / 100) * (H - pad.t - pad.b);
  const pts = points.filter((p) => p.popularity != null && p.difficulty != null);

  // greedy label placement: best opportunities first, skip labels that would collide
  const labels = (() => {
    const order = [...pts].sort((a, b) =>
      a.term === selected ? -1 : b.term === selected ? 1 : (b.opportunity ?? -1) - (a.opportunity ?? -1),
    );
    const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
    const out = new Map<string, { lx: number; ly: number; anchor: "start" | "end" }>();
    for (const p of order) {
      const cx = x(p.difficulty!),
        cy = y(p.popularity!);
      const w = p.term.length * 6.4;
      const right = cx + 10 + w < W - pad.r;
      const lx = right ? cx + 10 : cx - 10;
      const box = { x0: right ? lx : lx - w, x1: right ? lx + w : lx, y0: cy - 8, y1: cy + 6 };
      if (boxes.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
      boxes.push(box);
      out.set(p.term, { lx, ly: cy, anchor: right ? "start" : "end" });
    }
    return out;
  })();

  const hp = pts.find((p) => p.term === hover);
  return (
    <div ref={ref} className="relative w-full" style={{ height: H }}>
      {width > 0 && (
        <svg width={W} height={H} className="block">
          {/* sweet spot */}
          <rect x={x(0)} y={y(100)} width={x(50) - x(0)} height={y(50) - y(100)} fill="var(--color-primary)" opacity={0.07} rx={8} />
          <text x={x(1.5)} y={y(97)} fontSize="11" fontWeight={600} fill="var(--color-primary)" dy="0.7em">
            Sweet spot
          </text>
          {[0, 25, 50, 75, 100].map((t) => (
            <g key={t}>
              <line x1={x(0)} x2={x(100)} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeDasharray={t ? "3 4" : undefined} />
              <line x1={x(t)} x2={x(t)} y1={y(0)} y2={y(100)} stroke="var(--color-line)" strokeDasharray={t ? "3 4" : undefined} />
              <text x={x(0) - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--color-ink-3)">
                {t}
              </text>
              <text x={x(t)} y={y(0) + 16} textAnchor="middle" fontSize="11" fill="var(--color-ink-3)">
                {t}
              </text>
            </g>
          ))}
          <text x={x(50)} y={H - 4} textAnchor="middle" fontSize="12" fill="var(--color-ink-2)">
            Difficulty → harder
          </text>
          <text transform={`translate(12 ${y(50)}) rotate(-90)`} textAnchor="middle" fontSize="12" fill="var(--color-ink-2)">
            Popularity → more searches
          </text>

          {pts.map((p) => {
            const cx = x(p.difficulty!),
              cy = y(p.popularity!);
            const sel = p.term === selected;
            const lab = labels.get(p.term);
            return (
              <g
                key={p.term}
                className="cursor-pointer"
                onMouseEnter={() => setHover(p.term)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect(p.term)}
              >
                <circle cx={cx} cy={cy} r={16} fill="transparent" />
                {sel && <circle cx={cx} cy={cy} r={11} fill="none" stroke="var(--color-primary)" strokeWidth={2} />}
                <circle
                  cx={cx}
                  cy={cy}
                  r={6.5}
                  fill={p.brand ? "var(--color-card)" : "var(--color-series-blue)"}
                  stroke={p.brand ? "var(--color-ink-3)" : "var(--color-card)"}
                  strokeWidth={2}
                />
                {lab && (
                  <text
                    x={lab.lx}
                    y={lab.ly}
                    dy="0.32em"
                    textAnchor={lab.anchor}
                    fontSize="12"
                    fontWeight={sel ? 700 : 500}
                    fill={sel ? "var(--color-ink)" : p.brand ? "var(--color-ink-3)" : "var(--color-ink-2)"}
                  >
                    {p.term}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hp && (
        <div
          className="pointer-events-none absolute z-10 w-56 rounded-xl border border-line bg-[oklch(19%_0_0)] px-3 py-2 text-xs shadow-xl"
          style={{ left: Math.min(x(hp.difficulty!) + 14, W - 236), top: Math.max(0, y(hp.popularity!) - 20) }}
        >
          <div className="mb-1 font-semibold text-ink">
            {hp.term} {hp.brand && <span className="ml-1 text-[10px] uppercase text-warn">brand</span>}
          </div>
          <div className="flex justify-between text-ink-2">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-series-blue" />
              Popularity
            </span>
            <span className="tabular text-ink">{hp.popularity}</span>
          </div>
          <div className="flex justify-between text-ink-2">
            <span>Difficulty</span>
            <span className="tabular text-ink">{hp.difficulty}</span>
          </div>
          <div className="flex justify-between text-ink-2">
            <span>Opportunity</span>
            <span className="tabular text-ink">{hp.brand ? "skip" : (hp.opportunity ?? "—")}</span>
          </div>
          <div className="mt-1.5 text-[11px] text-ink-3">Click to see who ranks</div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ panels */

function highlight(text: string | null, words: Set<string>) {
  if (!text) return null;
  return text.split(/(\s+)/).map((w, i) =>
    words.has(normalize(w)) ? (
      <mark key={i} className="rounded bg-primary/20 px-0.5 text-ink">
        {w}
      </mark>
    ) : (
      <span key={i}>{w}</span>
    ),
  );
}

function WhoRanks({ p, country }: { p: ShowPoint; country: string }) {
  const words = new Set(tokens(p.term));
  const max = Math.max(...p.top.map((a) => a.ratingCount), 1);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-[17px] font-bold">“{p.term}”</span>
        {p.brand && (
          <span className="inline-flex items-center rounded bg-warn/15 px-1.5 py-px text-[10px] font-semibold uppercase text-warn">
            Brand
            <Help term="brand" className="ml-1" />
          </span>
        )}
      </div>
      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        {[
          ["popularity", "Popularity", p.popularity, <SourceBadge key="b" source={p.popSource} title={p.popReason ?? undefined} />],
          ["difficulty", "Difficulty", p.difficulty, null],
          ["opportunity", "Opportunity", p.brand ? "skip" : (p.opportunity ?? "—"), null],
        ].map(([k, label, v, badge]) => (
          <div key={k as string} className="rounded-lg bg-well px-2 py-2">
            <div className="flex items-center justify-center text-[11px] text-ink-3">
              {label as string}
              <Help term={k as string} />
            </div>
            <div className="mt-0.5 text-[20px] font-bold tabular">{(v as number | string | null) ?? "—"}</div>
            <div className="h-4">{badge as React.ReactNode}</div>
          </div>
        ))}
      </div>
      <div className="mb-2 flex items-center text-[12px] text-ink-3">
        <L term="topApps">Who ranks right now</L>
        <span className="ml-auto">ratings</span>
      </div>
      <div className="flex flex-col gap-[3px]">
        {p.top.slice(0, 10).map((a, i) => (
          <Link
            key={a.id}
            href={`/store/${a.id}?country=${country}`}
            className="group relative flex h-11 items-center gap-2.5 overflow-hidden rounded-md px-2 text-[13px] hover:bg-white/[0.04]"
          >
            <div
              className="absolute inset-y-0 left-0 rounded-md bg-series-blue opacity-[0.16]"
              style={{ width: `${(a.ratingCount / max) * 100}%` }}
            />
            <span className="relative w-5 text-right text-xs tabular text-ink-3">{i + 1}</span>
            <span className="relative">
              <AppIcon src={a.icon} name={a.name} size={28} />
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="block truncate font-semibold text-ink">{highlight(a.name, words)}</span>
              <span className="block truncate text-[11px] text-ink-3">{highlight(a.subtitle ?? "", words)}</span>
            </span>
            <span className="relative tabular font-semibold">{compact(a.ratingCount)}</span>
            <ArrowUpRight className="relative h-3.5 w-3.5 text-ink-3 opacity-0 transition group-hover:opacity-100" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function Spotlight({ s, seed, country }: { s: NonNullable<Showcase["spotlight"]>; seed: string; country: string }) {
  const words = new Set(tokens(seed));
  const ranked = s.ranks.filter((r) => r.rank != null);
  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <div className="flex items-start gap-4">
          {s.icon && <img src={s.icon} alt="" width={72} height={72} className="rounded-[17px] border border-white/5" />}
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary">#1 for “{seed}” today</div>
            <Link
              href={`/store/${s.id}?country=${country}`}
              className="mt-1 block text-[22px] font-extrabold leading-tight tracking-tight hover:underline"
            >
              {highlight(s.name, words)}
            </Link>
            <div className="mt-0.5 text-[14px] text-ink-2">
              {highlight(s.subtitle, words) ?? <span className="text-ink-3">no subtitle</span>}
            </div>
            <div className="mt-0.5 text-xs text-ink-3">
              {s.seller} · {s.genre}
            </div>
          </div>
        </div>
        <div className="mt-4">
          <KpiStrip
            items={[
              {
                label: <L term="ratings">Rating</L>,
                value: s.rating ? `${s.rating.toFixed(1)}★` : "—",
                sub: `${compact(s.ratingCount)} ratings`,
              },
              {
                label: <L term="chart">Category chart</L>,
                value: s.chart ? `#${s.chart.position}` : "—",
                sub: s.chart ? s.chart.genre : "not charting",
              },
              { label: <L term="ranksFor">Ranks for</L>, value: `${ranked.length}/${s.ranks.length}`, sub: "of these keywords" },
            ]}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {s.ranks.map((r) => (
            <span
              key={r.term}
              className={`rounded-md px-2 py-1 text-[12px] ${r.rank != null && r.rank <= 3 ? "bg-good/15 text-good" : r.rank != null && r.rank <= 12 ? "bg-white/[0.06] text-ink" : "bg-white/[0.03] text-ink-3"}`}
            >
              {r.term} <span className="tabular font-semibold">{r.rank == null ? "—" : `${r.approx ? "≈" : "#"}${r.rank}`}</span>
            </span>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-ink-3">
          Highlighted words = the keyword appears in its name or subtitle. That&apos;s usually why it wins.
        </p>
      </div>
      <div className="rounded-xl bg-well p-4">
        <div className="mb-3 text-[13px] font-semibold">
          <L term="histogram">Rating breakdown</L>
        </div>
        <RatingBars histogram={s.histogram} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ container */

export function LiveShowcase({ presets, country = "us" }: { presets: Preset[]; country?: string }) {
  const [seed, setSeed] = useState(presets[0].seed);
  const [custom, setCustom] = useState("");
  const [data, setData] = useState<Showcase | null>(null);
  const [job, setJob] = useState<{ id: string; done: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const reqId = useRef(0);

  const load = useCallback(
    async (s: string) => {
      const my = ++reqId.current;
      setErr(null);
      const r = await fetch(`/api/showcase?${new URLSearchParams({ seed: s, country })}`);
      const j = await r.json();
      if (my !== reqId.current) return;
      if (!r.ok) return setErr(j.error);
      if (j.data) {
        setData(j.data);
        setSelected((cur) => (j.data.points.some((p: ShowPoint) => p.term === cur) ? cur : (j.data.points[0]?.term ?? "")));
      } else setData(null);
      if (j.job && !j.job.finished) {
        setJob(j.job);
        const poll = async () => {
          if (my !== reqId.current) return;
          const st = await fetch(`/api/jobs/${j.job.id}`).then((x) => x.json());
          if (my !== reqId.current) return;
          if (st.finished || st.missing) {
            setJob(null);
            load(s);
          } else {
            setJob({ id: j.job.id, done: st.done, total: st.total });
            setTimeout(poll, 1500);
          }
        };
        setTimeout(poll, 1200);
      } else setJob(null);
    },
    [country],
  );

  useEffect(() => {
    load(seed);
  }, [seed, load]);

  const point = data?.points.find((p) => p.term === selected) ?? data?.points[0];
  const scored = data?.points.filter((p) => p.popularity != null && p.difficulty != null) ?? [];
  const sweet = scored.filter((p) => !p.brand && p.popularity! >= 50 && p.difficulty! <= 50);
  const brands = scored.filter((p) => p.brand).length;
  const avgDiff = scored.length ? Math.round(scored.reduce((a, p) => a + p.difficulty!, 0) / scored.length) : null;
  const ratingsTop = point ? [...point.top.map((a) => a.ratingCount)].sort((a, b) => a - b)[Math.floor(point.top.length / 2)] : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="seg">
          {presets.map((p) => (
            <button key={p.seed} data-active={seed === p.seed} onClick={() => setSeed(p.seed)}>
              {p.label}
            </button>
          ))}
          {!presets.some((p) => p.seed === seed) && <button data-active>{seed}</button>}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const s = custom.trim().toLowerCase();
            if (s.length >= 2) setSeed(s);
          }}
          className="flex items-center gap-1.5"
        >
          <div className="field flex h-9 items-center gap-2 px-2.5">
            <Search className="h-3.5 w-3.5 text-ink-3" />
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Try any keyword…"
              maxLength={40}
              className="w-40 bg-transparent text-sm outline-none placeholder:text-ink-3"
            />
          </div>
          <button className="btn-ghost h-9 px-3 text-sm">Go</button>
        </form>
        <span className="ml-auto text-xs text-ink-3">
          🇺🇸 Live from the App Store{data ? ` · fetched ${ago(data.builtAt.replace("T", " ").slice(0, 19))}` : ""}
        </span>
      </div>
      {err && <p className="mb-3 text-sm text-bad">{err}</p>}

      {!data && (
        <div className="card grid h-[460px] place-items-center p-6 text-center">
          <div>
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
            <p className="mt-3 text-[15px] font-semibold">Reading the App Store for “{seed}”…</p>
            <p className="mt-1 text-sm text-ink-3">
              Real searches, spaced out to respect Apple&apos;s limits (≈1–2 min the first time, then cached).
            </p>
            {job && (
              <div className="mx-auto mt-4 h-1.5 w-56 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-primary transition-all" style={{ width: `${(job.done / Math.max(job.total, 1)) * 100}%` }} />
              </div>
            )}
            {job && (
              <p className="mt-2 text-xs tabular text-ink-3">
                {job.done}/{job.total}
              </p>
            )}
          </div>
        </div>
      )}

      {data && point && (
        <div className="flex flex-col gap-4">
          {job && (
            <p className="text-xs text-ink-3">
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
              Refreshing in the background… {job.done}/{job.total}
            </p>
          )}
          <div className="card px-1 py-4">
            <KpiStrip
              items={[
                { label: "Keywords measured", value: scored.length, sub: `around “${data.seed}”` },
                {
                  label: <L term="sweetSpot">In the sweet spot</L>,
                  value: sweet.length,
                  sub: sweet.length
                    ? sweet
                        .slice(0, 2)
                        .map((p) => p.term)
                        .join(", ")
                    : "none — crowded topic",
                },
                { label: <L term="difficulty">Avg difficulty</L>, value: avgDiff ?? "—" },
                { label: <L term="brand">Brand names</L>, value: brands, sub: "skip these" },
                { label: <L term="ratings">Median ratings, top 10</L>, value: compact(ratingsTop), sub: `for “${point.term}”` },
              ]}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <section className="card p-4">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-[15px] font-semibold">
                  <L term="sweetSpot">Opportunity map</L>
                </h3>
                <span className="flex items-center gap-3 text-[11px] text-ink-3">
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-series-blue" />
                    keyword
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full border-2 border-ink-3" />
                    brand
                  </span>
                </span>
              </div>
              <OpportunityMap points={data.points} selected={point.term} onSelect={setSelected} />
              <div className="mt-2 flex flex-wrap gap-1">
                {data.points.map((p) => (
                  <button
                    key={p.term}
                    onClick={() => setSelected(p.term)}
                    className={`rounded-md px-2 py-0.5 text-[12px] transition ${p.term === point.term ? "bg-primary/20 text-ink" : "bg-white/[0.04] text-ink-2 hover:bg-white/[0.08]"}`}
                  >
                    {p.term}
                  </button>
                ))}
              </div>
            </section>
            <section className="card p-4">
              <WhoRanks p={point} country={country} />
            </section>
          </div>
          {data.spotlight && (
            <section className="card p-5">
              <Spotlight s={data.spotlight} seed={data.seed} country={country} />
            </section>
          )}
          <section className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="text-[12px] text-ink-3">
                  <tr className="border-b border-line/70">
                    <th className="py-2.5 pl-4 font-medium">
                      <L term="keyword">Keyword</L>
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
                    <th className="px-3 font-medium">
                      <L term="topApps">Top apps</L>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.points]
                    .sort((a, b) => (b.opportunity ?? -1) - (a.opportunity ?? -1))
                    .map((p) => (
                      <tr
                        key={p.term}
                        onClick={() => setSelected(p.term)}
                        className={`cursor-pointer border-b border-line/40 hover:bg-white/[0.025] ${p.term === point.term ? "bg-primary/[0.06]" : ""}`}
                      >
                        <td className="py-2 pl-4 font-medium">
                          {p.term}
                          {p.brand && (
                            <span className="ml-2 rounded bg-warn/15 px-1.5 py-px text-[10px] font-semibold uppercase text-warn">
                              Brand
                            </span>
                          )}
                        </td>
                        <td className="px-3">
                          <div className="flex items-center gap-1.5">
                            <Meter value={p.popularity} color="var(--color-series-blue)" title={p.popReason ?? undefined} />
                            <SourceBadge source={p.popSource} />
                          </div>
                        </td>
                        <td className="px-3">
                          <Meter value={p.difficulty} color="var(--color-series-orange)" />
                        </td>
                        <td className="px-3 tabular font-semibold">
                          {p.brand ? <span className="text-xs font-normal text-warn">skip</span> : (p.opportunity ?? "—")}
                        </td>
                        <td className="px-3">
                          <div className="flex -space-x-1">
                            {p.top.slice(0, 5).map((a) => (
                              <Link
                                key={a.id}
                                href={`/store/${a.id}?country=${country}`}
                                onClick={(e) => e.stopPropagation()}
                                title={a.name}
                                className="transition hover:z-10 hover:-translate-y-0.5"
                              >
                                <AppIcon src={a.icon} name={a.name} size={22} />
                              </Link>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
