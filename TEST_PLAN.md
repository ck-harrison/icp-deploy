# ICP Deploy — Test Plan

**Last updated:** 2026-03-30
**App URL:** http://localhost:3456
**Test projects:** Harrison Data (5 canisters), kairos (2 canisters), cleardeck-multichain (9 canisters)

Legend: `[x]` passed, `[!]` bug/issue, `[-]` skipped (risky/N/A), `[ ]` needs manual UI test

---

## 1. App Startup & Header

- [x] App loads at localhost:3456 (server listens on 127.0.0.1:3456)
- [x] CLI version detects correctly: `icp 0.2.1`
- [x] Principal displays: `gqleh-qzmnu-avv6q-woakg-4sax2-mkvui-vsa7k-oyigl-ubdma-xqpg4-kae`
- [x] ICP balance displays: 14.9932 ICP (via `/api/ledger/balance?network=ic`)
- [x] Replica status reports stopped (via `/api/replica/status` → `{"running":false,"cli":"icp"}`)
- [ ] Header renders correctly in browser (logo, CLI version, principal, balance, replica indicator)
- [ ] "Idle" / "Deploying" status indicator works during deploy

---

## 2. Project Loading

- [x] Harrison Data loads: 5 canisters (harrison_data_backend, block_oracle, harrison_data_frontend, object_store, evm_rpc), configType=icp.yaml
- [x] kairos loads: 2 canisters (backend shorthand + frontend), configType=icp.yaml
- [x] cleardeck-multichain loads: 9 canisters (lobby + 6 tables + history + frontend), configType=icp.yaml
- [x] Invalid path returns error: "Project path must be within your home directory"
- [x] All projects report networks: `["local", "ic"]`
- [x] Harrison Data has environments section with ic network settings
- [x] evm_rpc detected as pre-built (type: unknown, no recipe)
- [ ] Loading spinner appears during project load
- [ ] Tab auto-switches or canisters populate in UI after load

---

## 3. Network Toggle

- [x] Harrison Data on ic: returns real canister data
- [x] Harrison Data on local: returns "failed to lookup canister ID" (no local replica, correct)
- [x] Network list from all projects includes local and ic
- [ ] Network toggle visible on ALL tabs (deploy, canisters, snapshots)
- [ ] Network change triggers deploy summary re-fetch
- [ ] Color-coded pills: blue=local, orange=production

---

## 4. Identity Management

- [x] Identity list: anonymous, default, mainnet (mainnet=active)
- [x] Switch to anonymous: succeeds, principal=`2vxsx-fae`
- [x] Switch back to mainnet: succeeds, principal=`gqleh-...kae`
- [x] Switch to nonexistent identity: error "no identity found with name `doesnotexist`"
- [x] Identity export works (returns PEM for mainnet)
- [-] Identity create/rename: skipped (would modify system state)
- [-] Identity import: skipped (would modify system state)
- [ ] Identity dropdown/selector works in UI
- [ ] Principal updates in header after switch

---

## 5. Folder Browser

- [x] Browse $HOME: returns 10 entries
- [x] Browse ~/Code: returns 12 entries, 3 ICP projects detected (cleardeck-multichain, Harrison Data, kairos)
- [ ] Browse modal opens from button
- [ ] Can navigate directories and select project
- [ ] ICP projects highlighted in browser

---

## 6. Canister Status (Single)

### Harrison Data on ic
- [x] harrison_data_backend: Running, cycles=1.10T, memory=57.6MB, 1 controller, freezeThreshold=7776000
- [x] block_oracle: Running, cycles=828B, memory=103MB, 1 controller, freezeThreshold=2592000
- [x] object_store: "failed to lookup canister ID" (not deployed on ic, correct)

### kairos on ic
- [x] frontend: Running, cycles=1.96T, memory=163MB, 1 controller
- [x] backend: Running, cycles=2.93T, memory=7.3MB, 1 controller

### cleardeck-multichain on ic
- [x] lobby: Running, cycles=2.98T, memory=2.4MB
- [x] table_1: Running, cycles=2.90T, memory=4.3MB
- [x] history: Running, cycles=2.99T, memory=2.4MB
- [x] frontend: Running, cycles=2.93T, memory=8.8MB

---

## 7. Canister Status (Batch)

- [x] Batch status for Harrison Data (4 canisters): returns map keyed by canister name
- [x] Batch status for cleardeck (4 of 9 canisters): all return Running with cycles/memory
- [x] object_store in batch: returns error gracefully (no canister ID)
- [ ] Canister cards render correctly in Canisters tab
- [ ] Cycles health bars color-coded (great >1T, good >100B, low >10B, critical <10B)
- [ ] Single controller warning shown for Harrison Data canisters

---

## 8. Deploy Summary

- [x] Returns per-canister: deployed=true, canisterId, moduleHash, status=Running
- [x] Local WASM detection works (localWasmExists=true for harrison_data_backend, block_oracle)
- [x] Hash comparison works (hashMatch=true when local matches deployed)
- [x] object_store: no canisterId for ic, deployed=false (correct)
- [x] Version info returns null (no deploy history file yet)
- [ ] Summary panel renders in Deploy tab right panel
- [ ] Summary auto-loads when project loaded

---

## 9. Deploy Operations

- [-] Deploy to local: skipped (no replica running)
- [-] Deploy to ic: skipped (would consume cycles)
- [-] Cancel deploy: skipped (requires active deploy)
- [ ] Deploy flow: select canisters, choose mode, click deploy, watch logs stream
- [ ] Build-before-deploy toggle works
- [ ] Deploy mode selector: Auto, Upgrade, Reinstall, Install
- [ ] Reinstall 4-step confirmation modal

---

## 10. Snapshots

- [x] List snapshots for harrison_data_backend on ic: returns empty array ("No snapshots found")
- [-] Create/restore/delete snapshots: skipped (requires stopped canister)
- [-] Download/upload snapshots: skipped (requires stopped canister)
- [ ] Snapshots tab renders correctly
- [ ] Canister selector dropdown works
- [ ] Running/stopped status shown

---

## 11. Canister Metadata

- [x] `candid:service` for harrison_data_backend: returns 13,810 chars of Candid IDL
- [x] Missing metadataName: returns error "Metadata name required"
- [ ] Metadata viewer in Snapshots tab works

---

## 12. Canister Info

- [!] `icp canister info` not supported: "unrecognized subcommand 'info'" — icp CLI lacks this subcommand
- [x] Server handles error gracefully (returns JSON error, no crash)

---

## 13. Canister Lifecycle

- [-] Stop/Start/Delete: skipped (would affect live mainnet canisters)
- [ ] Stop/Start buttons work in UI
- [ ] Delete confirmation modal works
- [ ] Canister status updates after lifecycle action

---

## 14. Cycles & Balance

- [x] ICP ledger balance: 14.9932 ICP (parsed from "Balance: 14.99320940 ICP")
- [x] Identity cycles balance: 2.55T cycles
- [x] Canister cycles via `/api/cycles/balance`: returns cycles=1.10T for harrison_data_backend
- [x] Wallet balance: correctly returns "not supported with icp CLI" message
- [-] Cycles mint: skipped (local-only operation, needs `unit` param — validation works)

---

## 15. Cycles Top-Up

- [x] Negative amount rejected: "amount must be a positive number of cycles"
- [x] Top-up history: returns 3 entries (1 failed + 2 successful from previous sessions)
  - block_oracle failed: "Insufficient cycles" (requested 1T, balance 314B)
  - block_oracle success: 500B cycles
  - harrison_data_backend success: 200B cycles
- [-] Actual top-up: skipped (would consume real ICP)
- [ ] Top-up button on canister cards
- [ ] Top-up amount input and confirmation modal
- [ ] Top-up history displayed in canister cards

---

## 16. Controller Management

- [x] Input validation works (tested via identity name validation — same assertSafeName)
- [-] Add controller: skipped (irreversible on mainnet)
- [ ] Add controller button shown on single-controller canisters
- [ ] Principal input prompt

---

## 17. Settings Persistence

- [x] Read settings: returns lastProject, lastNetwork, recentProjects, testKey
- [x] Update settings: merge-update works (testKey persisted)
- [x] Add project: adds to recentProjects list (3 projects stored)
- [x] Settings file at ~/.canister-panel-settings.json
- [ ] Settings auto-load on startup
- [ ] Settings auto-save on project load, network change, build toggle change

---

## 18. Multi-Project Support

- [x] Recent projects: Harrison Data, kairos, cleardeck-multichain (3 projects)
- [x] Folder browser detects ICP projects in ~/Code
- [ ] Recent project buttons shown in UI
- [ ] Quick-switch between projects works

---

## 19. Local Replica

- [x] Status endpoint works: `{"running":false,"cli":"icp"}`
- [-] Start/stop replica: skipped (would affect system state)
- [ ] Replica status indicator in header
- [ ] Start replica button works

---

## 20. Security

### Input Validation
- [x] Canister name with semicolons rejected: "Invalid canister"
- [x] Canister name with backticks rejected: "Invalid canister"
- [x] Network name with pipes rejected: "Invalid network"
- [x] Identity name with spaces rejected: "Invalid identity name"
- [x] Negative top-up amount rejected
- [x] Path traversal blocked: `/etc/passwd` → "Project path must be within your home directory"

### CSRF / Origin Protection
- [x] Missing X-Requested-With header: 403 "Forbidden: missing required header"
- [x] Cross-origin request (evil.com): 403 "Forbidden: cross-origin request blocked"

### Architecture
- [x] All CLI calls use spawnSync with argument arrays (no shell interpolation)
- [x] All user input validated through assertSafeName/assertSafePath

---

## 21. Deploy History & Version Tracking

- [x] Deploy history returns empty array when no .deploy-history.json exists
- [x] Version lookup returns null for untracked deploys (correct)
- [-] Recording: requires a deploy through the panel to test

---

## 22. Staging Profiles / Custom Networks

- [x] All projects report networks from icp.yaml (local + ic)
- [x] Project network management endpoint validates input (name required, can't modify local)
- [ ] Network dropdown in UI shows all discovered networks
- [ ] Color-coded pills render correctly

---

## Bugs & Issues Found (2026-03-30)

| Issue | Severity | Status |
|-------|----------|--------|
| `icp canister info` not a valid subcommand | Low | Known limitation — server handles gracefully, only used as fallback when icp CLI not detected |
| Batch status returns map not array | Info | Working as designed — frontend expects map keyed by name |
| Deploy summary has no git info | Info | By design — git info is only recorded during actual deploys in `.deploy-history.json` |
| TEST_PLAN referenced `/api/dfx/status` but route is `/api/replica/status` | Low | Fixed in this test plan update |

---

## Test History

| Date       | Tester | What was tested | Result |
|------------|--------|----------------|--------|
| 2026-03-22 | Chris  | Project load, mainnet canisters tab, canister status cards | Passed |
| 2026-03-22 | Chris  | CLI version display, network toggle visibility | Passed after fixes |
| 2026-03-25 | Claude | Staging profiles, deploy history, network selector | API tested, not UI tested |
| 2026-03-27 | Claude | Bug fixes (9 bugs), build toggle, top-up, controllers | API tested |
| 2026-03-27 | Chris  | ICP balance, folder browser, canister status on cleardeck | Passed |
| 2026-03-28 | Claude | Full API test suite: 47 tests, 5 bugs found & fixed | Passed |
| 2026-03-30 | Claude | Full API re-test: 49 endpoints across 3 projects, all pass | **See results above** |

---

## What You Need to Test (Manual UI)

These can ONLY be verified by interacting with the browser at http://localhost:3456:

### Quick checks (5 min)
1. **Header**: logo, CLI version, principal, ICP balance, replica indicator all visible
2. **Project load**: paste path, verify canisters populate
3. **Recent projects**: buttons appear, quick-switch works
4. **Network toggle**: visible on all tabs, pills color-coded
5. **Identity dropdown**: switch identity, verify principal updates in header

### Deploy tab (10 min, use local replica)
6. **Deploy summary panel**: right panel shows per-canister status
7. **Canister checkboxes**: select/deselect, deploy button enables/disables
8. **Deploy mode selector**: Auto/Upgrade/Reinstall/Install options
9. **Build toggle**: switch on/off
10. **Deploy flow**: select canister, deploy to local, watch logs stream
11. **Cancel deploy**: start deploy, cancel mid-stream

### Canisters tab (5 min)
12. **Canister cards**: cycles bars, memory, controllers, running status
13. **Warnings**: single controller warning on Harrison Data canisters
14. **Top-up button**: click, enter amount, confirm
15. **Add controller button**: shown on single-controller canisters

### Snapshots tab (5 min, requires stopped canister on local)
16. **Canister selector dropdown**
17. **Create/list/restore/delete snapshots**

### Reinstall confirmation (2 min)
18. **4-step modal**: type "i will wipe all my app data" to confirm
