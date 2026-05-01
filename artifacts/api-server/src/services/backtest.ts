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

const SAMPLE_MARKETS = [
  { q: "Will the Fed cut rates in March 2025?", cat: "Economics" },
  { q: "Will Bitcoin exceed $100k in Q1 2025?", cat: "Crypto" },
  { q: "Will NVIDIA earnings beat estimates Q4 2024?", cat: "Stocks" },
  { q: "Will Trump win the 2024 Presidential Election?", cat: "Politics" },
  { q: "Will Apple release Vision Pro 2 before Q3 2025?", cat: "Tech" },
  { q: "Will EU impose new crypto regulations by April 2025?", cat: "Regulation" },
  { q: "Will Ethereum ETF launch in January 2025?", cat: "Crypto" },
  { q: "Will the S&P 500 reach 5500 by end of Q1 2025?", cat: "Stocks" },
  { q: "Will OpenAI announce GPT-5 before March 2025?", cat: "AI" },
  { q: "Will Argentina inflation fall below 5% in Feb 2025?", cat: "Economics" },
  { q: "Will Solana surpass $300 before April 2025?", cat: "Crypto" },
  { q: "Will Super Bowl LIX be won by the NFC?", cat: "Sports" },
  { q: "Will China GDP growth exceed 5% in 2024?", cat: "Economics" },
  { q: "Will Meta stock reach $700 before Q2 2025?", cat: "Stocks" },
  { q: "Will SpaceX Starship complete orbital flight by Q1 2025?", cat: "Science" },
  { q: "Will RFK Jr endorse Trump before November 2024?", cat: "Politics" },
  { q: "Will gold hit $2800/oz before end of 2024?", cat: "Commodities" },
  { q: "Will Japan raise interest rates in Q1 2025?", cat: "Economics" },
  { q: "Will Ripple win SEC lawsuit by mid-2025?", cat: "Regulation" },
  { q: "Will Amazon stock exceed $230 before March 2025?", cat: "Stocks" },
];

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export function runBacktest(req: BacktestRequest): BacktestResult {
  const rand = rng(req.daysBack * 17 + req.minProbability * 1000);

  const trades: BacktestTrade[] = [];
  let equity = req.bankroll;
  let peak = req.bankroll;
  let maxDrawdown = 0;
  const equityCurve: PnlPoint[] = [];

  const now = Date.now();
  const msPerDay = 86400000;

  const tradesPerDay = 1.5;
  const totalTrades = Math.min(
    Math.round(req.daysBack * tradesPerDay),
    SAMPLE_MARKETS.length * 2
  );

  for (let i = 0; i < totalTrades; i++) {
    const daysAgo = req.daysBack - (i / totalTrades) * req.daysBack;
    const date = new Date(now - daysAgo * msPerDay).toISOString().slice(0, 10);

    const mkt = SAMPLE_MARKETS[i % SAMPLE_MARKETS.length];
    const side: "YES" | "NO" = rand() > 0.35 ? "YES" : "NO";

    const baseProbability = req.minProbability + rand() * (0.97 - req.minProbability);
    const entryPrice = Math.round(baseProbability * 100) / 100;

    const winProb = 0.68 + rand() * 0.1;
    const isWin = rand() < winProb;

    const exitPrice = isWin ? 1.0 : 0.0;

    const kellyF = Math.max(0, (entryPrice - (1 - entryPrice)) / (1 - entryPrice)) / 2;
    const positionPct = Math.min(kellyF, req.maxPositionPct / 100);
    const amount = Math.round(equity * positionPct * 100) / 100;
    const shares = amount / entryPrice;
    const pnl = isWin
      ? Math.round((shares - amount) * 100) / 100
      : Math.round(-amount * 100) / 100;
    const pnlPct = Math.round((pnl / amount) * 1000) / 10;

    equity += pnl;
    if (equity > peak) peak = equity;
    const drawdown = (peak - equity) / peak;
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

  const winning = trades.filter((t) => t.outcome === "win");
  const losing = trades.filter((t) => t.outcome === "loss");
  const totalReturn = Math.round((equity - req.bankroll) * 100) / 100;
  const totalReturnPct = Math.round(((equity - req.bankroll) / req.bankroll) * 10000) / 100;
  const returns = trades.map((t) => t.pnlPct / 100);
  const avgReturn = returns.reduce((s, r) => s + r, 0) / (returns.length || 1);
  const stdDev =
    Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / (returns.length || 1));
  const sharpeRatio = stdDev > 0 ? Math.round((avgReturn / stdDev) * Math.sqrt(252) * 100) / 100 : 0;

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
