import { ethers } from "ethers";
import { createHmac, randomBytes } from "crypto";
import { logger } from "../lib/logger";
import db from "../lib/db";

function getDbCred(key: string): string | undefined {
  const row = db.prepare("SELECT value FROM app_credentials WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value || undefined;
}

const CLOB_URL = "https://clob.polymarket.com";
const CHAIN_ID = 137;
const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";
const USDC_DECIMALS = 6;

const EIP712_DOMAIN = {
  name: "Polymarket CTF Exchange",
  version: "1",
  chainId: CHAIN_ID,
  verifyingContract: CTF_EXCHANGE,
};

const ORDER_TYPES = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "taker", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "feeRateBps", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
  ],
};

interface ClobCredentials {
  privateKey: string;
  apiKey: string;
  apiSecret: string;
  apiPassphrase: string;
}

export interface PlaceOrderParams {
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  amount: number;
  question: string;
}

function getCreds(): ClobCredentials | null {
  const privateKey = process.env.POLYMARKET_PRIVATE_KEY || getDbCred("POLYMARKET_PRIVATE_KEY");
  const apiKey = process.env.POLYMARKET_API_KEY || getDbCred("POLYMARKET_API_KEY");
  const apiSecret = process.env.POLYMARKET_API_SECRET || getDbCred("POLYMARKET_API_SECRET");
  const apiPassphrase = process.env.POLYMARKET_API_PASSPHRASE || getDbCred("POLYMARKET_API_PASSPHRASE");

  if (!privateKey || !apiKey || !apiSecret || !apiPassphrase) return null;

  return { privateKey, apiKey, apiSecret, apiPassphrase };
}

export function isClobConfigured(): boolean {
  return getCreds() !== null;
}

function getWalletAddress(): string | null {
  const pk = process.env.POLYMARKET_PRIVATE_KEY || getDbCred("POLYMARKET_PRIVATE_KEY");
  if (!pk) return null;
  try {
    const wallet = new ethers.Wallet(pk);
    return wallet.address;
  } catch {
    return null;
  }
}

function buildL2AuthHeaders(
  creds: ClobCredentials,
  method: string,
  path: string,
  body = ""
): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const msg = timestamp + method.toUpperCase() + path + body;
  const sig = createHmac("sha256", creds.apiSecret)
    .update(msg)
    .digest("base64");

  return {
    "Content-Type": "application/json",
    "POLY_ADDRESS": getWalletAddress() ?? "",
    "POLY_SIGNATURE": sig,
    "POLY_TIMESTAMP": timestamp,
    "POLY_API_KEY": creds.apiKey,
    "POLY_PASSPHRASE": creds.apiPassphrase,
  };
}

async function signOrder(
  wallet: ethers.Wallet,
  orderStruct: Record<string, unknown>
): Promise<string> {
  return wallet.signTypedData(EIP712_DOMAIN, ORDER_TYPES, orderStruct);
}

function toUsdc(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
}

function priceToMakerTaker(
  side: "BUY" | "SELL",
  price: number,
  usdcAmount: number
): { makerAmount: bigint; takerAmount: bigint } {
  const usdc = toUsdc(usdcAmount);
  const priceScaled = BigInt(Math.round(price * 10 ** 6));
  const ONE = BigInt(10 ** 6);

  if (side === "BUY") {
    const tokenAmount = (usdc * ONE) / priceScaled;
    return { makerAmount: usdc, takerAmount: tokenAmount };
  } else {
    const usdcOut = (usdc * priceScaled) / ONE;
    return { makerAmount: usdc, takerAmount: usdcOut };
  }
}

export async function getUsdcBalance(): Promise<number> {
  const creds = getCreds();
  if (!creds) return 0;
  const address = getWalletAddress();
  if (!address) return 0;

  try {
    const headers = buildL2AuthHeaders(creds, "GET", "/balance");
    const res = await fetch(`${CLOB_URL}/balance?address=${address}`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return 0;
    const data = await res.json() as { balance?: string };
    return parseFloat(data.balance ?? "0");
  } catch (e) {
    logger.warn({ err: e }, "Failed to fetch USDC balance");
    return 0;
  }
}

export async function placeOrder(
  params: PlaceOrderParams
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  const creds = getCreds();
  if (!creds) {
    return { success: false, error: "Polymarket credentials not configured" };
  }

  const address = getWalletAddress();
  if (!address) {
    return { success: false, error: "Invalid private key" };
  }

  let wallet: ethers.Wallet;
  try {
    wallet = new ethers.Wallet(creds.privateKey);
  } catch (e) {
    return { success: false, error: "Invalid private key format" };
  }

  const salt = BigInt("0x" + randomBytes(16).toString("hex"));
  const sideUint8 = params.side === "BUY" ? 0 : 1;
  const { makerAmount, takerAmount } = priceToMakerTaker(params.side, params.price, params.amount);

  const orderStruct = {
    salt,
    maker: address,
    signer: address,
    taker: "0x0000000000000000000000000000000000000000",
    tokenId: BigInt(params.tokenId || "0"),
    makerAmount,
    takerAmount,
    expiration: BigInt(0),
    nonce: BigInt(0),
    feeRateBps: BigInt(0),
    side: sideUint8,
    signatureType: 0,
  };

  let signature: string;
  try {
    signature = await signOrder(wallet, orderStruct);
  } catch (e) {
    logger.error({ err: e }, "Failed to sign order");
    return { success: false, error: "Order signing failed" };
  }

  const body = JSON.stringify({
    order: {
      salt: salt.toString(),
      maker: address,
      signer: address,
      taker: "0x0000000000000000000000000000000000000000",
      tokenId: params.tokenId,
      makerAmount: makerAmount.toString(),
      takerAmount: takerAmount.toString(),
      expiration: "0",
      nonce: "0",
      feeRateBps: "0",
      side: params.side,
      signatureType: 0,
      signature,
    },
    owner: creds.apiKey,
    orderType: "GTC",
  });

  try {
    const headers = buildL2AuthHeaders(creds, "POST", "/order", body);
    const res = await fetch(`${CLOB_URL}/order`, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const err = await res.text();
      logger.error({ status: res.status, err, question: params.question }, "CLOB order failed");
      return { success: false, error: `CLOB API error: ${res.status} — ${err}` };
    }

    const data = await res.json() as { orderID?: string; success?: boolean; errorMsg?: string };

    if (data.success === false) {
      return { success: false, error: data.errorMsg ?? "Order rejected" };
    }

    logger.info({ orderId: data.orderID, question: params.question }, "CLOB order placed");
    return { success: true, orderId: data.orderID };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    logger.error({ err: e, question: params.question }, "CLOB request failed");
    return { success: false, error: msg };
  }
}

export interface ClobTrade {
  tradeId: string;
  tokenId: string;
  side: string;
  price: number;
  size: number;
  usdcAmount: number;
  timestamp: string;
}

export interface ClobPosition {
  tokenId: string;
  size: number;
  avgPrice: number;
  currentPrice: number;
  value: number;
  cost: number;
  pnl: number;
  pnlPercent: number;
}

export async function getFilledTrades(): Promise<ClobTrade[]> {
  const creds = getCreds();
  if (!creds) return [];
  const address = getWalletAddress();
  if (!address) return [];

  try {
    const path = `/data/trades?maker=${address}&status=MATCHED&limit=100`;
    const headers = buildL2AuthHeaders(creds, "GET", path);
    const res = await fetch(`${CLOB_URL}${path}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      data?: Array<{
        id?: string;
        asset_id?: string;
        side?: string;
        price?: string;
        size?: string;
        match_time?: string;
      }>;
    };
    return (data.data ?? []).map((t) => {
      const price = parseFloat(t.price ?? "0");
      const size = parseFloat(t.size ?? "0");
      return {
        tradeId: t.id ?? "",
        tokenId: t.asset_id ?? "",
        side: t.side ?? "",
        price,
        size,
        usdcAmount: Math.round(price * size * 100) / 100,
        timestamp: t.match_time ?? new Date().toISOString(),
      };
    });
  } catch (e) {
    logger.warn({ err: e }, "Failed to fetch filled trades from CLOB");
    return [];
  }
}

export async function getLivePositions(): Promise<ClobPosition[]> {
  const creds = getCreds();
  if (!creds) return [];
  const address = getWalletAddress();
  if (!address) return [];

  try {
    const path = `/positions?user=${address}`;
    const headers = buildL2AuthHeaders(creds, "GET", path);
    const res = await fetch(`${CLOB_URL}${path}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json() as Array<{
      asset_id?: string;
      size?: string;
      avg_price?: string;
      cur_price?: string;
      value?: string;
      cost?: string;
    }>;
    return data.map((p) => {
      const size = parseFloat(p.size ?? "0");
      const avgPrice = parseFloat(p.avg_price ?? "0");
      const currentPrice = parseFloat(p.cur_price ?? "0");
      const cost = parseFloat(p.cost ?? String(size * avgPrice));
      const value = parseFloat(p.value ?? String(size * currentPrice));
      const pnl = value - cost;
      const pnlPercent = cost > 0 ? (pnl / cost) * 100 : 0;
      return {
        tokenId: p.asset_id ?? "",
        size,
        avgPrice,
        currentPrice,
        value: Math.round(value * 100) / 100,
        cost: Math.round(cost * 100) / 100,
        pnl: Math.round(pnl * 100) / 100,
        pnlPercent: Math.round(pnlPercent * 100) / 100,
      };
    });
  } catch (e) {
    logger.warn({ err: e }, "Failed to fetch live positions from CLOB");
    return [];
  }
}

export async function computeLivePnlHistory(trades: ClobTrade[]): Promise<
  Array<{ date: string; pnl: number; cumulative: number; tradeCount: number }>
> {
  const byDate = new Map<string, { pnl: number; count: number }>();

  for (const t of trades) {
    const date = t.timestamp.slice(0, 10);
    const existing = byDate.get(date) ?? { pnl: 0, count: 0 };
    const realized =
      t.side === "SELL"
        ? t.usdcAmount
        : -t.usdcAmount;
    byDate.set(date, { pnl: existing.pnl + realized, count: existing.count + 1 });
  }

  const sorted = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  let cumulative = 0;
  return sorted.map(([date, { pnl, count }]) => {
    cumulative += pnl;
    return {
      date,
      pnl: Math.round(pnl * 100) / 100,
      cumulative: Math.round(cumulative * 100) / 100,
      tradeCount: count,
    };
  });
}

export interface OpenOrder {
  id: string;
  market: string;
  side: "BUY" | "SELL";
  price: number;
  originalSize: number;
  sizeMatched: number;
  status: string;
  createdAt: string;
}

export async function getOpenOrders(): Promise<OpenOrder[]> {
  const creds = getCreds();
  if (!creds) return [];
  const address = getWalletAddress();
  if (!address) return [];
  try {
    const path = `/orders?maker=${address}&status=OPEN`;
    const headers = buildL2AuthHeaders(creds, "GET", path);
    const res = await fetch(`${CLOB_URL}${path}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      data?: Array<{
        id?: string;
        asset_id?: string;
        side?: string;
        price?: string;
        original_size?: string;
        size_matched?: string;
        status?: string;
        created_at?: string;
      }>;
    };
    return (data.data ?? []).map((o) => ({
      id: o.id ?? "",
      market: o.asset_id ?? "",
      side: (o.side ?? "BUY").toUpperCase() as "BUY" | "SELL",
      price: parseFloat(o.price ?? "0"),
      originalSize: parseFloat(o.original_size ?? "0"),
      sizeMatched: parseFloat(o.size_matched ?? "0"),
      status: o.status ?? "OPEN",
      createdAt: o.created_at ?? new Date().toISOString(),
    }));
  } catch (err) {
    logger.warn({ err }, "getOpenOrders failed");
    return [];
  }
}

export { getWalletAddress };
