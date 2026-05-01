import { Router, type IRouter } from "express";
import { ListPositionsResponse } from "@workspace/api-zod";
import { portfolioState } from "../lib/state";

const router: IRouter = Router();

router.get("/positions", (_req, res) => {
  res.json(ListPositionsResponse.parse(portfolioState.getPositions()));
});

export default router;
