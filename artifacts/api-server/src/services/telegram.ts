import { logger } from "../lib/logger";
import type { Opportunity } from "./strategy";

const BASE = "https://api.telegram.org";
const SEND_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function botToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN;
}

function chatId(): string | undefined {
  return process.env.TELEGRAM_CHAT_ID;
}

export function isTelegramConfigured(): boolean {
  return Boolean(botToken() && chatId());
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendMessage(text: string, retries = SEND_RETRIES): Promise<boolean> {
  const token = botToken();
  const chat = chatId();
  if (!token || !chat) {
    logger.warn("Telegram not configured — skipping notification");
    return false;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chat,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });

      if (res.ok) {
        logger.info({ attempt }, "Telegram message sent");
        return true;
      }

      const err = await res.text();
      logger.warn({ status: res.status, err, attempt }, "Telegram sendMessage failed");

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") ?? "5", 10) * 1000;
        await sleep(retryAfter);
      } else if (res.status >= 400 && res.status < 500) {
        return false;
      }
    } catch (e) {
      logger.warn({ err: e, attempt }, "Telegram request error, retrying");
    }

    if (attempt < retries) {
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  logger.error("Telegram: all retry attempts exhausted");
  return false;
}

export async function sendTestMessage(): Promise<{ success: boolean; message: string }> {
  if (!isTelegramConfigured()) {
    return {
      success: false,
      message: "Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.",
    };
  }

  const ok = await sendMessage(
    "✅ <b>PolyTrader connected!</b>\n\nTelegram notifications are working. You'll receive alerts for new opportunities, filled orders, and daily P&L reports."
  );

  return {
    success: ok,
    message: ok
      ? "Test message sent successfully!"
      : "Failed to send message. Check your Bot Token and Chat ID.",
  };
}

export async function notifyOpportunities(opportunities: Opportunity[]): Promise<void> {
  if (!isTelegramConfigured() || opportunities.length === 0) return;

  const top = opportunities.slice(0, 5);
  const lines = [
    `🎯 <b>${opportunities.length} trading opportunit${opportunities.length === 1 ? "y" : "ies"} found!</b>`,
    "",
  ];

  for (const op of top) {
    const side = op.recommendedSide === "YES" ? "✅ YES" : "❌ NO";
    const price = (op.currentPrice * 100).toFixed(0);
    const edge = (op.edge * 100).toFixed(1);
    const ret = (op.expectedReturn * 100).toFixed(1);
    const score = op.compositeScore !== undefined
      ? ` | Score: ${(op.compositeScore * 100).toFixed(0)}/100`
      : "";
    const days = op.daysToResolution < 1 ? "&lt;1 day" : `${op.daysToResolution.toFixed(0)}d`;
    const liq = op.liquidity !== undefined && op.liquidity >= 1000
      ? `$${(op.liquidity / 1000).toFixed(0)}k liq`
      : "";

    lines.push(
      `<b>${op.question}</b>`,
      `${side} @ ${price}¢ | Edge: +${edge}% | Return: +${ret}%${score}`,
      `📅 ${days} | ${liq} | 💰 Suggested: $${op.suggestedAmount.toFixed(2)}`,
      ""
    );
  }

  if (opportunities.length > 5) {
    lines.push(`<i>...and ${opportunities.length - 5} more opportunities</i>`);
  }

  await sendMessage(lines.join("\n"));
}

export async function notifyOrderFilled(params: {
  question: string;
  side: "YES" | "NO";
  price: number;
  amount: number;
}): Promise<void> {
  if (!isTelegramConfigured()) return;
  const { question, side, price, amount } = params;
  const sideStr = side === "YES" ? "✅ YES" : "❌ NO";
  await sendMessage(
    `🔔 <b>Order Filled</b>\n\n<b>${question}</b>\nBUY ${sideStr} @ ${(price * 100).toFixed(0)}¢\nAmount: $${amount.toFixed(2)}`
  );
}

export async function notifyDailyReport(params: {
  pnl: number;
  pnlPct: number;
  openPositions: number;
  totalValue: number;
  totalTrades?: number;
  winRate?: number;
}): Promise<void> {
  if (!isTelegramConfigured()) return;
  const { pnl, pnlPct, openPositions, totalValue, totalTrades, winRate } = params;
  const sign = pnl >= 0 ? "+" : "";
  const emoji = pnl >= 0 ? "📈" : "📉";
  const lines = [
    `${emoji} <b>Daily P&L Report</b>`,
    "",
    `P&L: <b>${sign}$${pnl.toFixed(2)} (${sign}${pnlPct.toFixed(2)}%)</b>`,
    `Portfolio Value: $${totalValue.toFixed(2)}`,
    `Open Positions: ${openPositions}`,
  ];
  if (totalTrades !== undefined) lines.push(`Total Trades: ${totalTrades}`);
  if (winRate !== undefined) lines.push(`Win Rate: ${winRate.toFixed(1)}%`);

  await sendMessage(lines.join("\n"));
}
