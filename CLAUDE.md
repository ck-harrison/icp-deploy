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
