const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.resolve(__dirname, "poly.db"));
db.pragma("journal_mode = WAL");

const markets = [
  { id: "mkt-001", question: "Will the Federal Reserve cut rates at the June 2026 FOMC meeting?" },
  { id: "mkt-002", question: "Will Bitcoin stay above $90,000 through June 2026?" },
  { id: "mkt-003", question: "Will Donald Trump sign a new executive order on AI by July 2026?" },
  { id: "mkt-004", question: "Will Apple announce a new AI chip at WWDC 2026?" },
  { id: "mkt-005", question: "Will Ethereum ETH price exceed $3,000 by end of May 2026?" },
  { id: "mkt-006", question: "Will the S&P 500 close above 5,800 in June 2026?" },
  { id: "mkt-007", question: "Will SpaceX successfully launch Starship to orbit before August 2026?" },
  { id: "mkt-008", question: "Will OpenAI release GPT-5 before September 2026?" },
  { id: "mkt-009", question: "Will Tesla stock exceed $300 by end of Q2 2026?" },
  { id: "mkt-010", question: "Will the US unemployment rate drop below 4% by July 2026?" },
  { id: "mkt-011", question: "Will Solana SOL price exceed $200 before July 2026?" },
  { id: "mkt-012", question: "Will Meta release a new AR glasses product in 2026?" },
];

db.exec("DELETE FROM portfolio_orders");
db.exec("DELETE FROM portfolio_positions");
db.exec("DELETE FROM portfolio_pnl");
db.exec("DELETE FROM auto_trade_history");

const insertOrder = db.prepare(`
  INSERT INTO portfolio_orders (id, market_id, market_question, side, type, price, amount, shares, status, created_at)
  VALUES (@id, @market_id, @market_question, @side, @type, @price, @amount, @shares, @status, @created_at)
`);

function mq(id) { return markets.find(m => m.id === id).question; }

const orders = [
  { id: "ord-001", market_id: "mkt-001", market_question: mq("mkt-001"), side: "YES", type: "BUY",  price: 0.72, shares: 200, status: "filled",    created_at: "2026-01-10T09:23:11Z" },
  { id: "ord-002", market_id: "mkt-002", market_question: mq("mkt-002"), side: "YES", type: "BUY",  price: 0.81, shares: 250, status: "filled",    created_at: "2026-01-15T14:05:32Z" },
  { id: "ord-003", market_id: "mkt-005", market_question: mq("mkt-005"), side: "YES", type: "BUY",  price: 0.68, shares: 200, status: "filled",    created_at: "2026-01-20T11:48:00Z" },
  { id: "ord-004", market_id: "mkt-003", market_question: mq("mkt-003"), side: "YES", type: "BUY",  price: 0.55, shares: 300, status: "filled",    created_at: "2026-01-25T16:30:00Z" },
  { id: "ord-005", market_id: "mkt-006", market_question: mq("mkt-006"), side: "YES", type: "BUY",  price: 0.63, shares: 150, status: "filled",    created_at: "2026-02-03T10:12:00Z" },
  { id: "ord-006", market_id: "mkt-004", market_question: mq("mkt-004"), side: "YES", type: "BUY",  price: 0.77, shares: 180, status: "filled",    created_at: "2026-02-10T13:55:00Z" },
  { id: "ord-007", market_id: "mkt-007", market_question: mq("mkt-007"), side: "YES", type: "BUY",  price: 0.44, shares: 400, status: "filled",    created_at: "2026-02-18T09:00:00Z" },
  { id: "ord-008", market_id: "mkt-005", market_question: mq("mkt-005"), side: "YES", type: "SELL", price: 0.82, shares: 100, status: "filled",    created_at: "2026-02-22T15:20:00Z" },
  { id: "ord-009", market_id: "mkt-008", market_question: mq("mkt-008"), side: "YES", type: "BUY",  price: 0.58, shares: 250, status: "filled",    created_at: "2026-03-01T08:45:00Z" },
  { id: "ord-010", market_id: "mkt-009", market_question: mq("mkt-009"), side: "NO",  type: "BUY",  price: 0.35, shares: 300, status: "filled",    created_at: "2026-03-08T11:30:00Z" },
  { id: "ord-011", market_id: "mkt-002", market_question: mq("mkt-002"), side: "YES", type: "BUY",  price: 0.79, shares: 100, status: "filled",    created_at: "2026-03-12T14:10:00Z" },
  { id: "ord-012", market_id: "mkt-010", market_question: mq("mkt-010"), side: "YES", type: "BUY",  price: 0.48, shares: 200, status: "filled",    created_at: "2026-03-20T10:00:00Z" },
  { id: "ord-013", market_id: "mkt-006", market_question: mq("mkt-006"), side: "YES", type: "SELL", price: 0.71, shares: 80,  status: "filled",    created_at: "2026-03-25T16:40:00Z" },
  { id: "ord-014", market_id: "mkt-011", market_question: mq("mkt-011"), side: "YES", type: "BUY",  price: 0.52, shares: 350, status: "filled",    created_at: "2026-04-02T09:15:00Z" },
  { id: "ord-015", market_id: "mkt-012", market_question: mq("mkt-012"), side: "YES", type: "BUY",  price: 0.66, shares: 220, status: "filled",    created_at: "2026-04-08T12:00:00Z" },
  { id: "ord-016", market_id: "mkt-003", market_question: mq("mkt-003"), side: "YES", type: "SELL", price: 0.72, shares: 150, status: "filled",    created_at: "2026-04-12T15:30:00Z" },
  { id: "ord-017", market_id: "mkt-007", market_question: mq("mkt-007"), side: "YES", type: "BUY",  price: 0.51, shares: 200, status: "filled",    created_at: "2026-04-15T10:45:00Z" },
  { id: "ord-018", market_id: "mkt-009", market_question: mq("mkt-009"), side: "NO",  type: "SELL", price: 0.28, shares: 150, status: "filled",    created_at: "2026-04-18T14:20:00Z" },
  { id: "ord-019", market_id: "mkt-008", market_question: mq("mkt-008"), side: "YES", type: "BUY",  price: 0.61, shares: 150, status: "partial",   created_at: "2026-04-22T11:00:00Z" },
  { id: "ord-020", market_id: "mkt-001", market_question: mq("mkt-001"), side: "YES", type: "BUY",  price: 0.88, shares: 100, status: "open",      created_at: "2026-04-28T09:30:00Z" },
  { id: "ord-021", market_id: "mkt-011", market_question: mq("mkt-011"), side: "YES", type: "BUY",  price: 0.64, shares: 100, status: "open",      created_at: "2026-04-29T10:15:00Z" },
  { id: "ord-022", market_id: "mkt-004", market_question: mq("mkt-004"), side: "YES", type: "SELL", price: 0.90, shares: 90,  status: "cancelled", created_at: "2026-04-20T13:00:00Z" },
];

const insertOrderTx = db.transaction(() => {
  for (const o of orders) {
    insertOrder.run({ ...o, amount: parseFloat((o.price * o.shares).toFixed(2)) });
  }
});
insertOrderTx();

const insertPosition = db.prepare(`
  INSERT INTO portfolio_positions (id, market_id, market_question, side, shares, avg_price, current_price, pnl, pnl_percent, value)
  VALUES (@id, @market_id, @market_question, @side, @shares, @avg_price, @current_price, @pnl, @pnl_percent, @value)
`);

function calcPosition(id, mktId, side, shares, avgPrice, currentPrice) {
  const cost = shares * avgPrice;
  const value = parseFloat((shares * currentPrice).toFixed(2));
  const pnl = parseFloat((value - cost).toFixed(2));
  const pnlPct = parseFloat(((pnl / cost) * 100).toFixed(2));
  const q = markets.find(m => m.id === mktId);
  return { id, market_id: mktId, market_question: q.question, side, shares, avg_price: avgPrice, current_price: currentPrice, pnl, pnl_percent: pnlPct, value };
}

const positions = [
  calcPosition("pos-001", "mkt-001", "YES", 300, 0.76, 0.87),
  calcPosition("pos-002", "mkt-002", "YES", 350, 0.80, 0.85),
  calcPosition("pos-003", "mkt-005", "YES", 100, 0.68, 0.54),
  calcPosition("pos-004", "mkt-007", "YES", 600, 0.47, 0.61),
  calcPosition("pos-005", "mkt-008", "YES", 400, 0.59, 0.67),
  calcPosition("pos-006", "mkt-009", "NO",  150, 0.35, 0.29),
  calcPosition("pos-007", "mkt-011", "YES", 450, 0.54, 0.71),
  calcPosition("pos-008", "mkt-012", "YES", 220, 0.66, 0.72),
];

const insertPosTx = db.transaction(() => {
  for (const p of positions) insertPosition.run(p);
});
insertPosTx();

const insertPnl = db.prepare(`
  INSERT OR REPLACE INTO portfolio_pnl (date, pnl, cumulative) VALUES (@date, @pnl, @cumulative)
`);

function addDays(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const baseDate = "2026-01-05";
const dailyPnls = [
  0, 0, 4.2, 0, 8.5, -2.1, 0, 12.3, 0, 6.8,
  -4.5, 0, 9.1, 3.2, 0, -1.8, 14.6, 0, 7.3, 2.5,
  0, -6.2, 0, 11.4, 5.9, 0, -3.3, 8.7, 0, 16.2,
  0, 4.1, -2.8, 0, 9.5, 13.0, 0, -5.1, 7.8, 0,
  11.2, 0, 6.4, -1.5, 0, 18.3, 4.7, 0, -3.9, 8.1,
  0, 14.5, 2.3, 0, -7.2, 10.6, 0, 5.8, 19.1, 0,
  -2.4, 12.7, 0, 6.2, 3.5, 0, -4.8, 15.9, 0, 8.3,
  22.4, 0, -3.1, 11.8, 0, 7.6, 4.9, 0, -5.5, 13.4,
  0, 9.2, 25.1, 0, -2.7, 16.3, 0, 6.9, 5.2, 0,
];

let cumulative = 0;
const insertPnlTx = db.transaction(() => {
  for (let i = 0; i < dailyPnls.length; i++) {
    const d = addDays(baseDate, i);
    cumulative = parseFloat((cumulative + dailyPnls[i]).toFixed(2));
    insertPnl.run({ date: d, pnl: dailyPnls[i], cumulative });
  }
});
insertPnlTx();

const insertAutoTrade = db.prepare(`
  INSERT INTO auto_trade_history (timestamp, market_id, question, side, price, amount, edge, composite_score, order_id, success, error)
  VALUES (@timestamp, @market_id, @question, @side, @price, @amount, @edge, @composite_score, @order_id, @success, @error)
`);

const autoTrades = [
  { timestamp: "2026-03-01T08:30:00Z", market_id: "mkt-008", side: "YES", price: 0.57, amount: 57.0,  edge: 0.14, composite_score: 0.78, order_id: "auto-ord-001", success: 1, error: null },
  { timestamp: "2026-03-08T09:00:00Z", market_id: "mkt-009", side: "NO",  price: 0.35, amount: 35.0,  edge: 0.19, composite_score: 0.82, order_id: "auto-ord-002", success: 1, error: null },
  { timestamp: "2026-03-15T08:45:00Z", market_id: "mkt-010", side: "YES", price: 0.48, amount: 48.0,  edge: 0.11, composite_score: 0.71, order_id: "auto-ord-003", success: 1, error: null },
  { timestamp: "2026-03-22T09:15:00Z", market_id: "mkt-007", side: "YES", price: 0.44, amount: 44.0,  edge: 0.22, composite_score: 0.85, order_id: "auto-ord-004", success: 1, error: null },
  { timestamp: "2026-03-29T08:30:00Z", market_id: "mkt-011", side: "YES", price: 0.51, amount: 51.0,  edge: 0.17, composite_score: 0.79, order_id: null,           success: 0, error: "Insufficient liquidity at target price" },
  { timestamp: "2026-04-05T09:00:00Z", market_id: "mkt-012", side: "YES", price: 0.65, amount: 65.0,  edge: 0.13, composite_score: 0.74, order_id: "auto-ord-006", success: 1, error: null },
  { timestamp: "2026-04-08T08:30:00Z", market_id: "mkt-002", side: "YES", price: 0.79, amount: 79.0,  edge: 0.10, composite_score: 0.70, order_id: "auto-ord-007", success: 1, error: null },
  { timestamp: "2026-04-12T09:00:00Z", market_id: "mkt-004", side: "YES", price: 0.76, amount: 76.0,  edge: 0.16, composite_score: 0.81, order_id: "auto-ord-008", success: 1, error: null },
  { timestamp: "2026-04-17T08:45:00Z", market_id: "mkt-001", side: "YES", price: 0.84, amount: 84.0,  edge: 0.12, composite_score: 0.76, order_id: null,           success: 0, error: "Order rejected: price moved before submission" },
  { timestamp: "2026-04-22T09:15:00Z", market_id: "mkt-011", side: "YES", price: 0.63, amount: 63.0,  edge: 0.20, composite_score: 0.87, order_id: "auto-ord-010", success: 1, error: null },
  { timestamp: "2026-04-25T08:30:00Z", market_id: "mkt-008", side: "YES", price: 0.60, amount: 60.0,  edge: 0.15, composite_score: 0.80, order_id: "auto-ord-011", success: 1, error: null },
  { timestamp: "2026-04-28T09:00:00Z", market_id: "mkt-007", side: "YES", price: 0.56, amount: 56.0,  edge: 0.18, composite_score: 0.83, order_id: "auto-ord-012", success: 1, error: null },
];

const insertAutoTx = db.transaction(() => {
  for (const t of autoTrades) {
    const q = markets.find(m => m.id === t.market_id);
    insertAutoTrade.run({ ...t, question: q.question });
  }
});
insertAutoTx();

const counts = {
  orders: db.prepare("SELECT COUNT(*) as c FROM portfolio_orders").get().c,
  positions: db.prepare("SELECT COUNT(*) as c FROM portfolio_positions").get().c,
  pnl: db.prepare("SELECT COUNT(*) as c FROM portfolio_pnl").get().c,
  autoTrades: db.prepare("SELECT COUNT(*) as c FROM auto_trade_history").get().c,
};

console.log("Seed complete:", JSON.stringify(counts));
db.close();
