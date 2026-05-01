import { Router, type IRouter } from "express";
import {
  ListMarketsQueryParams,
  ListMarketsResponse,
  GetMarketParams,
  GetMarketResponse,
  GetTrendingMarketsResponse,
} from "@workspace/api-zod";
import { getCachedMarkets, fetchMarketById, normalizeMarket } from "../services/polymarket";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString();
}

const FAKE_MARKETS = [
  {
    id: "mkt-001",
    question: "Will the Federal Reserve cut rates at the June 2026 FOMC meeting?",
    category: "Economics",
    status: "active" as const,
    yesPrice: 0.83,
    noPrice: 0.17,
    volume: 2450000,
    volume24h: 68000,
    liquidity: 185000,
    endDate: daysFromNow(12),
    resolvedOutcome: null,
    description: "Resolves YES if the Federal Reserve reduces the federal funds rate target by at least 25bps at the June 2026 FOMC meeting.",
    conditionId: "",
    tokenId: "",
  },
  {
    id: "mkt-002",
    question: "Will Bitcoin stay above $90,000 through June 2026?",
    category: "Crypto",
    status: "active" as const,
    yesPrice: 0.86,
    noPrice: 0.14,
    volume: 8750000,
    volume24h: 320000,
    liquidity: 620000,
    endDate: daysFromNow(7),
    resolvedOutcome: null,
    description: "Resolves YES if Bitcoin remains above $90,000 through the end of June 2026.",
    conditionId: "",
    tokenId: "",
  },
  {
    id: "mkt-003",
    question: "Will the 2026 FIFA World Cup group stage be completed without incident?",
    category: "Sports",
    status: "active" as const,
    yesPrice: 0.91,
    noPrice: 0.09,
    volume: 320000,
    volume24h: 9200,
    liquidity: 45000,
    endDate: daysFromNow(18),
    resolvedOutcome: null,
    description: "Resolves YES if all FIFA World Cup group stage matches complete as scheduled.",
    conditionId: "",
    tokenId: "",
  },
  {
    id: "mkt-004",
    question: "Will the 2026 FIFA World Cup be won by Brazil?",
    category: "Sports",
    status: "active" as const,
    yesPrice: 0.17,
    noPrice: 0.83,
    volume: 1200000,
    volume24h: 18000,
    liquidity: 98000,
    endDate: daysFromNow(80),
    resolvedOutcome: null,
    description: "Resolves YES if Brazil wins the 2026 FIFA World Cup final held in North America.",
    conditionId: "",
    tokenId: "",
  },
  {
    id: "mkt-005",
    question: "Will Ethereum ETH price exceed $3,000 by end of May 2026?",
    category: "Crypto",
    status: "active" as const,
    yesPrice: 0.82,
    noPrice: 0.18,
    volume: 4100000,
    volume24h: 145000,
    liquidity: 310000,
    endDate: daysFromNow(14),
    resolvedOutcome: null,
    description: "Resolves YES if Ethereum (ETH) closing price exceeds $3,000 on any major exchange before June 1, 2026.",
    conditionId: "",
    tokenId: "",
  },
  {
    id: "mkt-006",
    question: "Will US GDP growth remain positive in Q1 2026?",
    category: "Economics",
    status: "active" as const,
    yesPrice: 0.88,
    noPrice: 0.12,
    volume: 3200000,
    volume24h: 52000,
    liquidity: 240000,
    endDate: daysFromNow(9),
    resolvedOutcome: null,
    description: "Resolves YES if the US Bureau of Economic Analysis reports positive GDP growth for Q1 2026.",
    conditionId: "",
    tokenId: "",
  },
  {
    id: "mkt-007",
    question: "Will US unemployment remain below 5% through June 2026?",
    category: "Economics",
    status: "active" as const,
    yesPrice: 0.79,
    noPrice: 0.21,
    volume: 980000,
    volume24h: 24000,
    liquidity: 72000,
    endDate: daysFromNow(16),
    resolvedOutcome: null,
    description: "Resolves YES if the US Bureau of Labor Statistics reports unemployment below 5% through June 2026.",
    conditionId: "",
    tokenId: "",
  },
  {
    id: "mkt-008",
    question: "Will Solana (SOL) price exceed $200 by June 2026?",
    category: "Crypto",
    status: "active" as const,
    yesPrice: 0.84,
    noPrice: 0.16,
    volume: 5600000,
    volume24h: 95000,
    liquidity: 420000,
    endDate: daysFromNow(5),
    resolvedOutcome: null,
    description: "Resolves YES if Solana (SOL) closing price exceeds $200 on any major exchange before June 1, 2026.",
    conditionId: "",
    tokenId: "",
  },
  {
    id: "mkt-009",
    question: "Will Apple stock exceed $240 by end of May 2026?",
    category: "Stocks",
    status: "active" as const,
    yesPrice: 0.81,
    noPrice: 0.19,
    volume: 2100000,
    volume24h: 38000,
    liquidity: 160000,
    endDate: daysFromNow(10),
    resolvedOutcome: null,
    description: "Resolves YES if Apple (AAPL) closing price exceeds $240 before June 1, 2026.",
    conditionId: "",
    tokenId: "",
  },
  {
    id: "mkt-010",
    question: "Will the S&P 500 close above 5,800 in May 2026?",
    category: "Stocks",
    status: "active" as const,
    yesPrice: 0.76,
    noPrice: 0.24,
    volume: 870000,
    volume24h: 41000,
    liquidity: 65000,
    endDate: daysFromNow(20),
    resolvedOutcome: null,
    description: "Resolves YES if the S&P 500 index closes above 5,800 points at any point in May 2026.",
    conditionId: "",
    tokenId: "",
  },
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

  if (query.category) {
    result = result.filter(
      (m) => m.category.toLowerCase() === query.category!.toLowerCase()
    );
  }

  if (query.status && query.status !== "all") {
    result = result.filter((m) => m.status === query.status);
  }

  if (query.search) {
    const search = query.search.toLowerCase();
    result = result.filter(
      (m) =>
        m.question.toLowerCase().includes(search) ||
        m.category.toLowerCase().includes(search)
    );
  }

  res.json(ListMarketsResponse.parse(result));
});

router.get("/markets/trending", async (_req, res) => {
  const { markets } = await getMarkets();
  const trending = [...markets]
    .filter((m) => m.status === "active")
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, 5);

  res.json(GetTrendingMarketsResponse.parse(trending));
});

router.get("/markets/:marketId", async (req, res) => {
  const { marketId } = GetMarketParams.parse(req.params);

  try {
    const raw = await fetchMarketById(marketId);
    if (raw) {
      res.json(GetMarketResponse.parse(normalizeMarket(raw)));
      return;
    }
  } catch {
    // fall through to demo data
  }

  const { markets } = await getMarkets();
  const market = markets.find((m) => m.id === marketId);
  if (!market) {
    res.status(404).json({ error: "Market not found" });
    return;
  }

  res.json(GetMarketResponse.parse(market));
});

export default router;
export { FAKE_MARKETS };
