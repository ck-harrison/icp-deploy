# CHECKPOINT — ICP Deploy

State-of-the-world file (CORE.md Law 10). **Read this first; update it before ending a session.**

**Last updated:** 2026-08-10
**HEAD at write time:** `60e95ae` — working tree clean (`git status --short` empty)
**Modes active:** BUILD (declared in `CLAUDE.md`)

---

## What this is

A local browser dashboard for Internet Computer canister operations — a UI wrapper
around the `icp` CLI for the things you otherwise do by hand: deploy, canister
status, snapshots, cycles top-up, controllers, identities, and a cross-project
Fleet view (`README.md:5-19`). Node/Express backend in one file (`server.js`,
2,484 lines) that spawns the CLI as a child process and streams deploy output over
a WebSocket; React frontend in one file (`public/index.html`, 3,824 lines) using
CDN React 18 + Babel 7, transpiled in the browser. Two runtime dependencies,
`express` and `ws` (`package.json`). Runs at `http://localhost:3456`.

It is explicitly **not** a hosted product and not multi-user. It runs on this
machine, against this machine's `icp` identity and filesystem, with no auth —
`README.md:83` says do not expose port 3456 to a network. There is no build step,
no typecheck, no lint, and no test suite (`CLAUDE.md`, Commands). It is also not a
`dfx` tool any more: `43fbda7` migrated it to `icp` as the primary CLI and
`3e7c383` removed the dfx-fallback claims from the README, though `dfx`
argument-mapping branches remain in the code.

## Where it stands

### Running it

```
node server.js            # port 3456
PORT=3466 node server.js  # spare port — verify without killing a running instance
node -c server.js         # syntax check (this is the whole automated toolchain)
```

There is **no watch/reload**. A server started before an edit keeps serving the old
code, so an API check against it returns pre-edit results as a false green
(`CLAUDE.md` gotchas). A server is currently listening on 3456 (PID 1355 at write
time) — the editor started it; don't kill it without asking. The frontend is read
from disk per request, so it needs a browser reload but not a restart.

### Built and working

All of it shipped and is in use; nothing is half-built. Features per `README.md`
and `CONTEXT.md`: Deploy tab with live log streaming and per-canister summary,
Canisters tab with cycles health and lifecycle actions, Snapshots tab with the full
stop → snapshot → restart cycle, Identity management, cycles top-up with balance
validation, auto top-up per canister, and the Fleet tab. 48 `/api/` routes in
`server.js` (counted, not estimated).

The most recent work, all committed:

- **Fleet split into Production / Staging tiers** with a per-canister move button
  (`4067460`). The columns are *classifications*, not networks. Default derives
  from the network (`ic` → production, custom environment → staging); overrides
  persist to `fleetTiers[path][network][canister]` in the panel's own settings
  file (`~/.canister-panel-settings.json`, `server.js:2424`), never into another
  project's config.
- **`-n` vs `-e` flag fix** (`a3e11d0`). Six call sites built network args inline
  with `-n` and were handed environment names, so topping up a staging canister
  failed with *"project does not contain a network named 'staging'"*. Now routed
  through `networkArgs()` (`server.js:137`) / `ledgerNetworkArgs()`
  (`server.js:171`). Closed SECURITY.md finding #4 as a side-effect.
- **`assertProjectDir()`** (`server.js:148`, commit `60e95ae`) — a path used as a
  spawn cwd must still exist. A stale recent-project entry previously produced
  `{"error":""}`.

### Deployed where

Nowhere. There is no deploy target — it is run locally from the repo
(`git clone` → `npm install` → `npm start`, `README.md:31-36`). The GitHub remote
is `ck-harrison/icp-deploy`; `main` is the only live branch, with eight merged PR
branches behind it.

### Verification status

- `TEST_PLAN.md`: 61 items pass, 1 known issue, 2 deliberately skipped, **33 still
  unchecked** — mostly manual browser checks predating the last two sessions.
- Deliberately unverified because they spend real money: `cycles mint -e <env>`
  executing for real, a real top-up from a staging row, the auto-top-up mint path
  on a custom environment (`TEST_PLAN.md:141,152-153`). The flag path is verified
  via `cycles balance`, which shares the CLI's Network Selection Parameters block;
  the transaction itself is not.
- **`scripts/quality-gate.sh` is an unconfigured template and cannot fail.**
  `TYPECHECK_CMD="# configure"` evals to a comment and `SRC_DIR="src"` does not
  exist in this repo. Run just now against the current tree: `PASS (6 checks)`,
  exit 0. Do not trust it.
- **`CLAUDE.md`'s quality gate is also vacuous for the same reason** — its two
  greps target `src/`, which does not exist. What has actually caught bugs:
  `node -c server.js`; transpiling the `<script type="text/babel">` block with
  Babel 7 and asserting it emits no `import` statements; grepping the diff;
  restarting on a **fresh process** and exercising the changed endpoint; and
  driving the real UI in Chrome asserting zero console errors. The last two are
  the ones that find things.

### Known open issues

- **6 of 7 SECURITY.md findings are Open** (#4 fixed 2026-08-06). None critical or
  high. #1 (no SRI on the four CDN `<script>` tags) and #2 (PEM private key routed
  through the browser JS heap on identity export) compound each other.
- **`CONTEXT.md` documents 35 of 48 `/api/` endpoints.** Checked both directions
  just now: no doc references an endpoint that no longer exists; 13 exist
  undocumented — `autotopup/config`, `autotopup/run-now`, `autotopup/status`,
  `canister/snapshot/safe-create`, `canister/top-up`, `cycles/ledger-balances`,
  `cycles/mint`, `identity/export`, `identity/import`, `identity/new`,
  `identity/rename`, `project/network`, `topup-history`. Re-derive rather than
  trusting the list:

  ```
  for ep in $(grep -oE "app\.(get|post)\('/api/[a-zA-Z0-9/_-]+'" server.js \
    | grep -oE "/api/[a-zA-Z0-9/_-]+" | sort -u); do
      grep -q -- "$ep" CONTEXT.md || echo "undocumented: $ep"; done
  ```

  Note `CONTEXT.md` is in `.gitignore` — it is a local-only doc, so this coverage
  gap is invisible to anyone cloning the repo.
- **`README.md:88-89` line counts have drifted** — it says ~2360 / ~3700; actual is
  2,484 / 3,824.
- **Two recent-project entries point at directories that no longer exist**
  (`Tribez`, `sovereign-intel`). The Fleet scan skips them cleanly as `no-config`
  and reports them in the response's `skipped` array; clearing them from the
  recents list is cosmetic and has not been done.
- **Asset canisters using `@dfinity/asset-canister@v2.1.0` show "Not accessible"**
  under icp 1.0.0 — the `assets` sync step was removed and `canister status`
  panics. The fix is in the affected *projects*, not here: five `icp.yaml` files
  listed at `TEST_PLAN.md:59-64`.

## What's next

Nothing is mid-flight, so these are value-ordered, not dependency-ordered.

1. **Confirm the mint path with one small real top-up from a staging row.** It is
   the only unverified part of the most recent fix (`a3e11d0`), it cannot be tested
   any other way (see dead ends), and it needs the editor because it spends real
   ICP. Everything else in that change is verified.
2. **Decide on `scripts/quality-gate.sh` — configure it for this stack or delete
   it.** A gate that returns PASS on every possible state of the tree is worse than
   no gate, because it reads as evidence. Same call applies to the `src/` greps in
   `CLAUDE.md`. This is second because it changes how every later change is
   checked.
3. **Back-fill the 13 undocumented endpoints in `CONTEXT.md`**, if that file is
   meant to be complete — or decide it is a sketch and stop measuring it. Offered
   before and not taken, which is itself an answer worth writing down.
4. **Work SECURITY.md #1 and #2 together** — SRI hashes on the CDN tags and keeping
   the PEM out of the browser heap. They are one threat model, not two.

## Dead ends — do not re-explore

- **`icp cycles mint` has no dry-run.** There is no flag that exercises the mint
  path without spending. Don't go looking for one; the only test is a real, small
  transaction.
- **Changing `-n` to `-e` without also passing the project path fixes nothing.**
  Resolving an environment needs the project's `icp.yaml`, so `-e staging` run
  outside the project dir fails with `failed to locate project directory`. Both
  halves are load-bearing — verified at the CLI, `TEST_PLAN.md:145-146`.
- **A `staging` tier does not mean a test network.** Every staging-tier canister
  observed so far is on mainnet burning real cycles: ClubHuman and capsl declare
  `- name: staging` with `network: ic`, and ICP Appstore's `*-staging` canisters
  live inside the `ic` environment. Read the environment's `network:` field; never
  infer safety from the name or the yellow styling.
- **PR #8's premise no longer reproduces.** `9435b04` says a missing `PWD` on CLI
  spawns broke the Fleet tab outright. On `icp 1.0.0` the CLI resolves the manifest
  from `cwd`, and a copy with zero `PWD:` lines returned full data. The fix is
  harmless and more defensive so it stays — but don't read that commit message as a
  description of current behaviour.
- **Row counts do not belong in docs.** `05d08f2`: counts went 29 → 32 within an
  hour of being written, and the original line was internally inconsistent when
  written. Record the invariant (one status call per (canister, network) pair with
  a resolvable ID), or date the measurement and mark it volatile.
- **`@babel/standalone` must stay pinned to `@7`** (`fb3cfb3`). Babel 8 changed the
  default `sourceType` to `'module'`, so the in-browser transpiler emitted `import`
  statements into a non-module `<script>` — blank screen, no fallback, no error
  surfaced to the user.
- **Don't take the WASM hash from `.dfx/` when the CLI is `icp`.** `icp` stores the
  final deployed artifact in `.icp/cache/artifacts/<name>`, which is what matches
  the on-chain hash; the wrong source produces false "Outdated" status
  (`1ae7f39`, `86d6253`). Asset canisters have no comparable WASM at all —
  `hashMatch` is `null`, not `false`.
- **Verifying against an already-running server is a false green.** No watch/reload
  means the process serves the code it launched with. Restart, or use `PORT=3466`.
  This cost real debugging time once.
- **Line numbers in `SECURITY.md` rot.** `4067460` found five of seven findings
  pointing at wrong lines, mostly drift predating that change. Each finding now
  carries a symbol anchor — trust the anchor, re-verify before acting.

## Open questions for the editor

1. **Is `scripts/quality-gate.sh` meant to be configured or deleted?** It is the
   framework's template, unmodified. Configuring it means deciding what a gate even
   means here given there is no typecheck, lint, or test runner to call. Editor
   call — see What's next #2.
2. **Is `CONTEXT.md` meant to be a complete API reference?** It is gitignored, so
   it is a private working note rather than project documentation, yet it is
   structured as a full endpoint list and is 13 short. Complete it, or drop the
   endpoint section and stop measuring the gap.
3. **What happened to `canister_control_panel_dx_report.md`?** A 14-finding DX
   report on the `icp` CLI dated 2026-03-29, written from seven sessions on this
   project, addressed to "the DFINITY team" — and gitignored. Unknown whether it
   was ever sent, and whether it should be refreshed against icp 1.0.0 (it was
   written against 0.2.1). Notable: its FINDING-04 is the exact `-e` vs `-n`
   confusion that cost a debugging session in August, five months after it was
   written down here.
4. **Two stale branches exist locally** (`open-local-app-and-replica-status`,
   `spending-modal-and-security`) and six on the remote, all merged. Safe to prune?
   Not done — deleting branches is not mine to decide.
5. **`dfx` support: still a goal, or vestigial?** The CLI-mapping branches are
   maintained throughout `server.js`, but the README and the docs are `icp`-only
   and every recorded test run is against `icp`. Unknown whether dfx still works —
   not determinable from the repo, and nothing tests it.
6. **Is anyone other than you meant to run this?** It is public on GitHub with
   install instructions, which implies yes; the security posture (localhost-only,
   no auth, PEM through the browser heap) implies a single trusted machine. That
   answer sets how much SECURITY.md #1/#2 matter.
