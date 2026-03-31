# ICP Deploy

A local developer dashboard for managing [Internet Computer](https://internetcomputer.org) canister deployments. Built as a lightweight alternative to the `dfx` command line for day-to-day canister operations.

![ICP Deploy screenshot showing canister cards with cycles health indicators](https://raw.githubusercontent.com/ck-harrison/icp-deploy/main/docs/screenshot.png)

## What It Does

ICP Deploy gives you a browser UI that wraps the `icp` (or `dfx`) CLI for common canister operations:

- **Deploy** — select canisters, choose upgrade/reinstall/install mode, watch logs stream live
- **Monitor** — see cycles balance, memory usage, running status, and module hash for every canister
- **Snapshots** — create, restore, download, and delete canister snapshots (auto stop/restart handled for you)
- **Identities** — switch active identity; principal and ICP balance update in the header
- **Cycles** — top up canister cycles from ICP; see if cycles are stranded on the cycles ledger
- **Multi-project** — quick-switch between recent projects; networks auto-discovered from `icp.yaml`

Everything runs locally — no telemetry, no cloud, no accounts.

## Requirements

- **Node.js** 18+
- **`icp` CLI** 0.2.x — [install instructions](https://internetcomputer.org/docs/building-apps/getting-started/install)
  (or `dfx` 0.20+ as a fallback)
- An ICP project with an `icp.yaml` or `dfx.json` config file

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

### Deploying to mainnet

The dashboard requires confirmation before any mainnet deploy. Reinstall mode requires typing `i will wipe all my app data` to confirm — this is intentional.

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
server.js          Express + WebSocket backend (~1500 lines)
public/index.html  Single-file React frontend (~2600 lines, CDN React 18)
```

Settings are persisted to `~/.canister-panel-settings.json`. Deploy history is written to `.deploy-history.json` in each project root.

## License

MIT
