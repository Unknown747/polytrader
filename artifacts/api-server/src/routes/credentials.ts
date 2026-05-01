import { Router } from "express";
import db from "../lib/db";
import { logger } from "../lib/logger";

const router = Router();

const ALLOWED_KEYS = new Set([
  "POLYMARKET_PRIVATE_KEY",
  "POLYMARKET_API_KEY",
  "POLYMARKET_API_SECRET",
  "POLYMARKET_API_PASSPHRASE",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
]);

router.post("/", (req, res) => {
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
    db.prepare(
      "INSERT OR REPLACE INTO app_credentials (key, value) VALUES (?, ?)"
    ).run(key, value.trim());

    logger.info({ key }, "Credential saved via wizard");
    res.json({ success: true, key });
  } catch (err) {
    logger.error({ err, key }, "Failed to save credential");
    res.status(500).json({ success: false, error: "Database error" });
  }
});

export default router;
