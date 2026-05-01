import { createRequire } from "node:module";
import path from "node:path";
import type BetterSqlite3NS from "better-sqlite3";
import { logger } from "./logger";

const _require = createRequire(import.meta.url);
const Database = _require("better-sqlite3") as typeof BetterSqlite3NS;

const DB_PATH = path.resolve(process.cwd(), "poly.db");

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS portfolio_orders (
    id TEXT PRIMARY KEY,
    market_id TEXT NOT NULL,
    market_question TEXT NOT NULL,
    side TEXT NOT NULL CHECK(side IN ('YES','NO')),
    type TEXT NOT NULL CHECK(type IN ('BUY','SELL')),
    price REAL NOT NULL,
    amount REAL NOT NULL,
    shares REAL NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('open','filled','cancelled','partial')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS portfolio_positions (
    id TEXT PRIMARY KEY,
    market_id TEXT NOT NULL,
    market_question TEXT NOT NULL,
    side TEXT NOT NULL CHECK(side IN ('YES','NO')),
    shares REAL NOT NULL,
    avg_price REAL NOT NULL,
    current_price REAL NOT NULL,
    pnl REAL NOT NULL,
    pnl_percent REAL NOT NULL,
    value REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS portfolio_pnl (
    date TEXT PRIMARY KEY,
    pnl REAL NOT NULL,
    cumulative REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bot_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS strategy_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auto_trade_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    market_id TEXT NOT NULL,
    question TEXT NOT NULL,
    side TEXT NOT NULL CHECK(side IN ('YES','NO')),
    price REAL NOT NULL,
    amount REAL NOT NULL,
    edge REAL NOT NULL,
    composite_score REAL NOT NULL,
    order_id TEXT,
    success INTEGER NOT NULL CHECK(success IN (0,1)),
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS app_credentials (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS market_watchlist (
    market_id TEXT PRIMARY KEY,
    market_question TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    yes_price REAL NOT NULL DEFAULT 0,
    no_price REAL NOT NULL DEFAULT 0,
    volume24h REAL NOT NULL DEFAULT 0,
    added_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS price_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    market_id TEXT NOT NULL,
    market_question TEXT NOT NULL,
    side TEXT NOT NULL CHECK(side IN ('YES','NO')),
    direction TEXT NOT NULL CHECK(direction IN ('above','below')),
    target_price REAL NOT NULL,
    triggered INTEGER NOT NULL DEFAULT 0,
    triggered_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS resolved_market_notifications (
    position_id TEXT NOT NULL,
    side TEXT NOT NULL,
    notified_at TEXT NOT NULL,
    PRIMARY KEY (position_id, side)
  );

  CREATE TABLE IF NOT EXISTS position_risk_events (
    position_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    executed_at TEXT NOT NULL,
    shares_sold REAL NOT NULL DEFAULT 0,
    realized_pnl REAL NOT NULL DEFAULT 0,
    price_at_execution REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (position_id, event_type)
  );
`);

logger.info({ path: DB_PATH }, "SQLite database opened (poly.db)");

export default db;
