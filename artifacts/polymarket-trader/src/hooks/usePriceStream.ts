import { useEffect, useState, useRef } from "react";

export interface LivePrice {
  marketId: string;
  question: string;
  yesPrice: number;
  noPrice: number;
}

export function usePriceStream() {
  const [prices, setPrices] = useState<Map<string, LivePrice>>(new Map());
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const url = `${import.meta.env.BASE_URL}api/prices/stream`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          data?: LivePrice[];
        };
        if (msg.type === "prices" && Array.isArray(msg.data)) {
          setPrices((prev) => {
            const next = new Map(prev);
            for (const p of msg.data!) {
              next.set(p.marketId, p);
            }
            return next;
          });
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      esRef.current = null;
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  return { prices, connected };
}
