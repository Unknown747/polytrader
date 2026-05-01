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
`);

logger.info({ path: DB_PATH }, "SQLite database opened (poly.db)");

export default db;
