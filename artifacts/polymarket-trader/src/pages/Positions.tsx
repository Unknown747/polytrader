import { useListPositions } from "@workspace/api-client-react";
import { Link } from "wouter";
import { TrendingUp, TrendingDown, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function Positions() {
  const { data: positions, isLoading } = useListPositions();

  const totalPnl = positions?.reduce((sum, p) => sum + p.pnl, 0) ?? 0;
  const totalValue = positions?.reduce((sum, p) => sum + p.value, 0) ?? 0;

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Positions</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Open positions in prediction markets</p>
      </div>

      {positions && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">Total Value</div>
            <div className="text-lg font-bold font-mono text-foreground">${totalValue.toFixed(2)}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">Unrealized P&L</div>
            <div className={cn("text-lg font-bold font-mono", totalPnl >= 0 ? "text-yes" : "text-no")}>
              {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">Open Positions</div>
            <div className="text-lg font-bold font-mono text-foreground">{positions.length}</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : !positions || positions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No open positions
        </div>
      ) : (
        <div className="space-y-2">
          {positions.map((pos) => {
            const pnlPositive = pos.pnl >= 0;
            return (
              <div
                key={pos.id}
                data-testid={`position-card-${pos.id}`}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge
                        className={cn(
                          "text-[10px]",
                          pos.side === "YES"
                            ? "bg-yes/15 text-yes border-yes/30 hover:bg-yes/20"
                            : "bg-no/15 text-no border-no/30 hover:bg-no/20"
                        )}
                      >
                        {pos.side}
                      </Badge>
                      <Link href={`/markets/${pos.marketId}`}>
                        <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-primary cursor-pointer" />
                      </Link>
                    </div>
                    <div className="text-sm font-medium text-foreground leading-snug truncate">
                      {pos.marketQuestion}
                    </div>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="text-xs text-muted-foreground">
                        <span className="font-mono">{pos.shares}</span> shares
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Avg <span className="font-mono">{(pos.avgPrice * 100).toFixed(0)}¢</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Now <span className="font-mono">{(pos.currentPrice * 100).toFixed(0)}¢</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold font-mono text-foreground">${pos.value.toFixed(2)}</div>
                    <div className={cn("text-xs font-medium font-mono flex items-center gap-0.5 justify-end mt-0.5", pnlPositive ? "text-yes" : "text-no")}>
                      {pnlPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {pnlPositive ? "+" : ""}${pos.pnl.toFixed(2)} ({pnlPositive ? "+" : ""}{pos.pnlPercent.toFixed(2)}%)
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
