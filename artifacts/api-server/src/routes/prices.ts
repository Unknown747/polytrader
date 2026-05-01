import { Router } from "express";
import { getCachedMarkets } from "../services/polymarket";
import db from "../lib/db";
import { logger } from "../lib/logger";

const router = Router();

router.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const pushPrices = async () => {
    try {
      const markets = await getCachedMarkets();

      interface WatchlistRow { market_id: string }
      const watchlisted = db
        .prepare("SELECT market_id FROM watchlist")
        .all() as WatchlistRow[];

      const watchedIds = new Set(watchlisted.map((r) => r.market_id));

      const prices: Array<{ marketId: string; question: string; yesPrice: number; noPrice: number }> = [];

      for (const m of markets) {
        if (watchedIds.size === 0 || watchedIds.has(m.id)) {
          prices.push({
            marketId: m.id,
            question: m.question,
            yesPrice: m.yesPrice,
            noPrice: m.noPrice,
          });
        }
      }

      send({ type: "prices", timestamp: new Date().toISOString(), data: prices });
    } catch (err) {
      logger.warn({ err }, "SSE price push failed");
      send({ type: "error", message: "Failed to fetch prices" });
    }
  };

  void pushPrices();
  const interval = setInterval(() => void pushPrices(), 15000);

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 30000);

  req.on("close", () => {
    clearInterval(interval);
    clearInterval(heartbeat);
    logger.info("SSE client disconnected from /prices/stream");
  });
});

export default router;
