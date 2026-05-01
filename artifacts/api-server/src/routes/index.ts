import { Router, type IRouter } from "express";
import healthRouter from "./health";
import marketsRouter from "./markets";
import positionsRouter from "./positions";
import ordersRouter from "./orders";
import portfolioRouter from "./portfolio";

const router: IRouter = Router();

router.use(healthRouter);
router.use(marketsRouter);
router.use(positionsRouter);
router.use(ordersRouter);
router.use(portfolioRouter);

export default router;
