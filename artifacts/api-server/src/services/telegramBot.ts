import { logger } from "../lib/logger";
import db from "../lib/db";
import { portfolioState } from "../lib/state";
import { getAutoTraderStats } from "./autoTrader";
import { getConfig, updateConfig, scanOpportunities } from "./strategy";
import { getCachedMarkets } from "./polymarket";
import { isClobConfigured, getUsdcBalance } from "./clob";

const BASE = "https://api.telegram.org";

function botToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN;
}

function authorizedChatId(): string | undefined {
  return process.env.TELEGRAM_CHAT_ID;
}

// ─── Persist lastUpdateId across restarts ──────────────────────────────────

function loadLastUpdateId(): number {
  const row = db.prepare("SELECT value FROM bot_state WHERE key = 'lastUpdateId'").get() as { value: string } | undefined;
  return row ? parseInt(row.value, 10) : 0;
}

function saveLastUpdateId(id: number): void {
  db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('lastUpdateId', ?)").run(String(id));
}

// ─── Rate limiting ─────────────────────────────────────────────────────────

const COOLDOWNS_MS: Record<string, number> = {
  "/scan": 60_000,
  "/balance": 5_000,
  "/positions": 5_000,
  "/orders": 5_000,
  "/status": 10_000,
  "/markets": 10_000,
  "/pnl": 10_000,
  "/config": 5_000,
};

const lastUsed = new Map<string, number>();

function isRateLimited(chatId: string | number, command: string): { limited: boolean; remainingMs: number } {
  const cooldown = COOLDOWNS_MS[command];
  if (!cooldown) return { limited: false, remainingMs: 0 };

  const key = `${chatId}:${command}`;
  const last = lastUsed.get(key) ?? 0;
  const elapsed = Date.now() - last;

  if (elapsed < cooldown) {
    return { limited: true, remainingMs: cooldown - elapsed };
  }

  lastUsed.set(key, Date.now());
  return { limited: false, remainingMs: 0 };
}

// ─── Telegram API helpers ──────────────────────────────────────────────────

async function apiPost(method: string, body: Record<string, unknown>): Promise<unknown> {
  const token = botToken();
  if (!token) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`${BASE}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res.ok ? res.json() : null;
  } catch (e) {
    logger.warn({ err: e, method }, "Telegram API call failed");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendReply(
  chatId: string | number,
  text: string,
  extra?: Record<string, unknown>
): Promise<unknown> {
  return apiPost("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
}

async function editMessage(
  chatId: string | number,
  messageId: number,
  text: string,
  extra?: Record<string, unknown>
): Promise<void> {
  await apiPost("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
}

async function answerCallback(callbackId: string, text?: string): Promise<void> {
  await apiPost("answerCallbackQuery", {
    callback_query_id: callbackId,
    text: text ?? "",
    show_alert: false,
  });
}

// ─── Command handlers ──────────────────────────────────────────────────────

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
    const question = pos.marketQuestion.length > 55 ? pos.marketQuestion.slice(0, 52) + "..." : pos.marketQuestion;

    lines.push(
      `${emoji} <b>${question}</b>`,
      `${pos.side} | ${pos.shares} shares @ ${(pos.avgPrice * 100).toFixed(0)}¢ → ${(pos.currentPrice * 100).toFixed(0)}¢`,
      `Value: $${pos.value.toFixed(2)} | P&L: ${sign}$${pos.pnl.toFixed(2)} (${sign}${pos.pnlPercent.toFixed(1)}%)`,
      ""
    );
  }

  await sendReply(chatId, lines.join("\n"));
}

async function handleOrders(chatId: string | number): Promise<void> {
  const all = portfolioState.getOrders();
  const recent = all.slice(0, 10);

  if (recent.length === 0) {
    await sendReply(chatId, "📭 <b>No orders found.</b>");
    return;
  }

  const statusEmoji: Record<string, string> = {
    open: "🟡",
    filled: "🟢",
    cancelled: "⚫",
    partial: "🔵",
  };

  const lines = [`📜 <b>Recent Orders (last ${recent.length})</b>`, ""];

  for (const order of recent) {
    const emoji = statusEmoji[order.status] ?? "⚪";
    const question = order.marketQuestion.length > 50 ? order.marketQuestion.slice(0, 47) + "..." : order.marketQuestion;
    const date = new Date(order.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });

    lines.push(
      `${emoji} <b>${question}</b>`,
      `${order.type} ${order.side} @ ${(order.price * 100).toFixed(0)}¢ | $${order.amount.toFixed(2)} | ${order.status.toUpperCase()}`,
      `<code>${order.id}</code> · ${date}`,
      ""
    );
  }

  const openCount = all.filter((o) => o.status === "open").length;
  if (openCount > 0) {
    lines.push(`<i>💡 ${openCount} open order${openCount === 1 ? "" : "s"} — use /cancel &lt;id&gt; to cancel</i>`);
  }

  await sendReply(chatId, lines.join("\n"));
}

async function handleCancelRequest(chatId: string | number, args: string[]): Promise<void> {
  const orderId = args[0];

  if (!orderId) {
    await sendReply(chatId, "❌ <b>Usage:</b> <code>/cancel &lt;order_id&gt;</code>\n\nUse /orders to see your order IDs.");
    return;
  }

  const all = portfolioState.getOrders();
  const order = all.find((o) => o.id === orderId);

  if (!order) {
    await sendReply(chatId, `❌ <b>Order not found:</b> <code>${orderId}</code>\n\nUse /orders to see valid order IDs.`);
    return;
  }

  if (order.status !== "open") {
    await sendReply(chatId, `⚠️ <b>Cannot cancel order <code>${orderId}</code></b>\n\nOrder is already <b>${order.status}</b>.`);
    return;
  }

  const question = order.marketQuestion.length > 55 ? order.marketQuestion.slice(0, 52) + "..." : order.marketQuestion;

  await sendReply(
    chatId,
    `⚠️ <b>Confirm cancellation?</b>\n\n<b>${question}</b>\n${order.type} ${order.side} @ ${(order.price * 100).toFixed(0)}¢ | $${order.amount.toFixed(2)}\n<code>${orderId}</code>`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Yes, cancel it", callback_data: `cancel_confirm:${orderId}` },
          { text: "❌ No, keep it", callback_data: `cancel_abort:${orderId}` },
        ]],
      },
    }
  );
}

async function handleCancelCallback(
  chatId: string | number,
  messageId: number,
  callbackId: string,
  data: string
): Promise<void> {
  const [action, orderId] = data.split(":");

  if (action === "cancel_abort") {
    await answerCallback(callbackId, "Kept — order not cancelled.");
    await editMessage(chatId, messageId, `✅ <b>Order kept.</b>\n\n<code>${orderId}</code> remains open.`);
    return;
  }

  if (action === "cancel_confirm") {
    const all = portfolioState.getOrders();
    const order = all.find((o) => o.id === orderId);

    if (!order || order.status !== "open") {
      await answerCallback(callbackId, "Order no longer cancellable.");
      await editMessage(chatId, messageId, `⚠️ <b>Order <code>${orderId}</code> is already ${order?.status ?? "not found"}.</b>`);
      return;
    }

    portfolioState.cancelOrder(orderId);
    const question = order.marketQuestion.length > 55 ? order.marketQuestion.slice(0, 52) + "..." : order.marketQuestion;

    await answerCallback(callbackId, "Order cancelled!");
    await editMessage(
      chatId,
      messageId,
      `⚫ <b>Order cancelled</b>\n\n<b>${question}</b>\n${order.type} ${order.side} @ ${(order.price * 100).toFixed(0)}¢ | $${order.amount.toFixed(2)}\n<code>${orderId}</code>`
    );
  }
}

async function handleScan(chatId: string | number): Promise<void> {
  await sendReply(chatId, "🔍 <b>Scanning strategy opportunities...</b>");

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
      const question = op.question.length > 55 ? op.question.slice(0, 52) + "..." : op.question;

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
  } catch (e) {
    logger.error({ err: e }, "Telegram bot: scan failed");
    await sendReply(chatId, "❌ <b>Scan failed.</b> Check the server logs for details.");
  }
}

async function handleMarkets(chatId: string | number, args: string[]): Promise<void> {
  const keyword = args.join(" ").trim().toLowerCase();

  if (!keyword) {
    await sendReply(chatId, "❌ <b>Usage:</b> <code>/markets &lt;keyword&gt;</code>\n\nExample: <code>/markets bitcoin</code>");
    return;
  }

  await sendReply(chatId, `🔎 <b>Searching markets for "${keyword}"...</b>`);

  try {
    const all = await getCachedMarkets();
    const matches = all
      .filter((m) => m.question.toLowerCase().includes(keyword))
      .slice(0, 6);

    if (matches.length === 0) {
      await sendReply(chatId, `📭 <b>No markets found for:</b> "${keyword}"`);
      return;
    }

    const lines = [`🏪 <b>Markets matching "${keyword}" (${matches.length})</b>`, ""];

    for (const m of matches) {
      const question = m.question.length > 60 ? m.question.slice(0, 57) + "..." : m.question;
      const yes = (m.yesPrice * 100).toFixed(0);
      const no = (m.noPrice * 100).toFixed(0);
      const vol = m.volume24h >= 1000 ? `$${(m.volume24h / 1000).toFixed(0)}k` : `$${m.volume24h.toFixed(0)}`;

      lines.push(
        `<b>${question}</b>`,
        `YES: ${yes}¢ | NO: ${no}¢ | 24h vol: ${vol}`,
        ""
      );
    }

    await sendReply(chatId, lines.join("\n"));
  } catch (e) {
    logger.error({ err: e }, "Telegram bot: markets search failed");
    await sendReply(chatId, "❌ <b>Search failed.</b> Could not reach Polymarket API.");
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

async function handlePnl(chatId: string | number): Promise<void> {
  interface PnlRow { date: string; pnl: number; cumulative: number }
  const rows = db.prepare(
    "SELECT date, pnl, cumulative FROM portfolio_pnl ORDER BY date DESC LIMIT 14"
  ).all() as PnlRow[];

  if (rows.length === 0) {
    await sendReply(chatId, "📭 <b>No P&L history yet.</b>\n\nPlace trades to start tracking.");
    return;
  }

  const sorted = [...rows].reverse();
  const lines = [`📊 <b>P&L History (last ${sorted.length} days)</b>`, ""];

  for (const row of sorted) {
    const sign = row.pnl >= 0 ? "+" : "";
    const cumSign = row.cumulative >= 0 ? "+" : "";
    const bar = row.pnl > 0 ? "🟢" : row.pnl < 0 ? "🔴" : "⚪";
    lines.push(
      `${bar} <b>${row.date}</b>  ${sign}$${row.pnl.toFixed(2)}  (cum: ${cumSign}$${row.cumulative.toFixed(2)})`
    );
  }

  const latest = sorted[sorted.length - 1];
  const total = latest.cumulative;
  const totalSign = total >= 0 ? "+" : "";
  const totalEmoji = total >= 0 ? "📈" : "📉";
  lines.push("", `${totalEmoji} <b>Total P&L: ${totalSign}$${total.toFixed(2)}</b>`);

  await sendReply(chatId, lines.join("\n"));
}

const CONFIG_NUMERIC_KEYS = new Set([
  "bankroll", "maxPositionPct", "minEdge", "minProbability",
  "maxDaysToResolution", "minVolume24h", "minLiquidity",
  "scanIntervalMinutes", "maxDailyTrades", "maxOpportunities",
]);

const CONFIG_BOOL_KEYS = new Set([
  "autoTradingEnabled", "telegramAlertsEnabled",
]);

async function handleConfig(chatId: string | number, args: string[]): Promise<void> {
  const config = getConfig();

  if (args.length === 0) {
    const boolEmoji = (v: boolean) => v ? "✅" : "❌";
    const lines = [
      `⚙️ <b>Strategy Configuration</b>`,
      "",
      `<b>Trading</b>`,
      `  Auto-trading: ${boolEmoji(config.autoTradingEnabled)} | Alerts: ${boolEmoji(config.telegramAlertsEnabled)}`,
      `  Bankroll: $${config.bankroll} | Max position: ${config.maxPositionPct}%`,
      `  Daily limit: ${config.maxDailyTrades} trades | Max opps: ${config.maxOpportunities}`,
      "",
      `<b>Filters</b>`,
      `  Min edge: ${(config.minEdge * 100).toFixed(1)}% | Min prob: ${(config.minProbability * 100).toFixed(0)}%`,
      `  Max days to resolve: ${config.maxDaysToResolution}d`,
      `  Min 24h vol: $${config.minVolume24h} | Min liquidity: $${config.minLiquidity}`,
      `  Scan interval: every ${config.scanIntervalMinutes} min`,
      "",
      `<i>💡 Update with: /config &lt;key&gt; &lt;value&gt;</i>`,
      `<i>e.g. /config bankroll 500 | /config autoTradingEnabled true</i>`,
    ];
    await sendReply(chatId, lines.join("\n"));
    return;
  }

  if (args.length < 2) {
    await sendReply(chatId, "❌ <b>Usage:</b> <code>/config &lt;key&gt; &lt;value&gt;</code>\n\nRun <code>/config</code> to see all settings.");
    return;
  }

  const [key, rawValue] = args;

  if (CONFIG_BOOL_KEYS.has(key)) {
    if (rawValue !== "true" && rawValue !== "false") {
      await sendReply(chatId, `❌ <b>${key}</b> must be <code>true</code> or <code>false</code>.`);
      return;
    }
    updateConfig({ [key]: rawValue === "true" } as Record<string, boolean>);
    await sendReply(chatId, `✅ <b>${key}</b> set to <b>${rawValue}</b>`);
    return;
  }

  if (CONFIG_NUMERIC_KEYS.has(key)) {
    const num = parseFloat(rawValue);
    if (isNaN(num) || num < 0) {
      await sendReply(chatId, `❌ <b>${key}</b> must be a positive number.`);
      return;
    }
    updateConfig({ [key]: num } as Record<string, number>);
    await sendReply(chatId, `✅ <b>${key}</b> set to <b>${num}</b>`);
    return;
  }

  const validKeys = [...CONFIG_NUMERIC_KEYS, ...CONFIG_BOOL_KEYS].join(", ");
  await sendReply(chatId, `❌ Unknown config key: <code>${key}</code>\n\nValid keys: <code>${validKeys}</code>`);
}

async function handleHelp(chatId: string | number): Promise<void> {
  const lines = [
    `🤖 <b>PolyTrader Bot Commands</b>`,
    "",
    `/balance — Portfolio balance and P&L summary`,
    `/positions — View all open positions`,
    `/orders — Recent order history with fill status`,
    `/cancel &lt;id&gt; — Cancel an open order (with confirmation)`,
    `/pnl — P&L history for the last 14 days`,
    `/config — View or update strategy settings`,
    `/markets &lt;keyword&gt; — Search Polymarket markets`,
    `/scan — Trigger a strategy scan for opportunities`,
    `/status — Auto-trader status and configuration`,
    `/help — Show this message`,
  ];
  await sendReply(chatId, lines.join("\n"));
}

// ─── Update router ─────────────────────────────────────────────────────────

interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
  date: number;
}

interface TelegramCallbackQuery {
  id: string;
  from: { id: number };
  message?: TelegramMessage;
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface GetUpdatesResponse {
  ok: boolean;
  result: TelegramUpdate[];
}

async function processCallback(cq: TelegramCallbackQuery): Promise<void> {
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const data = cq.data ?? "";

  if (!chatId || !messageId) {
    await answerCallback(cq.id);
    return;
  }

  const incomingId = String(cq.from.id);
  const authorizedId = authorizedChatId();
  if (authorizedId && incomingId !== authorizedId && String(chatId) !== authorizedId) {
    await answerCallback(cq.id, "Unauthorized");
    return;
  }

  if (data.startsWith("cancel_confirm:") || data.startsWith("cancel_abort:")) {
    await handleCancelCallback(chatId, messageId, cq.id, data);
    return;
  }

  await answerCallback(cq.id, "Unknown action");
}

async function processMessage(message: TelegramMessage): Promise<void> {
  if (!message.text || !message.chat?.id) return;

  const incomingChatId = String(message.chat.id);
  const authorizedId = authorizedChatId();

  if (authorizedId && incomingChatId !== authorizedId) {
    logger.warn({ incomingChatId, authorizedId }, "Telegram bot: unauthorized command");
    await sendReply(
      message.chat.id,
      "⛔ <b>Unauthorized.</b> This bot is private — only the configured chat can send commands."
    );
    return;
  }

  const text = message.text.trim();
  const parts = text.split(/\s+/);
  const command = parts[0].replace(/@.*$/, "").toLowerCase();
  const args = parts.slice(1);

  const rl = isRateLimited(message.chat.id, command);
  if (rl.limited) {
    const secs = Math.ceil(rl.remainingMs / 1000);
    await sendReply(message.chat.id, `⏳ Slow down — try <code>${command}</code> again in ${secs}s.`);
    return;
  }

  logger.info({ command, chatId: incomingChatId }, "Telegram bot: command received");

  switch (command) {
    case "/balance":     await handleBalance(message.chat.id); break;
    case "/positions":   await handlePositions(message.chat.id); break;
    case "/orders":      await handleOrders(message.chat.id); break;
    case "/cancel":      await handleCancelRequest(message.chat.id, args); break;
    case "/pnl":         await handlePnl(message.chat.id); break;
    case "/config":      await handleConfig(message.chat.id, args); break;
    case "/markets":     await handleMarkets(message.chat.id, args); break;
    case "/scan":        await handleScan(message.chat.id); break;
    case "/status":      await handleStatus(message.chat.id); break;
    case "/start":
    case "/help":        await handleHelp(message.chat.id); break;
    default:
      await sendReply(
        message.chat.id,
        `❓ Unknown command: <code>${command}</code>\n\nType /help to see available commands.`
      );
  }
}

async function processUpdate(update: TelegramUpdate): Promise<void> {
  if (update.callback_query) {
    await processCallback(update.callback_query);
  } else if (update.message) {
    await processMessage(update.message);
  }
}

// ─── Long-polling loop ─────────────────────────────────────────────────────

let polling = false;
let pollAbortController: AbortController | null = null;

async function poll(): Promise<void> {
  const token = botToken();
  if (!token) return;

  let lastUpdateId = loadLastUpdateId();
  pollAbortController = new AbortController();

  while (polling) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35_000);

    try {
      const url =
        `${BASE}/bot${token}/getUpdates` +
        `?offset=${lastUpdateId + 1}&timeout=30` +
        `&allowed_updates=${encodeURIComponent(JSON.stringify(["message", "callback_query"]))}`;

      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok) {
        logger.warn({ status: res.status }, "Telegram bot: getUpdates failed");
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }

      const data = (await res.json()) as GetUpdatesResponse;
      if (!data.ok || !Array.isArray(data.result)) continue;

      for (const update of data.result) {
        if (update.update_id > lastUpdateId) {
          lastUpdateId = update.update_id;
        }
        void processUpdate(update);
      }

      if (data.result.length > 0) {
        saveLastUpdateId(lastUpdateId);
      }
    } catch (e: unknown) {
      if (!polling) break;
      if (e instanceof Error && e.name === "AbortError") {
        continue;
      }
      logger.warn({ err: e }, "Telegram bot: poll error, retrying in 5s");
      await new Promise((r) => setTimeout(r, 5000));
    } finally {
      clearTimeout(timeout);
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

  logger.info("Telegram command bot started (poly.db state persistence active)");
  void poll();
}

export function stopTelegramBot(): void {
  polling = false;
  pollAbortController?.abort();
  pollAbortController = null;
  logger.info("Telegram command bot stopped");
}
