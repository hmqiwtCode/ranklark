import { isCountry, STOREFRONTS } from "@ranklark/core/apple";
import { keywordFieldTokens, placement, tokens } from "@ranklark/core/metadata";
import { notFound } from "next/navigation";
import { L } from "@/components/help";
import { Card } from "@/components/ui";
import { AppHeader } from "@/features/apps/components/app-header";
import { MetadataEditor } from "@/features/apps/components/metadata-editor";
import { localizationsFor } from "@/features/apps/server/sync";
import { appCountries, getApp, keywordRows } from "@/features/keywords/server/queries";
import { ascConfigured } from "@/server/apple/asc";

export const dynamic = "force-dynamic";

export default async function MetadataPage({
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
  const tracked = keywordRows(app, country, 1).map((r) => r.term);
  const locs = localizationsFor(app.id);
  const indexed = STOREFRONTS[country]?.locales ?? [];

  // Cross-localization: per indexed locale, what does it cover? (industry tests: words don't combine ACROSS locales)
  const perLocale = indexed.map((locale) => {
    const l = locs.find((x) => x.locale === locale);
    const f = { name: l?.name ?? null, subtitle: l?.subtitle ?? null, keywords: l?.keywords ?? null, seller: app.seller };
    const words = new Set([...tokens(f.name), ...tokens(f.subtitle), ...keywordFieldTokens(f.keywords)]);
    return {
      locale,
      present: !!l,
      l,
      words: words.size,
      covers: tracked.filter((t) => placement(t, f).covered).length,
      kwLen: [...(l?.keywords ?? "")].length,
    };
  });
  const emptySlots = perLocale.filter((p) => !p.present).length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <AppHeader app={app} country={country} countries={appCountries(app.id)} tab="metadata" />
      <div className="mt-4">
        <MetadataEditor
          appId={app.id}
          name={app.name}
          subtitle={app.subtitle}
          keywords={app.keywords_field}
          keywordsSource={app.keywords_source}
          seller={app.seller}
          tracked={tracked}
          ascEnabled={ascConfigured()}
        />
      </div>

      {locs.length ? (
        <Card
          className="mt-4"
          pad={false}
          title={
            <L term="locale">
              Localizations indexed in {STOREFRONTS[country]?.flag} {STOREFRONTS[country]?.name}
            </L>
          }
          right={
            <span className="text-xs text-ink-3">
              {!locs.length
                ? `${indexed.length} localizations indexed here · connect App Store Connect to see which you fill`
                : emptySlots
                  ? `${emptySlots} unused slot${emptySlots > 1 ? "s" : ""} · up to ${emptySlots * 160} extra indexed characters`
                  : "all slots used"}
            </span>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="text-[12px] text-ink-3">
                <tr className="border-b border-line/70">
                  <th className="py-2.5 pl-4 font-medium">
                    <L term="locale">Locale</L>
                  </th>
                  <th className="px-3 font-medium">
                    <L term="appName">Name</L>
                  </th>
                  <th className="px-3 font-medium">
                    <L term="subtitle">Subtitle</L>
                  </th>
                  <th className="px-3 font-medium">
                    <L term="keywordField">Keyword field</L>
                  </th>
                  <th className="px-3 font-medium">
                    <L term="coversTracked">Covers tracked</L>
                  </th>
                </tr>
              </thead>
              <tbody>
                {perLocale.map((p, i) => (
                  <tr key={p.locale} className="border-b border-line/40">
                    <td className="py-2 pl-4 font-mono text-xs">
                      {p.locale}
                      {i === 0 && <span className="ml-2 font-sans text-[10px] uppercase text-ink-3">default</span>}
                    </td>
                    {p.present ? (
                      <>
                        <td className="max-w-48 truncate px-3">{p.l!.name ?? "—"}</td>
                        <td className="max-w-48 truncate px-3 text-ink-2">{p.l!.subtitle ?? "—"}</td>
                        <td className="px-3 tabular text-ink-2">{p.l!.keywords ? `${p.kwLen}/100` : "empty"}</td>
                        <td className="px-3 tabular">
                          {p.covers}/{tracked.length}
                        </td>
                      </>
                    ) : (
                      <td colSpan={4} className="px-3 text-ink-3">
                        {locs.length
                          ? "Not localized — free indexed slot (name 30 + subtitle 30 + keywords 100)"
                          : "Connect App Store Connect to see this localization"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2.5 text-[11px] text-ink-3">
            Locale list: Apple&apos;s App Store localizations reference (default + additional languages per storefront). Industry tests
            (AppTweak) show these are indexed for search; words combine within one localization but not across localizations.
          </p>
        </Card>
      ) : (
        <p className="card mt-4 px-4 py-3 text-[13px] text-ink-3">
          <L term="locale">Other languages</L>: in {STOREFRONTS[country]?.flag} {STOREFRONTS[country]?.name} Apple also searches your text
          in {indexed.length} localization{indexed.length === 1 ? "" : "s"} ({indexed.slice(0, 6).join(", ")}
          {indexed.length > 6 ? "…" : ""}). Connect App Store Connect (see <code>.env.example</code>) to see and audit each one.
        </p>
      )}
    </main>
  );
}
