import { logger } from "../lib/db";
import db from "../lib/db";
import { portfolioState } from "../lib/state";
import { getAutoTraderStats } from "./autoTrader";
import { getConfig, updateConfig, scanOpportunities } from "./strategy";
import { getCachedMarkets } from "./polymarket";
import { isClobConfigured, getUsdcBalance } from "./clob";

const BASE = "https://api.telegram.org";

function getDbCred(key: string): string | undefined {
  const row = db.prepare("SELECT value FROM app_credentials WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value || undefined;
}

function setDbCred(key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO app_credentials (key, value) VALUES (?, ?)").run(key, value);
}

function botToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN || getDbCred("TELEGRAM_BOT_TOKEN");
}

function authorizedChatId(): string | undefined {
  return process.env.TELEGRAM_CHAT_ID || getDbCred("TELEGRAM_CHAT_ID");
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
  "/creds": 5_000,
  "/setcred": 2_000,
  "/resetdemo": 30_000,
  "/watch": 3_000,
  "/unwatch": 3_000,
  "/watchlist": 5_000,
  "/alert": 3_000,
  "/alerts": 5_000,
  "/delalert": 3_000,
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
  "dailyReportHour",
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

const CRED_KEY_MAP: Record<string, string> = {
  privatekey:    "POLYMARKET_PRIVATE_KEY",
  apikey:        "POLYMARKET_API_KEY",
  apisecret:     "POLYMARKET_API_SECRET",
  apipassphrase: "POLYMARKET_API_PASSPHRASE",
  chatid:        "TELEGRAM_CHAT_ID",
};

async function handleSetCred(chatId: string | number, args: string[]): Promise<void> {
  if (args.length < 2) {
    const keys = Object.keys(CRED_KEY_MAP).join(" | ");
    await sendReply(
      chatId,
      `🔐 <b>Usage:</b> <code>/setcred &lt;type&gt; &lt;value&gt;</code>\n\n` +
      `<b>Types:</b> <code>${keys}</code>\n\n` +
      `<b>Examples:</b>\n` +
      `<code>/setcred privatekey 0xabc123...</code>\n` +
      `<code>/setcred apikey abc123...</code>\n` +
      `<code>/setcred apisecret abc123...</code>\n` +
      `<code>/setcred apipassphrase abc123...</code>\n\n` +
      `⚠️ <i>For security, delete this message after sending.</i>`
    );
    return;
  }

  const type = args[0].toLowerCase();
  const value = args.slice(1).join(" ").trim();

  const dbKey = CRED_KEY_MAP[type];
  if (!dbKey) {
    const keys = Object.keys(CRED_KEY_MAP).join(", ");
    await sendReply(chatId, `❌ Unknown credential type: <code>${type}</code>\n\nValid types: <code>${keys}</code>`);
    return;
  }

  if (!value) {
    await sendReply(chatId, `❌ Value cannot be empty.`);
    return;
  }

  setDbCred(dbKey, value);

  const maskedValue = value.length > 8
    ? `${value.slice(0, 4)}${"•".repeat(Math.min(value.length - 8, 12))}${value.slice(-4)}`
    : "••••";

  await sendReply(
    chatId,
    `✅ <b>${dbKey}</b> saved.\n\nValue: <code>${maskedValue}</code>\n\n` +
    `⚠️ <i>Please delete the message containing your credential for security.</i>\n` +
    `Restart the server or wait for next scan to take effect.`
  );
}

async function handleCreds(chatId: string | number): Promise<void> {
  function credStatus(envKey: string): string {
    const fromEnv = !!process.env[envKey];
    const fromDb = !!getDbCred(envKey);
    if (fromEnv) return "✅ Set (env)";
    if (fromDb) return "✅ Set (db)";
    return "❌ Not set";
  }

  function maskedCred(envKey: string): string {
    const val = process.env[envKey] || getDbCred(envKey);
    if (!val) return "";
    if (val.length <= 8) return "••••";
    return `${val.slice(0, 4)}${"•".repeat(8)}${val.slice(-4)}`;
  }

  const privKey = credStatus("POLYMARKET_PRIVATE_KEY");
  const apiKey = credStatus("POLYMARKET_API_KEY");
  const apiSecret = credStatus("POLYMARKET_API_SECRET");
  const apiPassphrase = credStatus("POLYMARKET_API_PASSPHRASE");
  const tgToken = credStatus("TELEGRAM_BOT_TOKEN");
  const tgChat = credStatus("TELEGRAM_CHAT_ID");

  const privMask = maskedCred("POLYMARKET_PRIVATE_KEY");
  const apiMask = maskedCred("POLYMARKET_API_KEY");

  const lines = [
    `🔐 <b>Credential Status</b>`,
    "",
    `<b>Polymarket CLOB</b>`,
    `  Private Key: ${privKey}${privMask ? ` <code>${privMask}</code>` : ""}`,
    `  API Key: ${apiKey}${apiMask ? ` <code>${apiMask}</code>` : ""}`,
    `  API Secret: ${apiSecret}`,
    `  API Passphrase: ${apiPassphrase}`,
    "",
    `<b>Telegram</b>`,
    `  Bot Token: ${tgToken}`,
    `  Chat ID: ${tgChat}`,
    "",
    `<i>Use /setcred &lt;type&gt; &lt;value&gt; to add missing credentials.</i>`,
  ];

  await sendReply(chatId, lines.join("\n"));
}

export function seedDemoData(): { orders: number; positions: number; pnl: number; autoTrades: number } {
  const markets = [
    { id: "mkt-001", question: "Will the Federal Reserve cut rates at the June 2026 FOMC meeting?" },
    { id: "mkt-002", question: "Will Bitcoin stay above $90,000 through June 2026?" },
    { id: "mkt-003", question: "Will Donald Trump sign a new executive order on AI by July 2026?" },
    { id: "mkt-004", question: "Will Apple announce a new AI chip at WWDC 2026?" },
    { id: "mkt-005", question: "Will Ethereum ETH price exceed $3,000 by end of May 2026?" },
    { id: "mkt-006", question: "Will the S&P 500 close above 5,800 in June 2026?" },
    { id: "mkt-007", question: "Will SpaceX successfully launch Starship to orbit before August 2026?" },
    { id: "mkt-008", question: "Will OpenAI release GPT-5 before September 2026?" },
    { id: "mkt-009", question: "Will Tesla stock exceed $300 by end of Q2 2026?" },
    { id: "mkt-010", question: "Will the US unemployment rate drop below 4% by July 2026?" },
    { id: "mkt-011", question: "Will Solana SOL price exceed $200 before July 2026?" },
    { id: "mkt-012", question: "Will Meta release a new AR glasses product in 2026?" },
  ];
  const mq = (id: string) => markets.find((m) => m.id === id)!.question;

  db.exec("DELETE FROM portfolio_orders");
  db.exec("DELETE FROM portfolio_positions");
  db.exec("DELETE FROM portfolio_pnl");
  db.exec("DELETE FROM auto_trade_history");

  const insertOrder = db.prepare(
    `INSERT INTO portfolio_orders (id, market_id, market_question, side, type, price, amount, shares, status, created_at)
     VALUES (@id, @market_id, @market_question, @side, @type, @price, @amount, @shares, @status, @created_at)`
  );

  const orders = [
    { id:"ord-001", market_id:"mkt-001", side:"YES", type:"BUY",  price:0.72, shares:200, status:"filled",    created_at:"2026-01-10T09:23:11Z" },
    { id:"ord-002", market_id:"mkt-002", side:"YES", type:"BUY",  price:0.81, shares:250, status:"filled",    created_at:"2026-01-15T14:05:32Z" },
    { id:"ord-003", market_id:"mkt-005", side:"YES", type:"BUY",  price:0.68, shares:200, status:"filled",    created_at:"2026-01-20T11:48:00Z" },
    { id:"ord-004", market_id:"mkt-003", side:"YES", type:"BUY",  price:0.55, shares:300, status:"filled",    created_at:"2026-01-25T16:30:00Z" },
    { id:"ord-005", market_id:"mkt-006", side:"YES", type:"BUY",  price:0.63, shares:150, status:"filled",    created_at:"2026-02-03T10:12:00Z" },
    { id:"ord-006", market_id:"mkt-004", side:"YES", type:"BUY",  price:0.77, shares:180, status:"filled",    created_at:"2026-02-10T13:55:00Z" },
    { id:"ord-007", market_id:"mkt-007", side:"YES", type:"BUY",  price:0.44, shares:400, status:"filled",    created_at:"2026-02-18T09:00:00Z" },
    { id:"ord-008", market_id:"mkt-005", side:"YES", type:"SELL", price:0.82, shares:100, status:"filled",    created_at:"2026-02-22T15:20:00Z" },
    { id:"ord-009", market_id:"mkt-008", side:"YES", type:"BUY",  price:0.58, shares:250, status:"filled",    created_at:"2026-03-01T08:45:00Z" },
    { id:"ord-010", market_id:"mkt-009", side:"NO",  type:"BUY",  price:0.35, shares:300, status:"filled",    created_at:"2026-03-08T11:30:00Z" },
    { id:"ord-011", market_id:"mkt-002", side:"YES", type:"BUY",  price:0.79, shares:100, status:"filled",    created_at:"2026-03-12T14:10:00Z" },
    { id:"ord-012", market_id:"mkt-010", side:"YES", type:"BUY",  price:0.48, shares:200, status:"filled",    created_at:"2026-03-20T10:00:00Z" },
    { id:"ord-013", market_id:"mkt-006", side:"YES", type:"SELL", price:0.71, shares:80,  status:"filled",    created_at:"2026-03-25T16:40:00Z" },
    { id:"ord-014", market_id:"mkt-011", side:"YES", type:"BUY",  price:0.52, shares:350, status:"filled",    created_at:"2026-04-02T09:15:00Z" },
    { id:"ord-015", market_id:"mkt-012", side:"YES", type:"BUY",  price:0.66, shares:220, status:"filled",    created_at:"2026-04-08T12:00:00Z" },
    { id:"ord-016", market_id:"mkt-003", side:"YES", type:"SELL", price:0.72, shares:150, status:"filled",    created_at:"2026-04-12T15:30:00Z" },
    { id:"ord-017", market_id:"mkt-007", side:"YES", type:"BUY",  price:0.51, shares:200, status:"filled",    created_at:"2026-04-15T10:45:00Z" },
    { id:"ord-018", market_id:"mkt-009", side:"NO",  type:"SELL", price:0.28, shares:150, status:"filled",    created_at:"2026-04-18T14:20:00Z" },
    { id:"ord-019", market_id:"mkt-008", side:"YES", type:"BUY",  price:0.61, shares:150, status:"partial",   created_at:"2026-04-22T11:00:00Z" },
    { id:"ord-020", market_id:"mkt-001", side:"YES", type:"BUY",  price:0.88, shares:100, status:"open",      created_at:"2026-04-28T09:30:00Z" },
    { id:"ord-021", market_id:"mkt-011", side:"YES", type:"BUY",  price:0.64, shares:100, status:"open",      created_at:"2026-04-29T10:15:00Z" },
    { id:"ord-022", market_id:"mkt-004", side:"YES", type:"SELL", price:0.90, shares:90,  status:"cancelled", created_at:"2026-04-20T13:00:00Z" },
  ];

  db.transaction(() => {
    for (const o of orders) {
      insertOrder.run({ ...o, market_question: mq(o.market_id), amount: parseFloat((o.price * o.shares).toFixed(2)) });
    }
  })();

  const insertPos = db.prepare(
    `INSERT INTO portfolio_positions (id, market_id, market_question, side, shares, avg_price, current_price, pnl, pnl_percent, value)
     VALUES (@id, @market_id, @market_question, @side, @shares, @avg_price, @current_price, @pnl, @pnl_percent, @value)`
  );

  const posData = [
    { id:"pos-001", market_id:"mkt-001", side:"YES", shares:300, avg:0.76, cur:0.87 },
    { id:"pos-002", market_id:"mkt-002", side:"YES", shares:350, avg:0.80, cur:0.85 },
    { id:"pos-003", market_id:"mkt-005", side:"YES", shares:100, avg:0.68, cur:0.54 },
    { id:"pos-004", market_id:"mkt-007", side:"YES", shares:600, avg:0.47, cur:0.61 },
    { id:"pos-005", market_id:"mkt-008", side:"YES", shares:400, avg:0.59, cur:0.67 },
    { id:"pos-006", market_id:"mkt-009", side:"NO",  shares:150, avg:0.35, cur:0.29 },
    { id:"pos-007", market_id:"mkt-011", side:"YES", shares:450, avg:0.54, cur:0.71 },
    { id:"pos-008", market_id:"mkt-012", side:"YES", shares:220, avg:0.66, cur:0.72 },
  ];

  db.transaction(() => {
    for (const p of posData) {
      const cost = p.shares * p.avg;
      const value = parseFloat((p.shares * p.cur).toFixed(2));
      const pnl = parseFloat((value - cost).toFixed(2));
      const pnl_percent = parseFloat(((pnl / cost) * 100).toFixed(2));
      insertPos.run({ id:p.id, market_id:p.market_id, market_question:mq(p.market_id), side:p.side, shares:p.shares, avg_price:p.avg, current_price:p.cur, pnl, pnl_percent, value });
    }
  })();

  const insertPnl = db.prepare(`INSERT OR REPLACE INTO portfolio_pnl (date, pnl, cumulative) VALUES (?, ?, ?)`);
  const baseDate = new Date("2026-01-05");
  const dailyPnls = [
    0,0,4.2,0,8.5,-2.1,0,12.3,0,6.8,-4.5,0,9.1,3.2,0,-1.8,14.6,0,7.3,2.5,
    0,-6.2,0,11.4,5.9,0,-3.3,8.7,0,16.2,0,4.1,-2.8,0,9.5,13.0,0,-5.1,7.8,0,
    11.2,0,6.4,-1.5,0,18.3,4.7,0,-3.9,8.1,0,14.5,2.3,0,-7.2,10.6,0,5.8,19.1,0,
    -2.4,12.7,0,6.2,3.5,0,-4.8,15.9,0,8.3,22.4,0,-3.1,11.8,0,7.6,4.9,0,-5.5,13.4,
    0,9.2,25.1,0,-2.7,16.3,0,6.9,5.2,0,
  ];
  let cum = 0;
  db.transaction(() => {
    for (let i = 0; i < dailyPnls.length; i++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + i);
      cum = parseFloat((cum + dailyPnls[i]).toFixed(2));
      insertPnl.run(d.toISOString().slice(0, 10), dailyPnls[i], cum);
    }
  })();

  const insertAT = db.prepare(
    `INSERT INTO auto_trade_history (timestamp, market_id, question, side, price, amount, edge, composite_score, order_id, success, error)
     VALUES (@timestamp, @market_id, @question, @side, @price, @amount, @edge, @composite_score, @order_id, @success, @error)`
  );

  const atData = [
    { timestamp:"2026-03-01T08:30:00Z", market_id:"mkt-008", side:"YES", price:0.57, amount:57.0,  edge:0.14, composite_score:0.78, order_id:"auto-ord-001", success:1, error:null },
    { timestamp:"2026-03-08T09:00:00Z", market_id:"mkt-009", side:"NO",  price:0.35, amount:35.0,  edge:0.19, composite_score:0.82, order_id:"auto-ord-002", success:1, error:null },
    { timestamp:"2026-03-15T08:45:00Z", market_id:"mkt-010", side:"YES", price:0.48, amount:48.0,  edge:0.11, composite_score:0.71, order_id:"auto-ord-003", success:1, error:null },
    { timestamp:"2026-03-22T09:15:00Z", market_id:"mkt-007", side:"YES", price:0.44, amount:44.0,  edge:0.22, composite_score:0.85, order_id:"auto-ord-004", success:1, error:null },
    { timestamp:"2026-03-29T08:30:00Z", market_id:"mkt-011", side:"YES", price:0.51, amount:51.0,  edge:0.17, composite_score:0.79, order_id:null,           success:0, error:"Insufficient liquidity at target price" },
    { timestamp:"2026-04-05T09:00:00Z", market_id:"mkt-012", side:"YES", price:0.65, amount:65.0,  edge:0.13, composite_score:0.74, order_id:"auto-ord-006", success:1, error:null },
    { timestamp:"2026-04-08T08:30:00Z", market_id:"mkt-002", side:"YES", price:0.79, amount:79.0,  edge:0.10, composite_score:0.70, order_id:"auto-ord-007", success:1, error:null },
    { timestamp:"2026-04-12T09:00:00Z", market_id:"mkt-004", side:"YES", price:0.76, amount:76.0,  edge:0.16, composite_score:0.81, order_id:"auto-ord-008", success:1, error:null },
    { timestamp:"2026-04-17T08:45:00Z", market_id:"mkt-001", side:"YES", price:0.84, amount:84.0,  edge:0.12, composite_score:0.76, order_id:null,           success:0, error:"Order rejected: price moved before submission" },
    { timestamp:"2026-04-22T09:15:00Z", market_id:"mkt-011", side:"YES", price:0.63, amount:63.0,  edge:0.20, composite_score:0.87, order_id:"auto-ord-010", success:1, error:null },
    { timestamp:"2026-04-25T08:30:00Z", market_id:"mkt-008", side:"YES", price:0.60, amount:60.0,  edge:0.15, composite_score:0.80, order_id:"auto-ord-011", success:1, error:null },
    { timestamp:"2026-04-28T09:00:00Z", market_id:"mkt-007", side:"YES", price:0.56, amount:56.0,  edge:0.18, composite_score:0.83, order_id:"auto-ord-012", success:1, error:null },
  ];

  db.transaction(() => {
    for (const t of atData) insertAT.run({ ...t, question: mq(t.market_id) });
  })();

  return {
    orders: (db.prepare("SELECT COUNT(*) as c FROM portfolio_orders").get() as { c: number }).c,
    positions: (db.prepare("SELECT COUNT(*) as c FROM portfolio_positions").get() as { c: number }).c,
    pnl: (db.prepare("SELECT COUNT(*) as c FROM portfolio_pnl").get() as { c: number }).c,
    autoTrades: (db.prepare("SELECT COUNT(*) as c FROM auto_trade_history").get() as { c: number }).c,
  };
}

async function handleResetDemo(chatId: string | number): Promise<void> {
  await sendReply(chatId, "🔄 <b>Resetting demo data…</b>");
  try {
    const counts = seedDemoData();
    await sendReply(
      chatId,
      `✅ <b>Demo data reset complete!</b>\n\n` +
      `📜 Orders: ${counts.orders}\n` +
      `📊 Positions: ${counts.positions}\n` +
      `📈 P&L history: ${counts.pnl} days\n` +
      `🤖 Auto-trade history: ${counts.autoTrades}`
    );
  } catch (e) {
    logger.error({ err: e }, "Telegram bot: resetdemo failed");
    await sendReply(chatId, "❌ <b>Reset failed.</b> Check server logs for details.");
  }
}

interface WatchlistRow {
  market_id: string;
  market_question: string;
  category: string;
  yes_price: number;
  no_price: number;
  added_at: string;
}

async function handleWatch(chatId: string | number, args: string[]): Promise<void> {
  const marketId = args[0]?.trim();
  if (!marketId) {
    await sendReply(chatId, "❌ <b>Usage:</b> <code>/watch &lt;marketId&gt;</code>\n\nUse /markets to find market IDs.");
    return;
  }

  const existing = db.prepare("SELECT market_id FROM market_watchlist WHERE market_id = ?").get(marketId) as { market_id: string } | undefined;
  if (existing) {
    await sendReply(chatId, `⭐ <b>${marketId}</b> is already in your watchlist.`);
    return;
  }

  const allMarkets = await getCachedMarkets().catch(() => []);
  let question = "";
  let category = "";
  let yesPrice = 0.5;
  let noPrice = 0.5;
  let volume24h = 0;

  const found = allMarkets.find((m) => m.id === marketId);
  if (found) {
    question = found.question;
    category = found.category;
    yesPrice = found.yesPrice;
    noPrice = found.noPrice;
    volume24h = found.volume24h;
  } else {
    question = `Market ${marketId}`;
  }

  db.prepare(
    `INSERT OR REPLACE INTO market_watchlist (market_id, market_question, category, yes_price, no_price, volume24h, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(marketId, question, category, yesPrice, noPrice, volume24h, new Date().toISOString());

  await sendReply(
    chatId,
    `⭐ <b>Added to watchlist!</b>\n\n<b>${question}</b>\nYES: ${(yesPrice * 100).toFixed(0)}¢ | NO: ${(noPrice * 100).toFixed(0)}¢`
  );
}

async function handleUnwatch(chatId: string | number, args: string[]): Promise<void> {
  const marketId = args[0]?.trim();
  if (!marketId) {
    await sendReply(chatId, "❌ <b>Usage:</b> <code>/unwatch &lt;marketId&gt;</code>");
    return;
  }

  const result = db.prepare("DELETE FROM market_watchlist WHERE market_id = ?").run(marketId);
  if (result.changes === 0) {
    await sendReply(chatId, `❓ <code>${marketId}</code> is not in your watchlist.`);
    return;
  }

  await sendReply(chatId, `✅ <b>Removed from watchlist:</b> <code>${marketId}</code>`);
}

async function handleWatchlist(chatId: string | number): Promise<void> {
  const rows = db.prepare(
    "SELECT market_id, market_question, category, yes_price, no_price, added_at FROM market_watchlist ORDER BY added_at DESC LIMIT 10"
  ).all() as WatchlistRow[];

  if (rows.length === 0) {
    await sendReply(chatId, "📭 <b>Your watchlist is empty.</b>\n\nUse /watch &lt;marketId&gt; to add markets.");
    return;
  }

  const lines = [`⭐ <b>Your Watchlist (${rows.length})</b>`, ""];
  for (const r of rows) {
    const q = r.market_question.length > 55 ? r.market_question.slice(0, 52) + "..." : r.market_question;
    lines.push(
      `<b>${q}</b>`,
      `YES: ${(r.yes_price * 100).toFixed(0)}¢ | NO: ${(r.no_price * 100).toFixed(0)}¢ | ID: <code>${r.market_id}</code>`,
      ""
    );
  }

  await sendReply(chatId, lines.join("\n"));
}

interface AlertRow {
  id: number;
  market_id: string;
  market_question: string;
  side: string;
  direction: string;
  target_price: number;
  triggered: number;
}

async function handleAlert(chatId: string | number, args: string[]): Promise<void> {
  if (args.length < 4) {
    await sendReply(
      chatId,
      `📊 <b>Usage:</b> <code>/alert &lt;marketId&gt; &lt;yes|no&gt; &lt;above|below&gt; &lt;price%&gt;</code>\n\n` +
      `<b>Example:</b> <code>/alert mkt-001 yes above 80</code>\n` +
      `This alerts when the YES price goes above 80¢.`
    );
    return;
  }

  const [marketId, sideRaw, directionRaw, priceRaw] = args;
  const side = sideRaw.toUpperCase();
  const direction = directionRaw.toLowerCase();

  if (!["YES", "NO"].includes(side)) {
    await sendReply(chatId, "❌ Side must be <code>yes</code> or <code>no</code>.");
    return;
  }

  if (!["above", "below"].includes(direction)) {
    await sendReply(chatId, "❌ Direction must be <code>above</code> or <code>below</code>.");
    return;
  }

  const pricePct = parseFloat(priceRaw);
  if (isNaN(pricePct) || pricePct <= 0 || pricePct >= 100) {
    await sendReply(chatId, "❌ Price must be a number between 1 and 99 (in cents, e.g. 80 = 80¢).");
    return;
  }

  const targetPrice = pricePct / 100;

  const allMarkets = await getCachedMarkets().catch(() => []);
  const market = allMarkets.find((m) => m.id === marketId);
  const marketQuestion = market?.question ?? `Market ${marketId}`;

  db.prepare(
    `INSERT INTO price_alerts (market_id, market_question, side, direction, target_price, triggered, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  ).run(marketId, marketQuestion, side, direction, targetPrice, new Date().toISOString());

  await sendReply(
    chatId,
    `🔔 <b>Alert set!</b>\n\n` +
    `<b>${marketQuestion}</b>\n` +
    `Alert when <b>${side}</b> goes <b>${direction}</b> <b>${pricePct.toFixed(0)}¢</b>\n\n` +
    `<i>Make sure telegramAlertsEnabled is true to receive notifications.</i>`
  );
}

async function handleAlerts(chatId: string | number): Promise<void> {
  const rows = db.prepare(
    "SELECT id, market_id, market_question, side, direction, target_price, triggered FROM price_alerts ORDER BY triggered ASC, created_at DESC LIMIT 15"
  ).all() as AlertRow[];

  if (rows.length === 0) {
    await sendReply(chatId, "📭 <b>No price alerts set.</b>\n\nUse /alert to create one.");
    return;
  }

  const active = rows.filter((r) => r.triggered === 0);
  const done = rows.filter((r) => r.triggered === 1);

  const lines = [`🔔 <b>Price Alerts</b>`, ""];

  if (active.length > 0) {
    lines.push(`<b>Active (${active.length})</b>`);
    for (const r of active) {
      const q = r.market_question.length > 50 ? r.market_question.slice(0, 47) + "..." : r.market_question;
      lines.push(`  🟡 [${r.id}] ${r.side} ${r.direction} ${(r.target_price * 100).toFixed(0)}¢ — ${q}`);
    }
    lines.push("");
  }

  if (done.length > 0) {
    lines.push(`<b>Triggered (${done.length})</b>`);
    for (const r of done.slice(0, 5)) {
      const q = r.market_question.length > 50 ? r.market_question.slice(0, 47) + "..." : r.market_question;
      lines.push(`  ✅ [${r.id}] ${r.side} ${r.direction} ${(r.target_price * 100).toFixed(0)}¢ — ${q}`);
    }
    lines.push("");
  }

  lines.push(`<i>Use /delalert &lt;id&gt; to remove an alert.</i>`);
  await sendReply(chatId, lines.join("\n"));
}

async function handleDelAlert(chatId: string | number, args: string[]): Promise<void> {
  const id = parseInt(args[0] ?? "", 10);
  if (isNaN(id)) {
    await sendReply(chatId, "❌ <b>Usage:</b> <code>/delalert &lt;id&gt;</code>\n\nUse /alerts to see alert IDs.");
    return;
  }

  const result = db.prepare("DELETE FROM price_alerts WHERE id = ?").run(id);
  if (result.changes === 0) {
    await sendReply(chatId, `❓ Alert <code>#${id}</code> not found.`);
    return;
  }

  await sendReply(chatId, `✅ <b>Alert <code>#${id}</code> deleted.</b>`);
}

async function handleHelp(chatId: string | number): Promise<void> {
  const lines = [
    `🤖 <b>PolyTrader Bot Commands</b>`,
    "",
    `<b>Portfolio</b>`,
    `/balance — Balance and P&L summary`,
    `/positions — Open positions`,
    `/orders — Recent order history`,
    `/cancel &lt;id&gt; — Cancel an open order`,
    `/pnl — P&L history (last 14 days)`,
    "",
    `<b>Markets</b>`,
    `/markets &lt;keyword&gt; — Search markets`,
    `/scan — Trigger strategy scan`,
    `/watch &lt;marketId&gt; — Add to watchlist`,
    `/unwatch &lt;marketId&gt; — Remove from watchlist`,
    `/watchlist — View your watchlist`,
    "",
    `<b>Alerts</b>`,
    `/alert &lt;id&gt; &lt;yes|no&gt; &lt;above|below&gt; &lt;price%&gt; — Set price alert`,
    `/alerts — View all price alerts`,
    `/delalert &lt;id&gt; — Delete a price alert`,
    "",
    `<b>Config &amp; Settings</b>`,
    `/config — View or update strategy settings`,
    `/status — Auto-trader status`,
    `/creds — Show credential status`,
    `/setcred &lt;type&gt; &lt;value&gt; — Save credential to DB`,
    `/resetdemo — Reset portfolio to demo data`,
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
    case "/balance":    await handleBalance(message.chat.id); break;
    case "/positions":  await handlePositions(message.chat.id); break;
    case "/orders":     await handleOrders(message.chat.id); break;
    case "/cancel":     await handleCancelRequest(message.chat.id, args); break;
    case "/pnl":        await handlePnl(message.chat.id); break;
    case "/config":     await handleConfig(message.chat.id, args); break;
    case "/markets":    await handleMarkets(message.chat.id, args); break;
    case "/scan":       await handleScan(message.chat.id); break;
    case "/status":     await handleStatus(message.chat.id); break;
    case "/setcred":    await handleSetCred(message.chat.id, args); break;
    case "/creds":      await handleCreds(message.chat.id); break;
    case "/resetdemo":  await handleResetDemo(message.chat.id); break;
    case "/watch":      await handleWatch(message.chat.id, args); break;
    case "/unwatch":    await handleUnwatch(message.chat.id, args); break;
    case "/watchlist":  await handleWatchlist(message.chat.id); break;
    case "/alert":      await handleAlert(message.chat.id, args); break;
    case "/alerts":     await handleAlerts(message.chat.id); break;
    case "/delalert":   await handleDelAlert(message.chat.id, args); break;
    case "/start":
    case "/help":       await handleHelp(message.chat.id); break;
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
