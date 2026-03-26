# Canister Control Panel — Test Plan

**Last updated:** 2026-03-22
**App URL:** http://localhost:3456
**Test project:** Harrison Data (`/Users/christopher.harrison/Code/Harrison Data/`)

Legend: `[ ]` not tested, `[x]` passed, `[!]` failed/broken, `[-]` skipped/N/A

---

## 1. App Startup & Header

- [ ] App loads at localhost:3456 without console errors
- [ ] Header shows "ICP Deploy" branding with logo
- [ ] CLI version displays correctly (e.g. "dfx 0.31.0", not "dfx dfx 0.31.0")
- [ ] Principal displays in header when identity is active
- [ ] Replica status indicator shows (green = running, gray = stopped)
- [ ] "Idle" / "Deploying" status indicator works

---

## 2. Project Loading

- [ ] Type a valid project path → project loads, canisters populate
- [ ] Type an invalid path → error message shown
- [ ] Browse button opens folder browser modal
- [ ] Folder browser: can navigate directories, select a folder, modal closes
- [ ] dfx.json projects load correctly (canister names, types, dependencies)
- [ ] icp.yaml projects load correctly (if available to test)
- [ ] Remote/pull canisters (e.g. `evm_rpc`) detected and marked as external
- [ ] Loading spinner appears during project load

---

## 3. Network Toggle (Global)

- [ ] Network toggle visible on ALL tabs (deploy, canisters, snapshots)
- [ ] Switching Local ↔ Mainnet updates the badge/indicator everywhere
- [ ] Switching to Mainnet and viewing Canisters tab shows mainnet statuses
- [ ] Switching to Local and viewing Canisters tab shows local statuses (or errors if not deployed locally)
- [ ] Network change triggers deploy summary re-fetch on Deploy tab

---

## 4. Identity Management

- [ ] Identity dropdown lists all dfx identities
- [ ] Active identity marked with "(current)" suffix
- [ ] Switching identity updates the principal in the header
- [ ] Identity persists across tab switches

---

## 5. Deploy Tab — Left Panel

- [ ] Canister checkboxes shown for all owned (non-remote) canisters
- [ ] "Select All" / "Deselect All" works
- [ ] Remote/pull canisters NOT shown in deploy canister list
- [ ] Deploy mode selector: Auto, Upgrade, Reinstall, Install
- [ ] Deploy button enabled when ≥1 canister selected
- [ ] Deploy button disabled when 0 canisters selected
- [ ] Deploy button disabled during active deployment

### 5a. Deploy to Local
- [ ] Click Deploy with Local network → deploy starts
- [ ] Live logs stream in right panel (auto-switches to Logs tab)
- [ ] Deploy completes → status shows "success"
- [ ] Deploy fails → status shows "error" with stderr output

### 5b. Deploy to Mainnet
- [ ] Click Deploy with Mainnet → confirmation modal appears
- [ ] Confirmation modal shows canister count and "MAINNET" warning
- [ ] Cancel confirmation → deploy does not start
- [ ] Confirm → deploy proceeds, logs stream

### 5c. Deploy Modes
- [ ] Auto mode: deploys normally
- [ ] Upgrade mode: passes `--mode upgrade`
- [ ] Install mode: passes `--mode install`
- [ ] Reinstall mode: opens 4-step ReinstallConfirmModal (see section 6)

### 5d. Cancel Deploy
- [ ] Cancel button appears during active deploy
- [ ] Clicking Cancel stops the deployment
- [ ] Status changes to "cancelled"
- [ ] Can start a new deploy after cancellation

---

## 6. Reinstall Quadruple Confirmation

- [ ] Step 1: "DANGER: Reinstall Mode Selected" — lists consequences, "I understand the risk" button
- [ ] Step 2: "Are you absolutely sure?" — shows canister count, mainnet warning if applicable, "Yes, I am sure"
- [ ] Step 3: "Final safety check" — must type "i will wipe all my app data" exactly
  - [ ] Button disabled until phrase matches
  - [ ] Mismatch warning shown if text doesn't match
  - [ ] Case-insensitive matching works
- [ ] Step 4: "LAST CHANCE — Point of no return" — red "WIPE DATA AND REINSTALL" button
- [ ] Step progress bar fills correctly (1-4)
- [ ] "Back" button works on steps 2-4
- [ ] "Cancel" button available on every step
- [ ] Cancel at any step → deploy does NOT start
- [ ] Completing all 4 steps → deploy starts with reinstall mode
- [ ] On mainnet: step 2 shows "PRODUCTION environment" extra warning

---

## 7. Deploy Summary Panel (Right Panel)

- [ ] Right panel has Summary / Logs sub-tabs
- [ ] Summary tab selected by default
- [ ] Summary auto-loads when project is loaded
- [ ] Summary auto-refreshes when network changes
- [ ] Summary shows per-canister:
  - [ ] Canister name and ID (or "Not deployed")
  - [ ] Module hash (deployed)
  - [ ] Running status
  - [ ] Local WASM exists indicator
- [ ] Summary shows git info:
  - [ ] Recent commits (last 5)
  - [ ] Uncommitted changes count
  - [ ] Diff stats
- [ ] Clicking Deploy → panel auto-switches to Logs tab
- [ ] Can manually switch back to Summary during/after deploy

---

## 8. Canisters Tab

- [ ] Tab shows "Canister Status" heading with canister count and network
- [ ] "Refresh All" button fetches status for all owned canisters
- [ ] Loading state shown during fetch

### 8a. Canister Cards (per owned canister)
- [ ] Canister name and type badge (rust, assets, custom)
- [ ] Canister ID displayed
- [ ] Running status indicator (green "Running" / red "Stopped")
- [ ] Cycles balance with formatted number (e.g. "1.47T", "63.99B")
- [ ] Cycles health bar with color coding:
  - [ ] Green "Healthy" (>1T)
  - [ ] Blue "Good" (>100B)
  - [ ] Yellow "Running low" (>10B)
  - [ ] Red "Critical" (<10B)
- [ ] Memory usage shown
- [ ] Module hash (truncated)
- [ ] Freeze threshold shown
- [ ] Controllers list (truncated)
- [ ] Dependencies shown if applicable

### 8b. Warnings
- [ ] Single controller warning (yellow) shown when only 1 controller
- [ ] Freezing threshold warning shown when < 90 days
- [ ] Critical cycles warning shown when cycles < 10B

### 8c. Remote/External Canisters
- [ ] External canisters shown with dimmed styling
- [ ] "External" badge displayed
- [ ] Canister ID shown (hardcoded from config)
- [ ] No Stop/Start/Delete/Refresh buttons
- [ ] No status fetch attempted (no error)

### 8d. Lifecycle Actions
- [ ] Stop button → confirmation modal → canister stops
- [ ] Start button → canister starts (appears when stopped)
- [ ] Delete button → confirmation modal → canister deleted
- [ ] Refresh button → re-fetches single canister status

---

## 9. Snapshots Tab

- [ ] Tab visible and accessible
- [ ] Canister selector dropdown populated with owned canisters
- [ ] Selecting a canister shows its status (running/stopped)

### 9a. Create Snapshot
- [ ] "Create Snapshot" button creates a new snapshot
- [ ] Success message shown with snapshot ID
- [ ] Error shown if canister is running (must be stopped first)

### 9b. List Snapshots
- [ ] Snapshots listed with IDs and timestamps
- [ ] Empty state shown when no snapshots exist

### 9c. Restore Snapshot
- [ ] "Restore" button on a snapshot → confirmation → loads snapshot
- [ ] Success/error feedback

### 9d. Download Snapshot
- [ ] "Download" button → prompts for save path → downloads
- [ ] Error handling for invalid path

### 9e. Upload Snapshot
- [ ] Upload section with path input
- [ ] Upload from valid path succeeds

### 9f. Delete Snapshot
- [ ] "Delete" button → confirmation → removes snapshot
- [ ] Snapshot disappears from list

### 9g. Metadata Viewer
- [ ] "View Metadata" section
- [ ] Can view candid:service, candid:args, dfx metadata keys
- [ ] Error handling for canisters without metadata

---

## 10. Local Replica Management

- [ ] Replica status shown in header (green dot / gray dot)
- [ ] Start replica button works (when stopped)
- [ ] After starting, status updates to "running"
- [ ] Stop replica endpoint exists

---

## 11. Error Handling

- [ ] No project loaded → appropriate empty states on each tab
- [ ] dfx not installed → graceful error (not a crash)
- [ ] Network timeout → error shown, not infinite spinner
- [ ] Invalid canister name in API call → validation error returned
- [ ] Server not running → frontend shows connection error

---

## 12. Security

- [ ] All CLI calls use spawnSync with argument arrays (no string interpolation)
- [ ] assertSafeName validates all user-provided names
- [ ] No command injection possible via canister names, paths, or identity names
- [ ] Mainnet deploy requires confirmation
- [ ] Reinstall requires 4-step confirmation with type-to-confirm

---

## 13. Staging Profiles & Version Tracking

### 13a. Network Selector
- [ ] Network selector shows "Local" and "Production" for Harrison Data project
- [ ] Adding a "staging" network to dfx.json shows "Staging" in the network selector
- [ ] Switching networks updates all tabs (Deploy, Canisters, Snapshots)
- [ ] Deploy button text updates per selected network
- [ ] Confirmation modal text updates per selected network
- [ ] Non-local network warning banner shown when staging or production selected

### 13b. Deploy History
- [ ] Deploy to local creates/updates `.deploy-history.json` in project root
- [ ] Deploy summary shows version info (commit, branch, date, dirty flag) after deploy
- [ ] Canister status cards show version info (commit, branch, date) when module hash matches history
- [ ] "no deploy history" shown for existing mainnet deployments without history entries

---

## Test History

| Date       | Tester | What was tested | Result |
|------------|--------|----------------|--------|
| 2026-03-22 | Chris  | Project load (Harrison Data), Mainnet canisters tab, canister status cards, cycles/warnings display | Passed — identified evm_rpc external canister issue |
| 2026-03-22 | Chris  | CLI version display, network toggle visibility | Passed after fixes |
| 2026-03-22 | Claude | Remote canister detection, deploy summary endpoint, reinstall modal | Code written, not user-tested |
| 2026-03-25 | Claude | Staging profiles, deploy history, dynamic network selector | Code written, API tested via curl, not user-tested |

---

## Notes
- Snapshot operations require canister to be stopped first
- Reinstall is the most dangerous operation — test on local before mainnet
- evm_rpc is a pull dependency (not owned) — should show as External
- Deploy summary uses git commands — project must be a git repo for full info
