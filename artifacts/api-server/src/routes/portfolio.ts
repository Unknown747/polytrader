import { Router, type IRouter } from "express";
import {
  GetPortfolioSummaryResponse,
  GetPortfolioPnlResponse,
} from "@workspace/api-zod";
import { portfolioState } from "../lib/state";
import {
  isClobConfigured,
  getFilledTrades,
  getLivePositions,
  computeLivePnlHistory,
  getUsdcBalance,
} from "../services/clob";

const router: IRouter = Router();

router.get("/portfolio/summary", (_req, res) => {
  res.json(GetPortfolioSummaryResponse.parse(portfolioState.getSummary()));
});

router.get("/portfolio/pnl", (_req, res) => {
  res.json(GetPortfolioPnlResponse.parse(portfolioState.getPnlHistory()));
});

router.get("/portfolio/live", async (_req, res) => {
  if (!isClobConfigured()) {
    res.json({
      available: false,
      reason: "Polymarket CLOB credentials not configured",
      usdcBalance: 0,
      positions: [],
      pnlHistory: [],
      summary: {
        totalValue: 0,
        totalCost: 0,
        totalPnl: 0,
        totalPnlPercent: 0,
        openPositions: 0,
        totalTrades: 0,
        usdcBalance: 0,
      },
    });
    return;
  }

  const [positions, trades, balance] = await Promise.all([
    getLivePositions(),
    getFilledTrades(),
    getUsdcBalance(),
  ]);

  const pnlHistory = await computeLivePnlHistory(trades);

  const totalCost = positions.reduce((s, p) => s + p.cost, 0);
  const totalValue = positions.reduce((s, p) => s + p.value, 0);
  const totalPnl = positions.reduce((s, p) => s + p.pnl, 0);
  const totalPnlPercent = totalCost > 0
    ? Math.round((totalPnl / totalCost) * 10000) / 100
    : 0;

  res.json({
    available: true,
    reason: null,
    usdcBalance: balance,
    positions: positions.map((p) => ({
      tokenId: p.tokenId,
      size: p.size,
      avgPrice: p.avgPrice,
      currentPrice: p.currentPrice,
      value: p.value,
      cost: p.cost,
      pnl: p.pnl,
      pnlPercent: p.pnlPercent,
    })),
    pnlHistory,
    summary: {
      totalValue: Math.round((totalValue + balance) * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      totalPnl: Math.round(totalPnl * 100) / 100,
      totalPnlPercent,
      openPositions: positions.length,
      totalTrades: trades.length,
      usdcBalance: balance,
    },
  });
});

export default router;
