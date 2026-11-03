/* eslint-disable @next/next/no-img-element */

import { isCountry } from "@ranklark/core/apple";
import { isUseful, tokens } from "@ranklark/core/metadata";
import { ExternalLink, Search } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CountrySelect } from "@/components/actions";
import { L } from "@/components/help";
import { RatingBars } from "@/components/rating-bars";
import { Card, KpiStrip, Meter, SourceBadge } from "@/components/ui";
import { getStoreApp, isMine, whereItRanks } from "@/features/apps/server/store";
import { ago, compact } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function StoreAppPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ country?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const country = isCountry(sp.country) ? sp.country : "us";
  const app = await getStoreApp(Number(id), country);
  if (!app) notFound();
  const ranks = whereItRanks(app.id, country);
  const words = [...new Set([...tokens(app.name), ...tokens(app.subtitle)].filter(isUseful))];
  const seed =
    tokens(app.subtitle ?? app.name)
      .filter(isUseful)
      .slice(0, 2)
      .join(" ") ||
    words[0] ||
    "";
  const mine = isMine(app.id);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <CountrySelect value={country} options={[]} />
        <div className="flex flex-wrap gap-2">
          {mine && (
            <Link href={`/apps/${app.id}?country=${country}`} className="btn-ghost flex h-9 items-center px-3 text-sm">
              Open in my dashboard
            </Link>
          )}
          <Link
            href={`/research?seed=${encodeURIComponent(seed)}&country=${country}`}
            className="btn-ghost flex h-9 items-center gap-2 px-3 text-sm"
          >
            <Search className="h-4 w-4" />
            Find keywords like this
          </Link>
          {app.url && (
            <a href={app.url} target="_blank" rel="noreferrer" className="btn-primary flex h-9 items-center gap-2 px-3 text-sm">
              App Store <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      <section className="card p-5">
        <div className="flex flex-wrap items-start gap-5">
          {app.icon && <img src={app.icon} alt="" width={88} height={88} className="rounded-[20px] border border-white/5" />}
          <div className="min-w-0 flex-1">
            <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">{app.name}</h1>
            <p className="mt-1 text-[16px] text-ink-2">{app.subtitle ?? <span className="text-ink-3">no subtitle found</span>}</p>
            <p className="mt-1 text-sm text-ink-3">
              {app.seller} · {app.genre}
            </p>
          </div>
        </div>
        <div className="mt-5 border-t border-line/70 pt-4">
          <KpiStrip
            items={[
              {
                label: <L term="ratings">Rating</L>,
                value: app.rating ? `${app.rating.toFixed(1)}★` : "—",
                sub: `${compact(app.ratingCount)} ratings`,
              },
              {
                label: <L term="chart">Category chart</L>,
                value: app.chart ? `#${app.chart.position}` : "—",
                sub: app.chart ? `${app.chart.genre} · ${app.chart.chart.replace("-", " ")}` : "not in top charts",
              },
              { label: "Price", value: app.price ? `$${app.price}` : "Free" },
              { label: "Version", value: app.version ?? "—", sub: app.updatedAt ? `updated ${ago(app.updatedAt)}` : undefined },
              { label: <L term="ranksFor">Ranks for</L>, value: ranks.length, sub: "checked keywords" },
            ]}
          />
        </div>
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card title={<L term="histogram">Rating breakdown</L>}>
          <RatingBars histogram={app.histogram} />
        </Card>
        <Card title={<L term="placement">Words in name &amp; subtitle</L>}>
          <div className="flex flex-wrap gap-1.5">
            {words.map((w) => (
              <Link
                key={w}
                href={`/research?seed=${encodeURIComponent(w)}&country=${country}`}
                className="rounded-md bg-white/[0.05] px-2 py-1 text-[13px] text-ink-2 hover:bg-white/10 hover:text-ink"
              >
                {w}
              </Link>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-ink-3">
            These words are indexed for search. Its hidden keyword field can&apos;t be seen by anyone except the developer. Click a word to
            research it.
          </p>
        </Card>
      </div>

      <Card
        className="mt-4"
        pad={false}
        title={<L term="ranksFor">Where it ranks</L>}
        right={<span className="text-xs text-ink-3">from keywords already searched with this tool</span>}
      >
        {ranks.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-[13px]">
              <thead className="text-[12px] text-ink-3">
                <tr className="border-b border-line/70">
                  <th className="py-2.5 pl-4 font-medium">
                    <L term="keyword">Keyword</L>
                  </th>
                  <th className="px-3 font-medium">
                    <L term="rank">Rank</L>
                  </th>
                  <th className="px-3 font-medium">
                    <L term="popularity">Popularity</L>
                  </th>
                  <th className="px-3 font-medium">
                    <L term="difficulty">Difficulty</L>
                  </th>
                  <th className="px-3 font-medium">
                    <L term="checked">Checked</L>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranks.map((r) => (
                  <tr key={r.term} className="border-b border-line/40 hover:bg-white/[0.025]">
                    <td className="py-2 pl-4 font-medium">
                      <Link href={`/research?seed=${encodeURIComponent(r.term)}&country=${country}`} className="hover:text-primary">
                        {r.term}
                      </Link>
                    </td>
                    <td className="px-3 tabular font-semibold">
                      {r.approx ? "≈" : "#"}
                      {r.rank}
                    </td>
                    <td className="px-3">
                      <div className="flex items-center gap-1.5">
                        <Meter value={r.popularity} color="var(--color-series-blue)" />
                        <SourceBadge source={r.popSource} />
                      </div>
                    </td>
                    <td className="px-3">
                      <Meter value={r.difficulty} color="var(--color-series-orange)" />
                    </td>
                    <td className="px-3 text-ink-3">{r.day}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-ink-3">
            No checked keyword contains this app yet. Try{" "}
            <Link className="text-ink-2 underline" href={`/research?seed=${encodeURIComponent(seed)}&country=${country}`}>
              researching “{seed}”
            </Link>
            .
          </p>
        )}
      </Card>

      {app.description && (
        <details className="card mt-4 p-4">
          <summary className="cursor-pointer text-[15px] font-semibold">
            Description <span className="text-xs font-normal text-ink-3">(not used for search ranking on iOS)</span>
          </summary>
          <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-ink-2">
            {app.description.slice(0, 2500)}
            {app.description.length > 2500 ? "…" : ""}
          </p>
        </details>
      )}
    </main>
  );
}
