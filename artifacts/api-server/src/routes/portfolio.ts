import { Router, type IRouter } from "express";
import {
  GetPortfolioSummaryResponse,
  GetPortfolioPnlResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const PORTFOLIO_SUMMARY = {
  totalValue: 1034.5,
  availableBalance: 250.0,
  investedAmount: 784.5,
  totalPnl: 51.0,
  totalPnlPercent: 6.5,
  openPositions: 5,
  totalTrades: 6,
  winRate: 80.0,
};

const PNL_HISTORY = [
  { date: "2025-04-01", pnl: 0, cumulative: 0 },
  { date: "2025-04-05", pnl: 5.2, cumulative: 5.2 },
  { date: "2025-04-10", pnl: 12.5, cumulative: 17.7 },
  { date: "2025-04-12", pnl: -3.1, cumulative: 14.6 },
  { date: "2025-04-15", pnl: 8.0, cumulative: 22.6 },
  { date: "2025-04-17", pnl: 6.4, cumulative: 29.0 },
  { date: "2025-04-20", pnl: 11.0, cumulative: 40.0 },
  { date: "2025-04-22", pnl: -5.5, cumulative: 34.5 },
  { date: "2025-04-24", pnl: 4.0, cumulative: 38.5 },
  { date: "2025-04-25", pnl: 7.5, cumulative: 46.0 },
  { date: "2025-04-28", pnl: -3.0, cumulative: 43.0 },
  { date: "2025-04-30", pnl: 8.0, cumulative: 51.0 },
];

router.get("/portfolio/summary", (_req, res) => {
  res.json(GetPortfolioSummaryResponse.parse(PORTFOLIO_SUMMARY));
});

router.get("/portfolio/pnl", (_req, res) => {
  res.json(GetPortfolioPnlResponse.parse(PNL_HISTORY));
});

export default router;
