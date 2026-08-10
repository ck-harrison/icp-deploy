# ICP Deploy — Test Plan

**Last updated:** 2026-08-10
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
| **Fleet tab** | x | **needs test** | Added PR #6 — see known issues |
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
- [x] Default tier derives from network: `ic` → production, custom environment → staging
- [x] `POST /api/fleet/tier` moves a canister and persists under `fleetTiers[path][network][canister]`
- [x] `tier: 'default'` clears the override and prunes emptied branches back to `{}`
- [x] Rejects an invalid tier, a path outside `$HOME`, and an unsafe canister name; missing `X-Requested-With` → 403
- [x] Move button round-trips in the browser: 25/3 → 24/4 → 25/3, updating counts in place with no rescan and no console errors
- [x] Override survives a full page reload (fresh load: `frontend-staging` absent from Production, present in Staging)
- [x] Reclassified rows show a `moved` chip; every row shows its real network badge
- [x] Staging column warns when rows are on `ic` (verified: "1 of these is on ic — real mainnet cycles")
- [x] Newly deployed canisters are picked up without a restart (verified inadvertently: `backend-staging` appeared mid-session and scanned correctly)
- [x] Top-up modal on a staging row populates both identity balances (verified: `33.6088 ICP` / `7.74B cycles`; previously blank because the balance calls failed and were swallowed by `.catch(() => {})`)
- [x] Balance calls from a staging row send `path` so the environment resolves (verified in Chrome 2026-08-06 against the project then named `Tribez`, since renamed to `ClubHuman`)
- [x] A recent-project path that no longer exists returns `Project path no longer exists: <path>` instead of `{"error":""}` (verified 2026-08-10 against the archived `Tribez` path; `assertProjectDir` at `server.js:148`)
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
