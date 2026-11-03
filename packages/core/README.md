# @ranklark/core

Pure, isomorphic TypeScript shared by the dashboard and the extension. It contains no Node APIs, no database
access and no network calls, so it bundles into an MV3 service worker as easily as into Next.js.

| Import | Contents |
|---|---|
| `@ranklark/core/apple` | App Store endpoint URL builders + parsers, storefronts, pacing |
| `@ranklark/core/metadata` | Tokenizer, field limits, keyword placement, audit rules |
| `@ranklark/core/scoring` | Difficulty, visibility, opportunity, popularity estimate |
| `@ranklark/core/protocol` | Server ⇄ extension wire types |

```bash
pnpm --filter @ranklark/core test
```
