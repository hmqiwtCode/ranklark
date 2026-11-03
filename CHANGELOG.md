# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Extension popup: **Track this app** on any App Store app page (apps.apple.com/…/id…), with optional
  keywords, in one click. No new Chrome permission is needed.

### Changed
- **Simpler UI throughout:**
  - Navigation is now "My apps · Find keywords · Extension", with an "Add app" button.
  - A new app gets a "Which searches should your app show up for?" step with one-tap keyword ideas taken from
    its name and subtitle, instead of empty charts.
  - There's a single "Check now" button, and the country menu is labelled "Store".
  - The keyword table lists rank first and uses plain columns (Name / Subtitle / Keywords instead of T/S/K,
    "missing “free”" instead of "+1 missing").
  - Find keywords: the app picker comes first, there are starter ideas, the first 10 ideas are scored
    automatically, a "Your rank" column was added, and "Track N for <app>" is one clear action.
  - The App Store text page uses plain wording.
- Add-app picks the country from the pasted link (apps.apple.com/vn/… → Vietnam).

### Fixed
- Keyword suggestions no longer join words across "&", "/" or "+".
- The popup no longer says "All checked for today" when no keywords are tracked. "Run now" now reports what it did.

## [0.1.0] - 2026-11-03

First public release.

### Added
- Dashboard (Next.js + SQLite):
  - Keyword rank tracking using the true App Store order (top ~12) plus the iTunes API position (≤200).
  - Popularity from Apple Ads when configured; otherwise a disclosed autocomplete-based estimate.
  - Difficulty, visibility and opportunity scores.
  - Metadata audit and keyword placement.
  - Competitor view, public store profiles, keyword research, and a live landing showcase.
- Chrome MV3 extension that checks ranks from the user's own browser (one queue, 6–8 s spacing, 2,500/day cap,
  per-host backoff, no cookies).
- **No-login pairing:** opening the dashboard connects an installed extension automatically, or you enter the
  dashboard address in the popup.
- `@ranklark/core`, a pure shared package (Apple endpoint parsers, scoring, metadata rules, wire protocol) with
  unit tests.
- Versioned SQLite migrations (`PRAGMA user_version`).
