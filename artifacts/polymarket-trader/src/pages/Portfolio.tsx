import {
  useGetPortfolioSummary,
  useGetPortfolioPnl,
  useListPositions,
} from "@workspace/api-client-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function Portfolio() {
  const { data: summary, isLoading: summaryLoading } = useGetPortfolioSummary();
  const { data: pnl, isLoading: pnlLoading } = useGetPortfolioPnl();
  const { data: positions, isLoading: posLoading } = useListPositions();

  const pnlPositive = (summary?.totalPnl ?? 0) >= 0;

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Portfolio</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Performance analytics</p>
      </div>

      {/* Summary */}
      {summaryLoading || !summary ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border bg-card p-4 col-span-2">
            <div className="text-xs text-muted-foreground mb-1">Total Portfolio Value</div>
            <div className="text-3xl font-bold font-mono text-foreground">
              ${summary.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <div className="text-xs text-muted-foreground">
                Invested: <span className="font-mono text-foreground">${summary.investedAmount.toFixed(2)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Available: <span className="font-mono text-foreground">${summary.availableBalance.toFixed(2)}</span>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">Total P&L</div>
            <div className={cn("text-2xl font-bold font-mono", pnlPositive ? "text-yes" : "text-no")}>
              {pnlPositive ? "+" : ""}${summary.totalPnl.toFixed(2)}
            </div>
            <div className={cn("text-xs font-medium flex items-center gap-1 mt-0.5", pnlPositive ? "text-yes" : "text-no")}>
              {pnlPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {pnlPositive ? "+" : ""}{summary.totalPnlPercent.toFixed(2)}%
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">Win Rate</div>
            <div className={cn("text-2xl font-bold font-mono", summary.winRate >= 50 ? "text-yes" : "text-no")}>
              {summary.winRate.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {summary.openPositions} open / {summary.totalTrades} total
            </div>
          </div>
        </div>
      )}

      {/* Cumulative P&L chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Cumulative P&L</h2>
        {pnlLoading || !pnl ? (
          <Skeleton className="h-44" />
        ) : (
          <ResponsiveContainer width="100%" height={176}>
            <AreaChart data={pnl} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="portfolioPnlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142 76% 46%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(142 76% 46%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(215 20% 65%)" }} axisLine={false} tickLine={false} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(215 20% 65%)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} width={40} />
              <ReferenceLine y={0} stroke="hsl(217 33% 25%)" strokeDasharray="3 3" />
              <Tooltip
                contentStyle={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(217 33% 17%)", borderRadius: "8px", fontSize: 12 }}
                formatter={(v: number) => [`$${v.toFixed(2)}`, "Cumulative"]}
              />
              <Area type="monotone" dataKey="cumulative" stroke="hsl(142 76% 46%)" strokeWidth={2} fill="url(#portfolioPnlGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Daily P&L bar chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Daily P&L</h2>
        {pnlLoading || !pnl ? (
          <Skeleton className="h-36" />
        ) : (
          <ResponsiveContainer width="100%" height={144}>
            <BarChart data={pnl} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(215 20% 65%)" }} axisLine={false} tickLine={false} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(215 20% 65%)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} width={40} />
              <ReferenceLine y={0} stroke="hsl(217 33% 25%)" />
              <Tooltip
                contentStyle={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(217 33% 17%)", borderRadius: "8px", fontSize: 12 }}
                formatter={(v: number) => [`$${v.toFixed(2)}`, "Daily P&L"]}
              />
              <Bar dataKey="pnl" fill="hsl(142 76% 46%)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Positions breakdown */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Position Breakdown</h2>
        {posLoading || !positions ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <div className="space-y-2">
            {positions.map((pos) => {
              const pnlPos = pos.pnl >= 0;
              return (
                <div key={pos.id} data-testid={`portfolio-position-${pos.id}`} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <Badge
                    className={cn(
                      "text-[10px] shrink-0",
                      pos.side === "YES" ? "bg-yes/15 text-yes border-yes/30" : "bg-no/15 text-no border-no/30"
                    )}
                  >
                    {pos.side}
                  </Badge>
                  <div className="flex-1 text-sm text-foreground truncate">{pos.marketQuestion}</div>
                  <div className="text-sm font-mono font-medium text-foreground shrink-0">${pos.value.toFixed(2)}</div>
                  <div className={cn("text-xs font-mono shrink-0 w-20 text-right", pnlPos ? "text-yes" : "text-no")}>
                    {pnlPos ? "+" : ""}{pos.pnlPercent.toFixed(2)}%
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
