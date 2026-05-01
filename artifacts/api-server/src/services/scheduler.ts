import { logger } from "../lib/logger";
import { getCachedMarkets, invalidateCache } from "./polymarket";
import { scanOpportunities, getConfig } from "./strategy";
import { notifyOpportunities, notifyDailyReport } from "./telegram";
import { portfolioState } from "../lib/state";
import { executeOpportunities } from "./autoTrader";

let scanTimer: ReturnType<typeof setInterval> | null = null;
let dailyTimer: ReturnType<typeof setInterval> | null = null;
let lastOpportunityIds = new Set<string>();
let isScanning = false;

async function runScan() {
  if (isScanning) {
    logger.info("Scan already in progress, skipping");
    return;
  }

  const config = getConfig();
  if (!config.telegramAlertsEnabled && !config.autoTradingEnabled) return;

  isScanning = true;
  try {
    invalidateCache();
    const markets = await getCachedMarkets();
    const opportunities = scanOpportunities(markets, config);

    const newOps = opportunities.filter(
      (op) => !lastOpportunityIds.has(`${op.marketId}-${op.recommendedSide}`)
    );

    lastOpportunityIds = new Set(
      opportunities.map((op) => `${op.marketId}-${op.recommendedSide}`)
    );

    if (newOps.length > 0 && config.telegramAlertsEnabled) {
      await notifyOpportunities(newOps);
    }

    logger.info(
      { total: opportunities.length, new: newOps.length },
      "Strategy scan complete"
    );

    if (config.autoTradingEnabled) {
      const executed = await executeOpportunities(opportunities, config);
      if (executed.length > 0) {
        const succeeded = executed.filter((t) => t.success).length;
        logger.info({ executed: executed.length, succeeded }, "Auto-trading cycle done");
      }
    }
  } catch (e) {
    logger.error({ err: e }, "Strategy scan failed");
  } finally {
    isScanning = false;
  }
}

async function runDailyReport() {
  const config = getConfig();
  if (!config.telegramAlertsEnabled) return;

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
  } catch (e) {
    logger.error({ err: e }, "Daily report failed");
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

  const dailyMs = 24 * 60 * 60 * 1000;
  dailyTimer = setInterval(() => {
    void runDailyReport();
  }, dailyMs);

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

export function triggerDailyReport(): void {
  void runDailyReport();
}
