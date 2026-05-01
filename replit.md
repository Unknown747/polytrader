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

- **Dashboard** — Portfolio summary stats, cumulative P&L area chart, trending markets list
- **Markets** — Browse/search/filter prediction markets (real Polymarket Gamma API with demo fallback)
- **Market Detail** — Market info + buy/sell YES/NO order form
- **Positions** — Open positions with unrealized P&L
- **Orders** — Order history with cancel support
- **Portfolio** — Cumulative P&L chart, daily P&L bar chart, position breakdown, **live CLOB P&L panel** (real-time positions + realized trade history from Polymarket when credentials are set)
- **Strategy Scanner** — Scans near-resolution high-probability markets (>80%, <21 days), composite scoring across 5 factors, half-Kelly sizing
- **Backtester** — Simulates strategy on historical data, shows equity curve, win rate, Sharpe ratio, trade log
- **Settings** — Wallet status (real USDC balance from CLOB), Telegram setup, strategy + auto-trading config, **auto-trading status panel** with recent trades, USDC balance, daily slot counter, and manual scan trigger

## Backend Services

| File | Responsibility |
|------|---------------|
| `services/polymarket.ts` | Polymarket Gamma API client — 5-min cache, retry (3×), multi-page fetch (up to 1 000 markets), tokenId parsing from `clobTokenIds` |
| `services/strategy.ts` | Composite scoring: edge 35%, expected return 20%, time urgency 20%, liquidity 15%, volume 10%. Configurable `minLiquidity` and `maxOpportunities`. |
| `services/backtest.ts` | Realistic simulation: win rate from entry price, 30 unique market templates, randomised trade timing |
| `services/telegram.ts` | Retry (3×) + rate-limit handling, top-5 opportunities, real portfolio data in daily reports |
| `services/telegramBot.ts` | Long-polling command bot: `/balance`, `/positions`, `/scan`, `/status`, `/help`. Only responds to authorized `TELEGRAM_CHAT_ID`. Starts automatically when `TELEGRAM_BOT_TOKEN` is set. |
| `services/scheduler.ts` | Immediate first scan (5 s delay), interval scan, daily report; calls `executeOpportunities()` when auto-trading is on |
| `services/clob.ts` | **Polymarket CLOB API client** — EIP-712 order signing (ethers.js v6), L2 HMAC-SHA256 auth, `placeOrder()`, `getUsdcBalance()`, `getOpenOrders()`, `getFilledTrades()`, `getLivePositions()`, `computeLivePnlHistory()` |
| `services/autoTrader.ts` | **Auto-trading engine** — daily trade counter, Kelly-fraction sizing capped by `maxPositionPct`, one trade per market/side per day, `executeOpportunities()` places real orders and updates portfolio state |

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server health check |
| GET | `/api/markets` | List/search markets |
| GET | `/api/markets/:id` | Market detail |
| GET/POST | `/api/orders` | List orders / place new order |
| DELETE | `/api/orders/:id` | Cancel order |
| GET | `/api/positions` | Open positions |
| GET | `/api/portfolio/summary` | Portfolio summary metrics |
| GET | `/api/portfolio/pnl` | P&L history (in-memory) |
| GET | `/api/portfolio/live` | **Live P&L from CLOB** — real positions, realized trade history, USDC balance |
| GET | `/api/strategy/opportunities` | Scanned opportunities |
| GET/POST | `/api/strategy/config` | Read/update strategy config |
| POST | `/api/strategy/backtest` | Run backtest simulation |
| GET | `/api/wallet/status` | Wallet connection + real USDC balance |
| GET/POST | `/api/telegram/test` | Telegram bot test |
| GET | `/api/auto-trading/status` | Auto-trader status, USDC balance, recent trades |
| GET | `/api/auto-trading/history` | Last 100 executed trades |
| POST | `/api/auto-trading/trigger` | Trigger manual scan + execution cycle |

## Shared State

- **`lib/state.ts`** — In-memory `PortfolioState` class: orders, positions, PnL history. Orders placed via `/api/orders` or by `autoTrader` automatically create/update positions and append PnL points. Portfolio summary is computed live.

## Data Mode

| Feature | When credentials absent | When credentials present |
|---------|------------------------|-------------------------|
| Markets | Live Gamma API, demo fallback | Live Gamma API |
| Orders / Positions / Portfolio | In-memory demo state | In-memory state (updated by real fills) |
| USDC Balance | `$0.00` | Real balance from CLOB |
| Live P&L panel | "Not configured" message | Real positions + realized trade history from CLOB |
| Auto-trading | Disabled, shows warning | Places EIP-712 signed orders on CLOB |

## Auto-Trading Setup

To enable live order execution on Polymarket CLOB, set these environment variables in Replit Secrets:

| Variable | Description |
|----------|-------------|
| `POLYMARKET_PRIVATE_KEY` | Ethereum private key (hex, with or without `0x` prefix) |
| `POLYMARKET_API_KEY` | Polymarket CLOB L2 API key |
| `POLYMARKET_API_SECRET` | Polymarket CLOB L2 API secret (HMAC-SHA256 signing) |
| `POLYMARKET_API_PASSPHRASE` | Polymarket CLOB L2 API passphrase |
| `TELEGRAM_BOT_TOKEN` | (Optional) Telegram bot token for alerts |
| `TELEGRAM_CHAT_ID` | (Optional) Telegram chat/channel ID for alerts |

**Order signing flow:**
1. EIP-712 typed-data signature using `POLYMARKET_PRIVATE_KEY` (ethers.js Wallet)
2. L2 HMAC-SHA256 header (`POLY_SIGNATURE`) computed from `timestamp + METHOD + path + body` using `POLYMARKET_API_SECRET`
3. Order submitted to `https://clob.polymarket.com/order` as GTC limit order

After setting credentials, go to **Settings → Auto-Trading Config**, enable the toggle, and set `maxDailyTrades`. The scanner will start placing real orders automatically on each scan interval.

## Development

- Frontend auto-refreshes via Vite HMR
- Backend rebuilds on workflow restart (esbuild, ~200 ms)
- API contract is defined in `lib/api-spec/openapi.yaml` — edit there, then run `pnpm --filter @workspace/api-spec run codegen`
- Workflows: `PORT=8080 pnpm --filter @workspace/api-server run dev` and `PORT=23789 BASE_PATH=/ pnpm --filter @workspace/polymarket-trader run dev`

## Key Files

| File | Purpose |
|------|---------|
| `lib/api-spec/openapi.yaml` | API contract (source of truth) |
| `artifacts/api-server/src/lib/state.ts` | In-memory portfolio state |
| `artifacts/api-server/src/services/clob.ts` | CLOB API client (signing + live data) |
| `artifacts/api-server/src/services/autoTrader.ts` | Auto-trading execution engine |
| `artifacts/api-server/src/services/scheduler.ts` | Scan scheduler + auto-trade hook |
| `artifacts/api-server/src/routes/` | Backend route handlers |
| `artifacts/polymarket-trader/src/pages/Portfolio.tsx` | Portfolio page with live CLOB panel |
| `artifacts/polymarket-trader/src/pages/Settings.tsx` | Settings page with auto-trading status |
