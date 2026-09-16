# ICP Deploy

A local developer dashboard for managing [Internet Computer](https://internetcomputer.org) canister deployments. Built as a lightweight alternative to the `dfx` command line for day-to-day canister operations.

## What It Does

ICP Deploy gives you a browser UI that wraps the `icp` CLI for common canister operations:

- **Deploy** — select canisters, choose upgrade/reinstall/install mode, watch logs stream live
- **Monitor** — see cycles balance, memory usage, running status, and module hash for every canister
- **Fleet** — identity-wide view of every canister across all recent projects, split into Production and Staging columns that you define; grouped by project with cycles health bars and top-up controls
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

### Dock launcher (macOS)

If you would rather click an icon than open a terminal:

```bash
bash scripts/make-launcher.sh
```

That builds `~/Applications/ICP Deploy.app`. Open `~/Applications` and drag it onto the Dock, and the tile stays there.

Clicking it starts the server if it is not already running, waits for it to answer, and opens the dashboard in your default browser. Clicking it again just brings up the browser: it never starts a second server. If something other than the dashboard is holding port 3456, it tells you and stops rather than interfering.

Two things worth knowing:

- The app is a **generated** bundle. Its sources are `scripts/launcher/launch.sh`, `Info.plist`, and `icon.svg`. Edit those, then re-run the generator; do not edit anything inside the `.app`.
- The paths to `node`, to the `icp` CLI, and to this project are baked in when you build it, because an app launched from the Dock inherits a minimal `PATH` that contains neither Homebrew nor cargo. Re-run `make-launcher.sh` if you move the project, reinstall Node, or install `icp` afterwards.

Optional: `brew install librsvg` before building, so the app gets its proper icon instead of the generic one. Everything else works either way.

To run on a different port, change the `PORT=` default at the top of `scripts/launcher/launch.sh` and rebuild. (`ICP_DEPLOY_PORT` overrides it too, but only when you invoke the launcher from a shell: a Dock click does not inherit your shell environment.)

## Usage

1. Paste the path to your ICP project folder (e.g. `~/Code/my-app`) and press Enter
2. Select a network — **Local** (your running replica) or **Production** (`ic` mainnet)
3. Use the tabs:
   - **Deploy** — build and deploy canisters, watch live output
   - **Canisters** — view status, top up cycles, manage controllers
   - **Snapshots** — snapshot and restore canister state
   - **Fleet** — view all canisters across every recent project, split into Production and Staging

### Fleet tab

The Fleet tab scans every recent project across every non-local network in one pass, and splits the result into two columns: **Production** and **Staging**. Summary cards show total cycles, low-balance count, and critical count for the column you're looking at. Each canister has a Top Up button and an Auto top-up configuration.

**Which column a canister belongs in is your call.** Production and Staging are your classification, not a property of the canister, so every row carries a **→ Staging** / **→ Production** button that records your choice. The button only changes how the dashboard groups the canister: it does not move, redeploy, or alter the canister itself. Classifications are stored in the dashboard's own settings file, never written into your project's `icp.yaml` or `dfx.json`.

**Canisters you have not classified say so.** Until you classify one, the dashboard puts it somewhere by guessing from the network (`ic` to Production, any custom environment to Staging) and marks the row `undefined`. That guess is right when staging is a whole *environment*, and wrong when staging is a *canister* inside the `ic` environment, such as one named `frontend-staging`. So each tab tells you how many canisters are sitting on a guess, a **Review** button narrows the list to exactly those, and each of them offers **Keep in <column>** alongside the move button, so agreeing with the guess is recorded as a decision rather than left blank. **Keep all N in <column>** settles the whole list in one click.

**Staging does not mean safe.** Every row shows a badge for the network it really targets, resolved from the environment's `network:` field rather than its name: an environment called `staging` that declares `network: ic` shows an orange `ic` badge, because it is mainnet and burning real cycles. An environment that declares no network at all shows a grey badge naming that, rather than being counted as safe. Top Up and Auto top-up always act on the canister's real network, and the identity balances in the top-up modal are read from that same network.

### TCYCLES on the cycles ledger

A canister has two separate cycle figures, and confusing them is easy. The `Cycles`
number on every Fleet row is the fuel the canister runs on. Separately, the
canister's principal can hold **TCYCLES** as a token balance on the
[cycles ledger](https://docs.internetcomputer.org/blog/features/cycles-ledger),
which is a different number entirely: a canister can run on 7.53T of its own
cycles while holding 7.5T on the ledger, or hold nothing at all. Most hold nothing.

Because of that, the ledger reading is **off by default and enabled per canister**.
Click **TCYCLES** on any row to switch it on, and a `Ledger` line appears in that
row's cycles cell showing the balance, `reading...` while the call is in flight, or
`failed` if it did not succeed (hover for the reason). A canister holding nothing
reads `0 TC`, which is an answer rather than a blank. The choice is remembered, so
the rows you care about keep showing it, and it is stored in the dashboard's own
settings rather than in your project config. Switching it on costs one CLI call for
that canister, which is why it is not simply always on.

The dashboard only reads this balance, it cannot move it. Cycles flow from a ledger
balance into a canister (that is what Top Up does), and there is no way to pull a
running canister's own cycles back out to the ledger from outside the canister.

### Auto top-up

Click **Auto top-up** on any canister to configure a minimum cycles threshold and a top-up amount. When the canister's balance drops below the threshold, the dashboard tops it up automatically the next time you open the Fleet or Canisters tab.

### Deploying to mainnet

The dashboard requires confirmation before any mainnet deploy. Reinstall mode requires typing a confirmation phrase — this is intentional. Deleting a canister also requires typing `delete this canister` to confirm.

### Local replica port

`icp network start` binds port 8000 by default, so it fails if anything else on your machine already serves on 8000. The error surfaces in the log pane as the network launcher exiting with status 101.

To move it, add a `networks` entry to that project's `icp.yaml`:

```yaml
networks:
  - name: local
    mode: managed
    gateway:
      port: 4943    # or 0 to let the OS pick a free one
```

The dashboard reads the running port from the CLI rather than assuming it, so the Replica indicator and the "Open Local App" link both follow whatever you set here. Note that `gateway` goes on a `networks` entry, not at the top level of the file, and that `mode` is required.

### Snapshots

Snapshots require a stopped canister. The "Create Snapshot" button handles the full stop → snapshot → restart cycle automatically.

## Security

This tool runs on localhost and is intended for single-user developer machines. Key protections:

- All CLI calls use `spawnSync` with argument arrays — no shell string interpolation
- All user-provided names validated against an allowlist regex before use
- CSRF protection: every `/api` request must carry an `X-Requested-With` header, which a cross-origin form submission cannot set (the dashboard sends `X-Requested-With: CanisterPanel`)
- CORS locked to `http://localhost:<port>`, the port the dashboard itself is serving on
- The server binds `127.0.0.1` explicitly, so it is not reachable from your network even if the port is open
- Rate limiting on sensitive endpoints (top-up, delete, identity export)
- Content Security Policy headers on all responses

**Do not expose port 3456 to a network.** This tool is designed to run only on `127.0.0.1`.

## Architecture

```
server.js          Express + WebSocket backend
public/index.html  Single-file React frontend (CDN React 18 + Babel 7)
scripts/           make-launcher.sh and the macOS launcher templates it builds from
```

Settings are persisted to `~/.canister-panel-settings.json`. Deploy history is written to `.deploy-history.json` in each project root. Auto top-up config is written to `.autotopup.json` in each project root.

## License

MIT
