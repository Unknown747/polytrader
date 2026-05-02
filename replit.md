# PolyTrader

## Overview

Full-stack trading dashboard for Polymarket (prediction markets on Polygon). Provides live market browsing, portfolio tracking, automated strategy scanning, paper trading, Telegram bot notifications, and live order placement via the Polymarket CLOB API.

## Architecture

**pnpm monorepo** with two main artifacts:

### API Server (`artifacts/api-server`)
- Framework: Express.js 5, TypeScript
- Build: esbuild → `dist/index.mjs`
- Port: 8080
- Database: SQLite via `better-sqlite3` (Linux/VPS, native) **or** `sql.js` (Termux/Android, pure JS — auto-detected at startup)
- DB file: `artifacts/api-server/poly.db`
- Key services: `strategy.ts`, `autoTrader.ts`, `paperTrader.ts`, `polymarket.ts`, `clob.ts`, `telegram.ts`, `telegramBot.ts`, `scheduler.ts`
- Key lib: `db.ts` (SQLite init + schema), `db-adapter.ts` (sql.js compatibility layer), `state.ts` (in-memory state + DB sync)

### Frontend (`artifacts/polymarket-trader`)
- Framework: React 18, Vite 7, Tailwind CSS 4, shadcn/ui
- Port: 5000
- Proxies `/api` → `localhost:8080`

### Shared libraries
- `lib/api-zod`: Zod schemas + OpenAPI spec
- `lib/api-client-react`: Auto-generated typed fetch client

## Database Strategy

`artifacts/api-server/src/lib/db.ts` tries to load `better-sqlite3` (native, fast) and falls back to `sql.js` (pure JS/WASM, no compilation). The `db-adapter.ts` wraps sql.js with a better-sqlite3-compatible API (named params, transactions, pragmas). Both engines use the same `poly.db` file.

## Install Scripts

Two clean install scripts at the repo root:
- `install-linux.sh` — Ubuntu/Debian/CentOS/Arch VPS
- `install-termux.sh` — Termux (Android), patches ARM64 esbuild overrides, handles better-sqlite3 fallback

## Workflows

- **API Server**: `cd artifacts/api-server && pnpm run build && PORT=8080 node --enable-source-maps ./dist/index.mjs`
- **Frontend**: `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/polymarket-trader run dev`

## External Integrations

All credentials stored in SQLite `app_credentials` table (also readable from env vars):
- Polymarket CLOB: `POLYMARKET_PRIVATE_KEY`, `POLYMARKET_API_KEY`, `POLYMARKET_API_SECRET`, `POLYMARKET_API_PASSPHRASE`
- Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

## Key Files

| File | Purpose |
|---|---|
| `artifacts/api-server/src/lib/db.ts` | SQLite init, schema, engine auto-detection |
| `artifacts/api-server/src/lib/db-adapter.ts` | sql.js wrapper (better-sqlite3 API compat) |
| `artifacts/api-server/src/lib/state.ts` | Portfolio state, DB persistence |
| `artifacts/api-server/src/services/strategy.ts` | Opportunity scanner + config |
| `artifacts/api-server/src/services/autoTrader.ts` | Auto-trading engine |
| `artifacts/api-server/src/services/paperTrader.ts` | Paper trading simulation |
| `artifacts/api-server/src/services/clob.ts` | Polymarket CLOB API client |
| `artifacts/api-server/src/services/telegram.ts` | Telegram notification helpers |
| `artifacts/api-server/src/services/telegramBot.ts` | Telegram bot command handler |
| `artifacts/api-server/build.mjs` | esbuild bundler config |
| `install-linux.sh` | VPS/Linux installer |
| `install-termux.sh` | Termux (Android) installer |
| `README.md` | Complete user documentation |
