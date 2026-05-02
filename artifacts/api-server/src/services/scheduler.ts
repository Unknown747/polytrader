import { logger } from "../lib/db";
import { getCachedMarkets, invalidateCache } from "./polymarket";
import { scanOpportunities, getConfig, updateConfig } from "./strategy";
import { getNetworkMode } from "../lib/networkMode";
import {
  notifyOpportunities,
  notifyDailyReport,
  notifyPriceAlert,
  notifyExpiringPosition,
  notifyMarketResolved,
  notifyStopLossExecuted,
  notifyTakeProfitTierExecuted,
  notifyLowBalance,
  notifyAutoCompound,
  notifyHeartbeatFailure,
} from "./telegram";
import { portfolioState } from "../lib/state";
import { executeOpportunities, recordMarketPrice } from "./autoTrader";
import { isClobConfigured, getOpenOrders, getUsdcBalance, cancelOrder } from "./clob";
import { executePaperOpportunities, resolvePaperTradesNearResolution } from "./paperTrader";
import db from "../lib/db";

let scanTimer: ReturnType<typeof setInterval> | null = null;
let dailyTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let lastOpportunityIds = new Set<string>();
let isScanning = false;
let lastDailyReportDate = "";
const alertedExpiringPositions = new Set<string>();
let scanCycleCount = 0;
let lastLowBalanceAlertAt = 0;
const LOW_BALANCE_ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours
let lastAutoCompoundAt = 0;
const AUTO_COMPOUND_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
let heartbeatFailCount = 0;
let lastSuccessfulScanAt = Date.now();
let athEquity = 0;

interface AlertRow {
  id: number;
  market_id: string;
  market_question: string;
  side: "YES" | "NO";
  direction: "above" | "below";
  target_price: number;
}

async function checkPriceAlerts(
  priceMap: Map<string, number>
): Promise<void> {
  const config = getConfig();
  if (!config.telegramAlertsEnabled) return;

  const alerts = db.prepare(
    "SELECT id, market_id, market_question, side, direction, target_price FROM price_alerts WHERE triggered = 0"
  ).all() as AlertRow[];

  for (const alert of alerts) {
    const currentYes = priceMap.get(alert.market_id);
    if (currentYes === undefined) continue;

    const currentPrice = alert.side === "YES" ? currentYes : 1 - currentYes;

    const triggered =
      (alert.direction === "above" && currentPrice >= alert.target_price) ||
      (alert.direction === "below" && currentPrice <= alert.target_price);

    if (triggered) {
      db.prepare(
        "UPDATE price_alerts SET triggered = 1, triggered_at = ? WHERE id = ?"
      ).run(new Date().toISOString(), alert.id);

      logger.info({ alertId: alert.id, marketId: alert.market_id }, "Price alert triggered");

      await notifyPriceAlert({
        marketId: alert.market_id,
        question: alert.market_question,
        side: alert.side,
        direction: alert.direction,
        targetPrice: alert.target_price,
        currentPrice,
      });
    }
  }
}

async function checkExpiringPositions(): Promise<void> {
  const config = getConfig();
  if (!config.telegramAlertsEnabled) return;

  const positions = portfolioState.getPositions();
  if (positions.length === 0) return;

  const markets = await getCachedMarkets().catch(() => []);

  for (const pos of positions) {
    const market = markets.find((m) => m.id === pos.marketId);
    if (!market || !market.endDate) continue;

    const msLeft = new Date(market.endDate).getTime() - Date.now();
    const hoursLeft = msLeft / (1000 * 60 * 60);

    if (hoursLeft > 0 && hoursLeft <= 48) {
      const alertKey = `${pos.id}-${Math.floor(hoursLeft / 12)}`;
      if (!alertedExpiringPositions.has(alertKey)) {
        alertedExpiringPositions.add(alertKey);
        await notifyExpiringPosition({
          question: pos.marketQuestion,
          side: pos.side as "YES" | "NO",
          hoursLeft: Math.ceil(hoursLeft),
          currentPrice: pos.currentPrice,
          pnl: pos.pnl,
          value: pos.value,
        });
        logger.info({ marketId: pos.marketId, hoursLeft }, "Expiring position alert sent");
      }
    }
  }
}

async function checkDailyReport(): Promise<void> {
  const config = getConfig();
  if (!config.telegramAlertsEnabled) return;

  const dailyReportHour: number = (config as Record<string, unknown>).dailyReportHour as number ?? 8;
  if (dailyReportHour < 0) return;

  const now = new Date();
  const currentHour = now.getUTCHours();
  const todayDate = now.toISOString().slice(0, 10);

  if (currentHour === dailyReportHour && todayDate !== lastDailyReportDate) {
    lastDailyReportDate = todayDate;
    try {
      const summary = portfolioState.getSummary();
      await notifyDailyReport({
        pnl: summary.totalPnl,
        pnlPct: summary.totalPnlPercent,
        openPositions: summary.openPositions,
        totalValue: summary.totalValue,
        totalTrades: summary.totalTrades,
        winRate: summary.winRate,
      });
      logger.info({ date: todayDate, hour: dailyReportHour }, "Daily report sent");
    } catch (e) {
      logger.error({ err: e }, "Daily report failed");
    }
  }
}

function hasRiskEvent(positionId: string, eventType: string): boolean {
  return !!db.prepare(
    "SELECT 1 FROM position_risk_events WHERE position_id = ? AND event_type = ?"
  ).get(positionId, eventType);
}

function recordRiskEvent(positionId: string, eventType: string, sharesSold: number, realizedPnl: number, price: number): void {
  db.prepare(
    `INSERT OR IGNORE INTO position_risk_events (position_id, event_type, executed_at, shares_sold, realized_pnl, price_at_execution)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(positionId, eventType, new Date().toISOString(), sharesSold, realizedPnl, price);
}

async function checkStopLossTakeProfit(): Promise<void> {
  const config = getConfig();
  const slPct = Math.max(10, Math.min(20, config.stopLossPct));
  const positions = portfolioState.getPositions();
  if (positions.length === 0) return;

  for (const pos of positions) {
    if (!pos.avgPrice || pos.avgPrice <= 0) continue;

    const entry = pos.avgPrice;
    const current = pos.currentPrice;
    if (current <= 0) continue;
    const pnlPct = ((current - entry) / entry) * 100;

    // ── Stop-Loss: auto-execute when loss >= stopLossPct (clamped 10-20%) ──
    if (pnlPct <= -slPct && config.stopLossAutoExecute) {
      if (!hasRiskEvent(pos.id, "sl")) {
        logger.warn({ marketId: pos.marketId, pnlPct, slPct }, "Stop-loss executing — closing position");
        const result = portfolioState.fullClosePosition(pos.id, current);
        const sharesSold = pos.shares;
        const realizedPnl = result?.realizedPnl ?? pos.pnl;

        recordRiskEvent(pos.id, "sl", sharesSold, realizedPnl, current);
        await notifyStopLossExecuted({
          question: pos.marketQuestion,
          side: pos.side as "YES" | "NO",
          entryPrice: entry,
          currentPrice: current,
          sharesSold,
          realizedPnl,
          pnlPct,
        });
      }
      continue;
    }

    if (!config.takeProfitEnabled) continue;

    // ── Take-Profit Tier 1 (default 30%): recover initial capital ──
    if (pnlPct >= config.takeProfitTier1Pct && !hasRiskEvent(pos.id, "tp1")) {
      const costBasis = pos.shares * entry;
      const sharesToSell = Math.min(costBasis / current, pos.shares);
      if (sharesToSell < 0.001) continue;

      logger.info({ marketId: pos.marketId, pnlPct, tier: 1 }, "Take-profit Tier 1 — recovering capital");
      const result = portfolioState.partialClosePosition(pos.id, sharesToSell, current);
      if (!result) continue;

      recordRiskEvent(pos.id, "tp1", sharesToSell, result.realizedPnl, current);
      await notifyTakeProfitTierExecuted({
        question: pos.marketQuestion,
        side: pos.side as "YES" | "NO",
        tier: 1,
        tierPct: config.takeProfitTier1Pct,
        entryPrice: entry,
        currentPrice: current,
        sharesSold: sharesToSell,
        realizedPnl: result.realizedPnl,
        remainingShares: result.remainingShares,
        action: "capital_recovery",
      });
    }

    // ── Take-Profit Tier 2 (default 50%): sell half of remaining ──
    else if (pnlPct >= config.takeProfitTier2Pct && hasRiskEvent(pos.id, "tp1") && !hasRiskEvent(pos.id, "tp2")) {
      const sharesToSell = pos.shares * 0.5;
      if (sharesToSell < 0.001) continue;

      logger.info({ marketId: pos.marketId, pnlPct, tier: 2 }, "Take-profit Tier 2 — selling 50% of remainder");
      const result = portfolioState.partialClosePosition(pos.id, sharesToSell, current);
      if (!result) continue;

      recordRiskEvent(pos.id, "tp2", sharesToSell, result.realizedPnl, current);
      await notifyTakeProfitTierExecuted({
        question: pos.marketQuestion,
        side: pos.side as "YES" | "NO",
        tier: 2,
        tierPct: config.takeProfitTier2Pct,
        entryPrice: entry,
        currentPrice: current,
        sharesSold: sharesToSell,
        realizedPnl: result.realizedPnl,
        remainingShares: result.remainingShares,
        action: "half_remaining",
      });
    }

    // ── Take-Profit Tier 3 (default 100%): close fully ──
    else if (pnlPct >= config.takeProfitTier3Pct && !hasRiskEvent(pos.id, "tp3")) {
      logger.info({ marketId: pos.marketId, pnlPct, tier: 3 }, "Take-profit Tier 3 — full close");
      const sharesSold = pos.shares;
      const result = portfolioState.fullClosePosition(pos.id, current);
      if (!result) continue;

      recordRiskEvent(pos.id, "tp3", sharesSold, result.realizedPnl, current);
      await notifyTakeProfitTierExecuted({
        question: pos.marketQuestion,
        side: pos.side as "YES" | "NO",
        tier: 3,
        tierPct: config.takeProfitTier3Pct,
        entryPrice: entry,
        currentPrice: current,
        sharesSold,
        realizedPnl: result.realizedPnl,
        remainingShares: 0,
        action: "full_close",
      });
    }
  }
}

async function checkLowBalance(): Promise<void> {
  const config = getConfig();
  if (!config.telegramAlertsEnabled || !isClobConfigured()) return;
  if (Date.now() - lastLowBalanceAlertAt < LOW_BALANCE_ALERT_COOLDOWN_MS) return;

  try {
    const balance = await getUsdcBalance();
    if (balance <= 0) return;

    let threshold = 50;
    let mode = "Normal";
    let suggestion = "Top-up ke minimal $50 untuk performa optimal.";

    if (balance < 5) {
      threshold = 20;
      mode = "Kritis — hampir tidak bisa trade";
      suggestion = "Saldo sangat rendah. Top-up segera atau bot akan berhenti.";
    } else if (balance < 20) {
      threshold = 20;
      mode = "Micro — risiko tinggi";
      suggestion = "Minimal $20 agar bot bisa place order di Polymarket.";
    } else if (balance < 50) {
      threshold = 50;
      mode = "Small Capital";
      suggestion = "Dengan $50+ bot bisa diversifikasi lebih baik.";
    } else {
      return;
    }

    const lastAlert = db.prepare(
      "SELECT alerted_at FROM low_balance_alerts ORDER BY id DESC LIMIT 1"
    ).get() as { alerted_at: string } | undefined;

    const lastAlertMs = lastAlert ? new Date(lastAlert.alerted_at).getTime() : 0;
    if (Date.now() - lastAlertMs < LOW_BALANCE_ALERT_COOLDOWN_MS) return;

    db.prepare(
      "INSERT INTO low_balance_alerts (balance, threshold, alerted_at) VALUES (?, ?, ?)"
    ).run(balance, threshold, new Date().toISOString());

    lastLowBalanceAlertAt = Date.now();

    await notifyLowBalance({ balance, minRequired: threshold, mode, suggestion });
    logger.info({ balance, threshold, mode }, "Low balance alert sent");
  } catch (e) {
    logger.warn({ err: e }, "checkLowBalance failed");
  }
}

async function runAutoCompound(): Promise<void> {
  const config = getConfig();
  if (!config.autoCompound || !isClobConfigured()) return;
  if (Date.now() - lastAutoCompoundAt < AUTO_COMPOUND_COOLDOWN_MS) return;

  try {
    const balance = await getUsdcBalance();
    if (balance <= 0 || balance === config.bankroll) return;

    const oldBankroll = config.bankroll;
    const profit = balance - oldBankroll;
    const profitPct = oldBankroll > 0 ? (profit / oldBankroll) * 100 : 0;

    if (Math.abs(profit) < 0.50) return;

    updateConfig({ bankroll: Math.round(balance * 100) / 100 });
    lastAutoCompoundAt = Date.now();

    logger.info({ oldBankroll, newBankroll: balance, profit }, "Auto-compound: bankroll updated");

    if (config.telegramAlertsEnabled) {
      await notifyAutoCompound({ oldBankroll, newBankroll: balance, profit, profitPct });
    }
  } catch (e) {
    logger.warn({ err: e }, "runAutoCompound failed");
  }
}

async function checkMarketResolutions(): Promise<void> {
  const config = getConfig();
  if (!config.telegramAlertsEnabled) return;

  const positions = portfolioState.getPositions();
  if (positions.length === 0) return;

  for (const pos of positions) {
    const alreadyNotified = db.prepare(
      "SELECT 1 FROM resolved_market_notifications WHERE position_id = ? AND side = ?"
    ).get(pos.id, pos.side);

    if (alreadyNotified) continue;

    const isResolvedYes = pos.currentPrice >= 0.97;
    const isResolvedNo = pos.currentPrice <= 0.03;

    if (!isResolvedYes && !isResolvedNo) continue;

    const isWin = (pos.side === "YES" && isResolvedYes) || (pos.side === "NO" && isResolvedNo);
    const finalPrice = isResolvedYes ? 1.0 : 0.0;

    db.prepare(
      "INSERT OR IGNORE INTO resolved_market_notifications (position_id, side, notified_at) VALUES (?, ?, ?)"
    ).run(pos.id, pos.side, new Date().toISOString());

    await notifyMarketResolved({
      question: pos.marketQuestion,
      side: pos.side as "YES" | "NO",
      outcome: isWin ? "win" : "loss",
      pnl: pos.pnl,
      finalPrice,
    });

    logger.info({ marketId: pos.marketId, side: pos.side, outcome: isWin ? "win" : "loss" }, "Market resolution notification sent");
  }
}

function recordEquitySnapshot(balance: number, unrealizedPnl: number): void {
  const totalValue = balance + unrealizedPnl;
  const isAth = totalValue > athEquity;
  if (isAth) athEquity = totalValue;

  const drawdownPct = athEquity > 0
    ? Math.round(((athEquity - totalValue) / athEquity) * 10000) / 100
    : 0;

  try {
    db.prepare(
      `INSERT INTO equity_snapshots (timestamp, balance, unrealized_pnl, total_value, drawdown_pct, is_ath)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(new Date().toISOString(), balance, unrealizedPnl, totalValue, drawdownPct, isAth ? 1 : 0);

    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare("DELETE FROM equity_snapshots WHERE timestamp < ?").run(cutoff);
  } catch (e) {
    logger.warn({ err: e }, "recordEquitySnapshot failed");
  }
}

async function checkHeartbeat(): Promise<void> {
  const config = getConfig();
  const maxSilenceMs = config.scanIntervalMinutes * 60 * 1000 * 3;
  const silenceMs = Date.now() - lastSuccessfulScanAt;

  if (silenceMs > maxSilenceMs) {
    heartbeatFailCount++;
    logger.warn({ silenceMs, failCount: heartbeatFailCount }, "Heartbeat: scan overdue");

    if (heartbeatFailCount >= 2 && config.telegramAlertsEnabled) {
      await notifyHeartbeatFailure({ failCount: heartbeatFailCount });
    }
  } else {
    heartbeatFailCount = 0;
  }
}

export async function recoverOpenOrders(): Promise<void> {
  if (!isClobConfigured()) return;

  try {
    const openOrders = await getOpenOrders();
    if (openOrders.length === 0) return;

    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let cancelled = 0;
    let held = 0;

    for (const order of openOrders) {
      const isStale = order.createdAt < staleThreshold;
      const hasNoFill = order.sizeMatched === 0;

      if (isStale && hasNoFill) {
        const result = await cancelOrder(order.id);
        if (result.success) {
          cancelled++;
          logger.info({ orderId: order.id, createdAt: order.createdAt }, "Stale order cancelled on recovery");
        }
        await new Promise((r) => setTimeout(r, 300));
      } else {
        held++;
        logger.info({ orderId: order.id, sizeMatched: order.sizeMatched }, "Order recovery: holding active order");
      }
    }

    logger.info({ total: openOrders.length, cancelled, held }, "Order recovery complete");
  } catch (e) {
    logger.warn({ err: e }, "recoverOpenOrders failed");
  }
}

async function reconcileOrphanedOrders(): Promise<void> {
  if (!isClobConfigured()) return;

  try {
    const openOrders = await getOpenOrders();
    if (openOrders.length === 0) return;

    const openOrderIds = new Set(openOrders.map((o) => o.id));

    interface TradeRow { id: number; condition_id: string; order_id: string | null; success: number }
    const localFailed = db.prepare(
      "SELECT id, condition_id, order_id, success FROM auto_trade_history WHERE success = 0 AND order_id IS NOT NULL"
    ).all() as TradeRow[];

    let recovered = 0;
    for (const row of localFailed) {
      if (row.order_id && openOrderIds.has(row.order_id)) {
        db.prepare("UPDATE auto_trade_history SET success = 1 WHERE id = ?").run(row.id);
        recovered++;
        logger.info({ tradeId: row.id, orderId: row.order_id }, "Orphaned order recovered");
      }
    }

    if (recovered > 0) {
      logger.info({ recovered, totalOpen: openOrders.length }, "Orphaned order reconciliation complete");
    }
  } catch (e) {
    logger.warn({ err: e }, "Orphaned order reconciliation failed");
  }
}

async function runScan() {
  if (isScanning) {
    logger.info("Scan already in progress, skipping");
    return;
  }

  isScanning = true;
  scanCycleCount++;
  try {
    invalidateCache();
    const markets = await getCachedMarkets();

    const priceMap = new Map<string, number>();
    if (markets.length > 0) {
      for (const m of markets) {
        priceMap.set(m.id, m.yesPrice);
      }
      portfolioState.updatePositionPrices(priceMap);
      logger.info({ marketsUpdated: priceMap.size }, "Position prices updated from market data");
    }

    if (markets.length > 0) {
      for (const m of markets) {
        recordMarketPrice(m.id, m.yesPrice);
      }
    }

    const config = getConfig();
    const opportunities = scanOpportunities(markets, config);

    // Record equity snapshot
    try {
      let balance = 0;
      if (isClobConfigured()) {
        balance = await getUsdcBalance().catch(() => 0);
      }
      const summary = portfolioState.getSummary();
      const unrealizedPnl = summary.totalPnl;
      recordEquitySnapshot(balance, unrealizedPnl);
    } catch { /* non-critical */ }

    lastSuccessfulScanAt = Date.now();

    if (config.telegramAlertsEnabled || config.autoTradingEnabled) {
      const newOps = opportunities.filter(
        (op) => !lastOpportunityIds.has(`${op.marketId}-${op.recommendedSide}`)
      );

      lastOpportunityIds = new Set(
        opportunities.map((op) => `${op.marketId}-${op.recommendedSide}`)
      );

      if (newOps.length > 0 && config.telegramAlertsEnabled) {
        await notifyOpportunities(newOps);
      }

      if (config.autoTradingEnabled && getNetworkMode() !== "testnet") {
        const executed = await executeOpportunities(opportunities, config);
        if (executed.length > 0) {
          const succeeded = executed.filter((t) => t.success).length;
          logger.info({ executed: executed.length, succeeded }, "Auto-trading cycle done");
        }
      } else if (config.autoTradingEnabled && getNetworkMode() === "testnet") {
        logger.info("Auto-trading skipped — testnet mode active (paper trading only)");
      }

      logger.info(
        { total: opportunities.length, new: newOps.length },
        "Strategy scan complete"
      );
    } else {
      logger.info(
        { total: opportunities.length },
        "Strategy scan complete (alerts and auto-trading off)"
      );
    }

    await checkPriceAlerts(priceMap);
    await checkExpiringPositions();
    await checkStopLossTakeProfit();
    await checkMarketResolutions();
    await checkDailyReport();
    await checkLowBalance();
    await runAutoCompound();

    // Paper trading — run alongside real scanning
    // Also forced when network mode is testnet
    const isTestnet = getNetworkMode() === "testnet";
    if (config.paperTradingMode || isTestnet) {
      await executePaperOpportunities(opportunities, config);
      resolvePaperTradesNearResolution(priceMap, config);
    }

    if (scanCycleCount % 4 === 0) {
      await reconcileOrphanedOrders();
    }
  } catch (e) {
    logger.error({ err: e }, "Strategy scan failed");
  } finally {
    isScanning = false;
  }
}

export function startScheduler(runImmediately = true) {
  stopScheduler();

  const config = getConfig();
  const intervalMs = config.scanIntervalMinutes * 60 * 1000;

  if (runImmediately) {
    setTimeout(() => {
      void runScan();
    }, 5000);
  }

  scanTimer = setInterval(() => {
    void runScan();
  }, intervalMs);

  dailyTimer = setInterval(() => {
    void checkDailyReport();
  }, 60 * 1000);

  heartbeatTimer = setInterval(() => {
    void checkHeartbeat();
  }, 5 * 60 * 1000);

  setTimeout(() => {
    void recoverOpenOrders();
  }, 8000);

  logger.info(
    { intervalMinutes: config.scanIntervalMinutes, runImmediately },
    "Scheduler started"
  );
}

export function stopScheduler() {
  if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
  if (dailyTimer) { clearInterval(dailyTimer); dailyTimer = null; }
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

export function restartScheduler() {
  stopScheduler();
  startScheduler(false);
  logger.info("Scheduler restarted due to config change");
}

export function triggerManualScan(): void {
  void runScan();
}

export function getSchedulerStatus(): {
  running: boolean;
  scanCycleCount: number;
  isScanning: boolean;
  lastSuccessfulScanAt: number;
  lastSuccessfulScanAgo: number;
} {
  return {
    running: scanTimer !== null,
    scanCycleCount,
    isScanning,
    lastSuccessfulScanAt,
    lastSuccessfulScanAgo: Math.floor((Date.now() - lastSuccessfulScanAt) / 1000),
  };
}
