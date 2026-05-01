# Polymarket Trader

## Overview
Polymarket Trader is a comprehensive full-stack prediction market trading dashboard designed for Polygon mainnet. It provides real-time market data, advanced trading tools, and automation capabilities for Polymarket. The project aims to empower users with a sophisticated platform for analyzing, executing, and managing their prediction market investments, offering features like strategy scanning, backtesting, and automated order execution via the Polymarket CLOB API. Its core purpose is to streamline the trading experience and enhance decision-making through data-driven insights and efficient automation.

## User Preferences
I prefer detailed explanations.
I want iterative development.
Ask before making major changes.
I prefer to be shown the code changes rather than just being told about them.
Do not make changes to the `lib/api-client-react` directory.
Do not make changes to the `lib/api-zod` directory.

## System Architecture
The project is structured as a `pnpm` monorepo, separating the application into distinct artifacts and shared libraries.

### UI/UX Decisions
The frontend is built with React and Vite, focusing on a responsive and intuitive user interface. Key UI components include:
- **Correlation Heatmap:** Visualizes pairwise Pearson correlation of YES prices.
- **Portfolio Risk Score panel:** An SVG gauge displaying a composite risk score (HHI concentration, resolution urgency, drawdown).
- **Charts:** Cumulative P&L area chart, daily P&L bar chart, Portfolio Allocation donut chart, 30-day market price history charts.
- **Interactive Elements:** Watchlist stars, price alert bells, stop-loss/take-profit sliders, 3-step credential setup wizard with progress dots.

### Technical Implementations
- **Monorepo Structure:** Uses `pnpm` for managing multiple packages:
    - `@workspace/polymarket-trader`: React + Vite frontend.
    - `@workspace/api-server`: Express backend API.
    - `@workspace/mockup-sandbox`: Replit canvas design preview.
    - `lib/api-spec`: OpenAPI specification for API contract.
    - `lib/api-client-react`: Generated TanStack Query hooks.
    - `lib/api-zod`: Generated Zod validation schemas.
- **Backend Framework:** Express.js for the API server, with rate limiting implemented.
- **Database:** SQLite using `better-sqlite3` for persistent storage of portfolio data, strategy configurations, auto-trade history, market watchlists, price alerts, and application credentials.
- **Real-time Data:** Server-Sent Events (SSE) for live price updates every 15 seconds.
- **Order Execution:** Integration with Polymarket CLOB API for order placement, requiring EIP-712 order signing (using ethers.js v6) and L2 HMAC-SHA256 authentication.
- **Strategy Engine:** Composite scoring system for market opportunities (edge, expected return, time urgency, liquidity, volume) with configuration persisted in SQLite.
- **Backtesting:** Realistic simulation incorporating CLOB taker fees (1%) and bid-ask spread simulation (0.3–2.5%).
- **Auto-trading Engine:** Manages automated order placement based on strategy, with daily trade limits, Kelly-fraction sizing, and DB-backed trade history.
- **Scheduling:** A scheduler service runs periodically to fetch live market data, update position prices, scan for opportunities, send Telegram alerts, execute auto-trades, and provide daily summary reports.
- **Credential Management:** Secure storage of API keys and private keys, with priority given to environment variables over database storage.

### Feature Specifications
- **Dashboard:** Portfolio summary, risk score, P&L charts, trending markets.
- **Markets:** Browse, search, filter markets with real-time data from Polymarket Gamma API.
- **Market Detail:** Comprehensive market info, order forms, price history, watchlist, price alerts.
- **Positions & Orders:** Track open positions with live P&L, view order history, cancel orders.
- **Portfolio:** Detailed P&L analysis, allocation breakdown, live CLOB P&L panel, CSV export.
- **Strategy Scanner:** Identifies near-resolution high-probability markets, applies trend filters, and uses half-Kelly sizing recommendations.
- **Settings:** Credential setup, configurable stop-loss/take-profit sliders, trend filter toggle, Telegram integration for notifications and remote control.
- **Telegram Bot:** A 16-command bot for portfolio management, strategy configuration, market search, alerts, and credential management.

## External Dependencies
- **Polymarket Gamma API:** For fetching real-time market data, with a 5-minute cache and retry mechanism.
- **Polymarket CLOB API:** For placing and managing orders, retrieving live positions, and calculating live P&L. Requires EIP-712 signing and L2 HMAC-SHA256 authentication.
- **Telegram Bot API:** For sending notifications, alerts, and enabling remote control of the trading system via a Telegram bot.
- **SQLite:** Used as the primary database for persistent storage.
- **ethers.js v6:** For Ethereum private key management and EIP-712 order signing.
- **TanStack Query:** For data fetching and state management in the React frontend.
- **Vite:** Frontend build tool.
- **Express.js:** Backend web framework.
- **better-sqlite3:** SQLite driver for Node.js.
- **Orval:** OpenAPI client code generator.
- **Zod:** Schema validation library.