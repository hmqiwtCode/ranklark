# Browser extension

The extension checks App Store ranks for **your own** tracked keywords from **your own browser**, then sends
the parsed results to your dashboard. Apple allows roughly 20 searches a minute per internet connection. When
each user's browser does the checking, every user gets their own allowance, so a hosted dashboard isn't
capped by one server IP.

## Install (developer build)

```bash
pnpm install
pnpm ext:build              # → apps/extension/dist (fixed dev ID: iincpebojbfheicjlopfaccejhemifid)
```

1. Open `chrome://extensions` and switch on **Developer mode**.
2. Click **Load unpacked** and choose `apps/extension/dist`.
3. Open your dashboard (`pnpm dev` → http://localhost:3100). It connects automatically, with no login and
   nothing to copy. Or open the extension popup, enter the dashboard address and click **Connect**.

To stop the server calling Apple entirely (for hosted setups), start it with `ASO_FETCH_MODE=extension`.

## How it works

```
every hour (chrome.alarms) / "Run now" / just connected
  └─ GET  {dashboard}/api/ext/tasks      ← only YOUR apps + keywords not checked today
  └─ for each task, ONE queue for all Apple hosts: 6 s + 0–2 s jitter (≈7.5–10 requests/min in total)
       serp   iTunes Search API + apps.apple.com search page (+ lookup of web-only top-10 apps)
       hints  App Store autocomplete, prefix by prefix; stops when Apple suggests the term
       apps   iTunes Lookup + catalog proxy (subtitle, chart position)
  └─ POST {dashboard}/api/ext/results    ← one result at a time (nothing lost if Chrome closes)
```

Source layout:

```
apps/extension/src/
├── background/
│   ├── index.ts        wiring: alarms + message listeners
│   ├── run.ts          the check loop
│   ├── apple.ts        paced fetch, daily cap, per-host backoff
│   ├── server.ts       dashboard API client (+ no-login connect)
│   ├── messages.ts     popup / dashboard messages and their permissions
│   ├── state.ts        chrome.storage config + status, toolbar badge
│   └── tasks/          one runner per task kind (apps, serp, hints)
├── popup/popup.ts      toolbar popup
└── shared/types.ts     types shared by worker and popup
```

## Privacy and safety

- Every Apple request uses `credentials: "omit"`. Chrome *would* otherwise send your Apple cookies.
- No access to tabs, history or other sites. Permissions: `storage`, `alarms`, three Apple hosts.
- A hard cap of 2,500 Apple requests per day.
- On 403/429 only *that* Apple host pauses (60 min → 24 h); the others keep working.
- It only runs tasks your own dashboard lists, and never fetches URLs supplied by a web page.
- Each connected browser has its own key; the server stores only a hash. Remove a browser on the
  Extension page and its key stops working at once.
- Pages can message the extension only from origins in `externally_connectable` (localhost by default).
  Add your hosted dashboard at build time: `DASHBOARD_ORIGINS=https://aso.example.com pnpm ext:build`.

## End-to-end test

```bash
# terminal 1: a throwaway server that must never call Apple
cd apps/web && pnpm build && ASO_FETCH_MODE=extension ASO_DB_PATH=data/e2e.db pnpm exec next start -p 3101
# terminal 2: loads dist/ into Chrome for Testing, connects with no login, waits for real results
cd apps/extension && E2E_SERVER=http://localhost:3101 pnpm e2e                  # pairs by opening the dashboard
cd apps/extension && E2E_SERVER=http://localhost:3101 E2E_CONNECT=popup pnpm e2e # pairs via the popup
```

## Publishing

- `pnpm --filter @ranklark/extension build:store` writes `dist-store/`, which is minified and has no `key`.
  Zip it for the Chrome Web Store, then set `NEXT_PUBLIC_EXTENSION_ID` on the dashboard to the store ID.
- Safari: App Review Guideline 4.5.1 rules out scraping the App Store or building rankings from it, so
  there is no App Store build.
