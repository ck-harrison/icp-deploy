# ICP Deploy

A lightweight alternative to typing `icp` CLI (or `dfx`) commands by hand: a local
browser dashboard for deploying and managing [Internet Computer](https://internetcomputer.org)
canisters. It runs the `icp` CLI for you, so day-to-day jobs like deploying, topping up
cycles, snapshotting and checking on every canister you own become point-and-click.

Everything runs on your own machine. No accounts and no telemetry: the dashboard
talks only to the Internet Computer, the public CDNs that serve the page's
libraries (React, Babel and Tailwind, pinned to exact versions), and, for Fleet's
"behind" check, your projects' git remotes. It also turns off the `icp` CLI's own
anonymous telemetry for the commands it runs.

## What it does

- **Deploy**: pick canisters, choose install / upgrade / reinstall, watch the build output live
- **Canisters**: cycles, memory, status, module hash and controllers for each canister
- **Snapshots**: create (stop and restart handled for you), restore, download and delete canister snapshots
- **Fleet**: every canister across all your recent projects on one page, split into Production and Staging, with a health audit
- **Cycles**: mint cycles from ICP, top up canisters, see your spending history
- **Auto top-up**: refill a canister automatically when it drops below a threshold you set
- **Identities**: uses the identities you already have in the `icp` CLI. Switch between them or rename one; the dashboard never handles private keys
- **Safety rails**: every deploy outside Local asks first; reinstall and delete always make you type a confirmation phrase, and so does restoring a snapshot outside Local; minting asks twice

## Platform support

| Platform | Status |
|----------|--------|
| macOS | Works. This is where it is developed and used daily. Includes an optional Dock launcher. |
| Linux | Should work: nothing in the dashboard is Mac-specific apart from the Dock launcher. Not regularly tested. |
| Windows | Use [WSL2](https://learn.microsoft.com/windows/wsl/install) and follow the Linux steps inside it. Native Windows is not supported. |

## Requirements

- **Node.js 18 or newer**
- **The `icp` CLI**, version 1.4.0 or newer (the version it is tested with; older
  versions name some snapshot commands differently): [install instructions](https://github.com/dfinity/icp-cli).
  If `icp` is not installed but `dfx` is, the dashboard falls back to `dfx`. That path is not regularly tested.
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
copy, and if something else is using the port it tells you and stops. The
launcher reads its port from `ICP_DEPLOY_PORT` (default 3456), not `PORT`.

The paths to `node`, `icp` and this folder are baked in when you build it (apps
started from the Dock do not see your shell's `PATH`), so re-run the script if you
move the folder, reinstall Node, or install `icp` later. `brew install librsvg`
first if you want the proper icon instead of a generic one.

## Using the dashboard

Click the **?** button in the top-right corner of the dashboard for a short version
of this guide.

### The top of the page

- **Project folder**: paste the path to an ICP project (it must be inside your
  home folder) and press Enter or **Load**, or click the folder icon to browse.
  Recent projects are remembered and listed underneath.
- **Up to date** (header): how many of the project's canisters match your last
  local build. It, the balances and the principal appear once a project is loaded.
- **Balances**: the ICP and cycles held by your current identity. Click a balance
  to see your spending history, or the refresh icon to re-read it.
- **Mint**: turns ICP from your identity into cycles you can spend on top-ups.
- **Principal**: your current identity's principal. Click it to copy.
- **Replica**: shows whether a local replica is running for this project, with
  **Start** (or **Stop** once it is running). You only need it when deploying to Local.
- **Open Live App** (or **Open Local App**), next to the tabs, opens the
  project's frontend once it is deployed.
- **Network switch** (right of the tabs): **Local** is a replica on your machine,
  **Production** is mainnet. Other environments from your `icp.yaml` (such as
  `staging`) appear here too, and **+** adds one. The switch applies to the
  Deploy, Canisters and Snapshots tabs. It is hidden on Fleet, which always
  covers every network.

### Deploy

Use this tab to put new code on a canister.

1. **Identity**: check which identity will deploy, switch to another, or rename
   one. Switching here changes the `icp` CLI's default identity for your whole
   machine, including your terminal (the deploy itself passes the identity
   explicitly). New identities are made with `icp identity new` in the terminal.
2. **Deploy mode**:
   - **Auto**: installs a canister if it is new, upgrades it otherwise. The right choice almost always.
   - **Upgrade**: replaces the code and keeps the data.
   - **Reinstall**: replaces the code and **wipes all data**. You will be asked to type a phrase to confirm.
   - **Install**: only for canisters that have never been deployed.
3. **Build before deploy**: leave on unless you have just built the project yourself.
4. **Canisters**: tick the ones to deploy. A badge on the Deploy tab counts
   canisters whose on-chain code differs from your last local build.
5. Press **Deploy to Production** (or **Deploy to Local**, and so on). Any
   deploy outside Local asks for confirmation first, and the button becomes
   **Cancel Deploy** while it runs. The build and deploy output streams into
   **Logs** on the right. **Summary**, next
   to it, shows each canister's ID, status, and whether your local build differs
   from what is deployed.

The **Deploy Mode** section also holds the auto top-up settings that apply to
every canister: a master on/off switch, how much ICP and cycles to always keep on
your identity, and **Run now** to check immediately instead of waiting.

### Canisters

Use this tab to look after canisters that are already deployed, on the network
selected in the header.

- Each card shows status (running or stopped), cycles balance, memory, freezing
  threshold and controllers. Warnings appear on the card, for example a single
  controller, a short freezing threshold, cycles running out, or your identity
  not being a controller.
- **Top Up**: send cycles from your identity to the canister. Paying with ICP
  mints on mainnet, so it is not offered for Local canisters.
- **Auto top-up**: keep this canister's cycles topped up automatically (see
  [Auto top-up](#auto-top-up)). **Top-up History** lists past top-ups.
- **Controllers**: see who controls the canister, add a controller, or remove one.
- **Stop / Start**: stop a canister before risky maintenance, start it again after.
- **Delete**: appears once a canister is stopped, and permanently removes it. You
  type a phrase to confirm.
- On Production, **Open** opens the canister's `icp0.io` web address and
  **Dashboard** opens it on the public ICP dashboard.

### Snapshots

Use this tab to save a canister's full state before something risky, and to roll
back if it goes wrong.

1. Pick a canister.
2. **Create Snapshot**: the dashboard stops the canister, takes the snapshot and
   starts it again.
3. From the list you can **restore** a snapshot (puts the canister back exactly as
   it was), **delete** it, or **download** it to a folder on your machine.
   Restoring needs the canister stopped first (use **Stop** on the Canisters tab),
   and outside Local it asks you to type a phrase.
4. **Upload from Directory** loads a previously downloaded snapshot back onto the
   canister. It also needs the canister stopped.
5. **Extract Data** reads metadata such as the canister's Candid interface.

### Fleet

Use this tab to see every canister you run, across all your recent projects, on one
page, with cycles health, roughly how many days each canister's cycles will last,
top-up buttons and auto top-up. It scans every network at
once, so the network switch is hidden here, and each row shows the network it
actually runs on.

- **You decide which column a canister is in.** Until you do, the dashboard
  guesses from the network and marks the row `undefined`. The **Review** button
  lists the guesses so you can confirm or move them. Your choices are saved in the
  dashboard's own settings, never in your project files.
- **Staging does not mean free.** A staging environment usually runs on mainnet
  and spends real cycles. Check the network badge on each row.
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

Click **Auto top-up** on a canister (Canisters or Fleet tab) and set a
**threshold** and a **target**, plus an optional **daily cap**. The server checks
every 5 minutes, and when a canister is below its threshold it tops it up to the
target, at most once every 30 minutes. Not available for Local canisters. It pays from your identity's cycles first and, if those
run short, mints the difference from your identity's ICP, never dipping below the
reserves set in the Deploy tab's **Deploy Mode** section. It checks the live ICP
price of those cycles before minting and skips the top-up if the mint would take
your ICP below its reserve. It only runs **while the dashboard server is running**:
close it and top-ups stop.

### Local replica port

`icp network start` uses port 8000 by default and fails (the error shows in the
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
| A red "icp CLI was not found" banner, and "icp CLI not found" in the header | The `icp` CLI is not installed or not on your `PATH`. Install it and restart the dashboard. The terminal running the server prints the same warning at startup. |
| The page is blank | The page loads React, Babel and Tailwind from public CDNs, so it needs an internet connection. Check the browser console. |
| Dock app opens but nothing works | Re-run `bash scripts/make-launcher.sh` so it picks up where `node` and `icp` live now. |
| A canister shows "Outdated" | The code on chain differs from your last local build. Deploy it. |
| Fleet is missing canisters | That project's local copy is out of date, or the canister has never been deployed. Pull and refresh. |
| Anything else | The terminal running the server prints the underlying CLI error. |

## Where it keeps data

- `~/.canister-panel-settings.json`: recent projects, Fleet classifications, auto top-up settings
- `.deploy-history.json`, `.topup-history.json` and `.autotopup.json` in each project folder you use it with (consider adding them to that project's `.gitignore`)
- `~/.canister-panel-autotopup.lock`, briefly, while an auto top-up pass runs
- `~/.canister-panel-settings.json.corrupt`, only if the settings file was unreadable (a backup before it starts fresh)
- `server.log` in this folder, when started from the Dock launcher
- Snapshot downloads go wherever you choose (by default a `snapshots` folder in the project)

Apart from those files, the only project file the dashboard changes is `icp.yaml`
(or `dfx.json`), and only when you add or remove an environment. It
never edits `canister_ids.json`.

## Security

The dashboard can spend your cycles and delete your canisters, so it only listens on
`127.0.0.1` and rejects requests from other websites. **Never expose its port to a
network.** It never handles private keys. See [SECURITY.md](SECURITY.md) for details
and known limitations.

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
