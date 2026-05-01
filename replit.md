# Polymarket Trader

A full Polymarket prediction market trading dashboard for Polygon mainnet with real market data, strategy scanner, backtesting, and Telegram notifications.

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
- **Portfolio** — Cumulative P&L chart, daily P&L bar chart, position breakdown
- **Strategy Scanner** — Scans near-resolution high-probability markets (>80%, <21 days), calculates edge and half-Kelly sizing
- **Backtester** — Simulates strategy on historical data, shows equity curve, win rate, Sharpe ratio, trade log
- **Settings** — Wallet status, Telegram setup, auto-trading bot config (scan interval, min edge, max position, etc.)

## Backend Services

- **`services/polymarket.ts`** — Polymarket Gamma API client with 5-min caching, retry logic (3 attempts), multi-page fetching (up to 5 pages × 200 markets = 1000 markets), tokenId parsing from clobTokenIds
- **`services/strategy.ts`** — Composite scoring strategy: edge (35%), expected return (20%), time urgency (20%), liquidity (15%), volume (10%). Configurable `minLiquidity` and `maxOpportunities`. Sorted by composite score, not just edge.
- **`services/backtest.ts`** — Realistic simulation: win rate derived from entry price (not hardcoded), 30 unique market templates (no cycling), randomized trade timing, sorted output
- **`services/telegram.ts`** — Retry logic (3 attempts + rate-limit handling), shows top 5 opportunities (not 3), real portfolio data in daily reports, skip if unconfigured
- **`services/scheduler.ts`** — Immediate first scan on startup (5s delay), real portfolio summary in daily report, `triggerManualScan()` and `triggerDailyReport()` exposed for manual triggers

## Shared State

- **`lib/state.ts`** — In-memory `PortfolioState` class: holds orders, positions, PnL history. Orders placed via `/api/orders` automatically create/update positions and append PnL points. Portfolio summary is computed live from state.

## Data Mode

- **Markets** — Live Polymarket Gamma API with multi-page fetch; falls back to 10 demo markets if unavailable
- **Positions, Orders, Portfolio** — Dynamic in-memory state (resets on restart). Orders placed update positions and portfolio in real-time
- **Strategy** — Live scan against real Gamma API markets; falls back to demo markets if unavailable

To connect to Polymarket mainnet (Polygon) for live trading, set wallet secrets in Settings (see wallet connection instructions).

## Development

- Frontend auto-refreshes via Vite HMR
- Backend rebuilds on workflow restart
- API contract is defined in `lib/api-spec/openapi.yaml` — edit there, then run codegen

## Key Files

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `artifacts/api-server/src/routes/` — Backend route handlers with fake data
- `artifacts/polymarket-trader/src/pages/` — Frontend pages
- `artifacts/polymarket-trader/src/components/layout/` — Sidebar + AppLayout
