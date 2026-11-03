import { isCountry } from "@ranklark/core/apple";
import { phrasesFrom } from "@ranklark/core/metadata";
import { TrendingUp } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddKeywords } from "@/components/actions";
import { VisibilityChart } from "@/components/charts";
import { L } from "@/components/help";
import { BarList, Card, Delta, KpiStrip } from "@/components/ui";
import { AppHeader } from "@/features/apps/components/app-header";
import { KeywordOnboarding } from "@/features/keywords/components/keyword-onboarding";
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
  const daysWithData = series.filter((d) => d.value != null).length;

  // Brand-new app (or a store with no keywords yet): one clear next step instead of empty charts.
  if (!rows.length) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-6">
        <AppHeader app={app} country={country} countries={appCountries(app.id)} tab="keywords" />
        <KeywordOnboarding appId={app.id} appName={app.name} country={country} suggestions={suggestKeywords(app.name, app.subtitle)} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <AppHeader app={app} country={country} countries={appCountries(app.id)} tab="keywords" />

      <section className="card mt-4 p-4 pb-2">
        <KpiStrip
          items={[
            { label: <L term="visibility">Visibility</L>, value: `${k.visibility}%`, sub: "of the traffic a #1 rank would get" },
            { label: <L term="top10">In the top 10</L>, value: `${k.top10}/${k.total}`, sub: "keywords" },
            { label: <L term="ranked">Found at all</L>, value: `${k.ranked}/${k.total}`, sub: "in the top 200" },
            { label: <L term="avgPopularity">Avg popularity</L>, value: k.avgPop ?? "—", sub: "how often people search" },
            {
              label: <L term="movers">Last 7 days</L>,
              value:
                daysWithData >= 2 ? (
                  <span className="flex items-baseline gap-2 text-[22px]">
                    <Delta value={k.improved} /> <Delta value={-k.declined} />
                  </span>
                ) : (
                  "—"
                ),
              sub: daysWithData >= 2 ? "keywords up / down" : "shows after a few days",
            },
          ]}
        />
        {daysWithData >= 2 ? (
          <div className="mt-4">
            <VisibilityChart data={series} markers={markers} />
          </div>
        ) : (
          <p className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-3 text-[13px] text-ink-3">
            <TrendingUp className="h-4 w-4" />
            Your visibility chart appears after the second day of checks. Ranks are checked once a day automatically.
          </p>
        )}
      </section>

      <section className="card mt-4">
        <div className="flex flex-wrap items-center gap-3 border-b border-line/70 px-4 py-3">
          <h2 className="text-[15px] font-semibold">
            Your keywords <span className="text-ink-3">· {rows.length}</span>
          </h2>
          <AddKeywords appId={app.id} country={country} />
        </div>
        <KeywordTable rows={rows} appId={app.id} country={country} myIds={myIds} />
      </section>

      {(movers.length > 0 || opportunities.length > 0 || topComp.length > 0) && (
        <div className={`mt-4 grid gap-4 ${GRID_COLS[[movers, opportunities, topComp].filter((x) => x.length > 0).length] ?? ""}`}>
          {movers.length > 0 && (
            <Card title={<L term="movers">Biggest moves this week</L>}>
              <BarList
                empty="Needs at least two days of history"
                color="var(--color-series-blue)"
                rows={movers.map((r) => ({ key: r.term, label: r.term, value: Math.abs(r.delta!), display: <Delta value={r.delta} /> }))}
              />
            </Card>
          )}
          {opportunities.length > 0 && (
            <Card title={<L term="bestOpp">Worth working on</L>}>
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
          )}
          {topComp.length > 0 && (
            <Card title={<L term="competeWith">Apps you compete with</L>}>
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
                  display: `${c.n} keyword${c.n === 1 ? "" : "s"}`,
                }))}
              />
            </Card>
          )}
        </div>
      )}
    </main>
  );
}

// Literal class names so Tailwind can see them.
const GRID_COLS: Record<number, string> = { 1: "md:grid-cols-1", 2: "md:grid-cols-2", 3: "md:grid-cols-3" };

/** One-tap keyword ideas from the app's own name and subtitle: 2–3 word phrases first, then single words. */
function suggestKeywords(name: string, subtitle: string | null): string[] {
  const all = [...phrasesFrom(name), ...phrasesFrom(subtitle)].filter((p) => p.length > 2);
  const words = (p: string) => p.split(" ").length;
  const ranked = [...new Set(all)].sort(
    (a, b) => (words(a) === 2 ? 0 : words(a) === 3 ? 1 : 2) - (words(b) === 2 ? 0 : words(b) === 3 ? 1 : 2),
  );
  return ranked.slice(0, 8);
}
