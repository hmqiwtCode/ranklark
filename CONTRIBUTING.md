# Contributing to Ranklark

Thanks for helping indie developers do ASO without a subscription. Issues, ideas, docs fixes and code are all welcome.

## Setup

```bash
nvm use                 # Node 22 (.nvmrc); ≥ 20.19 works
corepack enable         # provides pnpm (version pinned in package.json)
pnpm install
pnpm dev                # dashboard on http://localhost:3100
pnpm ext:watch          # rebuild the extension on save (load apps/extension/dist in chrome://extensions)
```

## Before you open a PR

```bash
pnpm check              # Biome lint/format + TypeScript in every package + unit tests
pnpm build              # dashboard + extension production builds
```

CI runs the same commands. `pnpm format` fixes formatting and import order.

## Where things go

Read [`docs/architecture.md`](docs/architecture.md) first. The short version:

- **Shared logic** (Apple URL builders and parsers, scoring, metadata rules, wire types) goes in
  `packages/core`. It must stay pure: no Node APIs, no DB, no `fetch`. Add a test in `packages/core/test`.
- **Dashboard features** go in `apps/web/src/features/<feature>/{components,server}`. Keep `app/` routes thin.
- **Extension behaviour** goes in `apps/extension/src/background/`, with one runner per task kind in `tasks/`.

[`docs/extending.md`](docs/extending.md) has step-by-step recipes: new data source, new extension task,
new feature, schema change, new storefront.

## House rules

1. **No made-up numbers.** Every metric shows where it came from (Apple Ads / ASC / Est.). With no signal,
   show "—", never a default value.
2. **Be gentle with Apple.** Respect the shared pacing in `packages/core/src/apple/pacing.ts`. PRs that raise
   request rates, add parallel fetching or bypass backoff won't be merged.
3. **Only the user's own data.** The extension must never fetch on behalf of other users or use a visitor's
   browser as a proxy.
4. **Label your evidence.** If behaviour depends on an undocumented Apple endpoint, say so in a comment,
   with the date you verified it.
5. **Schema changes** are new migrations appended to `server/db/migrations.ts`, never edits to old ones.
6. Commit messages: short imperative summary (`Add Google Play search parser`). Conventional Commits are
   welcome but not required.

## Reporting bugs

Use the bug report template. If Apple changed a page and a parser broke, include the storefront, the term and
the date. Don't paste full Apple HTML responses; a minimal snippet of the changed structure is enough.

## Security

Please report vulnerabilities privately; see [SECURITY.md](SECURITY.md).

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE), and you
agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
