# PolyTrader - Compressed Documentation

## Overview

PolyTrader is a full-stack trading dashboard designed for Polymarket, a prediction market built on the Polygon blockchain. Its primary purpose is to provide users with a comprehensive platform to monitor markets, manage portfolios, execute automated trading strategies, and analyze performance through a unified interface. The project aims to offer a robust and efficient solution for engaging with prediction markets, enhancing decision-making, and streamlining trading operations.

## User Preferences

This project does not have explicit user preferences defined in the provided `replit.md` file.

## System Architecture

The project is structured as a `pnpm monorepo`.

**API Server (`artifacts/api-server`)**
-   **Framework**: Express.js with TypeScript.
-   **Build System**: `esbuild`, outputting to `dist/index.mjs`.
-   **Database**: SQLite using `better-sqlite3`, storing data in `polytrader.db`.
-   **Port**: 8080.
-   **Key Services**:
    -   `strategy.ts`: Handles scanning, scoring, and configuration management.
    -   `scheduler.ts`: Manages cron jobs, auto-compounding, and balance alerts.
    -   `autoTrader.ts`: The core auto-execution engine.
    -   `paperTrader.ts`: Provides paper trading simulation and analytics.
    -   `polymarket.ts`: Client for the Gamma API.
    -   `clob.ts`: Client for the CLOB API (order execution).
    -   `telegram.ts`: Service for Telegram bot integration.

**Frontend (`artifacts/polymarket-trader`)**
-   **Framework**: React 18 with Vite.
-   **Styling**: Tailwind CSS and shadcn/ui.
-   **State Management**: TanStack Query v5.
-   **Routing**: Wouter.
-   **Port**: 5000.
-   **UI/UX Decisions**: The dashboard focuses on providing a clear and comprehensive overview of trading activities. Features include interactive P&L charts, detailed market listings with filtering, a strategy scanner with composite scoring, and dedicated sections for performance analytics, open positions, and order history. The design emphasizes intuitive navigation and data visualization for effective decision-making.
-   **Key Features**:
    -   **Dashboard**: Portfolio summary, P&L charts, open positions, quick stats.
    -   **Markets**: Active Polymarket listings with filters, watchlist, and price alerts.
    -   **Strategy Scanner**: Automated market scanning based on composite scoring, with a Kelly Calculator widget and one-click manual execution.
    -   **Auto-Trading Bot**: Configurable execution parameters, emergency stop, volatility checks, cooldown mechanisms, risk management, and order recovery.
    -   **Paper Trading Mode**: Simulated trading with separate bankroll, slippage, and fee simulations.
    -   **Performance Analytics**: In-depth analysis of trading performance including win rates, P&L, and trade history.
    -   **Resolution Tracker**: Monitors markets resolving soon.
    -   **Telegram Bot**: Provides control and alerts via Telegram commands.
    -   **Mainnet Preflight Checklist**: Validates conditions for live trading.
    -   **Auto-Compound**: Reinvests profits into the bankroll.
    -   **Balance Low Alert**: Notifies users of low account balances.
-   **Composite Scoring Algorithm**: Evaluates trading opportunities based on a weighted sum of edge, volume, liquidity, and timing scores.
-   **Kelly Criterion**: Utilizes fractional Kelly for optimal position sizing and conservative risk management.

## External Dependencies

-   **Polymarket**: The primary prediction market platform.
-   **Polymarket CLOB API**: Used for automated order execution.
-   **Polygon Blockchain**: The underlying blockchain for Polymarket.
-   **MetaMask**: Recommended wallet for Polygon network interaction.
-   **Telegram**: For bot control and notifications.
-   **SQLite**: Database for the API server (`better-sqlite3`).
-   **Express.js**: Backend framework.
-   **React**: Frontend library.
-   **Vite**: Frontend build tool.
-   **Tailwind CSS**: Utility-first CSS framework.
-   **shadcn/ui**: UI component library.
-   **TanStack Query**: Data fetching and state management.
-   **Wouter**: Frontend routing.
-   **esbuild**: Backend build tool.