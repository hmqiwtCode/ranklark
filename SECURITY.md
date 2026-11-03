# Security policy

## Reporting a vulnerability

Please **don't open a public issue**. Use GitHub's private reporting instead:
**Security → Report a vulnerability** on this repository. We aim to acknowledge reports within 7 days.

Please include affected versions, reproduction steps and impact. A fix will be released before details are
published, and you'll be credited unless you prefer not to be.

## Scope and design notes

- The dashboard is **single-user and has no login**. It's designed for `localhost` or behind your own
  authentication. Exposing it to the internet as-is is a deployment issue, not a vulnerability. See
  [docs/self-hosting.md](docs/self-hosting.md).
- Extension device keys are random 192-bit tokens. The server stores only their SHA-256 hash.
- `POST /api/ext/connect` only answers requests whose browser-set `Origin` is `chrome-extension://…`
  (optionally pinned with `EXT_ALLOWED_IDS`).
- Everything the extension posts is validated, size-capped, and limited to the owner's tracked keywords.
- AI research: a Claude API key saved in Settings stays in that browser's localStorage. It reaches the server
  only in the `x-anthropic-api-key` header of a key test or run start. It is held in memory for that run and
  never stored, logged or returned. `ANTHROPIC_API_KEY` on the server is used only in `ASO_FETCH_MODE=server`.
- State-changing AI research routes refuse cross-site requests (an `Origin` that doesn't match the host).
- The MCP endpoint (`/api/mcp`) is off by default. When on, it needs a random bearer token that is stored only
  as a SHA-256 hash and compared in constant time, and it refuses cross-origin browser requests.
- Never commit `.p8`/`.pem` keys or `.env.local`. All of them are gitignored.

## Supported versions

Only the latest release on `main` gets security fixes.
