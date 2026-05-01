import { Router, type IRouter } from "express";
import {
  ListMarketsQueryParams,
  ListMarketsResponse,
  GetMarketParams,
  GetMarketResponse,
  GetTrendingMarketsResponse,
} from "@workspace/api-zod";
import { getCachedMarkets, fetchMarketById, normalizeMarket } from "../services/polymarket";
import { logger } from "../lib/db";
import db from "../lib/db";

const router: IRouter = Router();

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString();
}

const FAKE_MARKETS = [
  { id: "mkt-001", question: "Will the Federal Reserve cut rates at the June 2026 FOMC meeting?", category: "Economics", status: "active" as const, yesPrice: 0.83, noPrice: 0.17, volume: 2450000, volume24h: 68000, liquidity: 185000, endDate: daysFromNow(12), resolvedOutcome: null, description: "Resolves YES if the Federal Reserve reduces the federal funds rate target by at least 25bps at the June 2026 FOMC meeting.", conditionId: "", tokenId: "" },
  { id: "mkt-002", question: "Will Bitcoin stay above $90,000 through June 2026?", category: "Crypto", status: "active" as const, yesPrice: 0.86, noPrice: 0.14, volume: 8750000, volume24h: 320000, liquidity: 620000, endDate: daysFromNow(7), resolvedOutcome: null, description: "Resolves YES if Bitcoin remains above $90,000 through the end of June 2026.", conditionId: "", tokenId: "" },
  { id: "mkt-003", question: "Will the 2026 FIFA World Cup group stage be completed without incident?", category: "Sports", status: "active" as const, yesPrice: 0.91, noPrice: 0.09, volume: 320000, volume24h: 9200, liquidity: 45000, endDate: daysFromNow(18), resolvedOutcome: null, description: "Resolves YES if all FIFA World Cup group stage matches complete as scheduled.", conditionId: "", tokenId: "" },
  { id: "mkt-004", question: "Will the 2026 FIFA World Cup be won by Brazil?", category: "Sports", status: "active" as const, yesPrice: 0.17, noPrice: 0.83, volume: 1200000, volume24h: 18000, liquidity: 98000, endDate: daysFromNow(80), resolvedOutcome: null, description: "Resolves YES if Brazil wins the 2026 FIFA World Cup final held in North America.", conditionId: "", tokenId: "" },
  { id: "mkt-005", question: "Will Ethereum ETH price exceed $3,000 by end of May 2026?", category: "Crypto", status: "active" as const, yesPrice: 0.82, noPrice: 0.18, volume: 4100000, volume24h: 145000, liquidity: 310000, endDate: daysFromNow(14), resolvedOutcome: null, description: "Resolves YES if Ethereum (ETH) closing price exceeds $3,000 on any major exchange before June 1, 2026.", conditionId: "", tokenId: "" },
  { id: "mkt-006", question: "Will US GDP growth remain positive in Q1 2026?", category: "Economics", status: "active" as const, yesPrice: 0.88, noPrice: 0.12, volume: 3200000, volume24h: 52000, liquidity: 240000, endDate: daysFromNow(9), resolvedOutcome: null, description: "Resolves YES if the US Bureau of Economic Analysis reports positive GDP growth for Q1 2026.", conditionId: "", tokenId: "" },
  { id: "mkt-007", question: "Will US unemployment remain below 5% through June 2026?", category: "Economics", status: "active" as const, yesPrice: 0.79, noPrice: 0.21, volume: 980000, volume24h: 24000, liquidity: 72000, endDate: daysFromNow(16), resolvedOutcome: null, description: "Resolves YES if the US Bureau of Labor Statistics reports unemployment below 5% through June 2026.", conditionId: "", tokenId: "" },
  { id: "mkt-008", question: "Will Solana (SOL) price exceed $200 by June 2026?", category: "Crypto", status: "active" as const, yesPrice: 0.84, noPrice: 0.16, volume: 5600000, volume24h: 95000, liquidity: 420000, endDate: daysFromNow(5), resolvedOutcome: null, description: "Resolves YES if Solana (SOL) closing price exceeds $200 on any major exchange before June 1, 2026.", conditionId: "", tokenId: "" },
  { id: "mkt-009", question: "Will Apple stock exceed $240 by end of May 2026?", category: "Stocks", status: "active" as const, yesPrice: 0.81, noPrice: 0.19, volume: 2100000, volume24h: 38000, liquidity: 160000, endDate: daysFromNow(10), resolvedOutcome: null, description: "Resolves YES if Apple (AAPL) closing price exceeds $240 before June 1, 2026.", conditionId: "", tokenId: "" },
  { id: "mkt-010", question: "Will the S&P 500 close above 5,800 in May 2026?", category: "Stocks", status: "active" as const, yesPrice: 0.76, noPrice: 0.24, volume: 870000, volume24h: 41000, liquidity: 65000, endDate: daysFromNow(20), resolvedOutcome: null, description: "Resolves YES if the S&P 500 index closes above 5,800 points at any point in May 2026.", conditionId: "", tokenId: "" },
  { id: "mkt-011", question: "Will the US impose new tariffs on Chinese goods in Q2 2026?", category: "Economics", status: "active" as const, yesPrice: 0.92, noPrice: 0.08, volume: 1800000, volume24h: 67000, liquidity: 130000, endDate: daysFromNow(6), resolvedOutcome: null, description: "Resolves YES if the US government announces new tariffs on Chinese goods in Q2 2026.", conditionId: "", tokenId: "" },
  { id: "mkt-012", question: "Will the ECB cut interest rates before July 2026?", category: "Economics", status: "active" as const, yesPrice: 0.77, noPrice: 0.23, volume: 2300000, volume24h: 44000, liquidity: 175000, endDate: daysFromNow(19), resolvedOutcome: null, description: "Resolves YES if the European Central Bank announces a rate cut before July 2026.", conditionId: "", tokenId: "" },
];

async function getMarkets() {
  try {
    const markets = await getCachedMarkets();
    if (markets.length > 0) return { markets, source: "live" as const };
  } catch (e) {
    logger.warn({ err: e }, "Gamma API unavailable, using demo data");
  }
  return { markets: FAKE_MARKETS, source: "demo" as const };
}

router.get("/markets", async (req, res) => {
  const query = ListMarketsQueryParams.parse(req.query);
  const { markets } = await getMarkets();
  let result = [...markets];
  if (query.category) result = result.filter((m) => m.category.toLowerCase() === query.category!.toLowerCase());
  if (query.status && query.status !== "all") result = result.filter((m) => m.status === query.status);
  if (query.search) {
    const search = query.search.toLowerCase();
    result = result.filter((m) => m.question.toLowerCase().includes(search) || m.category.toLowerCase().includes(search));
  }
  res.json(ListMarketsResponse.parse(result));
});

router.get("/markets/trending", async (_req, res) => {
  const { markets } = await getMarkets();
  const trending = [...markets].filter((m) => m.status === "active").sort((a, b) => b.volume24h - a.volume24h).slice(0, 5);
  res.json(GetTrendingMarketsResponse.parse(trending));
});

router.get("/markets/:marketId", async (req, res) => {
  const { marketId } = GetMarketParams.parse(req.params);
  try {
    const raw = await fetchMarketById(marketId);
    if (raw) { res.json(GetMarketResponse.parse(normalizeMarket(raw))); return; }
  } catch { }
  const { markets } = await getMarkets();
  const market = markets.find((m) => m.id === marketId);
  if (!market) { res.status(404).json({ error: "Market not found" }); return; }
  res.json(GetMarketResponse.parse(market));
});

function seededRandom(seed: number, i: number): number {
  const x = Math.sin(seed + i) * 10000;
  return x - Math.floor(x);
}

router.get("/markets/:marketId/history", async (req, res) => {
  const { marketId } = req.params;
  const days = Math.min(90, Math.max(7, parseInt(String(req.query.days ?? "30"), 10) || 30));
  let yesPrice = 0.5;
  try {
    const live = await getCachedMarkets();
    const found = live.find((m) => m.id === marketId);
    if (found) { yesPrice = found.yesPrice; } else { const demo = FAKE_MARKETS.find((m) => m.id === marketId); if (demo) yesPrice = demo.yesPrice; }
  } catch { const demo = FAKE_MARKETS.find((m) => m.id === marketId); if (demo) yesPrice = demo.yesPrice; }
  const seed = Math.floor(yesPrice * 1000);
  const result: Array<{ date: string; yesPrice: number; noPrice: number }> = [];
  const startDate = new Date(); startDate.setDate(startDate.getDate() - days);
  const startPrice = Math.max(0.05, Math.min(0.95, yesPrice - 0.2 + seededRandom(seed, 0) * 0.4));
  let price = startPrice;
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate); d.setDate(d.getDate() + i);
    const progress = i / (days - 1);
    const drift = (yesPrice - startPrice) * progress * 0.3;
    const noise = (seededRandom(seed, i + 1) - 0.5) * 0.06;
    price = Math.max(0.02, Math.min(0.98, price + drift / days + noise));
    result.push({ date: d.toISOString().slice(0, 10), yesPrice: parseFloat(price.toFixed(3)), noPrice: parseFloat((1 - price).toFixed(3)) });
  }
  if (result.length > 0) { result[result.length - 1].yesPrice = parseFloat(yesPrice.toFixed(3)); result[result.length - 1].noPrice = parseFloat((1 - yesPrice).toFixed(3)); }
  res.json({ marketId, days, history: result });
});

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 1;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, denomX = 0, denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX, dy = ys[i] - meanY;
    num += dx * dy; denomX += dx * dx; denomY += dy * dy;
  }
  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? 1 : parseFloat((num / denom).toFixed(4));
}

router.get("/watchlist/correlation", async (req, res) => {
  const days = Math.min(90, Math.max(7, parseInt(String(req.query.days ?? "30"), 10) || 30));
  interface WlRow { market_id: string; market_question: string; category: string; yes_price: number }
  const rows = db.prepare("SELECT market_id, market_question, category, yes_price FROM market_watchlist ORDER BY added_at DESC").all() as WlRow[];
  if (rows.length === 0) { res.json({ markets: [], matrix: [], days }); return; }
  let liveMarkets: Array<{ id: string; yesPrice: number }> = [];
  try { liveMarkets = (await getCachedMarkets()).map((m) => ({ id: m.id, yesPrice: m.yesPrice })); }
  catch { liveMarkets = FAKE_MARKETS.map((m) => ({ id: m.id, yesPrice: m.yesPrice })); }
  const wlMarkets = rows.map((row) => {
    const live = liveMarkets.find((m) => m.id === row.market_id);
    return { marketId: row.market_id, question: row.market_question, yesPrice: live?.yesPrice ?? row.yes_price, category: row.category };
  });
  const priceHistories = wlMarkets.map((m) => {
    const seed2 = Math.floor(m.yesPrice * 1000) + m.marketId.charCodeAt(0);
    const prices: number[] = [];
    const startPrice2 = Math.max(0.05, Math.min(0.95, m.yesPrice - 0.2 + seededRandom(seed2, 0) * 0.4));
    let price2 = startPrice2;
    for (let i = 0; i < days; i++) {
      const progress = i / Math.max(1, days - 1);
      const drift = (m.yesPrice - startPrice2) * progress * 0.3;
      const noise = (seededRandom(seed2, i + 1) - 0.5) * 0.06;
      price2 = Math.max(0.02, Math.min(0.98, price2 + drift / days + noise));
      prices.push(parseFloat(price2.toFixed(4)));
    }
    if (prices.length > 0) prices[prices.length - 1] = parseFloat(m.yesPrice.toFixed(4));
    return prices;
  });
  const n = wlMarkets.length;
  const matrix: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (i === j) return 1;
      if (i > j) return 0;
      return pearsonCorrelation(priceHistories[i], priceHistories[j]);
    })
  );
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) matrix[i][j] = matrix[j][i];
  res.json({ markets: wlMarkets, matrix, days });
});

export default router;
export { FAKE_MARKETS };
