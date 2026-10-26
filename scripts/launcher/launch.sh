#!/bin/bash
# ICP Deploy — Dock launcher.
#
# @@GENERATED_NOTE@@
#
# What it does, in order:
#   1. If our dashboard is already answering on the port, just open the browser.
#   2. If something else holds the port, say so and stop — never clobber it.
#   3. Otherwise start `node server.js` detached, wait for it to answer, and
#      open the browser. If it never answers, show the tail of the log.
#
# Startup can take a couple of seconds, during which an impatient second click
# would race the first and start a second server, so the whole thing is behind
# an atomic mkdir lock.
#
# Why the baked-in absolute paths: a process launched from the Dock inherits a
# minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin), so neither `node` nor the `icp`
# CLI that server.js spawns is resolvable. Both are pinned at generation time.

set -uo pipefail

REPO="@@REPO@@"
NODE="@@NODE@@"
export PATH="@@PATH@@"

PORT="${ICP_DEPLOY_PORT:-3456}"
URL="http://localhost:${PORT}"
LOG="${REPO}/server.log"

alert() {
  /usr/bin/osascript \
    -e 'on run argv' \
    -e 'display alert "ICP Deploy" message (item 1 of argv) as critical' \
    -e 'end run' -- "$1" >/dev/null 2>&1
}

# True only when the thing on the port is *our* dashboard, identified by the
# page title. A bare TCP connect would also succeed against a stranger.
#
# Deliberately not a pipeline. `curl … | grep -q` looks equivalent and is not:
# grep -q exits at the first match, curl dies of SIGPIPE, and `pipefail` then
# reports the pipeline as failed — so the probe returns false on a perfectly
# healthy server, every time. Match in the shell instead.
ours() {
  local body
  body="$(/usr/bin/curl -sf -m 2 "${URL}/" 2>/dev/null)" || return 1
  case "$body" in
    *"<title>ICP Deploy</title>"*) return 0 ;;
    *) return 1 ;;
  esac
}

port_held() {
  /usr/sbin/lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1
}

if ours; then
  /usr/bin/open "$URL"
  exit 0
fi

# Not up yet, so we are about to start it — take the lock. mkdir is atomic, so
# a second click loses the race and exits instead of starting a rival server.
# A lock older than two minutes is stale (the holder was force-quit) and is
# reclaimed; anything younger means a launch is genuinely in flight.
LOCK="${TMPDIR:-/tmp}/icp-deploy-launcher-${PORT}.lock"
if [ -d "$LOCK" ] && [ -z "$(/usr/bin/find "$LOCK" -maxdepth 0 -mmin -2 2>/dev/null)" ]; then
  /bin/rmdir "$LOCK" 2>/dev/null
fi
if ! /bin/mkdir "$LOCK" 2>/dev/null; then
  exit 0
fi
trap '/bin/rmdir "$LOCK" 2>/dev/null' EXIT INT TERM

if port_held; then
  alert "Port ${PORT} is already in use by something that isn't the ICP Deploy dashboard. Free it, or set ICP_DEPLOY_PORT to a different port, then try again."
  exit 1
fi

if [ ! -x "$NODE" ]; then
  alert "Node was expected at ${NODE} and isn't there. Re-run scripts/make-launcher.sh to re-pin it."
  exit 1
fi

if [ ! -f "${REPO}/server.js" ]; then
  alert "server.js was expected in ${REPO} and isn't there. If the project moved, re-run scripts/make-launcher.sh from its new location."
  exit 1
fi

cd "$REPO" || { alert "Could not enter ${REPO}."; exit 1; }

# Truncated per launch, not appended: one run's worth of log is what's useful,
# and *.log is gitignored so this leaves no diff.
: > "$LOG"
# PORT is what server.js reads (server.js:2478); ICP_DEPLOY_PORT is only this
# script's way of being told about it. Passing one without the other is the bug
# this comment exists to prevent: the launcher polls its port while the server
# listens on the default one, and the launch times out on a healthy server.
PORT="$PORT" PWD="$REPO" nohup "$NODE" server.js >>"$LOG" 2>&1 &
SERVER_PID=$!

# Poll for readiness rather than sleeping a fixed amount — opening the browser
# before the listener is up shows a connection-refused page.
for _ in $(seq 1 60); do
  if ours; then
    /usr/bin/open "$URL"
    exit 0
  fi
  if ! /bin/kill -0 "$SERVER_PID" 2>/dev/null; then
    alert "The server exited on startup. Last lines of ${LOG}:"$'\n\n'"$(/usr/bin/tail -n 12 "$LOG")"
    exit 1
  fi
  /bin/sleep 0.3
done

alert "The server did not answer on ${URL} within 18 seconds. Last lines of ${LOG}:"$'\n\n'"$(/usr/bin/tail -n 12 "$LOG")"
exit 1
