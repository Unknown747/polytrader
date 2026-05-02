#!/data/data/com.termux/files/usr/bin/bash
# PolyTrader — Termux (Android) installer
# Run from the repo root after cloning.
# Usage: bash install-termux.sh
#
# Notes:
#   • The Go API server is built natively via `go build` — no CGO required.
#     The SQLite driver (modernc.org/sqlite) is pure Go, so it compiles cleanly
#     on all platforms including Termux/ARM.

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

# ─── Verify we are inside Termux ──────────────────────────────────────────────
[[ -d "/data/data/com.termux" ]] || die "This script is for Termux only. Use install-linux.sh on a VPS/desktop."

# ─── Termux packages ──────────────────────────────────────────────────────────
info "Updating package index..."
pkg update -y 2>/dev/null || true

info "Installing required packages (golang, nodejs)..."
pkg install -y golang nodejs 2>/dev/null \
  || die "pkg install failed. Run: pkg update && pkg upgrade, then retry."
success "Termux packages ready"

# ─── pnpm ─────────────────────────────────────────────────────────────────────
info "Checking pnpm..."
if ! command -v pnpm &>/dev/null; then
  info "Installing pnpm..."
  npm install -g pnpm
fi
success "pnpm $(pnpm --version)"

# ─── Build Go API server ──────────────────────────────────────────────────────
info "Building Go API server (pure Go — no CGO needed)..."
mkdir -p artifacts/api-server
(cd server && go build -o poly-server .)
success "API server built (server/poly-server)"

# ─── Install frontend dependencies ────────────────────────────────────────────
info "Installing frontend dependencies..."
pnpm install 2>&1 || die "pnpm install failed. Check your network connection and retry."
success "Frontend dependencies installed"

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
cd "$ROOT/server"
DB_DIR="$ROOT/artifacts/api-server" PORT="$API_PORT" ./poly-server \
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
echo "  Database:    artifacts/api-server/poly.db"
echo "  Credentials: Configure via the Settings page in the web UI"
echo ""
