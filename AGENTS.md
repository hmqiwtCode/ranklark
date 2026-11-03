# Notes for AI coding agents

- Monorepo: pnpm workspaces. Use `pnpm`, not npm/yarn. Node 22 (`.nvmrc`).
- Verify with `pnpm check` (Biome + tsc + vitest) and `pnpm build` before claiming a change works.
- Layout and rules: `docs/architecture.md`. Recipes: `docs/extending.md`.
- `packages/core` must stay pure (no Node APIs, DB or fetch). It is bundled into the MV3 service worker.
- Dashboard code is grouped by feature: `apps/web/src/features/<feature>/{components,server}`.
  `apps/web/src/server/*` must not import from `features/`.
- Next.js 16 has breaking changes from older versions. Read `apps/web/node_modules/next/dist/docs/` before
  using unfamiliar APIs (see `apps/web/AGENTS.md`).
- Never invent metrics or defaults. Unknown → "—". Never raise Apple request rates.
