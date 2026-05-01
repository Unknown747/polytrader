import { Router, type IRouter } from "express";
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

router.get("/alerts", (req, res) => {
  const includeTriggered = req.query.triggered === "true";
  const rows = db.prepare(
    `SELECT id, market_id, market_question, side, direction, target_price, triggered, triggered_at, created_at
     FROM price_alerts
     WHERE triggered = ${includeTriggered ? "1 OR triggered = 0" : "0"}
     ORDER BY created_at DESC`
  ).all() as AlertRow[];

  res.json(rows.map((r) => ({
    id: r.id,
    marketId: r.market_id,
    marketQuestion: r.market_question,
    side: r.side,
    direction: r.direction,
    targetPrice: r.target_price,
    triggered: r.triggered === 1,
    triggeredAt: r.triggered_at,
    createdAt: r.created_at,
  })));
});

router.post("/alerts", (req, res) => {
  const { marketId, marketQuestion, side, direction, targetPrice } = req.body as {
    marketId?: string;
    marketQuestion?: string;
    side?: string;
    direction?: string;
    targetPrice?: number;
  };

  if (!marketId || !side || !direction || targetPrice === undefined) {
    res.status(400).json({ error: "marketId, side, direction, targetPrice required" });
    return;
  }

  if (!["YES", "NO"].includes(side)) {
    res.status(400).json({ error: "side must be YES or NO" });
    return;
  }

  if (!["above", "below"].includes(direction)) {
    res.status(400).json({ error: "direction must be above or below" });
    return;
  }

  if (typeof targetPrice !== "number" || targetPrice <= 0 || targetPrice >= 1) {
    res.status(400).json({ error: "targetPrice must be between 0 and 1" });
    return;
  }

  const result = db.prepare(
    `INSERT INTO price_alerts (market_id, market_question, side, direction, target_price, triggered, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  ).run(marketId, marketQuestion ?? `Market ${marketId}`, side, direction, targetPrice, new Date().toISOString());

  res.json({ success: true, id: result.lastInsertRowid });
});

router.delete("/alerts/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid alert ID" });
    return;
  }
  const result = db.prepare("DELETE FROM price_alerts WHERE id = ?").run(id);
  if (result.changes === 0) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }
  res.json({ success: true });
});

export default router;
