import { Router, type IRouter } from "express";
import {
  ListOrdersResponse,
  PlaceOrderBody,
  CancelOrderParams,
  CancelOrderResponse,
} from "@workspace/api-zod";
import { FAKE_MARKETS } from "./markets";

const router: IRouter = Router();

let FAKE_ORDERS = [
  {
    id: "ord-001",
    marketId: "mkt-001",
    marketQuestion: "Will the US Federal Reserve cut rates in Q3 2025?",
    side: "YES" as const,
    type: "BUY" as const,
    price: 0.55,
    amount: 137.5,
    shares: 250,
    status: "filled" as const,
    createdAt: new Date("2025-04-10T09:23:11Z"),
  },
  {
    id: "ord-002",
    marketId: "mkt-002",
    marketQuestion: "Will Bitcoin reach $150,000 before end of 2025?",
    side: "YES" as const,
    type: "BUY" as const,
    price: 0.38,
    amount: 190.0,
    shares: 500,
    status: "filled" as const,
    createdAt: new Date("2025-04-15T14:05:32Z"),
  },
  {
    id: "ord-003",
    marketId: "mkt-005",
    marketQuestion: "Will OpenAI release GPT-5 before October 2025?",
    side: "YES" as const,
    type: "BUY" as const,
    price: 0.68,
    amount: 204.0,
    shares: 300,
    status: "filled" as const,
    createdAt: new Date("2025-04-20T11:48:00Z"),
  },
  {
    id: "ord-004",
    marketId: "mkt-007",
    marketQuestion: "Will US inflation (CPI) fall below 2% in 2025?",
    side: "NO" as const,
    type: "BUY" as const,
    price: 0.69,
    amount: 276.0,
    shares: 400,
    status: "filled" as const,
    createdAt: new Date("2025-04-22T16:30:00Z"),
  },
  {
    id: "ord-005",
    marketId: "mkt-010",
    marketQuestion: "Will Apple release a foldable iPhone in 2025?",
    side: "NO" as const,
    type: "BUY" as const,
    price: 0.84,
    amount: 126.0,
    shares: 150,
    status: "filled" as const,
    createdAt: new Date("2025-04-25T08:15:00Z"),
  },
  {
    id: "ord-006",
    marketId: "mkt-003",
    marketQuestion: "Will SpaceX land humans on Mars before 2030?",
    side: "YES" as const,
    type: "BUY" as const,
    price: 0.09,
    amount: 45.0,
    shares: 500,
    status: "cancelled" as const,
    createdAt: new Date("2025-04-28T10:00:00Z"),
  },
];

let orderCounter = 7;

router.get("/orders", (_req, res) => {
  const sorted = [...FAKE_ORDERS].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
  res.json(ListOrdersResponse.parse(sorted));
});

router.post("/orders", (req, res) => {
  const body = PlaceOrderBody.parse(req.body);

  const market = FAKE_MARKETS.find((m) => m.id === body.marketId);
  if (!market) {
    res.status(404).json({ error: "Market not found" });
    return;
  }

  const shares = parseFloat((body.amount / body.price).toFixed(2));
  const newOrder = {
    id: `ord-${String(orderCounter++).padStart(3, "0")}`,
    marketId: body.marketId,
    marketQuestion: market.question,
    side: body.side,
    type: body.type,
    price: body.price,
    amount: body.amount,
    shares,
    status: "filled" as const,
    createdAt: new Date(),
  };

  FAKE_ORDERS = [newOrder, ...FAKE_ORDERS];
  res.status(201).json(newOrder);
});

router.delete("/orders/:orderId", (req, res) => {
  const { orderId } = CancelOrderParams.parse(req.params);
  const order = FAKE_ORDERS.find((o) => o.id === orderId);

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const updated = { ...order, status: "cancelled" as const };
  FAKE_ORDERS = FAKE_ORDERS.map((o) => (o.id === orderId ? updated : o));

  res.json(CancelOrderResponse.parse(updated));
});

export default router;
