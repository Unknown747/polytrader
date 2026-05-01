import { logger } from "../lib/logger";
import { portfolioState } from "../lib/state";
import { getAutoTraderStats } from "./autoTrader";
import { getConfig, scanOpportunities } from "./strategy";
import { getCachedMarkets } from "./polymarket";
import { triggerManualScan } from "./scheduler";
import { isClobConfigured, getUsdcBalance } from "./clob";

const BASE = "https://api.telegram.org";

function botToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN;
}

function authorizedChatId(): string | undefined {
  return process.env.TELEGRAM_CHAT_ID;
}

async function sendReply(chatId: string | number, text: string): Promise<void> {
  const token = botToken();
  if (!token) return;

  try {
    await fetch(`${BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    logger.warn({ err: e }, "Telegram bot: failed to send reply");
  }
}

async function handleBalance(chatId: string | number): Promise<void> {
  const summary = portfolioState.getSummary();
  const sign = summary.totalPnl >= 0 ? "+" : "";
  const emoji = summary.totalPnl >= 0 ? "📈" : "📉";

  let usdcLine = "";
  if (isClobConfigured()) {
    try {
      const balance = await getUsdcBalance();
      usdcLine = `\n💵 <b>Live USDC Balance:</b> $${balance.toFixed(2)}`;
    } catch {
      usdcLine = "\n💵 <b>Live USDC Balance:</b> unavailable";
    }
  }

  const lines = [
    `${emoji} <b>Portfolio Balance</b>`,
    "",
    `💼 <b>Total Value:</b> $${summary.totalValue.toFixed(2)}`,
    `💰 <b>Available:</b> $${summary.availableBalance.toFixed(2)}`,
    `📊 <b>Invested:</b> $${summary.investedAmount.toFixed(2)}`,
    `${emoji} <b>Total P&L:</b> ${sign}$${summary.totalPnl.toFixed(2)} (${sign}${summary.totalPnlPercent.toFixed(2)}%)`,
    `🎯 <b>Open Positions:</b> ${summary.openPositions}`,
    `✅ <b>Total Trades:</b> ${summary.totalTrades}`,
    `🏆 <b>Win Rate:</b> ${summary.winRate.toFixed(1)}%`,
    usdcLine,
  ].filter(Boolean);

  await sendReply(chatId, lines.join("\n"));
}

async function handlePositions(chatId: string | number): Promise<void> {
  const positions = portfolioState.getPositions();

  if (positions.length === 0) {
    await sendReply(chatId, "📭 <b>No open positions.</b>");
    return;
  }

  const lines = [`📋 <b>Open Positions (${positions.length})</b>`, ""];

  for (const pos of positions) {
    const sign = pos.pnl >= 0 ? "+" : "";
    const emoji = pos.pnl >= 0 ? "🟢" : "🔴";
    const question =
      pos.marketQuestion.length > 55
        ? pos.marketQuestion.slice(0, 52) + "..."
        : pos.marketQuestion;

    lines.push(
      `${emoji} <b>${question}</b>`,
      `${pos.side} | ${pos.shares} shares @ ${(pos.avgPrice * 100).toFixed(0)}¢ → ${(pos.currentPrice * 100).toFixed(0)}¢`,
      `Value: $${pos.value.toFixed(2)} | P&L: ${sign}$${pos.pnl.toFixed(2)} (${sign}${pos.pnlPercent.toFixed(1)}%)`,
      ""
    );
  }

  await sendReply(chatId, lines.join("\n"));
}

async function handleScan(chatId: string | number): Promise<void> {
  await sendReply(chatId, "🔍 <b>Triggering strategy scan...</b>");

  try {
    const markets = await getCachedMarkets();
    const config = getConfig();
    const opportunities = scanOpportunities(markets, config);

    if (opportunities.length === 0) {
      await sendReply(chatId, "🔍 <b>Scan complete.</b>\n\nNo opportunities found matching current criteria.");
      return;
    }

    const top = opportunities.slice(0, 5);
    const lines = [
      `🎯 <b>Scan complete — ${opportunities.length} opportunit${opportunities.length === 1 ? "y" : "ies"} found!</b>`,
      "",
    ];

    for (const op of top) {
      const side = op.recommendedSide === "YES" ? "✅ YES" : "❌ NO";
      const price = (op.currentPrice * 100).toFixed(0);
      const edge = (op.edge * 100).toFixed(1);
      const ret = (op.expectedReturn * 100).toFixed(1);
      const days = op.daysToResolution < 1 ? "&lt;1 day" : `${op.daysToResolution.toFixed(0)}d`;
      const question =
        op.question.length > 55 ? op.question.slice(0, 52) + "..." : op.question;

      lines.push(
        `<b>${question}</b>`,
        `${side} @ ${price}¢ | Edge: +${edge}% | Return: +${ret}%`,
        `📅 ${days} | 💰 $${op.suggestedAmount.toFixed(2)}`,
        ""
      );
    }

    if (opportunities.length > 5) {
      lines.push(`<i>...and ${opportunities.length - 5} more</i>`);
    }

    await sendReply(chatId, lines.join("\n"));

    triggerManualScan();
  } catch (e) {
    logger.error({ err: e }, "Telegram bot: scan failed");
    await sendReply(chatId, "❌ <b>Scan failed.</b> Check the server logs for details.");
  }
}

async function handleStatus(chatId: string | number): Promise<void> {
  const config = getConfig();
  const stats = await getAutoTraderStats(config);

  const statusEmoji = stats.enabled ? "🟢" : "🔴";
  const clobEmoji = stats.clobConfigured ? "✅" : "❌";
  const lastScan = stats.lastScanAt
    ? new Date(stats.lastScanAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : "never";
  const lastTrade = stats.lastTradeAt
    ? new Date(stats.lastTradeAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : "never";

  const lines = [
    `⚙️ <b>Auto-Trader Status</b>`,
    "",
    `${statusEmoji} <b>Auto-Trading:</b> ${stats.enabled ? "Enabled" : "Disabled"}`,
    `${clobEmoji} <b>CLOB Configured:</b> ${stats.clobConfigured ? "Yes" : "No"}`,
    `📊 <b>Trades Today:</b> ${stats.tradesToday} / ${stats.maxDailyTrades}`,
    `🎰 <b>Remaining Slots:</b> ${stats.remainingSlots}`,
    `📈 <b>Lifetime Trades:</b> ${stats.totalTradesLifetime}`,
    `⏱ <b>Last Scan:</b> ${lastScan}`,
    `🕐 <b>Last Trade:</b> ${lastTrade}`,
    `⏰ <b>Scan Interval:</b> every ${config.scanIntervalMinutes} min`,
  ];

  if (stats.usdcBalance > 0) {
    lines.push(`💵 <b>USDC Balance:</b> $${stats.usdcBalance.toFixed(2)}`);
  }

  await sendReply(chatId, lines.join("\n"));
}

async function handleHelp(chatId: string | number): Promise<void> {
  const lines = [
    `🤖 <b>PolyTrader Bot Commands</b>`,
    "",
    `/balance — Portfolio balance and P&L summary`,
    `/positions — View all open positions`,
    `/scan — Trigger a strategy scan for opportunities`,
    `/status — Auto-trader status and configuration`,
    `/help — Show this message`,
  ];
  await sendReply(chatId, lines.join("\n"));
}

async function processUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message?.text || !message.chat?.id) return;

  const incomingChatId = String(message.chat.id);
  const authorizedId = authorizedChatId();

  if (authorizedId && incomingChatId !== authorizedId) {
    logger.warn({ incomingChatId, authorizedId }, "Telegram bot: unauthorized command attempt");
    await sendReply(
      message.chat.id,
      "⛔ <b>Unauthorized.</b> This bot is private — only the configured chat can send commands."
    );
    return;
  }

  const text = message.text.trim();
  const command = text.split(" ")[0].replace(/@.*$/, "").toLowerCase();

  logger.info({ command, chatId: incomingChatId }, "Telegram bot: received command");

  switch (command) {
    case "/balance":
      await handleBalance(message.chat.id);
      break;
    case "/positions":
      await handlePositions(message.chat.id);
      break;
    case "/scan":
      await handleScan(message.chat.id);
      break;
    case "/status":
      await handleStatus(message.chat.id);
      break;
    case "/start":
    case "/help":
      await handleHelp(message.chat.id);
      break;
    default:
      await sendReply(
        message.chat.id,
        `❓ Unknown command: <code>${command}</code>\n\nType /help to see available commands.`
      );
  }
}

interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
  date: number;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface GetUpdatesResponse {
  ok: boolean;
  result: TelegramUpdate[];
}

let polling = false;
let lastUpdateId = 0;
let pollAbortController: AbortController | null = null;

async function poll(): Promise<void> {
  const token = botToken();
  if (!token) return;

  pollAbortController = new AbortController();

  while (polling) {
    try {
      const url = `${BASE}/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=30&allowed_updates=["message"]`;
      const res = await fetch(url, {
        signal: pollAbortController.signal,
      });

      if (!res.ok) {
        logger.warn({ status: res.status }, "Telegram bot: getUpdates failed");
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }

      const data = (await res.json()) as GetUpdatesResponse;

      if (!data.ok || !Array.isArray(data.result)) continue;

      for (const update of data.result) {
        lastUpdateId = Math.max(lastUpdateId, update.update_id);
        void processUpdate(update);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") break;
      logger.warn({ err: e }, "Telegram bot: poll error, retrying in 5s");
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

export function startTelegramBot(): void {
  if (!botToken()) {
    logger.info("Telegram bot not started — TELEGRAM_BOT_TOKEN not set");
    return;
  }

  if (polling) return;
  polling = true;

  logger.info("Telegram command bot started");
  void poll();
}

export function stopTelegramBot(): void {
  polling = false;
  pollAbortController?.abort();
  pollAbortController = null;
  logger.info("Telegram command bot stopped");
}
