import { useGetMarket, getGetMarketQueryKey, usePlaceOrder, getListOrdersQueryKey, getListPositionsQueryKey } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const orderSchema = z.object({
  side: z.enum(["YES", "NO"]),
  type: z.enum(["BUY", "SELL"]),
  amount: z.coerce.number().positive("Amount must be positive").min(1, "Minimum $1"),
});

type OrderFormValues = z.infer<typeof orderSchema>;

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

  const { data: market, isLoading } = useGetMarket(marketId, {
    query: { enabled: !!marketId, queryKey: getGetMarketQueryKey(marketId) },
  });

  const placeOrder = usePlaceOrder();

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      side: "YES",
      type: "BUY",
      amount: 10,
    },
  });

  const side = form.watch("side");
  const type = form.watch("type");
  const amount = form.watch("amount");
  const currentPrice = market
    ? side === "YES"
      ? market.yesPrice
      : market.noPrice
    : 0;
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

      {/* Trade Form */}
      {!isResolved && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Place Order</h2>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Side selector */}
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

              {/* Type selector */}
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

              {/* Amount */}
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

              {/* Order summary */}
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
