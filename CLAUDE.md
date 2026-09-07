# ICP Deploy

## Commands

- `node server.js` — run on port 3456
- `node -c server.js` — syntax check backend
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
- **Fleet columns are tiers, not networks**: the Fleet tab splits on `tier` (`production` | `staging`), which is a *classification*, not the network a canister is deployed on. Default is derived from the network (`ic` → production, any custom environment → staging) because projects encode staging two different ways: as an environment (ClubHuman, capsl: `- name: staging` with `network: ic`) or as a canister inside the `ic` environment (ICP Appstore: `frontend-staging`, `backend-staging`). The default is wrong for the second, so it is overridable per canister via `POST /api/fleet/tier`. Overrides live in the panel's settings file, never in the project's own config.
- **`/api/fleet` scans all networks at once**: `?network=all` is the default. Needed because the staging column can contain `ic` rows. Cost is one `canister status` call per (canister, network) pair that has a resolvable ID — not networks × canisters, since most canisters exist on only one network. Don't quote a row count in docs; it changes every time a project deploys.
- **A "staging" tier does not mean a test network**: every staging-tier canister across these projects has so far turned out to be on mainnet, burning real cycles — both the `staging` environments (which declare `network: ic`) and the `*-staging` canisters in the `ic` environment. Every Fleet row shows its network badge for this reason; don't let the yellow styling imply safety, and don't assume a future `staging` environment points at a test replica — read its `network:` field.
- **CDN version pins**: `@babel/standalone` must stay pinned to `@7` (or a specific 7.x semver). Babel 8 changed `sourceType` default to `'module'`, causing the transpiler to emit `import` statements into a non-module `<script>` context — blank screen, no fallback. Same risk applies to any unpinned CDN build tool.
- **Every WebSocket flow must treat *all* terminal statuses as terminal, and close on each one**: the backend emits a matched pair (`success`/`error`, `replica-running`/`replica-error`), and a frontend handler that branches on only the happy one produces the worst possible symptom — the button appears to do nothing at all. `doDeployNow` is the correct reference: a terminal-status *set*, `ws.close()` on every member, a toast on each. `startReplica` handled only `replica-running` and shipped that way; the dropped `replica-error` also leaked the socket, and five leaked sockets hit `MAX_WS_CONNECTIONS` (`server.js:2140`), after which further clicks were refused with close code 1013 before the CLI was reached. A clean server-side close does **not** fire `onerror`, so `onclose` needs its own handler or those refusals are invisible too. When adding a WS action, grep the backend for every `type: 'status'` it can send and handle each one.
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
- **`ICP_DEPLOY_PORT` is the launcher's variable, `PORT` is the server's**: `server.js` reads `PORT` (`server.js:2478`); the launcher reads `ICP_DEPLOY_PORT` and must forward it as `PORT` on the spawn. Setting one without the other makes the launcher poll one port while the server listens on another, so a perfectly healthy launch times out after 18 seconds and alerts. Shipped and caught in testing.
- **Don't probe the launcher's readiness with `curl … | grep -q` under `pipefail`**: `grep -q` exits at the first match, `curl` then dies of `SIGPIPE`, and `pipefail` reports the pipeline as failed — so the probe returns false on a healthy server every single time. `launch.sh` captures the body into a variable and matches with `case` instead. Shipped and caught in testing.

---

## Quality gate

No typecheck/lint/test scripts configured. Run before reporting done:
1. Grep `src/` for raw hex values: `grep -rn -E '#[0-9A-Fa-f]{3,8}\b' src/ 2>/dev/null`
2. Grep for hardcoded hosts (anything that isn't localhost or a design token reference)
3. Self-review: re-read the diff for logical errors

Report each check explicitly. "All good" is not a gate result.

---

## Operating framework

This project follows Build-Priming v2.


Modes active for this project: BUILD
@~/frameworks/build-priming/FRAMEWORK.md

Gaining a scheduled job, a walk-away batch job, or a user-facing surface is a **pre-flight event**: re-run `MODE-PICKER.md`, add the mode here, and work that playbook's Part 1 before the first run in the new mode.
