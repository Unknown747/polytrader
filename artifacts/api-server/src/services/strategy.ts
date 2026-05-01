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
  takeProfitPct: number;
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
  stopLossPct: 20,
  takeProfitPct: 50,
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
