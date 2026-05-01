import { Router, type IRouter } from "express";
import {
  ListPositionsResponse,
  ListOrdersResponse,
  PlaceOrderBody,
  CancelOrderParams,
  CancelOrderResponse,
  GetPortfolioSummaryResponse,
  GetPortfolioPnlResponse,
} from "@workspace/api-zod";
import { portfolioState } from "../lib/state";
import { notifyOrderFilled } from "../services/telegram";
import {
  isClobConfigured,
  getFilledTrades,
  getLivePositions,
  computeLivePnlHistory,
  getUsdcBalance,
} from "../services/clob";
import { FAKE_MARKETS } from "./markets";
import { getCachedMarkets } from "../services/polymarket";
import { getConfig } from "../services/strategy";
import db from "../lib/db";

const router: IRouter = Router();

function escapeCSV(val: unknown): string {
  const str = String(val ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSV(headers: string[], rows: Record<string, unknown>[]): string {
  return [headers.join(","), ...rows.map((row) => headers.map((h) => escapeCSV(row[h])).join(","))].join("\n");
}

router.get("/positions", (_req, res) => {
  res.json(ListPositionsResponse.parse(portfolioState.getPositions()));
});

router.get("/orders", (_req, res) => {
  res.json(ListOrdersResponse.parse(portfolioState.getOrders()));
});

router.post("/orders", (req, res) => {
  const body = PlaceOrderBody.parse(req.body);
  const market = FAKE_MARKETS.find((m) => m.id === body.marketId);
  if (!market) { res.status(404).json({ error: "Market not found" }); return; }
  const shares = parseFloat((body.amount / body.price).toFixed(2));
  const status: "filled" | "open" = body.type === "BUY" ? "filled" : "open";
  const newOrder = portfolioState.addOrder({
    marketId: body.marketId,
    marketQuestion: market.question,
    side: body.side, type: body.type, price: body.price, amount: body.amount, shares, status,
  });
  if (newOrder.status === "filled") {
    void notifyOrderFilled({ question: market.question, side: body.side, price: body.price, amount: body.amount });
  }
  res.status(201).json(newOrder);
});

router.delete("/orders/:orderId", (req, res) => {
  const { orderId } = CancelOrderParams.parse(req.params);
  const updated = portfolioState.cancelOrder(orderId);
  if (!updated) { res.status(404).json({ error: "Order not found" }); return; }
  res.json(CancelOrderResponse.parse(updated));
});

router.get("/portfolio/summary", (_req, res) => {
  res.json(GetPortfolioSummaryResponse.parse(portfolioState.getSummary()));
});

router.get("/portfolio/pnl", (_req, res) => {
  res.json(GetPortfolioPnlResponse.parse(portfolioState.getPnlHistory()));
});

router.get("/portfolio/live", async (_req, res) => {
  if (!isClobConfigured()) {
    res.json({ available: false, reason: "Polymarket CLOB credentials not configured", usdcBalance: 0, positions: [], pnlHistory: [], summary: { totalValue: 0, totalCost: 0, totalPnl: 0, totalPnlPercent: 0, openPositions: 0, totalTrades: 0, usdcBalance: 0 } });
    return;
  }
  const [positions, trades, balance] = await Promise.all([getLivePositions(), getFilledTrades(), getUsdcBalance()]);
  const pnlHistory = await computeLivePnlHistory(trades);
  const totalCost = positions.reduce((s, p) => s + p.cost, 0);
  const totalValue = positions.reduce((s, p) => s + p.value, 0);
  const totalPnl = positions.reduce((s, p) => s + p.pnl, 0);
  const totalPnlPercent = totalCost > 0 ? Math.round((totalPnl / totalCost) * 10000) / 100 : 0;
  res.json({
    available: true, reason: null, usdcBalance: balance,
    positions: positions.map((p) => ({ tokenId: p.tokenId, size: p.size, avgPrice: p.avgPrice, currentPrice: p.currentPrice, value: p.value, cost: p.cost, pnl: p.pnl, pnlPercent: p.pnlPercent })),
    pnlHistory,
    summary: { totalValue: Math.round((totalValue + balance) * 100) / 100, totalCost: Math.round(totalCost * 100) / 100, totalPnl: Math.round(totalPnl * 100) / 100, totalPnlPercent, openPositions: positions.length, totalTrades: trades.length, usdcBalance: balance },
  });
});

router.get("/portfolio/export", (req, res) => {
  const type = String(req.query.type ?? "orders");
  if (type === "orders") {
    const rows = db.prepare("SELECT id, market_id, market_question, side, type, price, amount, shares, status, created_at FROM portfolio_orders ORDER BY created_at DESC").all() as Record<string, unknown>[];
    res.setHeader("Content-Type", "text/csv").setHeader("Content-Disposition", 'attachment; filename="orders.csv"');
    res.send(toCSV(["id","market_id","market_question","side","type","price","amount","shares","status","created_at"], rows));
    return;
  }
  if (type === "positions") {
    const rows = db.prepare("SELECT id, market_id, market_question, side, shares, avg_price, current_price, pnl, pnl_percent, value FROM portfolio_positions ORDER BY value DESC").all() as Record<string, unknown>[];
    res.setHeader("Content-Type", "text/csv").setHeader("Content-Disposition", 'attachment; filename="positions.csv"');
    res.send(toCSV(["id","market_id","market_question","side","shares","avg_price","current_price","pnl","pnl_percent","value"], rows));
    return;
  }
  if (type === "pnl") {
    const rows = db.prepare("SELECT date, pnl, cumulative FROM portfolio_pnl ORDER BY date ASC").all() as Record<string, unknown>[];
    res.setHeader("Content-Type", "text/csv").setHeader("Content-Disposition", 'attachment; filename="pnl.csv"');
    res.send(toCSV(["date","pnl","cumulative"], rows));
    return;
  }
  res.status(400).json({ error: "type must be orders, positions, or pnl" });
});

router.get("/portfolio/risk", async (_req, res) => {
  interface PosRow { market_id: string; value: number; pnl: number }
  interface PnlRow { date: string; pnl: number; cumulative: number }

  const positions = db.prepare("SELECT market_id, value, pnl FROM portfolio_positions").all() as PosRow[];
  const pnlHistory = db.prepare("SELECT date, pnl, cumulative FROM portfolio_pnl ORDER BY date ASC").all() as PnlRow[];
  const config = getConfig();
  const bankroll = config.bankroll ?? 1000;

  // ── 1. Concentration sub-score (0–40) ─────────────────────────────────────
  const totalValue = positions.reduce((s, p) => s + p.value, 0);
  let hhi = 0;
  let topPositionPct = 0;
  if (positions.length > 0 && totalValue > 0) {
    const shares = positions.map((p) => p.value / totalValue);
    hhi = shares.reduce((s, w) => s + w * w, 0);
    topPositionPct = Math.round(Math.max(...shares) * 1000) / 10;
  }
  // HHI ranges from 1/n (equal) to 1 (single). Normalise to 0–40.
  const maxHhi = 1;
  const minHhi = positions.length > 1 ? 1 / positions.length : 1;
  const concentrationScore = positions.length === 0
    ? 0
    : Math.round(((hhi - minHhi) / Math.max(0.001, maxHhi - minHhi)) * 40);

  // ── 2. Resolution urgency sub-score (0–30) ────────────────────────────────
  let liveMarkets: Array<{ id: string; endDate: string }> = [];
  try {
    const live = await getCachedMarkets();
    liveMarkets = live.map((m) => ({ id: m.id, endDate: m.endDate }));
  } catch {
    liveMarkets = FAKE_MARKETS.map((m) => ({ id: m.id, endDate: m.endDate }));
  }
  const marketEndMap = new Map(liveMarkets.map((m) => [m.id, m.endDate]));
  FAKE_MARKETS.forEach((m) => { if (!marketEndMap.has(m.id)) marketEndMap.set(m.id, m.endDate); });

  const now = Date.now();
  let urgentValue = 0;
  let within7Days = 0;
  for (const pos of positions) {
    const endDate = marketEndMap.get(pos.market_id);
    if (endDate) {
      const daysLeft = (new Date(endDate).getTime() - now) / 86400000;
      if (daysLeft >= 0 && daysLeft <= 7) { urgentValue += pos.value; within7Days++; }
    }
  }
  const urgentPct = totalValue > 0 ? urgentValue / totalValue : 0;
  const urgencyScore = Math.round(Math.min(30, urgentPct * 60));

  // ── 3. Drawdown sub-score (0–30) ──────────────────────────────────────────
  let peakCumulative = 0;
  let currentCumulative = 0;
  if (pnlHistory.length > 0) {
    currentCumulative = pnlHistory[pnlHistory.length - 1].cumulative;
    peakCumulative = pnlHistory.reduce((m, p) => Math.max(m, p.cumulative), 0);
  }
  const drawdownAbs = Math.max(0, peakCumulative - currentCumulative);
  const drawdownBase = bankroll + Math.max(peakCumulative, 0);
  const drawdownPct = drawdownBase > 0 ? (drawdownAbs / drawdownBase) * 100 : 0;
  const drawdownScore = Math.round(Math.min(30, drawdownPct * 3));

  // ── Composite ─────────────────────────────────────────────────────────────
  const score = Math.min(100, concentrationScore + urgencyScore + drawdownScore);
  const label = score <= 33 ? "Healthy" : score <= 66 ? "Moderate" : "Elevated";

  res.json({
    score,
    label,
    concentration: {
      score: concentrationScore,
      hhi: Math.round(hhi * 1000) / 1000,
      topPositionPct,
      positionCount: positions.length,
    },
    urgency: {
      score: urgencyScore,
      within7Days,
      urgentValuePct: Math.round(urgentPct * 1000) / 10,
    },
    drawdown: {
      score: drawdownScore,
      currentDrawdownPct: Math.round(drawdownPct * 10) / 10,
      peakCumulative: Math.round(peakCumulative * 100) / 100,
      currentCumulative: Math.round(currentCumulative * 100) / 100,
    },
  });
});

export default router;
