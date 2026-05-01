import db from "./db";

export type OrderStatus = "open" | "filled" | "cancelled" | "partial";

export interface OrderEntry {
  id: string;
  marketId: string;
  marketQuestion: string;
  side: "YES" | "NO";
  type: "BUY" | "SELL";
  price: number;
  amount: number;
  shares: number;
  status: OrderStatus;
  createdAt: Date;
}

export interface PositionEntry {
  id: string;
  marketId: string;
  marketQuestion: string;
  side: "YES" | "NO";
  shares: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  value: number;
}

export interface PnlPoint {
  date: string;
  pnl: number;
  cumulative: number;
}

const SEED_ORDERS: Omit<OrderEntry, "createdAt"> & { createdAt: string }[] = [
  { id: "ord-001", marketId: "mkt-001", marketQuestion: "Will the Federal Reserve cut rates at the June 2026 FOMC meeting?", side: "YES", type: "BUY", price: 0.72, amount: 144.0, shares: 200, status: "filled", createdAt: "2025-04-10T09:23:11Z" },
  { id: "ord-002", marketId: "mkt-002", marketQuestion: "Will Bitcoin stay above $90,000 through June 2026?", side: "YES", type: "BUY", price: 0.81, amount: 202.5, shares: 250, status: "filled", createdAt: "2025-04-15T14:05:32Z" },
  { id: "ord-003", marketId: "mkt-005", marketQuestion: "Will Ethereum ETH price exceed $3,000 by end of May 2026?", side: "YES", type: "BUY", price: 0.75, amount: 150.0, shares: 200, status: "filled", createdAt: "2025-04-20T11:48:00Z" },
  { id: "ord-004", marketId: "mkt-006", marketQuestion: "Will US GDP growth remain positive in Q1 2026?", side: "YES", type: "BUY", price: 0.84, amount: 168.0, shares: 200, status: "filled", createdAt: "2025-04-22T16:30:00Z" },
  { id: "ord-005", marketId: "mkt-008", marketQuestion: "Will Solana (SOL) price exceed $200 by June 2026?", side: "YES", type: "BUY", price: 0.79, amount: 118.5, shares: 150, status: "filled", createdAt: "2025-04-25T08:15:00Z" },
  { id: "ord-006", marketId: "mkt-010", marketQuestion: "Will the S&P 500 close above 5,800 in May 2026?", side: "NO", type: "BUY", price: 0.24, amount: 48.0, shares: 200, status: "cancelled", createdAt: "2025-04-28T10:00:00Z" },
];

const SEED_POSITIONS: PositionEntry[] = [
  { id: "pos-001", marketId: "mkt-001", marketQuestion: "Will the Federal Reserve cut rates at the June 2026 FOMC meeting?", side: "YES", shares: 200, avgPrice: 0.72, currentPrice: 0.83, pnl: 22.0, pnlPercent: 15.28, value: 166.0 },
  { id: "pos-002", marketId: "mkt-002", marketQuestion: "Will Bitcoin stay above $90,000 through June 2026?", side: "YES", shares: 250, avgPrice: 0.81, currentPrice: 0.86, pnl: 12.5, pnlPercent: 6.17, value: 215.0 },
  { id: "pos-003", marketId: "mkt-005", marketQuestion: "Will Ethereum ETH price exceed $3,000 by end of May 2026?", side: "YES", shares: 200, avgPrice: 0.75, currentPrice: 0.82, pnl: 14.0, pnlPercent: 9.33, value: 164.0 },
  { id: "pos-004", marketId: "mkt-006", marketQuestion: "Will US GDP growth remain positive in Q1 2026?", side: "YES", shares: 200, avgPrice: 0.84, currentPrice: 0.88, pnl: 8.0, pnlPercent: 4.76, value: 176.0 },
  { id: "pos-005", marketId: "mkt-008", marketQuestion: "Will Solana (SOL) price exceed $200 by June 2026?", side: "YES", shares: 150, avgPrice: 0.79, currentPrice: 0.84, pnl: 7.5, pnlPercent: 6.33, value: 126.0 },
];

const SEED_PNL: PnlPoint[] = [
  { date: "2025-04-01", pnl: 0, cumulative: 0 },
  { date: "2025-04-05", pnl: 6.2, cumulative: 6.2 },
  { date: "2025-04-10", pnl: 14.0, cumulative: 20.2 },
  { date: "2025-04-12", pnl: -3.5, cumulative: 16.7 },
  { date: "2025-04-15", pnl: 9.5, cumulative: 26.2 },
  { date: "2025-04-17", pnl: 7.1, cumulative: 33.3 },
  { date: "2025-04-20", pnl: 12.5, cumulative: 45.8 },
  { date: "2025-04-22", pnl: -4.2, cumulative: 41.6 },
  { date: "2025-04-24", pnl: 5.8, cumulative: 47.4 },
  { date: "2025-04-25", pnl: 8.0, cumulative: 55.4 },
  { date: "2025-04-28", pnl: -2.4, cumulative: 53.0 },
  { date: "2025-04-30", pnl: 11.0, cumulative: 64.0 },
];

function seedIfEmpty(): void {
  const count = (db.prepare("SELECT COUNT(*) as c FROM portfolio_orders").get() as { c: number }).c;
  if (count > 0) return;

  const insertOrder = db.prepare(
    `INSERT OR IGNORE INTO portfolio_orders (id, market_id, market_question, side, type, price, amount, shares, status, created_at)
     VALUES (@id, @marketId, @marketQuestion, @side, @type, @price, @amount, @shares, @status, @createdAt)`
  );
  const insertPosition = db.prepare(
    `INSERT OR IGNORE INTO portfolio_positions (id, market_id, market_question, side, shares, avg_price, current_price, pnl, pnl_percent, value)
     VALUES (@id, @marketId, @marketQuestion, @side, @shares, @avgPrice, @currentPrice, @pnl, @pnlPercent, @value)`
  );
  const insertPnl = db.prepare(
    `INSERT OR IGNORE INTO portfolio_pnl (date, pnl, cumulative) VALUES (@date, @pnl, @cumulative)`
  );

  db.transaction(() => {
    for (const o of SEED_ORDERS) insertOrder.run(o);
    for (const p of SEED_POSITIONS) insertPosition.run(p);
    for (const pt of SEED_PNL) insertPnl.run(pt);
  })();
}

seedIfEmpty();

interface DbOrder {
  id: string;
  market_id: string;
  market_question: string;
  side: "YES" | "NO";
  type: "BUY" | "SELL";
  price: number;
  amount: number;
  shares: number;
  status: OrderStatus;
  created_at: string;
}

interface DbPosition {
  id: string;
  market_id: string;
  market_question: string;
  side: "YES" | "NO";
  shares: number;
  avg_price: number;
  current_price: number;
  pnl: number;
  pnl_percent: number;
  value: number;
}

function rowToOrder(row: DbOrder): OrderEntry {
  return {
    id: row.id,
    marketId: row.market_id,
    marketQuestion: row.market_question,
    side: row.side,
    type: row.type,
    price: row.price,
    amount: row.amount,
    shares: row.shares,
    status: row.status,
    createdAt: new Date(row.created_at),
  };
}

function rowToPosition(row: DbPosition): PositionEntry {
  return {
    id: row.id,
    marketId: row.market_id,
    marketQuestion: row.market_question,
    side: row.side,
    shares: row.shares,
    avgPrice: row.avg_price,
    currentPrice: row.current_price,
    pnl: row.pnl,
    pnlPercent: row.pnl_percent,
    value: row.value,
  };
}

class PortfolioState {
  private readonly INITIAL_BANKROLL = 1000;

  private nextOrderId(): string {
    const row = db.prepare(
      "SELECT id FROM portfolio_orders ORDER BY id DESC LIMIT 1"
    ).get() as { id: string } | undefined;

    if (!row) return "ord-007";
    const match = row.id.match(/ord-(\d+)/);
    const n = match ? parseInt(match[1], 10) + 1 : 7;
    return `ord-${String(n).padStart(3, "0")}`;
  }

  private nextPositionId(): string {
    const row = db.prepare(
      "SELECT id FROM portfolio_positions ORDER BY id DESC LIMIT 1"
    ).get() as { id: string } | undefined;

    if (!row) return "pos-001";
    const match = row.id.match(/pos-(\d+)/);
    const n = match ? parseInt(match[1], 10) + 1 : 1;
    return `pos-${String(n).padStart(3, "0")}`;
  }

  getOrders(): OrderEntry[] {
    const rows = db.prepare(
      "SELECT * FROM portfolio_orders ORDER BY created_at DESC"
    ).all() as DbOrder[];
    return rows.map(rowToOrder);
  }

  getPositions(): PositionEntry[] {
    const rows = db.prepare("SELECT * FROM portfolio_positions").all() as DbPosition[];
    return rows.map(rowToPosition);
  }

  getPnlHistory(): PnlPoint[] {
    const rows = db.prepare("SELECT * FROM portfolio_pnl ORDER BY date ASC").all() as PnlPoint[];
    return rows;
  }

  addOrder(entry: Omit<OrderEntry, "id" | "createdAt">): OrderEntry {
    const newOrder: OrderEntry = {
      ...entry,
      id: this.nextOrderId(),
      createdAt: new Date(),
    };

    db.prepare(
      `INSERT INTO portfolio_orders (id, market_id, market_question, side, type, price, amount, shares, status, created_at)
       VALUES (@id, @marketId, @marketQuestion, @side, @type, @price, @amount, @shares, @status, @createdAt)`
    ).run({
      id: newOrder.id,
      marketId: newOrder.marketId,
      marketQuestion: newOrder.marketQuestion,
      side: newOrder.side,
      type: newOrder.type,
      price: newOrder.price,
      amount: newOrder.amount,
      shares: newOrder.shares,
      status: newOrder.status,
      createdAt: newOrder.createdAt.toISOString(),
    });

    if (newOrder.status === "filled") {
      this.upsertPosition(newOrder);
      this.appendPnlPoint();
    }

    return newOrder;
  }

  cancelOrder(orderId: string): OrderEntry | null {
    const row = db.prepare("SELECT * FROM portfolio_orders WHERE id = ?").get(orderId) as DbOrder | undefined;
    if (!row) return null;

    db.prepare("UPDATE portfolio_orders SET status = 'cancelled' WHERE id = ?").run(orderId);
    return rowToOrder({ ...row, status: "cancelled" });
  }

  private upsertPosition(order: OrderEntry): void {
    const existing = db.prepare(
      "SELECT * FROM portfolio_positions WHERE market_id = ? AND side = ?"
    ).get(order.marketId, order.side) as DbPosition | undefined;

    if (existing) {
      const totalShares = existing.shares + order.shares;
      const avgPrice = (existing.avg_price * existing.shares + order.price * order.shares) / totalShares;
      const currentPrice = order.price;
      const value = Math.round(totalShares * currentPrice * 100) / 100;
      const cost = Math.round(totalShares * avgPrice * 100) / 100;
      const pnl = Math.round((value - cost) * 100) / 100;
      const pnlPercent = Math.round((pnl / cost) * 10000) / 100;

      db.prepare(
        `UPDATE portfolio_positions SET shares=?, avg_price=?, current_price=?, pnl=?, pnl_percent=?, value=?
         WHERE market_id=? AND side=?`
      ).run(totalShares, Math.round(avgPrice * 1000) / 1000, currentPrice, pnl, pnlPercent, value, order.marketId, order.side);
    } else {
      const shares = order.shares;
      const cost = Math.round(shares * order.price * 100) / 100;
      db.prepare(
        `INSERT INTO portfolio_positions (id, market_id, market_question, side, shares, avg_price, current_price, pnl, pnl_percent, value)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(this.nextPositionId(), order.marketId, order.marketQuestion, order.side, shares, order.price, order.price, 0, 0, cost);
    }
  }

  private appendPnlPoint(): void {
    const today = new Date().toISOString().slice(0, 10);
    const existing = db.prepare("SELECT date FROM portfolio_pnl WHERE date = ?").get(today);
    if (!existing) {
      const lastRow = db.prepare("SELECT cumulative FROM portfolio_pnl ORDER BY date DESC LIMIT 1").get() as { cumulative: number } | undefined;
      const lastCumulative = lastRow?.cumulative ?? 0;
      db.prepare("INSERT INTO portfolio_pnl (date, pnl, cumulative) VALUES (?, 0, ?)").run(today, lastCumulative);
    }
  }

  getSummary() {
    const positions = this.getPositions();
    const orders = this.getOrders();

    const openPositions = positions.length;
    const investedAmount = positions.reduce((s, p) => s + p.shares * p.avgPrice, 0);
    const currentValue = positions.reduce((s, p) => s + p.value, 0);
    const totalPnl = positions.reduce((s, p) => s + p.pnl, 0);

    const filledOrders = orders.filter((o) => o.status === "filled");
    const winningOrders = filledOrders.filter((o) => {
      const pos = positions.find((p) => p.marketId === o.marketId && p.side === o.side);
      return pos && pos.pnl > 0;
    });
    const winRate = filledOrders.length > 0
      ? Math.round((winningOrders.length / filledOrders.length) * 1000) / 10
      : 0;

    const availableBalance = Math.max(0, Math.round((this.INITIAL_BANKROLL - investedAmount) * 100) / 100);
    const totalValue = Math.round((availableBalance + currentValue) * 100) / 100;
    const totalPnlPct = investedAmount > 0
      ? Math.round((totalPnl / investedAmount) * 10000) / 100
      : 0;

    return {
      totalValue,
      availableBalance,
      investedAmount: Math.round(investedAmount * 100) / 100,
      totalPnl: Math.round(totalPnl * 100) / 100,
      totalPnlPercent: totalPnlPct,
      openPositions,
      totalTrades: filledOrders.length,
      winRate,
    };
  }
}

export const portfolioState = new PortfolioState();
