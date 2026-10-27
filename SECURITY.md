# Security

ICP Deploy is a single-user tool that runs on your own machine. It drives the
`icp` CLI with your local identities, so anything that can talk to it can spend
your cycles and delete your canisters. The design assumes that only you, in your
own browser, can reach it.

It never handles private keys: there is no way to create, import or export an
identity through it. Do those in the terminal with `icp identity`.

## What protects it

- The server binds `127.0.0.1` only, so other machines on your network cannot reach it.
- Requests whose `Host` header is not `localhost:<port>` or `127.0.0.1:<port>` are
  refused, which blocks DNS-rebinding attacks from websites.
- Every `/api` request must carry an `X-Requested-With: CanisterPanel` header,
  which a cross-site form or link cannot set (CSRF protection).
- CORS and WebSocket origins are locked to `http://localhost:<port>`.
- CLI commands are spawned with argument arrays, never shell strings, and every
  user-supplied name is checked against an allowlist before it reaches the CLI.
- Project paths must be inside your home directory.
- Sensitive endpoints (top-up, mint, delete, auto top-up run) are rate limited,
  each with its own allowance.
- Batch endpoints accept at most 200 items.
- Content Security Policy, `X-Frame-Options` and `X-Content-Type-Options` headers
  are set on every response.

**Do not expose the port to a network**, put it behind a reverse proxy, or run it
on a shared machine.

## Known limitations

These are known and not yet fixed. None lets a remote attacker in while the
server stays on `127.0.0.1`.

| # | Severity | Issue | Where |
|---|----------|-------|-------|
| 1 | Medium | React, Babel and Tailwind load from public CDNs without Subresource Integrity hashes. A compromised CDN could run code in the page, and so could do anything the dashboard can (spend cycles, delete canisters). | `<script src>` tags in `public/index.html` |
| 2 | Low | The home-directory check on paths does not resolve symlinks. | `assertSafePath` in `server.js` |
| 3 | Low | Some write endpoints are not rate limited. | `/api/build`, `/api/canister/update-settings` |
| 4 | Low | Cycle amounts above about 9,000T lose precision where the UI converts them to JavaScript numbers. | `formatCycles` / `getCyclesHealth` in `public/index.html` |
| 5 | Low | Switching identity in the dashboard changes the `icp` CLI's default identity for the whole machine, including your terminal. | `/api/identity/use` and the deploy WebSocket handler in `server.js` |

## Reporting a vulnerability

Please open a [GitHub security advisory](https://github.com/ck-harrison/icp-deploy/security/advisories/new)
rather than a public issue.
