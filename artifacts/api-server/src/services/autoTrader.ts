import { logger } from "../lib/db";
import type { Opportunity, StrategyConfig } from "./strategy";
import { computeAdaptiveProfile, computeCorrelationPenalty } from "./strategy";
import { placeOrder, isClobConfigured, getUsdcBalance } from "./clob";
import { portfolioState } from "../lib/state";
import { notifyOrderFilled } from "./telegram";
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
  emergencyStop: boolean;
  consecutiveLosses: number;
  cooldownUntil: string | null;
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

// ─── Risk state helpers ────────────────────────────────────────────────────

function getRiskState(key: string): string | null {
  const row = db.prepare("SELECT value FROM trading_risk_state WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setRiskState(key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO trading_risk_state (key, value) VALUES (?, ?)").run(key, value);
}

export function isEmergencyStop(): boolean {
  return getRiskState("emergency_stop") === "true";
}

export function setEmergencyStop(active: boolean): void {
  setRiskState("emergency_stop", String(active));
  logger.warn({ active }, "Emergency stop state changed");
}

function getConsecutiveLosses(): number {
  return parseInt(getRiskState("consecutive_losses") ?? "0", 10);
}

function setConsecutiveLosses(count: number): void {
  setRiskState("consecutive_losses", String(count));
}

function getLossCooldownUntil(): Date | null {
  const val = getRiskState("loss_cooldown_until");
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function setLossCooldownUntil(until: Date | null): void {
  setRiskState("loss_cooldown_until", until ? until.toISOString() : "");
}

function getDailyLossPauseUntil(): Date | null {
  const val = getRiskState("daily_loss_pause_until");
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function setDailyLossPauseUntil(until: Date | null): void {
  setRiskState("daily_loss_pause_until", until ? until.toISOString() : "");
}

export function checkAndUpdateLossCooldown(config: StrategyConfig): { blocked: boolean; reason: string } {
  if (!config.cooldownAfterLossEnabled) return { blocked: false, reason: "" };

  const now = new Date();

  const dailyPause = getDailyLossPauseUntil();
  if (dailyPause && now < dailyPause) {
    return { blocked: true, reason: `Daily loss limit hit — paused until ${dailyPause.toISOString()}` };
  }

  const cooldown = getLossCooldownUntil();
  if (cooldown && now < cooldown) {
    const secsLeft = Math.ceil((cooldown.getTime() - now.getTime()) / 1000);
    return { blocked: true, reason: `3x loss cooldown active — ${secsLeft}s remaining` };
  }

  return { blocked: false, reason: "" };
}

export function recordTradeOutcome(success: boolean, config: StrategyConfig): void {
  if (!config.cooldownAfterLossEnabled) return;

  if (!success) {
    const losses = getConsecutiveLosses() + 1;
    setConsecutiveLosses(losses);
    logger.warn({ consecutiveLosses: losses }, "Loss streak updated");

    if (losses >= 3) {
      const until = new Date(Date.now() + 30 * 60 * 1000);
      setLossCooldownUntil(until);
      setConsecutiveLosses(0);
      logger.warn({ until }, "3 consecutive losses — 30-minute cooldown activated");
    }

    const dailyPct = getDailyLossPct();
    if (dailyPct >= 5) {
      const tomorrow = new Date();
      tomorrow.setHours(0, 0, 0, 0);
      tomorrow.setDate(tomorrow.getDate() + 1);
      setDailyLossPauseUntil(tomorrow);
      logger.warn({ dailyLossPct: dailyPct, until: tomorrow }, "5% daily loss — paused until next day");
    }
  } else {
    setConsecutiveLosses(0);
  }
}

function getDailyLossPct(): number {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const rows = db.prepare(
    "SELECT amount, success FROM auto_trade_history WHERE timestamp >= ? ORDER BY timestamp ASC"
  ).all(dayStart.toISOString()) as { amount: number; success: number }[];

  if (rows.length === 0) return 0;
  const totalAtRisk = rows.reduce((s, r) => s + r.amount, 0);
  const losses = rows.filter((r) => r.success === 0).reduce((s, r) => s + r.amount, 0);
  return totalAtRisk > 0 ? (losses / totalAtRisk) * 100 : 0;
}

// ─── Volatility check ──────────────────────────────────────────────────────

export function recordMarketPrice(marketId: string, price: number): void {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT OR REPLACE INTO market_price_history (market_id, price, recorded_at) VALUES (?, ?, ?)"
  ).run(marketId, price, now);
}

/**
 * Batch-record market prices in a single DB transaction.
 * Also prunes stale entries (>2 hours) for all affected markets.
 */
export function batchRecordMarketPrices(prices: Map<string, number>): void {
  if (prices.size === 0) return;

  const insert = db.prepare(
    "INSERT OR REPLACE INTO market_price_history (market_id, price, recorded_at) VALUES (?, ?, ?)"
  );
  const prune = db.prepare(
    "DELETE FROM market_price_history WHERE market_id = ? AND recorded_at < ?"
  );
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  db.transaction(() => {
    for (const [marketId, price] of prices) {
      insert.run(marketId, price, now);
      prune.run(marketId, cutoff);
    }
  })();
}

export function isVolatile(marketId: string, currentPrice: number, thresholdPct: number): boolean {
  const cutoff = new Date(Date.now() - 60 * 1000).toISOString();
  const row = db.prepare(
    "SELECT price FROM market_price_history WHERE market_id = ? AND recorded_at >= ? ORDER BY recorded_at ASC LIMIT 1"
  ).get(marketId, cutoff) as { price: number } | undefined;

  if (!row) return false;
  const changePct = Math.abs((currentPrice - row.price) / row.price) * 100;
  return changePct > thresholdPct;
}

// ─── Balance cache ─────────────────────────────────────────────────────────

let lastScanAt: Date | null = null;
let lastTradeAt: Date | null = null;
let cachedBalance = 0;
let balanceFetchedAt = 0;
const BALANCE_CACHE_TTL = 60_000;

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

// ─── Slippage risk pre-check ───────────────────────────────────────────────

/**
 * Before placing an order, verify the order size doesn't exceed
 * a safe fraction of market liquidity (to avoid excessive slippage).
 * Returns a reduced (safe) amount or 0 if the market is too illiquid.
 *
 * Thresholds:
 *   - order > 10% of liquidity → reduce to 5% of liquidity (warn)
 *   - order > 25% of liquidity → skip (liquidity too thin)
 */
function safeOrderAmount(amount: number, liquidity: number, question: string): number {
  if (liquidity <= 0) return 0;

  const pct = amount / liquidity;

  if (pct > 0.25) {
    logger.warn(
      { question, amount, liquidity, pctOfLiquidity: (pct * 100).toFixed(1) },
      "Auto-trading: order would consume >25% of liquidity — skipping to avoid slippage"
    );
    return 0;
  }

  if (pct > 0.10) {
    const reduced = liquidity * 0.05;
    logger.warn(
      { question, original: amount, reduced, liquidity },
      "Auto-trading: order reduced to 5% of liquidity to limit slippage"
    );
    return reduced;
  }

  return amount;
}

// ─── Main execution ────────────────────────────────────────────────────────

export async function executeOpportunities(
  opportunities: Opportunity[],
  config: StrategyConfig
): Promise<TradeRecord[]> {
  lastScanAt = new Date();

  if (!config.autoTradingEnabled) return [];

  if (isEmergencyStop()) {
    logger.warn("Auto-trading: emergency stop is active — skipping all trades");
    return [];
  }

  if (!isClobConfigured()) {
    logger.info("Auto-trading: CLOB not configured, skipping execution");
    return [];
  }

  if (config.cooldownAfterLossEnabled) {
    const { blocked, reason } = checkAndUpdateLossCooldown(config);
    if (blocked) {
      logger.warn({ reason }, "Auto-trading: loss cooldown active");
      return [];
    }
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

  // ── Adaptive Capital ───────────────────────────────────────────────────
  const adaptive = config.autoCapital ? computeAdaptiveProfile(balance, config) : null;

  if (adaptive) {
    logger.info(
      { mode: adaptive.mode, balance, perTrade: adaptive.perTradeAmount, effectivePct: adaptive.effectiveMaxPosPct },
      "Auto-trading: adaptive capital mode active"
    );
    if (!adaptive.canTrade) {
      logger.warn({ balance, perTrade: adaptive.perTradeAmount }, "Auto-trading: adaptive mode — balance too low to place any order");
      return [];
    }
  }

  const effectiveBankroll    = adaptive ? adaptive.effectiveBankroll    : config.bankroll;
  const effectiveMaxPosPct   = adaptive ? adaptive.effectiveMaxPosPct   : config.maxPositionPct;
  const effectiveMinEdge     = adaptive ? adaptive.minEdgeRequired      : config.minEdge;
  const effectiveMinLiquidity = adaptive ? adaptive.minLiquidityRequired : config.minLiquidity;

  const riskCapPct = Math.min(config.maxRiskPerTradePct ?? 5, effectiveMaxPosPct);

  // ── Correlation context — open position categories ─────────────────────
  const openPositions = portfolioState.getPositions();

  // Build a category map from opportunities (category is available there)
  const categoryMap = new Map<string, string>();
  for (const op of opportunities) {
    categoryMap.set(op.marketId, op.category);
  }

  // Collect categories of open positions by matching marketId
  const openPositionCategories = openPositions
    .map((p) => categoryMap.get(p.marketId) ?? "General");

  const eligibleOps = opportunities
    .filter((op) => {
      if (op.edge < effectiveMinEdge) return false;
      if (op.compositeScore < 0.4) return false;
      if (shouldSkipMarket(op.marketId, op.recommendedSide)) return false;
      if (!op.conditionId) return false;
      if (adaptive && op.liquidity < effectiveMinLiquidity) return false;
      if (op.volume24h !== undefined && op.volume24h < 500) return false;
      if (op.liquidity < 1000) return false;

      if (config.volatilityCheckEnabled) {
        if (isVolatile(op.marketId, op.currentPrice, config.volatilityThresholdPct ?? 5)) {
          logger.info({ question: op.question }, "Auto-trading: skipping volatile market");
          return false;
        }
      }

      return true;
    })
    .slice(0, remaining);

  if (eligibleOps.length === 0) {
    logger.info("Auto-trading: no eligible opportunities this scan");
    return [];
  }

  const executed: TradeRecord[] = [];
  // Track categories traded this cycle to apply intra-cycle correlation penalty
  const tradedThisCycle: string[] = [...openPositionCategories];

  for (const op of eligibleOps) {
    // ── Correlation-aware position sizing ──────────────────────────────
    const corrPenalty = computeCorrelationPenalty(op.category, tradedThisCycle);
    if (corrPenalty < 1) {
      logger.info(
        { category: op.category, penalty: corrPenalty, question: op.question },
        "Auto-trading: correlation penalty applied (same-category concentration)"
      );
    }

    const kellyAmount = effectiveBankroll * op.kellyFraction * corrPenalty;
    const maxAmount   = (balance * riskCapPct) / 100;
    let amount = Math.min(
      kellyAmount,
      maxAmount,
      op.suggestedAmount * corrPenalty,
      balance * 0.2
    );

    // ── CLOB slippage pre-check ────────────────────────────────────────
    amount = safeOrderAmount(amount, op.liquidity, op.question);
    if (amount === 0) continue;

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
        corrPenalty,
        riskCapPct,
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

    recordTradeOutcome(result.success, config);

    if (result.success) {
      lastTradeAt = new Date();
      balanceFetchedAt = 0;

      // Track this category for intra-cycle correlation
      tradedThisCycle.push(op.category);

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

  const cooldownUntil = getLossCooldownUntil() ?? getDailyLossPauseUntil();

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
    emergencyStop: isEmergencyStop(),
    consecutiveLosses: getConsecutiveLosses(),
    cooldownUntil: cooldownUntil ? cooldownUntil.toISOString() : null,
  };
}

export function getTradeHistory(): TradeRecord[] {
  const rows = db.prepare(
    "SELECT * FROM auto_trade_history ORDER BY timestamp DESC"
  ).all() as DbTradeRecord[];
  return rows.map(rowToTradeRecord);
}
