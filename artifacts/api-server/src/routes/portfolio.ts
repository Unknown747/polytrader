import { Router, type IRouter } from "express";
import {
  GetPortfolioSummaryResponse,
  GetPortfolioPnlResponse,
} from "@workspace/api-zod";
import { portfolioState } from "../lib/state";

const router: IRouter = Router();

router.get("/portfolio/summary", (_req, res) => {
  res.json(GetPortfolioSummaryResponse.parse(portfolioState.getSummary()));
});

router.get("/portfolio/pnl", (_req, res) => {
  res.json(GetPortfolioPnlResponse.parse(portfolioState.getPnlHistory()));
});

export default router;
