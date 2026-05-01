import { logger } from "../lib/logger";
import type { Opportunity, StrategyConfig } from "./strategy";
import { placeOrder, isClobConfigured, getUsdcBalance } from "./clob";
import { portfolioState } from "../lib/state";
import { notifyOrderFilled, notifyDailyReport } from "./telegram";
import db from "../lib/db";

export interface TradeRecord {
  id?: number;
  timestamp: Date;
  marketId: string;
  question: string;
  side: "YES" | "NO";
  price: number;
  amount: number;
  edge: number;
  compositeScore: number;
  orderId?: string;
  success: boolean;
  error?: string;
}

export interface AutoTraderStats {
  enabled: boolean;
  clobConfigured: boolean;
  tradesToday: number;
  maxDailyTrades: number;
  remainingSlots: number;
  totalTradesLifetime: number;
  lastScanAt: Date | null;
  lastTradeAt: Date | null;
  recentTrades: TradeRecord[];
  usdcBalance: number;
}

interface DbTradeRecord {
  id: number;
  timestamp: string;
  market_id: string;
  question: string;
  side: "YES" | "NO";
  price: number;
  amount: number;
  edge: number;
  composite_score: number;
  order_id: string | null;
  success: number;
  error: string | null;
}

function rowToTradeRecord(row: DbTradeRecord): TradeRecord {
  return {
    id: row.id,
    timestamp: new Date(row.timestamp),
    marketId: row.market_id,
    question: row.question,
    side: row.side,
    price: row.price,
    amount: row.amount,
    edge: row.edge,
    compositeScore: row.composite_score,
    orderId: row.order_id ?? undefined,
    success: row.success === 1,
    error: row.error ?? undefined,
  };
}

function persistTrade(record: TradeRecord): number {
  const result = db.prepare(
    `INSERT INTO auto_trade_history
     (timestamp, market_id, question, side, price, amount, edge, composite_score, order_id, success, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    record.timestamp.toISOString(),
    record.marketId,
    record.question,
    record.side,
    record.price,
    record.amount,
    record.edge,
    record.compositeScore,
    record.orderId ?? null,
    record.success ? 1 : 0,
    record.error ?? null
  );
  return result.lastInsertRowid as number;
}

let lastScanAt: Date | null = null;
let lastTradeAt: Date | null = null;
let cachedBalance = 0;
let balanceFetchedAt = 0;
const BALANCE_CACHE_TTL = 60_000;

function todayStart(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function tradesToday(): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const row = db.prepare(
    "SELECT COUNT(*) as c FROM auto_trade_history WHERE success = 1 AND timestamp >= ?"
  ).get(start.toISOString()) as { c: number };
  return row.c;
}

async function getBalance(): Promise<number> {
  if (Date.now() - balanceFetchedAt < BALANCE_CACHE_TTL) return cachedBalance;
  try {
    cachedBalance = await getUsdcBalance();
    balanceFetchedAt = Date.now();
    return cachedBalance;
  } catch {
    return cachedBalance;
  }
}

function shouldSkipMarket(marketId: string, side: "YES" | "NO"): boolean {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const row = db.prepare(
    `SELECT COUNT(*) as c FROM auto_trade_history
     WHERE market_id = ? AND side = ? AND timestamp >= ?`
  ).get(marketId, side, dayStart.toISOString()) as { c: number };
  return row.c > 0;
}

export async function executeOpportunities(
  opportunities: Opportunity[],
  config: StrategyConfig
): Promise<TradeRecord[]> {
  lastScanAt = new Date();

  if (!config.autoTradingEnabled) return [];
  if (!isClobConfigured()) {
    logger.info("Auto-trading: CLOB not configured, skipping execution");
    return [];
  }

  const today = tradesToday();
  const remaining = config.maxDailyTrades - today;
  if (remaining <= 0) {
    logger.info({ tradesToday: today, max: config.maxDailyTrades }, "Auto-trading: daily limit reached");
    return [];
  }

  const balance = await getBalance();
  if (balance < 1) {
    logger.warn({ balance }, "Auto-trading: insufficient USDC balance");
    return [];
  }

  const eligibleOps = opportunities
    .filter((op) => {
      if (op.edge < config.minEdge) return false;
      if (op.compositeScore < 0.4) return false;
      if (shouldSkipMarket(op.marketId, op.recommendedSide)) return false;
      if (!op.conditionId) return false;
      return true;
    })
    .slice(0, remaining);

  if (eligibleOps.length === 0) {
    logger.info("Auto-trading: no eligible opportunities this scan");
    return [];
  }

  const executed: TradeRecord[] = [];

  for (const op of eligibleOps) {
    const kellyAmount = config.bankroll * op.kellyFraction;
    const maxAmount = (balance * config.maxPositionPct) / 100;
    const amount = Math.min(
      kellyAmount,
      maxAmount,
      op.suggestedAmount,
      balance * 0.2
    );

    if (amount < 0.5) {
      logger.info({ question: op.question, amount }, "Auto-trading: amount too small, skipping");
      continue;
    }

    const roundedAmount = Math.round(amount * 100) / 100;

    logger.info(
      {
        question: op.question,
        side: op.recommendedSide,
        price: op.currentPrice,
        amount: roundedAmount,
        edge: op.edge,
        score: op.compositeScore,
      },
      "Auto-trading: placing order"
    );

    const result = await placeOrder({
      tokenId: op.conditionId,
      side: op.recommendedSide === "YES" ? "BUY" : "SELL",
      price: op.currentPrice,
      amount: roundedAmount,
      question: op.question,
    });

    const record: TradeRecord = {
      timestamp: new Date(),
      marketId: op.marketId,
      question: op.question,
      side: op.recommendedSide,
      price: op.currentPrice,
      amount: roundedAmount,
      edge: op.edge,
      compositeScore: op.compositeScore,
      orderId: result.orderId,
      success: result.success,
      error: result.error,
    };

    const insertedId = persistTrade(record);
    record.id = insertedId;
    executed.push(record);

    if (result.success) {
      lastTradeAt = new Date();
      balanceFetchedAt = 0;

      portfolioState.addOrder({
        marketId: op.marketId,
        marketQuestion: op.question,
        side: op.recommendedSide,
        type: "BUY",
        price: op.currentPrice,
        amount: roundedAmount,
        shares: Math.round((roundedAmount / op.currentPrice) * 100) / 100,
        status: "filled",
      });

      await notifyOrderFilled({
        question: op.question,
        side: op.recommendedSide,
        price: op.currentPrice,
        amount: roundedAmount,
      });

      logger.info(
        { orderId: result.orderId, question: op.question },
        "Auto-trade executed successfully"
      );
    } else {
      logger.warn(
        { error: result.error, question: op.question },
        "Auto-trade failed"
      );
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  if (executed.some((t) => t.success) && config.telegramAlertsEnabled) {
    const summary = portfolioState.getSummary();
    await notifyDailyReport({
      pnl: summary.totalPnl,
      pnlPct: summary.totalPnlPercent,
      openPositions: summary.openPositions,
      totalValue: summary.totalValue,
      totalTrades: summary.totalTrades,
      winRate: summary.winRate,
    });
  }

  return executed;
}

export async function getAutoTraderStats(config: StrategyConfig): Promise<AutoTraderStats> {
  const today = tradesToday();
  const balance = config.autoTradingEnabled ? await getBalance() : cachedBalance;

  const recentRows = db.prepare(
    `SELECT * FROM auto_trade_history ORDER BY timestamp DESC LIMIT 20`
  ).all() as DbTradeRecord[];

  const totalRow = db.prepare(
    "SELECT COUNT(*) as c FROM auto_trade_history WHERE success = 1"
  ).get() as { c: number };

  const lastTradeRow = db.prepare(
    "SELECT timestamp FROM auto_trade_history WHERE success = 1 ORDER BY timestamp DESC LIMIT 1"
  ).get() as { timestamp: string } | undefined;

  if (lastTradeRow && !lastTradeAt) {
    lastTradeAt = new Date(lastTradeRow.timestamp);
  }

  return {
    enabled: config.autoTradingEnabled,
    clobConfigured: isClobConfigured(),
    tradesToday: today,
    maxDailyTrades: config.maxDailyTrades,
    remainingSlots: Math.max(0, config.maxDailyTrades - today),
    totalTradesLifetime: totalRow.c,
    lastScanAt,
    lastTradeAt,
    recentTrades: recentRows.map(rowToTradeRecord),
    usdcBalance: balance,
  };
}

export function getTradeHistory(): TradeRecord[] {
  const rows = db.prepare(
    "SELECT * FROM auto_trade_history ORDER BY timestamp DESC"
  ).all() as DbTradeRecord[];
  return rows.map(rowToTradeRecord);
}
