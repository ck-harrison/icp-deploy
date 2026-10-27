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
- Every `/api` request must carry the header `X-Requested-With: CanisterPanel`
  exactly, which a cross-site form or link cannot set (CSRF protection).
- CORS and WebSocket origins are locked to `http://localhost:<port>` and
  `http://127.0.0.1:<port>`.
- CLI commands are spawned with argument arrays, never shell strings, and every
  user-supplied name is checked against an allowlist before it reaches the CLI.
- Project paths must be inside your home directory, including after following
  symbolic links.
- CLI commands run without `ICP_ENVIRONMENT` or `ICP_PROJECT_ROOT` from your shell,
  so an exported variable cannot silently point a "Local" action at mainnet or at
  another project.
- React, ReactDOM and Babel load with Subresource Integrity hashes, so a changed
  file on the CDN is refused by the browser.
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
| 1 | Medium | Tailwind loads from its CDN pinned to an exact version but without an integrity hash, because that CDN sends no CORS header (which integrity checking requires). A compromised Tailwind CDN could run code in the page, and so could do anything the dashboard can (spend cycles, delete canisters). | The Tailwind `<script src>` in `public/index.html` |
| 2 | Low | Changing controllers is not rate limited. | `/api/canister/update-settings` |
| 3 | Low | Cycle amounts above about 9,000T lose precision where the UI converts them to JavaScript numbers. | `formatCycles` / `getCyclesHealth` in `public/index.html` |
| 4 | Low | Choosing an identity in the dropdown changes the `icp` CLI's default identity for the whole machine, including your terminal. Deploys pass the identity explicitly and do not change it. | `/api/identity/use` in `server.js` |

## Reporting a vulnerability

Please open a [GitHub security advisory](https://github.com/ck-harrison/icp-deploy/security/advisories/new)
rather than a public issue.
