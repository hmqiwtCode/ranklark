import { SourceBadge } from "@/components/ui";

export const metadata = { title: "Methodology — Ranklark" };

function Row({ metric, badge, source, how }: { metric: string; badge?: string; source: React.ReactNode; how: React.ReactNode }) {
  return (
    <tr className="border-b border-line/40 align-top">
      <td className="py-3 pl-4 pr-3 font-semibold">
        {metric} {badge && <SourceBadge source={badge} />}
      </td>
      <td className="px-3 py-3 text-ink-2">{source}</td>
      <td className="px-3 py-3 text-ink-2">{how}</td>
    </tr>
  );
}

export default function Methodology() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Methodology</p>
      <h1 className="mt-2 text-[36px] font-extrabold leading-tight tracking-tight">Every number, and where it comes from</h1>
      <p className="mt-3 max-w-2xl text-ink-2">
        Apple has no API that says “app X ranks #N for keyword Y”, and no public search-volume number. So every ASO tool mixes Apple data
        with its own estimates. We label which is which, and when there is no signal we show “—”, never a default.
      </p>

      <section className="card mt-8 overflow-hidden">
        <table className="w-full text-left text-[13px]">
          <thead className="text-[12px] text-ink-3">
            <tr className="border-b border-line/70">
              <th className="py-2.5 pl-4 font-medium">Metric</th>
              <th className="px-3 font-medium">Source</th>
              <th className="px-3 font-medium">How</th>
            </tr>
          </thead>
          <tbody>
            <Row
              metric="Rank #"
              source={<>apps.apple.com web search page (undocumented; same order the web App Store shows)</>}
              how={
                <>
                  Position of your app among the ~12 app results Apple renders server-side. Live-tested 2026-11-02: this order differs from
                  the iTunes API order.
                </>
              }
            />
            <Row
              metric="Rank ≈"
              source={<>iTunes Search API (official, documented, ~20 calls/min)</>}
              how={
                <>
                  When you&apos;re not in the web top ~12, your position in the API&apos;s 200 results, clamped to ≥13 and marked
                  approximate.
                </>
              }
            />
            <Row
              metric="Popularity"
              badge="apple_ads"
              source={
                <>
                  Apple Ads Platform API · <code>POST /v1/suggestions/phrases/query</code> (queryType SEARCH, phrase IN)
                </>
              }
              how={
                <>
                  Apple&apos;s own 0–100 relative popularity. Needs your Apple Ads account. Docs list no country filter, so it may be
                  account-wide.
                </>
              }
            />
            <Row
              metric="Popularity"
              badge="hints_estimate"
              source={<>App Store autocomplete (MZSearchHints, undocumented; returns ≤10 terms, no priority value since 2022)</>}
              how={
                <>
                  We type the term a few letters at a time (1,2,3,4,6,9,13… letters) and note when Apple first suggests it. prefix = 1 −
                  0.09·(letters − 2), clamped 0.1–1; position = 1 − (place − 1)/10. Score = 10 + 90·(0.75·prefix + 0.25·position). A term
                  Apple never suggests scores 5 — a measured absence, not a placeholder. Suggestions are cached 7 days per prefix.
                </>
              }
            />
            <Row
              metric="Brand"
              source={<>Top-10 results</>}
              how={
                <>
                  If the #1 app&apos;s name (or developer) starts with the keyword and fewer than 2 other top-10 apps use it, it&apos;s
                  another app&apos;s name: no opportunity score, skipped when tracking (App Review Guideline 2.3.7).
                </>
              }
            />
            <Row
              metric="Difficulty"
              badge="hints_estimate"
              source={<>Top-10 results (web order, API fill)</>}
              how={
                <>
                  Per app: 0.6·log10(ratings+1)/5 + 0.25·(term in title/subtitle) + 0.15·rating/5, weighted 1/√position, scaled down when
                  fewer than 10 apps compete.
                </>
              }
            />
            <Row
              metric="Opportunity"
              source={<>Derived</>}
              how={
                <>
                  √(popularity × (100 − difficulty)); ×0.4 when you already rank top 3. Only shown when popularity has a value, never for
                  brand names.
                </>
              }
            />
            <Row
              metric="Visibility"
              source={<>Derived</>}
              how={
                <>
                  Σ popularity × TTR(rank) ÷ Σ popularity × TTR(1). TTR anchors from SplitMetrics (2018): #1 28.4%, #2 6.2%, #3 2.7%, ≈1% to
                  #10; beyond that is our taper. Directional only.
                </>
              }
            />
            <Row
              metric="Subtitle"
              badge="asc"
              source={<>App Store Connect API (your key) → else web catalog proxy → else manual</>}
              how={<>The iTunes Lookup API has no subtitle field.</>}
            />
            <Row
              metric="Keyword field"
              badge="asc"
              source={
                <>
                  App Store Connect API <code>appStoreVersionLocalizations.keywords</code>
                </>
              }
              how={<>Hidden from the public store. Only you can read it — any tool that shows it without your ASC key is guessing.</>}
            />
          </tbody>
        </table>
      </section>

      <h2 className="mt-10 text-xl font-bold">Metadata rules the audit enforces</h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] text-ink-2">
        <li>
          <b className="text-ink">Apple rule:</b> name 30, subtitle 30, keyword field 100 (Help says bytes — non-Latin scripts use more),
          promo text 170 (not indexed).
        </li>
        <li>
          <b className="text-ink">Apple rule:</b> indexed = name, subtitle, keyword field, developer name, categories (+ in-app purchase
          names). Description is not a ranking field on iOS.
        </li>
        <li>
          <b className="text-ink">Apple rule:</b> separate keywords with commas, no spaces; don&apos;t repeat words already in
          name/subtitle; plurals of included words count as duplicates.
        </li>
        <li>
          <b className="text-ink">Apple reference + industry tests:</b> each storefront indexes extra localizations (US also indexes es-MX,
          zh-Hans/Hant, fr-FR, ko, pt-BR, ru, ar-SA, vi). Words combine within a localization, not across.
        </li>
        <li>
          <b className="text-ink">Observed, not Apple:</b> “app”, “free”, “best” are low-value; singular/plural may both match.
        </li>
      </ul>

      <h2 className="mt-10 text-xl font-bold">Terms & limits</h2>
      <p className="mt-3 text-[14px] text-ink-2">
        The iTunes Search API is official but rate-limited (~20/min) and meant for promoting store content. The web search page, catalog
        proxy and autocomplete are undocumented and Apple&apos;s website terms prohibit scraping — Ranklark keeps them at personal-use
        volume (one check per keyword per day, spaced requests) and
        <code className="mx-1">ASO_WEB_SEARCH=0</code> turns them off. Not legal advice; review before running this as a commercial service.
      </p>
    </main>
  );
}
