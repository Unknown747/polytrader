import { Router, type IRouter } from "express";
import { ListPositionsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

export const FAKE_POSITIONS = [
  {
    id: "pos-001",
    marketId: "mkt-001",
    marketQuestion: "Will the US Federal Reserve cut rates in Q3 2025?",
    side: "YES" as const,
    shares: 250,
    avgPrice: 0.55,
    currentPrice: 0.62,
    pnl: 17.5,
    pnlPercent: 12.73,
    value: 155.0,
  },
  {
    id: "pos-002",
    marketId: "mkt-002",
    marketQuestion: "Will Bitcoin reach $150,000 before end of 2025?",
    side: "YES" as const,
    shares: 500,
    avgPrice: 0.38,
    currentPrice: 0.41,
    pnl: 15.0,
    pnlPercent: 7.89,
    value: 205.0,
  },
  {
    id: "pos-003",
    marketId: "mkt-005",
    marketQuestion: "Will OpenAI release GPT-5 before October 2025?",
    side: "YES" as const,
    shares: 300,
    avgPrice: 0.68,
    currentPrice: 0.73,
    pnl: 15.0,
    pnlPercent: 7.35,
    value: 219.0,
  },
  {
    id: "pos-004",
    marketId: "mkt-007",
    marketQuestion: "Will US inflation (CPI) fall below 2% in 2025?",
    side: "NO" as const,
    shares: 400,
    avgPrice: 0.69,
    currentPrice: 0.71,
    pnl: 8.0,
    pnlPercent: 2.9,
    value: 284.0,
  },
  {
    id: "pos-005",
    marketId: "mkt-010",
    marketQuestion: "Will Apple release a foldable iPhone in 2025?",
    side: "NO" as const,
    shares: 150,
    avgPrice: 0.84,
    currentPrice: 0.81,
    pnl: -4.5,
    pnlPercent: -3.57,
    value: 121.5,
  },
];

router.get("/positions", (_req, res) => {
  res.json(ListPositionsResponse.parse(FAKE_POSITIONS));
});

export default router;
