package db

import (
	"database/sql"
	"log"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

var DB *sql.DB

func Init() {
	dbPath := filepath.Join(os.Getenv("DB_DIR"), "poly.db")
	if dbPath == "/poly.db" {
		dbPath = "poly.db"
	}

	var err error
	DB, err = sql.Open("sqlite", dbPath+"?_pragma=journal_mode(WAL)&_pragma=foreign_keys(ON)")
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}

	if err = DB.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	DB.SetMaxOpenConns(1)

	log.Printf("Database opened: %s", dbPath)
	createSchema()
	log.Println("Schema initialized")
}

func createSchema() {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS portfolio_orders (
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
		)`,
		`CREATE TABLE IF NOT EXISTS portfolio_positions (
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
		)`,
		`CREATE TABLE IF NOT EXISTS portfolio_pnl (
			date TEXT PRIMARY KEY,
			pnl REAL NOT NULL,
			cumulative REAL NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS bot_state (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS strategy_config (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS auto_trade_history (
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
		)`,
		`CREATE TABLE IF NOT EXISTS app_credentials (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS market_watchlist (
			market_id TEXT PRIMARY KEY,
			market_question TEXT NOT NULL,
			category TEXT NOT NULL DEFAULT '',
			yes_price REAL NOT NULL DEFAULT 0,
			no_price REAL NOT NULL DEFAULT 0,
			volume24h REAL NOT NULL DEFAULT 0,
			added_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS price_alerts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			market_id TEXT NOT NULL,
			market_question TEXT NOT NULL,
			side TEXT NOT NULL CHECK(side IN ('YES','NO')),
			direction TEXT NOT NULL CHECK(direction IN ('above','below')),
			target_price REAL NOT NULL,
			triggered INTEGER NOT NULL DEFAULT 0,
			triggered_at TEXT,
			created_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS resolved_market_notifications (
			position_id TEXT NOT NULL,
			side TEXT NOT NULL,
			notified_at TEXT NOT NULL,
			PRIMARY KEY (position_id, side)
		)`,
		`CREATE TABLE IF NOT EXISTS position_risk_events (
			position_id TEXT NOT NULL,
			event_type TEXT NOT NULL,
			executed_at TEXT NOT NULL,
			shares_sold REAL NOT NULL DEFAULT 0,
			realized_pnl REAL NOT NULL DEFAULT 0,
			price_at_execution REAL NOT NULL DEFAULT 0,
			PRIMARY KEY (position_id, event_type)
		)`,
		`CREATE TABLE IF NOT EXISTS paper_trades (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			timestamp TEXT NOT NULL,
			market_id TEXT NOT NULL,
			question TEXT NOT NULL,
			category TEXT NOT NULL DEFAULT '',
			side TEXT NOT NULL CHECK(side IN ('YES','NO')),
			entry_price REAL NOT NULL,
			effective_entry_price REAL,
			amount REAL NOT NULL,
			shares REAL NOT NULL,
			edge REAL NOT NULL,
			composite_score REAL NOT NULL,
			slippage_pct REAL NOT NULL DEFAULT 0,
			fee_pct REAL NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'open',
			exit_price REAL,
			effective_exit_price REAL,
			pnl REAL,
			pnl_pct REAL,
			closed_at TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS paper_portfolio (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS low_balance_alerts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			balance REAL NOT NULL,
			threshold REAL NOT NULL,
			alerted_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS equity_snapshots (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			timestamp TEXT NOT NULL,
			balance REAL NOT NULL,
			unrealized_pnl REAL NOT NULL DEFAULT 0,
			total_value REAL NOT NULL,
			drawdown_pct REAL NOT NULL DEFAULT 0,
			is_ath INTEGER NOT NULL DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS market_price_history (
			market_id TEXT NOT NULL,
			price REAL NOT NULL,
			recorded_at TEXT NOT NULL,
			PRIMARY KEY (market_id, recorded_at)
		)`,
		`CREATE TABLE IF NOT EXISTS trading_risk_state (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)`,
	}

	for _, stmt := range stmts {
		if _, err := DB.Exec(stmt); err != nil {
			log.Fatalf("Schema error: %v\nSQL: %s", err, stmt)
		}
	}
}

func GetCred(key string) string {
	var val string
	err := DB.QueryRow("SELECT value FROM app_credentials WHERE key = ?", key).Scan(&val)
	if err != nil {
		return ""
	}
	return val
}
