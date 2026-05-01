import { Router, type IRouter } from "express";
import { getConfig } from "../services/strategy";
import { getAutoTraderStats, getTradeHistory } from "../services/autoTrader";
import { triggerManualScan } from "../services/scheduler";
import { isClobConfigured } from "../services/clob";

const router: IRouter = Router();

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
      timestamp: t.timestamp.toISOString(),
      marketId: t.marketId,
      question: t.question,
      side: t.side,
      price: t.price,
      amount: t.amount,
      edge: t.edge,
      compositeScore: t.compositeScore,
      orderId: t.orderId ?? null,
      success: t.success,
      error: t.error ?? null,
    })),
  });
});

router.get("/auto-trading/history", (_req, res) => {
  const history = getTradeHistory().slice(0, 100);
  res.json(history.map((t) => ({
    timestamp: t.timestamp.toISOString(),
    marketId: t.marketId,
    question: t.question,
    side: t.side,
    price: t.price,
    amount: t.amount,
    edge: t.edge,
    compositeScore: t.compositeScore,
    orderId: t.orderId ?? null,
    success: t.success,
    error: t.error ?? null,
  })));
});

router.post("/auto-trading/trigger", (_req, res) => {
  if (!isClobConfigured()) {
    res.status(400).json({
      success: false,
      message: "Polymarket CLOB credentials not configured. Set POLYMARKET_PRIVATE_KEY, POLYMARKET_API_KEY, POLYMARKET_API_SECRET, and POLYMARKET_API_PASSPHRASE.",
    });
    return;
  }

  triggerManualScan();
  res.json({
    success: true,
    message: "Manual scan and auto-trading cycle triggered.",
  });
});

export default router;
