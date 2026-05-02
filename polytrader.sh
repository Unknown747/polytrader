#!/data/data/com.termux/files/usr/bin/bash
# ╔══════════════════════════════════════════════════════════╗
# ║          PolyTrader — One-Click Termux Launcher          ║
# ╠══════════════════════════════════════════════════════════╣
# ║  bash polytrader.sh             → install & start        ║
# ║  bash polytrader.sh --repair    → fix better-sqlite3     ║
# ║  bash polytrader.sh --update    → git pull + rebuild     ║
# ║  bash polytrader.sh --reset     → reinstall penuh        ║
# ║  bash polytrader.sh --stop      → matikan server         ║
# ║  bash polytrader.sh --status    → cek status server      ║
# ║  bash polytrader.sh --logs      → lihat live logs        ║
# ╚══════════════════════════════════════════════════════════╝

set -euo pipefail
SECONDS=0   # bash builtin — untuk hitung elapsed time

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
LOCK_SUM="$ROOT/.pnpm_lock_sum"
API_DIST="$ROOT/artifacts/api-server/dist/index.mjs"
MIN_NODE=18
LOG_MAX_KB=512   # Rotasi log setiap 512 KB

# ── Parse argumen ─────────────────────────────────────────────────────────────
MODE="${1:-}"

# ── Helpers ───────────────────────────────────────────────────────────────────
header() {
  clear 2>/dev/null || true
  echo ""
  echo -e "${B}╔══════════════════════════════════════════════╗"
  echo -e "║  ${W}⚡ PolyTrader — Termux Launcher${B}              ║"
  echo -e "╚══════════════════════════════════════════════╝${NC}"
  echo ""
}
step()    { echo -e "${C}▶ $1${NC}"; }
ok()      { echo -e "${G}✓ $1${NC}"; }
warn()    { echo -e "${Y}⚠ $1${NC}"; }
info()    { echo -e "${D}  $1${NC}"; }
divider() { echo -e "${D}──────────────────────────────────────────────${NC}"; }
elapsed() { echo -e "${D}  Waktu: ${SECONDS}s${NC}"; }
err() {
  echo ""
  echo -e "${R}╔══ ERROR ══════════════════════════════════════╗${NC}"
  echo -e "${R}║  $1${NC}"
  echo -e "${R}╚═══════════════════════════════════════════════╝${NC}"
  echo ""
  exit 1
}

# ── Port helper (nc fallback jika /dev/tcp tidak tersedia) ────────────────────
port_open() {
  local port="$1"
  (echo > /dev/tcp/localhost/"$port") 2>/dev/null && return 0
  nc -z localhost "$port" 2>/dev/null && return 0
  return 1
}

wait_for_port() {
  local port="$1" label="${2:-port $1}" max=30 i=0
  while ! port_open "$port"; do
    i=$((i+1))
    [ $i -ge $max ] && { echo ""; warn "$label belum merespons setelah ${max}s"; return 1; }
    sleep 1; printf "."
  done
  echo ""
}

# ── Port conflict check ───────────────────────────────────────────────────────
check_port_free() {
  local port="$1" label="$2"
  if port_open "$port"; then
    # Coba cari proses yang memakainya
    local who=""
    who=$(grep ":$(printf '%04X' "$port") " /proc/net/tcp 2>/dev/null | awk '{print $10}' | head -1 || true)
    if [ -n "$who" ]; then
      local comm; comm=$(cat "/proc/$who/comm" 2>/dev/null || echo "unknown")
      warn "Port $port sudah dipakai oleh proses: $comm (PID $who)"
    else
      warn "Port $port sudah dipakai oleh proses lain"
    fi
    return 1
  fi
  return 0
}

# ── Log rotation ──────────────────────────────────────────────────────────────
rotate_log() {
  local logfile="$1"
  if [ -f "$logfile" ]; then
    local size_kb; size_kb=$(( $(wc -c < "$logfile" 2>/dev/null || echo 0) / 1024 ))
    if [ "$size_kb" -gt "$LOG_MAX_KB" ]; then
      local backup="${logfile%.log}.old.log"
      mv "$logfile" "$backup"
      info "Log dirotasi: $backup (${size_kb}KB)"
    fi
  fi
}

# ── Process management ────────────────────────────────────────────────────────
is_running()  { local f="$1"; [ -f "$f" ] && kill -0 "$(cat "$f")" 2>/dev/null; }
stop_server() {
  local f="$1" n="$2"
  if [ -f "$f" ]; then
    local pid; pid=$(cat "$f")
    if kill -TERM "$pid" 2>/dev/null; then
      # Tunggu max 3 detik, lalu SIGKILL
      local i=0
      while kill -0 "$pid" 2>/dev/null && [ $i -lt 3 ]; do sleep 1; i=$((i+1)); done
      kill -KILL "$pid" 2>/dev/null || true
      ok "Stopped $n (PID $pid)"
    fi
    rm -f "$f"
  fi
}

cleanup() {
  echo ""
  echo -e "${Y}Stopping PolyTrader...${NC}"
  stop_server "$API_PID" "API server"
  stop_server "$FRONT_PID" "Frontend"
  echo -e "${G}Goodbye! (${SECONDS}s uptime)${NC}"
  exit 0
}
trap cleanup SIGINT SIGTERM

# ═══════════════════════════════════════════════════════════════
# BUILD ENVIRONMENT — wajib untuk better-sqlite3
# ═══════════════════════════════════════════════════════════════
setup_build_env() {
  export CC="clang"
  export CXX="clang++"
  export CFLAGS="-fPIC -I${TERMUX_PREFIX}/include"
  export CXXFLAGS="-fPIC -I${TERMUX_PREFIX}/include"
  export LDFLAGS="-L${TERMUX_PREFIX}/lib"
  export AR="$(command -v llvm-ar 2>/dev/null || command -v ar 2>/dev/null || echo ar)"
  export RANLIB="$(command -v llvm-ranlib 2>/dev/null || command -v ranlib 2>/dev/null || echo ranlib)"

  local py3; py3="$(command -v python3 2>/dev/null || command -v python 2>/dev/null || echo '')"
  [ -z "$py3" ] && err "Python tidak ditemukan! Jalankan: pkg install python"
  export PYTHON="$py3"
  export npm_config_python="$py3"
  export NODE_GYP_FORCE_PYTHON="$py3"

  local node_prefix
  node_prefix="$(node -e "process.stdout.write(process.execPath.replace('/bin/node',''))" 2>/dev/null || echo "$TERMUX_PREFIX")"
  export npm_config_nodedir="$node_prefix"
  export npm_config_build_from_source="true"
}

# ── Cek versi Node.js ─────────────────────────────────────────────────────────
check_node_version() {
  local ver; ver=$(node -e "process.stdout.write(process.versions.node.split('.')[0])" 2>/dev/null || echo "0")
  if [ "$ver" -lt "$MIN_NODE" ]; then
    err "Node.js v${ver} terlalu lama. Butuh minimal v${MIN_NODE}. Jalankan: pkg upgrade nodejs"
  fi
  info "Node.js v$(node --version | tr -d v) ✓"
}

# ── Cek apakah pnpm-lock.yaml berubah ─────────────────────────────────────────
lockfile_changed() {
  local lock="$ROOT/pnpm-lock.yaml"
  [ -f "$lock" ] || return 0
  local current; current=$(md5sum "$lock" 2>/dev/null | cut -d' ' -f1 || sha256sum "$lock" 2>/dev/null | cut -d' ' -f1 || echo "")
  local saved=""; [ -f "$LOCK_SUM" ] && saved=$(cat "$LOCK_SUM")
  if [ "$current" != "$saved" ]; then
    echo "$current" > "$LOCK_SUM"
    return 0   # berubah
  fi
  return 1   # sama
}

# ═══════════════════════════════════════════════════════════════
# INSTALASI better-sqlite3 DENGAN 3 RETRY
# ═══════════════════════════════════════════════════════════════
sqlite3_loaded() {
  node -e "require('better-sqlite3')" 2>/dev/null
}

find_sqlite3_path() {
  find "$ROOT/node_modules" -name "binding.gyp" -path "*/better-sqlite3/*" 2>/dev/null | head -1 | xargs dirname 2>/dev/null || echo ""
}

install_sqlite3() {
  if sqlite3_loaded; then
    ok "better-sqlite3 sudah bisa diload"
    return 0
  fi

  echo ""
  echo -e "${Y}  ⚙  Kompilasi better-sqlite3... harap tunggu 2-5 menit${NC}"
  echo ""

  # Percobaan 1: pnpm install
  step "[1/3] pnpm install dengan env Termux..."
  cd "$ROOT"
  if pnpm install --prefer-offline 2>&1 && sqlite3_loaded; then
    ok "better-sqlite3 berhasil (percobaan 1)"; return 0
  fi
  warn "Percobaan 1 gagal"

  # Percobaan 2: npm run build-release di folder better-sqlite3
  step "[2/3] Rebuild langsung di folder better-sqlite3..."
  local pkg_path; pkg_path="$(find_sqlite3_path)"
  if [ -n "$pkg_path" ]; then
    cd "$pkg_path"
    (npm run build-release 2>&1 || node-gyp rebuild 2>&1) || true
    cd "$ROOT"
    sqlite3_loaded && { ok "better-sqlite3 berhasil (percobaan 2)"; return 0; }
  fi
  warn "Percobaan 2 gagal"

  # Percobaan 3: node-gyp manual
  step "[3/3] Compile manual dengan node-gyp..."
  command -v node-gyp >/dev/null 2>&1 || npm install -g node-gyp 2>&1 | tail -2
  pkg_path="$(find_sqlite3_path)"
  if [ -n "$pkg_path" ]; then
    cd "$pkg_path"
    node-gyp configure build --release 2>&1 || true
    cd "$ROOT"
    sqlite3_loaded && { ok "better-sqlite3 berhasil (percobaan 3)"; return 0; }
  fi

  echo ""
  echo -e "${R}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${R}║  better-sqlite3 GAGAL dikompilasi                       ║${NC}"
  echo -e "${Y}╠══════════════════════════════════════════════════════════╣${NC}"
  echo -e "${Y}║  Coba jalankan dulu, lalu ulangi:                       ║${NC}"
  echo -e "${Y}║                                                          ║${NC}"
  echo -e "${W}║    pkg install nodejs python make clang binutils llvm    ║${NC}"
  echo -e "${W}║    npm install -g node-gyp                               ║${NC}"
  echo -e "${W}║    bash polytrader.sh --repair                           ║${NC}"
  echo -e "${Y}╚══════════════════════════════════════════════════════════╝${NC}"
  exit 1
}

# ═══════════════════════════════════════════════════════════════
# MODE: --status
# ═══════════════════════════════════════════════════════════════
cmd_status() {
  header
  echo -e "${W}Status Server:${NC}"
  echo ""

  if is_running "$API_PID"; then
    echo -e "  ${G}● API server${NC}   port 8080  (PID $(cat "$API_PID"))"
  else
    echo -e "  ${R}○ API server${NC}   port 8080  (tidak berjalan)"
  fi

  if is_running "$FRONT_PID"; then
    echo -e "  ${G}● Frontend${NC}     port 5000  (PID $(cat "$FRONT_PID"))"
  else
    echo -e "  ${R}○ Frontend${NC}     port 5000  (tidak berjalan)"
  fi

  echo ""
  echo -e "${W}Versi:${NC}"
  info "Node.js : $(node --version 2>/dev/null || echo 'N/A')"
  info "pnpm    : $(pnpm --version 2>/dev/null || echo 'N/A')"
  info "Setup   : $(cat "$SETUP_DONE" 2>/dev/null || echo 'belum')"

  echo ""
  if [ -f "$API_LOG" ]; then
    local size_kb; size_kb=$(( $(wc -c < "$API_LOG" 2>/dev/null || echo 0) / 1024 ))
    info "api-server.log : ${size_kb} KB"
  fi
  echo ""
  exit 0
}

# ═══════════════════════════════════════════════════════════════
# MODE: --stop
# ═══════════════════════════════════════════════════════════════
cmd_stop() {
  header
  step "Menghentikan server..."
  stop_server "$API_PID" "API server"
  stop_server "$FRONT_PID" "Frontend"
  ok "Semua server dihentikan"
  exit 0
}

# ═══════════════════════════════════════════════════════════════
# MODE: --logs
# ═══════════════════════════════════════════════════════════════
cmd_logs() {
  echo -e "${C}═══ API Server Log ═══${NC}"
  echo -e "${D}Ctrl+C untuk keluar${NC}"
  echo ""
  tail -n 50 -F "$API_LOG" 2>/dev/null &
  TAIL1=$!
  tail -n 20 -F "$FRONT_LOG" 2>/dev/null &
  TAIL2=$!
  trap "kill $TAIL1 $TAIL2 2>/dev/null; exit 0" SIGINT SIGTERM
  wait
}

# ═══════════════════════════════════════════════════════════════
# MODE: --repair (rebuild better-sqlite3 saja)
# ═══════════════════════════════════════════════════════════════
cmd_repair() {
  header
  divider
  echo -e "${W}🔧 REPAIR better-sqlite3${NC}"
  divider
  echo ""

  command -v node  >/dev/null 2>&1 || err "Node.js tidak ditemukan! pkg install nodejs"
  command -v clang >/dev/null 2>&1 || err "Clang tidak ditemukan! pkg install clang"

  setup_build_env
  install_sqlite3

  echo ""
  ok "Repair selesai! Jalankan: bash polytrader.sh"
  elapsed
  exit 0
}

# ═══════════════════════════════════════════════════════════════
# MODE: --update (git pull + rebuild API)
# ═══════════════════════════════════════════════════════════════
cmd_update() {
  header
  divider
  echo -e "${W}🔄 UPDATE PolyTrader${NC}"
  divider
  echo ""

  # Stop servers dulu
  if is_running "$API_PID" || is_running "$FRONT_PID"; then
    step "Stop server terlebih dahulu..."
    stop_server "$API_PID" "API server"
    stop_server "$FRONT_PID" "Frontend"
    sleep 1
  fi

  # Git pull
  step "Mengambil update terbaru..."
  if ! command -v git >/dev/null 2>&1; then
    warn "git tidak ditemukan, skip pull. pkg install git jika ingin auto-update"
  else
    git pull --ff-only 2>&1 | tail -3
    ok "Source code updated"
  fi

  setup_build_env

  # Update dependencies jika lockfile berubah
  if lockfile_changed; then
    step "Dependensi berubah — update pnpm install..."
    cd "$ROOT"
    pnpm install --prefer-offline 2>&1 | tail -5
    ok "Dependencies updated"
    # Pastikan better-sqlite3 masih bisa diload setelah update
    if ! sqlite3_loaded; then
      warn "better-sqlite3 perlu dikompilasi ulang..."
      install_sqlite3
    fi
  else
    ok "Dependencies tidak berubah, skip install"
  fi

  # Rebuild API
  step "Rebuild API server..."
  cd "$ROOT/artifacts/api-server"
  pnpm run build 2>&1 | grep -E "Done|Error|⚡" || true
  cd "$ROOT"
  ok "Rebuild selesai"

  echo ""
  ok "Update selesai! Menjalankan ulang..."
  elapsed
  echo ""
  sleep 1
  exec bash "$ROOT/polytrader.sh"
}

# ═══════════════════════════════════════════════════════════════
# MODE: --reset (hapus setup, reinstall dari awal)
# ═══════════════════════════════════════════════════════════════
cmd_reset() {
  header
  echo -e "${R}⚠  RESET — Hapus semua data setup dan reinstall${NC}"
  echo ""
  echo -n "Lanjutkan? [y/N] "
  read -r confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { echo "Dibatalkan."; exit 0; }

  step "Menghapus data setup..."
  stop_server "$API_PID" "API server" 2>/dev/null || true
  stop_server "$FRONT_PID" "Frontend"  2>/dev/null || true
  rm -f "$SETUP_DONE" "$LOCK_SUM" "$API_LOG" "$FRONT_LOG"
  rm -rf "$ROOT/node_modules" "$ROOT/artifacts/api-server/dist"
  ok "Reset selesai — mulai instalasi ulang..."
  echo ""
  exec bash "$ROOT/polytrader.sh"
}

# ═══════════════════════════════════════════════════════════════
# PHASE 1 — INSTALL (hanya jika belum pernah)
# ═══════════════════════════════════════════════════════════════
do_install() {
  divider
  echo -e "${W}📦 INSTALASI PERTAMA KALI${NC}"
  divider
  echo ""

  # 1a. Cek package sistem — HANYA install yang benar-benar belum ada
  step "Cek package sistem..."
  local missing=()
  command -v node      >/dev/null 2>&1 || missing+=("nodejs")
  command -v python3   >/dev/null 2>&1 || missing+=("python")
  command -v make      >/dev/null 2>&1 || missing+=("make")
  command -v clang     >/dev/null 2>&1 || missing+=("clang")
  command -v ar        >/dev/null 2>&1 || missing+=("binutils")

  if [ ${#missing[@]} -gt 0 ]; then
    step "Menginstall: ${missing[*]}"
    # Update dulu HANYA jika ada yang perlu diinstall
    pkg update -y 2>&1 | tail -1 || true
    pkg install -y "${missing[@]}" 2>&1 | grep -E "^(Inst|Err)" || true
    ok "Installed: ${missing[*]}"
  else
    ok "Semua package sistem sudah ada"
  fi

  # Install llvm (untuk llvm-ar) — bisa gagal tanpa masalah, fallback ke ar biasa
  command -v llvm-ar >/dev/null 2>&1 || pkg install -y llvm 2>&1 | tail -1 || true

  # 1b. Verifikasi versi Node.js
  check_node_version

  info "Python3 : $(python3 --version 2>/dev/null)"
  info "Clang   : $(clang --version 2>/dev/null | head -1)"
  echo ""

  # 1c. node-gyp global
  step "Cek node-gyp..."
  if ! command -v node-gyp >/dev/null 2>&1; then
    npm install -g node-gyp 2>&1 | tail -2
    ok "node-gyp $(node-gyp --version) terinstall"
  else
    ok "node-gyp $(node-gyp --version) sudah ada"
  fi

  # 1d. pnpm
  step "Cek pnpm..."
  if ! command -v pnpm >/dev/null 2>&1; then
    npm install -g pnpm 2>&1 | tail -2
    ok "pnpm $(pnpm --version) terinstall"
  else
    ok "pnpm $(pnpm --version) sudah ada"
  fi

  # 1e. Install dependencies: dua langkah agar better-sqlite3 terisolasi
  step "Download semua package (1/2)..."
  cd "$ROOT"
  pnpm install --ignore-scripts 2>&1 | tail -5 || true
  ok "Package terdownload"

  echo ""
  step "Kompilasi native module better-sqlite3 (2/2)..."
  install_sqlite3

  # Simpan checksum lockfile
  local lock="$ROOT/pnpm-lock.yaml"
  [ -f "$lock" ] && (md5sum "$lock" 2>/dev/null || sha256sum "$lock" 2>/dev/null) | cut -d' ' -f1 > "$LOCK_SUM" || true

  echo ""
  ok "Semua dependencies berhasil diinstall!"

  # 1f. Build API
  step "Build API server..."
  cd "$ROOT/artifacts/api-server"
  pnpm run build 2>&1 | grep -E "Done|Error|⚡" || true
  cd "$ROOT"
  [ -f "$API_DIST" ] || err "Build gagal! Cek output di atas."
  ok "API server berhasil di-build"

  echo "$(date)" > "$SETUP_DONE"
  echo ""
  divider
  ok "Setup selesai! (${SECONDS}s)"
  divider
  echo ""
  sleep 1
}

# ═══════════════════════════════════════════════════════════════
# PHASE 2 — SMART REBUILD & REINSTALL CHECK
# ═══════════════════════════════════════════════════════════════
do_check_and_rebuild() {
  # Cek apakah lockfile berubah (misal setelah git pull)
  if lockfile_changed; then
    step "pnpm-lock.yaml berubah — update dependencies..."
    cd "$ROOT"
    pnpm install --prefer-offline 2>&1 | tail -5
    ok "Dependencies updated"
    if ! sqlite3_loaded; then
      warn "better-sqlite3 perlu rebuild setelah update deps..."
      install_sqlite3
    fi
  else
    ok "Dependencies up-to-date, skip install"
  fi

  # Rebuild API jika source berubah
  if [ ! -f "$API_DIST" ]; then
    step "Build API server (dist tidak ada)..."
    cd "$ROOT/artifacts/api-server" && pnpm run build 2>&1 | grep -E "Done|Error|⚡" || true
    cd "$ROOT"; ok "Build selesai"
  elif find "$ROOT/artifacts/api-server/src" -name "*.ts" -newer "$API_DIST" | grep -q . 2>/dev/null; then
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

  # Stop server lama jika ada
  if is_running "$API_PID" || is_running "$FRONT_PID"; then
    warn "Server lama masih jalan — restart..."
    stop_server "$API_PID" "API server"
    stop_server "$FRONT_PID" "Frontend"
    sleep 1
  fi

  # Cek konflik port SEBELUM start
  check_port_free 8080 "API" || warn "Port 8080 mungkin masalah"
  check_port_free 5000 "Frontend" || warn "Port 5000 mungkin masalah"

  # Rotasi log lama
  rotate_log "$API_LOG"
  rotate_log "$FRONT_LOG"

  # Dapatkan IP lokal
  local ip; ip=$(ip route get 1 2>/dev/null | grep -oP 'src \K\S+' | head -1 \
               || hostname -I 2>/dev/null | awk '{print $1}' \
               || echo "?")

  # Start API
  step "API server → port 8080..."
  PORT=8080 node --enable-source-maps "$API_DIST" >> "$API_LOG" 2>&1 &
  echo $! > "$API_PID"
  printf "  Menunggu"
  wait_for_port 8080 "API server" \
    && ok "API online  ✓" \
    || { fail "API gagal start — cek: tail -f $API_LOG"; cat "$API_LOG" | tail -5; exit 1; }

  # Start Frontend
  step "Frontend → port 5000..."
  PORT=5000 BASE_PATH=/ pnpm --filter @workspace/polymarket-trader run dev >> "$FRONT_LOG" 2>&1 &
  echo $! > "$FRONT_PID"
  printf "  Menunggu"
  wait_for_port 5000 "Frontend" \
    && ok "Frontend online  ✓" \
    || warn "Frontend lambat start — lanjutkan akses nanti"

  # Banner
  echo ""
  echo -e "${G}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${G}║  ✅  PolyTrader AKTIF!   (startup: ${SECONDS}s)             ║${NC}"
  echo -e "${G}║                                                      ║${NC}"
  echo -e "${G}║  📱  Browser di HP:  http://localhost:5000           ║${NC}"
  echo -e "${G}║  💻  Dari PC (WiFi): http://${ip}:5000            ║${NC}"
  echo -e "${G}║                                                      ║${NC}"
  echo -e "${G}║  bash polytrader.sh --status  → cek status          ║${NC}"
  echo -e "${G}║  bash polytrader.sh --logs    → live logs            ║${NC}"
  echo -e "${G}║  bash polytrader.sh --update  → update + restart     ║${NC}"
  echo -e "${G}║  Ctrl+C                       → stop semua server    ║${NC}"
  echo -e "${G}╚══════════════════════════════════════════════════════╝${NC}"
  echo ""

  # Stream live API log (watcher)
  tail -F "$API_LOG" 2>/dev/null &
  TAIL_PID=$!
  wait "$(cat "$API_PID" 2>/dev/null)" 2>/dev/null || true
  kill "$TAIL_PID" 2>/dev/null || true
}

# ═══════════════════════════════════════════════════════════════
# MAIN — Routing berdasarkan argumen
# ═══════════════════════════════════════════════════════════════
header

[ -f "$ROOT/package.json" ] || err "Jalankan dari folder root PolyTrader!"

case "$MODE" in
  --status)  cmd_status  ;;
  --stop)    cmd_stop    ;;
  --logs)    cmd_logs    ;;
  --repair)  cmd_repair  ;;
  --update)  cmd_update  ;;
  --reset)   cmd_reset   ;;
  "")
    if [ ! -f "$SETUP_DONE" ] || [ ! -f "$API_DIST" ] || [ ! -d "$ROOT/node_modules" ]; then
      echo -e "${Y}  Instalasi pertama kali — setup otomatis...${NC}"; echo ""
      setup_build_env
      do_install
    else
      echo -e "${G}  Setup sudah ada — langsung start!${NC}"
      echo -e "${D}  (--reset untuk reinstall, --update untuk update)${NC}"; echo ""
      setup_build_env
      do_check_and_rebuild
    fi
    do_start
    ;;
  *)
    err "Argumen tidak dikenal: $MODE\n║  Gunakan: --status | --stop | --logs | --repair | --update | --reset"
    ;;
esac
