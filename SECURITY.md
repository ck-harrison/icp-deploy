# Security Upgrades

This document tracks security-related changes made to ICP Deploy, including the rationale behind each fix.

> **Note on locations.** Line numbers below were re-verified against the current
> files on 2026-08-04 and each now carries a symbol anchor as well. Line numbers
> drift on every edit — trust the anchor over the number, and re-verify before
> acting on a finding.

## Assessment: 2026-04-07

Full security assessment performed using DFINITY security skills methodology. No critical or high-severity vulnerabilities found. Seven findings identified (3 medium, 4 low).

---

### Fixes Applied

**2026-08-06 — Finding #4 (low): unvalidated network name reaching an argv slot.**
`/api/cycles/ledger-balance(s)`, `/api/ledger/balance`, `/api/cycles/identity-balance`
and the auto-top-up balance helpers each built network args inline, so a value
like `--help` or `--version` was passed straight to the CLI as a flag. All of
them now route through a single `ledgerNetworkArgs()` helper (`server.js:161`)
that calls `assertSafeName` before the value can become an argument.

Verified: `network=--help` and `network=--version` are now rejected with
`Invalid network: must start with alphanumeric...` on every one of those routes.

Fixed incidentally while correcting a separate `-n`/`-e` flag bug — the same
inline construction was also passing environment names to the network flag.

---

### Open Findings

#### Medium Severity

| # | Finding | Location | Status |
|---|---------|----------|--------|
| 1 | CDN scripts loaded without Subresource Integrity (SRI) hashes. A CDN compromise could inject malicious code with full page access, including PEM key exports. | `public/index.html:8-11` (the four `<script src>` tags) | Open |
| 2 | Identity export routes PEM private key through the browser JS heap for download. Combined with #1, a compromised CDN could exfiltrate keys. | `public/index.html:2918` (`api.post('/api/identity/export')` handler) | Open |
| 3 | Batch endpoints iterate over user-supplied arrays with no length cap. Each item spawns sync CLI calls with 30s timeouts, enabling DoS. | `server.js:861` (`/api/canisters/status-all`), `:1718` (`/api/deploy/summary`), `:1973` (`/api/cycles/ledger-balances`) | Open |

#### Low Severity

| # | Finding | Location | Status |
|---|---------|----------|--------|
| 4 | ~~`/api/cycles/ledger-balances` constructs network args inline without calling `assertSafeName`. Values like `--help` would be interpreted as CLI flags.~~ | now `ledgerNetworkArgs()` at `server.js:161` | **Fixed 2026-08-06** — see Fixes Applied |
| 5 | `assertSafePath` uses `path.resolve()` which doesn't resolve symlinks. A symlink inside `$HOME` pointing outside it bypasses the home-directory check. | `server.js:105` (`function assertSafePath`) | Open |
| 6 | `/api/build`, `/api/canister/update-settings`, `/api/identity/new`, `/api/identity/import` lack rate limiting. | `server.js` (multiple) | Open |
| 7 | `Number()` conversion of cycles `BigInt` values loses precision above 2^53 (~9,000T cycles). | `public/index.html:387, 568, 1540, 1549, 2571, 3381, 3390` (`formatCycles` / `getCyclesHealth` helpers and the header balance chip) | Open |

---

### Verified Secure

These areas were explicitly reviewed and found to be properly handled:

- **No XSS** — no `dangerouslySetInnerHTML`, `innerHTML`, or `eval`. All user data rendered via JSX escaping.
- **CSRF** — all API calls include `X-Requested-With` header; server rejects requests without it.
- **No command injection** — all CLI spawns use argument arrays, never shell strings.
- **WebSocket** — origin-validated, connection-limited (5), payload-capped (64KB).
- **Input validation** — `assertSafeName`, `assertSafePath`, canister ID regex, network name sanitization consistently applied.
- **No client-side storage** — no localStorage/sessionStorage/cookies with sensitive data.
- **Security headers** — CSP, X-Frame-Options, X-Content-Type-Options all present.
