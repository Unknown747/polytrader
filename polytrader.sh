#!/data/data/com.termux/files/usr/bin/bash
# ╔══════════════════════════════════════════════════════════╗
# ║          PolyTrader — One-Click Termux Launcher          ║
# ║  Usage: bash polytrader.sh                               ║
# ║  First run: auto-installs everything then starts app     ║
# ║  Next runs: langsung start                               ║
# ╚══════════════════════════════════════════════════════════╝

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
R='\033[0;31m'   # Red
G='\033[0;32m'   # Green
Y='\033[1;33m'   # Yellow
B='\033[0;34m'   # Blue
C='\033[0;36m'   # Cyan
W='\033[1;37m'   # White Bold
D='\033[2m'      # Dim
NC='\033[0m'     # Reset

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_PID="$ROOT/.pid_api"
FRONT_PID="$ROOT/.pid_front"
API_LOG="$ROOT/api-server.log"
FRONT_LOG="$ROOT/frontend.log"
SETUP_DONE="$ROOT/.termux_setup_done"
API_DIST="$ROOT/artifacts/api-server/dist/index.mjs"

# ── Helpers ───────────────────────────────────────────────────────────────────
header() {
  echo ""
  echo -e "${B}╔══════════════════════════════════════════════╗${NC}"
  echo -e "${B}║  ${W}⚡ PolyTrader — Termux Launcher${B}              ║${NC}"
  echo -e "${B}╚══════════════════════════════════════════════╝${NC}"
  echo ""
}

step()    { echo -e "${C}▶ $1${NC}"; }
ok()      { echo -e "${G}✓ $1${NC}"; }
warn()    { echo -e "${Y}⚠ $1${NC}"; }
err()     { echo -e "${R}✗ $1${NC}"; exit 1; }
info()    { echo -e "${D}  $1${NC}"; }
divider() { echo -e "${D}──────────────────────────────────────${NC}"; }

is_running() {
  local pid_file="$1"
  [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null
}

stop_server() {
  local pid_file="$1" name="$2"
  if [ -f "$pid_file" ]; then
    local pid; pid=$(cat "$pid_file")
    if kill "$pid" 2>/dev/null; then
      ok "Stopped $name (PID $pid)"
    fi
    rm -f "$pid_file"
  fi
}

wait_for_port() {
  local port="$1" label="$2" max=20 i=0
  while ! (echo > /dev/tcp/localhost/"$port") 2>/dev/null; do
    i=$((i+1)); [ $i -ge $max ] && { warn "$label belum merespons — cek $API_LOG"; return 1; }
    sleep 1; printf "."
  done
  echo ""
}

# ── Stop handler ──────────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo -e "${Y}Stopping PolyTrader...${NC}"
  stop_server "$API_PID"   "API server"
  stop_server "$FRONT_PID" "Frontend"
  echo -e "${G}Goodbye!${NC}"
  exit 0
}
trap cleanup SIGINT SIGTERM

# ═══════════════════════════════════════════════════════════════
# PHASE 1 — INSTALL (hanya jika belum pernah setup)
# ═══════════════════════════════════════════════════════════════
do_install() {
  divider
  echo -e "${W}📦 INSTALASI PERTAMA KALI${NC}"
  divider
  echo ""

  # 1a. Termux system packages
  step "Update repository Termux..."
  pkg update -y -o Dpkg::Options::="--force-confnew" 2>&1 | grep -E "upgraded|installed|up to date|Err" || true
  ok "Repository updated"

  step "Instalasi package sistem (nodejs, python, make, clang)..."
  local missing_pkgs=()
  command -v node  >/dev/null 2>&1 || missing_pkgs+=("nodejs")
  command -v python3 >/dev/null 2>&1 || missing_pkgs+=("python")
  command -v make  >/dev/null 2>&1 || missing_pkgs+=("make")
  command -v clang >/dev/null 2>&1 || missing_pkgs+=("clang")
  pkg-config --version >/dev/null 2>&1 || missing_pkgs+=("pkg-config")

  if [ ${#missing_pkgs[@]} -gt 0 ]; then
    pkg install -y "${missing_pkgs[@]}" 2>&1 | grep -E "Inst|Err" || true
    ok "Installed: ${missing_pkgs[*]}"
  else
    ok "System packages sudah ada"
  fi

  info "Node.js: $(node --version 2>/dev/null || echo 'N/A')"
  info "Python:  $(python3 --version 2>/dev/null || echo 'N/A')"

  # 1b. pnpm
  step "Instalasi pnpm..."
  if ! command -v pnpm >/dev/null 2>&1; then
    npm install -g pnpm 2>&1 | tail -2
    ok "pnpm $(pnpm --version) terinstall"
  else
    ok "pnpm $(pnpm --version) sudah ada"
  fi

  # 1c. Node dependencies
  step "Install project dependencies (harap tunggu — kompilasi native module)..."
  info "better-sqlite3 akan dikompilasi dari source, bisa 2-3 menit..."
  echo ""
  cd "$ROOT"
  pnpm install 2>&1 || err "pnpm install gagal. Coba jalankan: pkg install python make clang"
  echo ""
  ok "Semua dependencies berhasil diinstall"

  # 1d. Build API server
  step "Build API server..."
  cd "$ROOT/artifacts/api-server"
  pnpm run build 2>&1 | grep -E "Done|Error|error|⚡" || true
  cd "$ROOT"
  ok "API server berhasil di-build"

  # 1e. Mark setup as done
  echo "$(date)" > "$SETUP_DONE"

  echo ""
  divider
  ok "Setup selesai! Melanjutkan ke start..."
  divider
  echo ""
  sleep 1
}

# ═══════════════════════════════════════════════════════════════
# PHASE 2 — REBUILD API (jika source berubah sejak build terakhir)
# ═══════════════════════════════════════════════════════════════
do_rebuild_if_needed() {
  local src_dir="$ROOT/artifacts/api-server/src"
  local dist_file="$API_DIST"

  if [ ! -f "$dist_file" ]; then
    step "Build API server (pertama kali)..."
    cd "$ROOT/artifacts/api-server" && pnpm run build 2>&1 | grep -E "Done|Error|⚡" || true
    cd "$ROOT"
    ok "Build selesai"
    return
  fi

  # Check if any source file is newer than the dist
  if find "$src_dir" -name "*.ts" -newer "$dist_file" | grep -q .; then
    step "Source code berubah — rebuild API server..."
    cd "$ROOT/artifacts/api-server" && pnpm run build 2>&1 | grep -E "Done|Error|⚡" || true
    cd "$ROOT"
    ok "Rebuild selesai"
  else
    ok "API server up-to-date, skip rebuild"
  fi
}

# ═══════════════════════════════════════════════════════════════
# PHASE 3 — START
# ═══════════════════════════════════════════════════════════════
do_start() {
  divider
  echo -e "${W}🚀 MENJALANKAN SERVER${NC}"
  divider
  echo ""

  # Stop stale servers first
  if is_running "$API_PID" || is_running "$FRONT_PID"; then
    warn "Server lama masih berjalan — restart..."
    stop_server "$API_PID"   "API server"
    stop_server "$FRONT_PID" "Frontend"
    sleep 1
  fi

  # Start API server
  step "Menjalankan API server di port 8080..."
  PORT=8080 node --enable-source-maps "$API_DIST" >> "$API_LOG" 2>&1 &
  echo $! > "$API_PID"
  printf "  Menunggu"
  wait_for_port 8080 "API" && ok "API server online — http://localhost:8080"

  # Start frontend
  step "Menjalankan frontend di port 5000..."
  PORT=5000 BASE_PATH=/ pnpm --filter @workspace/polymarket-trader run dev \
    >> "$FRONT_LOG" 2>&1 &
  echo $! > "$FRONT_PID"
  printf "  Menunggu"
  wait_for_port 5000 "Frontend" && ok "Frontend online — http://localhost:5000"

  echo ""
  echo -e "${G}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${G}║  ✅  PolyTrader AKTIF                            ║${NC}"
  echo -e "${G}║                                                  ║${NC}"
  echo -e "${G}║  🌐  Buka browser di:                            ║${NC}"
  echo -e "${G}║      http://localhost:5000                       ║${NC}"
  echo -e "${G}║                                                  ║${NC}"
  echo -e "${G}║  💡  Tips Termux:                                ║${NC}"
  echo -e "${G}║  • Buka browser bawaan Android → localhost:5000  ║${NC}"
  echo -e "${G}║  • Dari PC/laptop: http://<IP_HP>:5000           ║${NC}"
  echo -e "${G}║                                                  ║${NC}"
  echo -e "${G}║  📋  Live logs (Ctrl+C untuk stop):              ║${NC}"
  echo -e "${G}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "${D}  API log  : tail -f $API_LOG${NC}"
  echo -e "${D}  Front log: tail -f $FRONT_LOG${NC}"
  echo ""
  echo -e "${Y}  Tekan Ctrl+C untuk mematikan semua server${NC}"
  echo ""

  # Stream live API log
  tail -F "$API_LOG" 2>/dev/null &
  TAIL_PID=$!
  # Wait for either child to die
  wait "$(cat "$API_PID" 2>/dev/null)" 2>/dev/null || true
  kill "$TAIL_PID" 2>/dev/null || true
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════
header

# Detect environment
if [ ! -f "$ROOT/package.json" ]; then
  err "Jalankan script ini dari folder root PolyTrader!"
fi

# First-time setup?
if [ ! -f "$SETUP_DONE" ] || [ ! -f "$API_DIST" ] || [ ! -d "$ROOT/node_modules" ]; then
  echo -e "${Y}  Deteksi: instalasi pertama kali — setup otomatis...${NC}"
  echo ""
  do_install
else
  echo -e "${G}  Instalasi sudah ada — langsung start!${NC}"
  echo -e "${D}  (Hapus .termux_setup_done untuk reinstall penuh)${NC}"
  echo ""
  do_rebuild_if_needed
fi

do_start
