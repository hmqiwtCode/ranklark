import { isCountry } from "@ranklark/core/apple";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddKeywords } from "@/components/actions";
import { VisibilityChart } from "@/components/charts";
import { L } from "@/components/help";
import { BarList, Card, Delta, KpiStrip } from "@/components/ui";
import { AppHeader } from "@/features/apps/components/app-header";
import { KeywordTable } from "@/features/keywords/components/keyword-table";
import {
  appCountries,
  getApp,
  historyWindow,
  keywordRows,
  kpis,
  listApps,
  metadataMarkers,
  visibilitySeries,
} from "@/features/keywords/server/queries";

export const dynamic = "force-dynamic";

export default async function AppPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ country?: string; days?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const app = getApp(Number(id));
  if (!app) notFound();
  const country = isCountry(sp.country) ? sp.country : app.primary_country;
  const days = Number(sp.days) || 30;
  const rows = keywordRows(app, country, days);
  const k = kpis(rows);
  const win = historyWindow(rows, days);
  const series = visibilitySeries(rows, win);
  const markers = metadataMarkers(app.id, country, win);
  const myIds = listApps().map((a) => a.id);

  const movers = rows
    .filter((r) => r.delta)
    .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!))
    .slice(0, 6);
  const opportunities = rows
    .filter((r) => r.opportunity != null && (r.rank == null || r.rank > 3))
    .sort((a, b) => b.opportunity! - a.opportunity!)
    .slice(0, 6);
  const competitors = new Map<number, { name: string; icon: string | null; n: number }>();
  for (const r of rows) {
    for (const a of r.top.slice(0, 10)) {
      if (!myIds.includes(a.id)) competitors.set(a.id, { name: a.name, icon: a.icon, n: (competitors.get(a.id)?.n ?? 0) + 1 });
    }
  }
  const topComp = [...competitors].sort((a, b) => b[1].n - a[1].n).slice(0, 6);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <AppHeader app={app} country={country} countries={appCountries(app.id)} tab="keywords" />

      <section className="card mt-4 p-4 pb-2">
        <KpiStrip
          items={[
            { label: <L term="visibility">Visibility</L>, value: `${k.visibility}%`, sub: "share of rank-1 traffic" },
            { label: <L term="top10">Top 10</L>, value: k.top10, sub: <>of {k.total} tracked</> },
            { label: <L term="top50">Top 50</L>, value: k.top50 },
            { label: <L term="ranked">Ranked</L>, value: `${k.ranked}/${k.total}`, sub: "in top 200" },
            { label: <L term="avgPopularity">Avg popularity</L>, value: k.avgPop ?? "—", sub: "see source badges" },
            {
              label: <L term="movers">7-day movers</L>,
              value: (
                <span className="flex items-baseline gap-2 text-[22px]">
                  <Delta value={k.improved} /> <Delta value={-k.declined} />
                </span>
              ),
              sub: "keywords up / down",
            },
          ]}
        />
        <div className="mt-4">
          <VisibilityChart data={series} markers={markers} />
        </div>
      </section>

      <section className="card mt-4">
        <div className="flex flex-wrap items-center gap-3 border-b border-line/70 px-4 py-2">
          <AddKeywords appId={app.id} country={country} />
        </div>
        <KeywordTable rows={rows} appId={app.id} country={country} myIds={myIds} />
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Card title={<L term="movers">Biggest movers (7d)</L>}>
          <BarList
            empty="Needs at least two days of history"
            color="var(--color-series-blue)"
            rows={movers.map((r) => ({ key: r.term, label: r.term, value: Math.abs(r.delta!), display: <Delta value={r.delta} /> }))}
          />
        </Card>
        <Card title={<L term="bestOpp">Best opportunities</L>}>
          <BarList
            empty="Run a Full refresh to score popularity"
            color="var(--color-series-orange)"
            rows={opportunities.map((r) => ({
              key: r.term,
              label: (
                <>
                  {r.term} <span className="text-xs text-ink-3">{r.rank ? `#${r.rank}` : "unranked"}</span>
                </>
              ),
              value: r.opportunity!,
            }))}
          />
        </Card>
        <Card title={<L term="competeWith">Who you compete with</L>}>
          <BarList
            empty="No SERP data yet"
            color="var(--color-series-blue)"
            rows={topComp.map(([cid, c]) => ({
              key: String(cid),
              label: (
                <Link href={`/store/${cid}?country=${country}`} className="truncate hover:underline">
                  {c.name}
                </Link>
              ),
              value: c.n,
              display: `${c.n} kw`,
            }))}
          />
        </Card>
      </div>
    </main>
  );
}
