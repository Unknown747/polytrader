import { Router, type IRouter } from "express";
import { getCachedMarkets } from "../services/polymarket";
import { FAKE_MARKETS } from "./markets";

const router: IRouter = Router();

function generatePriceHistory(
  currentPrice: number,
  days = 30
): Array<{ date: string; yesPrice: number; noPrice: number }> {
  const result: Array<{ date: string; yesPrice: number; noPrice: number }> = [];
  let price = currentPrice;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const seed = Math.floor(currentPrice * 1000);
  function seededRandom(i: number): number {
    const x = Math.sin(seed + i) * 10000;
    return x - Math.floor(x);
  }

  const targetPrice = currentPrice;
  const startPrice = Math.max(0.05, Math.min(0.95, targetPrice - 0.2 + seededRandom(0) * 0.4));
  price = startPrice;

  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);

    const progress = i / (days - 1);
    const drift = (targetPrice - startPrice) * progress * 0.3;
    const noise = (seededRandom(i + 1) - 0.5) * 0.06;
    price = Math.max(0.02, Math.min(0.98, price + drift / days + noise));

    result.push({
      date: dateStr,
      yesPrice: parseFloat(price.toFixed(3)),
      noPrice: parseFloat((1 - price).toFixed(3)),
    });
  }

  if (result.length > 0) {
    result[result.length - 1].yesPrice = parseFloat(currentPrice.toFixed(3));
    result[result.length - 1].noPrice = parseFloat((1 - currentPrice).toFixed(3));
  }

  return result;
}

router.get("/markets/:marketId/history", async (req, res) => {
  const { marketId } = req.params;
  const days = Math.min(90, Math.max(7, parseInt(String(req.query.days ?? "30"), 10) || 30));

  let yesPrice = 0.5;

  try {
    const live = await getCachedMarkets();
    const found = live.find((m) => m.id === marketId);
    if (found) {
      yesPrice = found.yesPrice;
    } else {
      const demo = FAKE_MARKETS.find((m) => m.id === marketId);
      if (demo) yesPrice = demo.yesPrice;
    }
  } catch {
    const demo = FAKE_MARKETS.find((m) => m.id === marketId);
    if (demo) yesPrice = demo.yesPrice;
  }

  const history = generatePriceHistory(yesPrice, days);
  res.json({ marketId, days, history });
});

export default router;
