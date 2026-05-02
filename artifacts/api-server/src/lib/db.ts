import { createRequire } from "node:module";
import path from "node:path";
import type BetterSqlite3NS from "better-sqlite3";
import pino from "pino";
import { SqlJsAdapter, type SqlJsNamespace } from "./db-adapter.js";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});

// ─── Unified DB interface (better-sqlite3 and SqlJsAdapter are both compatible)

export type DbLike = {
  prepare(sql: string): {
    run(...args: unknown[]): { lastInsertRowid: number | bigint; changes: number };
    get(...args: unknown[]): Record<string, unknown> | undefined;
    all(...args: unknown[]): Record<string, unknown>[];
  };
  exec(sql: string): void;
  pragma(nameExpr: string): unknown;
  transaction<T>(fn: () => T): () => T;
};

const _require = createRequire(import.meta.url);
const DB_PATH = path.resolve(process.cwd(), "poly.db");

// ─── DB initialisation — try better-sqlite3 first, fall back to sql.js ───────
// On Linux/VPS: better-sqlite3 compiles natively and is used (fast).
// On Termux/Android or any environment where the native module fails to load,
// sql.js (pure JS/WASM, no compilation needed) is used transparently.

let db: DbLike;

try {
  const Database = _require("better-sqlite3") as typeof BetterSqlite3NS;
  const rawDb = new Database(DB_PATH);
  rawDb.pragma("journal_mode = WAL");
  rawDb.pragma("foreign_keys = ON");
  db = rawDb as unknown as DbLike;
  logger.info({ path: DB_PATH, engine: "better-sqlite3" }, "Database opened");
} catch (nativeErr) {
  logger.warn(
    { err: (nativeErr as Error).message },
    "better-sqlite3 unavailable — falling back to sql.js (Termux / no-native mode)"
  );
  const { default: initSqlJs } = await import("sql.js");
  const SQL = (await initSqlJs()) as unknown as SqlJsNamespace;
  const adapter = new SqlJsAdapter(DB_PATH, SQL);
  adapter.pragma("foreign_keys = ON");
  db = adapter;
  logger.info({ path: DB_PATH, engine: "sql.js" }, "Database opened");
}

// ─── Schema ───────────────────────────────────────────────────────────────────

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
  )
`);

db.exec(`
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
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS portfolio_pnl (
    date TEXT PRIMARY KEY,
    pnl REAL NOT NULL,
    cumulative REAL NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS bot_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS strategy_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

db.exec(`
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
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS app_credentials (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS market_watchlist (
    market_id TEXT PRIMARY KEY,
    market_question TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    yes_price REAL NOT NULL DEFAULT 0,
    no_price REAL NOT NULL DEFAULT 0,
    volume24h REAL NOT NULL DEFAULT 0,
    added_at TEXT NOT NULL
  )
`);

db.exec(`
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
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS resolved_market_notifications (
    position_id TEXT NOT NULL,
    side TEXT NOT NULL,
    notified_at TEXT NOT NULL,
    PRIMARY KEY (position_id, side)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS position_risk_events (
    position_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    executed_at TEXT NOT NULL,
    shares_sold REAL NOT NULL DEFAULT 0,
    realized_pnl REAL NOT NULL DEFAULT 0,
    price_at_execution REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (position_id, event_type)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS paper_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    market_id TEXT NOT NULL,
    question TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    side TEXT NOT NULL CHECK(side IN ('YES','NO')),
    entry_price REAL NOT NULL,
    amount REAL NOT NULL,
    shares REAL NOT NULL,
    edge REAL NOT NULL,
    composite_score REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    exit_price REAL,
    pnl REAL,
    pnl_pct REAL,
    closed_at TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS paper_portfolio (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS low_balance_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    balance REAL NOT NULL,
    threshold REAL NOT NULL,
    alerted_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS equity_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    balance REAL NOT NULL,
    unrealized_pnl REAL NOT NULL DEFAULT 0,
    total_value REAL NOT NULL,
    drawdown_pct REAL NOT NULL DEFAULT 0,
    is_ath INTEGER NOT NULL DEFAULT 0
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS market_price_history (
    market_id TEXT NOT NULL,
    price REAL NOT NULL,
    recorded_at TEXT NOT NULL,
    PRIMARY KEY (market_id, recorded_at)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS trading_risk_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

export default db;
