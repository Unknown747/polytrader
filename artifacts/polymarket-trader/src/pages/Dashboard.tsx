import { useGetPortfolioSummary, useGetPortfolioPnl, useGetTrendingMarkets } from "@workspace/api-client-react";
import { Link } from "wouter";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Target, BarChart3, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function StatCard({
  label,
  value,
  sub,
  positive,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {sub && (
        <div
          className={cn(
            "mt-1 text-xs font-medium",
            positive === true ? "text-yes" : positive === false ? "text-no" : "text-muted-foreground"
          )}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function PriceBar({ yes, no }: { yes: number; no: number }) {
  return (
    <div className="flex h-1.5 w-full rounded-full overflow-hidden">
      <div className="bg-yes" style={{ width: `${yes * 100}%` }} />
      <div className="bg-no" style={{ width: `${no * 100}%` }} />
    </div>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useGetPortfolioSummary();
  const { data: pnl, isLoading: pnlLoading } = useGetPortfolioPnl();
  const { data: trending, isLoading: trendingLoading } = useGetTrendingMarkets();

  const pnlPositive = (summary?.totalPnl ?? 0) >= 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Portfolio overview — fake data mode</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryLoading || !summary ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              label="Total Value"
              value={`$${summary.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
              sub={`Available: $${summary.availableBalance.toFixed(2)}`}
              icon={DollarSign}
            />
            <StatCard
              label="Total P&L"
              value={`${pnlPositive ? "+" : ""}$${summary.totalPnl.toFixed(2)}`}
              sub={`${pnlPositive ? "+" : ""}${summary.totalPnlPercent.toFixed(2)}%`}
              positive={pnlPositive}
              icon={pnlPositive ? TrendingUp : TrendingDown}
            />
            <StatCard
              label="Open Positions"
              value={String(summary.openPositions)}
              sub={`${summary.totalTrades} total trades`}
              icon={Target}
            />
            <StatCard
              label="Win Rate"
              value={`${summary.winRate.toFixed(1)}%`}
              sub="Resolved markets"
              positive={summary.winRate >= 50}
              icon={Trophy}
            />
          </>
        )}
      </div>

      {/* P&L Chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Cumulative P&L</h2>
            <p className="text-xs text-muted-foreground">April 2025</p>
          </div>
          {summary && (
            <span className={cn("text-sm font-bold", pnlPositive ? "text-yes" : "text-no")}>
              {pnlPositive ? "+" : ""}${summary.totalPnl.toFixed(2)}
            </span>
          )}
        </div>
        {pnlLoading || !pnl ? (
          <Skeleton className="h-44" />
        ) : (
          <ResponsiveContainer width="100%" height={176}>
            <AreaChart data={pnl} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142 76% 46%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(142 76% 46%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "hsl(215 20% 65%)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => v.slice(5)}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(215 20% 65%)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(222 47% 9%)",
                  border: "1px solid hsl(217 33% 17%)",
                  borderRadius: "8px",
                  fontSize: 12,
                }}
                formatter={(v: number) => [`$${v.toFixed(2)}`, "Cumulative P&L"]}
              />
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke="hsl(142 76% 46%)"
                strokeWidth={2}
                fill="url(#pnlGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Trending Markets */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Trending Markets</h2>
          <Link href="/markets">
            <span className="text-xs text-primary hover:underline cursor-pointer">View all</span>
          </Link>
        </div>
        {trendingLoading || !trending ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {trending.map((market) => (
              <Link key={market.id} href={`/markets/${market.id}`}>
                <div
                  data-testid={`trending-market-${market.id}`}
                  className="flex items-center gap-3 py-2.5 px-3 -mx-3 rounded-lg hover:bg-accent transition-colors cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{market.question}</div>
                    <PriceBar yes={market.yesPrice} no={market.noPrice} />
                    <div className="flex gap-3 mt-1">
                      <span className="text-xs text-yes font-mono">YES {(market.yesPrice * 100).toFixed(0)}¢</span>
                      <span className="text-xs text-no font-mono">NO {(market.noPrice * 100).toFixed(0)}¢</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-medium text-foreground font-mono">
                      ${(market.volume / 1000).toFixed(0)}K
                    </div>
                    <div className="text-[10px] text-muted-foreground">volume</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
