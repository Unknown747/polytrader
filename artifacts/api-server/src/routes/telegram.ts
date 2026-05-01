import { Router, type IRouter } from "express";
import { TestTelegramResponse } from "@workspace/api-zod";
import { sendTestMessage } from "../services/telegram";

const router: IRouter = Router();

router.post("/telegram/test", async (_req, res) => {
  const result = await sendTestMessage();
  res.json(TestTelegramResponse.parse(result));
});

export default router;
