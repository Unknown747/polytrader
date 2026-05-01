import { Router, type IRouter } from "express";
import { GetWalletStatusResponse } from "@workspace/api-zod";
import { isTelegramConfigured } from "../services/telegram";

const router: IRouter = Router();

router.get("/wallet/status", (_req, res) => {
  const hasPrivateKey = Boolean(process.env.POLYMARKET_PRIVATE_KEY);
  const hasApiCreds = Boolean(
    process.env.POLYMARKET_API_KEY &&
    process.env.POLYMARKET_API_SECRET &&
    process.env.POLYMARKET_API_PASSPHRASE
  );

  const status = {
    connected: hasPrivateKey,
    address: hasPrivateKey ? "0x••••••••••••••••••••••••••••••••••••••••" : null,
    usdcBalance: 0,
    hasApiCredentials: hasApiCreds,
    network: "Polygon Mainnet",
    dataSource: hasPrivateKey ? ("live" as const) : ("demo" as const),
    telegramConfigured: isTelegramConfigured(),
  };

  res.json(GetWalletStatusResponse.parse(status));
});

export default router;
