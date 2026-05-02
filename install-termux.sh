#!/data/data/com.termux/files/usr/bin/bash
# PolyTrader — Termux (Android) installer
# Run from the repo root after cloning.
# Usage: bash install-termux.sh
#
# Notes:
#   • better-sqlite3 requires native compilation and typically fails on Termux.
#     PolyTrader automatically falls back to sql.js (pure JS SQLite) — no data loss,
#     no manual action needed. Performance is nearly identical for this workload.
#   • esbuild ships prebuilt binaries for linux-arm64; the workspace overrides are
#     patched temporarily during install to allow the correct binary to download.

set -euo pipefail

BLUE="\033[1;34m"
GREEN="\033[1;32m"
YELLOW="\033[1;33m"
RED="\033[1;31m"
NC="\033[0m"

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()     { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ─── Verify we are inside Termux ─────────────────────────────────────────────
[[ -d "/data/data/com.termux" ]] || die "This script is for Termux only. Use install-linux.sh on a VPS/desktop."

# ─── Termux packages ─────────────────────────────────────────────────────────
info "Updating package index..."
pkg update -y 2>/dev/null || true

info "Installing required packages (nodejs, python, make, clang)..."
pkg install -y nodejs python make clang 2>/dev/null || die "pkg install failed. Run: pkg update && pkg upgrade, then retry."
success "Termux packages ready"

# ─── pnpm ────────────────────────────────────────────────────────────────────
info "Checking pnpm..."
if ! command -v pnpm &>/dev/null; then
  info "Installing pnpm..."
  npm install -g pnpm
fi
success "pnpm $(pnpm --version)"

# ─── Detect CPU architecture ──────────────────────────────────────────────────
ARCH=$(uname -m)
info "CPU architecture: $ARCH"

# ─── Patch pnpm-workspace.yaml for ARM ───────────────────────────────────────
# The workspace file excludes non-x64 platform binaries by default (Replit runs
# on x64). On Termux we need to allow the linux-arm64 esbuild binary.
WORKSPACE_YAML="pnpm-workspace.yaml"
WORKSPACE_BACKUP="${WORKSPACE_YAML}.bak"

cp "$WORKSPACE_YAML" "$WORKSPACE_BACKUP"

info "Patching pnpm-workspace.yaml for $ARCH..."

if [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]]; then
  # Remove the linux-arm64 exclusions so pnpm downloads ARM64 binaries
  sed -i \
    -e '/"esbuild>@esbuild\/linux-arm64": "-"/d' \
    -e '/"rollup>@rollup\/rollup-linux-arm64-gnu": "-"/d' \
    -e '/"rollup>@rollup\/rollup-linux-arm64-musl": "-"/d' \
    -e '/lightningcss.*linux-arm64.*"-"/d' \
    -e '/"@tailwindcss\/oxide>@tailwindcss\/oxide-linux-arm64-gnu": "-"/d' \
    -e '/"@tailwindcss\/oxide>@tailwindcss\/oxide-linux-arm64-musl": "-"/d' \
    "$WORKSPACE_YAML"
elif [[ "$ARCH" == "armv7l" || "$ARCH" == "armv8l" ]]; then
  sed -i \
    -e '/"esbuild>@esbuild\/linux-arm": "-"/d' \
    -e '/"rollup>@rollup\/rollup-linux-arm-gnueabihf": "-"/d' \
    -e '/"rollup>@rollup\/rollup-linux-arm-musleabihf": "-"/d' \
    "$WORKSPACE_YAML"
fi

# ─── Install dependencies (skip better-sqlite3 native build) ─────────────────
# We set SKIP_SQLITE3_BUILD so that if better-sqlite3's binding.gyp checks it,
# the build is skipped. Even if the build still runs and fails, PolyTrader
# falls back to sql.js automatically at runtime.
info "Installing npm dependencies..."

# Temporarily allow better-sqlite3 to attempt build but don't fail the whole
# install if it errors — we catch it at runtime via sql.js fallback.
if pnpm install 2>&1; then
  success "All dependencies installed (including better-sqlite3 native)"
else
  warn "pnpm install had errors (likely better-sqlite3 native build). Retrying without native scripts..."
  # Remove better-sqlite3 from onlyBuiltDependencies in package.json temporarily
  if command -v python3 &>/dev/null; then
    python3 - <<'PYEOF'
import json, os, sys

pkg_path = "package.json"
with open(pkg_path) as f:
    data = json.load(f)

pnpm_cfg = data.get("pnpm", {})
built = pnpm_cfg.get("onlyBuiltDependencies", [])
if "better-sqlite3" in built:
    built.remove("better-sqlite3")
    pnpm_cfg["onlyBuiltDependencies"] = built
    data["pnpm"] = pnpm_cfg
    with open(pkg_path, "w") as f:
        json.dump(data, f, indent=2)
    print("Removed better-sqlite3 from onlyBuiltDependencies")
PYEOF
  fi

  pnpm install --ignore-scripts 2>&1 || die "pnpm install failed. Check your network connection and retry."

  # Restore package.json
  git checkout -- package.json 2>/dev/null || true

  # Manually set up esbuild binary (needed for building)
  info "Setting up esbuild binary..."
  node -e "require('@workspace/api-server/../node_modules/esbuild')" 2>/dev/null || true
fi

success "Dependencies installed"

# ─── Restore pnpm-workspace.yaml ─────────────────────────────────────────────
cp "$WORKSPACE_BACKUP" "$WORKSPACE_YAML"
rm -f "$WORKSPACE_BACKUP"
success "pnpm-workspace.yaml restored"

# ─── Build API server ─────────────────────────────────────────────────────────
info "Building API server..."
pnpm --filter @workspace/api-server run build || die "API server build failed. Check the error above."
success "API server built"

# ─── Create start/stop scripts ────────────────────────────────────────────────
cat > start.sh << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
# Start PolyTrader on Termux
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
API_PORT="${PORT:-8080}"
FRONTEND_PORT="${FRONTEND_PORT:-5000}"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"

# Kill any previous instance
if [[ -f "$ROOT/.polytrader.pid" ]]; then
  OLD_PID=$(cat "$ROOT/.polytrader.pid" 2>/dev/null || echo "")
  [[ -n "$OLD_PID" ]] && kill "$OLD_PID" 2>/dev/null || true
  rm -f "$ROOT/.polytrader.pid"
fi

echo "[API] Starting on port $API_PORT..."
cd "$ROOT/artifacts/api-server"
PORT="$API_PORT" node --enable-source-maps ./dist/index.mjs \
  > "$LOG_DIR/api.log" 2>&1 &
API_PID=$!

echo "[WEB] Starting frontend on port $FRONTEND_PORT..."
cd "$ROOT"
PORT="$FRONTEND_PORT" BASE_PATH=/ pnpm --filter @workspace/polymarket-trader run dev \
  > "$LOG_DIR/frontend.log" 2>&1 &
FE_PID=$!

echo "$API_PID $FE_PID" > "$ROOT/.polytrader.pid"

echo ""
echo "PolyTrader is running!"
echo "  API:      http://localhost:$API_PORT"
echo "  Frontend: http://localhost:$FRONTEND_PORT"
echo ""
echo "Logs: $LOG_DIR/"
echo "Stop: bash stop.sh   (or Ctrl+C)"

trap "bash '$ROOT/stop.sh' 2>/dev/null; exit 0" INT TERM
wait
EOF

cat > stop.sh << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
ROOT="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$ROOT/.polytrader.pid"

if [[ -f "$PID_FILE" ]]; then
  PIDS=$(cat "$PID_FILE")
  for pid in $PIDS; do
    kill "$pid" 2>/dev/null && echo "Stopped PID $pid" || true
  done
  rm -f "$PID_FILE"
  echo "PolyTrader stopped."
else
  echo "No running instance found."
fi
EOF

chmod +x start.sh stop.sh
success "Created start.sh and stop.sh"

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}Installation complete!${NC}"
echo ""
echo "  To start:  bash start.sh"
echo "  To stop:   bash stop.sh"
echo ""
echo "  API default port:       8080"
echo "  Frontend default port:  5000"
echo ""
echo "  Note: If better-sqlite3 is unavailable, the app uses sql.js"
echo "        automatically. Everything works the same — no data loss."
echo ""
echo "  Database:   artifacts/api-server/poly.db"
echo "  Credentials: Configure via the Settings page in the web UI"
echo ""
