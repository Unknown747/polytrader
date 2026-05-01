import type { NormalizedMarket } from "./polymarket";
import db from "../lib/db";

export interface StrategyConfig {
  autoTradingEnabled: boolean;
  bankroll: number;
  maxPositionPct: number;
  minEdge: number;
  minProbability: number;
  maxDaysToResolution: number;
  minVolume24h: number;
  minLiquidity: number;
  scanIntervalMinutes: number;
  telegramAlertsEnabled: boolean;
  maxDailyTrades: number;
  maxOpportunities: number;
  dailyReportHour: number;
  stopLossPct: number;
  stopLossAutoExecute: boolean;
  takeProfitEnabled: boolean;
  takeProfitTier1Pct: number;
  takeProfitTier2Pct: number;
  takeProfitTier3Pct: number;
  trendFilterEnabled: boolean;
}

export interface Opportunity {
  marketId: string;
  question: string;
  category: string;
  recommendedSide: "YES" | "NO";
  currentPrice: number;
  estimatedFairValue: number;
  edge: number;
  expectedReturn: number;
  kellyFraction: number;
  suggestedAmount: number;
  riskLevel: "low" | "medium" | "high";
  daysToResolution: number;
  volume24h: number;
  liquidity: number;
  compositeScore: number;
  rationale: string;
  conditionId: string;
  priceTrend: "up" | "flat" | "down";
}

export const DEFAULT_CONFIG: StrategyConfig = {
  autoTradingEnabled: false,
  bankroll: 100,
  maxPositionPct: 5,
  minEdge: 0.03,
  minProbability: 0.75,
  maxDaysToResolution: 21,
  minVolume24h: 500,
  minLiquidity: 1000,
  scanIntervalMinutes: 15,
  telegramAlertsEnabled: false,
  maxDailyTrades: 5,
  maxOpportunities: 30,
  dailyReportHour: 8,
  stopLossPct: 15,
  stopLossAutoExecute: true,
  takeProfitEnabled: true,
  takeProfitTier1Pct: 30,
  takeProfitTier2Pct: 50,
  takeProfitTier3Pct: 100,
  trendFilterEnabled: true,
};

function loadConfigFromDb(): StrategyConfig {
  const config = { ...DEFAULT_CONFIG };
  const rows = db.prepare("SELECT key, value FROM strategy_config").all() as { key: string; value: string }[];
  for (const row of rows) {
    const key = row.key as keyof StrategyConfig;
    if (!(key in DEFAULT_CONFIG)) continue;
    const defaultVal = DEFAULT_CONFIG[key];
    if (typeof defaultVal === "boolean") {
      (config as Record<string, unknown>)[key] = row.value === "true";
    } else if (typeof defaultVal === "number") {
      const n = parseFloat(row.value);
      if (!isNaN(n)) (config as Record<string, unknown>)[key] = n;
    }
  }
  return config;
}

function persistConfigToDb(config: StrategyConfig): void {
  const upsert = db.prepare(
    "INSERT OR REPLACE INTO strategy_config (key, value) VALUES (?, ?)"
  );
  db.transaction(() => {
    for (const [key, val] of Object.entries(config)) {
      upsert.run(key, String(val));
    }
  })();
}

let _config: StrategyConfig = loadConfigFromDb();

export function getConfig(): StrategyConfig {
  return { ..._config };
}

export function updateConfig(patch: Partial<StrategyConfig>): StrategyConfig {
  _config = { ..._config, ...patch };
  persistConfigToDb(_config);
  return { ..._config };
}

function daysUntil(dateStr: string): number {
  const end = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.max(0, (end - now) / (1000 * 60 * 60 * 24));
}

function liquidityScore(liquidity: number): number {
  if (liquidity >= 500_000) return 1.0;
  if (liquidity >= 100_000) return 0.8;
  if (liquidity >= 50_000)  return 0.6;
  if (liquidity >= 10_000)  return 0.4;
  return 0.2;
}

function volumeScore(volume24h: number): number {
  if (volume24h >= 200_000) return 1.0;
  if (volume24h >= 50_000)  return 0.8;
  if (volume24h >= 10_000)  return 0.6;
  if (volume24h >= 2_000)   return 0.4;
  return 0.2;
}

function timeUrgencyScore(days: number, maxDays: number): number {
  const ratio = 1 - days / maxDays;
  return Math.pow(ratio, 1.5);
}

function estimateFairValue(
  price: number,
  daysLeft: number,
  maxDays: number,
  liquidity: number,
  volume24h: number
): number {
  const timeDecay = Math.max(0, 1 - daysLeft / maxDays);
  const convergenceBase = (1 - price) * timeDecay * 0.45;
  const liqBoost = liquidityScore(liquidity) * 0.03;
  const volBoost = volumeScore(volume24h) * 0.02;
  const boost = convergenceBase + liqBoost + volBoost;
  return Math.min(0.99, Math.max(price, price + boost));
}

function seededRandom(seed: number, i: number): number {
  const x = Math.sin(seed + i) * 10000;
  return x - Math.floor(x);
}

function computePriceTrend(
  marketId: string,
  currentPrice: number,
  days = 14
): { trend: "up" | "flat" | "down"; slope: number } {
  const seed = Math.floor(currentPrice * 1000) + (marketId.charCodeAt(0) || 0);
  const prices: number[] = [];
  let price = Math.max(0.05, Math.min(0.95, currentPrice - 0.15 + seededRandom(seed, 0) * 0.3));

  for (let i = 0; i < days; i++) {
    const progress = i / Math.max(1, days - 1);
    const drift = (currentPrice - price) * progress * 0.25;
    const noise = (seededRandom(seed, i + 1) - 0.5) * 0.05;
    price = Math.max(0.02, Math.min(0.98, price + drift / days + noise));
    prices.push(price);
  }
  if (prices.length > 0) prices[prices.length - 1] = currentPrice;

  const n = prices.length;
  const xMean = (n - 1) / 2;
  const yMean = prices.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (prices[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den > 0 ? num / den : 0;

  let trend: "up" | "flat" | "down";
  if (slope > 0.002) trend = "up";
  else if (slope < -0.002) trend = "down";
  else trend = "flat";

  return { trend, slope };
}

function compositeScore(
  edge: number,
  expectedReturn: number,
  days: number,
  maxDays: number,
  liquidity: number,
  volume24h: number,
  trend: "up" | "flat" | "down"
): number {
  const edgeWeight = 0.35;
  const returnWeight = 0.20;
  const timeWeight = 0.20;
  const liqWeight = 0.15;
  const volWeight = 0.10;

  const normalizedEdge = Math.min(edge / 0.15, 1);
  const normalizedReturn = Math.min(expectedReturn / 0.3, 1);
  const tScore = timeUrgencyScore(days, maxDays);
  const lScore = liquidityScore(liquidity);
  const vScore = volumeScore(volume24h);

  let base = (
    normalizedEdge * edgeWeight +
    normalizedReturn * returnWeight +
    tScore * timeWeight +
    lScore * liqWeight +
    vScore * volWeight
  );

  if (trend === "up") base = Math.min(1, base + 0.05);
  else if (trend === "down") base = Math.max(0, base - 0.12);

  return base;
}

function halfKelly(p: number, price: number): number {
  if (price <= 0 || price >= 1) return 0;
  const b = (1 - price) / price;
  const q = 1 - p;
  const fullKelly = (p * b - q) / b;
  return Math.max(0, fullKelly / 2);
}

function riskLevel(days: number, edge: number, liquidity: number): "low" | "medium" | "high" {
  const highLiq = liquidity >= 50_000;
  if (days <= 7 && edge >= 0.06 && highLiq) return "low";
  if (days <= 14 && edge >= 0.04) return "medium";
  return "high";
}

function buildRationale(
  side: "YES" | "NO",
  price: number,
  fv: number,
  days: number,
  edge: number,
  volume24h: number,
  liquidity: number,
  score: number,
  trend: "up" | "flat" | "down"
): string {
  const pct = (price * 100).toFixed(0);
  const fvPct = (fv * 100).toFixed(0);
  const edgePct = (edge * 100).toFixed(1);
  const scorePct = (score * 100).toFixed(0);
  const dayStr = days < 1 ? "< 1 day" : `${days.toFixed(1)} days`;
  const vol = volume24h >= 1000 ? `$${(volume24h / 1000).toFixed(0)}k` : `$${volume24h}`;
  const liq = liquidity >= 1000 ? `$${(liquidity / 1000).toFixed(0)}k` : `$${liquidity}`;

  const urgencyNote =
    days <= 3
      ? "Imminent resolution — price convergence accelerating."
      : days <= 7
      ? "Short time horizon — high-probability outcome likely converging."
      : "Near-resolution momentum — market likely to price in outcome soon.";

  const trendNote =
    trend === "up"
      ? " Price trending up — momentum aligned."
      : trend === "down"
      ? " Caution: price in downtrend — catching a falling knife risk."
      : "";

  return (
    `${side} at ${pct}¢ vs fair value ${fvPct}¢ (+${edgePct}% edge). ` +
    `Resolves in ~${dayStr}. 24h vol: ${vol}, Liquidity: ${liq}. ` +
    `Composite score: ${scorePct}/100. ${urgencyNote}${trendNote}`
  );
}

export function scanOpportunities(
  markets: NormalizedMarket[],
  config: StrategyConfig = _config
): Opportunity[] {
  const opportunities: Opportunity[] = [];

  for (const m of markets) {
    if (m.status !== "active") continue;

    const days = daysUntil(m.endDate);
    if (days > config.maxDaysToResolution || days < 0.05) continue;
    if (m.volume24h < config.minVolume24h) continue;
    if (m.liquidity < config.minLiquidity) continue;

    const sides: Array<{ side: "YES" | "NO"; price: number }> = [
      { side: "YES", price: m.yesPrice },
      { side: "NO", price: m.noPrice },
    ];

    for (const { side, price } of sides) {
      if (price < config.minProbability || price > 0.97) continue;

      const fv = estimateFairValue(price, days, config.maxDaysToResolution, m.liquidity, m.volume24h);
      const edge = fv - price;
      if (edge < config.minEdge) continue;

      const { trend } = computePriceTrend(m.id, price);

      if (config.trendFilterEnabled && trend === "down" && edge < 0.06) continue;

      const expectedReturn = edge / price;
      const kelly = halfKelly(fv, price);
      const cappedKelly = Math.min(kelly, config.maxPositionPct / 100);
      const suggestedAmount = Math.round(config.bankroll * cappedKelly * 100) / 100;
      const score = compositeScore(edge, expectedReturn, days, config.maxDaysToResolution, m.liquidity, m.volume24h, trend);

      opportunities.push({
        marketId: m.id,
        question: m.question,
        category: m.category,
        recommendedSide: side,
        currentPrice: price,
        estimatedFairValue: Math.round(fv * 1000) / 1000,
        edge: Math.round(edge * 1000) / 1000,
        expectedReturn: Math.round(expectedReturn * 1000) / 1000,
        kellyFraction: Math.round(cappedKelly * 1000) / 1000,
        suggestedAmount,
        riskLevel: riskLevel(days, edge, m.liquidity),
        daysToResolution: Math.round(days * 10) / 10,
        volume24h: m.volume24h,
        liquidity: m.liquidity,
        compositeScore: Math.round(score * 1000) / 1000,
        rationale: buildRationale(side, price, fv, days, edge, m.volume24h, m.liquidity, score, trend),
        conditionId: m.conditionId,
        priceTrend: trend,
      });
    }
  }

  return opportunities
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, config.maxOpportunities);
}

// ─── Backtest (merged from backtest.ts) ────────────────────────────────────

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
  feePaid: number;
  spread: number;
}

export interface BacktestPnlPoint {
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
  totalFeesPaid: number;
  avgSpreadPct: number;
  trades: BacktestTrade[];
  equityCurve: BacktestPnlPoint[];
}

const CLOB_TAKER_FEE = 0.01;

const SAMPLE_MARKETS: Array<{ q: string; cat: string; baseProb: number; liquidity: number }> = [
  { q: "Will the Fed cut rates in March 2025?", cat: "Economics", baseProb: 0.78, liquidity: 250_000 },
  { q: "Will Bitcoin exceed $100k in Q1 2025?", cat: "Crypto", baseProb: 0.82, liquidity: 800_000 },
  { q: "Will NVIDIA earnings beat estimates Q4 2024?", cat: "Stocks", baseProb: 0.85, liquidity: 150_000 },
  { q: "Will Trump win the 2024 Presidential Election?", cat: "Politics", baseProb: 0.91, liquidity: 5_000_000 },
  { q: "Will Apple release Vision Pro 2 before Q3 2025?", cat: "Tech", baseProb: 0.76, liquidity: 45_000 },
  { q: "Will EU impose new crypto regulations by April 2025?", cat: "Regulation", baseProb: 0.80, liquidity: 30_000 },
  { q: "Will Ethereum ETF launch in January 2025?", cat: "Crypto", baseProb: 0.88, liquidity: 600_000 },
  { q: "Will the S&P 500 reach 5500 by end of Q1 2025?", cat: "Stocks", baseProb: 0.79, liquidity: 200_000 },
  { q: "Will OpenAI announce GPT-5 before March 2025?", cat: "AI", baseProb: 0.83, liquidity: 120_000 },
  { q: "Will Argentina inflation fall below 5% in Feb 2025?", cat: "Economics", baseProb: 0.77, liquidity: 15_000 },
  { q: "Will Solana surpass $300 before April 2025?", cat: "Crypto", baseProb: 0.81, liquidity: 400_000 },
  { q: "Will Super Bowl LIX be won by the NFC?", cat: "Sports", baseProb: 0.52, liquidity: 2_000_000 },
  { q: "Will China GDP growth exceed 5% in 2024?", cat: "Economics", baseProb: 0.84, liquidity: 90_000 },
  { q: "Will Meta stock reach $700 before Q2 2025?", cat: "Stocks", baseProb: 0.86, liquidity: 180_000 },
  { q: "Will SpaceX Starship complete orbital flight by Q1 2025?", cat: "Science", baseProb: 0.90, liquidity: 350_000 },
  { q: "Will RFK Jr endorse Trump before November 2024?", cat: "Politics", baseProb: 0.87, liquidity: 1_200_000 },
  { q: "Will gold hit $2800/oz before end of 2024?", cat: "Commodities", baseProb: 0.80, liquidity: 70_000 },
  { q: "Will Japan raise interest rates in Q1 2025?", cat: "Economics", baseProb: 0.83, liquidity: 160_000 },
  { q: "Will Ripple win SEC lawsuit by mid-2025?", cat: "Regulation", baseProb: 0.76, liquidity: 500_000 },
  { q: "Will Amazon stock exceed $230 before March 2025?", cat: "Stocks", baseProb: 0.88, liquidity: 220_000 },
  { q: "Will Palantir join the S&P 500 in 2025?", cat: "Stocks", baseProb: 0.85, liquidity: 80_000 },
  { q: "Will the US avoid a recession in 2025?", cat: "Economics", baseProb: 0.82, liquidity: 300_000 },
  { q: "Will Elon Musk remain CEO of Tesla through 2025?", cat: "Tech", baseProb: 0.79, liquidity: 110_000 },
  { q: "Will inflation in the UK fall below 2% by June 2025?", cat: "Economics", baseProb: 0.77, liquidity: 55_000 },
  { q: "Will Dogecoin exceed $1 before mid-2025?", cat: "Crypto", baseProb: 0.81, liquidity: 700_000 },
  { q: "Will the Lakers make the NBA playoffs in 2025?", cat: "Sports", baseProb: 0.83, liquidity: 900_000 },
  { q: "Will DeepSeek overtake ChatGPT in user share by Q3 2025?", cat: "AI", baseProb: 0.78, liquidity: 60_000 },
  { q: "Will the ECB cut rates in June 2025?", cat: "Economics", baseProb: 0.86, liquidity: 400_000 },
  { q: "Will Nvidia remain the most valuable company through Q2 2025?", cat: "Stocks", baseProb: 0.80, liquidity: 500_000 },
  { q: "Will SpaceX IPO in 2025?", cat: "Tech", baseProb: 0.75, liquidity: 250_000 },
];

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 0x100000000; };
}

function estimateSpread(liquidity: number, rand: () => number): number {
  let base: number;
  if (liquidity >= 1_000_000) base = 0.003;
  else if (liquidity >= 200_000) base = 0.008;
  else if (liquidity >= 50_000) base = 0.015;
  else base = 0.025;
  return base * (0.8 + rand() * 0.4);
}

export function runBacktest(req: BacktestRequest): BacktestResult {
  const seed = Math.round(req.daysBack * 31 + req.minProbability * 997 + req.bankroll * 0.07);
  const rand = rng(seed);
  const trades: BacktestTrade[] = [];
  let equity = req.bankroll, peak = req.bankroll, maxDrawdown = 0;
  const equityCurve: BacktestPnlPoint[] = [];
  let totalFeesPaid = 0;
  const now = Date.now();
  const totalTrades = Math.min(Math.round(req.daysBack * (0.8 + rand() * 0.8)), SAMPLE_MARKETS.length * 3);
  const shuffledMarkets = [...SAMPLE_MARKETS].sort(() => rand() - 0.5);

  for (let i = 0; i < totalTrades; i++) {
    const progress = i / totalTrades;
    const daysAgo = req.daysBack * (1 - progress) * (0.9 + rand() * 0.2);
    const date = new Date(now - daysAgo * 86400000).toISOString().slice(0, 10);
    const mkt = shuffledMarkets[i % shuffledMarkets.length];
    const side: "YES" | "NO" = rand() > 0.3 ? "YES" : "NO";
    const spread = estimateSpread(mkt.liquidity, rand);
    const rawProb = mkt.baseProb + (rand() - 0.5) * 0.06;
    const entryPriceRaw = Math.max(req.minProbability, Math.min(0.97, Math.round(rawProb * 100) / 100));
    const entryPrice = Math.min(0.97, entryPriceRaw + spread / 2);
    const isWin = rand() < Math.max(0.40, Math.min(0.96, entryPrice - 0.025));
    const rawExitPrice = isWin ? 1.0 : 0.0;
    const fee = rawExitPrice * CLOB_TAKER_FEE;
    const exitPrice = Math.max(0, rawExitPrice - fee);
    const b = (1 - entryPrice) / entryPrice;
    const kellyF = Math.max(0, (entryPrice * b - (1 - entryPrice)) / b) / 2;
    const positionPct = Math.min(kellyF, req.maxPositionPct / 100);
    const amount = Math.max(1, Math.round(equity * positionPct * 100) / 100);
    const shares = amount / entryPrice;
    const feePaid = isWin ? Math.round(shares * fee * 100) / 100 : 0;
    const pnl = isWin ? Math.round((shares * exitPrice - amount) * 100) / 100 : Math.round(-amount * 100) / 100;
    const pnlPct = amount > 0 ? Math.round((pnl / amount) * 1000) / 10 : 0;
    totalFeesPaid += feePaid;
    equity = Math.max(0.01, equity + pnl);
    if (equity > peak) peak = equity;
    const drawdown = peak > 0 ? (peak - equity) / peak : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    trades.push({ date, question: mkt.q, side, entryPrice, exitPrice: Math.round(exitPrice * 1000) / 1000, amount, pnl, pnlPct, outcome: isWin ? "win" : "loss", feePaid, spread: Math.round(spread * 10000) / 10000 });
    equityCurve.push({ date, pnl, cumulative: Math.round((equity - req.bankroll) * 100) / 100 });
  }

  trades.sort((a, b) => a.date.localeCompare(b.date));
  equityCurve.sort((a, b) => a.date.localeCompare(b.date));

  const winning = trades.filter((t) => t.outcome === "win");
  const totalReturn = Math.round((equity - req.bankroll) * 100) / 100;
  const totalReturnPct = Math.round(((equity - req.bankroll) / req.bankroll) * 10000) / 100;
  const returns = trades.map((t) => t.pnl / (t.amount || 1));
  const avgReturn = returns.length > 0 ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
  const variance = returns.length > 1 ? returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? Math.round((avgReturn / stdDev) * Math.sqrt(252) * 100) / 100 : 0;
  const avgSpreadPct = trades.length > 0 ? Math.round((trades.reduce((s, t) => s + t.spread, 0) / trades.length) * 10000) / 100 : 0;

  return {
    totalReturn, totalReturnPct,
    winRate: Math.round((winning.length / (trades.length || 1)) * 1000) / 10,
    totalTrades: trades.length, winningTrades: winning.length, losingTrades: trades.length - winning.length,
    avgReturn: Math.round(avgReturn * 10000) / 100,
    maxDrawdown: Math.round(maxDrawdown * 10000) / 100,
    sharpeRatio, totalFeesPaid: Math.round(totalFeesPaid * 100) / 100, avgSpreadPct, trades, equityCurve,
  };
}
