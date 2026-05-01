import { Router, type IRouter } from "express";
import {
  ListMarketsQueryParams,
  ListMarketsResponse,
  GetMarketParams,
  GetMarketResponse,
  GetTrendingMarketsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const FAKE_MARKETS = [
  {
    id: "mkt-001",
    question: "Will the US Federal Reserve cut rates in Q3 2025?",
    category: "Economics",
    status: "active",
    yesPrice: 0.62,
    noPrice: 0.38,
    volume: 2450000,
    liquidity: 185000,
    endDate: new Date("2025-09-30T23:59:59Z"),
    resolvedOutcome: null,
    description:
      "This market resolves YES if the Federal Reserve reduces the federal funds rate target by at least 25bps at any FOMC meeting during Q3 2025 (July, September).",
  },
  {
    id: "mkt-002",
    question: "Will Bitcoin reach $150,000 before end of 2025?",
    category: "Crypto",
    status: "active",
    yesPrice: 0.41,
    noPrice: 0.59,
    volume: 8750000,
    liquidity: 620000,
    endDate: new Date("2025-12-31T23:59:59Z"),
    resolvedOutcome: null,
    description:
      "Resolves YES if Bitcoin's spot price on any major exchange (Coinbase, Binance, Kraken) reaches or exceeds $150,000 USD before December 31, 2025 at 11:59 PM UTC.",
  },
  {
    id: "mkt-003",
    question: "Will SpaceX land humans on Mars before 2030?",
    category: "Science",
    status: "active",
    yesPrice: 0.08,
    noPrice: 0.92,
    volume: 320000,
    liquidity: 45000,
    endDate: new Date("2029-12-31T23:59:59Z"),
    resolvedOutcome: null,
    description:
      "Resolves YES if SpaceX successfully lands at least one human crew member on the surface of Mars before January 1, 2030.",
  },
  {
    id: "mkt-004",
    question: "Will the 2026 FIFA World Cup be won by Brazil?",
    category: "Sports",
    status: "active",
    yesPrice: 0.17,
    noPrice: 0.83,
    volume: 1200000,
    liquidity: 98000,
    endDate: new Date("2026-07-20T23:59:59Z"),
    resolvedOutcome: null,
    description:
      "Resolves YES if Brazil wins the 2026 FIFA World Cup final held in North America.",
  },
  {
    id: "mkt-005",
    question: "Will OpenAI release GPT-5 before October 2025?",
    category: "AI",
    status: "active",
    yesPrice: 0.73,
    noPrice: 0.27,
    volume: 4100000,
    liquidity: 310000,
    endDate: new Date("2025-09-30T23:59:59Z"),
    resolvedOutcome: null,
    description:
      "Resolves YES if OpenAI publicly releases a model officially branded as GPT-5 (not a preview or API-only release) before October 1, 2025.",
  },
  {
    id: "mkt-006",
    question: "Will Ethereum ETF inflows exceed $5B in 2025?",
    category: "Crypto",
    status: "active",
    yesPrice: 0.55,
    noPrice: 0.45,
    volume: 3200000,
    liquidity: 240000,
    endDate: new Date("2025-12-31T23:59:59Z"),
    resolvedOutcome: null,
    description:
      "Resolves YES if cumulative net inflows into US spot Ethereum ETFs exceed $5 billion by end of 2025.",
  },
  {
    id: "mkt-007",
    question: "Will US inflation (CPI) fall below 2% in 2025?",
    category: "Economics",
    status: "active",
    yesPrice: 0.29,
    noPrice: 0.71,
    volume: 980000,
    liquidity: 72000,
    endDate: new Date("2025-12-31T23:59:59Z"),
    resolvedOutcome: null,
    description:
      "Resolves YES if the US Bureau of Labor Statistics reports a year-over-year CPI reading below 2.0% at any point in 2025.",
  },
  {
    id: "mkt-008",
    question: "Will Donald Trump be impeached in his second term?",
    category: "Politics",
    status: "active",
    yesPrice: 0.11,
    noPrice: 0.89,
    volume: 5600000,
    liquidity: 420000,
    endDate: new Date("2029-01-20T23:59:59Z"),
    resolvedOutcome: null,
    description:
      "Resolves YES if the US House of Representatives passes articles of impeachment against President Trump during his second term (January 2025 - January 2029).",
  },
  {
    id: "mkt-009",
    question: "Will Nvidia stock exceed $200 by end of Q2 2025?",
    category: "Stocks",
    status: "resolved",
    yesPrice: 1.0,
    noPrice: 0.0,
    volume: 2100000,
    liquidity: 0,
    endDate: new Date("2025-06-30T23:59:59Z"),
    resolvedOutcome: "YES",
    description:
      "Resolved YES. Nvidia (NVDA) closing price exceeded $200 on June 12, 2025.",
  },
  {
    id: "mkt-010",
    question: "Will Apple release a foldable iPhone in 2025?",
    category: "Tech",
    status: "active",
    yesPrice: 0.19,
    noPrice: 0.81,
    volume: 870000,
    liquidity: 65000,
    endDate: new Date("2025-12-31T23:59:59Z"),
    resolvedOutcome: null,
    description:
      "Resolves YES if Apple officially announces and releases a foldable iPhone model for sale to consumers before January 1, 2026.",
  },
];

router.get("/markets", (req, res) => {
  const query = ListMarketsQueryParams.parse(req.query);
  let markets = [...FAKE_MARKETS];

  if (query.category) {
    markets = markets.filter(
      (m) => m.category.toLowerCase() === query.category!.toLowerCase()
    );
  }

  if (query.status && query.status !== "all") {
    markets = markets.filter((m) => m.status === query.status);
  }

  if (query.search) {
    const search = query.search.toLowerCase();
    markets = markets.filter(
      (m) =>
        m.question.toLowerCase().includes(search) ||
        m.category.toLowerCase().includes(search)
    );
  }

  res.json(ListMarketsResponse.parse(markets));
});

router.get("/markets/trending", (_req, res) => {
  const trending = [...FAKE_MARKETS]
    .filter((m) => m.status === "active")
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5);

  res.json(GetTrendingMarketsResponse.parse(trending));
});

router.get("/markets/:marketId", (req, res) => {
  const { marketId } = GetMarketParams.parse(req.params);
  const market = FAKE_MARKETS.find((m) => m.id === marketId);

  if (!market) {
    res.status(404).json({ error: "Market not found" });
    return;
  }

  res.json(GetMarketResponse.parse(market));
});

export default router;
export { FAKE_MARKETS };
