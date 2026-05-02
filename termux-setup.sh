#!/data/data/com.termux/files/usr/bin/bash
# PolyTrader — Termux Setup Script
# Run once: bash termux-setup.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[OK]${NC} $1"; }
info() { echo -e "${BLUE}[..] $1${NC}"; }
warn() { echo -e "${YELLOW}[!!] $1${NC}"; }
err()  { echo -e "${RED}[ERROR] $1${NC}"; exit 1; }

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     PolyTrader — Termux Setup v1.0       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Update & install system packages ──────────────────────────────────────
info "Updating Termux package list..."
pkg update -y 2>&1 | tail -3
log "Termux packages updated"

info "Installing build tools and runtime (nodejs, python, make, clang)..."
pkg install -y nodejs python make clang pkg-config 2>&1 | tail -5
log "System packages installed"

# ── 2. Check Node.js version ─────────────────────────────────────────────────
NODE_VER=$(node --version 2>/dev/null || echo "none")
info "Node.js version: $NODE_VER"
if [[ "$NODE_VER" == "none" ]]; then
  err "Node.js not found after install. Try: pkg install nodejs"
fi

# ── 3. Install pnpm ───────────────────────────────────────────────────────────
info "Installing pnpm package manager..."
npm install -g pnpm 2>&1 | tail -3
PNPM_VER=$(pnpm --version 2>/dev/null || echo "none")
log "pnpm $PNPM_VER installed"

# ── 4. Install project dependencies ──────────────────────────────────────────
info "Installing project dependencies (this may take a few minutes)..."
info "Note: better-sqlite3 will be compiled from source — normal to take 1-2 min"
pnpm install 2>&1
log "All dependencies installed"

# ── 5. Initial API server build ───────────────────────────────────────────────
info "Building API server..."
cd artifacts/api-server
pnpm run build 2>&1
cd ../..
log "API server built successfully"

# ── 6. Write the start script ─────────────────────────────────────────────────
cat > termux-start.sh << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
# PolyTrader — Start Script (Termux)
# Usage: bash termux-start.sh

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_PID_FILE="$ROOT/.api.pid"
FRONT_PID_FILE="$ROOT/.front.pid"

stop_all() {
  echo -e "${YELLOW}Stopping servers...${NC}"
  [ -f "$API_PID_FILE" ] && kill "$(cat "$API_PID_FILE")" 2>/dev/null; rm -f "$API_PID_FILE"
  [ -f "$FRONT_PID_FILE" ] && kill "$(cat "$FRONT_PID_FILE")" 2>/dev/null; rm -f "$FRONT_PID_FILE"
  echo -e "${GREEN}Stopped.${NC}"
  exit 0
}

trap stop_all SIGINT SIGTERM

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        PolyTrader — Starting...          ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

# Rebuild API if source changed
echo -e "${BLUE}[..] Building API server...${NC}"
cd "$ROOT/artifacts/api-server"
pnpm run build 2>&1 | grep -E "Done|Error|error" || true
cd "$ROOT"

# Start API server
echo -e "${BLUE}[..] Starting API server on port 8080...${NC}"
PORT=8080 node --enable-source-maps "$ROOT/artifacts/api-server/dist/index.mjs" \
  >> "$ROOT/api-server.log" 2>&1 &
echo $! > "$API_PID_FILE"
sleep 2

# Check API is alive
if curl -s http://localhost:8080/api/healthz > /dev/null 2>&1; then
  echo -e "${GREEN}[OK] API server running — http://localhost:8080${NC}"
else
  echo -e "${YELLOW}[!!] API server may still be starting up...${NC}"
fi

# Start frontend dev server
echo -e "${BLUE}[..] Starting frontend on port 5000...${NC}"
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/polymarket-trader run dev \
  >> "$ROOT/frontend.log" 2>&1 &
echo $! > "$FRONT_PID_FILE"
sleep 3

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  PolyTrader is running!                      ║${NC}"
echo -e "${GREEN}║                                              ║${NC}"
echo -e "${GREEN}║  Frontend : http://localhost:5000            ║${NC}"
echo -e "${GREEN}║  API      : http://localhost:8080            ║${NC}"
echo -e "${GREEN}║                                              ║${NC}"
echo -e "${GREEN}║  Logs: tail -f api-server.log                ║${NC}"
echo -e "${GREEN}║        tail -f frontend.log                  ║${NC}"
echo -e "${GREEN}║                                              ║${NC}"
echo -e "${GREEN}║  Press Ctrl+C to stop all servers            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# Keep running, show combined logs
tail -f "$ROOT/api-server.log" &
wait
EOF

chmod +x termux-start.sh

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Setup selesai!                              ║${NC}"
echo -e "${GREEN}║                                              ║${NC}"
echo -e "${GREEN}║  Jalankan app dengan:                        ║${NC}"
echo -e "${GREEN}║    bash termux-start.sh                      ║${NC}"
echo -e "${GREEN}║                                              ║${NC}"
echo -e "${GREEN}║  Buka di browser:                            ║${NC}"
echo -e "${GREEN}║    http://localhost:5000                      ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
