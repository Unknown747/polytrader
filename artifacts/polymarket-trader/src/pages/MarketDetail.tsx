import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetMarket, getGetMarketQueryKey, usePlaceOrder, getListOrdersQueryKey, getListPositionsQueryKey } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Star, Bell } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks";
import { cn } from "@/lib/utils";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const orderSchema = z.object({
  side: z.enum(["YES", "NO"]),
  type: z.enum(["BUY", "SELL"]),
  amount: z.coerce.number().positive("Amount must be positive").min(1, "Minimum $1"),
});

const alertSchema = z.object({
  side: z.enum(["YES", "NO"]),
  direction: z.enum(["above", "below"]),
  targetPrice: z.coerce.number().min(1, "Min 1").max(99, "Max 99"),
});

type OrderFormValues = z.infer<typeof orderSchema>;
type AlertFormValues = z.infer<typeof alertSchema>;

interface PriceHistoryPoint {
  date: string;
  yesPrice: number;
  noPrice: number;
}

function usePriceHistory(marketId: string) {
  return useQuery<{ history: PriceHistoryPoint[] }>({
    queryKey: ["market-history", marketId],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/markets/${marketId}/history?days=30`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ history: PriceHistoryPoint[] }>;
    },
    enabled: !!marketId,
  });
}

function useIsWatched(marketId: string) {
  return useQuery<{ watched: boolean }>({
    queryKey: ["watchlist-check", marketId],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/watchlist/${marketId}`);
      return res.json() as Promise<{ watched: boolean }>;
    },
    enabled: !!marketId,
  });
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="text-sm font-medium text-foreground font-mono">{value}</span>
    </div>
  );
}

function PriceBar({ yes, no }: { yes: number; no: number }) {
  return (
    <div className="flex h-2 w-full rounded-full overflow-hidden">
      <div className="bg-yes transition-all" style={{ width: `${yes * 100}%` }} />
      <div className="bg-no transition-all" style={{ width: `${no * 100}%` }} />
    </div>
  );
}

export default function MarketDetail() {
  const params = useParams<{ marketId: string }>();
  const marketId = params.marketId ?? "";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAlertForm, setShowAlertForm] = useState(false);

  const { data: market, isLoading } = useGetMarket(marketId, {
    query: { enabled: !!marketId, queryKey: getGetMarketQueryKey(marketId), refetchInterval: 30000 },
  });

  const { data: history } = usePriceHistory(marketId);
  const { data: watchedData, refetch: refetchWatched } = useIsWatched(marketId);
  const isWatched = watchedData?.watched ?? false;

  const watchMutation = useMutation({
    mutationFn: async () => {
      if (isWatched) {
        await fetch(`${import.meta.env.BASE_URL}api/watchlist/${marketId}`, { method: "DELETE" });
      } else {
        await fetch(`${import.meta.env.BASE_URL}api/watchlist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ marketId }),
        });
      }
    },
    onSuccess: () => {
      void refetchWatched();
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      toast({ title: isWatched ? "Removed from watchlist" : "Added to watchlist" });
    },
  });

  const alertMutation = useMutation({
    mutationFn: async (data: AlertFormValues) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId,
          marketQuestion: market?.question ?? "",
          side: data.side,
          direction: data.direction,
          targetPrice: data.targetPrice / 100,
        }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      toast({ title: "Price alert set!", description: "You'll be notified via Telegram when the price hits your target." });
      setShowAlertForm(false);
      alertForm.reset();
    },
    onError: () => {
      toast({ title: "Failed to set alert", variant: "destructive" });
    },
  });

  const placeOrder = usePlaceOrder();

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: { side: "YES", type: "BUY", amount: 10 },
  });

  const alertForm = useForm<AlertFormValues>({
    resolver: zodResolver(alertSchema),
    defaultValues: { side: "YES", direction: "above", targetPrice: 80 },
  });

  const side = form.watch("side");
  const type = form.watch("type");
  const amount = form.watch("amount");
  const currentPrice = market ? (side === "YES" ? market.yesPrice : market.noPrice) : 0;
  const estimatedShares = currentPrice > 0 ? (amount / currentPrice).toFixed(2) : "0";

  function onSubmit(values: OrderFormValues) {
    if (!market) return;
    placeOrder.mutate(
      {
        data: {
          marketId: market.id,
          side: values.side,
          type: values.type,
          price: currentPrice,
          amount: values.amount,
        },
      },
      {
        onSuccess: () => {
          toast({
            title: "Order placed",
            description: `${values.type} ${values.side} @ ${(currentPrice * 100).toFixed(0)}¢ — ${estimatedShares} shares`,
          });
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListPositionsQueryKey() });
          form.reset({ side: values.side, type: "BUY", amount: 10 });
        },
        onError: () => {
          toast({ title: "Order failed", description: "Please try again.", variant: "destructive" });
        },
      }
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-52 rounded-xl" />
      </div>
    );
  }

  if (!market) {
    return (
      <div className="p-6">
        <div className="text-center py-12 text-muted-foreground">Market not found</div>
      </div>
    );
  }

  const isResolved = market.status === "resolved";
  const historyPoints = history?.history ?? [];

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      <Link href="/markets">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-fit">
          <ArrowLeft className="h-4 w-4" />
          Back to Markets
        </div>
      </Link>

      {/* Market card */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {isResolved ? (
                <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30">Resolved</Badge>
              ) : (
                <Badge className="text-[10px] bg-yes/15 text-yes border-yes/30">Active</Badge>
              )}
              <span className="text-xs text-muted-foreground">{market.category}</span>
            </div>
            <h1 className="text-base font-bold text-foreground leading-snug">{market.question}</h1>
            {market.resolvedOutcome && (
              <div className="mt-2 text-sm font-medium">
                Resolved: <span className={market.resolvedOutcome === "YES" ? "text-yes" : "text-no"}>{market.resolvedOutcome}</span>
              </div>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => watchMutation.mutate()}
              disabled={watchMutation.isPending}
              className={cn(
                "p-2 rounded-lg border transition-colors",
                isWatched
                  ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20"
                  : "border-border text-muted-foreground hover:text-yellow-400 hover:border-yellow-500/30"
              )}
              title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
            >
              <Star className={cn("h-4 w-4", isWatched && "fill-current")} />
            </button>
            {!isResolved && (
              <button
                onClick={() => setShowAlertForm(!showAlertForm)}
                className={cn(
                  "p-2 rounded-lg border transition-colors",
                  showAlertForm
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-primary hover:border-primary/30"
                )}
                title="Set price alert"
              >
                <Bell className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <PriceBar yes={market.yesPrice} no={market.noPrice} />

        <div className="grid grid-cols-2 gap-2">
          <div className="h-8 w-full rounded-md bg-yes/10 border border-yes/30 flex items-center justify-between px-3">
            <span className="text-xs font-medium text-yes">YES</span>
            <span className="text-sm font-bold text-yes font-mono">{(market.yesPrice * 100).toFixed(0)}¢</span>
          </div>
          <div className="h-8 w-full rounded-md bg-no/10 border border-no/30 flex items-center justify-between px-3">
            <span className="text-xs font-medium text-no">NO</span>
            <span className="text-sm font-bold text-no font-mono">{(market.noPrice * 100).toFixed(0)}¢</span>
          </div>
        </div>

        <div className="flex gap-6 pt-1">
          <StatPill label="Volume" value={`$${(market.volume / 1000).toFixed(0)}K`} />
          <StatPill label="Liquidity" value={`$${(market.liquidity / 1000).toFixed(0)}K`} />
          <StatPill
            label="Closes"
            value={new Date(market.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          />
        </div>

        {market.description && (
          <p className="text-xs text-muted-foreground border-t border-border pt-3 leading-relaxed">
            {market.description}
          </p>
        )}
      </div>

      {/* Price history chart */}
      {historyPoints.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Price History (30 days)</h2>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={historyPoints} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="yesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142 76% 46%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(142 76% 46%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="noGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(0 72% 51%)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(0 72% 51%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "hsl(215 20% 65%)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => v.slice(5)}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(215 20% 65%)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}¢`}
                domain={[0, 1]}
                width={36}
              />
              <Tooltip
                contentStyle={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(217 33% 17%)", borderRadius: "8px", fontSize: 11 }}
                formatter={(v: number, name: string) => [`${(v * 100).toFixed(0)}¢`, name === "yesPrice" ? "YES" : "NO"]}
              />
              <Area type="monotone" dataKey="yesPrice" stroke="hsl(142 76% 46%)" strokeWidth={2} fill="url(#yesGrad)" dot={false} />
              <Area type="monotone" dataKey="noPrice" stroke="hsl(0 72% 51%)" strokeWidth={1.5} strokeDasharray="3 2" fill="url(#noGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <div className="w-3 h-0.5 bg-yes rounded" />
              YES price
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <div className="w-3 h-0.5 bg-no rounded" style={{ borderTop: "1px dashed" }} />
              NO price
            </div>
          </div>
        </div>
      )}

      {/* Price alert form */}
      {showAlertForm && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Set Price Alert
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Get a Telegram notification when the price hits your target. Requires Telegram bot to be configured.
          </p>
          <Form {...alertForm}>
            <form onSubmit={alertForm.handleSubmit((v) => alertMutation.mutate(v))} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={alertForm.control}
                  name="side"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Track</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          {(["YES", "NO"] as const).map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => field.onChange(s)}
                              className={cn(
                                "flex-1 h-8 rounded text-xs font-semibold border transition-all",
                                field.value === s && s === "YES" && "bg-yes/20 border-yes text-yes",
                                field.value === s && s === "NO" && "bg-no/20 border-no text-no",
                                field.value !== s && "border-border text-muted-foreground hover:border-foreground/30"
                              )}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={alertForm.control}
                  name="direction"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">When price goes</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          {(["above", "below"] as const).map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => field.onChange(d)}
                              className={cn(
                                "flex-1 h-8 rounded text-xs font-medium border transition-all capitalize",
                                field.value === d
                                  ? "bg-primary/15 border-primary text-primary"
                                  : "border-border text-muted-foreground hover:border-foreground/30"
                              )}
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={alertForm.control}
                name="targetPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Target price (in cents)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="number"
                          min="1"
                          max="99"
                          step="1"
                          placeholder="e.g. 80"
                          className="bg-background border-border font-mono"
                          {...field}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">¢</span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={alertMutation.isPending}
                  className="flex-1"
                >
                  {alertMutation.isPending ? "Setting..." : "Set Alert"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowAlertForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </div>
      )}

      {/* Trade Form */}
      {!isResolved && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Place Order</h2>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="side"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Outcome</FormLabel>
                    <FormControl>
                      <div className="grid grid-cols-2 gap-2">
                        {(["YES", "NO"] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            data-testid={`side-${s}`}
                            onClick={() => field.onChange(s)}
                            className={cn(
                              "h-9 rounded-md text-sm font-semibold border transition-all",
                              field.value === s && s === "YES" && "bg-yes/20 border-yes text-yes",
                              field.value === s && s === "NO" && "bg-no/20 border-no text-no",
                              field.value !== s && "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Action</FormLabel>
                    <FormControl>
                      <div className="grid grid-cols-2 gap-2">
                        {(["BUY", "SELL"] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            data-testid={`type-${t}`}
                            onClick={() => field.onChange(t)}
                            className={cn(
                              "h-9 rounded-md text-sm font-medium border transition-all",
                              field.value === t
                                ? "bg-primary/15 border-primary text-primary"
                                : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                            )}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Amount (USDC)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                        <Input
                          data-testid="input-amount"
                          type="number"
                          step="0.01"
                          min="1"
                          className="pl-7 bg-background border-border font-mono"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="rounded-md bg-background border border-border p-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Price per share</span>
                  <span className="font-mono text-foreground">{(currentPrice * 100).toFixed(0)}¢</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Estimated shares</span>
                  <span className="font-mono text-foreground">{estimatedShares}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Total cost</span>
                  <span className="font-mono text-foreground font-medium">${Number(amount || 0).toFixed(2)}</span>
                </div>
              </div>

              <Button
                data-testid="button-place-order"
                type="submit"
                disabled={placeOrder.isPending}
                className={cn(
                  "w-full font-semibold",
                  side === "YES"
                    ? "bg-yes hover:bg-yes/90 text-yes-foreground"
                    : "bg-no hover:bg-no/90 text-no-foreground"
                )}
              >
                {placeOrder.isPending ? "Placing..." : `${type} ${side}`}
              </Button>
            </form>
          </Form>
        </div>
      )}
    </div>
  );
}
