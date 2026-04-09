# Security Upgrades

This document tracks security-related changes made to ICP Deploy, including the rationale behind each fix.

## Assessment: 2026-04-07

Full security assessment performed using DFINITY security skills methodology. No critical or high-severity vulnerabilities found. Seven findings identified (3 medium, 4 low).

---

### Fixes Applied

_None yet — fixes will be logged below as they are implemented._

---

### Open Findings

#### Medium Severity

| # | Finding | Location | Status |
|---|---------|----------|--------|
| 1 | CDN scripts loaded without Subresource Integrity (SRI) hashes. A CDN compromise could inject malicious code with full page access, including PEM key exports. | `index.html:8-11` | Open |
| 2 | Identity export routes PEM private key through the browser JS heap for download. Combined with #1, a compromised CDN could exfiltrate keys. | `index.html:2196-2209` | Open |
| 3 | Batch endpoints (`/api/canisters/status-all`, `/api/deploy/summary`, `/api/cycles/ledger-balances`) iterate over user-supplied arrays with no length cap. Each item spawns sync CLI calls with 30s timeouts, enabling DoS. | `server.js:690, 1023, 1249` | Open |

#### Low Severity

| # | Finding | Location | Status |
|---|---------|----------|--------|
| 4 | `/api/cycles/ledger-balances` constructs network args inline without calling `assertSafeName`. Values like `--help` would be interpreted as CLI flags. | `server.js:1257` | Open |
| 5 | `assertSafePath` uses `path.resolve()` which doesn't resolve symlinks. A symlink inside `$HOME` pointing outside it bypasses the home-directory check. | `server.js:98-105` | Open |
| 6 | `/api/build`, `/api/canister/update-settings`, `/api/identity/new`, `/api/identity/import` lack rate limiting. | `server.js` (multiple) | Open |
| 7 | `Number()` conversion of cycles `BigInt` values loses precision above 2^53 (~9,000T cycles). | `index.html:487, 2569` | Open |

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
