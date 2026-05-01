import { logger } from "../lib/logger";
import { getCachedMarkets, invalidateCache } from "./polymarket";
import { scanOpportunities, getConfig } from "./strategy";
import {
  notifyOpportunities,
  notifyDailyReport,
  notifyPriceAlert,
  notifyExpiringPosition,
} from "./telegram";
import { portfolioState } from "../lib/state";
import { executeOpportunities } from "./autoTrader";
import db from "../lib/db";

let scanTimer: ReturnType<typeof setInterval> | null = null;
let dailyTimer: ReturnType<typeof setInterval> | null = null;
let lastOpportunityIds = new Set<string>();
let isScanning = false;
let lastDailyReportDate = "";
const alertedExpiringPositions = new Set<string>();

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

async function runScan() {
  if (isScanning) {
    logger.info("Scan already in progress, skipping");
    return;
  }

  isScanning = true;
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

    const config = getConfig();
    const opportunities = scanOpportunities(markets, config);

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

      if (config.autoTradingEnabled) {
        const executed = await executeOpportunities(opportunities, config);
        if (executed.length > 0) {
          const succeeded = executed.filter((t) => t.success).length;
          logger.info({ executed: executed.length, succeeded }, "Auto-trading cycle done");
        }
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
    await checkDailyReport();
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

  logger.info(
    { intervalMinutes: config.scanIntervalMinutes, runImmediately },
    "Scheduler started"
  );
}

export function stopScheduler() {
  if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
  if (dailyTimer) { clearInterval(dailyTimer); dailyTimer = null; }
}

export function restartScheduler() {
  stopScheduler();
  startScheduler(false);
  logger.info("Scheduler restarted due to config change");
}

export function triggerManualScan(): void {
  void runScan();
}
