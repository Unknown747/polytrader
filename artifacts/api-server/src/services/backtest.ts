export interface BacktestRequest {
  daysBack: number;
  bankroll: number;
  minProbability: number;
  maxDaysToResolution: number;
  maxPositionPct: number;
}

export interface BacktestTrade {
  date: string;
  question: string;
  side: "YES" | "NO";
  entryPrice: number;
  exitPrice: number;
  amount: number;
  pnl: number;
  pnlPct: number;
  outcome: "win" | "loss";
}

export interface PnlPoint {
  date: string;
  pnl: number;
  cumulative: number;
}

export interface BacktestResult {
  totalReturn: number;
  totalReturnPct: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  trades: BacktestTrade[];
  equityCurve: PnlPoint[];
}

const SAMPLE_MARKETS: Array<{ q: string; cat: string; baseProb: number }> = [
  { q: "Will the Fed cut rates in March 2025?", cat: "Economics", baseProb: 0.78 },
  { q: "Will Bitcoin exceed $100k in Q1 2025?", cat: "Crypto", baseProb: 0.82 },
  { q: "Will NVIDIA earnings beat estimates Q4 2024?", cat: "Stocks", baseProb: 0.85 },
  { q: "Will Trump win the 2024 Presidential Election?", cat: "Politics", baseProb: 0.91 },
  { q: "Will Apple release Vision Pro 2 before Q3 2025?", cat: "Tech", baseProb: 0.76 },
  { q: "Will EU impose new crypto regulations by April 2025?", cat: "Regulation", baseProb: 0.80 },
  { q: "Will Ethereum ETF launch in January 2025?", cat: "Crypto", baseProb: 0.88 },
  { q: "Will the S&P 500 reach 5500 by end of Q1 2025?", cat: "Stocks", baseProb: 0.79 },
  { q: "Will OpenAI announce GPT-5 before March 2025?", cat: "AI", baseProb: 0.83 },
  { q: "Will Argentina inflation fall below 5% in Feb 2025?", cat: "Economics", baseProb: 0.77 },
  { q: "Will Solana surpass $300 before April 2025?", cat: "Crypto", baseProb: 0.81 },
  { q: "Will Super Bowl LIX be won by the NFC?", cat: "Sports", baseProb: 0.52 },
  { q: "Will China GDP growth exceed 5% in 2024?", cat: "Economics", baseProb: 0.84 },
  { q: "Will Meta stock reach $700 before Q2 2025?", cat: "Stocks", baseProb: 0.86 },
  { q: "Will SpaceX Starship complete orbital flight by Q1 2025?", cat: "Science", baseProb: 0.90 },
  { q: "Will RFK Jr endorse Trump before November 2024?", cat: "Politics", baseProb: 0.87 },
  { q: "Will gold hit $2800/oz before end of 2024?", cat: "Commodities", baseProb: 0.80 },
  { q: "Will Japan raise interest rates in Q1 2025?", cat: "Economics", baseProb: 0.83 },
  { q: "Will Ripple win SEC lawsuit by mid-2025?", cat: "Regulation", baseProb: 0.76 },
  { q: "Will Amazon stock exceed $230 before March 2025?", cat: "Stocks", baseProb: 0.88 },
  { q: "Will Palantir join the S&P 500 in 2025?", cat: "Stocks", baseProb: 0.85 },
  { q: "Will the US avoid a recession in 2025?", cat: "Economics", baseProb: 0.82 },
  { q: "Will Elon Musk remain CEO of Tesla through 2025?", cat: "Tech", baseProb: 0.79 },
  { q: "Will inflation in the UK fall below 2% by June 2025?", cat: "Economics", baseProb: 0.77 },
  { q: "Will Dogecoin exceed $1 before mid-2025?", cat: "Crypto", baseProb: 0.81 },
  { q: "Will the Lakers make the NBA playoffs in 2025?", cat: "Sports", baseProb: 0.83 },
  { q: "Will DeepSeek overtake ChatGPT in user share by Q3 2025?", cat: "AI", baseProb: 0.78 },
  { q: "Will the ECB cut rates in June 2025?", cat: "Economics", baseProb: 0.86 },
  { q: "Will Nvidia remain the most valuable company through Q2 2025?", cat: "Stocks", baseProb: 0.80 },
  { q: "Will SpaceX IPO in 2025?", cat: "Tech", baseProb: 0.75 },
];

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function winProbabilityFromPrice(entryPrice: number): number {
  const base = entryPrice;
  const friction = 0.02;
  return Math.max(0.45, Math.min(0.97, base - friction));
}

export function runBacktest(req: BacktestRequest): BacktestResult {
  const seed = Math.round(req.daysBack * 31 + req.minProbability * 997 + req.bankroll * 0.07);
  const rand = rng(seed);

  const trades: BacktestTrade[] = [];
  let equity = req.bankroll;
  let peak = req.bankroll;
  let maxDrawdown = 0;
  const equityCurve: PnlPoint[] = [];

  const now = Date.now();
  const msPerDay = 86400000;

  const avgTradesPerDay = 0.8 + rand() * 0.8;
  const totalTrades = Math.min(
    Math.round(req.daysBack * avgTradesPerDay),
    SAMPLE_MARKETS.length * 3
  );

  const shuffledMarkets = [...SAMPLE_MARKETS].sort(() => rand() - 0.5);

  for (let i = 0; i < totalTrades; i++) {
    const progress = i / totalTrades;
    const daysAgo = req.daysBack * (1 - progress) * (0.9 + rand() * 0.2);
    const date = new Date(now - daysAgo * msPerDay).toISOString().slice(0, 10);

    const mkt = shuffledMarkets[i % shuffledMarkets.length];
    const side: "YES" | "NO" = rand() > 0.3 ? "YES" : "NO";

    const spreadFromBase = (rand() - 0.5) * 0.06;
    const rawProb = mkt.baseProb + spreadFromBase;
    const entryPrice = Math.max(
      req.minProbability,
      Math.min(0.97, Math.round(rawProb * 100) / 100)
    );

    const winProb = winProbabilityFromPrice(entryPrice);
    const isWin = rand() < winProb;

    const exitPrice = isWin ? 1.0 : 0.0;

    const b = (1 - entryPrice) / entryPrice;
    const kellyF = Math.max(0, (entryPrice * b - (1 - entryPrice)) / b) / 2;
    const positionPct = Math.min(kellyF, req.maxPositionPct / 100);
    const amount = Math.max(1, Math.round(equity * positionPct * 100) / 100);
    const shares = amount / entryPrice;
    const pnl = isWin
      ? Math.round((shares * exitPrice - amount) * 100) / 100
      : Math.round(-amount * 100) / 100;
    const pnlPct = amount > 0 ? Math.round((pnl / amount) * 1000) / 10 : 0;

    equity = Math.max(0.01, equity + pnl);
    if (equity > peak) peak = equity;
    const drawdown = peak > 0 ? (peak - equity) / peak : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    trades.push({
      date,
      question: mkt.q,
      side,
      entryPrice,
      exitPrice,
      amount,
      pnl,
      pnlPct,
      outcome: isWin ? "win" : "loss",
    });

    equityCurve.push({
      date,
      pnl,
      cumulative: Math.round((equity - req.bankroll) * 100) / 100,
    });
  }

  trades.sort((a, b) => a.date.localeCompare(b.date));
  equityCurve.sort((a, b) => a.date.localeCompare(b.date));

  const winning = trades.filter((t) => t.outcome === "win");
  const losing = trades.filter((t) => t.outcome === "loss");
  const totalReturn = Math.round((equity - req.bankroll) * 100) / 100;
  const totalReturnPct = Math.round(((equity - req.bankroll) / req.bankroll) * 10000) / 100;
  const returns = trades.map((t) => t.pnl / (t.amount || 1));
  const avgReturn = returns.length > 0 ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
  const variance = returns.length > 1
    ? returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length
    : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0
    ? Math.round((avgReturn / stdDev) * Math.sqrt(252) * 100) / 100
    : 0;

  return {
    totalReturn,
    totalReturnPct,
    winRate: Math.round((winning.length / (trades.length || 1)) * 1000) / 10,
    totalTrades: trades.length,
    winningTrades: winning.length,
    losingTrades: losing.length,
    avgReturn: Math.round(avgReturn * 10000) / 100,
    maxDrawdown: Math.round(maxDrawdown * 10000) / 100,
    sharpeRatio,
    trades,
    equityCurve,
  };
}
