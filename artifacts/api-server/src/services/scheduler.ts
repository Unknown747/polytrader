import { logger } from "../lib/logger";
import { getCachedMarkets, invalidateCache } from "./polymarket";
import { scanOpportunities, getConfig } from "./strategy";
import { notifyOpportunities, notifyDailyReport } from "./telegram";

let scanTimer: ReturnType<typeof setInterval> | null = null;
let dailyTimer: ReturnType<typeof setInterval> | null = null;
let lastOpportunityIds = new Set<string>();

async function runScan() {
  const config = getConfig();
  if (!config.telegramAlertsEnabled && !config.autoTradingEnabled) return;

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
  } catch (e) {
    logger.error({ err: e }, "Strategy scan failed");
  }
}

async function runDailyReport() {
  const config = getConfig();
  if (!config.telegramAlertsEnabled) return;

  try {
    await notifyDailyReport({
      pnl: 0,
      pnlPct: 0,
      openPositions: 0,
      totalValue: config.bankroll,
    });
  } catch (e) {
    logger.error({ err: e }, "Daily report failed");
  }
}

export function startScheduler() {
  stopScheduler();

  const config = getConfig();
  const intervalMs = config.scanIntervalMinutes * 60 * 1000;

  scanTimer = setInterval(() => {
    void runScan();
  }, intervalMs);

  const dailyMs = 24 * 60 * 60 * 1000;
  dailyTimer = setInterval(() => {
    void runDailyReport();
  }, dailyMs);

  logger.info({ intervalMinutes: config.scanIntervalMinutes }, "Scheduler started");
}

export function stopScheduler() {
  if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
  if (dailyTimer) { clearInterval(dailyTimer); dailyTimer = null; }
}

export function restartScheduler() {
  stopScheduler();
  startScheduler();
}
