import { Router, type IRouter } from "express";
import {
  GetOpportunitiesResponse,
  GetStrategyConfigResponse,
  UpdateStrategyConfigBody,
  UpdateStrategyConfigResponse,
  RunBacktestBody,
  RunBacktestResponse,
} from "@workspace/api-zod";
import { getCachedMarkets } from "../services/polymarket";
import { scanOpportunities, getConfig, updateConfig, runBacktest } from "../services/strategy";
import { restartScheduler, triggerManualScan } from "../services/scheduler";
import { getAutoTraderStats, getTradeHistory } from "../services/autoTrader";
import { isClobConfigured } from "../services/clob";
import { logger } from "../lib/db";
import db from "../lib/db";
import { FAKE_MARKETS } from "./markets";

const router: IRouter = Router();

router.get("/strategy/opportunities", async (_req, res) => {
  let markets: Parameters<typeof scanOpportunities>[0];
  let usedLive = false;
  try {
    const live = await getCachedMarkets();
    if (live.length > 0) { markets = live; usedLive = true; }
    else { markets = FAKE_MARKETS as Parameters<typeof scanOpportunities>[0]; }
  } catch {
    markets = FAKE_MARKETS as Parameters<typeof scanOpportunities>[0];
  }
  let opportunities = scanOpportunities(markets);
  if (usedLive && opportunities.length === 0) {
    opportunities = scanOpportunities(FAKE_MARKETS as Parameters<typeof scanOpportunities>[0]);
  }
  res.json(GetOpportunitiesResponse.parse(opportunities));
});

router.get("/strategy/config", (_req, res) => {
  res.json(GetStrategyConfigResponse.parse(getConfig()));
});

router.put("/strategy/config", (req, res) => {
  const body = UpdateStrategyConfigBody.parse(req.body);
  const updated = updateConfig(body);
  restartScheduler();
  res.json(UpdateStrategyConfigResponse.parse(updated));
});

router.post("/strategy/backtest", (req, res) => {
  const body = RunBacktestBody.parse(req.body);
  const result = runBacktest(body);
  res.json(RunBacktestResponse.parse(result));
});

router.get("/auto-trading/status", async (_req, res) => {
  const config = getConfig();
  const stats = await getAutoTraderStats(config);
  res.json({
    enabled: stats.enabled,
    clobConfigured: stats.clobConfigured,
    tradesToday: stats.tradesToday,
    maxDailyTrades: stats.maxDailyTrades,
    remainingSlots: stats.remainingSlots,
    totalTradesLifetime: stats.totalTradesLifetime,
    lastScanAt: stats.lastScanAt?.toISOString() ?? null,
    lastTradeAt: stats.lastTradeAt?.toISOString() ?? null,
    usdcBalance: stats.usdcBalance,
    recentTrades: stats.recentTrades.map((t) => ({
      timestamp: t.timestamp.toISOString(), marketId: t.marketId, question: t.question,
      side: t.side, price: t.price, amount: t.amount, edge: t.edge,
      compositeScore: t.compositeScore, orderId: t.orderId ?? null, success: t.success, error: t.error ?? null,
    })),
  });
});

router.get("/auto-trading/history", (_req, res) => {
  const history = getTradeHistory().slice(0, 100);
  res.json(history.map((t) => ({
    timestamp: t.timestamp.toISOString(), marketId: t.marketId, question: t.question,
    side: t.side, price: t.price, amount: t.amount, edge: t.edge,
    compositeScore: t.compositeScore, orderId: t.orderId ?? null, success: t.success, error: t.error ?? null,
  })));
});

router.post("/auto-trading/trigger", (_req, res) => {
  if (!isClobConfigured()) {
    res.status(400).json({ success: false, message: "Polymarket CLOB credentials not configured." });
    return;
  }
  triggerManualScan();
  res.json({ success: true, message: "Manual scan and auto-trading cycle triggered." });
});

router.get("/prices/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const pushPrices = async () => {
    try {
      const markets = await getCachedMarkets();
      interface WatchlistRow { market_id: string }
      const watchlisted = db.prepare("SELECT market_id FROM market_watchlist").all() as WatchlistRow[];
      const watchedIds = new Set(watchlisted.map((r) => r.market_id));
      const prices: Array<{ marketId: string; question: string; yesPrice: number; noPrice: number }> = [];
      for (const m of markets) {
        if (watchedIds.size === 0 || watchedIds.has(m.id)) {
          prices.push({ marketId: m.id, question: m.question, yesPrice: m.yesPrice, noPrice: m.noPrice });
        }
      }
      send({ type: "prices", timestamp: new Date().toISOString(), data: prices });
    } catch (err) {
      logger.warn({ err }, "SSE price push failed");
      send({ type: "error", message: "Failed to fetch prices" });
    }
  };

  void pushPrices();
  const interval = setInterval(() => void pushPrices(), 15000);
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 30000);

  req.on("close", () => {
    clearInterval(interval);
    clearInterval(heartbeat);
    logger.info("SSE client disconnected from /prices/stream");
  });
});

export default router;
