# Polymarket Trader

A full-stack Polymarket prediction market trading dashboard for Polygon mainnet with real market data, strategy scanner, backtesting, Telegram notifications, and automated order execution via the Polymarket CLOB API.

## Architecture

pnpm monorepo with the following artifacts and libraries:

### Artifacts

- **`artifacts/polymarket-trader`** (`@workspace/polymarket-trader`) — React + Vite frontend, preview at `/`
- **`artifacts/api-server`** (`@workspace/api-server`) — Express backend API, serves at `/api`
- **`artifacts/mockup-sandbox`** (`@workspace/mockup-sandbox`) — Replit canvas design preview server

### Libraries

- **`lib/api-spec`** — OpenAPI spec (`openapi.yaml`) + Orval codegen config. Run `pnpm --filter @workspace/api-spec run codegen` after editing the spec.
- **`lib/api-client-react`** — Generated TanStack Query hooks for the frontend (do not edit manually).
- **`lib/api-zod`** — Generated Zod validation schemas for the backend (do not edit manually).

## Features

- **Correlation Heatmap** — Pairwise Pearson correlation of YES prices across watched markets; adjustable 7–90 day window; concentration risk alerts; summary stats (highly correlated / uncorrelated / negatively correlated pairs). Route: `GET /api/watchlist/correlation`
- **Dashboard** — Portfolio summary stats, cumulative P&L area chart, trending markets list
- **Markets** — Browse/search/filter prediction markets (real Polymarket Gamma API with demo fallback)
- **Market Detail** — Market info + buy/sell YES/NO order form + **30-day price history chart** + **watchlist star** + **price alert bell** (set Telegram alert on target price)
- **Positions** — Open positions with unrealized P&L; **SSE live prices** (push every 15s via `/api/prices/stream`), LIVE badge on positions with fresh data, Export CSV
- **Orders** — Order history with cancel support (auto-refreshes, summary stats, Export CSV)
- **Portfolio** — Cumulative P&L chart, daily P&L bar chart, Portfolio Allocation donut chart, position breakdown, live CLOB P&L panel, Export P&L + Positions CSV
- **Strategy Scanner** — Scans near-resolution high-probability markets; composite scoring (5 factors); **price trend filter** ("up"/"flat"/"down" badge) using 14-day linear regression; half-Kelly sizing; trend badges on each opportunity card
- **Backtester** — Realistic simulation with **CLOB taker fee (1%)** + **bid-ask spread simulation** (0.3–2.5% by liquidity tier); shows total fees paid, avg spread, Fee column in trade log
- **Settings** — **3-step Credential Setup Wizard** (Private Key → API Credentials → Telegram) with step progress dots, per-field save; **Stop-Loss/Take-Profit sliders** (SL: 5–60%, TP: 10–200%); trend filter toggle; Telegram test; auto-trading status panel

## Backend Services

| File | Responsibility |
|------|---------------|
| `services/polymarket.ts` | Polymarket Gamma API client — 5-min cache, retry (3×), multi-page fetch (up to 1 000 markets), tokenId parsing from `clobTokenIds` |
| `services/strategy.ts` | Composite scoring: edge 35%, expected return 20%, time urgency 20%, liquidity 15%, volume 10%. Config persisted to SQLite (`strategy_config` table) — survives server restarts. |
| `services/backtest.ts` | Realistic simulation: win rate from entry price, 30 unique market templates, randomised trade timing |
| `services/telegram.ts` | Retry (3×) + rate-limit handling, top-5 opportunities, real portfolio data in daily reports |
| `services/telegramBot.ts` | Long-polling command bot: 16 commands (see below). Rate limiting per command, inline keyboard confirmation for cancellations, `lastUpdateId` persisted in `poly.db`. |
| `lib/db.ts` | SQLite singleton using `better-sqlite3`. Opens `poly.db` (WAL mode). Tables: `portfolio_orders`, `portfolio_positions`, `portfolio_pnl`, `bot_state`, `strategy_config`, `auto_trade_history`, `market_watchlist`, `price_alerts`, `app_credentials`. |
| `services/scheduler.ts` | Runs every N minutes: (1) fetches live markets, (2) **updates all position prices from live market data**, (3) scans for opportunities, (4) sends Telegram alerts if enabled, (5) executes auto-trades if enabled, (6) **checks price alerts** and fires Telegram if triggered, (7) **alerts expiring positions** (≤48h), (8) **daily summary bot report** at configurable UTC hour. |
| `services/clob.ts` | **Polymarket CLOB API client** — EIP-712 order signing (ethers.js v6), L2 HMAC-SHA256 auth, `placeOrder()`, `getUsdcBalance()`, `getFilledTrades()`, `getLivePositions()`, `computeLivePnlHistory()` |
| `services/autoTrader.ts` | **Auto-trading engine** — DB-backed trade history (`auto_trade_history`), daily trade counter from DB (survives restarts), Kelly-fraction sizing capped by `maxPositionPct`, one trade per market/side per day, `executeOpportunities()` places real orders (YES→BUY, NO→SELL). |
| `app.ts` | Express app with rate limiting: 200 req/15 min general, 30 req/min for write endpoints (`/orders`, `/telegram`, `/auto-trading/scan`). |

## Telegram Bot Commands

| Command | Description |
|---------|-------------|
| `/balance` | Portfolio value, P&L summary, optional live USDC balance |
| `/positions` | All open positions with P&L per position |
| `/orders` | Recent 10 orders with fill status |
| `/cancel <id>` | Cancel open order with inline keyboard confirmation |
| `/pnl` | P&L history table for the last 14 days with cumulative total |
| `/config` | View all strategy settings; update any with `/config <key> <value>` |
| `/markets <keyword>` | Search Polymarket markets by keyword |
| `/scan` | Trigger a strategy scan for opportunities (60s cooldown) |
| `/status` | Auto-trader status: trades today, remaining slots, lifetime count, last scan/trade times |
| `/creds` | Show status of all configured credentials (env or DB) |
| `/watch <marketId>` | Add a market to your watchlist |
| `/unwatch <marketId>` | Remove a market from watchlist |
| `/watchlist` | View all watched markets with live prices |
| `/alert <id> <yes\|no> <above\|below> <price%>` | Set a price alert (e.g. `/alert 540816 yes above 80`) |
| `/alerts` | View all price alerts (active and triggered) |
| `/delalert <id>` | Delete a price alert by ID |
| `/setcred <type> <value>` | Save a credential to DB — types: `privatekey`, `apikey`, `apisecret`, `apipassphrase`, `chatid` |
| `/resetdemo` | Reset all portfolio data (orders, positions, P&L) back to demo values |
| `/help` | List all commands |

**Config keys updateable via `/config <key> <value>`:**
- Numbers: `bankroll`, `maxPositionPct`, `minEdge`, `minProbability`, `maxDaysToResolution`, `minVolume24h`, `minLiquidity`, `scanIntervalMinutes`, `maxDailyTrades`, `maxOpportunities`, `dailyReportHour` (UTC hour 0–23, or -1 to disable)
- Booleans: `autoTradingEnabled`, `telegramAlertsEnabled`

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/healthz` | Server health check |
| GET | `/api/markets` | List/search markets |
| GET | `/api/markets/trending` | Top 5 trending markets by 24h volume |
| GET | `/api/markets/:id` | Market detail |
| GET | `/api/orders` | List orders |
| POST | `/api/orders` | Place new order |
| DELETE | `/api/orders/:id` | Cancel order |
| GET | `/api/positions` | Open positions (prices updated live) |
| GET | `/api/portfolio/summary` | Portfolio summary (bankroll-synced) |
| GET | `/api/portfolio/pnl` | P&L history from SQLite |
| GET | `/api/portfolio/live` | **Live P&L from CLOB** — real positions, realized trade history, USDC balance |
| GET | `/api/strategy/opportunities` | Scanned opportunities |
| GET | `/api/strategy/config` | Read strategy config (from SQLite) |
| PUT | `/api/strategy/config` | Update strategy config (persisted to SQLite) |
| POST | `/api/strategy/backtest` | Run backtest simulation |
| GET | `/api/wallet/status` | Wallet connection + real USDC balance |
| POST | `/api/telegram/test` | Send a test Telegram notification |
| GET | `/api/auto-trading/status` | Auto-trader status, USDC balance, recent trades from DB |
| GET | `/api/auto-trading/history` | Full trade history from SQLite |
| POST | `/api/auto-trading/trigger` | Trigger manual scan + execution cycle |
| GET | `/api/markets/:id/history` | 30-day price history for a market (simulated, seeded) |
| GET | `/api/watchlist` | Get all watched markets |
| POST | `/api/watchlist` | Add market to watchlist |
| DELETE | `/api/watchlist/:marketId` | Remove market from watchlist |
| GET | `/api/watchlist/:marketId` | Check if market is watched |
| GET | `/api/alerts` | List all price alerts |
| POST | `/api/alerts` | Create a new price alert |
| DELETE | `/api/alerts/:id` | Delete a price alert |
| GET | `/api/portfolio/export` | Export CSV — `?type=orders\|positions\|pnl` |

## SQLite Database (`poly.db`)

| Table | Content |
|-------|---------|
| `portfolio_orders` | All orders (seeded + placed) |
| `portfolio_positions` | Current positions with live-updated prices |
| `portfolio_pnl` | Daily P&L and cumulative history |
| `bot_state` | Telegram bot `lastUpdateId` for replay protection |
| `strategy_config` | Persisted strategy config (survives restart) |
| `auto_trade_history` | All auto-executed trades with success/error status |
| `market_watchlist` | User-watched markets |
| `price_alerts` | Price alerts (marketId, side, direction, targetPrice, triggered flag) |
| `app_credentials` | Credentials stored via `/setcred` (env var priority) |

## Shared State

- **`lib/state.ts`** — `PortfolioState` class backed by SQLite. Orders placed via `/api/orders` or by `autoTrader` automatically create/update positions and append PnL points. Portfolio summary uses `bankroll` from `strategy_config` (not hardcoded). Position prices updated every scan cycle via `updatePositionPrices(priceMap)`.

## Data Mode

| Feature | Without credentials | With credentials |
|---------|------------------------|-------------------------|
| Markets | Live Gamma API, demo fallback | Live Gamma API |
| Orders / Positions | SQLite-persisted demo state | SQLite state (updated by real fills) |
| Strategy Config | Persisted to SQLite | Persisted to SQLite |
| Auto-trade History | Persisted to SQLite | Persisted to SQLite |
| USDC Balance | `$0.00` | Real balance from CLOB |
| Live P&L panel | "Not configured" message | Real positions + realized trade history from CLOB |
| Auto-trading | Disabled, shows warning | Places EIP-712 signed orders on CLOB |

## Auto-Trading Setup

Set these in Replit Secrets **or** via the Telegram bot with `/setcred`:

| Variable | Description |
|----------|-------------|
| `POLYMARKET_PRIVATE_KEY` | Ethereum private key (hex, with or without `0x` prefix) |
| `POLYMARKET_API_KEY` | Polymarket CLOB L2 API key |
| `POLYMARKET_API_SECRET` | Polymarket CLOB L2 API secret (HMAC-SHA256 signing) |
| `POLYMARKET_API_PASSPHRASE` | Polymarket CLOB L2 API passphrase |
| `TELEGRAM_BOT_TOKEN` | (Optional) Telegram bot token for alerts and commands |
| `TELEGRAM_CHAT_ID` | (Optional) Telegram chat/channel ID — bot only responds to this ID |

Credentials can also be stored in SQLite via the Telegram bot (`/setcred privatekey 0x...`) and are read with env var priority. Stored in the `app_credentials` table.

**Order signing flow:**
1. EIP-712 typed-data signature using `POLYMARKET_PRIVATE_KEY` (ethers.js Wallet)
2. L2 HMAC-SHA256 header (`POLY_SIGNATURE`) computed from `timestamp + METHOD + path + body`
3. Order submitted to `https://clob.polymarket.com/order` as GTC limit order

## Development

- Frontend auto-refreshes via Vite HMR
- Backend rebuilds on workflow restart (esbuild, ~200 ms)
- API contract defined in `lib/api-spec/openapi.yaml` — edit there, then run `pnpm --filter @workspace/api-spec run codegen`
- Graceful shutdown on `SIGTERM`/`SIGINT`: stops Telegram bot polling and clears scheduler timers
- Workflows: `PORT=8080 pnpm --filter @workspace/api-server run dev` and `PORT=23789 BASE_PATH=/ pnpm --filter @workspace/polymarket-trader run dev`


## Key Files

| File | Purpose |
|------|---------|
| `lib/api-spec/openapi.yaml` | API contract (source of truth) |
| `artifacts/api-server/src/lib/db.ts` | SQLite setup, schema, all 6 tables |
| `artifacts/api-server/src/lib/state.ts` | Portfolio state (SQLite-backed, bankroll-synced) |
| `artifacts/api-server/src/services/strategy.ts` | Strategy config (SQLite-persisted) + opportunity scanner |
| `artifacts/api-server/src/services/clob.ts` | CLOB API client (signing + live data) |
| `artifacts/api-server/src/services/autoTrader.ts` | Auto-trading engine (DB-backed history) |
| `artifacts/api-server/src/services/scheduler.ts` | Scan scheduler (price updates + alerts + auto-trade) |
| `artifacts/api-server/src/services/telegramBot.ts` | 16-command Telegram bot with /watch, /alert, /watchlist, /alerts commands |
| `artifacts/api-server/src/app.ts` | Express app with rate limiting |
| `artifacts/api-server/src/routes/watchlist.ts` | Watchlist CRUD routes |
| `artifacts/api-server/src/routes/alerts.ts` | Price alerts CRUD routes |
| `artifacts/api-server/src/routes/marketHistory.ts` | Market price history (30d simulated) |
| `artifacts/api-server/src/routes/export.ts` | CSV export for orders/positions/pnl |
| `artifacts/polymarket-trader/src/pages/Portfolio.tsx` | Portfolio page with live CLOB panel + pie chart + CSV export |
| `artifacts/polymarket-trader/src/pages/MarketDetail.tsx` | Market detail with 30d price chart, watchlist star, price alert bell |
| `artifacts/polymarket-trader/src/pages/Markets.tsx` | Markets list with watchlist star buttons + filter |
| `artifacts/polymarket-trader/src/pages/Settings.tsx` | Settings page with Telegram bot command reference |
