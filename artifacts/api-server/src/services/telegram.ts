import { logger } from "../lib/db";
import db from "../lib/db";
import type { Opportunity } from "./strategy";

const BASE = "https://api.telegram.org";
const SEND_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function getDbCred(key: string): string | undefined {
  try {
    const row = db.prepare("SELECT value FROM app_credentials WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value || undefined;
  } catch { return undefined; }
}

function botToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN || getDbCred("TELEGRAM_BOT_TOKEN");
}

function chatId(): string | undefined {
  return process.env.TELEGRAM_CHAT_ID || getDbCred("TELEGRAM_CHAT_ID");
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

export async function notifyPriceAlert(params: {
  marketId: string;
  question: string;
  side: "YES" | "NO";
  direction: "above" | "below";
  targetPrice: number;
  currentPrice: number;
}): Promise<void> {
  if (!isTelegramConfigured()) return;
  const { question, side, direction, targetPrice, currentPrice } = params;
  const sideEmoji = side === "YES" ? "✅" : "❌";
  const dirEmoji = direction === "above" ? "📈" : "📉";
  await sendMessage(
    `${dirEmoji} <b>Price Alert Triggered!</b>\n\n` +
    `<b>${question}</b>\n\n` +
    `${sideEmoji} <b>${side}</b> price is now <b>${(currentPrice * 100).toFixed(0)}¢</b>\n` +
    `Target: ${direction} <b>${(targetPrice * 100).toFixed(0)}¢</b>`
  );
}

export async function notifyExpiringPosition(params: {
  question: string;
  side: "YES" | "NO";
  hoursLeft: number;
  currentPrice: number;
  pnl: number;
  value: number;
}): Promise<void> {
  if (!isTelegramConfigured()) return;
  const { question, side, hoursLeft, currentPrice, pnl, value } = params;
  const sideEmoji = side === "YES" ? "✅" : "❌";
  const pnlSign = pnl >= 0 ? "+" : "";
  const pnlEmoji = pnl >= 0 ? "🟢" : "🔴";
  await sendMessage(
    `⏰ <b>Position Expiring Soon!</b>\n\n` +
    `<b>${question}</b>\n\n` +
    `${sideEmoji} ${side} | Current: <b>${(currentPrice * 100).toFixed(0)}¢</b>\n` +
    `Value: $${value.toFixed(2)} | ${pnlEmoji} P&L: ${pnlSign}$${pnl.toFixed(2)}\n` +
    `⏱ Resolves in ~${hoursLeft}h`
  );
}

export async function notifyStopLossTriggered(params: {
  question: string;
  side: "YES" | "NO";
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPct: number;
}): Promise<void> {
  if (!isTelegramConfigured()) return;
  const { question, side, entryPrice, currentPrice, pnl, pnlPct } = params;
  const sideEmoji = side === "YES" ? "✅" : "❌";
  await sendMessage(
    `🛑 <b>Stop-Loss Triggered</b>\n\n` +
    `<b>${question}</b>\n\n` +
    `${sideEmoji} ${side} | Entry: ${(entryPrice * 100).toFixed(0)}¢ → Now: <b>${(currentPrice * 100).toFixed(0)}¢</b>\n` +
    `Loss: <b>-$${Math.abs(pnl).toFixed(2)} (${pnlPct.toFixed(1)}%)</b>\n` +
    `Position flagged for exit to limit further downside.`
  );
}

export async function notifyTakeProfitTriggered(params: {
  question: string;
  side: "YES" | "NO";
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPct: number;
}): Promise<void> {
  if (!isTelegramConfigured()) return;
  const { question, side, entryPrice, currentPrice, pnl, pnlPct } = params;
  const sideEmoji = side === "YES" ? "✅" : "❌";
  await sendMessage(
    `🎯 <b>Take-Profit Triggered</b>\n\n` +
    `<b>${question}</b>\n\n` +
    `${sideEmoji} ${side} | Entry: ${(entryPrice * 100).toFixed(0)}¢ → Now: <b>${(currentPrice * 100).toFixed(0)}¢</b>\n` +
    `Profit: <b>+$${pnl.toFixed(2)} (+${pnlPct.toFixed(1)}%)</b>\n` +
    `Target reached — time to lock in gains.`
  );
}

export async function notifyStopLossExecuted(params: {
  question: string;
  side: "YES" | "NO";
  entryPrice: number;
  currentPrice: number;
  sharesSold: number;
  realizedPnl: number;
  pnlPct: number;
}): Promise<void> {
  if (!isTelegramConfigured()) return;
  const { question, side, entryPrice, currentPrice, sharesSold, realizedPnl, pnlPct } = params;
  await sendMessage(
    `🛑 <b>Stop-Loss EXECUTED</b>\n\n` +
    `<b>${question}</b>\n\n` +
    `${side} | Entry: ${(entryPrice * 100).toFixed(0)}¢ → Exit: <b>${(currentPrice * 100).toFixed(0)}¢</b>\n` +
    `Shares sold: <b>${sharesSold.toFixed(3)}</b>\n` +
    `Realized Loss: <b>-$${Math.abs(realizedPnl).toFixed(2)} (${pnlPct.toFixed(1)}%)</b>\n\n` +
    `✅ Position closed automatically to protect capital.`
  );
}

export async function notifyTakeProfitTierExecuted(params: {
  question: string;
  side: "YES" | "NO";
  tier: 1 | 2 | 3;
  tierPct: number;
  entryPrice: number;
  currentPrice: number;
  sharesSold: number;
  realizedPnl: number;
  remainingShares: number;
  action: "capital_recovery" | "half_remaining" | "full_close";
}): Promise<void> {
  if (!isTelegramConfigured()) return;
  const { question, side, tier, tierPct, entryPrice, currentPrice, sharesSold, realizedPnl, remainingShares, action } = params;

  let actionDesc = "";
  if (action === "capital_recovery") {
    actionDesc = `💰 Modal awal dikembalikan — sisa <b>${remainingShares.toFixed(3)} shares</b> jalan gratis!`;
  } else if (action === "half_remaining") {
    actionDesc = `📤 50% sisa dijual — <b>${remainingShares.toFixed(3)} shares</b> masih jalan.`;
  } else {
    actionDesc = `🏁 Posisi DITUTUP PENUH — profit dikunci.`;
  }

  await sendMessage(
    `🎯 <b>Take-Profit Tier ${tier} (${tierPct}%) EXECUTED</b>\n\n` +
    `<b>${question}</b>\n\n` +
    `${side} | Entry: ${(entryPrice * 100).toFixed(0)}¢ → Now: <b>${(currentPrice * 100).toFixed(0)}¢</b>\n` +
    `Shares sold: <b>${sharesSold.toFixed(3)}</b>\n` +
    `Realized Profit: <b>+$${realizedPnl.toFixed(2)}</b>\n\n` +
    actionDesc
  );
}

export async function notifyLowBalance(params: {
  balance: number;
  minRequired: number;
  mode: string;
  suggestion: string;
}): Promise<void> {
  if (!isTelegramConfigured()) return;
  const { balance, minRequired, mode, suggestion } = params;
  await sendMessage(
    `⚠️ <b>Peringatan Saldo Rendah!</b>\n\n` +
    `Saldo USDC: <b>$${balance.toFixed(2)}</b>\n` +
    `Minimum yang disarankan: <b>$${minRequired.toFixed(2)}</b>\n` +
    `Mode saat ini: <b>${mode}</b>\n\n` +
    `💡 ${suggestion}\n\n` +
    `<i>Bot tetap berjalan tapi akan lebih selektif. Top-up USDC untuk performa optimal.</i>`
  );
}

export async function notifyAutoCompound(params: {
  oldBankroll: number;
  newBankroll: number;
  profit: number;
  profitPct: number;
}): Promise<void> {
  if (!isTelegramConfigured()) return;
  const { oldBankroll, newBankroll, profit, profitPct } = params;
  const sign = profit >= 0 ? "+" : "";
  await sendMessage(
    `♻️ <b>Auto-Compound Dijalankan</b>\n\n` +
    `Bankroll diperbarui: <b>$${oldBankroll.toFixed(2)} → $${newBankroll.toFixed(2)}</b>\n` +
    `Profit periode ini: <b>${sign}$${profit.toFixed(2)} (${sign}${profitPct.toFixed(2)}%)</b>\n\n` +
    `<i>Ukuran posisi berikutnya dihitung dari bankroll baru.</i>`
  );
}

export async function notifyPaperTrade(params: {
  question: string;
  side: "YES" | "NO";
  price: number;
  amount: number;
  edge: number;
  paperBalance: number;
}): Promise<void> {
  if (!isTelegramConfigured()) return;
  const { question, side, price, amount, edge, paperBalance } = params;
  const sideEmoji = side === "YES" ? "✅" : "❌";
  await sendMessage(
    `📝 <b>[PAPER TRADE] Simulasi Order</b>\n\n` +
    `<b>${question}</b>\n` +
    `${sideEmoji} ${side} @ ${(price * 100).toFixed(0)}¢ | Amount: $${amount.toFixed(2)}\n` +
    `Edge: +${(edge * 100).toFixed(1)}%\n` +
    `Paper balance sisa: <b>$${paperBalance.toFixed(2)}</b>\n\n` +
    `<i>⚠️ Ini simulasi — bukan order nyata di Polymarket.</i>`
  );
}

export async function notifyMarketResolved(params: {
  question: string;
  side: "YES" | "NO";
  outcome: "win" | "loss";
  pnl: number;
  finalPrice: number;
}): Promise<void> {
  if (!isTelegramConfigured()) return;
  const { question, side, outcome, pnl, finalPrice } = params;
  const sideEmoji = side === "YES" ? "✅" : "❌";
  const outcomeEmoji = outcome === "win" ? "🏆" : "💸";
  const pnlSign = pnl >= 0 ? "+" : "";
  await sendMessage(
    `${outcomeEmoji} <b>Market Resolved — ${outcome === "win" ? "WIN" : "LOSS"}</b>\n\n` +
    `<b>${question}</b>\n\n` +
    `${sideEmoji} ${side} resolved at <b>${(finalPrice * 100).toFixed(0)}¢</b>\n` +
    `P&L: <b>${pnlSign}$${pnl.toFixed(2)}</b>`
  );
}



export async function notifyEmergencyStop(params: {
  action: "stop" | "resume";
  cancelled?: number;
  errors?: number;
}): Promise<void> {
  if (!isTelegramConfigured()) return;
  const { action, cancelled = 0, errors = 0 } = params;
  if (action === "stop") {
    await sendMessage(
      `🚨 <b>EMERGENCY STOP ACTIVATED</b>\n\n` +
      `Semua order telah dibatalkan.\n` +
      `Orders cancelled: <b>${cancelled}</b>\n` +
      (errors > 0 ? `Errors: <b>${errors}</b>\n` : "") +
      `Auto-trading dinonaktifkan.\n\n` +
      `<i>Gunakan /resume untuk mengaktifkan kembali.</i>`
    );
  } else {
    await sendMessage(
      `✅ <b>Trading Resumed</b>\n\n` +
      `Emergency stop dihapus.\n` +
      `Auto-trading siap diaktifkan kembali dari Settings.\n\n` +
      `<i>Pastikan auto-trading enabled di Settings sebelum mulai.</i>`
    );
  }
}

export async function notifyHeartbeatFailure(params: {
  failCount: number;
}): Promise<void> {
  if (!isTelegramConfigured()) return;
  await sendMessage(
    `💔 <b>Heartbeat Failure</b>\n\n` +
    `Bot health check gagal <b>${params.failCount}x</b> berturut-turut.\n\n` +
    `<i>Periksa status server dan workflow di Replit.</i>`
  );
}

export async function notifyVolatilitySkip(params: {
  question: string;
  changePct: number;
}): Promise<void> {
  if (!isTelegramConfigured()) return;
  await sendMessage(
    `⚡ <b>Volatility Skip</b>\n\n` +
    `Market terlalu volatile, trade dilewati.\n` +
    `<b>${params.question}</b>\n` +
    `Pergerakan harga: <b>${params.changePct.toFixed(1)}%</b> dalam 1 menit.`
  );
}

export async function notifyLossCooldown(params: {
  type: "consecutive" | "daily";
  value: number;
  until: Date;
}): Promise<void> {
  if (!isTelegramConfigured()) return;
  const { type, value, until } = params;
  if (type === "consecutive") {
    await sendMessage(
      `⏸️ <b>Loss Cooldown Aktif</b>\n\n` +
      `${value} loss berturut-turut terdeteksi.\n` +
      `Trading dijeda 30 menit hingga: <b>${until.toLocaleString()}</b>`
    );
  } else {
    await sendMessage(
      `⛔ <b>Daily Loss Limit</b>\n\n` +
      `Kerugian harian mencapai <b>${value.toFixed(1)}%</b>.\n` +
      `Trading dihentikan hingga hari berikutnya: <b>${until.toLocaleDateString()}</b>`
    );
  }
}
