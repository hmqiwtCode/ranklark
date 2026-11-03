import { isCountry } from "@ranklark/core/apple";
import Link from "next/link";
import { notFound } from "next/navigation";
import { L } from "@/components/help";
import { AppIcon, Card } from "@/components/ui";
import { AppHeader } from "@/features/apps/components/app-header";
import { appCountries, getApp, keywordRows, listApps } from "@/features/keywords/server/queries";
import { compact } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CompetitorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ country?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const app = getApp(Number(id));
  if (!app) notFound();
  const country = isCountry(sp.country) ? sp.country : app.primary_country;
  const rows = keywordRows(app, country, 7);
  const mine = new Set(listApps().map((a) => a.id));

  type Comp = {
    id: number;
    name: string;
    subtitle: string | null;
    icon: string | null;
    ratingCount: number;
    rating: number | null;
    terms: { term: string; pos: number }[];
  };
  const comps = new Map<number, Comp>();
  for (const r of rows) {
    r.top.forEach((a, i) => {
      if (mine.has(a.id)) return;
      const c = comps.get(a.id) ?? {
        id: a.id,
        name: a.name,
        subtitle: a.subtitle ?? null,
        icon: a.icon,
        ratingCount: a.ratingCount,
        rating: a.rating,
        terms: [],
      };
      c.terms.push({ term: r.term, pos: i + 1 });
      if (!c.subtitle && a.subtitle) c.subtitle = a.subtitle;
      comps.set(a.id, c);
    });
  }
  const list = [...comps.values()].sort((a, b) => b.terms.length - a.terms.length || b.ratingCount - a.ratingCount).slice(0, 30);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <AppHeader app={app} country={country} countries={appCountries(app.id)} tab="competitors" />
      <Card
        className="mt-4"
        pad={false}
        title={<L term="competeWith">Apps you share the top 10 with</L>}
        right={<span className="text-xs text-ink-3">from the latest check of {rows.length} keywords</span>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead className="text-[12px] text-ink-3">
              <tr className="border-b border-line/70">
                <th className="py-2.5 pl-4 font-medium">App</th>
                <th className="px-3 font-medium">
                  <L term="ratings">Ratings</L>
                </th>
                <th className="px-3 font-medium">
                  <L term="overlap">Overlap</L>
                </th>
                <th className="px-3 font-medium">
                  <L term="whereTheyRank">Where they rank (your keywords)</L>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-b border-line/40 align-top hover:bg-white/[0.025]">
                  <td className="py-2.5 pl-4">
                    <Link href={`/store/${c.id}?country=${country}`} className="flex items-center gap-3 hover:opacity-90">
                      <AppIcon src={c.icon} name={c.name} size={34} />
                      <div className="min-w-0 max-w-72">
                        <div className="truncate font-semibold text-ink">{c.name}</div>
                        <div className="truncate text-xs text-ink-3">{c.subtitle ?? "—"}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 tabular text-ink-2">
                    {c.rating ? `${c.rating.toFixed(1)}★` : "—"} ({compact(c.ratingCount)})
                  </td>
                  <td className="px-3 py-2.5 tabular font-semibold">{c.terms.length}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {c.terms
                        .sort((a, b) => a.pos - b.pos)
                        .map((t) => (
                          <span key={t.term} className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[11px] text-ink-2">
                            {t.term} <span className="tabular text-ink">#{t.pos}</span>
                          </span>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
              {!list.length && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-ink-3">
                    Check some keywords first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}
