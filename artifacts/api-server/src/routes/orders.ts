import { Router, type IRouter } from "express";
import {
  ListOrdersResponse,
  PlaceOrderBody,
  CancelOrderParams,
  CancelOrderResponse,
} from "@workspace/api-zod";
import { FAKE_MARKETS } from "./markets";
import { portfolioState } from "../lib/state";
import { notifyOrderFilled } from "../services/telegram";

const router: IRouter = Router();

router.get("/orders", (_req, res) => {
  res.json(ListOrdersResponse.parse(portfolioState.getOrders()));
});

router.post("/orders", (req, res) => {
  const body = PlaceOrderBody.parse(req.body);

  const market = FAKE_MARKETS.find((m) => m.id === body.marketId);
  if (!market) {
    res.status(404).json({ error: "Market not found" });
    return;
  }

  const shares = parseFloat((body.amount / body.price).toFixed(2));

  const isFilled = body.type === "BUY";
  const status: "filled" | "open" = isFilled ? "filled" : "open";

  const newOrder = portfolioState.addOrder({
    marketId: body.marketId,
    marketQuestion: market.question,
    side: body.side,
    type: body.type,
    price: body.price,
    amount: body.amount,
    shares,
    status,
  });

  if (newOrder.status === "filled") {
    void notifyOrderFilled({
      question: market.question,
      side: body.side,
      price: body.price,
      amount: body.amount,
    });
  }

  res.status(201).json(newOrder);
});

router.delete("/orders/:orderId", (req, res) => {
  const { orderId } = CancelOrderParams.parse(req.params);
  const updated = portfolioState.cancelOrder(orderId);

  if (!updated) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  res.json(CancelOrderResponse.parse(updated));
});

export default router;
