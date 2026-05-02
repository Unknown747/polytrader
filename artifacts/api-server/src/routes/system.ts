import { Router, type IRouter } from "express";
import { HealthCheckResponse, GetWalletStatusResponse } from "@workspace/api-zod";
import { isTelegramConfigured } from "../services/telegram";
import { isClobConfigured, getUsdcBalance, getWalletAddress } from "../services/clob";
import { seedDemoData } from "../services/telegramBot";
import db from "../lib/db";
import { logger } from "../lib/db";
import { getNetworkMode, setNetworkMode } from "../lib/networkMode";

const router: IRouter = Router();

const ALLOWED_KEYS = new Set([
  "POLYMARKET_PRIVATE_KEY",
  "POLYMARKET_API_KEY",
  "POLYMARKET_API_SECRET",
  "POLYMARKET_API_PASSPHRASE",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
]);

router.get("/healthz", (_req, res) => {
  res.json(HealthCheckResponse.parse({ status: "ok" }));
});

router.get("/wallet/status", async (_req, res) => {
  const hasPrivateKey = Boolean(process.env.POLYMARKET_PRIVATE_KEY || db.prepare("SELECT value FROM app_credentials WHERE key = ?").get("POLYMARKET_PRIVATE_KEY"));
  const hasApiCreds = Boolean(
    (process.env.POLYMARKET_API_KEY || db.prepare("SELECT value FROM app_credentials WHERE key = ?").get("POLYMARKET_API_KEY")) &&
    (process.env.POLYMARKET_API_SECRET || db.prepare("SELECT value FROM app_credentials WHERE key = ?").get("POLYMARKET_API_SECRET")) &&
    (process.env.POLYMARKET_API_PASSPHRASE || db.prepare("SELECT value FROM app_credentials WHERE key = ?").get("POLYMARKET_API_PASSPHRASE"))
  );
  const address = hasPrivateKey ? (getWalletAddress() ?? null) : null;
  const maskedAddress = address
    ? address.slice(0, 6) + "••••••••••••••••••••••••••••••••" + address.slice(-4)
    : null;
  const networkMode = getNetworkMode();
  let usdcBalance = 0;
  if (isClobConfigured() && networkMode === "mainnet") usdcBalance = await getUsdcBalance();
  const networkLabel = networkMode === "testnet" ? "Polygon Amoy (Testnet)" : "Polygon Mainnet";
  res.json({
    ...GetWalletStatusResponse.parse({
      connected: hasPrivateKey,
      address: maskedAddress,
      usdcBalance,
      hasApiCredentials: hasApiCreds,
      network: networkLabel,
      dataSource: hasPrivateKey && networkMode === "mainnet" ? ("live" as const) : ("demo" as const),
      telegramConfigured: isTelegramConfigured(),
    }),
    networkMode,
  });
});

router.get("/network/mode", (_req, res) => {
  res.json({ mode: getNetworkMode() });
});

router.post("/network/mode", (req, res) => {
  const { mode } = req.body as { mode?: string };
  if (mode !== "mainnet" && mode !== "testnet") {
    res.status(400).json({ success: false, error: "mode must be 'mainnet' or 'testnet'" });
    return;
  }
  setNetworkMode(mode);
  logger.info({ mode }, "Network mode updated");
  res.json({ success: true, mode });
});

router.post("/demo/reset", (_req, res) => {
  try {
    const counts = seedDemoData();
    res.json({ success: true, message: "Demo data reset successfully", counts });
  } catch (e) {
    res.status(500).json({ success: false, message: String(e) });
  }
});

router.post("/credentials", (req, res) => {
  const { key, value } = req.body as { key?: string; value?: string };
  if (!key || !ALLOWED_KEYS.has(key)) {
    res.status(400).json({ success: false, error: "Invalid or disallowed credential key" });
    return;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    res.status(400).json({ success: false, error: "Value must be a non-empty string" });
    return;
  }
  try {
    db.prepare("INSERT OR REPLACE INTO app_credentials (key, value) VALUES (?, ?)").run(key, value.trim());
    logger.info({ key }, "Credential saved via wizard");
    res.json({ success: true, key });
  } catch (err) {
    logger.error({ err, key }, "Failed to save credential");
    res.status(500).json({ success: false, error: "Database error" });
  }
});

export default router;
