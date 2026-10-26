# Security

ICP Deploy is a single-user tool that runs on your own machine. It drives the
`icp` CLI with your local identities, so anything that can talk to it can spend
your cycles, delete your canisters, and export your private keys. The design
assumes that only you, in your own browser, can reach it.

## What protects it

- The server binds `127.0.0.1` only, so other machines on your network cannot reach it.
- Every `/api` request must carry an `X-Requested-With: CanisterPanel` header,
  which a cross-site form or link cannot set (CSRF protection).
- CORS and WebSocket origins are locked to `http://localhost:<port>`.
- CLI commands are spawned with argument arrays, never shell strings, and every
  user-supplied name is checked against an allowlist before it reaches the CLI.
- Project paths must be inside your home directory.
- Sensitive endpoints (top-up, delete, identity export) are rate limited.
- Content Security Policy, `X-Frame-Options` and `X-Content-Type-Options` headers
  are set on every response.

**Do not expose the port to a network**, put it behind a reverse proxy, or run it
on a shared machine.

## Known limitations

These are known and not yet fixed. None lets a remote attacker in while the
server stays on `127.0.0.1`.

| # | Severity | Issue | Where |
|---|----------|-------|-------|
| 1 | Medium | React, Babel and Tailwind load from public CDNs without Subresource Integrity hashes. A compromised CDN could run code in the page. | `<script src>` tags in `public/index.html` |
| 2 | Medium | Identity export passes the PEM private key through the page so the browser can download it. Combined with #1, a compromised CDN could read it. | the `api.post('/api/identity/export')` call in `public/index.html` |
| 3 | Medium | Batch endpoints accept arrays with no length cap, so a huge request could tie up the server. | `/api/canisters/status-all`, `/api/deploy/summary`, `/api/cycles/ledger-balances` in `server.js` |
| 4 | Low | The home-directory check on paths does not resolve symlinks. | `assertSafePath` in `server.js` |
| 5 | Low | Some write endpoints are not rate limited. | `/api/build`, `/api/canister/update-settings`, `/api/identity/new`, `/api/identity/import` |
| 6 | Low | Cycle amounts above about 9,000T lose precision where the UI converts them to JavaScript numbers. | `formatCycles` / `getCyclesHealth` in `public/index.html` |

If you are cautious about #1 and #2, export identities with the `icp` CLI
directly rather than through the dashboard.

## Reporting a vulnerability

Please open a [GitHub security advisory](https://github.com/ck-harrison/icp-deploy/security/advisories/new)
rather than a public issue.
