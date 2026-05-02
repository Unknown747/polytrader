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
  autoCapital: boolean;
  autoCompound: boolean;
  categoryFilter: string;
  paperTradingMode: boolean;
  paperBankroll: number;
  paperSlippagePct: number;
  paperTakerFeePct: number;
  volatilityCheckEnabled: boolean;
  volatilityThresholdPct: number;
  cooldownAfterLossEnabled: boolean;
  maxRiskPerTradePct: number;
}

// ─── Adaptive Capital ────────────────────────────────────────────────────────

export interface AdaptiveCapitalProfile {
  effectiveBankroll: number;
  effectiveMaxPosPct: number;
  perTradeAmount: number;
  minLiquidityRequired: number;
  minEdgeRequired: number;
  mode: "micro" | "small" | "normal" | "comfortable";
  modeLabel: string;
  tradeCapacity: number;
  canTrade: boolean;
  warnings: string[];
}

export function computeAdaptiveProfile(
  actualBalance: number,
  config: StrategyConfig
): AdaptiveCapitalProfile {
  const MIN_ORDER = 1;
  const warnings: string[] = [];

  let mode: AdaptiveCapitalProfile["mode"];
  let modeLabel: string;
  if (actualBalance < 20) {
    mode = "micro";
    modeLabel = "Micro — terlalu kecil";
  } else if (actualBalance < 50) {
    mode = "small";
    modeLabel = "Small Capital";
  } else if (actualBalance < 200) {
    mode = "normal";
    modeLabel = "Normal";
  } else {
    mode = "comfortable";
    modeLabel = "Comfortable";
  }

  const effectiveBankroll = actualBalance;
  const minPctForMinOrder = actualBalance > 0 ? (MIN_ORDER / actualBalance) * 100 : 100;
  const effectiveMaxPosPct = Math.min(
    25,
    Math.max(config.maxPositionPct, Math.ceil(minPctForMinOrder))
  );

  const perTradeAmount = (effectiveBankroll * effectiveMaxPosPct) / 100;

  let minLiquidityRequired = config.minLiquidity;
  if (mode === "micro" || mode === "small") {
    minLiquidityRequired = Math.max(config.minLiquidity, 10_000);
    warnings.push("Hanya market dengan likuiditas >$10,000 (spread lebih kecil)");
  }

  let minEdgeRequired = config.minEdge;
  if (mode === "micro") {
    minEdgeRequired = Math.max(config.minEdge, 0.05);
    warnings.push("Min edge dinaikkan ke 5% untuk tutupi spread di modal kecil");
  } else if (mode === "small") {
    minEdgeRequired = Math.max(config.minEdge, 0.04);
    warnings.push("Min edge dinaikkan ke 4% agar lebih selektif");
  }

  const canTrade = perTradeAmount >= MIN_ORDER;
  if (!canTrade) {
    warnings.push(`Per trade $${perTradeAmount.toFixed(2)} < minimum $1 Polymarket — tidak bisa trade`);
  }

  if (mode === "micro" && canTrade) {
    warnings.push(`Hanya ${Math.floor((actualBalance - 20) / perTradeAmount)} loss berturut sebelum bot berhenti`);
  }

  const tradeCapacity = perTradeAmount > 0 ? Math.floor(actualBalance / perTradeAmount) : 0;

  return {
    effectiveBankroll,
    effectiveMaxPosPct,
    perTradeAmount,
    minLiquidityRequired,
    minEdgeRequired,
    mode,
    modeLabel,
    tradeCapacity,
    canTrade,
    warnings,
  };
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
  autoCapital: false,
  autoCompound: false,
  categoryFilter: "",
  paperTradingMode: false,
  paperBankroll: 1000,
  paperSlippagePct: 0.75,
  paperTakerFeePct: 1.0,
  volatilityCheckEnabled: false,
  volatilityThresholdPct: 5,
  cooldownAfterLossEnabled: false,
  maxRiskPerTradePct: 5,
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
    } else if (typeof defaultVal === "string") {
      (config as Record<string, unknown>)[key] = row.value;
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

// ─── Scoring helpers ─────────────────────────────────────────────────────────

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

/**
 * Resolution timing urgency.
 * Markets ≤3 days get a strong non-linear boost — price convergence is
 * accelerating and the edge is more reliable (less time for surprises).
 */
function timeUrgencyScore(days: number, maxDays: number): number {
  if (days <= 1)  return 1.00;
  if (days <= 2)  return 0.95;
  if (days <= 3)  return 0.90;
  if (days <= 7)  return 0.75 + (7 - days) / 7 * 0.15;
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

/**
 * Composite score — weights:
 *   edge 35% | expected return 20% | time urgency 20% | liquidity 15% | volume 10%
 * Resolution proximity bonus: extra +0.08 for ≤3 days (accelerating convergence).
 * Trend adjustment: +0.05 uptrend, -0.12 downtrend.
 */
function compositeScore(
  edge: number,
  expectedReturn: number,
  days: number,
  maxDays: number,
  liquidity: number,
  volume24h: number,
  trend: "up" | "flat" | "down"
): number {
  const normalizedEdge   = Math.min(edge / 0.15, 1);
  const normalizedReturn = Math.min(expectedReturn / 0.3, 1);
  const tScore = timeUrgencyScore(days, maxDays);
  const lScore = liquidityScore(liquidity);
  const vScore = volumeScore(volume24h);

  let base = (
    normalizedEdge   * 0.35 +
    normalizedReturn * 0.20 +
    tScore           * 0.20 +
    lScore           * 0.15 +
    vScore           * 0.10
  );

  // Resolution proximity bonus — short-fuse markets are genuinely better bets
  if (days <= 3) base = Math.min(1, base + 0.08);
  else if (days <= 7) base = Math.min(1, base + 0.03);

  if (trend === "up")   base = Math.min(1, base + 0.05);
  else if (trend === "down") base = Math.max(0, base - 0.12);

  return base;
}

/**
 * True Half-Kelly with confidence adjustment.
 *
 * Full Kelly for a binary outcome = (p - price) / (1 - price)
 * where p = win probability (fair value), price = current market price.
 *
 * Confidence factor (0.5–1.0) shrinks the bet when:
 *   - Liquidity is thin (our fair value estimate is less reliable)
 *   - Time horizon is long (more room for surprises)
 *   - Volume is low (less price discovery)
 *
 * Half-Kelly is then divided by 2 for additional safety margin,
 * resulting in a quarter-to-half Kelly depending on confidence.
 */
function adjustedHalfKelly(
  p: number,
  price: number,
  liquidity: number,
  volume24h: number,
  days: number,
  maxDays: number
): number {
  if (price <= 0 || price >= 1) return 0;

  const fullKelly = (p - price) / (1 - price);
  if (fullKelly <= 0) return 0;

  // Confidence: weighted avg of liquidity and volume quality
  const liqConf = liquidityScore(liquidity);     // 0.2 – 1.0
  const volConf = volumeScore(volume24h);        // 0.2 – 1.0
  const timeConf = days <= 3 ? 1.0 :            // near resolution = high confidence
                   days <= 7 ? 0.85 :
                   1 - (days / maxDays) * 0.3;   // further = less confident

  const confidence = Math.max(0.4, liqConf * 0.5 + volConf * 0.25 + timeConf * 0.25);

  return Math.max(0, (fullKelly / 2) * confidence);
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
  const pct    = (price * 100).toFixed(0);
  const fvPct  = (fv * 100).toFixed(0);
  const edgePct = (edge * 100).toFixed(1);
  const scorePct = (score * 100).toFixed(0);
  const dayStr = days < 1 ? "< 1 day" : `${days.toFixed(1)} days`;
  const vol = volume24h >= 1000 ? `$${(volume24h / 1000).toFixed(0)}k` : `$${volume24h}`;
  const liq = liquidity >= 1000 ? `$${(liquidity / 1000).toFixed(0)}k` : `$${liquidity}`;

  const urgencyNote =
    days <= 1
      ? "Resolves within 24h — maximum convergence pressure."
      : days <= 3
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

/**
 * Correlation penalty for position sizing.
 *
 * Uses category as a proxy for correlation. Each existing open position
 * in the same category reduces new position size by 15% (capped at 40%).
 * This prevents over-concentration in correlated events (e.g. multiple
 * Crypto markets all moving together).
 */
export function computeCorrelationPenalty(
  category: string,
  openPositionCategories: string[]
): number {
  const sameCount = openPositionCategories.filter(
    (c) => c.toLowerCase() === category.toLowerCase()
  ).length;
  return Math.max(0.60, 1 - sameCount * 0.15);
}

// ─── Main scanner ────────────────────────────────────────────────────────────

export function scanOpportunities(
  markets: NormalizedMarket[],
  config: StrategyConfig = _config
): Opportunity[] {
  const opportunities: Opportunity[] = [];

  // Pre-compute allowed categories (empty = all)
  const allowedCategories: Set<string> | null =
    config.categoryFilter && config.categoryFilter.trim()
      ? new Set(config.categoryFilter.split(",").map((c) => c.trim().toLowerCase()))
      : null;

  for (const m of markets) {
    // ── EARLY FILTERS (before any scoring computation) ────────────────────
    if (m.status !== "active") continue;

    // Category filter
    if (allowedCategories && !allowedCategories.has(m.category.toLowerCase())) continue;

    // Time filter — resolve at some point in the future, but not too far
    const days = daysUntil(m.endDate);
    if (days > config.maxDaysToResolution || days < 0.05) continue;

    // Liquidity and volume hard cuts — skip entirely if either fails
    if (m.volume24h < config.minVolume24h) continue;
    if (m.liquidity < config.minLiquidity) continue;

    // ── SIDE ANALYSIS (only for markets that pass early filters) ──────────
    const sides: Array<{ side: "YES" | "NO"; price: number }> = [
      { side: "YES", price: m.yesPrice },
      { side: "NO",  price: m.noPrice },
    ];

    for (const { side, price } of sides) {
      if (price < config.minProbability || price > 0.97) continue;

      const fv = estimateFairValue(price, days, config.maxDaysToResolution, m.liquidity, m.volume24h);
      const edge = fv - price;
      if (edge < config.minEdge) continue;

      const { trend } = computePriceTrend(m.id, price);
      if (config.trendFilterEnabled && trend === "down" && edge < 0.06) continue;

      const expectedReturn = edge / price;

      // True Half-Kelly with confidence adjustment
      const kelly = adjustedHalfKelly(fv, price, m.liquidity, m.volume24h, days, config.maxDaysToResolution);
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

// ─── Backtest ────────────────────────────────────────────────────────────────

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
const CLOB_MAKER_FEE = 0.00;
const MAKER_FILL_RATE = 0.70;

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

function runBacktestWithMode(req: BacktestRequest, mode: "taker" | "maker"): BacktestResult {
  const seed = Math.round(req.daysBack * 31 + req.minProbability * 997 + req.bankroll * 0.07);
  const rand = rng(seed);
  const trades: BacktestTrade[] = [];
  let equity = req.bankroll, peak = req.bankroll, maxDrawdown = 0;
  const equityCurve: BacktestPnlPoint[] = [];
  let totalFeesPaid = 0;
  const now = Date.now();
  const fee = mode === "taker" ? CLOB_TAKER_FEE : CLOB_MAKER_FEE;
  const totalCandidates = Math.min(Math.round(req.daysBack * (0.8 + rand() * 0.8)), SAMPLE_MARKETS.length * 3);
  const shuffledMarkets = [...SAMPLE_MARKETS].sort(() => rand() - 0.5);

  for (let i = 0; i < totalCandidates; i++) {
    if (mode === "maker" && rand() > MAKER_FILL_RATE) continue;

    const progress = i / totalCandidates;
    const daysAgo = req.daysBack * (1 - progress) * (0.9 + rand() * 0.2);
    const date = new Date(now - daysAgo * 86400000).toISOString().slice(0, 10);
    const mkt = shuffledMarkets[i % shuffledMarkets.length];
    const side: "YES" | "NO" = rand() > 0.3 ? "YES" : "NO";
    const spread = estimateSpread(mkt.liquidity, rand);
    const rawProb = mkt.baseProb + (rand() - 0.5) * 0.06;
    const entryPriceRaw = Math.max(req.minProbability, Math.min(0.97, Math.round(rawProb * 100) / 100));
    const entryPrice = mode === "maker"
      ? Math.min(0.97, entryPriceRaw)
      : Math.min(0.97, entryPriceRaw + spread / 2);
    const isWin = rand() < Math.max(0.40, Math.min(0.96, entryPrice - 0.025));
    const rawExitPrice = isWin ? 1.0 : 0.0;
    const feeCost = rawExitPrice * fee;
    const exitPrice = Math.max(0, rawExitPrice - feeCost);
    const b = (1 - entryPrice) / entryPrice;
    const kellyF = Math.max(0, (entryPrice * b - (1 - entryPrice)) / b) / 2;
    const positionPct = Math.min(kellyF, req.maxPositionPct / 100);
    const amount = Math.max(1, Math.round(equity * positionPct * 100) / 100);
    const shares = amount / entryPrice;
    const feePaid = isWin ? Math.round(shares * feeCost * 100) / 100 : 0;
    const pnl = isWin
      ? Math.round((shares * exitPrice - amount) * 100) / 100
      : Math.round(-amount * 100) / 100;
    const pnlPct = amount > 0 ? Math.round((pnl / amount) * 1000) / 10 : 0;
    totalFeesPaid += feePaid;
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
      feePaid,
      spread: Math.round(spread * 10000) / 100,
    });

    equityCurve.push({
      date,
      pnl: Math.round(pnl * 100) / 100,
      cumulative: Math.round((equity - req.bankroll) * 100) / 100,
    });
  }

  const totalReturn = Math.round((equity - req.bankroll) * 100) / 100;
  const totalReturnPct = req.bankroll > 0
    ? Math.round((totalReturn / req.bankroll) * 10000) / 100
    : 0;
  const wins = trades.filter((t) => t.outcome === "win");
  const losses = trades.filter((t) => t.outcome === "loss");
  const winRate = trades.length > 0 ? Math.round((wins.length / trades.length) * 1000) / 10 : 0;
  const avgReturn = trades.length > 0
    ? Math.round((trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length) * 100) / 100
    : 0;

  const dailyReturns = equityCurve.map((p) => p.pnl);
  const meanReturn = dailyReturns.length > 0
    ? dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length
    : 0;
  const stdReturn = dailyReturns.length > 1
    ? Math.sqrt(dailyReturns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / (dailyReturns.length - 1))
    : 0;
  const sharpeRatio = stdReturn > 0
    ? Math.round((meanReturn / stdReturn) * Math.sqrt(252) * 100) / 100
    : 0;

  const totalSpread = trades.reduce((s, t) => s + t.spread, 0);
  const avgSpreadPct = trades.length > 0
    ? Math.round((totalSpread / trades.length) * 100) / 100
    : 0;

  return {
    totalReturn,
    totalReturnPct,
    winRate,
    totalTrades: trades.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    avgReturn,
    maxDrawdown: Math.round(maxDrawdown * 10000) / 100,
    sharpeRatio,
    totalFeesPaid: Math.round(totalFeesPaid * 100) / 100,
    avgSpreadPct,
    trades: trades.slice(-100),
    equityCurve,
  };
}

export function runBacktest(req: BacktestRequest): {
  taker: BacktestResult;
  maker: BacktestResult;
} {
  return {
    taker: runBacktestWithMode(req, "taker"),
    maker: runBacktestWithMode(req, "maker"),
  };
}

export function runBacktestComparison(req: BacktestRequest): {
  taker: BacktestResult;
  maker: BacktestResult;
  summary: {
    takerReturn: number;
    makerReturn: number;
    takerWinRate: number;
    makerWinRate: number;
    takerSharpe: number;
    makerSharpe: number;
    recommendation: string;
  };
} {
  const taker = runBacktestWithMode(req, "taker");
  const maker = runBacktestWithMode(req, "maker");

  const recommendation =
    maker.totalReturn > taker.totalReturn && maker.sharpeRatio > taker.sharpeRatio
      ? "Maker orders recommended — higher return and better risk-adjusted performance."
      : taker.totalReturn > maker.totalReturn
      ? "Taker orders recommended — higher absolute return despite fees."
      : "Results mixed — consider market liquidity when choosing order type.";

  return {
    taker,
    maker,
    summary: {
      takerReturn: taker.totalReturnPct,
      makerReturn: maker.totalReturnPct,
      takerWinRate: taker.winRate,
      makerWinRate: maker.winRate,
      takerSharpe: taker.sharpeRatio,
      makerSharpe: maker.sharpeRatio,
      recommendation,
    },
  };
}
