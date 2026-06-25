# ICP Deploy

A local developer dashboard for managing [Internet Computer](https://internetcomputer.org) canister deployments. Built as a lightweight alternative to the `dfx` command line for day-to-day canister operations.

## What It Does

ICP Deploy gives you a browser UI that wraps the `icp` CLI for common canister operations:

- **Deploy** — select canisters, choose upgrade/reinstall/install mode, watch logs stream live
- **Monitor** — see cycles balance, memory usage, running status, and module hash for every canister
- **Fleet** — identity-wide view of all production canisters across all recent projects; grouped by project with cycles health bars and top-up controls
- **Auto top-up** — set a minimum cycles threshold per canister; the dashboard tops up automatically when the balance drops below it
- **Controllers** — view, add, and remove canister controllers
- **Snapshots** — create, restore, download, and delete canister snapshots (auto stop/restart handled for you)
- **Identities** — switch active identity; principal and ICP balance update in the header
- **Cycles** — top up canister cycles from ICP or your cycles balance; warnings when amount exceeds available balance; CLI failure reason surfaced in the error toast
- **Multi-project** — quick-switch between recent projects; networks auto-discovered from `icp.yaml`

Everything runs locally — no telemetry, no cloud, no accounts.

## Requirements

- **Node.js** 18+
- **`icp` CLI** 1.0.0+ — [install instructions](https://internetcomputer.org/docs/building-apps/getting-started/install)
- An ICP project with an `icp.yaml` config file

> **Note for icp 1.0.0 users:** if your project uses `@dfinity/asset-canister@v2.1.0`, update it to `@dfinity/asset-canister@v2.2.1`. The `assets` sync step type was removed in icp 1.0.0 and will cause `canister status` to panic for any canister using the old recipe.

## Installation

```bash
git clone https://github.com/ck-harrison/icp-deploy.git
cd icp-deploy
npm install
npm start
```

Then open [http://localhost:3456](http://localhost:3456).

## Usage

1. Paste the path to your ICP project folder (e.g. `~/Code/my-app`) and press Enter
2. Select a network — **Local** (your running replica) or **Production** (`ic` mainnet)
3. Use the tabs:
   - **Deploy** — build and deploy canisters, watch live output
   - **Canisters** — view status, top up cycles, manage controllers
   - **Snapshots** — snapshot and restore canister state
   - **Fleet** — view all production canisters across every recent project

### Fleet tab

The Fleet tab scans all recent projects against `ic` mainnet and shows every canister linked to the active identity in one view. Summary cards show total cycles, low-balance count, and critical count. Each canister has a Top Up button and an Auto top-up configuration.

### Auto top-up

Click **Auto top-up** on any canister to configure a minimum cycles threshold and a top-up amount. When the canister's balance drops below the threshold, the dashboard tops it up automatically the next time you open the Fleet or Canisters tab.

### Deploying to mainnet

The dashboard requires confirmation before any mainnet deploy. Reinstall mode requires typing a confirmation phrase — this is intentional. Deleting a canister also requires typing `delete this canister` to confirm.

### Snapshots

Snapshots require a stopped canister. The "Create Snapshot" button handles the full stop → snapshot → restart cycle automatically.

## Security

This tool runs on localhost and is intended for single-user developer machines. Key protections:

- All CLI calls use `spawnSync` with argument arrays — no shell string interpolation
- All user-provided names validated against an allowlist regex before use
- CSRF protection: requests require `X-Requested-With: XMLHttpRequest`
- CORS locked to `localhost:3456` only
- Rate limiting on sensitive endpoints (top-up, delete, identity export)
- Content Security Policy headers on all responses

**Do not expose port 3456 to a network.** This tool is designed to run only on `127.0.0.1`.

## Architecture

```
server.js          Express + WebSocket backend (~2360 lines)
public/index.html  Single-file React frontend (~3700 lines, CDN React 18 + Babel 7)
```

Settings are persisted to `~/.canister-panel-settings.json`. Deploy history is written to `.deploy-history.json` in each project root. Auto top-up config is written to `.autotopup.json` in each project root.

## License

MIT
