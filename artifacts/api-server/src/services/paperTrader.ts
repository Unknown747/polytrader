import { logger } from "../lib/db";
import db from "../lib/db";
import type { Opportunity, StrategyConfig } from "./strategy";
import { notifyPaperTrade } from "./telegram";

export interface PaperTrade {
  id: number;
  timestamp: string;
  marketId: string;
  question: string;
  category: string;
  side: "YES" | "NO";
  entryPrice: number;
  amount: number;
  shares: number;
  edge: number;
  compositeScore: number;
  status: "open" | "closed" | "won" | "lost";
  exitPrice: number | null;
  pnl: number | null;
  pnlPct: number | null;
  closedAt: string | null;
}

interface DbPaperTrade {
  id: number;
  timestamp: string;
  market_id: string;
  question: string;
  category: string;
  side: "YES" | "NO";
  entry_price: number;
  amount: number;
  shares: number;
  edge: number;
  composite_score: number;
  status: string;
  exit_price: number | null;
  pnl: number | null;
  pnl_pct: number | null;
  closed_at: string | null;
}

export interface PaperPortfolio {
  balance: number;
  initialBalance: number;
  totalTrades: number;
  openTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnl: number;
  totalPnlPct: number;
  winRate: number;
  openPositionValue: number;
  trades: PaperTrade[];
}

const PAPER_BALANCE_KEY = "paper_balance";
const PAPER_INITIAL_KEY = "paper_initial_balance";

function getPaperBalance(config: StrategyConfig): number {
  const row = db.prepare("SELECT value FROM paper_portfolio WHERE key = ?").get(PAPER_BALANCE_KEY) as { value: string } | undefined;
  return row ? parseFloat(row.value) : config.paperBankroll;
}

function setPaperBalance(balance: number): void {
  db.prepare("INSERT OR REPLACE INTO paper_portfolio (key, value) VALUES (?, ?)").run(PAPER_BALANCE_KEY, String(balance));
}

function getInitialBalance(config: StrategyConfig): number {
  const row = db.prepare("SELECT value FROM paper_portfolio WHERE key = ?").get(PAPER_INITIAL_KEY) as { value: string } | undefined;
  if (!row) {
    db.prepare("INSERT OR REPLACE INTO paper_portfolio (key, value) VALUES (?, ?)").run(PAPER_INITIAL_KEY, String(config.paperBankroll));
    return config.paperBankroll;
  }
  return parseFloat(row.value);
}

function rowToTrade(row: DbPaperTrade): PaperTrade {
  return {
    id: row.id,
    timestamp: row.timestamp,
    marketId: row.market_id,
    question: row.question,
    category: row.category,
    side: row.side,
    entryPrice: row.entry_price,
    amount: row.amount,
    shares: row.shares,
    edge: row.edge,
    compositeScore: row.composite_score,
    status: row.status as PaperTrade["status"],
    exitPrice: row.exit_price,
    pnl: row.pnl,
    pnlPct: row.pnl_pct,
    closedAt: row.closed_at,
  };
}

export async function executePaperOpportunities(
  opportunities: Opportunity[],
  config: StrategyConfig
): Promise<PaperTrade[]> {
  if (!config.paperTradingMode) return [];

  let balance = getPaperBalance(config);
  if (balance < 1) {
    logger.warn({ balance }, "Paper trading: balance too low, skipping");
    return [];
  }

  const alreadyOpenToday = (marketId: string, side: "YES" | "NO"): boolean => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const row = db.prepare(
      "SELECT COUNT(*) as c FROM paper_trades WHERE market_id = ? AND side = ? AND timestamp >= ? AND status = 'open'"
    ).get(marketId, side, start.toISOString()) as { c: number };
    return row.c > 0;
  };

  const eligible = opportunities
    .filter((op) => op.edge >= config.minEdge && op.compositeScore >= 0.4 && !alreadyOpenToday(op.marketId, op.recommendedSide))
    .slice(0, config.maxDailyTrades);

  const placed: PaperTrade[] = [];

  for (const op of eligible) {
    const maxAmount = (balance * config.maxPositionPct) / 100;
    const kellyAmount = config.paperBankroll * op.kellyFraction;
    let amount = Math.min(kellyAmount, maxAmount, balance * 0.2);
    amount = Math.round(amount * 100) / 100;

    if (amount < 1) continue;

    const shares = Math.round((amount / op.currentPrice) * 1000) / 1000;
    balance = Math.round((balance - amount) * 100) / 100;
    setPaperBalance(balance);

    const now = new Date().toISOString();
    const result = db.prepare(
      `INSERT INTO paper_trades (timestamp, market_id, question, category, side, entry_price, amount, shares, edge, composite_score, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`
    ).run(now, op.marketId, op.question, op.category, op.recommendedSide, op.currentPrice, amount, shares, op.edge, op.compositeScore);

    const id = result.lastInsertRowid as number;
    const trade: PaperTrade = {
      id, timestamp: now, marketId: op.marketId, question: op.question, category: op.category,
      side: op.recommendedSide, entryPrice: op.currentPrice, amount, shares, edge: op.edge,
      compositeScore: op.compositeScore, status: "open", exitPrice: null, pnl: null, pnlPct: null, closedAt: null,
    };

    placed.push(trade);

    logger.info({ question: op.question, side: op.recommendedSide, amount, paperBalance: balance }, "Paper trade placed");

    if (config.telegramAlertsEnabled) {
      await notifyPaperTrade({
        question: op.question,
        side: op.recommendedSide,
        price: op.currentPrice,
        amount,
        edge: op.edge,
        paperBalance: balance,
      });
    }

    await new Promise((r) => setTimeout(r, 100));
  }

  return placed;
}

export function resolvePaperTradesNearResolution(priceMap: Map<string, number>): void {
  const openTrades = db.prepare(
    "SELECT * FROM paper_trades WHERE status = 'open'"
  ).all() as DbPaperTrade[];

  for (const row of openTrades) {
    const yesPrice = priceMap.get(row.market_id);
    if (yesPrice === undefined) continue;

    const currentPrice = row.side === "YES" ? yesPrice : 1 - yesPrice;
    const isWon = currentPrice >= 0.97;
    const isLost = currentPrice <= 0.03;

    if (!isWon && !isLost) continue;

    const exitPrice = isWon ? 1.0 : 0.0;
    const pnl = Math.round((row.shares * exitPrice - row.amount) * 100) / 100;
    const pnlPct = Math.round((pnl / row.amount) * 10000) / 100;
    const status = isWon ? "won" : "lost";
    const now = new Date().toISOString();

    db.prepare(
      "UPDATE paper_trades SET status = ?, exit_price = ?, pnl = ?, pnl_pct = ?, closed_at = ? WHERE id = ?"
    ).run(status, exitPrice, pnl, pnlPct, now, row.id);

    const balance = getPaperBalance({ paperBankroll: 1000 } as StrategyConfig);
    const newBalance = Math.round((balance + row.amount + pnl) * 100) / 100;
    setPaperBalance(newBalance);

    logger.info({ id: row.id, question: row.question, side: row.side, pnl, status }, "Paper trade resolved");
  }
}

export function getPaperPortfolio(config: StrategyConfig): PaperPortfolio {
  const balance = getPaperBalance(config);
  const initialBalance = getInitialBalance(config);

  const trades = (db.prepare("SELECT * FROM paper_trades ORDER BY timestamp DESC LIMIT 100").all() as DbPaperTrade[]).map(rowToTrade);

  const closed = trades.filter((t) => t.status === "won" || t.status === "lost");
  const open = trades.filter((t) => t.status === "open");
  const winning = closed.filter((t) => t.status === "won");

  const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const openPositionValue = open.reduce((s, t) => s + t.amount, 0);
  const totalPnlPct = initialBalance > 0 ? (totalPnl / initialBalance) * 100 : 0;

  return {
    balance,
    initialBalance,
    totalTrades: closed.length,
    openTrades: open.length,
    winningTrades: winning.length,
    losingTrades: closed.length - winning.length,
    totalPnl: Math.round(totalPnl * 100) / 100,
    totalPnlPct: Math.round(totalPnlPct * 100) / 100,
    winRate: closed.length > 0 ? Math.round((winning.length / closed.length) * 1000) / 10 : 0,
    openPositionValue: Math.round(openPositionValue * 100) / 100,
    trades,
  };
}

export function resetPaperPortfolio(config: StrategyConfig): void {
  db.prepare("DELETE FROM paper_trades").run();
  db.prepare("DELETE FROM paper_portfolio").run();
  db.prepare("INSERT OR REPLACE INTO paper_portfolio (key, value) VALUES (?, ?)").run(PAPER_BALANCE_KEY, String(config.paperBankroll));
  db.prepare("INSERT OR REPLACE INTO paper_portfolio (key, value) VALUES (?, ?)").run(PAPER_INITIAL_KEY, String(config.paperBankroll));
  logger.info({ initialBalance: config.paperBankroll }, "Paper portfolio reset");
}

export function getPerformanceAnalytics(): {
  byCategory: Array<{ category: string; trades: number; winRate: number; totalPnl: number; avgEdge: number }>;
  bestTrades: PaperTrade[];
  worstTrades: PaperTrade[];
  totalTrades: number;
  overallWinRate: number;
  totalPnl: number;
  avgEdge: number;
} {
  const all = (db.prepare(
    "SELECT * FROM paper_trades WHERE status IN ('won','lost') ORDER BY timestamp DESC LIMIT 500"
  ).all() as DbPaperTrade[]).map(rowToTrade);

  const byCategory: Record<string, { wins: number; total: number; pnl: number; edgeSum: number }> = {};

  for (const t of all) {
    if (!byCategory[t.category]) {
      byCategory[t.category] = { wins: 0, total: 0, pnl: 0, edgeSum: 0 };
    }
    byCategory[t.category].total++;
    byCategory[t.category].pnl += t.pnl ?? 0;
    byCategory[t.category].edgeSum += t.edge;
    if (t.status === "won") byCategory[t.category].wins++;
  }

  const categorySummary = Object.entries(byCategory).map(([category, d]) => ({
    category,
    trades: d.total,
    winRate: d.total > 0 ? Math.round((d.wins / d.total) * 1000) / 10 : 0,
    totalPnl: Math.round(d.pnl * 100) / 100,
    avgEdge: d.total > 0 ? Math.round((d.edgeSum / d.total) * 10000) / 100 : 0,
  })).sort((a, b) => b.totalPnl - a.totalPnl);

  const sorted = [...all].sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0));
  const bestTrades = sorted.slice(0, 5);
  const worstTrades = sorted.slice(-5).reverse();

  const winning = all.filter((t) => t.status === "won");
  const totalPnl = all.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const avgEdge = all.length > 0 ? all.reduce((s, t) => s + t.edge, 0) / all.length : 0;

  return {
    byCategory: categorySummary,
    bestTrades,
    worstTrades,
    totalTrades: all.length,
    overallWinRate: all.length > 0 ? Math.round((winning.length / all.length) * 1000) / 10 : 0,
    totalPnl: Math.round(totalPnl * 100) / 100,
    avgEdge: Math.round(avgEdge * 10000) / 100,
  };
}
