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
}

function generatePriceHistory(currentPrice: number, days: number, seed: number): number[] {
  const prices: number[] = [];
  const targetPrice = currentPrice;
  const startPrice = Math.max(0.05, Math.min(0.95, targetPrice - 0.2 + seededRandom(seed, 0) * 0.4));
  let price = startPrice;

  for (let i = 0; i < days; i++) {
    const progress = i / Math.max(1, days - 1);
    const drift = (targetPrice - startPrice) * progress * 0.3;
    const noise = (seededRandom(seed, i + 1) - 0.5) * 0.06;
    price = Math.max(0.02, Math.min(0.98, price + drift / days + noise));
    prices.push(parseFloat(price.toFixed(4)));
  }

  if (prices.length > 0) {
    prices[prices.length - 1] = parseFloat(currentPrice.toFixed(4));
  }

  return prices;
}

function seededRandom(seed: number, i: number): number {
  const x = Math.sin(seed + i) * 10000;
  return x - Math.floor(x);
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 1;

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  if (denom === 0) return 1;

  return parseFloat((num / denom).toFixed(4));
}

router.get("/watchlist/correlation", async (req, res) => {
  const days = Math.min(90, Math.max(7, parseInt(String(req.query.days ?? "30"), 10) || 30));

  const rows = db
    .prepare(
      "SELECT market_id, market_question, category, yes_price FROM market_watchlist ORDER BY added_at DESC"
    )
    .all() as WatchlistRow[];

  if (rows.length === 0) {
    res.json({ markets: [], matrix: [], days });
    return;
  }

  let liveMarkets: Array<{ id: string; yesPrice: number }> = [];
  try {
    liveMarkets = (await getCachedMarkets()).map((m) => ({ id: m.id, yesPrice: m.yesPrice }));
  } catch {
    liveMarkets = FAKE_MARKETS.map((m) => ({ id: m.id, yesPrice: m.yesPrice }));
  }

  const markets = rows.map((row) => {
    const live = liveMarkets.find((m) => m.id === row.market_id);
    const yesPrice = live?.yesPrice ?? row.yes_price;
    return {
      marketId: row.market_id,
      question: row.market_question,
      yesPrice,
      category: row.category,
    };
  });

  const priceHistories = markets.map((m) => {
    const seed = Math.floor(m.yesPrice * 1000) + m.marketId.charCodeAt(0);
    return generatePriceHistory(m.yesPrice, days, seed);
  });

  const n = markets.length;
  const matrix: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (i === j) return 1;
      if (i > j) return 0;
      return pearsonCorrelation(priceHistories[i], priceHistories[j]);
    })
  );

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      matrix[i][j] = matrix[j][i];
    }
  }

  res.json({ markets, matrix, days });
});

export default router;
