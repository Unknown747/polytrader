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
├── server/                   Go 1.25 API server (port 8080)
│   ├── main.go
│   └── internal/
│       ├── db/               SQLite init + schema (pure Go, no CGO)
│       ├── models/           Shared Go structs
│       ├── routes/           REST API route handlers
│       └── services/         Strategy, auto-trader, Polymarket, Telegram, CLOB
├── artifacts/
│   └── polymarket-trader/    React 18 + Vite + Tailwind frontend (port 5000)
│       └── src/
│           ├── pages/        Dashboard, Portfolio, Markets, Settings, etc.
│           └── components/   Shared UI components (shadcn/ui)
└── lib/
    ├── api-client-react/     Auto-generated typed API client
    ├── api-zod/              Shared Zod schemas
    └── api-spec/             OpenAPI specification
```

**Database:** SQLite at `artifacts/api-server/poly.db` via `modernc.org/sqlite` (pure Go — no CGO, no native compilation required, works on any platform).

---

## Prerequisites

| Requirement | Version |
|---|---|
| Go | >= 1.21 |
| Node.js | >= 18 |
| pnpm | any recent version |

---

## Installation

### Linux / VPS (Ubuntu, Debian, etc.)

```bash
git clone https://github.com/Unknown747/polytrader.git
cd polytrader
bash install-linux.sh
```

The script will:
1. Check / install Go, Node.js, and pnpm
2. Build the Go API server (`go build`)
3. Install frontend dependencies (`pnpm install`)
4. Create `start.sh`

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
git clone https://github.com/Unknown747/polytrader.git
cd polytrader
bash install-termux.sh
```

Start the app:
```bash
bash start.sh
```

Stop the app:
```bash
bash stop.sh
```

---

## Running the App (manual)

```bash
# Terminal 1 — API server
cd server
go build -o poly-server .
DB_DIR=../artifacts/api-server PORT=8080 ./poly-server

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
| Min Edge | 3% | Minimum probability edge over market price |
| Min Liquidity | $1,000 | Minimum market liquidity |
| Min Volume 24h | $500 | Minimum 24h trading volume |
| Max Days to Resolution | 21 | Maximum days until market resolves |
| Max Position Size | 5% | Maximum position size as % of bankroll |
| Bankroll | $100 | Total capital allocated |
| Scan Interval | 15 min | How often to scan for opportunities |
| Stop-Loss | 15% | Exit position at this % loss |
| Take-Profit Tier 1 | 30% gain | Recover capital at this target |
| Take-Profit Tier 2 | 50% gain | Sell half remaining at this target |
| Take-Profit Tier 3 | 100% gain | Close full position at this target |
| Daily Loss Limit | 5 trades/day | Max trades per day |
| Max Consecutive Losses | 3 | Cool down after N consecutive losses |

---

## API Endpoints

All endpoints are prefixed with `/api`.

### Health
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/system/status` | System status |

### Markets
| Method | Path | Description |
|---|---|---|
| GET | `/api/markets` | List markets (query: q, status, category, limit, offset) |
| GET | `/api/markets/:id` | Market details |
| GET | `/api/markets/opportunities` | Strategy scan results |
| GET | `/api/markets/trending` | Trending markets by volume |
| POST | `/api/markets/strategy/backtest` | Run backtest simulation |

### Portfolio
| Method | Path | Description |
|---|---|---|
| GET | `/api/portfolio/summary` | Portfolio P&L summary |
| GET | `/api/portfolio/orders` | Order history |
| POST | `/api/portfolio/orders` | Add a manual order |
| PATCH | `/api/portfolio/orders/:id` | Update order status |
| GET | `/api/portfolio/positions` | Open positions |
| GET | `/api/portfolio/pnl` | P&L history |
| GET | `/api/portfolio/risk` | Portfolio risk metrics (concentration, urgency, drawdown) |
| DELETE | `/api/portfolio/reset` | Reset to demo data |

### Trading
| Method | Path | Description |
|---|---|---|
| GET | `/api/trading/config` | Strategy configuration |
| PATCH | `/api/trading/config` | Update strategy config |
| GET | `/api/trading/auto-trader/status` | Auto-trader status |
| POST | `/api/trading/auto-trader/start` | Start auto-trading |
| POST | `/api/trading/auto-trader/stop` | Stop auto-trading |
| GET | `/api/trading/clob/balance` | USDC wallet balance |
| POST | `/api/trading/clob/order` | Place live order via CLOB |
| GET | `/api/trading/paper/portfolio` | Paper trading portfolio |
| POST | `/api/trading/paper/reset` | Reset paper portfolio |

### Wallet & Notifications
| Method | Path | Description |
|---|---|---|
| GET | `/api/wallet/status` | Wallet + credential status |
| GET | `/api/notifications/status` | Telegram bot status |
| POST | `/api/notifications/test` | Send test Telegram message |

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
| `/emergencystop` | Cancel all open orders immediately |
| `/resume` | Resume after emergency stop |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Go 1.25, Gin framework |
| Database | SQLite via modernc.org/sqlite (pure Go, no CGO) |
| Frontend | React 18, Vite 7, Tailwind CSS 4, shadcn/ui |
| Package manager | pnpm (monorepo) |
| API schemas | Zod + OpenAPI |
| Charts | Recharts |
| Notifications | Telegram Bot API |
| Trading | Polymarket CLOB API (EIP-712 signed orders on Polygon) |

---

## Troubleshooting

### API server fails to start
```bash
cd server
go build -o poly-server .
DB_DIR=../artifacts/api-server PORT=8080 ./poly-server
```

Check the output for errors. Common issues:
- Go not installed or wrong version (`go version` should show >= 1.21)
- Database directory missing (create `artifacts/api-server/`)

### Frontend shows "Failed to fetch" or API errors
Make sure the API server is running on port 8080. The frontend proxies `/api` to `localhost:8080` via Vite's dev proxy.

### pnpm install fails
```bash
pnpm store prune
pnpm install
```

---

## License

MIT
