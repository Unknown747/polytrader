import { Router, type IRouter } from "express";
import db from "../lib/db";

const router: IRouter = Router();

function escapeCSV(val: unknown): string {
  const str = String(val ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSV(headers: string[], rows: Record<string, unknown>[]): string {
  const lines: string[] = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCSV(row[h])).join(","));
  }
  return lines.join("\n");
}

router.get("/portfolio/export", (req, res) => {
  const type = String(req.query.type ?? "orders");

  if (type === "orders") {
    interface OrderRow {
      id: string; market_id: string; market_question: string; side: string;
      type: string; price: number; amount: number; shares: number; status: string; created_at: string;
    }
    const rows = db.prepare(
      "SELECT id, market_id, market_question, side, type, price, amount, shares, status, created_at FROM portfolio_orders ORDER BY created_at DESC"
    ).all() as OrderRow[];

    const headers = ["id", "market_id", "market_question", "side", "type", "price", "amount", "shares", "status", "created_at"];
    const csv = toCSV(headers, rows as unknown as Record<string, unknown>[]);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=\"orders.csv\"");
    res.send(csv);
    return;
  }

  if (type === "positions") {
    interface PosRow {
      id: string; market_id: string; market_question: string; side: string;
      shares: number; avg_price: number; current_price: number; pnl: number; pnl_percent: number; value: number;
    }
    const rows = db.prepare(
      "SELECT id, market_id, market_question, side, shares, avg_price, current_price, pnl, pnl_percent, value FROM portfolio_positions ORDER BY value DESC"
    ).all() as PosRow[];

    const headers = ["id", "market_id", "market_question", "side", "shares", "avg_price", "current_price", "pnl", "pnl_percent", "value"];
    const csv = toCSV(headers, rows as unknown as Record<string, unknown>[]);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=\"positions.csv\"");
    res.send(csv);
    return;
  }

  if (type === "pnl") {
    interface PnlRow { date: string; pnl: number; cumulative: number }
    const rows = db.prepare(
      "SELECT date, pnl, cumulative FROM portfolio_pnl ORDER BY date ASC"
    ).all() as PnlRow[];

    const headers = ["date", "pnl", "cumulative"];
    const csv = toCSV(headers, rows as unknown as Record<string, unknown>[]);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=\"pnl.csv\"");
    res.send(csv);
    return;
  }

  res.status(400).json({ error: "type must be orders, positions, or pnl" });
});

export default router;
