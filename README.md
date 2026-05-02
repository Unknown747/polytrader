# PolyTrader

A full-stack trading dashboard and automation bot for [Polymarket](https://polymarket.com). Supports manual trading, strategy scanning, paper trading, Telegram notifications, and automated order placement.

---

## Features

- **Live market browser** — browse and search Polymarket prediction markets in real-time
- **Portfolio tracking** — track open positions, P&L history, and equity curve
- **Strategy scanner** — configurable edge detection based on probability, liquidity, volume, and time-to-resolution
- **Auto-trader** — automated order placement with configurable risk controls (stop-loss, take-profit tiers, drawdown limits)
- **Paper trading** — full simulation mode with virtual bankroll to test strategies without real money
- **Telegram bot** — full trading control and notifications via Telegram commands
- **Watchlist & price alerts** — monitor markets and get notified when prices hit your targets
- **Credentials vault** — store API keys securely in the local SQLite database (never in source code)

---

## Architecture

```
polytrader/
├── artifacts/
│   ├── api-server/          Express.js + TypeScript backend (port 8080)
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   │   ├── db.ts           SQLite init (better-sqlite3 / sql.js fallback)
│   │   │   │   ├── db-adapter.ts   sql.js compatibility adapter
│   │   │   │   └── state.ts        In-memory portfolio state + DB sync
│   │   │   ├── routes/             REST API route handlers
│   │   │   └── services/           Strategy, auto-trader, Polymarket, Telegram
│   │   └── build.mjs               esbuild bundler config
│   └── polymarket-trader/   React 18 + Vite + Tailwind frontend (port 5000)
│       └── src/
│           ├── pages/              Dashboard, Portfolio, Markets, Settings, etc.
│           └── components/         Shared UI components (shadcn/ui)
└── lib/
    ├── api-client-react/    Auto-generated typed API client
    └── api-zod/             Shared Zod schemas and OpenAPI spec
```

**Database:** SQLite via `better-sqlite3` on Linux/VPS (fast, native). On Termux/Android where native compilation is unavailable, the app automatically falls back to `sql.js` (pure JS/WASM, no compilation required). The same database file (`poly.db`) is used by both engines.

---

## Prerequisites

| Requirement | Linux / VPS | Termux (Android) |
|---|---|---|
| Node.js | >= 18 | installed via `pkg` |
| pnpm | any recent version | any recent version |
| Python 3 + make + C++ | for `better-sqlite3` build | installed via `pkg` |

---

## Installation

### Linux / VPS (Ubuntu, Debian, CentOS, Arch …)

```bash
git clone <repo-url> polytrader
cd polytrader
bash install-linux.sh
```

The script will:
1. Check / install Node.js and pnpm
2. Install build tools (Python 3, make, g++)
3. Run `pnpm install` (builds `better-sqlite3` native module)
4. Build the API server
5. Create `start.sh`

Start the app:
```bash
bash start.sh
```

Custom ports:
```bash
PORT=9090 FRONTEND_PORT=3000 bash start.sh
```

### Termux (Android)

```bash
git clone <repo-url> polytrader
cd polytrader
bash install-termux.sh
```

The script will:
1. Install required Termux packages (`nodejs`, `python`, `make`, `clang`)
2. Install pnpm
3. Temporarily patch `pnpm-workspace.yaml` so the correct ARM binary for esbuild is downloaded
4. Run `pnpm install` (with automatic fallback if `better-sqlite3` fails to compile)
5. Build the API server
6. Create `start.sh` and `stop.sh`

Start the app:
```bash
bash start.sh
```

Stop the app:
```bash
bash stop.sh
```

> **Note on the database:** If `better-sqlite3` cannot be compiled on Termux, the API server transparently switches to `sql.js` (pure JS SQLite). There is no data loss, no manual intervention needed, and performance is identical for this workload.

---

## Running the App (manual)

```bash
# Terminal 1 — API server
cd artifacts/api-server
PORT=8080 node --enable-source-maps ./dist/index.mjs

# Terminal 2 — Frontend dev server
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/polymarket-trader run dev
```

Open [http://localhost:5000](http://localhost:5000) in your browser.

---

## Configuration

All credentials are stored in the local SQLite database (`artifacts/api-server/poly.db`) via the **Settings** page in the UI. Environment variables can also be used as an alternative.

### Polymarket CLOB API (live trading)

| Setting | Env var | Description |
|---|---|---|
| Private Key | `POLYMARKET_PRIVATE_KEY` | Ethereum private key (0x…) for signing orders |
| API Key | `POLYMARKET_API_KEY` | Polymarket CLOB API key |
| API Secret | `POLYMARKET_API_SECRET` | CLOB API secret |
| Passphrase | `POLYMARKET_API_PASSPHRASE` | CLOB API passphrase |

To get Polymarket API credentials: visit [https://polymarket.com](https://polymarket.com) → Profile → API Keys.

### Telegram Bot (optional, for notifications and remote control)

| Setting | Env var | Description |
|---|---|---|
| Bot Token | `TELEGRAM_BOT_TOKEN` | Token from [@BotFather](https://t.me/botfather) |
| Chat ID | `TELEGRAM_CHAT_ID` | Your Telegram chat ID (use [@userinfobot](https://t.me/userinfobot)) |

### Strategy Settings (configurable via UI)

| Parameter | Default | Description |
|---|---|---|
| Min Edge | 10% | Minimum probability edge over market price |
| Min Liquidity | $1,000 | Minimum market liquidity |
| Min Volume 24h | $500 | Minimum 24h trading volume |
| Max Days to Resolution | 30 | Maximum days until market resolves |
| Max Position Size | $50 | Maximum bet size per market |
| Bankroll | $1,000 | Total capital allocated |
| Scan Interval | 5 min | How often to scan for opportunities |
| Stop-Loss | 30% | Exit position at this % loss |
| Take-Profit Tier 1 | 50% gain | Recover capital at this target |
| Take-Profit Tier 2 | 75% gain | Sell half remaining at this target |
| Take-Profit Tier 3 | 90% gain | Close full position at this target |
| Daily Loss Limit | 10% | Pause trading for the day if this is hit |
| Max Consecutive Losses | 3 | Cool down 30 min after N consecutive losses |

---

## API Endpoints

All endpoints are prefixed with `/api`.

### Markets
| Method | Path | Description |
|---|---|---|
| GET | `/api/markets` | Fetch live Polymarket markets |

### Portfolio
| Method | Path | Description |
|---|---|---|
| GET | `/api/portfolio` | Full portfolio snapshot (orders, positions, P&L, stats) |
| POST | `/api/portfolio/orders` | Add a manual order |
| PATCH | `/api/portfolio/orders/:id` | Update order status |
| DELETE | `/api/portfolio/reset` | Reset portfolio to demo data |

### Strategy
| Method | Path | Description |
|---|---|---|
| GET | `/api/strategy/opportunities` | Scan for trading opportunities |
| GET | `/api/strategy/config` | Get current strategy config |
| POST | `/api/strategy/config` | Update strategy config |

### Auto-trader
| Method | Path | Description |
|---|---|---|
| GET | `/api/auto-trader/status` | Get auto-trader state and stats |
| POST | `/api/auto-trader/start` | Start auto-trading |
| POST | `/api/auto-trader/stop` | Stop auto-trading |
| GET | `/api/auto-trader/history` | Trade history |

### Paper Trading
| Method | Path | Description |
|---|---|---|
| GET | `/api/paper-trader/status` | Paper portfolio status |
| POST | `/api/paper-trader/start` | Start paper trading |
| POST | `/api/paper-trader/stop` | Stop paper trading |
| POST | `/api/paper-trader/reset` | Reset paper portfolio |

### Credentials
| Method | Path | Description |
|---|---|---|
| GET | `/api/credentials` | List configured credential keys |
| POST | `/api/credentials` | Save a credential |
| DELETE | `/api/credentials/:key` | Remove a credential |
| GET | `/api/credentials/status` | Check which integrations are configured |

### Watchlist & Alerts
| Method | Path | Description |
|---|---|---|
| GET | `/api/watchlist` | Get watchlist |
| POST | `/api/watchlist` | Add market to watchlist |
| DELETE | `/api/watchlist/:id` | Remove from watchlist |
| GET | `/api/alerts` | Get price alerts |
| POST | `/api/alerts` | Create price alert |
| DELETE | `/api/alerts/:id` | Delete alert |

### Telegram
| Method | Path | Description |
|---|---|---|
| POST | `/api/telegram/test` | Send a test message |
| GET | `/api/telegram/status` | Check bot status |
| POST | `/api/telegram/start-bot` | Start Telegram bot polling |
| POST | `/api/telegram/stop-bot` | Stop Telegram bot |

### CLOB (Live Trading)
| Method | Path | Description |
|---|---|---|
| GET | `/api/clob/status` | Check if CLOB is configured |
| POST | `/api/clob/order` | Place a live order |
| GET | `/api/clob/trades` | Get filled trades |
| GET | `/api/clob/positions` | Get live positions |
| GET | `/api/clob/orders` | Get open orders |
| DELETE | `/api/clob/orders/:id` | Cancel an order |
| POST | `/api/clob/emergency-stop` | Cancel all open orders |

### Equity
| Method | Path | Description |
|---|---|---|
| GET | `/api/equity` | Equity curve and drawdown data |

---

## Telegram Bot Commands

Once the bot is configured and started, these commands are available:

| Command | Description |
|---|---|
| `/start` or `/help` | Show all commands |
| `/status` | Bot and trading status |
| `/balance` | USDC balance on Polymarket |
| `/positions` | Open positions with P&L |
| `/orders` | Open orders |
| `/pnl` | P&L summary |
| `/markets` | Top market opportunities |
| `/scan` | Run a fresh strategy scan |
| `/config` | Show current strategy config |
| `/creds` | Show which credentials are set |
| `/setcred KEY VALUE` | Set a credential (e.g. `/setcred TELEGRAM_CHAT_ID 123456`) |
| `/watchlist` | Show watchlist |
| `/watch MARKET_ID` | Add market to watchlist |
| `/unwatch MARKET_ID` | Remove from watchlist |
| `/alert MARKET_ID YES above 0.75` | Create a price alert |
| `/alerts` | List active alerts |
| `/delalert ID` | Delete an alert |
| `/resetdemo` | Reset portfolio to demo data |
| `/emergencystop` | Cancel all open orders immediately |
| `/resume` | Resume after emergency stop |

---

## Troubleshooting

### better-sqlite3 fails to load on Termux
This is expected. The app uses `sql.js` (pure JS SQLite) as a fallback automatically. You will see this log line at startup:
```
better-sqlite3 unavailable — falling back to sql.js (Termux / no-native mode)
```
No action needed. The app works fully with sql.js.

### API server fails to start
Check the API log:
```bash
# If using start.sh on Termux
cat logs/api.log

# Or run directly to see errors in terminal
cd artifacts/api-server
node --enable-source-maps ./dist/index.mjs
```

### Frontend shows "Failed to fetch" or API errors
Make sure the API server is running on port 8080 (or whatever `PORT` you set). The frontend proxies `/api` to `localhost:8080` via Vite's dev proxy.

### pnpm install fails
```bash
# Clear cache and retry
pnpm store prune
pnpm install
```

### Rebuild after code changes
```bash
pnpm --filter @workspace/api-server run build
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Express.js 5, TypeScript, esbuild |
| Frontend | React 18, Vite 7, Tailwind CSS 4, shadcn/ui |
| Database | SQLite via better-sqlite3 (Linux) or sql.js (Termux/fallback) |
| Package manager | pnpm (monorepo) |
| API schemas | Zod |
| Charts | Recharts |
| Notifications | Telegram Bot API |
| Trading | Polymarket CLOB API (EIP-712 signed orders on Polygon) |

---

## License

MIT
