#!/data/data/com.termux/files/usr/bin/bash
# PolyTrader — Stop all servers

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

stop_pid() {
  local file="$1" name="$2"
  if [ -f "$file" ]; then
    PID=$(cat "$file")
    if kill "$PID" 2>/dev/null; then
      echo "Stopped $name (PID $PID)"
    fi
    rm -f "$file"
  fi
}

stop_pid "$ROOT/.api.pid" "API server"
stop_pid "$ROOT/.front.pid" "Frontend"

# Fallback: kill any node processes on our ports
fuser -k 8080/tcp 2>/dev/null && echo "Killed process on port 8080" || true
fuser -k 5000/tcp 2>/dev/null && echo "Killed process on port 5000" || true

echo "All PolyTrader servers stopped."
