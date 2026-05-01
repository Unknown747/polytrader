import { useQuery } from "@tanstack/react-query";
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
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, Wifi, WifiOff, RefreshCw, Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function handleExport(type: "orders" | "positions" | "pnl") {
  const url = `${import.meta.env.BASE_URL}api/portfolio/export?type=${type}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = `${type}.csv`;
  a.click();
}

const PIE_COLORS = [
  "hsl(142 76% 46%)",
  "hsl(217 91% 60%)",
  "hsl(280 65% 60%)",
  "hsl(38 92% 50%)",
  "hsl(0 72% 51%)",
  "hsl(160 60% 45%)",
  "hsl(48 96% 53%)",
  "hsl(199 89% 48%)",
];

interface LivePortfolio {
  available: boolean;
  reason: string | null;
  usdcBalance: number;
  positions: Array<{
    tokenId: string;
    size: number;
    avgPrice: number;
    currentPrice: number;
    value: number;
    cost: number;
    pnl: number;
    pnlPercent: number;
  }>;
  pnlHistory: Array<{
    date: string;
    pnl: number;
    cumulative: number;
    tradeCount: number;
  }>;
  summary: {
    totalValue: number;
    totalCost: number;
    totalPnl: number;
    totalPnlPercent: number;
    openPositions: number;
    totalTrades: number;
    usdcBalance: number;
  };
}

function useLivePortfolio() {
  return useQuery<LivePortfolio>({
    queryKey: ["portfolio-live"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/portfolio/live`);
      if (!res.ok) throw new Error("Failed to fetch live portfolio");
      return res.json() as Promise<LivePortfolio>;
    },
    refetchInterval: 30000,
  });
}

function StatCard({
  label,
  value,
  sub,
  positive,
  span2,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  span2?: boolean;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", span2 && "col-span-2")}>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div
        className={cn(
          "font-bold font-mono",
          span2 ? "text-3xl" : "text-2xl",
          positive === true ? "text-yes" : positive === false ? "text-no" : "text-foreground"
        )}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export default function Portfolio() {
  const { data: summary, isLoading: summaryLoading } = useGetPortfolioSummary({ query: { refetchInterval: 30000 } });
  const { data: pnl, isLoading: pnlLoading } = useGetPortfolioPnl({ query: { refetchInterval: 60000 } });
  const { data: positions, isLoading: posLoading } = useListPositions({ query: { refetchInterval: 30000 } });
  const {
    data: live,
    isLoading: liveLoading,
    refetch: refetchLive,
    isFetching: liveFetching,
  } = useLivePortfolio();

  const pnlPositive = (summary?.totalPnl ?? 0) >= 0;
  const livePnlPositive = (live?.summary.totalPnl ?? 0) >= 0;
  const hasLive = live?.available === true;

  const pieData = positions?.map((p) => ({
    name: p.marketQuestion.length > 30 ? p.marketQuestion.slice(0, 27) + "…" : p.marketQuestion,
    value: p.value,
    side: p.side,
  })) ?? [];

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Portfolio</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Performance analytics · Auto-refreshes every 30s</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport("pnl")} className="gap-1.5 text-xs h-8">
            <Download className="h-3.5 w-3.5" />
            P&L CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("positions")} className="gap-1.5 text-xs h-8">
            <Download className="h-3.5 w-3.5" />
            Positions CSV
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {summaryLoading || !summary ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Portfolio Value"
            value={`$${summary.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
            sub={`Invested $${summary.investedAmount.toFixed(2)} · Available $${summary.availableBalance.toFixed(2)}`}
            span2
          />
          <StatCard
            label="Total P&L"
            value={`${pnlPositive ? "+" : ""}$${summary.totalPnl.toFixed(2)}`}
            sub={`${pnlPositive ? "+" : ""}${summary.totalPnlPercent.toFixed(2)}%`}
            positive={pnlPositive}
          />
          <StatCard
            label="Win Rate"
            value={`${summary.winRate.toFixed(1)}%`}
            sub={`${summary.openPositions} open · ${summary.totalTrades} total`}
            positive={summary.winRate >= 50}
          />
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

      {/* Pie chart allocation */}
      {pieData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Portfolio Allocation</h2>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={72}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} strokeWidth={0} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(217 33% 17%)", borderRadius: "8px", fontSize: 11 }}
                  formatter={(v: number, _name: string, props: { payload?: { name: string } }) => [`$${v.toFixed(2)}`, props.payload?.name ?? ""]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5">
              {pieData.map((item, index) => (
                <div key={index} className="flex items-center gap-2 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} />
                  <span className="text-muted-foreground flex-1 truncate">{item.name}</span>
                  <span className="font-mono text-foreground shrink-0">${item.value.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Positions breakdown */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Position Breakdown</h2>
        {posLoading || !positions ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : positions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open positions yet.</p>
        ) : (
          <div className="space-y-2">
            {positions.map((pos) => {
              const pnlPos = pos.pnl >= 0;
              return (
                <div key={pos.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <Badge className={cn("text-[10px] shrink-0", pos.side === "YES" ? "bg-yes/15 text-yes border-yes/30" : "bg-no/15 text-no border-no/30")}>
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

      {/* Live CLOB P&L panel */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className={cn(
            "flex items-center justify-center w-8 h-8 rounded-lg",
            hasLive ? "bg-yes/10" : "bg-muted"
          )}>
            {hasLive
              ? <Wifi className="h-4 w-4 text-yes" />
              : <WifiOff className="h-4 w-4 text-muted-foreground" />
            }
          </div>
          <div>
            <div className="font-semibold text-sm">Live CLOB Data</div>
            <div className="text-xs text-muted-foreground">
              {hasLive ? "Real-time positions from Polymarket" : "Connect wallet to enable"}
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void refetchLive()}
            disabled={liveFetching}
            className="ml-auto h-7 px-2 text-xs gap-1.5"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", liveFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>

        <div className="p-4">
          {liveLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
            </div>
          ) : !hasLive ? (
            <div className="text-sm text-muted-foreground space-y-1">
              <p>{live?.reason ?? "Set POLYMARKET_PRIVATE_KEY, POLYMARKET_API_KEY, POLYMARKET_API_SECRET, and POLYMARKET_API_PASSPHRASE to see real-time P&L."}</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Live summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">USDC Balance</div>
                  <div className="font-semibold text-sm font-mono">${live.summary.usdcBalance.toFixed(2)}</div>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">Positions Value</div>
                  <div className="font-semibold text-sm font-mono">${live.summary.totalCost.toFixed(2)}</div>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">Unrealized P&L</div>
                  <div className={cn("font-semibold text-sm font-mono", livePnlPositive ? "text-yes" : "text-no")}>
                    {livePnlPositive ? "+" : ""}${live.summary.totalPnl.toFixed(2)}
                  </div>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">Return</div>
                  <div className={cn("font-semibold text-sm font-mono", livePnlPositive ? "text-yes" : "text-no")}>
                    {livePnlPositive ? "+" : ""}{live.summary.totalPnlPercent.toFixed(2)}%
                  </div>
                </div>
              </div>

              {/* Live P&L chart */}
              {live.pnlHistory.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-3">Realized P&L History (CLOB Trades)</div>
                  <ResponsiveContainer width="100%" height={140}>
                    <AreaChart data={live.pnlHistory} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="livePnlGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(217 91% 60%)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(215 20% 65%)" }} axisLine={false} tickLine={false} tickFormatter={(v) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(215 20% 65%)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} width={40} />
                      <ReferenceLine y={0} stroke="hsl(217 33% 25%)" strokeDasharray="3 3" />
                      <Tooltip
                        contentStyle={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(217 33% 17%)", borderRadius: "8px", fontSize: 11 }}
                        formatter={(v: number, name: string) => [
                          `$${v.toFixed(2)}`,
                          name === "cumulative" ? "Cumulative" : "Daily",
                        ]}
                      />
                      <Area type="monotone" dataKey="cumulative" stroke="hsl(217 91% 60%)" strokeWidth={2} fill="url(#livePnlGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Live positions table */}
              {live.positions.length > 0 ? (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Open Positions ({live.positions.length})</div>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="grid grid-cols-5 px-3 py-1.5 bg-muted/30 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      <div className="col-span-1">Token ID</div>
                      <div className="text-right">Size</div>
                      <div className="text-right">Avg Price</div>
                      <div className="text-right">Cur Price</div>
                      <div className="text-right">P&L</div>
                    </div>
                    {live.positions.map((p, i) => {
                      const pos = p.pnl >= 0;
                      return (
                        <div key={i} className="grid grid-cols-5 px-3 py-2.5 text-xs border-t border-border items-center">
                          <div className="col-span-1 font-mono text-muted-foreground truncate">{p.tokenId.slice(0, 10)}…</div>
                          <div className="text-right font-mono">{p.size.toFixed(2)}</div>
                          <div className="text-right font-mono">{(p.avgPrice * 100).toFixed(1)}¢</div>
                          <div className="text-right font-mono">{(p.currentPrice * 100).toFixed(1)}¢</div>
                          <div className={cn("text-right font-mono font-medium", pos ? "text-yes" : "text-no")}>
                            {pos ? "+" : ""}${p.pnl.toFixed(2)}
                            <span className="text-[10px] ml-1 opacity-70">({pos ? "+" : ""}{p.pnlPercent.toFixed(1)}%)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No open positions on CLOB.</p>
              )}

              <div className="text-[10px] text-muted-foreground">
                Auto-refreshes every 30 seconds · Data from Polymarket CLOB API
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
