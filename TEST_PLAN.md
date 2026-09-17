# ICP Deploy — Test Plan

**Last updated:** 2026-09-17
**App URL:** http://localhost:3456
**CLI version:** icp 1.0.0
**Test projects:** whatever is in the dashboard's recent-projects list — the Fleet tab scans all of them, so the set changes as projects are loaded, renamed, or archived. Per-canister counts are deliberately not listed here; they go stale on every deploy. Read the live set from the Fleet tab.

Legend: `[x]` passed, `[!]` known issue, `[-]` skipped (risky/N/A), `[ ]` needs manual UI test

---

## Current Status

| Feature | API | UI | Notes |
|---|---|---|---|
| App startup / header | x | untested | |
| Project loading | x | untested | |
| Network toggle | x | untested | |
| Identity management | x | untested | |
| Folder browser | x | untested | |
| Canister status | x | untested | |
| Deploy summary | x | untested | |
| Deploy operations | - | untested | Skipped — consumes cycles |
| Snapshots | x | untested | Create/restore skipped |
| Cycles top-up | x | untested | Actual top-up skipped |
| **Auto top-up** | x | **needs test** | Added PR #5 |
| **Fleet tab** | x | **partly verified** | Tiers, TCYCLES and the audit are API-verified and render-verified headlessly; click-driven state is not. See the dated sections below |
| **Top-up validation** | n/a | **needs test** | Added PR #7 |
| Settings persistence | x | untested | |
| Security / CSRF | x | — | |

---

## Known Issues

| Issue | Severity | Status |
|---|---|---|
| Fleet: asset canisters show "Not accessible" with icp 1.0.0 if project uses `@dfinity/asset-canister@v2.1.0` | Medium | **Fix required in your projects** — update recipe to v2.2.1. Affected: CME Prototype, whiteboard-icp, cleardeck-multichain, aihq, Harrison Data |
| `harrison_data_backend` errors in Fleet tab | Low | Separate issue — canister may be frozen or have cycles problems |
| `icp canister info` not a valid subcommand | Low | Known icp CLI limitation — server handles gracefully |
| Email/threshold alerts | Feature gap | Deferred — not yet built |

---

## What You Need to Test (Manual UI)

These require interacting with the browser at http://localhost:3456.

### Critical path — do these first (15 min)

1. **App loads** — open http://localhost:3456, confirm header shows CLI version, principal, ICP balance
2. **Project load** — load CME Prototype; confirm canister cards appear in Canisters tab
3. **Fleet tab** — click Fleet, confirm scan runs, canister rows appear grouped by project
4. **Top-up validation** — click Top Up on a canister, enter an amount larger than your cycles balance; confirm warning appears and submit is blocked; switch source to ICP, confirm block clears
5. **Auto top-up** — click Auto top-up on a canister, set a threshold and amount, save; confirm "Auto" badge appears on the canister row in Fleet

### After updating recipe versions (Fleet health check)

6. Update the five affected `icp.yaml` files from `@dfinity/asset-canister@v2.1.0` → `@dfinity/asset-canister@v2.2.1`:
   - `/Users/christopher.harrison/Code/CME Prototype/icp.yaml`
   - `/Users/christopher.harrison/Code/Whiteboard/whiteboard-icp/icp.yaml`
   - `/Users/christopher.harrison/Code/cleardeck-multichain/icp.yaml`
   - `/Users/christopher.harrison/Code/aihq/icp.yaml`
   - `/Users/christopher.harrison/Code/Harrison Data/icp.yaml`
7. Reload Fleet tab — "Not accessible" section should shrink to 0 or 1 (harrison_data_backend only)

### Remaining tabs (10 min)

8. **Canisters tab** — cycles health bars color-coded, single-controller warning visible, status loads
9. **Deploy tab** — summary panel loads with per-canister status, canister checkboxes work
10. **Snapshots tab** — canister selector works, empty state shown
11. **Identity switch** — switch identity in dropdown, confirm principal in header updates
12. **Network toggle** — switch Local/Production, confirm tab content updates

### Edge cases (5 min)

13. **Top-up failure reason** — if a top-up fails (try an amount slightly over balance from ICP source), confirm the error toast shows the CLI's reason, not just "Top-up failed"
14. **Fleet refresh** — click Refresh in Fleet tab, confirm spinner appears and data updates

---

## Detailed Test Sections

### 1. App Startup & Header

- [x] App loads at localhost:3456
- [x] CLI version detects correctly (`icp 1.0.0`)
- [x] Principal displays correctly
- [x] ICP balance displays
- [x] Replica status reports correctly
- [ ] Header renders in browser (logo, CLI version, principal, balance, replica indicator)

---

### 2. Project Loading

- [x] CME Prototype loads: 2 canisters (certified-rates, certified-rates-ui)
- [x] Harrison Data loads: 5 canisters
- [x] cleardeck-multichain loads: 9 canisters
- [x] Invalid path returns error
- [ ] Loading spinner appears during project load
- [ ] Canisters populate in UI after load
- [ ] Recent projects bar shows loaded project as active

---

### 3. Fleet Tab (PR #6)

- [x] `/api/fleet` scans all recent projects and returns canisters (was `?network=ic` at PR #6; now defaults to `?network=all` — see the tier section below)
- [x] Deduplication by canister ID works (same canister in multiple projects counted once)
- [x] Canisters grouped by project, preserving recent-project order
- [x] Cycles balance parsed and health calculated per canister
- [x] Auto top-up config attached to matching canisters
- [!] Asset canisters using `@dfinity/asset-canister@v2.1.0` fail with icp 1.0.0 (fix: upgrade to v2.2.1)
- [ ] Fleet tab renders with summary cards (total canisters, total cycles, low/critical counts)
- [ ] Canisters grouped by project with project name header
- [ ] Each canister row shows: name, type badge, canister ID, Dashboard link, status pill, cycles bar, est. days remaining
- [ ] Auto badge appears on canisters with auto top-up enabled
- [ ] Top Up button opens modal pre-scoped to that canister
- [ ] Auto top-up button opens modal pre-scoped to that canister
- [ ] Inaccessible canisters section is collapsible
- [ ] Refresh button triggers re-scan

**Fleet production/staging tiers**

- [x] `/api/fleet` defaults to `network=all` and scans every non-local network each project declares. Cost is one status call per (canister, network) pair with a resolvable ID, not networks × canisters. Observed 2026-08-04, 10 recent projects: 32 rows (26 on `ic`, 6 on `staging`), 0 errored, ~14s. Row counts are volatile — they move whenever a project deploys, so re-measure rather than trusting this line.
- [x] `availableNetworks` returned as the union across scanned projects, `ic` always present (verified: `["ic","staging"]`)
- [x] `?network=<name>` still scans a single network (backward-compatible)
- [x] An unclassified canister falls back to a guess from the network: `ic` → production, custom environment → staging
- [x] `POST /api/fleet/tier` classifies a canister and persists under `fleetTiers[path][network][canister]`
- [x] `tier: 'default'` clears the classification and prunes emptied branches back to `{}`
- [x] Rejects an invalid tier, a path outside `$HOME`, and an unsafe canister name; missing `X-Requested-With` → 403
- [x] Move button round-trips in the browser: 25/3 → 24/4 → 25/3, updating counts in place with no rescan and no console errors
- [x] Classification survives a full page reload (fresh load: `frontend-staging` absent from Production, present in Staging)
- [x] Every row shows a network badge

**Owner-defined classification (2026-09-13)**

- [x] An explicit tier equal to the network guess is still stored: `POST /api/fleet/tier` `{capsl, backend, ic, production}` → `{"tier":"production","tierSet":true}`, and `fleetTiers` gains `{"ic":{"backend":"production"}}`. Under the previous rule this write was deleted, making a decided canister indistinguishable from an untouched one
- [x] `tier: 'default'` still clears it and prunes the branch
- [x] `POST /api/fleet/tiers` applies a batch of 3 and returns `{"ok":true,"applied":3}` with per-item results
- [x] Batch validation is all-or-nothing. Five rejections tested (bad tier in item 2 of 2, path outside `$HOME`, injection-shaped canister name, empty array, 201 items); settings file byte-identical afterwards in every case
- [x] `/api/fleet` reports `tierSet` per row, matching what was written (5 true / 19 false against a known settings state)
- [x] The `moved` chip is gone: classification history is not shown, only the current classification
- [x] Live after restart: 24/24 rows carry both `tierSet` and `networkResolved`; staging tab 9 rows, 9 of 9 resolving to `ic`, 7 unclassified
- [ ] The Review filter toggle — **not exercised: click-driven state, invisible to a static render**

**Doc line-reference gate (2026-09-17)**

- [x] Audited every line-number reference in every doc: 3 of 7 had rotted. `CLAUDE.md` pointed `MAX_WS_CONNECTIONS` and `PORT` at lines 2140 and 2478 of `server.js`, which actually hold a candid string and a blank line; both were off by 263 after the file grew. `CONTEXT.md` pointed `ledgerNetworkArgs` ten lines above where it lives, at a comment
- [x] All 7 converted to symbol references; `grep -nE '\.(js|html|sh|md|json|yaml):[0-9]+' *.md` now prints nothing
- [x] Added as gate step 5 in `CLAUDE.md` and **canaried both ways**: planting a backtick-quoted source-line reference turned it red, naming the file, line and match; removing the plant returned it to clean
- [x] The one historical sentence that legitimately contained the pattern was reworded, so the check needs no exemption channel
- [x] Inverse check: no doc references an `/api/` route that no longer exists in `server.js`

**Fleet audit: controllers and freezing thresholds (2026-09-16)**

- [x] Derived entirely from fields `/api/fleet` already returned (`controllers`, `freezingThreshold`); no new endpoint, no extra CLI call, `server.js` unchanged
- [x] Real findings on the live fleet: **22 of 24 canisters have a single controller** (only ClubHuman production `backend` and `frontend` have two), and **15 of 24 sit on the 30-day default freezing threshold** (8 at 90 days, 1 at 60)
- [x] Controller spread: 2 distinct principals across 24 canisters; the one controlling all 24 is marked "this identity"
- [x] Collapsed by default: header shows "Fleet audit / 2 findings / across both tabs" and the body does not render until expanded
- [x] Expanded: both findings render with their denominators, 37 canister chips (22 + 15), and 15 freeze-day annotations all reading `30d`
- [x] Canaried with a synthetic healthy fleet (two controllers everywhere, 90-day threshold): the panel does not render at all, rather than rendering an empty or reassuring one
- [x] Canaried with one unreadable row: the denominator drops to **21 of 23**, not 22 of 24, and the panel states "1 canister could not be audited ... Counts above are out of 23, not 24". An unreadable canister is never counted as healthy
- [ ] Expanding the panel by click in the browser — **not exercised: click-driven state.** The expanded body was rendered by flipping the initial `useState` in a throwaway copy

**Cycles-ledger (TCYCLES) balance per canister (2026-09-16)**

- [x] `icp cycles balance -e ic --of-principal <canisterId>` reads a canister principal's ledger balance, and it is a genuinely different number from the canister's own cycles. Verified across 13 ClubHuman/capsl canisters keyed on canister ID: 3 non-zero (7.5T, 2.1T, 162.646B), 10 at exactly zero
- [!] First reading looked like the same figure twice: ClubHuman production backend runs on ~7.53T and holds exactly 7.5T on the ledger. Caught by the round-number heuristic and settled by querying several canisters, which returned distinct values including zeros
- [!] A first comparison table mislabelled which project a row belonged to, because it was keyed on canister *name* and both ClubHuman and capsl have one called `backend`. Re-derived keyed on canister ID: the 162.646B belongs to ClubHuman **staging**, not capsl
- [x] `GET /api/cycles/principal-balance` returns `{principal, cycles, raw}`; `0` for an unfunded account is returned as an answer, not an error
- [x] Rejects a missing principal, an injection-shaped principal (`a; rm -rf /`), a **flag-shaped** principal (`--help`, which would otherwise reach an argv slot), and a `path` outside `$HOME`
- [x] Works for both network shapes: `network=ic`, and `network=staging` where `-e` only resolves with the project as cwd (verified 162,646,000,000 for ClubHuman staging backend)
- [x] `POST /api/fleet/ledger-watch` persists to `fleetLedgerWatch[path][network][canister]`, prunes emptied branches to the same depth as `fleetTiers`, and rejects a non-boolean `enabled`
- [x] `/api/fleet` reports `ledgerWatch` on all 24 rows and the balance on none of them (one generator for that number)
- [x] Rendering the real `FleetTab` with 4 of 9 staging rows watched: 4 `Ledger` lines and 5 unwatched rows without one, 9 TCYCLES toggles of which 4 read ": On", and all four states render (7.50T, `0 TC`, `reading...`, `failed`)
- [x] Canaried: replacing the `e.ledgerWatch` guard with `true` makes all 9 rows sprout a Ledger line, so the check can see the guard
- [x] Live on 3456 after restart: both new routes return 400 on bad input rather than 404, and a real balance reads back
- [x] Settings file byte-identical to its pre-test backup after all of the above
- [ ] Clicking the TCYCLES toggle in the browser — **not exercised: click-driven, invisible to a static render**
- [-] Funding a canister's TCYCLES from its own cycles — **not possible from outside the canister.** The ledger's `withdraw` and `icp canister top-up` both go ledger → canister; no management-canister method takes cycles out of a running canister, and `icp canister delete` has no withdraw flag. Dropped from scope

**Environment name is not the network (2026-09-13)**

- [x] `resolveEnvNetwork()` reads each environment's `network:` field: ClubHuman and capsl `staging` rows resolve to `ic`, so all 9 staging-tier canisters are on mainnet. The banner previously counted environment *names* and reported 2 of 9, which is the reassuring reading of exactly what it exists to flag
- [x] Staging banner now reads "every one is on `ic`, burning real mainnet cycles"
- [x] Production tab: 15 of 15 rows resolve to `ic`

**Stale-server detection (2026-09-13)**

- [x] Reproduced: a browser refresh loads new page code while the old `node server.js` keeps serving. `POST /api/fleet/tiers` → HTTP 404 (process started Sep 7, file edited Sep 13); a current server answers `{"items":[]}` with 400
- [x] Rendering the real `FleetTab` against a payload with `tierSet` and `networkResolved` stripped: 0 `undefined` chips, 0 Keep buttons, and none of the five false claims ("no tier set by you", "with no network declared", "burning real mainnet cycles", "Review N", "Keep all N"). The stale-server notice appears instead, naming both missing capabilities and `node server.js`, and all 9 rows still list
- [x] Same render against the current payload: staging 9 rows / 5 chips / mainnet line present; production 15 rows / 14 chips; no stale notice on either
- [x] After restarting the server: `/api/fleet/tiers` → 400 not 404, `/api/cli` → `icp 1.0.0`
- [x] Newly deployed canisters are picked up without a restart (verified inadvertently: `backend-staging` appeared mid-session and scanned correctly)
- [x] Top-up modal on a staging row populates both identity balances (verified: `33.6088 ICP` / `7.74B cycles`; previously blank because the balance calls failed and were swallowed by `.catch(() => {})`)
- [x] Balance calls from a staging row send `path` so the environment resolves (verified in Chrome 2026-08-06 against the project then named `Tribez`, since renamed to `ClubHuman`)
- [x] A recent-project path that no longer exists returns `Project path no longer exists: <path>` instead of `{"error":""}` (verified 2026-08-10 against the archived `Tribez` path; `assertProjectDir` in `server.js`)
- [ ] Top Up from a staging-tier row actually transfers cycles — **not exercised: would spend real ICP/cycles**

**`-n` vs `-e` flag bug (reported 2026-08-06: "Mint failed: project does not contain a network named 'staging'")**

- [x] Reproduced at the CLI: `icp cycles balance -n staging` → `Error: project does not contain a network named 'staging'`; `-e staging` from the project dir → a balance
- [x] Both halves of the fix are load-bearing: `-e staging` run outside the project → `failed to locate project directory`, so the flag change alone is insufficient
- [x] `-n ic` still works from any directory (unchanged path, no regression)
- [x] `/api/cycles/identity-balance?network=staging&path=<project>` → returns the balance; same value as `?network=ic`, correct since that project's staging declares `network: ic`
- [x] `/api/ledger/balance?network=staging&path=<project>` → `33.60875265 ICP`
- [x] Omitting `path` for a custom environment returns a clear error rather than a wrong number
- [x] Flag injection rejected on all four routes: `network=--help` / `--version` → `Invalid network: ...` (closes SECURITY.md finding #4)
- [ ] `cycles mint -e <env>` executed for real — **not exercised: mints real ICP.** Flag path verified via `cycles balance`, which shares the identical Network Selection Parameters block, but the transaction itself is untested
- [ ] Auto top-up mint path on a custom environment (same code path via `performTopUp`, not separately exercised)
- [ ] Auto top-up saved from a staging-tier row writes under that row's network key in `.autotopup.json`
- [ ] Behaviour when a canister is deleted while an override for it still exists (override becomes inert; not verified)

---

### 4. Auto Top-Up (PR #5)

- [x] `.autotopup.json` created/updated on save
- [x] Auto top-up config returned with Fleet canister entries
- [x] Auto top-up config returned with per-project canister statuses
- [ ] Auto top-up modal opens from Canisters tab and Fleet tab
- [ ] Can set threshold (minimum cycles) and top-up amount
- [ ] Save persists — Auto badge appears after save
- [ ] Config survives page reload

---

### 5. Top-Up Validation (PR #7)

- [x] Top-up amount > cycles balance: blocked client-side with warning message
- [x] Switching source to ICP clears the over-balance block
- [x] Submit button disabled when over-balance
- [x] CLI failure reason included in error toast (not just "Top-up failed")
- [x] Error toast stays visible for 9s (vs 4s for success)
- [ ] Warning message renders in modal UI
- [ ] Submit button visibly disabled when over-balance
- [ ] Error toast shows CLI reason on failure

---

### 6. Canister Status

- [x] Running/Stopped/Stopping status parsed correctly
- [x] Cycles balance parsed (BigInt-safe)
- [x] Memory usage parsed
- [x] Controllers list parsed
- [x] Freezing threshold parsed
- [x] Asset canisters: hashMatch=null (no WASM comparison possible)
- [ ] Cycles health bars color-coded: great (>1T green), good (>100B blue), low (>10B yellow), critical (<10B red)
- [ ] Single-controller warning shown
- [ ] Freezing threshold warning shown

---

### 7. Cycles Top-Up (existing)

- [x] Negative amount rejected
- [x] Top-up history stored and returned
- [-] Actual top-up to mainnet: skipped (consumes ICP)
- [ ] Top-up button on canister cards
- [ ] Top-up modal: amount input, source toggle (ICP/cycles), balance displays

---

### 8. Identity Management

- [x] Identity list returned
- [x] Switch identity works
- [x] Export identity works
- [ ] Identity dropdown in UI
- [ ] Principal updates in header after switch

---

### 9. Snapshots

- [x] List snapshots API works
- [-] Create/restore/delete: skipped (requires stopped canister)
- [ ] Snapshots tab renders: canister selector, empty state
- [ ] Snapshot list renders when snapshots exist

---

### 10. Security

- [x] Canister/network/identity names with injection chars rejected
- [x] Path traversal blocked
- [x] Missing CSRF header → 403
- [x] Cross-origin request → 403
- [x] All CLI calls use spawn with argument arrays (no shell interpolation)

---

## Test History

| Date | Tester | What was tested | Result |
|---|---|---|---|
| 2026-03-22 | Chris | Project load, canisters tab, canister status cards | Passed |
| 2026-03-25 | Claude | Staging profiles, deploy history, network selector | API only |
| 2026-03-27 | Claude | Bug fixes (9 bugs), build toggle, top-up, controllers | API only |
| 2026-03-27 | Chris | ICP balance, folder browser, canister status on cleardeck | Passed |
| 2026-03-28 | Claude | Full API test suite: 47 tests, 5 bugs found & fixed | Passed |
| 2026-03-30 | Claude | Full API re-test: 49 endpoints across 3 projects | Passed |
| 2026-06-03 | Claude | Auto top-up (PR #5) — API and browser verified | Passed |
| 2026-06-03 | Claude | Fleet tab (PR #6) — API verified: 25 canisters, 8 projects | Passed |
| 2026-06-10 | Claude | Top-up validation (PR #7) — browser verified all 3 states | Passed |
| 2026-06-19 | Claude | Babel 8 blank screen — reproduced and fixed (pinned to @7) | Fixed |
| 2026-06-24 | Claude | Fleet inaccessible canisters — root cause: recipe v2.1.0 panic | Diagnosed |
