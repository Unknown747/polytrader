import { Router, type IRouter } from "express";
import systemRouter from "./system";
import marketsRouter from "./markets";
import portfolioRouter from "./portfolio";
import notificationsRouter from "./notifications";
import tradingRouter from "./trading";

const router: IRouter = Router();

router.use(systemRouter);
router.use(marketsRouter);
router.use(portfolioRouter);
router.use(notificationsRouter);
router.use(tradingRouter);

export default router;
