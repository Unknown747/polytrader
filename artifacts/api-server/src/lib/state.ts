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

const INITIAL_ORDERS: OrderEntry[] = [
  {
    id: "ord-001",
    marketId: "mkt-001",
    marketQuestion: "Will the Federal Reserve cut rates at the June 2026 FOMC meeting?",
    side: "YES",
    type: "BUY",
    price: 0.72,
    amount: 144.0,
    shares: 200,
    status: "filled",
    createdAt: new Date("2025-04-10T09:23:11Z"),
  },
  {
    id: "ord-002",
    marketId: "mkt-002",
    marketQuestion: "Will Bitcoin stay above $90,000 through June 2026?",
    side: "YES",
    type: "BUY",
    price: 0.81,
    amount: 202.5,
    shares: 250,
    status: "filled",
    createdAt: new Date("2025-04-15T14:05:32Z"),
  },
  {
    id: "ord-003",
    marketId: "mkt-005",
    marketQuestion: "Will Ethereum ETH price exceed $3,000 by end of May 2026?",
    side: "YES",
    type: "BUY",
    price: 0.75,
    amount: 150.0,
    shares: 200,
    status: "filled",
    createdAt: new Date("2025-04-20T11:48:00Z"),
  },
  {
    id: "ord-004",
    marketId: "mkt-006",
    marketQuestion: "Will US GDP growth remain positive in Q1 2026?",
    side: "YES",
    type: "BUY",
    price: 0.84,
    amount: 168.0,
    shares: 200,
    status: "filled",
    createdAt: new Date("2025-04-22T16:30:00Z"),
  },
  {
    id: "ord-005",
    marketId: "mkt-008",
    marketQuestion: "Will Solana (SOL) price exceed $200 by June 2026?",
    side: "YES",
    type: "BUY",
    price: 0.79,
    amount: 118.5,
    shares: 150,
    status: "filled",
    createdAt: new Date("2025-04-25T08:15:00Z"),
  },
  {
    id: "ord-006",
    marketId: "mkt-010",
    marketQuestion: "Will the S&P 500 close above 5,800 in May 2026?",
    side: "NO",
    type: "BUY",
    price: 0.24,
    amount: 48.0,
    shares: 200,
    status: "cancelled",
    createdAt: new Date("2025-04-28T10:00:00Z"),
  },
];

const INITIAL_POSITIONS: PositionEntry[] = [
  {
    id: "pos-001",
    marketId: "mkt-001",
    marketQuestion: "Will the Federal Reserve cut rates at the June 2026 FOMC meeting?",
    side: "YES",
    shares: 200,
    avgPrice: 0.72,
    currentPrice: 0.83,
    pnl: 22.0,
    pnlPercent: 15.28,
    value: 166.0,
  },
  {
    id: "pos-002",
    marketId: "mkt-002",
    marketQuestion: "Will Bitcoin stay above $90,000 through June 2026?",
    side: "YES",
    shares: 250,
    avgPrice: 0.81,
    currentPrice: 0.86,
    pnl: 12.5,
    pnlPercent: 6.17,
    value: 215.0,
  },
  {
    id: "pos-003",
    marketId: "mkt-005",
    marketQuestion: "Will Ethereum ETH price exceed $3,000 by end of May 2026?",
    side: "YES",
    shares: 200,
    avgPrice: 0.75,
    currentPrice: 0.82,
    pnl: 14.0,
    pnlPercent: 9.33,
    value: 164.0,
  },
  {
    id: "pos-004",
    marketId: "mkt-006",
    marketQuestion: "Will US GDP growth remain positive in Q1 2026?",
    side: "YES",
    shares: 200,
    avgPrice: 0.84,
    currentPrice: 0.88,
    pnl: 8.0,
    pnlPercent: 4.76,
    value: 176.0,
  },
  {
    id: "pos-005",
    marketId: "mkt-008",
    marketQuestion: "Will Solana (SOL) price exceed $200 by June 2026?",
    side: "YES",
    shares: 150,
    avgPrice: 0.79,
    currentPrice: 0.84,
    pnl: 7.5,
    pnlPercent: 6.33,
    value: 126.0,
  },
];

const INITIAL_PNL: PnlPoint[] = [
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

class PortfolioState {
  private orders: OrderEntry[] = [...INITIAL_ORDERS];
  private positions: PositionEntry[] = [...INITIAL_POSITIONS];
  private pnlHistory: PnlPoint[] = [...INITIAL_PNL];
  private orderCounter = 7;
  private readonly INITIAL_BANKROLL = 1000;

  getOrders(): OrderEntry[] {
    return [...this.orders].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getPositions(): PositionEntry[] {
    return [...this.positions];
  }

  getPnlHistory(): PnlPoint[] {
    return [...this.pnlHistory];
  }

  addOrder(entry: Omit<OrderEntry, "id" | "createdAt">): OrderEntry {
    const newOrder: OrderEntry = {
      ...entry,
      id: `ord-${String(this.orderCounter++).padStart(3, "0")}`,
      createdAt: new Date(),
    };
    this.orders = [newOrder, ...this.orders];
    if (newOrder.status === "filled") {
      this.upsertPosition(newOrder);
      this.appendPnlPoint(newOrder);
    }
    return newOrder;
  }

  cancelOrder(orderId: string): OrderEntry | null {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return null;
    const updated: OrderEntry = { ...order, status: "cancelled" };
    this.orders = this.orders.map((o) => (o.id === orderId ? updated : o));
    return updated;
  }

  private upsertPosition(order: OrderEntry): void {
    const key = `${order.marketId}-${order.side}`;
    const existing = this.positions.find(
      (p) => p.marketId === order.marketId && p.side === order.side
    );

    if (existing) {
      const totalShares = existing.shares + order.shares;
      const avgPrice =
        (existing.avgPrice * existing.shares + order.price * order.shares) / totalShares;
      const currentPrice = order.price;
      const value = Math.round(totalShares * currentPrice * 100) / 100;
      const cost = Math.round(totalShares * avgPrice * 100) / 100;
      const pnl = Math.round((value - cost) * 100) / 100;
      const pnlPercent = Math.round((pnl / cost) * 10000) / 100;

      this.positions = this.positions.map((p) =>
        p.marketId === order.marketId && p.side === order.side
          ? { ...p, shares: totalShares, avgPrice: Math.round(avgPrice * 1000) / 1000, currentPrice, value, pnl, pnlPercent }
          : p
      );
    } else {
      const shares = order.shares;
      const avgPrice = order.price;
      const currentPrice = order.price;
      const value = Math.round(shares * currentPrice * 100) / 100;
      const cost = Math.round(shares * avgPrice * 100) / 100;

      this.positions.push({
        id: `pos-${String(this.positions.length + 1).padStart(3, "0")}`,
        marketId: order.marketId,
        marketQuestion: order.marketQuestion,
        side: order.side,
        shares,
        avgPrice,
        currentPrice,
        pnl: 0,
        pnlPercent: 0,
        value: cost,
      });
    }

    void key;
  }

  private appendPnlPoint(order: OrderEntry): void {
    const today = new Date().toISOString().slice(0, 10);
    const lastCumulative = this.pnlHistory.length > 0
      ? this.pnlHistory[this.pnlHistory.length - 1].cumulative
      : 0;

    const pnlToday = 0;
    const existing = this.pnlHistory.find((p) => p.date === today);
    if (existing) {
      this.pnlHistory = this.pnlHistory.map((p) =>
        p.date === today ? { ...p, pnl: p.pnl + pnlToday } : p
      );
    } else {
      this.pnlHistory.push({ date: today, pnl: pnlToday, cumulative: lastCumulative });
    }
    void order;
  }

  getSummary() {
    const openPositions = this.positions.length;
    const investedAmount = this.positions.reduce((s, p) => s + p.shares * p.avgPrice, 0);
    const currentValue = this.positions.reduce((s, p) => s + p.value, 0);
    const totalPnl = this.positions.reduce((s, p) => s + p.pnl, 0);
    const filledOrders = this.orders.filter((o) => o.status === "filled");
    const winningOrders = filledOrders.filter((o) => {
      const pos = this.positions.find((p) => p.marketId === o.marketId && p.side === o.side);
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
