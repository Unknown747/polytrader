import { logger } from "../lib/logger";
import type { Opportunity } from "./strategy";

const BASE = "https://api.telegram.org";

function botToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN;
}

function chatId(): string | undefined {
  return process.env.TELEGRAM_CHAT_ID;
}

export function isTelegramConfigured(): boolean {
  return Boolean(botToken() && chatId());
}

async function sendMessage(text: string): Promise<boolean> {
  const token = botToken();
  const chat = chatId();
  if (!token || !chat) {
    logger.warn("Telegram not configured — skipping notification");
    return false;
  }

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

    if (!res.ok) {
      const err = await res.text();
      logger.error({ status: res.status, err }, "Telegram sendMessage failed");
      return false;
    }

    logger.info("Telegram message sent");
    return true;
  } catch (e) {
    logger.error({ err: e }, "Telegram request error");
    return false;
  }
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
    message: ok ? "Test message sent successfully!" : "Failed to send message. Check your Bot Token and Chat ID.",
  };
}

export async function notifyOpportunities(opportunities: Opportunity[]): Promise<void> {
  if (!isTelegramConfigured() || opportunities.length === 0) return;

  const top = opportunities.slice(0, 3);
  const lines = [
    `🎯 <b>${opportunities.length} new trading opportunit${opportunities.length === 1 ? "y" : "ies"} found!</b>`,
    "",
  ];

  for (const op of top) {
    const side = op.recommendedSide === "YES" ? "✅ YES" : "❌ NO";
    const price = (op.currentPrice * 100).toFixed(0);
    const edge = (op.edge * 100).toFixed(1);
    const ret = (op.expectedReturn * 100).toFixed(1);
    const days = op.daysToResolution < 1 ? "&lt;1 day" : `${op.daysToResolution.toFixed(0)}d`;

    lines.push(
      `<b>${op.question}</b>`,
      `${side} @ ${price}¢ | Edge: +${edge}% | Return: +${ret}% | ${days}`,
      `💰 Suggested: $${op.suggestedAmount.toFixed(2)}`,
      ""
    );
  }

  if (opportunities.length > 3) {
    lines.push(`<i>...and ${opportunities.length - 3} more</i>`);
  }

  await sendMessage(lines.join("\n"));
}

export async function notifyOrderFilled(params: {
  question: string;
  side: "YES" | "NO";
  price: number;
  amount: number;
}): Promise<void> {
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
}): Promise<void> {
  const { pnl, pnlPct, openPositions, totalValue } = params;
  const sign = pnl >= 0 ? "+" : "";
  const emoji = pnl >= 0 ? "📈" : "📉";
  await sendMessage(
    `${emoji} <b>Daily P&L Report</b>\n\n` +
    `P&L: <b>${sign}$${pnl.toFixed(2)} (${sign}${pnlPct.toFixed(2)}%)</b>\n` +
    `Portfolio Value: $${totalValue.toFixed(2)}\n` +
    `Open Positions: ${openPositions}`
  );
}
