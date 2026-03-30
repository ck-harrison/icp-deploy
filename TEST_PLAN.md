# Canister Control Panel — Test Plan

**Last updated:** 2026-03-28
**App URL:** http://localhost:3456
**Test projects:** Harrison Data, cleardeck-multichain, kairos

Legend: `[x]` passed, `[!]` failed/broken, `[-]` skipped/N/A, `[ ]` not tested (needs manual UI test)

---

## 1. App Startup & Header

- [x] App loads at localhost:3456 without console errors (HTTP 200)
- [x] Header shows "ICP Deploy" branding with logo
- [x] CLI version displays correctly ("icp 0.2.1")
- [x] Principal displays in header when identity is active (gqleh-...4-kae)
- [x] ICP balance displays in header (17.9934 ICP)
- [x] Replica status indicator shows (gray = stopped, green = running)
- [ ] "Idle" / "Deploying" status indicator works (needs deploy test)

---

## 2. Project Loading

- [x] Type a valid project path → project loads, canisters populate (Harrison Data: 5 canisters, cleardeck: 9 canisters)
- [x] Type an invalid path → error message shown ("No icp.yaml or dfx.json found")
- [x] Browse button opens folder browser modal (returns entries from $HOME)
- [x] Folder browser: can navigate directories (~/Code shows 12 folders, 3 ICP projects detected)
- [-] dfx.json projects load correctly (no dfx.json projects available — all migrated to icp.yaml)
- [x] icp.yaml projects load correctly (both Harrison Data and cleardeck load)
- [x] Remote/pull canisters (e.g. `evm_rpc`) detected and marked as external
- [ ] Loading spinner appears during project load (needs UI check)

---

## 3. Network Toggle (Global)

- [ ] Network toggle visible on ALL tabs (deploy, canisters, snapshots) — needs UI check
- [x] Switching Local ↔ Production updates canister statuses (verified via API: ic returns real data, local returns "not found")
- [x] Custom networks from icp.yaml populate (both projects show ['local', 'ic'])
- [ ] Network change triggers deploy summary re-fetch on Deploy tab — needs UI check

---

## 4. Identity Management

- [x] Identity list returns all identities (anonymous, default, mainnet)
- [x] Active identity marked correctly (mainnet = active)
- [x] Switching identity updates the principal (anonymous → 2vxsx-fae, mainnet → gqleh-...kae)
- [x] Switching to nonexistent identity returns error ("no identity found")
- [ ] Identity persists across tab switches — needs UI check

---

## 5. Deploy Tab — Left Panel

- [ ] Canister checkboxes shown for all owned (non-remote) canisters
- [ ] "Select All" / "Deselect All" works
- [ ] Remote/pull canisters NOT shown in deploy canister list
- [ ] Deploy mode selector: Auto, Upgrade, Reinstall, Install
- [ ] Deploy button enabled when ≥1 canister selected
- [ ] Deploy button disabled when 0 canisters selected
- [ ] Deploy button disabled during active deployment

### 5a-5d. Deploy Operations
- [-] Deploy tests skipped (would consume real cycles on mainnet, no local replica running)

---

## 6. Reinstall Quadruple Confirmation

- [-] Skipped (too dangerous to test automatically — requires UI interaction)

---

## 7. Deploy Summary Panel (Right Panel)

- [x] Summary endpoint returns canister info when canisterNames provided
- [x] Summary shows per-canister: canister ID from canister_ids.json
- [x] Git info: 10 recent commits returned, 9 dirty files detected
- [!] Summary returns empty canisters when canisterNames not provided (expected — UI must pass names)
- [!] object_store has no canister ID for 'ic' env — shows as not deployed (correct behavior)
- [ ] Summary auto-loads when project is loaded — needs UI check

---

## 8. Canisters Tab

- [x] Canister status fetches correctly for Harrison Data on ic (3/4 owned canisters return data)
- [x] Canister status fetches correctly for cleardeck on ic (all 9 canisters return data after init_args fix)

### 8a. Canister Cards (per owned canister)
- [x] Running status: all canisters report "Running"
- [x] Cycles balance: harrison_data_backend=1.44T, block_oracle=334B, lobby=2.98T
- [x] Memory usage: harrison_data_backend=57.5MB, block_oracle=103MB, lobby=2.4MB
- [x] Controllers: Harrison Data canisters have 1 controller each
- [!] object_store: "failed to lookup canister ID" — not deployed on ic (correct, canister_ids.json doesn't have it)

### 8b. Warnings
- [x] Single controller warning applicable (Harrison Data canisters have only 1 controller)
- [ ] Freeze threshold / critical cycles warnings — needs UI check (no canisters currently critical)

### 8c. Remote/External Canisters
- [x] evm_rpc returns canisterId (7hfb6-caaaa-aaaar-qadga-cai) and module hash but no cycles/memory (expected — not a controller)

### 8d. Lifecycle Actions
- [-] Stop/Start/Delete skipped (would affect live mainnet canisters)

---

## 9. Snapshots Tab

- [-] Skipped (requires stopped canisters — too risky on mainnet)

---

## 10. Local Replica Management

- [x] Replica status correctly reports "stopped" (running: false)
- [-] Start/stop replica skipped (would affect system state)

---

## 11. Error Handling

- [x] No project loaded → empty states (empty canister list)
- [x] Invalid canister name → validation error returned
- [x] Invalid network name → validation error returned
- [!] **BUG FOUND & FIXED:** Network validation in `/api/canister/status` threw unhandled error (HTML stack trace instead of JSON). Fixed by wrapping `networkArgs()` in try/catch.
- [ ] Server not running → frontend shows connection error — needs UI check

---

## 12. Security

- [x] Canister name with semicolon rejected ("Invalid canister")
- [x] Canister name with backticks rejected ("Invalid canister")
- [x] Network name with pipe rejected ("Invalid network")
- [x] Identity name with spaces rejected ("Invalid identity name")
- [x] Missing required fields → proper error messages
- [x] Negative top-up amount rejected
- [x] All CLI calls use spawnSync with argument arrays (verified in code)

---

## 13. Staging Profiles & Version Tracking

### 13a. Network Selector
- [x] Both projects show ['local', 'ic'] networks from icp.yaml
- [ ] UI shows "Local" and "Production" pills — needs UI check

### 13b. Deploy History
- [-] No deploy history files exist yet (no deploys done through the panel)
- [x] Deploy history endpoint returns empty array gracefully when no file exists

---

## 14. Build Before Deploy
- [-] Skipped (requires deploy — would consume cycles)

---

## 15. Cycles Top-Up
- [x] Top-up endpoint validates inputs (missing amount, negative amount both rejected)
- [-] Actual top-up skipped (would consume real ICP)
- [x] Top-up history endpoint returns empty array when no history exists
- [x] Top-up recording code in place (will create .topup-history.json on first top-up)

---

## 16. Controller Management
- [x] Add controller validates principal format
- [-] Actual controller add skipped (irreversible on mainnet)

---

## 17. Multi-Project Support
- [x] Recent projects stored: cleardeck-multichain, Harrison Data
- [x] Folder browser finds 3 ICP projects in ~/Code (cleardeck-multichain, Harrison Data, kairos)

---

## 18. Settings Persistence
- [x] Last project path saved (/Users/christopher.harrison/Code/cleardeck-multichain)
- [x] Last network saved (ic)
- [x] Recent projects saved with timestamps
- [x] Settings file exists at ~/.canister-panel-settings.json

---

## 19. ICP Balance (NEW — 2026-03-27)
- [x] `/api/ledger/balance` returns balance via `icp token balance -n ic`
- [x] Balance correctly parsed from "Balance: 17.99340940 ICP" format
- [x] Balance with `?network=ic` param works
- [x] Balance displays in header (18.9935 ICP → verified in screenshot)
- [x] Balance refreshes on identity switch

---

## 20. Top-Up History (NEW — 2026-03-28)
- [x] `readTopupHistory` returns empty array when no file exists
- [x] `recordTopup` code integrated into top-up endpoint
- [x] `/api/topup-history` endpoint returns history array
- [-] Actual recording not yet tested (no top-ups performed)
- [ ] UI display in canister cards — needs UI check after first top-up

---

## 21. icp.yaml init_args Migration (NEW — 2026-03-27)
- [x] Migrated cleardeck-multichain from `init_args: text: '...'` to `init_args: '...'`
- [x] All 6 table canisters' init_args converted
- [x] icp CLI successfully parses manifest after migration
- [x] Canister status works for all cleardeck canisters on ic

---

## Bugs Found & Fixed This Session

| Bug | Status |
|-----|--------|
| `icp` CLI uses `token balance` not `ledger balance` | Fixed |
| `icp token balance` needs `-n ic` not `-e ic` for standalone use | Fixed |
| Memory regex matched "Memory allocation: 0" instead of "Memory size: X" | Fixed |
| Network validation error in `/api/canister/status` returned HTML stack trace | Fixed |
| cleardeck `init_args: text:` format not supported by icp CLI | Fixed (migrated icp.yaml) |

---

## Test History

| Date       | Tester | What was tested | Result |
|------------|--------|----------------|--------|
| 2026-03-22 | Chris  | Project load (Harrison Data), Mainnet canisters tab, canister status cards, cycles/warnings display | Passed — identified evm_rpc external canister issue |
| 2026-03-22 | Chris  | CLI version display, network toggle visibility | Passed after fixes |
| 2026-03-22 | Claude | Remote canister detection, deploy summary endpoint, reinstall modal | Code written, not user-tested |
| 2026-03-25 | Claude | Staging profiles, deploy history, dynamic network selector | Code written, API tested via curl, not user-tested |
| 2026-03-27 | Claude | Bug fixes (9 bugs), build toggle, top-up, controllers, recent projects, settings | Code written, API tested via curl |
| 2026-03-27 | Chris  | ICP balance display, folder browser, canister status on cleardeck | Passed after init_args fix |
| 2026-03-28 | Claude | Full API test suite: 47 tests across all endpoints, 5 bugs found & fixed | See results above |

---

## What Still Needs Manual UI Testing

These items can only be verified by interacting with the browser UI:

1. **Deploy flow** — select canisters, click deploy, watch logs stream (test on local replica first)
2. **Reinstall modal** — 4-step confirmation flow
3. **Snapshots tab** — create/restore/download/delete (requires stopped canister)
4. **Top-up history display** — perform a top-up and verify history appears in canister card
5. **Deploy summary auto-refresh** — switch networks and verify summary updates
6. **Cancel deploy** — start a deploy and cancel mid-stream

---

## Notes
- All projects now use icp.yaml (no dfx.json projects to test)
- object_store canister not in canister_ids.json for ic — expected
- No local replica running — local deploy/snapshot tests require `icp network start`
- Deploy/top-up tests consume real cycles — test on local first
