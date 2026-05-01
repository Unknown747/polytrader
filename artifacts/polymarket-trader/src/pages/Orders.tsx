import { useListOrders, useCancelOrder, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function statusColor(status: string) {
  switch (status) {
    case "filled": return "bg-yes/15 text-yes border-yes/30 hover:bg-yes/20";
    case "open": return "bg-primary/15 text-primary border-primary/30 hover:bg-primary/20";
    case "cancelled": return "bg-muted text-muted-foreground";
    case "partial": return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20";
    default: return "";
  }
}

function sideColor(side: string) {
  return side === "YES"
    ? "bg-yes/15 text-yes border-yes/30 hover:bg-yes/20"
    : "bg-no/15 text-no border-no/30 hover:bg-no/20";
}

export default function Orders() {
  const { data: orders, isLoading } = useListOrders();
  const cancelOrder = useCancelOrder();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  function handleCancel(orderId: string) {
    cancelOrder.mutate(
      { orderId },
      {
        onSuccess: () => {
          toast({ title: "Order cancelled" });
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        },
        onError: () => {
          toast({ title: "Failed to cancel", variant: "destructive" });
        },
      }
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Orders</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Trade history and open orders</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : !orders || orders.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No orders yet</div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <div
              key={order.id}
              data-testid={`order-card-${order.id}`}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <Badge className={cn("text-[10px]", sideColor(order.side))}>{order.side}</Badge>
                    <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">{order.type}</Badge>
                    <Badge className={cn("text-[10px]", statusColor(order.status))}>{order.status}</Badge>
                  </div>
                  <div className="text-sm font-medium text-foreground leading-snug truncate">
                    {order.marketQuestion}
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-mono">{(order.price * 100).toFixed(0)}¢</span> per share
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-mono">{order.shares}</span> shares
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 flex flex-col items-end gap-2">
                  <div className="text-sm font-bold font-mono text-foreground">${order.amount.toFixed(2)}</div>
                  {order.status === "open" && (
                    <Button
                      data-testid={`button-cancel-${order.id}`}
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => handleCancel(order.id)}
                      disabled={cancelOrder.isPending}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
