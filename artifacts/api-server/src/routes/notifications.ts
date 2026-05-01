import { Router, type IRouter } from "express";
import { TestTelegramResponse } from "@workspace/api-zod";
import { sendTestMessage } from "../services/telegram";
import { getCachedMarkets } from "../services/polymarket";
import { FAKE_MARKETS } from "./markets";
import db from "../lib/db";

const router: IRouter = Router();

interface AlertRow {
  id: number;
  market_id: string;
  market_question: string;
  side: string;
  direction: string;
  target_price: number;
  triggered: number;
  triggered_at: string | null;
  created_at: string;
}

interface WatchlistRow {
  market_id: string;
  market_question: string;
  category: string;
  yes_price: number;
  no_price: number;
  volume24h: number;
  added_at: string;
}

router.post("/telegram/test", async (_req, res) => {
  const result = await sendTestMessage();
  res.json(TestTelegramResponse.parse(result));
});

router.get("/alerts", (req, res) => {
  const includeTriggered = req.query.triggered === "true";
  const rows = db.prepare(
    `SELECT id, market_id, market_question, side, direction, target_price, triggered, triggered_at, created_at
     FROM price_alerts WHERE triggered = ${includeTriggered ? "1 OR triggered = 0" : "0"}
     ORDER BY created_at DESC`
  ).all() as AlertRow[];
  res.json(rows.map((r) => ({
    id: r.id, marketId: r.market_id, marketQuestion: r.market_question, side: r.side,
    direction: r.direction, targetPrice: r.target_price, triggered: r.triggered === 1,
    triggeredAt: r.triggered_at, createdAt: r.created_at,
  })));
});

router.post("/alerts", (req, res) => {
  const { marketId, marketQuestion, side, direction, targetPrice } = req.body as { marketId?: string; marketQuestion?: string; side?: string; direction?: string; targetPrice?: number };
  if (!marketId || !side || !direction || targetPrice === undefined) {
    res.status(400).json({ error: "marketId, side, direction, targetPrice required" }); return;
  }
  if (!["YES", "NO"].includes(side)) { res.status(400).json({ error: "side must be YES or NO" }); return; }
  if (!["above", "below"].includes(direction)) { res.status(400).json({ error: "direction must be above or below" }); return; }
  if (typeof targetPrice !== "number" || targetPrice <= 0 || targetPrice >= 1) {
    res.status(400).json({ error: "targetPrice must be between 0 and 1" }); return;
  }
  const result = db.prepare(
    "INSERT INTO price_alerts (market_id, market_question, side, direction, target_price, triggered, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)"
  ).run(marketId, marketQuestion ?? `Market ${marketId}`, side, direction, targetPrice, new Date().toISOString());
  res.json({ success: true, id: result.lastInsertRowid });
});

router.delete("/alerts/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid alert ID" }); return; }
  const result = db.prepare("DELETE FROM price_alerts WHERE id = ?").run(id);
  if (result.changes === 0) { res.status(404).json({ error: "Alert not found" }); return; }
  res.json({ success: true });
});

router.get("/watchlist", (_req, res) => {
  const rows = db.prepare(
    "SELECT market_id, market_question, category, yes_price, no_price, volume24h, added_at FROM market_watchlist ORDER BY added_at DESC"
  ).all() as WatchlistRow[];
  res.json(rows.map((r) => ({
    marketId: r.market_id, marketQuestion: r.market_question, category: r.category,
    yesPrice: r.yes_price, noPrice: r.no_price, volume24h: r.volume24h, addedAt: r.added_at,
  })));
});

router.post("/watchlist", async (req, res) => {
  const { marketId } = req.body as { marketId?: string };
  if (!marketId || typeof marketId !== "string") { res.status(400).json({ error: "marketId required" }); return; }
  let question = "", category = "", yesPrice = 0.5, noPrice = 0.5, volume24h = 0;
  try {
    const live = await getCachedMarkets();
    const found = live.find((m) => m.id === marketId);
    if (found) { question = found.question; category = found.category; yesPrice = found.yesPrice; noPrice = found.noPrice; volume24h = found.volume24h; }
  } catch { }
  if (!question) {
    const demo = FAKE_MARKETS.find((m) => m.id === marketId);
    if (demo) { question = demo.question; category = demo.category; yesPrice = demo.yesPrice; noPrice = demo.noPrice; volume24h = demo.volume24h; }
  }
  if (!question) question = `Market ${marketId}`;
  db.prepare(
    "INSERT OR REPLACE INTO market_watchlist (market_id, market_question, category, yes_price, no_price, volume24h, added_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(marketId, question, category, yesPrice, noPrice, volume24h, new Date().toISOString());
  res.json({ success: true, marketId, marketQuestion: question });
});

router.delete("/watchlist/:marketId", (req, res) => {
  const { marketId } = req.params;
  const result = db.prepare("DELETE FROM market_watchlist WHERE market_id = ?").run(marketId);
  if (result.changes === 0) { res.status(404).json({ error: "Market not in watchlist" }); return; }
  res.json({ success: true, marketId });
});

router.get("/watchlist/:marketId", (req, res) => {
  const { marketId } = req.params;
  const row = db.prepare("SELECT market_id FROM market_watchlist WHERE market_id = ?").get(marketId) as { market_id: string } | undefined;
  res.json({ watched: !!row });
});

export default router;
