"use client";

import { STOREFRONTS } from "@ranklark/core/apple";
import type { SerpApp } from "@ranklark/core/scoring";
import { Loader2, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JobBar, useJob } from "@/components/actions";
import { Help, L } from "@/components/help";
import { AppIcon, Meter, SourceBadge } from "@/components/ui";

type Cand = { term: string; origin: "autocomplete" | "competitor titles"; note: string };
type Scored = {
  term: string;
  difficulty: number | null;
  popularity: number | null;
  popSource: string | null;
  popReason: string | null;
  opportunity: number | null;
  brand: boolean;
  top: SerpApp[];
  /** Where the selected app ranks for this term (from the latest snapshot); null rank = not in the top 200. */
  yourRank: { rank: number | null; approx: boolean } | null;
};

export function ResearchClient({
  apps,
  ideas = [],
  initialApp = null,
  initialSeed = "",
  initialCountry = "us",
}: {
  apps: { id: number; name: string; icon: string | null; country: string }[];
  ideas?: string[];
  initialApp?: number | null;
  initialSeed?: string;
  initialCountry?: string;
}) {
  const [seed, setSeed] = useState(initialSeed);
  const [country, setCountry] = useState(initialCountry);
  const [deep, setDeep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ranSeed, setRanSeed] = useState("");
  const [cands, setCands] = useState<Cand[]>([]);
  const [seedTop, setSeedTop] = useState<{ top: SerpApp[]; difficulty: number | null } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [scored, setScored] = useState<Map<string, Scored>>(new Map());
  // Pre-picked from ?app= or when there is exactly one app; with several, the user chooses.
  const [target, setTarget] = useState<number | "">(initialApp ?? "");
  const [tracked, setTracked] = useState<{ text: string; ok: boolean } | null>(null);
  const targetApp = apps.find((a) => a.id === target) ?? null;
  const { job, track } = useJob();

  const run = useCallback(
    async (s: string, c: string) => {
      setBusy(true);
      setErr(null);
      setCands([]);
      setSel(new Set());
      setScored(new Map());
      setTracked(null);
      const r = await fetch(`/api/research?${new URLSearchParams({ seed: s, country: c, deep: deep ? "1" : "0" })}`);
      const j = await r.json();
      setBusy(false);
      if (!r.ok) return setErr(j.error);
      setRanSeed(s);
      const list: Cand[] = [
        ...j.hints.map((h: { term: string; from: string; position: number }) => ({
          term: h.term,
          origin: "autocomplete" as const,
          note: `“${h.from.trim()}…” → #${h.position}`,
        })),
        ...j.competitor
          .filter((x: { term: string }) => !j.hints.some((h: { term: string }) => h.term === x.term))
          .map((x: { term: string; apps: number }) => ({
            term: x.term,
            origin: "competitor titles" as const,
            note: `in ${x.apps} top-10 title${x.apps > 1 ? "s" : ""}`,
          })),
      ];
      setCands(list);
      setSeedTop({ top: j.top, difficulty: j.difficulty });
      const preselected = list
        .filter((x) => x.origin === "autocomplete")
        .slice(0, 10)
        .map((x) => x.term);
      setSel(new Set(preselected));
      // show whatever is already scored (cached) right away
      const pq = new URLSearchParams({ terms: list.map((x) => x.term).join(","), country: c });
      if (target) pq.set("appId", String(target)); // so "Your rank" is right from the first render
      const pre = await fetch(`/api/analyze?${pq}`).then((x) => x.json());
      const known = (pre as Scored[]).filter((x) => x.difficulty != null || x.popularity != null);
      setScored(new Map(known.map((x) => [x.term, x])));
      // Measure the pre-selected ideas automatically, so nobody has to find a "score" button first.
      const missing = preselected.filter((t) => !known.some((k) => k.term === t));
      if (missing.length) {
        const sr = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ terms: missing, country: c }),
        }).then((x) => x.json());
        if (sr.jobId) track(sr.jobId);
      }
    },
    [deep, track, target],
  );

  const auto = useRef(false);
  useEffect(() => {
    if (!auto.current && initialSeed.length >= 2) {
      auto.current = true;
      run(initialSeed, initialCountry);
    }
  }, [initialSeed, initialCountry, run]);

  const refreshScores = async (terms: string[]) => {
    if (!terms.length) return;
    const q = new URLSearchParams({ terms: terms.join(","), country });
    if (target) q.set("appId", String(target));
    const r = await fetch(`/api/analyze?${q}`);
    const j: Scored[] = await r.json();
    setScored((m) => {
      const n = new Map(m);
      for (const s of j) n.set(s.term, s);
      return n;
    });
  };

  const score = async () => {
    const r = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terms: [...sel], country }),
    });
    const j = await r.json();
    track(j.jobId);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-score only when the background job makes progress
  useEffect(() => {
    if (job) refreshScores([...sel]);
  }, [job?.done]);

  // Picking (or changing) your app → fetch where it ranks for everything already scored.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run only when the chosen app changes
  useEffect(() => {
    if (target && scored.size) refreshScores([...scored.keys()]);
  }, [target]);

  const trackSel = async () => {
    if (!target) {
      setTracked({ ok: false, text: "Choose your app in “Finding keywords for” at the top, then click Track again." });
      return;
    }
    const terms = [...sel].filter((t) => !scored.get(t)?.brand);
    const r = await fetch(`/api/apps/${target}/keywords`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terms, country, source: "research" }),
    });
    const j = await r.json();
    setTracked(
      r.ok
        ? {
            ok: true,
            text: `Tracking ${j.added} new keyword${j.added === 1 ? "" : "s"} for ${targetApp?.name ?? "your app"} (brand names skipped). Ranks are being checked now.`,
          }
        : { ok: false, text: j.error ?? "Couldn't add them." },
    );
  };

  const rows = useMemo(() => {
    const withScore = cands.map((c) => ({ ...c, s: scored.get(c.term) }));
    return withScore.sort((a, b) => (b.s?.opportunity ?? (b.s?.brand ? -2 : -1)) - (a.s?.opportunity ?? (a.s?.brand ? -2 : -1)));
  }, [cands, scored]);

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(seed, country);
        }}
        className="card flex flex-col gap-3 p-4"
      >
        {apps.length > 0 && (
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-2">Finding keywords for</span>
            <select
              value={target}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : "";
                setTarget(id);
                const a = apps.find((x) => x.id === id);
                if (a && !cands.length) setCountry(a.country); // match the app's store until a search has run
              }}
              className="field h-9 max-w-72 px-2 text-sm font-medium"
              aria-label="Your app"
            >
              <option value="">No app, just exploring</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="field flex h-11 min-w-56 flex-1 items-center gap-2 px-3">
            <Search className="h-4 w-4 text-ink-3" />
            <input
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="Describe your app in 1–3 words, e.g. habit tracker"
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3"
              required
              minLength={2}
            />
          </div>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="field h-11 px-2 text-sm"
            aria-label="App Store country"
            title="Which country's App Store to search"
          >
            {Object.entries(STOREFRONTS).map(([c, s]) => (
              <option key={c} value={c}>
                {s.flag} {s.name}
              </option>
            ))}
          </select>
          <button disabled={busy} className="btn-primary flex h-11 items-center gap-2 px-5 text-[15px]">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Find keywords
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-3">
          {!cands.length && !busy && ideas.length > 0 && (
            <span className="flex flex-wrap items-center gap-2">
              Try:
              {ideas.map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => {
                    setSeed(t);
                    run(t, country);
                  }}
                  className="rounded-full border border-line-strong px-2.5 py-1 text-ink-2 hover:text-ink"
                >
                  {t}
                </button>
              ))}
            </span>
          )}
          <label className="ml-auto flex items-center gap-2" title="Also tries “your words + a…z”: about 26 more lookups, ~35 s">
            <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} className="accent-[var(--color-primary)]" />
            More ideas (slower)
          </label>
        </div>
      </form>
      {err && <p className="text-sm text-bad">{err}</p>}

      {seedTop && (
        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">
              <L term="topApps">Top results for “{ranSeed}”</L>
            </h2>
            <span className="inline-flex items-center gap-1 text-xs text-ink-3">
              difficulty <span className="tabular text-ink">{seedTop.difficulty ?? "—"}</span>
              <Help term="difficulty" />
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {seedTop.top.slice(0, 10).map((a, i) => (
              <Link
                key={a.id}
                href={`/store/${a.id}?country=${country}`}
                className="flex items-center gap-2 rounded-lg bg-well p-2 transition hover:bg-white/[0.06]"
                title={`Open ${a.name}`}
              >
                <span className="w-5 text-right text-xs tabular text-ink-3">{i + 1}</span>
                <AppIcon src={a.icon} name={a.name} size={30} />
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-semibold">{a.name}</div>
                  <div className="truncate text-[11px] text-ink-3">{a.subtitle ?? `${a.ratingCount.toLocaleString()} ratings`}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {cands.length > 0 && (
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-4 py-3">
            <div className="text-[15px] font-semibold">
              <L term="candidates">{cands.length} keyword ideas</L>{" "}
              <span className="text-sm font-normal text-ink-3">· {sel.size} selected</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <JobBar job={job} />
              <button
                onClick={score}
                disabled={!sel.size || (!!job && !job.finished)}
                className="btn-ghost h-9 px-3 text-sm"
                title="Measure popularity and difficulty for the ticked keywords (~10 s each). The first 10 are measured automatically."
              >
                Measure selected
              </button>
              {apps.length ? (
                <button onClick={trackSel} disabled={!sel.size} className="btn-primary h-9 px-3 text-sm">
                  {targetApp ? `Track ${sel.size} for ${targetApp.name.slice(0, 24)}` : `Track ${sel.size} selected`}
                </button>
              ) : (
                <Link href="/apps#add" className="btn-primary flex h-9 items-center px-3 text-sm">
                  Add your app to track these
                </Link>
              )}
            </div>
          </div>
          {tracked && (
            <p className={`border-b border-line/70 px-4 py-2.5 text-[13px] ${tracked.ok ? "text-good" : "text-warn"}`}>
              {tracked.text}
              {tracked.ok && target && (
                <Link href={`/apps/${target}?country=${country}`} className="ml-2 font-semibold text-ink underline underline-offset-2">
                  Open {targetApp?.name ?? "app"} →
                </Link>
              )}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[13px]">
              <thead className="text-[12px] text-ink-3">
                <tr className="border-b border-line/70">
                  <th className="w-10 py-2.5 pl-4">
                    <input
                      type="checkbox"
                      className="accent-[var(--color-primary)]"
                      checked={sel.size === cands.length}
                      onChange={(e) => setSel(e.target.checked ? new Set(cands.map((c) => c.term)) : new Set())}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-3 font-medium">
                    <L term="keyword">Keyword</L>
                  </th>
                  <th className="px-3 font-medium">
                    <L term="foundVia">Found via</L>
                  </th>
                  <th className="px-3 font-medium">
                    <L term="popularity">Popularity</L>
                  </th>
                  <th className="px-3 font-medium">
                    <L term="difficulty">Difficulty</L>
                  </th>
                  {targetApp && (
                    <th className="px-3 font-medium" title={`Where ${targetApp.name} ranks today`}>
                      <L term="rank">Your rank</L>
                    </th>
                  )}
                  <th className="px-3 font-medium">
                    <L term="opportunity">Opportunity</L>
                  </th>
                  <th className="px-3 font-medium">
                    <L term="topApps">Top apps</L>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.term} className={`border-b border-line/40 hover:bg-white/[0.025] ${c.s?.brand ? "opacity-60" : ""}`}>
                    <td className="py-2 pl-4">
                      <input
                        type="checkbox"
                        className="accent-[var(--color-primary)]"
                        checked={sel.has(c.term)}
                        onChange={(e) =>
                          setSel((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(c.term);
                            else n.delete(c.term);
                            return n;
                          })
                        }
                        aria-label={`Select ${c.term}`}
                      />
                    </td>
                    <td className="px-3 font-medium">
                      {c.term}
                      {c.s?.brand && (
                        <span className="ml-2 inline-flex items-center rounded bg-warn/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-warn">
                          Brand
                          <Help term="brand" className="ml-1 border-warn/40 text-warn" />
                        </span>
                      )}
                    </td>
                    <td className="px-3 text-xs text-ink-3">
                      {c.origin} · {c.note}
                    </td>
                    <td className="px-3">
                      <div className="flex items-center gap-1.5">
                        <Meter value={c.s?.popularity ?? null} color="var(--color-series-blue)" title={c.s?.popReason ?? undefined} />
                        <SourceBadge source={c.s?.popSource} title={c.s?.popReason ?? undefined} />
                      </div>
                    </td>
                    <td className="px-3">
                      <Meter value={c.s?.difficulty ?? null} color="var(--color-series-orange)" />
                    </td>
                    {targetApp && (
                      <td className="px-3 tabular font-semibold">
                        {!c.s ? (
                          <span className="font-normal text-ink-3" title="Score it first">
                            ·
                          </span>
                        ) : c.s.yourRank?.rank ? (
                          <span className={c.s.yourRank.rank <= 10 ? "text-good" : ""}>
                            {c.s.yourRank.approx ? "≈" : "#"}
                            {c.s.yourRank.rank}
                          </span>
                        ) : (
                          <span className="whitespace-nowrap text-xs font-normal text-ink-3" title="Not in the top 200 results">
                            &gt; 200
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-3 tabular font-semibold">
                      {c.s?.brand ? (
                        <span className="text-xs font-normal text-warn">skip</span>
                      ) : (
                        (c.s?.opportunity ?? <span className="font-normal text-ink-3">—</span>)
                      )}
                    </td>
                    <td className="px-3">
                      <div className="flex -space-x-1">
                        {(c.s?.top ?? []).map((a) => (
                          <Link
                            key={a.id}
                            href={`/store/${a.id}?country=${country}`}
                            title={`${a.name} — click to open`}
                            className="transition hover:z-10 hover:-translate-y-0.5"
                          >
                            <AppIcon src={a.icon} name={a.name} size={20} />
                          </Link>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2.5 text-[11px] text-ink-3">
            Ideas come only from Apple autocomplete and competitor <em>titles</em>, never from descriptions or URLs. Brand = another
            app&apos;s name: skipped when you track.
          </p>
        </section>
      )}
    </div>
  );
}
