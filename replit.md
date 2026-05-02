# PolyTrader

## Overview

Full-stack trading dashboard for Polymarket (prediction markets on Polygon). Provides live market browsing, portfolio tracking, automated strategy scanning, paper trading, Telegram bot notifications, and live order placement via the Polymarket CLOB API.

## Architecture

**pnpm monorepo** with Go backend + React frontend:

### API Server (`server/`)
- Language: **Go 1.25**
- Framework: `github.com/gin-gonic/gin`
- Port: 8080
- Database: SQLite via `modernc.org/sqlite` (pure Go, no CGO required)
- DB file: `artifacts/api-server/poly.db`
- Entry point: `server/main.go`
- Internal packages:
  - `internal/db` — SQLite init + schema (17 tables)
  - `internal/models` — shared Go structs
  - `internal/services` — polymarket.go, strategy.go, state.go, telegram.go, clob.go, papertrader.go, scheduler.go
  - `internal/routes` — router.go, markets.go, portfolio.go, trading.go, notifications.go, system.go

### Frontend (`artifacts/polymarket-trader`)
- Framework: React 18, Vite 7, Tailwind CSS 4, shadcn/ui
- Port: 5000
- Proxies `/api` → `localhost:8080`

## Running the Project

### API Server
```
cd server && go build -o poly-server . && DB_DIR=../artifacts/api-server PORT=8080 ./poly-server
```

### Frontend
```
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/polymarket-trader run dev
```

## Database

SQLite database at `artifacts/api-server/poly.db`. Tables:
- `portfolio_orders`, `portfolio_positions`, `portfolio_pnl` — trading portfolio
- `bot_state`, `strategy_config`, `app_credentials` — configuration
- `auto_trade_history` — trade execution log
- `market_watchlist`, `price_alerts` — market monitoring
- `paper_trades`, `paper_portfolio` — paper trading simulation
- `equity_snapshots`, `market_price_history` — historical data
- `trading_risk_state`, `position_risk_events` — risk management
- `resolved_market_notifications`, `low_balance_alerts` — notifications

## Key API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/system/status` | System status |
| GET | `/api/markets` | List markets (query: q, status, category, limit, offset) |
| GET | `/api/markets/opportunities` | Strategy scan results |
| POST | `/api/markets/strategy/backtest` | Run backtest simulation |
| GET | `/api/portfolio/summary` | Portfolio P&L summary |
| GET | `/api/portfolio/orders` | Order history |
| GET | `/api/portfolio/positions` | Open positions |
| GET | `/api/portfolio/pnl` | P&L history |
| GET | `/api/trading/config` | Strategy configuration |
| PATCH | `/api/trading/config` | Update strategy config |
| GET | `/api/trading/auto-trader/status` | Auto-trader status |
| GET | `/api/trading/clob/balance` | USDC wallet balance |
| GET | `/api/trading/paper/portfolio` | Paper trading portfolio |
| GET | `/api/notifications/status` | Telegram status |
| POST | `/api/notifications/test` | Send test Telegram message |
| GET | `/api/wallet/status` | Wallet status |
| GET | `/api/portfolio/risk` | Portfolio risk metrics |
| GET | `/api/markets/trending` | Trending markets |

## Environment Variables / Credentials (stored in SQLite `app_credentials`)

- `POLYMARKET_PRIVATE_KEY` — Polygon wallet private key
- `POLYMARKET_API_KEY` — Polymarket CLOB API key
- `POLYMARKET_API_SECRET` — CLOB API secret
- `POLYMARKET_API_PASSPHRASE` — CLOB API passphrase
- `TELEGRAM_BOT_TOKEN` — Telegram bot token
- `TELEGRAM_CHAT_ID` — Telegram chat/channel ID

These can also be set as environment variables.

## Key Services (Go)

- **strategy.go** — Kelly criterion, composite scoring, opportunity scanning, backtest engine
- **polymarket.go** — Gamma API client, market cache (5-min TTL), price tracking
- **scheduler.go** — Background scan loop, auto-trading execution, stop-loss/take-profit, daily reports
- **clob.go** — Polymarket CLOB API integration, order placement with HMAC-SHA256 auth
- **papertrader.go** — Paper trading simulation with slippage/fees, equity curve tracking
- **telegram.go** — Telegram Bot API client, all notification types
- **state.go** — Portfolio state management (orders, positions, P&L seeding)
