import { STOREFRONTS } from "@ranklark/core/apple";
import Link from "next/link";
import { AddAppForm, ImportFromAsc } from "@/components/actions";
import { Spark } from "@/components/charts";
import { L } from "@/components/help";
import { AppIcon, Card } from "@/components/ui";
import { overview } from "@/features/keywords/server/queries";
import { compact } from "@/lib/format";
import { adsConfigured } from "@/server/apple/ads";
import { ascConfigured } from "@/server/apple/asc";

export const dynamic = "force-dynamic";

export default function AppsPage() {
  const rows = overview();
  const asc = ascConfigured();
  const ads = adsConfigured();
  const totals = rows.reduce((t, r) => ({ kw: t.kw + r.kpis.total, top10: t.top10 + r.kpis.top10, ranked: t.ranked + r.kpis.ranked }), {
    kw: 0,
    top10: 0,
    ranked: 0,
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-tight">Your apps</h1>
          <p className="mt-1 text-sm text-ink-2">
            {rows.length} apps · {totals.kw} tracked keywords · {totals.top10} in the top 10
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`rounded-md border px-2 py-1 ${asc ? "border-good/30 text-good" : "border-line text-ink-3"}`}
            title="Reads your real subtitle + hidden keyword field"
          >
            App Store Connect: {asc ? "connected" : "not configured"}
          </span>
          <span
            className={`rounded-md border px-2 py-1 ${ads ? "border-sky/30 text-sky" : "border-line text-ink-3"}`}
            title="Real Apple popularity (0–100) for any phrase"
          >
            Apple Ads: {ads ? "connected" : "not configured"}
          </span>
        </div>
      </div>

      <section className="card mb-5 flex flex-col gap-4 p-4 md:flex-row md:items-center">
        <div className="flex-1">
          <AddAppForm />
        </div>
        <ImportFromAsc enabled={asc} />
      </section>

      {rows.length === 0 ? (
        <Card>
          <p className="py-10 text-center text-sm text-ink-3">
            No apps yet. Paste an App Store link above{asc ? " or import everything from App Store Connect" : ""}.
          </p>
        </Card>
      ) : (
        <section className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead className="text-[12px] text-ink-3">
                <tr className="border-b border-line/70">
                  <th className="py-2.5 pl-4 font-medium">App</th>
                  <th className="px-3 font-medium">
                    <L term="store">Store</L>
                  </th>
                  <th className="px-3 font-medium">
                    <L term="ratings">Ratings</L>
                  </th>
                  <th className="px-3 font-medium">
                    <L term="keywordsCount">Keywords</L>
                  </th>
                  <th className="px-3 font-medium">
                    <L term="top10">Top 10</L>
                  </th>
                  <th className="px-3 font-medium">
                    <L term="ranked">Ranked</L>
                  </th>
                  <th className="px-3 font-medium">
                    <L term="visibility">Visibility</L>
                  </th>
                  <th className="px-3 font-medium">
                    <L term="spark14">14 days</L>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ app, country, kpis: k, spark, checkedToday }) => (
                  <tr key={app.id} className="border-b border-line/40 hover:bg-white/[0.025]">
                    <td className="py-2.5 pl-4">
                      <Link href={`/apps/${app.id}?country=${country}`} className="flex items-center gap-3">
                        <AppIcon src={app.icon} name={app.name} size={34} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-ink">{app.name}</div>
                          <div className="truncate text-xs text-ink-3">{app.subtitle ?? app.genre ?? `ID ${app.id}`}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-3">
                      {STOREFRONTS[country]?.flag} {country.toUpperCase()}
                    </td>
                    <td className="px-3 tabular text-ink-2">
                      {app.rating ? `${app.rating.toFixed(1)}★` : "—"} <span className="text-ink-3">({compact(app.rating_count)})</span>
                    </td>
                    <td className="px-3 tabular">{k.total}</td>
                    <td className="px-3 tabular font-semibold">{k.top10}</td>
                    <td className="px-3 tabular text-ink-2">{k.ranked}</td>
                    <td className="px-3 tabular">
                      {k.total ? `${k.visibility}%` : "—"}
                      {!checkedToday && k.total > 0 && (
                        <span className="ml-1 text-[10px] text-warn" title="Not checked today">
                          ●
                        </span>
                      )}
                    </td>
                    <td className="px-3">
                      <Spark values={spark} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
