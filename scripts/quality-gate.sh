#!/usr/bin/env bash
# quality-gate.sh — mechanical checks before any report
#
# Run from the project root: bash scripts/quality-gate.sh
# Exits 0 if all checks pass; exits 1 if any check fails.
# Designed to run silently on success; verbose on failure.
#
# ── CONFIGURE THESE FOR YOUR STACK ──────────────────────────────────────────
TYPECHECK_CMD="# configure"
LINT_CMD="# configure"
TEST_CMD="# configure"
SRC_DIR="src"
# ────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PASS=0
FAIL=0
FAILURES=()

run_check() {
  local label="$1"
  local cmd="$2"
  if eval "$cmd" > /dev/null 2>&1; then
    echo "  ✓  $label"
  else
    echo "  ✗  $label"
    FAILURES+=("$label")
    FAIL=$((FAIL + 1))
    return 0  # don't exit — collect all failures
  fi
  PASS=$((PASS + 1))
}

echo ""
echo "Quality gate"
echo "────────────"

# 1. Typecheck
run_check "typecheck" "$TYPECHECK_CMD"

# 2. Lint
run_check "lint" "$LINT_CMD"

# 3. Tests
run_check "tests" "$TEST_CMD"

# 4. Forbidden pattern: raw hex colors in /src/
#    Matches #rgb, #rrggbb, #rgba, #rrggbbaa — not inside comments or strings in tokens.css
FORBIDDEN_HEX=$(grep -rn --include="*.ts" --include="*.tsx" --include="*.css" \
  -E '(^|[^&])[^a-zA-Z0-9_-]#[0-9A-Fa-f]{3,8}\b' "$SRC_DIR" 2>/dev/null \
  | grep -v "tokens\.css" \
  | grep -v "//.*#[0-9A-Fa-f]" \
  | grep -v "preview\.html" \
  || true)

if [ -n "$FORBIDDEN_HEX" ]; then
  echo "  ✗  no raw hex in $SRC_DIR"
  echo ""
  echo "     Raw hex found (use design tokens instead):"
  echo "$FORBIDDEN_HEX" | sed 's/^/       /'
  FAILURES+=("no raw hex in $SRC_DIR")
  FAIL=$((FAIL + 1))
else
  echo "  ✓  no raw hex in $SRC_DIR"
  PASS=$((PASS + 1))
fi

# 5. Forbidden pattern: hardcoded hosts or IDs
#    Catches localhost (beyond dev), hardcoded canister/chain IDs — adjust pattern per stack
FORBIDDEN_HOSTS=$(grep -rn --include="*.ts" --include="*.tsx" \
  -E '(https?://(?!localhost)[a-z0-9.-]+\.[a-z]{2,}|mainnet\.|ic0\.app)' "$SRC_DIR" 2>/dev/null \
  | grep -v "\.md:" \
  | grep -v "// " \
  || true)

if [ -n "$FORBIDDEN_HOSTS" ]; then
  echo "  ✗  no hardcoded hosts in $SRC_DIR"
  echo ""
  echo "     Hardcoded hosts found (use env config instead):"
  echo "$FORBIDDEN_HOSTS" | sed 's/^/       /'
  FAILURES+=("no hardcoded hosts in $SRC_DIR")
  FAIL=$((FAIL + 1))
else
  echo "  ✓  no hardcoded hosts in $SRC_DIR"
  PASS=$((PASS + 1))
fi

# 6. Forbidden pattern: cross-unit imports
#    Catches one unit importing directly from another unit's folder.
#    Adjust the unit path pattern to match your directory structure (e.g. /units/, /tools/).
UNIT_PATH_PATTERN="units"   # <-- update to your actual unit folder name
CROSS_IMPORTS=$(grep -rn --include="*.ts" --include="*.tsx" \
  -E "from ['\"].*/$UNIT_PATH_PATTERN/[^'\"]+['\"]" "$SRC_DIR/$UNIT_PATH_PATTERN" 2>/dev/null \
  | grep -v "registry\|index\|_template" \
  | grep -v "//.*from" \
  || true)

if [ -n "$CROSS_IMPORTS" ]; then
  echo "  ✗  no cross-unit imports"
  echo ""
  echo "     Cross-unit imports found:"
  echo "$CROSS_IMPORTS" | sed 's/^/       /'
  FAILURES+=("no cross-unit imports")
  FAIL=$((FAIL + 1))
else
  echo "  ✓  no cross-unit imports"
  PASS=$((PASS + 1))
fi

# ── Result ───────────────────────────────────────────────────────────────────

echo ""
echo "────────────"
if [ $FAIL -eq 0 ]; then
  echo "PASS  ($PASS checks)"
  echo ""
  exit 0
else
  echo "FAIL  ($PASS passed, $FAIL failed)"
  echo ""
  echo "Failed checks:"
  for f in "${FAILURES[@]}"; do
    echo "  - $f"
  done
  echo ""
  exit 1
fi
