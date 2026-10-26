# ICP Deploy

A local browser dashboard for deploying and managing [Internet Computer](https://internetcomputer.org)
canisters. It wraps the `icp` CLI, so day-to-day jobs like deploying, topping up
cycles, snapshotting and checking on every canister you own become point-and-click.

Everything runs on your own machine. No accounts, no cloud, no telemetry.

## What it does

- **Deploy**: pick canisters, choose install / upgrade / reinstall, watch the build output live
- **Canisters**: cycles, memory, status, module hash and controllers for each canister
- **Fleet**: every canister across all your recent projects on one page, split into Production and Staging, with a health audit
- **Cycles**: mint cycles from ICP, top up canisters, see your spending history
- **Auto top-up**: refill a canister automatically when it drops below a threshold you set
- **Snapshots**: create, restore, download and delete canister snapshots (stop and restart handled for you)
- **Identities**: switch, create, import and export `icp` identities
- **Safety rails**: every mainnet deploy asks first; reinstall and delete make you type a confirmation phrase

## Platform support

| Platform | Status |
|----------|--------|
| macOS | Works. This is where it is developed and used daily. Includes an optional Dock launcher. |
| Linux | Should work: nothing in the dashboard is Mac-specific apart from the Dock launcher. Not regularly tested. |
| Windows | Use [WSL2](https://learn.microsoft.com/windows/wsl/install) and follow the Linux steps inside it. Native Windows is not supported. |

## Requirements

- **Node.js 18 or newer**
- **The `icp` CLI**, version 1.0.0 or newer: [install instructions](https://github.com/dfinity/icp-cli)
- An ICP project with an `icp.yaml` (or a legacy `dfx.json`)

## Quick start

```bash
git clone https://github.com/ck-harrison/icp-deploy.git
cd icp-deploy
npm install
npm start
```

Then open <http://localhost:3456>, paste the path to your ICP project folder, and press Enter.

To use a different port: `PORT=4000 npm start`.

### Dock launcher (macOS, optional)

If you would rather click an icon than open a terminal:

```bash
bash scripts/make-launcher.sh
```

That builds `~/Applications/ICP Deploy.app`; drag it onto your Dock. Clicking it
starts the server if needed and opens the dashboard. It never starts a second
copy, and if something else is using the port it tells you and stops.

The paths to `node`, `icp` and this folder are baked in when you build it (apps
started from the Dock do not see your shell's `PATH`), so re-run the script if you
move the folder, reinstall Node, or install `icp` later. `brew install librsvg`
first if you want the proper icon instead of a generic one.

## Help

Click the **?** button in the top-right corner of the dashboard for a quick guide.
The essentials:

### Getting around

1. Paste the path to an ICP project and press Enter (or click **Browse**). Recent projects are remembered.
2. Choose a network with the switch on the right: **Local** (a replica on your machine) or **Production** (mainnet). Other environments from your `icp.yaml` appear there too.
3. For Local, start the replica with the **Start** button next to "Replica" in the header.
4. Use the tabs: **Deploy**, **Canisters**, **Snapshots** and **Fleet**.

### Deploy modes

- **Auto**: installs a canister if it is new, upgrades it otherwise. The right choice almost always.
- **Upgrade**: replaces the code and keeps the data.
- **Reinstall**: replaces the code and **wipes all data**. You will be asked to type a phrase to confirm.
- **Install**: only for canisters that have never been deployed.

### Fleet

Fleet scans every recent project in one go and shows all your mainnet and staging
canisters together, with cycles health, top-up buttons and auto top-up.

- **You decide which column a canister is in.** Until you do, the dashboard
  guesses from the network and marks the row `undefined`. The **Review** button
  lists the guesses so you can confirm or move them. Your choices are saved in the
  dashboard's own settings, never in your project files.
- **Staging does not mean free.** A staging environment usually runs on mainnet
  and spends real cycles. Every row shows the network it actually runs on.
- **Fleet audit** (collapsed, only shown when there is something to report) flags
  canisters with a single controller (lose that identity and the canister is
  stuck forever) and canisters on the default 30-day freezing threshold.
- **TCYCLES**: a canister's own cycles and the TCYCLES token balance its principal
  holds on the [cycles ledger](https://docs.internetcomputer.org/blog/features/cycles-ledger)
  are two different numbers. Click **TCYCLES** on a row to show the ledger balance
  too. Most canisters hold none.
- If a project's local copy is behind its git remote, Fleet tells you, because it
  can only see canisters that exist in the files on disk. Pull and refresh.

### Auto top-up

Click **Auto top-up** on a canister to set a minimum balance and a top-up amount.
The server checks every 5 minutes and tops up any canister below its minimum.
It only runs **while the dashboard server is running**: close it and top-ups stop.

### Local replica port

`icp network start` uses port 8000 by default and fails (exit status 101 in the
log) if something else is using it. To move it, add this to the project's `icp.yaml`:

```yaml
networks:
  - name: local
    mode: managed
    gateway:
      port: 4943    # or 0 to let the OS pick a free port
```

`gateway` belongs under a `networks` entry, not at the top level, and `mode` is
required. The dashboard reads the actual port from the CLI, so its links follow
whatever you set.

### Troubleshooting

| Symptom | Fix |
|---------|-----|
| No CLI version in the header, every action fails | The `icp` CLI is not installed or not on your `PATH`. Install it and restart the dashboard. |
| Dock app opens but nothing works | Re-run `bash scripts/make-launcher.sh` so it picks up where `node` and `icp` live now. |
| Asset canisters show "Not accessible" with icp 1.0.0 | Update `@dfinity/asset-canister@v2.1.0` to `@dfinity/asset-canister@v2.2.1` in the project's `icp.yaml`. |
| A canister shows "Outdated" | The code on chain differs from your last local build. Deploy it. |
| Fleet is missing canisters | That project's local copy is out of date, or the canister has never been deployed. Pull and refresh. |
| Anything else | The terminal running the server prints the underlying CLI error. |

## Where it keeps data

- `~/.canister-panel-settings.json`: recent projects, Fleet classifications, auto top-up settings
- `.deploy-history.json` and `.autotopup.json` in each project folder you use it with (consider adding them to that project's `.gitignore`)

## Security

The dashboard can spend your cycles and export your keys, so it only listens on
`127.0.0.1` and rejects requests from other websites. **Never expose its port to a
network.** See [SECURITY.md](SECURITY.md) for details and known limitations.

## Development

```
server.js                     Express + WebSocket backend that drives the icp CLI
public/index.html             The whole frontend: one React file, compiled in the browser
scripts/check-frontend.cjs    Syntax-checks the frontend the same way the browser compiles it
scripts/make-launcher.sh      Builds the macOS Dock launcher from scripts/launcher/
```

There is no build step. Before sending a change, run:

```bash
npm run check
```

That checks the backend parses and the frontend compiles. Then load the page and
try what you changed, since there is no test suite. [CLAUDE.md](CLAUDE.md) (also
`AGENTS.md`) lists the non-obvious traps in the codebase and is worth reading
before editing.

## License

[MIT](LICENSE)
