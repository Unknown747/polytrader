import { Router, type IRouter } from "express";
import { GetWalletStatusResponse } from "@workspace/api-zod";
import { isTelegramConfigured } from "../services/telegram";
import { getUsdcBalance, getWalletAddress, isClobConfigured } from "../services/clob";

const router: IRouter = Router();

router.get("/wallet/status", async (_req, res) => {
  const hasPrivateKey = Boolean(process.env.POLYMARKET_PRIVATE_KEY);
  const hasApiCreds = Boolean(
    process.env.POLYMARKET_API_KEY &&
    process.env.POLYMARKET_API_SECRET &&
    process.env.POLYMARKET_API_PASSPHRASE
  );

  const address = hasPrivateKey ? (getWalletAddress() ?? null) : null;
  const maskedAddress = address
    ? address.slice(0, 6) + "••••••••••••••••••••••••••••••••" + address.slice(-4)
    : null;

  let usdcBalance = 0;
  if (isClobConfigured()) {
    usdcBalance = await getUsdcBalance();
  }

  const status = {
    connected: hasPrivateKey,
    address: maskedAddress,
    usdcBalance,
    hasApiCredentials: hasApiCreds,
    network: "Polygon Mainnet",
    dataSource: hasPrivateKey ? ("live" as const) : ("demo" as const),
    telegramConfigured: isTelegramConfigured(),
  };

  res.json(GetWalletStatusResponse.parse(status));
});

export default router;
