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
  effectiveEntryPrice: number;
  amount: number;
  shares: number;
  edge: number;
  compositeScore: number;
  slippagePct: number;
  feePct: number;
  status: "open" | "pending" | "closed" | "won" | "lost";
  exitPrice: number | null;
  effectiveExitPrice: number | null;
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
  effective_entry_price: number;
  amount: number;
  shares: number;
  edge: number;
  composite_score: number;
  slippage_pct: number;
  fee_pct: number;
  status: string;
  exit_price: number | null;
  effective_exit_price: number | null;
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
    effectiveEntryPrice: row.effective_entry_price ?? row.entry_price,
    amount: row.amount,
    shares: row.shares,
    edge: row.edge,
    compositeScore: row.composite_score,
    slippagePct: row.slippage_pct ?? 0,
    feePct: row.fee_pct ?? 0,
    status: row.status as PaperTrade["status"],
    exitPrice: row.exit_price,
    effectiveExitPrice: row.effective_exit_price,
    pnl: row.pnl,
    pnlPct: row.pnl_pct,
    closedAt: row.closed_at,
  };
}

function ensureColumns(): void {
  const cols = (db.pragma("table_info(paper_trades)") as Array<{ name: string }>).map((c) => c.name);
  if (!cols.includes("effective_entry_price")) {
    db.exec("ALTER TABLE paper_trades ADD COLUMN effective_entry_price REAL");
    db.exec("UPDATE paper_trades SET effective_entry_price = entry_price WHERE effective_entry_price IS NULL");
  }
  if (!cols.includes("effective_exit_price")) {
    db.exec("ALTER TABLE paper_trades ADD COLUMN effective_exit_price REAL");
  }
  if (!cols.includes("slippage_pct")) {
    db.exec("ALTER TABLE paper_trades ADD COLUMN slippage_pct REAL NOT NULL DEFAULT 0");
  }
  if (!cols.includes("fee_pct")) {
    db.exec("ALTER TABLE paper_trades ADD COLUMN fee_pct REAL NOT NULL DEFAULT 0");
  }
}

ensureColumns();

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

  const slippagePct = config.paperSlippagePct ?? 0.75;
  const takerFeePct = config.paperTakerFeePct ?? 1.0;

  const alreadyOpenToday = (marketId: string, side: "YES" | "NO"): boolean => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const row = db.prepare(
      "SELECT COUNT(*) as c FROM paper_trades WHERE market_id = ? AND side = ? AND timestamp >= ? AND status IN ('open','pending')"
    ).get(marketId, side, start.toISOString()) as { c: number };
    return row.c > 0;
  };

  const eligible = opportunities
    .filter((op) => {
      if (op.edge < config.minEdge) return false;
      if (op.compositeScore < 0.4) return false;
      if (alreadyOpenToday(op.marketId, op.recommendedSide)) return false;
      if (op.volume24h !== undefined && op.volume24h < 500) return false;
      if (op.liquidity < 1000) return false;
      return true;
    })
    .slice(0, config.maxDailyTrades);

  const placed: PaperTrade[] = [];

  for (const op of eligible) {
    const maxAmount = (balance * config.maxPositionPct) / 100;
    const kellyAmount = config.paperBankroll * op.kellyFraction;
    let amount = Math.min(kellyAmount, maxAmount, balance * 0.2);
    amount = Math.round(amount * 100) / 100;

    if (amount < 1) continue;

    // Slippage: buy at ask (price + slippage), sell at bid (price - slippage)
    const slippageFactor = slippagePct / 100;
    const effectiveEntryPrice = op.recommendedSide === "YES"
      ? Math.min(0.99, op.currentPrice * (1 + slippageFactor))
      : Math.max(0.01, op.currentPrice * (1 - slippageFactor));

    // Fee: deducted from amount invested
    const feeCost = Math.round(amount * (takerFeePct / 100) * 100) / 100;
    const amountAfterFee = Math.round((amount - feeCost) * 100) / 100;

    const shares = Math.round((amountAfterFee / effectiveEntryPrice) * 1000) / 1000;
    balance = Math.round((balance - amount) * 100) / 100;
    setPaperBalance(balance);

    const now = new Date().toISOString();
    const result = db.prepare(
      `INSERT INTO paper_trades
       (timestamp, market_id, question, category, side, entry_price, effective_entry_price, amount, shares, edge, composite_score, slippage_pct, fee_pct, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`
    ).run(now, op.marketId, op.question, op.category, op.recommendedSide, op.currentPrice, effectiveEntryPrice, amount, shares, op.edge, op.compositeScore, slippagePct, takerFeePct);

    const id = result.lastInsertRowid as number;
    const trade: PaperTrade = {
      id, timestamp: now, marketId: op.marketId, question: op.question, category: op.category,
      side: op.recommendedSide, entryPrice: op.currentPrice, effectiveEntryPrice,
      amount, shares, edge: op.edge, compositeScore: op.compositeScore,
      slippagePct, feePct: takerFeePct,
      status: "open", exitPrice: null, effectiveExitPrice: null, pnl: null, pnlPct: null, closedAt: null,
    };

    placed.push(trade);

    logger.info(
      { question: op.question, side: op.recommendedSide, amount, effectiveEntryPrice, feeCost, paperBalance: balance },
      "Paper trade placed (with slippage + fee)"
    );

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

export function resolvePaperTradesNearResolution(priceMap: Map<string, number>, config?: StrategyConfig): void {
  const openTrades = db.prepare(
    "SELECT * FROM paper_trades WHERE status IN ('open', 'pending')"
  ).all() as DbPaperTrade[];

  const slippagePct = config?.paperSlippagePct ?? 0.75;
  const takerFeePct = config?.paperTakerFeePct ?? 1.0;

  for (const row of openTrades) {
    const yesPrice = priceMap.get(row.market_id);
    if (yesPrice === undefined) continue;

    const currentPrice = row.side === "YES" ? yesPrice : 1 - yesPrice;
    const isWon = currentPrice >= 0.97;
    const isLost = currentPrice <= 0.03;

    if (!isWon && !isLost) continue;

    // Effective exit price with slippage (selling at bid)
    const rawExitPrice = isWon ? 1.0 : 0.0;
    const slippageFactor = (row.slippage_pct ?? slippagePct) / 100;
    const effectiveExitPrice = isWon
      ? Math.max(0, rawExitPrice * (1 - slippageFactor))
      : rawExitPrice;

    // Proceeds = shares * effectiveExitPrice
    const grossProceeds = row.shares * effectiveExitPrice;
    const exitFee = grossProceeds * ((row.fee_pct ?? takerFeePct) / 100);
    const netProceeds = grossProceeds - exitFee;

    const pnl = Math.round((netProceeds - row.amount) * 100) / 100;
    const pnlPct = Math.round((pnl / row.amount) * 10000) / 100;
    const status = isWon ? "won" : "lost";
    const now = new Date().toISOString();

    db.prepare(
      "UPDATE paper_trades SET status = ?, exit_price = ?, effective_exit_price = ?, pnl = ?, pnl_pct = ?, closed_at = ? WHERE id = ?"
    ).run(status, rawExitPrice, effectiveExitPrice, pnl, pnlPct, now, row.id);

    const balance = getPaperBalance({ paperBankroll: 1000 } as StrategyConfig);
    const newBalance = Math.round((balance + row.amount + pnl) * 100) / 100;
    setPaperBalance(newBalance);

    logger.info(
      { id: row.id, question: row.question, side: row.side, pnl, effectiveExitPrice, status },
      "Paper trade resolved (with slippage + fee)"
    );
  }
}

export function getPaperPortfolio(config: StrategyConfig): PaperPortfolio {
  const balance = getPaperBalance(config);
  const initialBalance = getInitialBalance(config);

  const trades = (db.prepare("SELECT * FROM paper_trades ORDER BY timestamp DESC LIMIT 100").all() as DbPaperTrade[]).map(rowToTrade);

  const closed = trades.filter((t) => t.status === "won" || t.status === "lost");
  const open = trades.filter((t) => t.status === "open" || t.status === "pending");
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
  totalFeesPaid: number;
  totalSlippageCost: number;
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

  // Fee and slippage costs
  const totalFeesPaid = all.reduce((s, t) => s + t.amount * (t.feePct / 100), 0);
  const totalSlippageCost = all.reduce((s, t) => {
    const slipCost = t.amount * (t.slippagePct / 100);
    return s + slipCost;
  }, 0);

  return {
    byCategory: categorySummary,
    bestTrades,
    worstTrades,
    totalTrades: all.length,
    overallWinRate: all.length > 0 ? Math.round((winning.length / all.length) * 1000) / 10 : 0,
    totalPnl: Math.round(totalPnl * 100) / 100,
    avgEdge: Math.round(avgEdge * 10000) / 100,
    totalFeesPaid: Math.round(totalFeesPaid * 100) / 100,
    totalSlippageCost: Math.round(totalSlippageCost * 100) / 100,
  };
}

export function getEquityCurve(): Array<{
  timestamp: string;
  balance: number;
  totalValue: number;
  drawdownPct: number;
  isAth: boolean;
}> {
  interface SnapshotRow {
    timestamp: string;
    balance: number;
    total_value: number;
    drawdown_pct: number;
    is_ath: number;
  }
  const rows = db.prepare(
    "SELECT timestamp, balance, total_value, drawdown_pct, is_ath FROM equity_snapshots ORDER BY timestamp ASC LIMIT 500"
  ).all() as SnapshotRow[];

  return rows.map((r) => ({
    timestamp: r.timestamp,
    balance: r.balance,
    totalValue: r.total_value,
    drawdownPct: r.drawdown_pct,
    isAth: r.is_ath === 1,
  }));
}
