#!/data/data/com.termux/files/usr/bin/bash
# ╔══════════════════════════════════════════════════════════╗
# ║          PolyTrader — One-Click Termux Launcher          ║
# ║  Usage: bash polytrader.sh                               ║
# ╚══════════════════════════════════════════════════════════╝

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'
B='\033[0;34m'; C='\033[0;36m'; W='\033[1;37m'; D='\033[2m'; NC='\033[0m'

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERMUX_PREFIX="/data/data/com.termux/files/usr"
API_PID="$ROOT/.pid_api"
FRONT_PID="$ROOT/.pid_front"
API_LOG="$ROOT/api-server.log"
FRONT_LOG="$ROOT/frontend.log"
SETUP_DONE="$ROOT/.termux_setup_done"
API_DIST="$ROOT/artifacts/api-server/dist/index.mjs"

# ── Helpers ───────────────────────────────────────────────────────────────────
header()  { echo ""; echo -e "${B}╔══════════════════════════════════════════════╗"; echo -e "║  ${W}⚡ PolyTrader — Termux Launcher${B}              ║"; echo -e "╚══════════════════════════════════════════════╝${NC}"; echo ""; }
step()    { echo -e "${C}▶ $1${NC}"; }
ok()      { echo -e "${G}✓ $1${NC}"; }
warn()    { echo -e "${Y}⚠ $1${NC}"; }
fail()    { echo -e "${R}✗ $1${NC}"; }
info()    { echo -e "${D}  $1${NC}"; }
divider() { echo -e "${D}──────────────────────────────────────────────${NC}"; }
err()     { echo -e "${R}╔══ ERROR ══════════════════════════════════╗${NC}"; echo -e "${R}║ $1${NC}"; echo -e "${R}╚═══════════════════════════════════════════╝${NC}"; exit 1; }

is_running()  { local f="$1"; [ -f "$f" ] && kill -0 "$(cat "$f")" 2>/dev/null; }
stop_server() {
  local f="$1" n="$2"
  if [ -f "$f" ]; then
    local pid; pid=$(cat "$f"); kill "$pid" 2>/dev/null && ok "Stopped $n (PID $pid)"; rm -f "$f"
  fi
}
wait_for_port() {
  local port="$1" max=25 i=0
  while ! (echo > /dev/tcp/localhost/"$port") 2>/dev/null; do
    i=$((i+1)); [ $i -ge $max ] && return 1; sleep 1; printf "."; done; echo ""
}

cleanup() {
  echo ""; echo -e "${Y}Stopping PolyTrader...${NC}"
  stop_server "$API_PID" "API server"; stop_server "$FRONT_PID" "Frontend"
  echo -e "${G}Goodbye!${NC}"; exit 0
}
trap cleanup SIGINT SIGTERM

# ═══════════════════════════════════════════════════════════════
# FASE KRITIS: Setup environment Termux untuk native compilation
# ═══════════════════════════════════════════════════════════════
setup_build_env() {
  # Wajib untuk better-sqlite3 bisa dikompilasi di Termux
  export CC="clang"
  export CXX="clang++"
  export CFLAGS="-fPIC -I${TERMUX_PREFIX}/include"
  export CXXFLAGS="-fPIC -I${TERMUX_PREFIX}/include"
  export LDFLAGS="-L${TERMUX_PREFIX}/lib"
  export AR="$(command -v llvm-ar 2>/dev/null || command -v ar)"
  export RANLIB="$(command -v llvm-ranlib 2>/dev/null || command -v ranlib)"

  # Python path — node-gyp butuh ini
  local py3; py3="$(command -v python3 2>/dev/null || command -v python 2>/dev/null || echo '')"
  if [ -z "$py3" ]; then err "Python tidak ditemukan! Jalankan: pkg install python"; fi
  export PYTHON="$py3"
  export npm_config_python="$py3"
  export NODE_GYP_FORCE_PYTHON="$py3"

  # Node.js headers directory — ini yang paling sering jadi masalah
  local node_prefix
  node_prefix="$(node -e "process.stdout.write(process.execPath.replace('/bin/node', ''))" 2>/dev/null || echo "$TERMUX_PREFIX")"
  export npm_config_nodedir="$node_prefix"

  # Force compile from source (jangan pakai pre-built binary yang tidak ada untuk Android)
  export npm_config_build_from_source="true"
  export SKIP_SQLITE_BINARY="true"

  info "Build env: CC=$CC, NODEDIR=$npm_config_nodedir"
}

# ═══════════════════════════════════════════════════════════════
# INSTALASI better-sqlite3 DENGAN RETRY + FALLBACK
# ═══════════════════════════════════════════════════════════════
install_sqlite3() {
  local sqlite_node="$ROOT/node_modules/.pnpm/better-sqlite3"*"/node_modules/better-sqlite3/build/Release/better_sqlite3.node"

  # Cek apakah sudah terinstall dan bisa diload
  if ls $sqlite_node 2>/dev/null | grep -q ".node"; then
    ok "better-sqlite3 native binary sudah ada"
    return 0
  fi

  step "Menginstall better-sqlite3 (native module — perlu dikompilasi)..."
  echo ""
  echo -e "${Y}  ⚙ Kompilasi berlangsung, harap tunggu 2-5 menit...${NC}"
  echo ""

  # ── Percobaan 1: pnpm install normal dengan env yang benar ──────────────
  step "Percobaan 1: pnpm install dengan build environment Termux..."
  cd "$ROOT"
  if pnpm install --prefer-offline 2>&1; then
    # Verifikasi bisa diload
    if node -e "require('better-sqlite3')" 2>/dev/null; then
      ok "better-sqlite3 berhasil diinstall (percobaan 1)"
      return 0
    fi
  fi
  warn "Percobaan 1 gagal — mencoba cara alternatif..."

  # ── Percobaan 2: Force rebuild dengan npm ───────────────────────────────
  step "Percobaan 2: Force rebuild better-sqlite3 langsung..."
  local sqlite_pkg_path
  sqlite_pkg_path="$(find "$ROOT/node_modules" -name "package.json" -path "*/better-sqlite3/package.json" 2>/dev/null | head -1 | xargs dirname 2>/dev/null || echo '')"

  if [ -n "$sqlite_pkg_path" ]; then
    cd "$sqlite_pkg_path"
    if npm run build-release 2>&1 || node-gyp rebuild 2>&1; then
      cd "$ROOT"
      if node -e "require('better-sqlite3')" 2>/dev/null; then
        ok "better-sqlite3 berhasil direbuild (percobaan 2)"
        return 0
      fi
    fi
    cd "$ROOT"
  fi
  warn "Percobaan 2 gagal — mencoba cara alternatif..."

  # ── Percobaan 3: node-gyp manual ────────────────────────────────────────
  step "Percobaan 3: Compile manual dengan node-gyp..."
  if ! command -v node-gyp >/dev/null 2>&1; then
    npm install -g node-gyp 2>&1 | tail -2
  fi
  sqlite_pkg_path="$(find "$ROOT/node_modules" -name "binding.gyp" -path "*/better-sqlite3/*" 2>/dev/null | head -1 | xargs dirname 2>/dev/null || echo '')"

  if [ -n "$sqlite_pkg_path" ]; then
    cd "$sqlite_pkg_path"
    if node-gyp configure build --release 2>&1; then
      cd "$ROOT"
      if node -e "require('better-sqlite3')" 2>/dev/null; then
        ok "better-sqlite3 berhasil (percobaan 3)"
        return 0
      fi
    fi
    cd "$ROOT"
  fi

  # ── Semua percobaan gagal ────────────────────────────────────────────────
  echo ""
  echo -e "${R}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${R}║  better-sqlite3 GAGAL dikompilasi                           ║${NC}"
  echo -e "${R}╠══════════════════════════════════════════════════════════════╣${NC}"
  echo -e "${R}║  Coba langkah manual ini di Termux:                         ║${NC}"
  echo -e "${Y}║                                                              ║${NC}"
  echo -e "${Y}║  pkg install nodejs python make clang binutils llvm         ║${NC}"
  echo -e "${Y}║  npm install -g node-gyp                                    ║${NC}"
  echo -e "${Y}║  bash polytrader.sh                                         ║${NC}"
  echo -e "${Y}║                                                              ║${NC}"
  echo -e "${R}║  Jika masih gagal, lihat error di atas dan kirim            ║${NC}"
  echo -e "${R}║  screenshot untuk bantuan lebih lanjut.                     ║${NC}"
  echo -e "${R}╚══════════════════════════════════════════════════════════════╝${NC}"
  exit 1
}

# ═══════════════════════════════════════════════════════════════
# PHASE 1 — INSTALL
# ═══════════════════════════════════════════════════════════════
do_install() {
  divider
  echo -e "${W}📦 INSTALASI PERTAMA KALI${NC}"
  divider
  echo ""

  # ── 1a. Termux system packages ──────────────────────────────────────────
  step "Update repository Termux..."
  pkg update -y 2>&1 | grep -E "upgraded|already|Err" || true
  ok "Repository updated"

  step "Instalasi semua package yang dibutuhkan..."
  # binutils   → ar, ranlib (untuk linking native module)
  # llvm       → llvm-ar, llvm-ranlib (lebih kompatibel)
  # python     → node-gyp butuh python3
  # make clang → compiler toolchain
  pkg install -y nodejs python make clang binutils llvm 2>&1 | grep -vE "^(Get|Hit|Ign|Reading|Building|Setting)" || true
  ok "System packages terinstall"

  # Verifikasi
  echo ""
  echo -e "${D}  Node.js : $(node --version 2>/dev/null || echo 'TIDAK DITEMUKAN — ERROR')${NC}"
  echo -e "${D}  Python3 : $(python3 --version 2>/dev/null || echo 'TIDAK DITEMUKAN — ERROR')${NC}"
  echo -e "${D}  Clang   : $(clang --version 2>/dev/null | head -1 || echo 'TIDAK DITEMUKAN — ERROR')${NC}"
  echo ""

  command -v node   >/dev/null 2>&1 || err "Node.js tidak terinstall! Coba: pkg install nodejs"
  command -v python3>/dev/null 2>&1 || err "Python3 tidak terinstall! Coba: pkg install python"
  command -v clang  >/dev/null 2>&1 || err "Clang tidak terinstall! Coba: pkg install clang"

  # ── 1b. Setup build environment ─────────────────────────────────────────
  step "Konfigurasi build environment untuk native modules..."
  setup_build_env
  ok "Build environment siap"

  # ── 1c. Install node-gyp global ─────────────────────────────────────────
  step "Instalasi node-gyp (tools kompilasi native module)..."
  if ! command -v node-gyp >/dev/null 2>&1; then
    npm install -g node-gyp 2>&1 | tail -3
    ok "node-gyp terinstall: $(node-gyp --version)"
  else
    ok "node-gyp sudah ada: $(node-gyp --version)"
  fi

  # ── 1d. pnpm ────────────────────────────────────────────────────────────
  step "Instalasi pnpm..."
  if ! command -v pnpm >/dev/null 2>&1; then
    npm install -g pnpm 2>&1 | tail -2
    ok "pnpm $(pnpm --version) terinstall"
  else
    ok "pnpm $(pnpm --version) sudah ada"
  fi

  # ── 1e. Install semua dependencies (dengan handling better-sqlite3) ─────
  step "Install semua project dependencies..."
  echo ""
  cd "$ROOT"

  # Install semua kecuali better-sqlite3 dulu (ignore scripts = tidak jalankan build)
  info "Langkah 1/2: Download semua package..."
  pnpm install --ignore-scripts 2>&1 | tail -5 || true

  # Sekarang compile better-sqlite3 secara khusus
  echo ""
  info "Langkah 2/2: Kompilasi better-sqlite3 (ini yang butuh waktu)..."
  setup_build_env   # re-export karena subshell
  install_sqlite3

  echo ""
  ok "Semua dependencies berhasil diinstall!"

  # ── 1f. Build API server ─────────────────────────────────────────────────
  step "Build API server..."
  cd "$ROOT/artifacts/api-server"
  pnpm run build 2>&1 | grep -E "Done|Error|error|⚡" || true
  cd "$ROOT"

  [ -f "$API_DIST" ] || err "Build gagal — file dist tidak ditemukan!"
  ok "API server berhasil di-build"

  # ── 1g. Selesai ──────────────────────────────────────────────────────────
  echo "$(date)" > "$SETUP_DONE"
  echo ""
  divider
  ok "Setup selesai! Melanjutkan ke start..."
  divider
  echo ""
  sleep 1
}

# ═══════════════════════════════════════════════════════════════
# PHASE 2 — REBUILD API jika source berubah
# ═══════════════════════════════════════════════════════════════
do_rebuild_if_needed() {
  if [ ! -f "$API_DIST" ]; then
    step "Build API server..."
    cd "$ROOT/artifacts/api-server" && pnpm run build 2>&1 | grep -E "Done|Error|⚡" || true
    cd "$ROOT"; ok "Build selesai"; return
  fi
  if find "$ROOT/artifacts/api-server/src" -name "*.ts" -newer "$API_DIST" | grep -q .; then
    step "Source berubah — rebuild API server..."
    cd "$ROOT/artifacts/api-server" && pnpm run build 2>&1 | grep -E "Done|Error|⚡" || true
    cd "$ROOT"; ok "Rebuild selesai"
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

  if is_running "$API_PID" || is_running "$FRONT_PID"; then
    warn "Server lama masih jalan — restart..."
    stop_server "$API_PID" "API server"; stop_server "$FRONT_PID" "Frontend"; sleep 1
  fi

  # Tampilkan IP lokal untuk akses dari device lain
  local local_ip; local_ip=$(ip route get 1 2>/dev/null | grep -oP 'src \K\S+' | head -1 || hostname -I 2>/dev/null | awk '{print $1}' || echo "lihat-di-Termux")

  # Start API
  step "API server → port 8080..."
  PORT=8080 node --enable-source-maps "$API_DIST" >> "$API_LOG" 2>&1 &
  echo $! > "$API_PID"
  printf "  Menunggu"; wait_for_port 8080 && ok "API online" || warn "API lambat start, cek: tail -f $API_LOG"

  # Start Frontend
  step "Frontend → port 5000..."
  PORT=5000 BASE_PATH=/ pnpm --filter @workspace/polymarket-trader run dev >> "$FRONT_LOG" 2>&1 &
  echo $! > "$FRONT_PID"
  printf "  Menunggu"; wait_for_port 5000 && ok "Frontend online" || warn "Frontend lambat start"

  echo ""
  echo -e "${G}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${G}║  ✅  PolyTrader AKTIF!                               ║${NC}"
  echo -e "${G}║                                                      ║${NC}"
  echo -e "${G}║  📱  Di HP ini (browser):                            ║${NC}"
  echo -e "${G}║      http://localhost:5000                           ║${NC}"
  echo -e "${G}║                                                      ║${NC}"
  echo -e "${G}║  💻  Dari PC/laptop (WiFi sama):                     ║${NC}"
  echo -e "${G}║      http://${local_ip}:5000                       ║${NC}"
  echo -e "${G}║                                                      ║${NC}"
  echo -e "${G}║  📋  Lihat log: tail -f api-server.log               ║${NC}"
  echo -e "${G}║  🔴  Ctrl+C untuk stop semua server                  ║${NC}"
  echo -e "${G}╚══════════════════════════════════════════════════════╝${NC}"
  echo ""

  # Stream live log
  tail -F "$API_LOG" 2>/dev/null &
  TAIL_PID=$!
  wait "$(cat "$API_PID" 2>/dev/null)" 2>/dev/null || true
  kill "$TAIL_PID" 2>/dev/null || true
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════
header

[ -f "$ROOT/package.json" ] || err "Jalankan dari folder root PolyTrader!"

if [ ! -f "$SETUP_DONE" ] || [ ! -f "$API_DIST" ] || [ ! -d "$ROOT/node_modules" ]; then
  echo -e "${Y}  Deteksi: instalasi pertama kali — setup otomatis...${NC}"; echo ""
  setup_build_env
  do_install
else
  echo -e "${G}  Setup sudah ada — langsung start!${NC}"
  echo -e "${D}  (Hapus .termux_setup_done untuk reinstall penuh)${NC}"; echo ""
  setup_build_env
  do_rebuild_if_needed
fi

do_start
