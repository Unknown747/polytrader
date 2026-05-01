import { Router, type IRouter } from "express";
import healthRouter from "./health";
import marketsRouter from "./markets";
import positionsRouter from "./positions";
import ordersRouter from "./orders";
import portfolioRouter from "./portfolio";
import strategyRouter from "./strategy";
import walletRouter from "./wallet";
import telegramRouter from "./telegram";

const router: IRouter = Router();

router.use(healthRouter);
router.use(marketsRouter);
router.use(positionsRouter);
router.use(ordersRouter);
router.use(portfolioRouter);
router.use(strategyRouter);
router.use(walletRouter);
router.use(telegramRouter);

export default router;
