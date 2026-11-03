# Extending Ranklark

Recipes for the most common changes. Each one says where the code goes, so TypeScript and the tests catch
whatever you missed.

## Add an Apple data source

1. Create `packages/core/src/apple/<source>.ts` exporting a URL builder (`xxxUrl(...)`) and a pure parser
   (`parseXxx(body)`). No `fetch`, no Node APIs.
2. Re-export it from `packages/core/src/apple/index.ts`.
3. Add a fixture test in `packages/core/test/`. Write the smallest response shape that exercises the parser;
   don't paste real Apple responses.
4. Server mode: add a fetcher in `apps/web/src/server/apple/` that wraps it in `schedule()`
   (`server/apple/queue.ts`) so it respects per-host pacing.
5. Extension mode: see the next recipe.

## Add a task the extension runs

The protocol is typed end to end, so the compiler walks you through it.

1. **Protocol.** In `packages/core/src/protocol.ts`, add a variant to `Task` and a matching one to `TaskResult`.
2. **Runner.** Create `apps/extension/src/background/tasks/<kind>.ts` and register it in `tasks/index.ts`.
   The `Runners` mapped type won't compile until every kind has a runner. Use `apple()` for every request
   (pacing, daily cap, backoff) and `optional()` for nice-to-have requests.
3. **Planner.** Emit the task from `buildTasks()` in `apps/web/src/features/extension/server/tasks.ts`.
   Only plan work for the owner's own apps and keywords.
4. **Ingester.** Add an entry to `INGESTERS` in `apps/web/src/features/extension/server/ingest.ts`. Treat the
   payload as untrusted: type-check and size-cap every field, and reject terms that aren't tracked.
5. **Host permission.** If the source is on a new Apple host, add it to `host_permissions` in
   `apps/extension/static/manifest.json`. Expect Chrome to show users a new permission prompt.

## Add a dashboard feature

1. Create `apps/web/src/features/<feature>/` with `components/` (client UI) and `server/` (queries,
   mutations). Server modules may import `@/server/*` and `@ranklark/core`.
2. Add routes under `apps/web/src/app/` and keep them thin: parse input, call the feature, return JSON or JSX.
3. Every new number shown in a table gets a plain-language entry in `apps/web/src/lib/glossary.ts`. It
   appears in the "?" tooltip.
4. Label where each number comes from (Apple Ads / ASC / Est.) with `<SourceBadge>`. If there's no signal,
   show "—", never a default value.

## Change the database schema

Append a new entry to `MIGRATIONS` in `apps/web/src/server/db/migrations.ts`. Never edit a shipped
migration. Each one runs once, in a transaction, tracked by `PRAGMA user_version`. Add the row type to
`server/db/rows.ts`.

## Add a storefront (country)

Add it to `STOREFRONTS` in `packages/core/src/apple/storefronts.ts` with Apple's storefront ID and the locales
Apple indexes there (App Store Connect Help → App Store localizations).

## Change a scoring formula

Formulas live in `packages/core/src/scoring.ts` and are explained in the app at `/methodology`. Update both,
add a test case, and note the change in `CHANGELOG.md`, since users compare numbers over time.

## Support another platform (Google Play, …)

Follow the shape of `packages/core/src/apple/`: add `packages/core/src/<platform>/` with URL builders and
parsers, then a new `platform` column via a migration. Open an issue first so we can agree on the data model.
