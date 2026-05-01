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
import { scanOpportunities, getConfig, updateConfig } from "../services/strategy";
import { runBacktest } from "../services/backtest";
import { restartScheduler } from "../services/scheduler";
import { FAKE_MARKETS } from "./markets";

const router: IRouter = Router();

router.get("/strategy/opportunities", async (_req, res) => {
  let markets: Parameters<typeof scanOpportunities>[0];
  let usedLive = false;

  try {
    const live = await getCachedMarkets();
    if (live.length > 0) {
      markets = live;
      usedLive = true;
    } else {
      markets = FAKE_MARKETS as Parameters<typeof scanOpportunities>[0];
    }
  } catch {
    markets = FAKE_MARKETS as Parameters<typeof scanOpportunities>[0];
  }

  let opportunities = scanOpportunities(markets);

  if (usedLive && opportunities.length === 0) {
    opportunities = scanOpportunities(
      FAKE_MARKETS as Parameters<typeof scanOpportunities>[0]
    );
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

export default router;
