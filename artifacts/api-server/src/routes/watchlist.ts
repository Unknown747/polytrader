import { Router, type IRouter } from "express";
import db from "../lib/db";
import { getCachedMarkets } from "../services/polymarket";
import { FAKE_MARKETS } from "./markets";

const router: IRouter = Router();

interface WatchlistRow {
  market_id: string;
  market_question: string;
  category: string;
  yes_price: number;
  no_price: number;
  volume24h: number;
  added_at: string;
}

router.get("/watchlist", (_req, res) => {
  const rows = db.prepare(
    "SELECT market_id, market_question, category, yes_price, no_price, volume24h, added_at FROM market_watchlist ORDER BY added_at DESC"
  ).all() as WatchlistRow[];

  res.json(rows.map((r) => ({
    marketId: r.market_id,
    marketQuestion: r.market_question,
    category: r.category,
    yesPrice: r.yes_price,
    noPrice: r.no_price,
    volume24h: r.volume24h,
    addedAt: r.added_at,
  })));
});

router.post("/watchlist", async (req, res) => {
  const { marketId } = req.body as { marketId?: string };
  if (!marketId || typeof marketId !== "string") {
    res.status(400).json({ error: "marketId required" });
    return;
  }

  let question = "";
  let category = "";
  let yesPrice = 0.5;
  let noPrice = 0.5;
  let volume24h = 0;

  try {
    const live = await getCachedMarkets();
    const found = live.find((m) => m.id === marketId);
    if (found) {
      question = found.question;
      category = found.category;
      yesPrice = found.yesPrice;
      noPrice = found.noPrice;
      volume24h = found.volume24h;
    }
  } catch { /* ignore */ }

  if (!question) {
    const demo = FAKE_MARKETS.find((m) => m.id === marketId);
    if (demo) {
      question = demo.question;
      category = demo.category;
      yesPrice = demo.yesPrice;
      noPrice = demo.noPrice;
      volume24h = demo.volume24h;
    }
  }

  if (!question) {
    question = `Market ${marketId}`;
  }

  db.prepare(
    `INSERT OR REPLACE INTO market_watchlist (market_id, market_question, category, yes_price, no_price, volume24h, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(marketId, question, category, yesPrice, noPrice, volume24h, new Date().toISOString());

  res.json({ success: true, marketId, marketQuestion: question });
});

router.delete("/watchlist/:marketId", (req, res) => {
  const { marketId } = req.params;
  const result = db.prepare("DELETE FROM market_watchlist WHERE market_id = ?").run(marketId);
  if (result.changes === 0) {
    res.status(404).json({ error: "Market not in watchlist" });
    return;
  }
  res.json({ success: true, marketId });
});

router.get("/watchlist/:marketId", (req, res) => {
  const { marketId } = req.params;
  const row = db.prepare("SELECT market_id FROM market_watchlist WHERE market_id = ?").get(marketId) as { market_id: string } | undefined;
  res.json({ watched: !!row });
});

export default router;
