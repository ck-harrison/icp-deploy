#!/usr/bin/env bash
# make-launcher.sh — build the macOS Dock launcher for this dashboard.
#
#   bash scripts/make-launcher.sh              # install to ~/Applications
#   bash scripts/make-launcher.sh --dest DIR   # install somewhere else
#   bash scripts/make-launcher.sh --open       # …then reveal it in Finder
#
# Produces "<dest>/ICP Deploy.app": a click starts `node server.js` if it isn't
# already up and opens http://localhost:3456 in the default browser. Drag it to
# the Dock once and the tile stays.
#
# This is the generator. The app bundle is a build artifact — never hand-edit
# anything inside it. Edit scripts/launcher/{launch.sh,Info.plist,icon.svg} and
# re-run this. Running it twice in a row changes nothing but the mtimes: the
# paths to `node`, to `icp` and to this project are re-pinned on every run,
# which is also how you repair the launcher after moving the project or
# reinstalling Node.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATES="${REPO}/scripts/launcher"
DEST="${HOME}/Applications"
REVEAL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dest) DEST="${2:?--dest needs a directory}"; shift 2 ;;
    --open) REVEAL=1; shift ;;
    -h|--help) sed -n '2,19p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "make-launcher: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

APP="${DEST}/ICP Deploy.app"

fail() { echo "make-launcher: $1" >&2; exit 1; }

for f in launch.sh Info.plist icon.svg; do
  [ -f "${TEMPLATES}/${f}" ] || fail "missing template scripts/launcher/${f}"
done
[ -f "${REPO}/server.js" ] || fail "no server.js in ${REPO} — run this from inside the project"

# ── Pin the interpreter and the CLI ─────────────────────────────────────────
# A Dock-launched process gets PATH=/usr/bin:/bin:/usr/sbin:/sbin, so anything
# in a Homebrew or cargo prefix is invisible to it. Resolve `node` (which runs
# the server) and `icp` (which server.js spawns per operation) now, and bake
# both their directories into the launcher's PATH.
NODE="$(command -v node || true)"
[ -n "$NODE" ] || fail "node is not on PATH — install it, then re-run"
NODE_DIR="$(cd "$(dirname "$NODE")" && pwd)"
NODE="${NODE_DIR}/$(basename "$NODE")"

ICP="$(command -v icp || true)"
ICP_DIR=""
if [ -n "$ICP" ]; then
  ICP_DIR="$(cd "$(dirname "$ICP")" && pwd)"
else
  echo "make-launcher: warning — the 'icp' CLI is not on PATH. The dashboard will"
  echo "               start, but every operation that shells out to it will fail."
  echo "               Install icp, then re-run this script to pin it."
fi

BAKED_PATH="$NODE_DIR"
if [ -n "$ICP_DIR" ] && [ "$ICP_DIR" != "$NODE_DIR" ]; then
  BAKED_PATH="${BAKED_PATH}:${ICP_DIR}"
fi
BAKED_PATH="${BAKED_PATH}:/usr/bin:/bin:/usr/sbin:/sbin"

VERSION="$("$NODE" -e 'process.stdout.write(require(process.argv[1]).version)' \
  "${REPO}/package.json" 2>/dev/null || echo 1.0.0)"

# Literal placeholder substitution, done in node rather than sed/awk because
# both treat characters that occur in real paths (& in awk's replacement, / and
# \ in sed's) as syntax. It also refuses to emit a file that still contains an
# unsubstituted @@…@@ token, so adding a placeholder to a template without
# teaching this script about it fails here instead of shipping broken.
substitute() {
  L_REPO="$REPO" L_NODE="$NODE" L_PATH="$BAKED_PATH" L_VERSION="$VERSION" \
  "$NODE" -e '
    const fs = require("fs");
    const [tpl, out] = process.argv.slice(1);
    let s = fs.readFileSync(tpl, "utf8");
    const map = {
      "@@GENERATED_NOTE@@": "GENERATED FILE — built by scripts/make-launcher.sh from " +
        "scripts/launcher/" + require("path").basename(tpl) +
        ". Do not edit this copy; edit the template and re-run the generator.",
      "@@REPO@@": process.env.L_REPO,
      "@@NODE@@": process.env.L_NODE,
      "@@PATH@@": process.env.L_PATH,
      "@@VERSION@@": process.env.L_VERSION,
    };
    for (const [k, v] of Object.entries(map)) s = s.split(k).join(v);
    const left = s.match(/@@[A-Z_]+@@/g);
    if (left) {
      console.error("make-launcher: unsubstituted placeholder(s) in " + tpl +
                    ": " + [...new Set(left)].join(", "));
      process.exit(1);
    }
    fs.writeFileSync(out, s);
  ' "$1" "$2"
}

# ── Build the bundle ────────────────────────────────────────────────────────
rm -rf "$APP"
mkdir -p "${APP}/Contents/MacOS" "${APP}/Contents/Resources"

substitute "${TEMPLATES}/launch.sh" "${APP}/Contents/MacOS/icp-deploy"
chmod +x "${APP}/Contents/MacOS/icp-deploy"

substitute "${TEMPLATES}/Info.plist" "${APP}/Contents/Info.plist"
plutil -lint "${APP}/Contents/Info.plist" >/dev/null || fail "generated Info.plist is not valid"

printf 'APPL????' > "${APP}/Contents/PkgInfo"

# ── Icon ────────────────────────────────────────────────────────────────────
# rsvg-convert (brew install librsvg) renders the SVG properly. Without it the
# bundle still works; it just wears the generic application icon, and says so.
if command -v rsvg-convert >/dev/null 2>&1; then
  ICONTMP="$(mktemp -d)"
  ICONSET="${ICONTMP}/icon.iconset"
  mkdir -p "$ICONSET"
  for spec in 16:icon_16x16 32:icon_16x16@2x 32:icon_32x32 64:icon_32x32@2x \
              128:icon_128x128 256:icon_128x128@2x 256:icon_256x256 \
              512:icon_256x256@2x 512:icon_512x512 1024:icon_512x512@2x; do
    rsvg-convert -w "${spec%%:*}" -h "${spec%%:*}" "${TEMPLATES}/icon.svg" \
      -o "${ICONSET}/${spec#*:}.png"
  done
  iconutil -c icns "$ICONSET" -o "${APP}/Contents/Resources/icon.icns"
  ICON_NOTE="icon.icns — $(ls -1 "$ICONSET" | wc -l | tr -d ' ') sizes, 16–1024px"
  rm -rf "$ICONTMP"
else
  ICON_NOTE="NO ICON — rsvg-convert not found; run 'brew install librsvg' and re-run"
fi

# Ask Launch Services to notice the bundle now rather than whenever it feels
# like it; otherwise a rebuilt icon can stay stale in the Dock.
touch "$APP"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
  -f "$APP" >/dev/null 2>&1 || true

# ── Report ─────────────────────────────────────────────────────────────────
echo ""
echo "Built:    ${APP}"
echo "Project:  ${REPO}"
echo "Node:     ${NODE}"
echo "icp CLI:  ${ICP_DIR:-not found}"
echo "PATH:     ${BAKED_PATH}"
echo "Version:  ${VERSION}"
echo "Icon:     ${ICON_NOTE}"
echo ""
echo "To put it in the Dock: open ${DEST}, then drag \"ICP Deploy\" onto the Dock."
echo ""

if [ "$REVEAL" -eq 1 ]; then
  open -R "$APP"
fi
