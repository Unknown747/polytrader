import { logger } from "../lib/logger";

const GAMMA_API = "https://gamma-api.polymarket.com";

export interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  startDate: string;
  endDate: string;
  description: string;
  outcomes: string;
  outcomePrices: string;
  volume: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  volume24hr: number;
  liquidity: number;
  clobTokenIds?: string;
  tags?: Array<{ id: string; label: string; slug: string }>;
  resolvedBy?: string;
  resolutionSource?: string;
  image?: string;
}

export interface NormalizedMarket {
  id: string;
  question: string;
  category: string;
  status: "active" | "resolved" | "closed";
  yesPrice: number;
  noPrice: number;
  volume: number;
  volume24h: number;
  liquidity: number;
  endDate: string;
  resolvedOutcome: string | null;
  description: string;
  conditionId: string;
  tokenId: string;
}

function parseOutcomePrices(raw: string): [number, number] {
  try {
    const arr = JSON.parse(raw);
    return [parseFloat(arr[0]) || 0.5, parseFloat(arr[1]) || 0.5];
  } catch {
    return [0.5, 0.5];
  }
}

function parseTokenId(raw?: string): string {
  if (!raw) return "";
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr[0] ? String(arr[0]) : "";
  } catch {
    return "";
  }
}

function parseCategory(tags?: GammaMarket["tags"]): string {
  if (!tags || tags.length === 0) return "General";
  const label = tags[0].label;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function normalizeMarket(m: GammaMarket): NormalizedMarket {
  const [yesPrice, noPrice] = parseOutcomePrices(m.outcomePrices);
  const status: NormalizedMarket["status"] = m.closed || m.archived
    ? "resolved"
    : m.active
    ? "active"
    : "closed";

  return {
    id: m.id,
    question: m.question,
    category: parseCategory(m.tags),
    status,
    yesPrice,
    noPrice,
    volume: parseFloat(m.volume) || 0,
    volume24h: m.volume24hr || 0,
    liquidity: m.liquidity || 0,
    endDate: m.endDate,
    resolvedOutcome: null,
    description: m.description || "",
    conditionId: m.conditionId || "",
    tokenId: parseTokenId(m.clobTokenIds),
  };
}

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function fetchWithRetry(url: string, retries = 3, delayMs = 600): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url);
      if (res.ok) return res;
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`Gamma API client error: ${res.status} ${res.statusText}`);
      }
      lastError = new Error(`Gamma API server error: ${res.status}`);
      logger.warn({ url, attempt, status: res.status }, "Gamma API non-ok, retrying");
    } catch (e) {
      lastError = e;
      logger.warn({ url, attempt, err: e }, "Gamma API fetch failed, retrying");
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
  throw lastError;
}

export async function fetchMarkets(params?: {
  active?: boolean;
  limit?: number;
  offset?: number;
}): Promise<GammaMarket[]> {
  const qs = new URLSearchParams({
    limit: String(params?.limit ?? 100),
    offset: String(params?.offset ?? 0),
    ...(params?.active !== undefined ? { active: String(params.active) } : {}),
  });

  const url = `${GAMMA_API}/markets?${qs}`;
  logger.info({ url }, "Fetching markets from Gamma API");

  const res = await fetchWithRetry(url);
  const data = await res.json() as GammaMarket[];
  return Array.isArray(data) ? data : [];
}

export async function fetchAllActiveMarkets(maxPages = 5): Promise<GammaMarket[]> {
  const pageSize = 200;
  const all: GammaMarket[] = [];

  for (let page = 0; page < maxPages; page++) {
    const offset = page * pageSize;
    logger.info({ page, offset }, "Fetching page from Gamma API");
    try {
      const batch = await fetchMarkets({ active: true, limit: pageSize, offset });
      if (batch.length === 0) break;
      all.push(...batch);
      if (batch.length < pageSize) break;
    } catch (e) {
      logger.warn({ page, err: e }, "Gamma API page fetch failed, stopping pagination");
      break;
    }
  }

  return all;
}

export async function fetchMarketById(id: string): Promise<GammaMarket | null> {
  const url = `${GAMMA_API}/markets/${id}`;
  try {
    const res = await fetchWithRetry(url, 2);
    if (!res.ok) return null;
    return await res.json() as GammaMarket;
  } catch {
    return null;
  }
}

let _cache: { markets: NormalizedMarket[]; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function getCachedMarkets(): Promise<NormalizedMarket[]> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
    return _cache.markets;
  }
  const raw = await fetchAllActiveMarkets(5);
  const markets = raw
    .filter((m) => !m.archived)
    .map(normalizeMarket);
  _cache = { markets, ts: Date.now() };
  logger.info({ count: markets.length }, "Markets cache refreshed");
  return markets;
}

export function invalidateCache() {
  _cache = null;
}
