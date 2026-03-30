# Canister Control Panel - Project Context

## What This Is
A local developer tool (React UI + Express backend) for managing ICP (Internet Computer Protocol) canister deployments. A UI wrapper around `dfx` (and future `icp`) CLI commands. Originally called "ICP Deploy Dashboard" — renamed to "Canister Control Panel" to reflect broader scope beyond just deploying.

## Architecture
- **Runs locally** on your machine (localhost:3456)
- **Deploys TO** local replica OR mainnet (user's choice)
- NOT a hosted web app — dfx needs access to local filesystem identities/keys
- No authentication needed — it reads the user's local dfx identity
- Distribution model: downloadable app (`clone repo + npm start`)

## Technical Stack
- **Backend**: Express.js (`server.js`, ~805 lines), spawns `dfx` as child process, streams stdout via WebSocket
- **Frontend**: Single-file React app (`public/index.html`, ~1700+ lines) using CDN React 18 + Babel + Tailwind
- **Dependencies**: express ^4.21.0, ws ^8.18.0 (minimal)
- **Startup**: `node server.js` → open http://localhost:3456

## Features Built (as of 2026-03-27)

### Security
- **Command injection prevention**: All CLI calls use `spawnSync` with argument arrays (never string interpolation)
- **Input validation**: `assertSafeName()` regex validation on all user-provided names
- **Mainnet deploy confirmation**: Modal confirmation before deploying to IC mainnet
- **Reinstall quadruple confirmation**: 4-step modal with type-to-confirm ("i will wipe all my app data") before reinstall deploys

### CLI & Identity
- **Dual CLI support**: Detects `dfx` vs `icp` CLI, maps argument differences (`--network ic` vs `-e ic`, etc.)
- **Identity management**: List identities, switch active identity, display current principal
- **CLI version display**: Shows detected CLI and version in header

### Project Loading
- **Folder picker**: Text input + browse modal to select ICP project folder
- **dfx.json parsing**: Reads canister definitions (name, type, dependencies, remote config)
- **icp.yaml parsing**: Basic line-based parser for new ICP CLI project format
- **Remote canister detection**: Canisters with `remote` or `type: "pull"` shown as external dependencies, excluded from deploy/status operations

### Deploy Tab
- **Network toggle** (global): Local vs Mainnet, available across all tabs
- **Canister selection**: Checkboxes to pick which canisters to deploy (excludes remote/external)
- **Deploy modes**: Auto (default), Upgrade (preserve state), Reinstall (wipe state), Install (new only)
- **Live log streaming**: Real-time stdout/stderr from dfx via WebSocket
- **Cancel deploy**: Stop a running deployment
- **Deploy summary panel**: Right panel with Summary/Logs sub-tabs
  - Summary: Per-canister deployment status (deployed/not, canister ID, module hash, running status, local WASM availability), git recent commits, uncommitted changes, diff stats
  - Logs: Live deploy output
  - Auto-fetches summary on project load and network change
  - Auto-switches to Logs when deploy starts

### Canisters Tab
- **Canister status cards**: Per-canister display of cycles balance, running status, memory, module hash, controllers, freeze threshold
- **Cycles health indicators**: Color-coded bars (great >1T, good >100B, low >10B, critical <10B)
- **Warnings**: Single controller lockout risk, low freezing threshold (<90 days), critical cycles
- **Lifecycle actions**: Stop, Start, Delete canisters (with confirmation modals)
- **Refresh All**: Batch status fetch for all owned canisters
- **Remote canisters**: Displayed as dimmed "External" cards with fixed canister ID, no status fetch attempted

### Snapshots Tab
- **Canister selector**: Dropdown to pick canister for snapshot operations
- **Create snapshots**: One-click snapshot creation
- **List snapshots**: Shows all snapshots with IDs and timestamps
- **Restore/Load**: Load a snapshot back into a canister
- **Download/Upload**: Export snapshot to filesystem, import from path
- **Delete snapshots**: Remove individual snapshots
- **Metadata viewer**: View canister metadata (candid:service, candid:args, dfx)
- **Canister status awareness**: Shows whether canister is running/stopped (snapshots require stopped state)

### Staging Profiles / Custom Networks
- **Dynamic network selector**: Replaces hardcoded Local/Mainnet toggle with a dropdown discovered from project config
- **Network auto-discovery**: Networks read from dfx.json "networks" section and canister_ids.json entries. Always includes "local"
- **Display names**: "local" shown as "Local", "ic" shown as "Production", custom networks shown capitalized
- **Color-coded pills**: Blue for local, orange for production, yellow for staging/custom networks
- **Deploy confirmation**: Required for any non-local network (not just mainnet)
- **Network-aware warnings**: Warning banners update based on selected network

### Deploy History / Version Tracking
- **Deploy history recording**: On each successful deploy, records an entry to `.deploy-history.json` in the project root with: canister name, network, module hash, git commit, git branch, git dirty flag, timestamp, deploy mode
- **Version info in deploy summary**: Deploy summary looks up on-chain module hash against deploy history to show version info (commit, branch, date, dirty flag)
- **Version info in canister cards**: Canister status cards show version info from deploy history when module hash matches
- **Graceful fallback**: Shows "no deploy history" for canisters deployed before this feature existed

### Build Before Deploy
- **Build toggle**: Toggle switch in deploy settings to run `icp build` before deploying (on by default)
- **Integrated build**: When enabled, deploy WebSocket streams build output before deploy output
- **Build failure handling**: If build fails, deploy is aborted with error status
- **Standalone build endpoint**: `POST /api/build` for building without deploying

### Cycles Top-Up
- **Top-up button**: On canister cards, button to add cycles to a canister
- **Amount input**: Prompt for cycles amount to add
- **Confirmation modal**: Shows amount and network before executing

### Controller Management
- **Add controller button**: Shown on canister cards with single controller (lockout risk)
- **Principal input**: Prompt for principal ID to add
- **Confirmation**: Shows truncated principal and network before executing

### Multi-Project Support
- **Recent projects**: Shows up to 5 recent projects as quick-switch buttons below project path
- **Auto-save**: Projects automatically saved to recent list when loaded
- **Quick load**: Click a recent project button to instantly load it

### Settings Persistence
- **Settings file**: `~/.canister-panel-settings.json` stores user preferences
- **Persisted settings**: Last project path, last network, build-before-deploy toggle, recent projects list
- **Auto-load**: Settings restored on app startup
- **Auto-save**: Settings saved when project loaded, network changed, or build toggle changed

### Local Replica
- **Status detection**: Shows whether local replica is running
- **Start replica**: Can start local dfx replica from the UI

## Backend API Endpoints

### Identity & CLI
- `GET /api/cli` — detected CLI name + version
- `GET /api/identities` — list all dfx identities
- `GET /api/identity/current` — current identity name
- `POST /api/identity/use` — switch active identity
- `GET /api/identity/principal` — current principal ID

### Project
- `POST /api/project/info` — parse dfx.json/icp.yaml, return canister list
- `POST /api/browse` — filesystem directory browser

### Canister Status
- `POST /api/canister/status` — single canister status (cycles, memory, controllers, etc.)
- `POST /api/canisters/status-all` — batch status for multiple canisters
- `POST /api/canister/info` — canister info via `dfx canister info`
- `POST /api/canister/metadata` — read canister metadata keys

### Canister Lifecycle
- `POST /api/canister/stop` — stop a canister
- `POST /api/canister/start` — start a canister
- `POST /api/canister/delete` — delete a canister
- `POST /api/canister/update-settings` — update freezing threshold or add controller

### Snapshots
- `POST /api/canister/snapshots` — list snapshots
- `POST /api/canister/snapshot/create` — create snapshot
- `POST /api/canister/snapshot/load` — restore snapshot
- `POST /api/canister/snapshot/delete` — delete snapshot
- `POST /api/canister/snapshot/download` — download snapshot to path
- `POST /api/canister/snapshot/upload` — upload snapshot from path

### Build
- `POST /api/build` — build canisters (5 min timeout)

### Deploy
- `POST /api/deploy/summary` — deployment readiness analysis (git status, per-canister deployed state)
- `POST /api/wallet/balance` — wallet cycles balance
- `POST /api/cycles/balance` — canister cycles balance
- WebSocket: live deploy streaming (deploy, cancel, start-replica)

### Settings
- `GET /api/settings` — read persisted settings
- `POST /api/settings` — merge-update settings
- `POST /api/settings/add-project` — add project to recent list

### Replica
- `GET /api/dfx/status` — check if local replica is running
- `POST /api/dfx/start` — start local replica
- `POST /api/dfx/stop` — stop local replica

## Frontend Components
- `App` — main component, all state management
- `FolderBrowser` — modal for browsing filesystem to select project
- `ConfirmModal` — generic confirmation dialog
- `ReinstallConfirmModal` — 4-step reinstall confirmation with type-to-confirm
- `SnapshotsTab` — full snapshot management UI
- `DeploySummaryView` — deployment readiness summary display
- `FolderIcon`, `ChevronIcon`, `RocketIcon`, `SpinnerIcon` — SVG icon components

## Key dfx Commands Used
- `dfx deploy --network ic` / `dfx deploy` — deploy
- `dfx identity list` / `dfx identity whoami` / `dfx identity use <name>` — identity management
- `dfx canister status <name>` — canister status (cycles, memory, controllers, module hash)
- `dfx canister id <name>` — get canister ID
- `dfx canister stop/start/delete <name>` — lifecycle
- `dfx canister snapshot create/list/load/delete <name>` — snapshots
- `dfx canister metadata <name> <key>` — read metadata
- `dfx canister info <name>` — canister info
- `dfx canister update-settings <name>` — update settings
- `dfx wallet balance` — cycles wallet balance

## CLI Detection
- CLI is now detected as `icp 0.2.1`, project uses `icp.yaml` format

## Limitations
- Browser folder picker doesn't give real filesystem paths — uses text input + server-side browse
- dfx or icp CLI must be installed on the user's machine
- icp.yaml parsing is basic (line-based, not a full YAML parser)
- Snapshot download/upload requires manual filesystem paths

## Known Bugs / Issues Fixed
- CLI detection: `icp` binary existed on system but wasn't the ICP CLI — fixed by checking exit status AND stdout content
- "dfx dfx 0.31.0" duplicate in header — fixed by parsing version string
- Network toggle only visible on Deploy tab — moved to global position
- `execSync` with string interpolation (command injection risk) — replaced with `spawnSync` argument arrays
- Remote canisters (evm_rpc) showing controller errors — now detected and displayed as external dependencies
- API helpers not checking HTTP status — fixed, now throw on non-200
- Identity switch not calling server — fixed, now calls /api/identity/use
- BigInt crash on unexpected cycles format — fixed with try/catch and sanitization
- Snapshot actions permanently stuck on error — fixed with try/catch
- WebSocket JSON.parse crash — fixed with try/catch
- isRemoteForNetwork broken for custom networks — fixed to check exact network key
- SnapshotsTab showing remote canisters — fixed to pass ownedCanisters
- onBlur reloading already-loaded projects — fixed with projectLoaded check
- Snapshot buttons not disabled when canister running — fixed
- Hardcoded "dfx" references in UI messages — changed to generic "project config"

## Project Location
- Dashboard code: `/Users/christopher.harrison/Code/Canister Control Panel/`
- Test project (Harrison Data): `/Users/christopher.harrison/Code/Harrison Data/`

## Origin
Conceived in a Claude.ai chat on 4 Mar 2026. Initial UI mock was created as a React artifact. Functional version built starting 2026-03-22.
