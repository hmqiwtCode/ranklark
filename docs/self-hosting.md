# Self-hosting

## Local (one person)

```bash
nvm use            # Node 22 (see .nvmrc); Node ≥ 20.19 works
corepack enable    # or: npm i -g pnpm
pnpm install
pnpm dev           # http://localhost:3100
```

Data lives in `apps/web/data/aso.db` (SQLite, gitignored). Back it up by copying the file.

## Daily snapshot (cron)

```bash
pnpm track                    # ranks for every app × storefront
pnpm track -- --popularity    # + popularity (weekly is plenty)
# crontab:  15 7 * * *  cd /path/to/ranklark && pnpm track >> apps/web/data/track.log 2>&1
```

In extension mode you don't need cron: connected browsers check about once an hour while Chrome is open.

## Production build

```bash
pnpm build
pnpm start         # next start -p 3100
```

## Hosting for several people

1. Run with `ASO_FETCH_MODE=extension` so the server never calls Apple. Each person's browser does.
2. Build the extension with your dashboard origin:
   `DASHBOARD_ORIGINS=https://aso.example.com pnpm ext:build`.
3. **Put the dashboard behind your own authentication** (reverse proxy, SSO, VPN). Ranklark has no accounts
   yet. Everyone who can open the dashboard sees the same apps and keywords.
   Leave `/api/ext/*` reachable without that login: the extension authenticates with its own device key
   and never sends cookies.
4. Pin which extension IDs may connect: `EXT_ALLOWED_IDS=<your store extension id>`. Otherwise any
   extension could request a key from `/api/ext/connect`.

All environment variables are documented in `apps/web/.env.example`.
