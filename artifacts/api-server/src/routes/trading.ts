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
import { scanOpportunities, getConfig, updateConfig, runBacktest, runBacktestComparison } from "../services/strategy";
import { restartScheduler, triggerManualScan } from "../services/scheduler";
import { getAutoTraderStats, getTradeHistory } from "../services/autoTrader";
import { isClobConfigured, getUsdcBalance } from "../services/clob";
import { getPaperPortfolio, resetPaperPortfolio, getPerformanceAnalytics } from "../services/paperTrader";
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
  // Merge extra fields that are in our config but not in the OpenAPI schema
  // (autoCompound, categoryFilter, paperTradingMode, paperBankroll)
  const raw = req.body as Record<string, unknown>;
  const extraFields: Record<string, unknown> = {};
  const extraKeys = ["autoCompound", "categoryFilter", "paperTradingMode", "paperBankroll"];
  for (const key of extraKeys) {
    if (key in raw) extraFields[key] = raw[key];
  }
  const updated = updateConfig({ ...body, ...extraFields });
  restartScheduler();
  res.json(UpdateStrategyConfigResponse.parse(updated));
});

router.post("/strategy/backtest", (req, res) => {
  const body = RunBacktestBody.parse(req.body);
  const result = runBacktest(body);
  res.json(RunBacktestResponse.parse(result));
});

router.post("/strategy/backtest-compare", (req, res) => {
  const body = RunBacktestBody.parse(req.body);
  const result = runBacktestComparison(body);
  res.json(result);
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

// ─── Kelly Calculator ───────────────────────────────────────────────────────
router.get("/strategy/kelly-calc", (req, res) => {
  const probability = parseFloat(req.query.probability as string ?? "0");
  const price = parseFloat(req.query.price as string ?? "0");
  const bankroll = parseFloat(req.query.bankroll as string ?? "100");
  const maxPosPct = parseFloat(req.query.maxPosPct as string ?? "5");

  if (isNaN(probability) || isNaN(price) || probability <= 0 || price <= 0 || price >= 1) {
    res.status(400).json({ error: "Invalid parameters. probability and price must be between 0-1." });
    return;
  }

  const b = (1 - price) / price;
  const q = 1 - probability;
  const fullKelly = (probability * b - q) / b;
  const halfKelly = fullKelly / 2;
  const quarterKelly = fullKelly / 4;
  const cappedKelly = Math.min(Math.max(halfKelly, 0), maxPosPct / 100);

  const edge = probability - price;
  const expectedReturn = edge / price;
  const impliedOdds = (1 - price) / price;

  res.json({
    probability,
    price,
    bankroll,
    edge: Math.round(edge * 10000) / 100,
    expectedReturn: Math.round(expectedReturn * 10000) / 100,
    impliedOdds: Math.round(impliedOdds * 100) / 100,
    fullKellyPct: Math.round(fullKelly * 10000) / 100,
    halfKellyPct: Math.round(halfKelly * 10000) / 100,
    quarterKellyPct: Math.round(quarterKelly * 10000) / 100,
    recommendedPct: Math.round(cappedKelly * 10000) / 100,
    fullKellyAmount: Math.round(bankroll * Math.max(fullKelly, 0) * 100) / 100,
    halfKellyAmount: Math.round(bankroll * Math.max(halfKelly, 0) * 100) / 100,
    quarterKellyAmount: Math.round(bankroll * Math.max(quarterKelly, 0) * 100) / 100,
    recommendedAmount: Math.round(bankroll * cappedKelly * 100) / 100,
    isPositiveEV: edge > 0,
    riskLevel: fullKelly > 0.15 ? "high" : fullKelly > 0.07 ? "medium" : "low",
  });
});

// ─── Performance Analytics ──────────────────────────────────────────────────
router.get("/analytics/performance", (_req, res) => {
  try {
    const analytics = getPerformanceAnalytics();
    const history = getTradeHistory().slice(0, 200);

    const byCategory: Record<string, { wins: number; total: number; pnl: number; edgeSum: number }> = {};
    for (const t of history) {
      if (!t.success) continue;
      const cat = "Auto Trade";
      if (!byCategory[cat]) byCategory[cat] = { wins: 0, total: 0, pnl: 0, edgeSum: 0 };
      byCategory[cat].total++;
      byCategory[cat].edgeSum += t.edge;
    }

    const tradeStats = {
      total: history.filter((t) => t.success).length,
      totalAttempts: history.length,
      successRate: history.length > 0 ? Math.round((history.filter((t) => t.success).length / history.length) * 1000) / 10 : 0,
      avgEdge: history.length > 0 ? Math.round((history.reduce((s, t) => s + t.edge, 0) / history.length) * 10000) / 100 : 0,
      avgScore: history.length > 0 ? Math.round((history.reduce((s, t) => s + t.compositeScore, 0) / history.length) * 1000) / 10 : 0,
      recentTrades: history.slice(0, 20),
    };

    res.json({ ...analytics, tradeStats });
  } catch (e) {
    logger.error({ err: e }, "Analytics performance failed");
    res.status(500).json({ error: "Failed to compute analytics" });
  }
});

// ─── Markets Resolving Soon ──────────────────────────────────────────────────
router.get("/markets/resolving-soon", async (_req, res) => {
  try {
    const markets = await getCachedMarkets().catch(() => FAKE_MARKETS as Parameters<typeof scanOpportunities>[0]);

    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    const resolving = markets
      .filter((m) => {
        if (m.status !== "active") return false;
        const end = new Date(m.endDate).getTime();
        const msLeft = end - now;
        return msLeft > 0 && msLeft <= sevenDaysMs;
      })
      .map((m) => {
        const end = new Date(m.endDate).getTime();
        const hoursLeft = (end - now) / (1000 * 60 * 60);
        const daysLeft = hoursLeft / 24;
        return {
          marketId: m.id,
          question: m.question,
          category: m.category,
          endDate: m.endDate,
          hoursLeft: Math.round(hoursLeft * 10) / 10,
          daysLeft: Math.round(daysLeft * 10) / 10,
          yesPrice: m.yesPrice,
          noPrice: m.noPrice,
          volume24h: m.volume24h,
          liquidity: m.liquidity,
          urgency: hoursLeft <= 24 ? "critical" : hoursLeft <= 72 ? "high" : "medium",
        };
      })
      .sort((a, b) => a.hoursLeft - b.hoursLeft)
      .slice(0, 50);

    const positionsInResolvingMarkets = resolving.map((m) => {
      interface OrderRow { market_id: string; side: string; price: number; amount: number; shares: number }
      const order = db.prepare(
        "SELECT market_id, side, price, amount, shares FROM portfolio_orders WHERE market_id = ? AND status = 'open' LIMIT 1"
      ).get(m.marketId) as OrderRow | undefined;
      return { ...m, openPosition: order ?? null };
    });

    res.json({
      markets: positionsInResolvingMarkets,
      totalResolving: resolving.length,
      criticalCount: resolving.filter((m) => m.urgency === "critical").length,
      highCount: resolving.filter((m) => m.urgency === "high").length,
    });
  } catch (e) {
    logger.error({ err: e }, "resolving-soon failed");
    res.status(500).json({ error: "Failed to fetch resolving markets" });
  }
});

// ─── Paper Trading ──────────────────────────────────────────────────────────
router.get("/paper-trading/status", (_req, res) => {
  const config = getConfig();
  const portfolio = getPaperPortfolio(config);
  res.json({ ...portfolio, paperTradingMode: config.paperTradingMode, paperBankroll: config.paperBankroll });
});

router.post("/paper-trading/reset", (_req, res) => {
  const config = getConfig();
  resetPaperPortfolio(config);
  res.json({ success: true, message: `Paper portfolio reset to $${config.paperBankroll}` });
});

// ─── Mainnet Preflight Checklist ────────────────────────────────────────────
router.get("/mainnet/preflight", async (_req, res) => {
  const config = getConfig();
  const checks: Array<{
    id: string; label: string; status: "pass" | "fail" | "warn"; detail: string
  }> = [];

  // 1. CLOB credentials
  const clobOk = isClobConfigured();
  checks.push({
    id: "clob_credentials",
    label: "CLOB API Credentials",
    status: clobOk ? "pass" : "fail",
    detail: clobOk
      ? "Private key, API key, secret, dan passphrase sudah dikonfigurasi."
      : "Belum ada CLOB credentials. Set di Settings → Credential Wizard.",
  });

  // 2. USDC Balance
  let balance = 0;
  if (clobOk) {
    try { balance = await getUsdcBalance(); } catch { balance = 0; }
  }
  const balanceStatus = balance >= 50 ? "pass" : balance >= 20 ? "warn" : "fail";
  checks.push({
    id: "usdc_balance",
    label: "Saldo USDC",
    status: balanceStatus,
    detail: balance > 0
      ? `Saldo: $${balance.toFixed(2)} USDC. ${balance < 20 ? "Terlalu rendah — minimal $20 untuk trade." : balance < 50 ? "Cukup tapi terbatas. Disarankan min $50." : "Cukup untuk mulai trading."}`
      : "Tidak bisa baca saldo. Pastikan wallet terhubung ke Polygon.",
  });

  // 3. Auto-trading enabled
  checks.push({
    id: "auto_trading",
    label: "Auto-Trading",
    status: config.autoTradingEnabled ? "pass" : "warn",
    detail: config.autoTradingEnabled
      ? "Auto-trading diaktifkan — bot akan eksekusi order otomatis."
      : "Auto-trading nonaktif. Aktifkan di Settings jika ingin bot jalan otomatis.",
  });

  // 4. Auto Capital Mode
  checks.push({
    id: "auto_capital",
    label: "Auto Capital Mode",
    status: config.autoCapital ? "pass" : "warn",
    detail: config.autoCapital
      ? "Aktif — posisi dikalkulasi dari saldo nyata secara real-time."
      : "Nonaktif — bot pakai bankroll statis. Disarankan aktifkan untuk mainnet.",
  });

  // 5. Stop-loss protection
  checks.push({
    id: "stop_loss",
    label: "Stop-Loss Otomatis",
    status: config.stopLossAutoExecute ? "pass" : "warn",
    detail: config.stopLossAutoExecute
      ? `Aktif — posisi ditutup otomatis jika rugi ≥ ${config.stopLossPct}%.`
      : "Nonaktif — tidak ada perlindungan drawdown otomatis.",
  });

  // 6. Min edge sanity check
  const edgeSafe = config.minEdge >= 0.02 && config.minEdge <= 0.15;
  checks.push({
    id: "min_edge",
    label: "Min Edge",
    status: edgeSafe ? "pass" : "warn",
    detail: edgeSafe
      ? `Min edge ${(config.minEdge * 100).toFixed(1)}% — dalam rentang aman (2-15%).`
      : `Min edge ${(config.minEdge * 100).toFixed(1)}% — di luar rentang optimal. Sesuaikan.`,
  });

  // 7. Max position size safety
  const posSafe = config.maxPositionPct <= 10;
  checks.push({
    id: "max_position",
    label: "Max Position Size",
    status: posSafe ? "pass" : "warn",
    detail: posSafe
      ? `${config.maxPositionPct}% per trade — konservatif dan aman.`
      : `${config.maxPositionPct}% per trade — cukup besar. Pertimbangkan turunkan ke ≤10% untuk mainnet.`,
  });

  // 8. Daily trade limit
  const limitSafe = config.maxDailyTrades <= 10;
  checks.push({
    id: "daily_limit",
    label: "Max Daily Trades",
    status: limitSafe ? "pass" : "warn",
    detail: limitSafe
      ? `${config.maxDailyTrades} trade/hari — rate aman untuk permulaan.`
      : `${config.maxDailyTrades} trade/hari — tinggi. Pertimbangkan turunkan untuk awal mainnet.`,
  });

  // 9. Telegram alerts
  const telegramOk = config.telegramAlertsEnabled;
  checks.push({
    id: "telegram",
    label: "Telegram Alerts",
    status: telegramOk ? "pass" : "warn",
    detail: telegramOk
      ? "Aktif — kamu akan menerima notifikasi real-time di Telegram."
      : "Nonaktif — disarankan aktifkan agar bisa monitor bot dari mana saja.",
  });

  // 10. Paper trading off
  checks.push({
    id: "paper_trading_off",
    label: "Paper Trading Dinonaktifkan",
    status: config.paperTradingMode ? "warn" : "pass",
    detail: config.paperTradingMode
      ? "Paper trading masih aktif! Bot sedang simulasi, bukan trading nyata. Nonaktifkan untuk mainnet."
      : "Paper trading off — bot siap eksekusi order nyata di Polymarket.",
  });

  const allPassed = checks.every((c) => c.status !== "fail");
  const hasWarnings = checks.some((c) => c.status === "warn");
  const passCount = checks.filter((c) => c.status === "pass").length;
  const failCount = checks.filter((c) => c.status === "fail").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;

  const readiness = allPassed
    ? hasWarnings
      ? "ready_with_warnings"
      : "ready"
    : "not_ready";

  res.json({
    readiness,
    passCount,
    failCount,
    warnCount,
    totalChecks: checks.length,
    usdcBalance: balance,
    checks,
    summary: readiness === "ready"
      ? "✅ Semua pengecekan lulus! Bot siap untuk mainnet."
      : readiness === "ready_with_warnings"
      ? "⚠️ Siap dengan catatan — perhatikan warning di atas sebelum mulai."
      : "❌ Belum siap — perbaiki item yang fail terlebih dahulu.",
  });
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
