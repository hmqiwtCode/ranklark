"use client";

import { ArrowDownUp, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { RankSpark } from "@/components/charts";
import { Help } from "@/components/help";
import { AppIcon, Delta, Meter, Placement, SourceBadge } from "@/components/ui";
import type { KeywordRow } from "@/features/keywords/server/queries";
import { ago } from "@/lib/format";

type Filter = "all" | "top10" | "top50" | "unranked" | "gap";
type SortKey = "term" | "popularity" | "difficulty" | "rank" | "delta" | "opportunity";

const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["top10", "Top 10"],
  ["top50", "Top 50"],
  ["unranked", "Unranked"],
  ["gap", "Not in metadata"],
];

export function KeywordTable({ rows, appId, country, myIds }: { rows: KeywordRow[]; appId: number; country: string; myIds: number[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "rank", dir: 1 });
  const mine = useMemo(() => new Set(myIds), [myIds]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      top10: rows.filter((r) => r.rank != null && r.rank <= 10).length,
      top50: rows.filter((r) => r.rank != null && r.rank <= 50).length,
      unranked: rows.filter((r) => r.rank == null).length,
      gap: rows.filter((r) => !r.placement.covered).length,
    }),
    [rows],
  );

  const shown = useMemo(() => {
    const f = rows.filter((r) => {
      if (q && !r.term.includes(q.toLowerCase())) return false;
      if (filter === "top10") return r.rank != null && r.rank <= 10;
      if (filter === "top50") return r.rank != null && r.rank <= 50;
      if (filter === "unranked") return r.rank == null;
      if (filter === "gap") return !r.placement.covered;
      return true;
    });
    const val = (r: KeywordRow): number | string => {
      if (sort.key === "term") return r.term;
      if (sort.key === "rank") return r.rank ?? 999;
      return (r[sort.key] as number | null) ?? -1;
    };
    return f.sort((a, b) => {
      const va = val(a),
        vb = val(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [rows, filter, q, sort]);

  const th = (key: SortKey, label: string, help: string, cls = "") => (
    <th className={`px-3 py-2.5 font-medium ${cls}`}>
      <span className="inline-flex items-center whitespace-nowrap">
        <button
          className="inline-flex items-center gap-1 hover:text-ink"
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : key === "rank" || key === "term" ? 1 : -1 }))}
        >
          {label}
          {sort.key === key ? (
            <span className="text-primary">{sort.dir === 1 ? "↑" : "↓"}</span>
          ) : (
            <ArrowDownUp className="h-3 w-3 opacity-40" />
          )}
        </button>
        <Help term={help} />
      </span>
    </th>
  );
  const plain = (label: string, help: string) => (
    <th className="px-3 py-2.5 font-medium">
      <span className="inline-flex items-center whitespace-nowrap">
        {label}
        <Help term={help} />
      </span>
    </th>
  );

  const remove = async (term: string) => {
    await fetch(`/api/apps/${appId}/keywords`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term, country }),
    });
    router.refresh();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-4 py-3">
        <div className="seg">
          {FILTERS.map(([k, label]) => (
            <button key={k} data-active={filter === k} onClick={() => setFilter(k)}>
              {label} <span className="ml-0.5 tabular opacity-60">{counts[k]}</span>
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="field h-8 w-40 px-3 text-sm" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-[13px]">
          <thead className="text-[12px] text-ink-3">
            <tr className="border-b border-line/70">
              {th("term", "Keyword", "keyword", "pl-4")}
              {th("popularity", "Popularity", "popularity")}
              {th("difficulty", "Difficulty", "difficulty")}
              {th("rank", "Rank", "rank")}
              {th("delta", "Δ 7d", "delta")}
              {plain("Trend", "trend")}
              {plain("Top apps", "topApps")}
              {plain("In metadata", "placement")}
              {th("opportunity", "Opp.", "opportunity")}
              {plain("Checked", "checked")}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.term} className="group border-b border-line/40 hover:bg-white/[0.025]">
                <td className="py-2 pl-4 pr-3 font-medium text-ink">
                  {r.term}
                  {r.brand && (
                    <span
                      className="ml-2 rounded bg-warn/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-warn"
                      title="Another app's name — skip it"
                    >
                      Brand
                    </span>
                  )}
                  {r.source !== "manual" && <span className="ml-2 text-[10px] uppercase tracking-wide text-ink-3">{r.source}</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <Meter value={r.popularity} color="var(--color-series-blue)" title={r.popReason ?? undefined} />
                    <SourceBadge source={r.popSource} title={r.popReason ?? undefined} />
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Meter
                    value={r.difficulty}
                    color="var(--color-series-orange)"
                    title="Estimate from top-10 apps' rating counts, title match and ratings"
                  />
                </td>
                <td className="px-3 py-2 tabular">
                  {r.rank == null ? (
                    <span className="text-ink-3" title="Not in the top 200 results">
                      —
                    </span>
                  ) : (
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${r.rank <= 10 ? "text-ink" : "text-ink-2"}`}
                      title={`App Store web: ${r.rankWeb ? `#${r.rankWeb}` : "not in top ~12"} · iTunes API: ${r.rankApi ? `#${r.rankApi}` : "not in top 200"}${r.approx ? " — approximate (API order beyond the web window)" : ""}`}
                    >
                      {r.approx ? "≈" : "#"}
                      {r.rank}
                      {r.rank <= 3 && <Star className="h-3 w-3 fill-warn text-warn" />}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Delta value={r.delta} />
                </td>
                <td className="px-3 py-2">
                  <RankSpark history={r.history} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex -space-x-1">
                    {r.top.slice(0, 5).map((a, i) => (
                      <Link
                        href={`/store/${a.id}?country=${country}`}
                        key={a.id}
                        className={`transition hover:z-20 hover:-translate-y-0.5 ${mine.has(a.id) ? "relative z-10 rounded-[7px] ring-2 ring-primary" : ""}`}
                        title={`#${i + 1} ${a.name} · ${a.ratingCount.toLocaleString()} ratings — click to open`}
                      >
                        <AppIcon src={a.icon} name={a.name} size={22} />
                      </Link>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Placement where={r.placement.where} missing={r.placement.missing} exact={r.placement.exactInTitle} />
                </td>
                <td className="px-3 py-2 tabular text-ink-2">{r.opportunity ?? "—"}</td>
                <td className="px-3 py-2 text-ink-3">{ago(r.checkedAt)}</td>
                <td className="pr-3">
                  <button onClick={() => remove(r.term)} className="opacity-0 transition group-hover:opacity-100" title="Stop tracking">
                    <Trash2 className="h-3.5 w-3.5 text-ink-3 hover:text-bad" />
                  </button>
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-sm text-ink-3">
                  {rows.length ? "No keywords match this filter." : "No keywords yet — add a few above, or discover some in Research."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[11px] text-ink-3">
        <span>
          # = App Store web search order (top ~12) · ≈ = iTunes Search API position beyond that (top 200). Popularity &amp; difficulty: see
          source badge ·{" "}
          <a className="underline hover:text-ink-2" href="/methodology">
            methodology
          </a>
        </span>
        <span>
          <span className="text-primary">■</span> T title · <span className="text-sky">■</span> S subtitle ·{" "}
          <span className="text-good">■</span> K keyword field
        </span>
      </div>
    </div>
  );
}
