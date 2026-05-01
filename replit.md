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

- **`services/polymarket.ts`** — Polymarket Gamma API client with 5-min caching
- **`services/strategy.ts`** — Strategy scanner with half-Kelly criterion, opportunity scoring
- **`services/backtest.ts`** — Historical simulation engine (deterministic, parameterizable)
- **`services/telegram.ts`** — Telegram bot notifications (opportunities, fills, daily P&L)
- **`services/scheduler.ts`** — Background auto-scan cron (configurable interval)

## Data Mode

All data is currently **fake/simulated** in the API server (`artifacts/api-server/src/routes/`). Markets, positions, orders, and portfolio data are all hardcoded for testing.

To connect to Polymarket mainnet (Polygon), replace the fake data routes with calls to the [Polymarket CLOB API](https://docs.polymarket.com).

## Development

- Frontend auto-refreshes via Vite HMR
- Backend rebuilds on workflow restart
- API contract is defined in `lib/api-spec/openapi.yaml` — edit there, then run codegen

## Key Files

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `artifacts/api-server/src/routes/` — Backend route handlers with fake data
- `artifacts/polymarket-trader/src/pages/` — Frontend pages
- `artifacts/polymarket-trader/src/components/layout/` — Sidebar + AppLayout
