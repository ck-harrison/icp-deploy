# ICP Deploy

## Commands

- `node server.js` — run on port 3456
- `node -c server.js` — syntax check backend
- No build step or test suite. Frontend uses Babel in-browser transpilation — syntax errors only surface at runtime in the browser console. Always verify UI changes in the browser.

## Gotchas

- **WASM hash source differs by CLI**: `icp` CLI stores the final deployed artifact in `.icp/cache/artifacts/<name>` (matches on-chain hash). `dfx` stores it in `.dfx/<network>/canisters/<name>/`. Using the wrong source produces false "Outdated" status.
- **Stale closures**: `loadProject` has `useCallback([], [])` for stability. Use `useRef` to access current state inside it (see `networkRef`).
- **Asset canisters**: No WASM hash comparison possible — `hashMatch` is `null`, not `false`. Guard against this in health/status calculations.
- **icp vs dfx args**: `icp` uses `-e <env>`, `dfx` uses `--network <net>`. Always go through `networkArgs()`.
- **icp.yaml canister formats**: Both inline (`- name: foo`) and directory-reference (`- path/to/dir` with `canister.yaml` inside) must be handled.
- **CSRF**: All API calls require `X-Requested-With: CanisterPanel` header.
- **`PWD` must be set on every CLI spawn**: the `icp` CLI resolves the project manifest from the `PWD` env var, not from the spawn's `cwd`. Passing only `cwd` makes it search the server's own launch directory and fail with "project manifest not found". Every `spawn`/`spawnSync` of the CLI must pass `env: { ...process.env, HOME: process.env.HOME, PWD: cwd || process.cwd() }` — never bare `PWD: cwd`, since helpers like the identity calls are invoked with no cwd.
- **Stale server serves pre-edit code**: `server.js` has no watch/reload. If a `node server.js` is already listening on 3456, it keeps serving the code it was started with — an API check against it silently returns pre-edit results (false green). Either restart it, or verify on a spare port with `PORT=3466 node server.js`. Don't kill a server the editor started without asking.
- **Fleet columns are tiers, not networks**: the Fleet tab splits on `tier` (`production` | `staging`), which is a *classification*, not the network a canister is deployed on. Default is derived from the network (`ic` → production, any custom environment → staging) because projects encode staging two different ways: as an environment (Tribez: `- name: staging`, `network: ic`) or as a canister inside the `ic` environment (ICP Appstore: `frontend-staging`). The default is wrong for the second, so it is overridable per canister via `POST /api/fleet/tier`. Overrides live in the panel's settings file, never in the project's own config.
- **`/api/fleet` scans all networks at once**: `?network=all` is the default. Needed because the staging column can contain `ic` rows. Cheap in practice — most canisters exist on only one network, so it's ~29 status calls, not 2× anything.
- **A "staging" tier does not mean a test network**: both Tribez's `staging` environment and ICP Appstore's `*-staging` canisters are on mainnet, burning real cycles. Every Fleet row shows its network badge for this reason; don't let the yellow styling imply safety.
- **CDN version pins**: `@babel/standalone` must stay pinned to `@7` (or a specific 7.x semver). Babel 8 changed `sourceType` default to `'module'`, causing the transpiler to emit `import` statements into a non-module `<script>` context — blank screen, no fallback. Same risk applies to any unpinned CDN build tool.

---

## Quality gate

No typecheck/lint/test scripts configured. Run before reporting done:
1. Grep `src/` for raw hex values: `grep -rn -E '#[0-9A-Fa-f]{3,8}\b' src/ 2>/dev/null`
2. Grep for hardcoded hosts (anything that isn't localhost or a design token reference)
3. Self-review: re-read the diff for logical errors

Report each check explicitly. "All good" is not a gate result.
