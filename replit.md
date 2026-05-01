# Polymarket Trader

A Polymarket prediction market trading dashboard built for Polygon mainnet. Currently running with fake data for testing.

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
- **Markets** — Browse/search/filter prediction markets by category and status
- **Market Detail** — Market info + buy/sell YES/NO order form with real-time price preview
- **Positions** — Open positions with unrealized P&L
- **Orders** — Order history with cancel support
- **Portfolio** — Cumulative P&L chart, daily P&L bar chart, position breakdown

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
