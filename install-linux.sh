#!/usr/bin/env bash
# PolyTrader — Linux / VPS installer (Ubuntu 20.04+, Debian 11+, other systemd distros)
# Run once as a normal user (with sudo access) from the repo root.
# Usage: bash install-linux.sh

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

# ─── Root check ──────────────────────────────────────────────────────────────
[[ "$(id -u)" -eq 0 ]] && die "Do not run this script as root. Run as your normal user."

# ─── Node.js ─────────────────────────────────────────────────────────────────
info "Checking Node.js..."
if ! command -v node &>/dev/null; then
  info "Node.js not found. Installing via NodeSource (LTS)..."
  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

NODE_VER=$(node -e "process.stdout.write(process.version)")
NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')
[[ "$NODE_MAJOR" -ge 18 ]] || die "Node.js >= 18 required. Found: $NODE_VER. Update via https://nodejs.org"
success "Node.js $NODE_VER"

# ─── pnpm ────────────────────────────────────────────────────────────────────
info "Checking pnpm..."
if ! command -v pnpm &>/dev/null; then
  info "Installing pnpm..."
  npm install -g pnpm
fi
success "pnpm $(pnpm --version)"

# ─── Build dependencies (better-sqlite3 needs Python + make) ─────────────────
info "Ensuring build tools are present..."
if command -v apt-get &>/dev/null; then
  sudo apt-get install -y --no-install-recommends python3 make g++ 2>/dev/null || true
elif command -v yum &>/dev/null; then
  sudo yum install -y python3 make gcc-c++ 2>/dev/null || true
elif command -v pacman &>/dev/null; then
  sudo pacman -Sy --noconfirm python make gcc 2>/dev/null || true
fi

# ─── Install workspace dependencies ──────────────────────────────────────────
info "Installing npm dependencies (this may take a minute)..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
success "Dependencies installed"

# ─── Build API server ────────────────────────────────────────────────────────
info "Building API server..."
pnpm --filter @workspace/api-server run build
success "API server built"

# ─── Create start script ─────────────────────────────────────────────────────
cat > start.sh << 'EOF'
#!/usr/bin/env bash
# Start PolyTrader (API server + frontend dev server)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
API_PORT="${PORT:-8080}"
FRONTEND_PORT="${FRONTEND_PORT:-5000}"

# Start API server
echo "[API] Starting on port $API_PORT..."
cd "$ROOT/artifacts/api-server"
PORT="$API_PORT" node --enable-source-maps ./dist/index.mjs &
API_PID=$!

# Start frontend
echo "[WEB] Starting on port $FRONTEND_PORT..."
cd "$ROOT"
PORT="$FRONTEND_PORT" BASE_PATH=/ pnpm --filter @workspace/polymarket-trader run dev &
FE_PID=$!

echo ""
echo "PolyTrader is running!"
echo "  API:      http://localhost:$API_PORT"
echo "  Frontend: http://localhost:$FRONTEND_PORT"
echo ""
echo "Press Ctrl+C to stop."

trap "kill $API_PID $FE_PID 2>/dev/null; exit 0" INT TERM
wait
EOF
chmod +x start.sh
success "Created start.sh"

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}Installation complete!${NC}"
echo ""
echo "  To start PolyTrader:    bash start.sh"
echo "  API default port:       8080"
echo "  Frontend default port:  5000"
echo ""
echo "  To use custom ports:"
echo "    PORT=9090 FRONTEND_PORT=3000 bash start.sh"
echo ""
echo "  Database file:  artifacts/api-server/poly.db"
echo "  Credentials:    Configure via the Settings page in the web UI"
echo ""
