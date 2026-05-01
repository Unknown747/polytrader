import type { NormalizedMarket } from "./polymarket";

export interface StrategyConfig {
  autoTradingEnabled: boolean;
  bankroll: number;
  maxPositionPct: number;
  minEdge: number;
  minProbability: number;
  maxDaysToResolution: number;
  minVolume24h: number;
  scanIntervalMinutes: number;
  telegramAlertsEnabled: boolean;
  maxDailyTrades: number;
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
  rationale: string;
  conditionId: string;
}

export const DEFAULT_CONFIG: StrategyConfig = {
  autoTradingEnabled: false,
  bankroll: 100,
  maxPositionPct: 5,
  minEdge: 0.03,
  minProbability: 0.80,
  maxDaysToResolution: 21,
  minVolume24h: 500,
  scanIntervalMinutes: 15,
  telegramAlertsEnabled: false,
  maxDailyTrades: 5,
};

let _config: StrategyConfig = { ...DEFAULT_CONFIG };

export function getConfig(): StrategyConfig {
  return { ..._config };
}

export function updateConfig(patch: Partial<StrategyConfig>): StrategyConfig {
  _config = { ..._config, ...patch };
  return { ..._config };
}

function daysUntil(dateStr: string): number {
  const end = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.max(0, (end - now) / (1000 * 60 * 60 * 24));
}

function estimateFairValue(
  price: number,
  daysLeft: number,
  maxDays: number
): number {
  const timeDecay = Math.max(0, 1 - daysLeft / maxDays);
  const convergenceBoost = (1 - price) * timeDecay * 0.5;
  return Math.min(0.99, price + convergenceBoost);
}

function halfKelly(
  p: number,
  price: number
): number {
  if (price <= 0 || price >= 1) return 0;
  const b = (1 - price) / price;
  const q = 1 - p;
  const fullKelly = (p * b - q) / b;
  return Math.max(0, fullKelly / 2);
}

function riskLevel(days: number, edge: number): "low" | "medium" | "high" {
  if (days <= 7 && edge >= 0.06) return "low";
  if (days <= 14 && edge >= 0.04) return "medium";
  return "high";
}

function buildRationale(
  side: "YES" | "NO",
  price: number,
  fv: number,
  days: number,
  edge: number
): string {
  const pct = (price * 100).toFixed(0);
  const fvPct = (fv * 100).toFixed(0);
  const edgePct = (edge * 100).toFixed(1);
  const dayStr = days < 1 ? "< 1 day" : `${days.toFixed(0)} days`;
  return (
    `${side} at ${pct}¢ appears underpriced vs fair value ${fvPct}¢ ` +
    `(${edgePct}% edge). Resolves in ~${dayStr}. ` +
    `Near-resolution momentum strategy: high-probability markets converge faster ` +
    `as resolution approaches.`
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
    if (days > config.maxDaysToResolution || days < 0.1) continue;
    if (m.volume24h < config.minVolume24h) continue;

    const sides: Array<{ side: "YES" | "NO"; price: number }> = [
      { side: "YES", price: m.yesPrice },
      { side: "NO", price: m.noPrice },
    ];

    for (const { side, price } of sides) {
      if (price < config.minProbability || price > 0.97) continue;

      const fv = estimateFairValue(price, days, config.maxDaysToResolution);
      const edge = fv - price;

      if (edge < config.minEdge) continue;

      const kelly = halfKelly(fv, price);
      const cappedKelly = Math.min(kelly, config.maxPositionPct / 100);
      const suggestedAmount = Math.round(config.bankroll * cappedKelly * 100) / 100;
      const expectedReturn = edge / price;

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
        riskLevel: riskLevel(days, edge),
        daysToResolution: Math.round(days * 10) / 10,
        volume24h: m.volume24h,
        rationale: buildRationale(side, price, fv, days, edge),
        conditionId: m.conditionId,
      });
    }
  }

  return opportunities.sort((a, b) => b.edge - a.edge).slice(0, 20);
}
