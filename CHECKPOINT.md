# CHECKPOINT — ICP Deploy

State-of-the-world file (Law 10). **Read this first; update it before ending a session.**

**Last updated:** 2026-08-10
**HEAD at write time:** `a3e11d0` + uncommitted work described below
**Modes active:** BUILD (declared in `CLAUDE.md`)

---

## What this is

A local browser dashboard for ICP canister operations — an alternative to driving
the `icp` CLI by hand. Node/Express backend (`server.js`, ~2000 lines, no build
step), React frontend in a single file (`public/index.html`) transpiled in-browser
by Babel. Runs at `http://localhost:3456`.

Not a deployed product. It runs on this machine, against this machine's `icp`
identity, and reads projects from `~/.canister-panel-settings.json`.

## How to run

```
node server.js            # port 3456
PORT=3466 node server.js  # spare port, for verifying without killing a running instance
node -c server.js         # syntax check (there is no typecheck/lint/test suite)
```

**There is no watch/reload.** A server started before an edit keeps serving the
old code, and an API check against it returns pre-edit results as a false green.
Restart it, or use a spare port. This cost real debugging time once — see
`CLAUDE.md` gotchas.

The frontend needs no restart (served from disk per request), but **does** need a
browser reload.

---

## Where things stand

### Shipped and verified this session

- **Fleet tab split into Production / Staging tiers**, with a per-canister move
  button (`4067460`). The two columns are *classifications*, not networks — a
  canister on `ic` can sit in Staging. Overrides persist to
  `fleetTiers[path][network][canister]` in the panel's settings file, never into
  a project's own config.
- **`-n` vs `-e` flag fix** (`a3e11d0`). `icp` treats them as conflicting flags:
  `-n` takes a network name, `-e` an environment name. Six call sites built args
  inline with `-n` and were handed environment names, so topping up a staging
  canister from ICP failed with *"project does not contain a network named
  'staging'"*. Now routed through `networkArgs()` / `ledgerNetworkArgs()`.
- **SECURITY.md finding #4 closed** as a side-effect of that consolidation — the
  network name is now validated before it can reach an argv slot.
- **Docs de-rotted** (`05d08f2`): volatile row counts replaced with the
  invariant, after counts written one hour earlier were already wrong.

### Uncommitted right now

- `CLAUDE.md` — Build-Priming v2 block (modes line + `FRAMEWORK.md` import),
  plus the ClubHuman rename below.
- `server.js` — `assertProjectDir()` (`server.js:148`): a project path used as a
  spawn cwd must still exist. A stale recent-project entry previously produced
  `{"error":""}`.
- `CONTEXT.md`, `TEST_PLAN.md` — rename fix and header de-rot.
- `CHECKPOINT.md` — this file.

### Known-unverified (deliberately)

| Thing | Why not verified |
|---|---|
| `cycles mint -e <env>` executing for real | Mints real ICP. Flag path verified via `cycles balance`, which shares the identical Network Selection Parameters block; the transaction itself is untested. |
| A real top-up from a staging row | Spends real cycles. |
| Auto top-up mint path on a custom environment | Same `performTopUp` code, monitor not triggered. |
| An override for a canister that is later deleted | Expected to go inert; not exercised. |

`TEST_PLAN.md` carries the full list; ~33 items remain unchecked, most of them
manual UI checks predating this session.

---

## Open issues

- **6 of 7 SECURITY.md findings are still Open** (#4 fixed 2026-08-06). None are
  critical or high. #1 (no SRI on CDN scripts) and #2 (PEM key through the JS
  heap) compound each other and are the ones worth attention.
- **`CONTEXT.md` documents 35 of 48 `/api/` endpoints.** No doc points at an
  endpoint that no longer exists (checked both directions), but 13 exist
  undocumented: `autotopup/config`, `autotopup/run-now`, `autotopup/status`,
  `canister/snapshot/safe-create`, `canister/top-up`, `cycles/ledger-balances`,
  `cycles/mint`, `identity/export`, `identity/import`, `identity/new`,
  `identity/rename`, `project/network`, `topup-history`. Pre-existing; a backfill
  was offered and not taken. Re-derive the count with the two greps in
  "Doc coverage" below rather than trusting this list.

  ```
  # docs -> code (stale references)
  for ep in $(grep -oE "app\.(get|post)\('/api/[a-z0-9/-]+'" server.js \
    | grep -oE "/api/[a-z0-9/-]+" | sort -u); do
      grep -q -- "$ep" CONTEXT.md || echo "undocumented: $ep"; done
  ```
- **`scripts/quality-gate.sh` is an unconfigured template.** `SRC_DIR="src"`
  does not exist in this repo and `TYPECHECK_CMD="# configure"` evals to a
  comment, so it reports `PASS (6 checks)` on any state of the tree. **Do not
  trust it.** The real gate is the four checks in `CLAUDE.md` plus a JSX
  transpile; see below. Fixing the script is an editor decision, not done.

## The gate that actually works

`CLAUDE.md`'s gate greps `src/`, which does not exist here — that check is
vacuous. What has been used in practice:

1. `node -c server.js`
2. Transpile the `<script type="text/babel">` block with Babel 7 and assert it
   emits no `import` statements (catches the Babel-8 blank-screen class)
3. Grep the diff for raw hex, hardcoded hosts, and debris
4. Restart the server on a **fresh process** and exercise the changed endpoint
5. Drive the real UI in Chrome and assert zero console errors

Steps 4 and 5 are the ones that have caught actual bugs. Steps 1–3 have never
caught anything on their own.

---

## Negative knowledge — don't re-explore these

- **PR #8's premise no longer reproduces.** It says a missing `PWD` on CLI
  spawns broke the Fleet tab outright ("all canisters came back as errors"). On
  `icp 1.0.0` the CLI resolves the manifest from `cwd`, and a local copy with
  zero `PWD:` lines returned full data for every canister. The fix is harmless
  and more defensive, so it stays — but don't use that commit message as a
  description of current behaviour.
- **A `staging` tier does not mean a test network.** Every staging canister here
  is on mainnet burning real cycles: ClubHuman and capsl declare
  `- name: staging` with `network: ic`, and ICP Appstore's `*-staging` canisters
  live in the `ic` environment. Read the environment's `network:` field; don't
  infer safety from the name or the yellow styling.
- **`-e <env>` needs the project as cwd.** Run it elsewhere and you get
  `failed to locate project directory`. Changing the flag without also passing
  the project path fixes nothing.
- **Row counts do not belong in docs.** Two separate doc lines went stale within
  the hour, because deploys happen mid-session. Record the invariant, or date the
  measurement and mark it volatile.
- **`icp cycles mint` has no dry-run.** There is no way to test the mint path
  without spending. Don't go looking for a flag.

---

## Environment facts that moved recently

- **`Tribez` was renamed to `ClubHuman`.** Same canisters — `ijtoz-fqaaa…`,
  `gu4cl-oyaaa…`, `iosin-iiaaa…` on `ic`; `al5kh-saaaa…`, `bgtoj-5iaaa…`,
  `bbsi5-qqaaa…` on `staging`. The old directory is archived at
  `~/Code/Backups/Tribez Backups/`. Docs that named Tribez as the
  staging-as-environment example now name ClubHuman.
- **Two recent-project entries point at directories that no longer exist**
  (`Tribez`, `sovereign-intel`). The Fleet scan skips them cleanly as
  `no-config`; they show in the response's `skipped` array. Clearing them from
  the recents list is cosmetic and hasn't been done.
- **Live fleet, observed 2026-08-10:** 8 projects scanned, 32 rows, 0 errored,
  ~11s. 24 production / 8 staging. Two `ic` rows sit in Staging by manual
  override (ICP Appstore's `frontend-staging`, `backend-staging`). *Volatile —
  re-read from the Fleet tab rather than trusting this line.*

---

## Framework

- Build-Priming **v2.0.2**. `CLAUDE.md` declares `Modes active: BUILD` and
  imports `FRAMEWORK.md` one hop. `CORE.md`, `global-CLAUDE.md` and
  `E-patterns.md` arrive via `~/.claude/CLAUDE.md` — do not re-import them here.
- E-patterns is at 11 entries against a threshold of 20; the bloating guard is
  **not** fired.
- One candidate was raised from this project and **accepted**: the "Stale"
  failure direction on FRAMEWORK.md Part 1.5's *"Canary the gate checks
  themselves"* bullet — a check that runs correctly against an older copy of the
  code. It came from the stale-server incident above. Three other projects hit
  the same bullet independently within days; the CHANGELOG records that
  clustering as the finding in its own right.
- `CANDIDATES.md` inbox is currently empty.

---

## If you pick this up next

Nothing is half-finished. The natural next steps, in rough order of value:

1. **Have the editor confirm the mint path works** with one small real top-up
   from a staging row. It is the only unverified part of the last fix.
2. **Decide on `scripts/quality-gate.sh`** — configure it for this stack or
   delete it. A gate that always passes is worse than none.
3. **Backfill the 16 undocumented endpoints** in `CONTEXT.md`, if that doc is
   meant to be complete.
4. Work SECURITY.md #1 and #2 together — SRI hashes and keeping the PEM out of
   the browser heap.
