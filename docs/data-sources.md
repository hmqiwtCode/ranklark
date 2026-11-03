# Where every number comes from

Every number in the UI carries a source badge: **Apple Ads** (Apple's data), **ASC** (your App Store Connect)
or **Est.** (our formula). With no signal, the UI shows "—", never a default value.

| Metric | Source | Status |
|---|---|---|
| Rank `#n` | `apps.apple.com/{cc}/iphone/search?term=`: server-rendered top ~12 in App Store order | Undocumented, no token |
| Rank `≈n` | iTunes Search API position (≤200), beyond the web window | Official, ~20 req/min; its order ≠ App Store order |
| Subtitle | App Store Connect → `apps.apple.com/api/apps/v1/catalog/{cc}/apps?ids=` → manual | Catalog proxy undocumented, no token |
| Popularity · Apple Ads | Apple Ads Platform API 1.0 `POST /v1/suggestions/phrases/query` | Official, needs an Apple Ads account |
| Popularity · Est. | App Store autocomplete (MZSearchHints): letters typed before Apple suggests the term + its position | Undocumented; no `priority` field any more |
| Difficulty · Est. | Top-10 rating counts, title/subtitle match, ratings | Our formula (`packages/core/src/scoring.ts`) |
| Visibility | Σ popularity × tap-through(rank) ÷ Σ popularity × tap-through(1) | Tap-through anchors from a 2018 SplitMetrics study |

Full formulas are at `/methodology` in the app.

## Optional official integrations

| Unlocks | Env vars (`apps/web/.env.local`) |
|---|---|
| Real subtitle + hidden keyword field for every localization; one-click import of all your apps | `ASC_ISSUER_ID`, `ASC_KEY_ID`, `ASC_PRIVATE_KEY_PATH` |
| Apple's own popularity (0–100) for any phrase | `ADS_CLIENT_ID`, `ADS_TEAM_ID`, `ADS_KEY_ID`, `ADS_AD_ACCOUNT_ID`, `ADS_PRIVATE_KEY_PATH` |

> The App Store Connect and Apple Ads clients were written from Apple's documentation, but they haven't yet
> been run against a real account. Expect to adjust them on first connect, and please open an issue or PR
> with what you find. The old Apple Search Ads Campaign Management API v5 sunsets on 26 Jan 2027 and isn't used.

## Terms of use

The iTunes Search API is official. The web search page, catalog proxy and autocomplete are undocumented, and
Apple's website and Media Services terms restrict scraping and automated monitoring. Ranklark keeps them at
personal volume: one check per keyword per day, spaced requests, caching, and in extension mode each user's
own browser. Review the terms yourself before running a hosted service. This is not legal advice.
