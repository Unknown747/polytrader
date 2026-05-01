import { logger } from "./db";

const MAX_REQUESTS_PER_SECOND = 18;
const INTERVAL_MS = 1000;

let requestCount = 0;
let windowStart = Date.now();
const queue: Array<() => void> = [];
let draining = false;

function resetWindowIfNeeded(): void {
  const now = Date.now();
  if (now - windowStart >= INTERVAL_MS) {
    windowStart = now;
    requestCount = 0;
  }
}

async function drainQueue(): Promise<void> {
  if (draining) return;
  draining = true;

  while (queue.length > 0) {
    resetWindowIfNeeded();
    if (requestCount < MAX_REQUESTS_PER_SECOND) {
      const next = queue.shift();
      if (next) {
        requestCount++;
        next();
      }
    } else {
      const waitMs = INTERVAL_MS - (Date.now() - windowStart) + 1;
      await new Promise((r) => setTimeout(r, waitMs));
      resetWindowIfNeeded();
    }
  }

  draining = false;
}

export function throttledFetch(url: string, init?: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const doFetch = () => {
      fetch(url, init).then(resolve).catch(reject);
    };

    resetWindowIfNeeded();
    if (requestCount < MAX_REQUESTS_PER_SECOND) {
      requestCount++;
      doFetch();
    } else {
      queue.push(doFetch);
      void drainQueue();
    }
  });
}

export function getQueueDepth(): number {
  return queue.length;
}

export function getRateStats(): { requestsLastSecond: number; queueDepth: number } {
  resetWindowIfNeeded();
  return { requestsLastSecond: requestCount, queueDepth: queue.length };
}

logger.debug("Rate limiter initialized (max 18 req/s for Polymarket API)");
