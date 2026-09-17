# ICP Deploy

## Commands

- `node server.js` — run on port 3456
- `node -c server.js` — syntax check backend
- `node scripts/check-frontend.cjs [path]` — transpile-check the in-page JSX (the
  only automated check the frontend has). Fetches the pinned Babel build into
  gitignored `.cache/` on first run, then runs in about 0.25s offline. The
  optional path exists so the check can be **canaried against a copy**: plant a
  syntax error in a copy outside the repo and run it against that, instead of
  breaking `public/index.html` in place and reverting. Exit 0 pass, 1 fail, 2
  could-not-run; every message names the file it checked, so a canary run can
  never be mistaken for a clean bill of health on the real page.
- `bash scripts/make-launcher.sh` — (re)build the macOS Dock launcher at `~/Applications/ICP Deploy.app`
- No build step or test suite. Frontend uses Babel in-browser transpilation — syntax errors only surface at runtime in the browser console. Always verify UI changes in the browser.

## Gotchas

- **WASM hash source differs by CLI**: `icp` CLI stores the final deployed artifact in `.icp/cache/artifacts/<name>` (matches on-chain hash). `dfx` stores it in `.dfx/<network>/canisters/<name>/`. Using the wrong source produces false "Outdated" status.
- **Stale closures**: `loadProject` has `useCallback([], [])` for stability. Use `useRef` to access current state inside it (see `networkRef`).
- **Asset canisters**: No WASM hash comparison possible — `hashMatch` is `null`, not `false`. Guard against this in health/status calculations.
- **icp vs dfx args**: `icp` uses `-e <env>`, `dfx` uses `--network <net>`. Always go through `networkArgs()`.
- **`-n <network>` and `-e <environment>` are not interchangeable**: `icp` treats them as *conflicting* flags. `-n` takes a network name (`ic`); `-e` takes an environment name from `icp.yaml`. An environment declares which network it targets, so `-n staging` fails with `project does not contain a network named 'staging'` even though `-e staging` works. Two consequences: (1) never build network args inline — use `networkArgs()` for project-scoped commands or `ledgerNetworkArgs()` for identity/ledger-scoped ones (`cycles mint`, `cycles balance`, `token balance`, cycles-ledger calls, whose fallback is mainnet rather than nothing); (2) resolving an environment needs the project's `icp.yaml`, so any command passing `-e` must also run with that project as cwd — otherwise it fails with `failed to locate project directory`. That is why `/api/ledger/balance`, `/api/cycles/identity-balance`, and the cycles-ledger endpoints take an optional `path`.
- **icp.yaml canister formats**: Both inline (`- name: foo`) and directory-reference (`- path/to/dir` with `canister.yaml` inside) must be handled.
- **CSRF**: All API calls require `X-Requested-With: CanisterPanel` header.
- **`PWD` must be set on every CLI spawn**: the `icp` CLI resolves the project manifest from the `PWD` env var, not from the spawn's `cwd`. Passing only `cwd` makes it search the server's own launch directory and fail with "project manifest not found". Every `spawn`/`spawnSync` of the CLI must pass `env: { ...process.env, HOME: process.env.HOME, PWD: cwd || process.cwd() }` — never bare `PWD: cwd`, since helpers like the identity calls are invoked with no cwd.
- **Stale server serves pre-edit code**: `server.js` has no watch/reload. If a `node server.js` is already listening on 3456, it keeps serving the code it was started with — an API check against it silently returns pre-edit results (false green). Either restart it, or verify on a spare port with `PORT=3466 node server.js`. Don't kill a server the editor started without asking.
- **Fleet columns are tiers, not networks**: the Fleet tab splits on `tier` (`production` | `staging`), which is the *owner's classification*, not the network a canister is deployed on. Where the owner has not classified one, the panel guesses from the network (`ic` → production, any custom environment → staging) because projects encode staging two different ways: as an environment (ClubHuman, capsl: `- name: staging` with `network: ic`) or as a canister inside the `ic` environment (ICP Appstore: `frontend-staging`, `backend-staging`). The guess is wrong for the second. Set a tier via `POST /api/fleet/tier`, or many at once via `POST /api/fleet/tiers` (`{items:[...]}`, max 200, rejects the whole batch on any invalid item). Classifications live in the panel's settings file, never in the project's own config.
- **An explicit tier is stored even when it equals the guess** — that write is the only record that the owner decided, and `tierSet` on every `/api/fleet` row is what the UI's "undefined" chip and its Review filter read. Until 2026-09-13 the write path deleted any classification equal to the network-derived default, which made "I confirmed this is production" and "nobody has ever looked at this" the same stored state. `tier: 'default'` is the way to clear one and hand the row back to the guess. Don't reintroduce pruning-on-equality: it looks like tidy housekeeping and it destroys the distinction.
- **`/api/fleet` scans all networks at once**: `?network=all` is the default. Needed because the staging column can contain `ic` rows. Cost is one `canister status` call per (canister, network) pair that has a resolvable ID — not networks × canisters, since most canisters exist on only one network. Don't quote a row count in docs; it changes every time a project deploys.
- **A "staging" tier does not mean a test network**: every staging-tier canister across these projects has so far turned out to be on mainnet, burning real cycles — both the `staging` environments (which declare `network: ic`) and the `*-staging` canisters in the `ic` environment. Every Fleet row shows its network badge for this reason; don't let the yellow styling imply safety, and don't assume a future `staging` environment points at a test replica — read its `network:` field.
- **The environment name is not the network; resolve it.** `entry.network` is the environment the scan used (what the CLI needs for `-e`), so it is `staging` for ClubHuman and capsl. `resolveEnvNetwork()` reads that environment's `network:` field from `icp.yaml` and returns it as `entry.networkResolved`, and *every* claim about real cycles must count on the resolved value. Counting the name made the staging banner report "2 of these are on ic" when all 9 were on mainnet: only ICP Appstore's rows sit in an environment literally named `ic`. `networkResolved` is `null`, never `'ic'`, for an environment that declares no network (a dfx.json network, or a key that exists only in `canister_ids.json`) — unknown and not-mainnet are different claims, and the UI reports the unknowns separately rather than folding them into either count.
- **A canister's cycles and its TCYCLES ledger balance are two different numbers.** The Fleet row's `Cycles` figure is the fuel the canister runs on (from `canister status`); the optional `Ledger` line is TCYCLES held by that canister's *principal* on the cycles ledger, read with `icp cycles balance -e <env> --of-principal <canisterId>`. They are close enough to be mistaken for each other: ClubHuman's production backend runs on ~7.53T while holding exactly 7.5T on the ledger, which on first reading looked like the same figure printed twice. Never label them with one word, and be suspicious of a round ledger figure sitting beside a similar status figure. Most canisters hold zero: of 13 checked on 2026-09-16, 3 were non-zero.
- **The ledger reading is opt-in per canister and persisted**, in `fleetLedgerWatch[projectPath][network][canister]` in the panel's settings (never the project config). `/api/fleet` returns `ledgerWatch` per row but **not** the balance: the balance is read only through `/api/cycles/principal-balance`, so one code path produces it for both the toggle-on read and the post-scan refresh. A scan-time copy plus an on-demand copy is two generators for one number and they would eventually disagree.
- **Re-read watched balances from the scan, not from an effect on the watched set.** `fetchFleet` calls `fetchWatchedLedgerBalances(data.canisters)` directly. An effect keyed on the watched canister IDs does not re-run when you press Refresh with the set unchanged, so every other number on the row would update while the ledger line silently kept the previous scan's value.
- **Cycles cannot be pulled out of a running canister.** The cycles ledger's `withdraw` goes ledger to canister, `icp canister top-up` goes ledger to canister, and there is no management-canister method for the reverse. `icp canister delete` has no withdraw flag (unlike `dfx canister delete --withdraw-cycles-to-canister`). So "fund the TCYCLES balance from the canister's own cycles" would need code inside the canister attaching cycles to a ledger call; the panel cannot do it from outside. Verified against `icp 1.0.0` help output and the cycles-ledger docs on 2026-09-16.
- **A principal reaching an argv slot needs `assertSafeName` like any other name.** `/api/cycles/principal-balance` passes its `principal` to `--of-principal`, so `--help` or `--version` there would be read as a flag. It is validated, and the rejection is tested.
- **The Fleet audit reads data the scan already had; don't add CLI calls for it.** `controllers` and `freezingThreshold` are already on every `/api/fleet` row, so the audit panel is pure frontend derivation and costs nothing per scan. It reports over **both tiers**, not the visible one: a risk in the tab you are not looking at is the one you miss. It excludes rows with an `error` (no controller or threshold data) and prints how many it excluded with the denominator it actually used, because an unreadable canister is unaudited, not healthy.
- **When most of the fleet trips a check, a per-row chip is decoration.** 22 of 24 canisters here have a single controller, so a chip on each would carry no information. The audit is one collapsed disclosure that names the affected canisters, and it renders nothing at all when there are no findings. Same reason the tier banners were deleted on 2026-09-16: a permanent coloured bar that is always present is what makes a real warning cheap to ignore.
- **30 days is ICP's default freezing threshold, so "at the default" and "deliberately set to 30 days" are indistinguishable from outside.** The audit says "at or below the 30-day default" rather than claiming nobody configured it. Raising a threshold can block your own upgrades if it exceeds the current balance, so the advice is always top up first, then raise.
- **CDN version pins**: `@babel/standalone` must stay pinned to `@7` (or a specific 7.x semver). Babel 8 changed `sourceType` default to `'module'`, causing the transpiler to emit `import` statements into a non-module `<script>` context — blank screen, no fallback. Same risk applies to any unpinned CDN build tool.
- **Every WebSocket flow must treat *all* terminal statuses as terminal, and close on each one**: the backend emits a matched pair (`success`/`error`, `replica-running`/`replica-error`), and a frontend handler that branches on only the happy one produces the worst possible symptom — the button appears to do nothing at all. `doDeployNow` is the correct reference: a terminal-status *set*, `ws.close()` on every member, a toast on each. `startReplica` handled only `replica-running` and shipped that way; the dropped `replica-error` also leaked the socket, and five leaked sockets hit `MAX_WS_CONNECTIONS` (a `const` in `server.js`), after which further clicks were refused with close code 1013 before the CLI was reached. A clean server-side close does **not** fire `onerror`, so `onclose` needs its own handler or those refusals are invisible too. When adding a WS action, grep the backend for every `type: 'status'` it can send and handle each one.
- **Replica detection asks the CLI, it does not guess ports.** `/api/replica/status` takes an optional `path` and runs `icp network status` in it, parsing `Gateway Url:` for the live port. That is an *observation*; `icp.yaml` is only an *intention*, and a bare port probe cannot tell whose replica answered — probing 8000/4943 reported a **different project's** replica as this one's. Only the no-project-selected branch still probes the defaults, and it marks the result `attributed: false` to say so. Never reintroduce a port constant here: the frontend takes `port` from this endpoint and the two "Open Local App" links derive from it.
- **`gateway.port` is NOT a top-level key in `icp.yaml`, and `icp network start --help` is wrong about it.** The help text says "set `gateway.port` in `icp.yaml`"; icp 1.0.0's own parser rejects a top-level `gateway:` with ``unknown field `gateway`, expected one of `canisters`, `networks`, `environments` ``. It belongs on a `networks:` entry, and `mode` is required there (`managed` | `connected`):
  ```yaml
  networks:
    - name: local
      mode: managed
      gateway:
        port: 4943
  ```
  Discovered by feeding wrong shapes to the CLI and reading its errors, which is the fastest schema oracle available for this manifest. Adding the block is additive: `icp network list` still shows both `local` and `ic`, and `-e ic` still resolves.
- **`port: 0` means OS-assigned, which is a declaration, not an absence.** It is the convention across these projects (ICP Appstore, DeltaRates, CME Prototype as of 2026-09-07) because it never collides with anything, including a second local replica: two came up simultaneously on 49216 and 49324 with 8000 and 4943 both occupied. `resolveGatewayConfig` returns `{ ephemeral: true }` for it, distinct from `null` for nothing-declared, because collapsing the two is what made the status endpoint fall back to the defaults and claim someone else's replica. An ephemeral port is unknowable from config while stopped, so `port` comes back `null` and only `icp network status` can answer it once running.
- **`icp network start` has no `--clean` flag** (verified against `icp 1.0.0`): both `/api/replica/start` and the WS `start-replica` handler append `--clean` when `clean` is truthy, which would make the CLI reject the whole command. Currently latent because no frontend caller sets `clean`. `dfx start --clean` does exist, so the flag is only valid on the `dfx` branch.
- **The Dock launcher is generated; never hand-edit the `.app`**: `~/Applications/ICP Deploy.app` is a build artifact of `scripts/make-launcher.sh`. Its three sources are `scripts/launcher/launch.sh`, `Info.plist`, and `icon.svg` — edit those and re-run the generator, which is idempotent (two runs produce byte-identical bundles). Re-run it after moving the project, reinstalling Node, or installing `icp`, because all three are pinned into the bundle at build time.
- **A Dock-launched process has PATH=`/usr/bin:/bin:/usr/sbin:/sbin`**: no Homebrew, no cargo. So neither `node` nor the `icp` CLI that `server.js` spawns is resolvable from a Dock click, and the failure looks like the dashboard working while every operation fails. The generator resolves both and bakes their directories into the launcher's exported `PATH`. Verify after any change with `curl -H 'X-Requested-With: CanisterPanel' localhost:3456/api/cli` on a server the *launcher* started — a version string there is the proof; a server you started in a terminal proves nothing, because it inherited your shell's PATH.
- **`ICP_DEPLOY_PORT` is the launcher's variable, `PORT` is the server's**: `server.js` reads `PORT` (`const PORT = process.env.PORT || 3456`); the launcher reads `ICP_DEPLOY_PORT` and must forward it as `PORT` on the spawn. Setting one without the other makes the launcher poll one port while the server listens on another, so a perfectly healthy launch times out after 18 seconds and alerts. Shipped and caught in testing.
- **Don't probe the launcher's readiness with `curl … | grep -q` under `pipefail`**: `grep -q` exits at the first match, `curl` then dies of `SIGPIPE`, and `pipefail` reports the pipeline as failed — so the probe returns false on a healthy server every single time. `launch.sh` captures the body into a variable and matches with `case` instead. Shipped and caught in testing.

---

## Quality gate

No typecheck/lint/test scripts configured. Run before reporting done:

1. `node -c server.js` — the backend parses.
2. **`node scripts/check-frontend.cjs`** — transpiles the frontend the way the
   browser does. `public/index.html` is one `<script type="text/babel">` block
   compiled in-browser, so a JSX syntax error is invisible until someone loads the
   page and reads the console; there is no build step to catch it. The script
   extracts the block, runs it through the same pinned `@babel/standalone@7` build
   with `presets:['react']`, and fails on a throw or on any emitted `import`
   statement. It prints the character count it transpiled, so a pass cannot be
   confused with having examined nothing. Exit 2 (not 1) means the check could not
   run at all, which is not a pass. *This lived in a scratch directory until
   2026-09-17, which meant the gate step documented here could not actually be run
   by anyone who had not rebuilt the harness by hand, and after a session boundary
   that was nobody. A gate that cannot be executed is not enforced.* It has caught
   a real unclosed `<span>`, and is canaried by planting one **in a copy** and
   passing that copy's path, so the canary never touches the file it guards.
3. **Grep the diff, not the tree.** `git diff -U0 | grep -E '^\+[^+]' | grep -E '#[0-9A-Fa-f]{3,8}\b'`
   for raw hex, and the same shape for hardcoded hosts. *Until 2026-09-13 both
   greps targeted `src/`, which has never existed in this repo, so the gate scanned
   zero files and passed unconditionally.* Matches in Markdown prose are not
   violations; read them before acting.
4. **Exercise the change against a fresh process.** `PORT=3466 node server.js`, hit
   the changed endpoint, assert on the body. A server started before the edit
   returns pre-edit results as a false green.
5. **No line-number references in any doc.**
   `grep -nE '\.(js|html|sh|md|json|yaml):[0-9]+' *.md` must print nothing.
   A `file.js:NNN` reference rots the moment anything above it is edited, and it
   rots *silently* into a plausible-looking pointer at unrelated code. This has
   now happened twice: four of `SECURITY.md`'s seven findings on 2026-09-13
   (one landed on a bare `});`), then `MAX_WS_CONNECTIONS` and `PORT` in this
   file on 2026-09-16, both off by 263 lines after `server.js` grew. Cite the
   **symbol** instead: a function name, a route, a `const`, a heading. Symbols
   survive edits and `grep` finds them; a stale number finds nothing and misleads
   whoever followed it. Canaried 2026-09-17 by planting a ref and watching this
   go red.
6. Self-review: re-read the diff for logical errors.

Report each check explicitly, with its number or output. "All good" is not a gate
result, and neither is a tick with nothing behind it.

**Rendering a component headlessly is possible and worth it.** `FleetTab` was
rendered to static HTML by transpiling the shipped `index.html`, evaluating it with
React stubbed in, and calling `ReactDOMServer.renderToStaticMarkup` on the real
component with a real `/api/fleet` payload. That is how the degraded-server
behaviour was proven in both directions: strip `tierSet` and `networkResolved` from
the payload and assert the page makes none of the claims that depend on them.
Click-driven state (the Review filter) stays invisible to it, so say so rather than
implying coverage.

**A gate check gets canaried before it is trusted.** Plant exactly the violation,
watch that check go red with the expected message, delete the plant. The transpile
check above was canaried with an unclosed `<span>` and reported the correct file,
line and reason.

---

## Operating framework

This project follows Build-Priming v2.


Modes active for this project: BUILD
@~/frameworks/build-priming/FRAMEWORK.md

Gaining a scheduled job, a walk-away batch job, or a user-facing surface is a **pre-flight event**: re-run `MODE-PICKER.md`, add the mode here, and work that playbook's Part 1 before the first run in the new mode.
