import { Router, type IRouter } from "express";
import healthRouter from "./health";
import marketsRouter from "./markets";
import marketHistoryRouter from "./marketHistory";
import positionsRouter from "./positions";
import ordersRouter from "./orders";
import portfolioRouter from "./portfolio";
import exportRouter from "./export";
import strategyRouter from "./strategy";
import walletRouter from "./wallet";
import telegramRouter from "./telegram";
import autoTraderRouter from "./autoTrader";
import demoRouter from "./demo";
import watchlistRouter from "./watchlist";
import alertsRouter from "./alerts";
import correlationRouter from "./correlation";

const router: IRouter = Router();

router.use(healthRouter);
router.use(marketsRouter);
router.use(marketHistoryRouter);
router.use(positionsRouter);
router.use(ordersRouter);
router.use(portfolioRouter);
router.use(exportRouter);
router.use(strategyRouter);
router.use(walletRouter);
router.use(telegramRouter);
router.use(autoTraderRouter);
router.use(demoRouter);
router.use(correlationRouter);
router.use(watchlistRouter);
router.use(alertsRouter);

export default router;
