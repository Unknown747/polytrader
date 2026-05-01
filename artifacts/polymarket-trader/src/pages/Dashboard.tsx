import { useGetPortfolioSummary, useGetPortfolioPnl, useGetTrendingMarkets } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Target, Trophy, ShieldAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RiskData {
  score: number;
  label: "Healthy" | "Moderate" | "Elevated";
  concentration: { score: number; hhi: number; topPositionPct: number; positionCount: number };
  urgency: { score: number; within7Days: number; urgentValuePct: number };
  drawdown: { score: number; currentDrawdownPct: number; peakCumulative: number; currentCumulative: number };
}

// ─── Risk gauge (SVG semi-circle) ─────────────────────────────────────────────

function RiskGauge({ score, label }: { score: number; label: string }) {
  const r = 46;
  const cx = 60;
  const cy = 62;
  const arcLen = Math.PI * r;
  const filled = Math.max(0, Math.min(1, score / 100)) * arcLen;
  const color = score <= 33 ? "#22c55e" : score <= 66 ? "#f59e0b" : "#ef4444";
  const labelColor = score <= 33 ? "text-yes" : score <= 66 ? "text-amber-400" : "text-no";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 120 78" className="w-[140px]">
        <path
          d={`M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r},${cy}`}
          fill="none"
          stroke="hsl(217 33% 17%)"
          strokeWidth={11}
          strokeLinecap="round"
        />
        {filled > 0 && (
          <path
            d={`M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r},${cy}`}
            fill="none"
            stroke={color}
            strokeWidth={11}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${arcLen}`}
          />
        )}
        <text x={cx} y={cy - 10} textAnchor="middle" fontSize={26} fontWeight="bold" fill="white">
          {score}
        </text>
        <text x={cx} y={cy + 7} textAnchor="middle" fontSize={10} fill="hsl(215 20% 55%)">
          out of 100
        </text>
      </svg>
      <span className={cn("text-xs font-semibold uppercase tracking-widest", labelColor)}>{label}</span>
    </div>
  );
}

// ─── Sub-metric bar ───────────────────────────────────────────────────────────

function SubBar({
  label, score, max, detail,
}: { label: string; score: number; max: number; detail: string }) {
  const pct = Math.min(100, (score / max) * 100);
  const color =
    pct < 40 ? "bg-yes" : pct < 75 ? "bg-amber-400" : "bg-no";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums text-foreground font-medium">{score}<span className="text-muted-foreground">/{max}</span></span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-accent overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-muted-foreground">{detail}</p>
    </div>
  );
}

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
  const { data: summary, isLoading: summaryLoading } = useGetPortfolioSummary({ query: { refetchInterval: 30000 } });
  const { data: pnl, isLoading: pnlLoading } = useGetPortfolioPnl({ query: { refetchInterval: 60000 } });
  const { data: trending, isLoading: trendingLoading } = useGetTrendingMarkets({ query: { refetchInterval: 30000 } });
  const { data: risk, isLoading: riskLoading } = useQuery<RiskData>({
    queryKey: ["portfolio-risk"],
    queryFn: () => fetch(`${import.meta.env.BASE_URL}api/portfolio/risk`).then((r) => r.json() as Promise<RiskData>),
    refetchInterval: 30000,
  });

  const pnlPositive = (summary?.totalPnl ?? 0) >= 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Portfolio overview · Auto-refreshes every 30s</p>
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

      {/* Risk Panel */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              Portfolio Risk Score
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Concentration · Urgency · Drawdown</p>
          </div>
          {risk && (
            <span className={cn(
              "text-xs font-bold px-2 py-0.5 rounded-full",
              risk.score <= 33 ? "bg-yes/10 text-yes" :
              risk.score <= 66 ? "bg-amber-400/10 text-amber-400" :
              "bg-no/10 text-no"
            )}>
              {risk.label}
            </span>
          )}
        </div>

        {riskLoading || !risk ? (
          <div className="flex gap-6">
            <Skeleton className="w-[140px] h-[100px] rounded-xl shrink-0" />
            <div className="flex-1 space-y-4">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
            <div className="shrink-0">
              <RiskGauge score={risk.score} label={risk.label} />
            </div>
            <div className="flex-1 w-full space-y-3.5">
              <SubBar
                label="Concentration"
                score={risk.concentration.score}
                max={40}
                detail={
                  risk.concentration.positionCount === 0
                    ? "No open positions"
                    : `${risk.concentration.positionCount} positions · top ${risk.concentration.topPositionPct}% of portfolio · HHI ${risk.concentration.hhi}`
                }
              />
              <SubBar
                label="Resolution Urgency"
                score={risk.urgency.score}
                max={30}
                detail={
                  risk.urgency.within7Days === 0
                    ? "No positions resolving within 7 days"
                    : `${risk.urgency.within7Days} position${risk.urgency.within7Days !== 1 ? "s" : ""} resolving within 7 days (${risk.urgency.urgentValuePct}% of value)`
                }
              />
              <SubBar
                label="Drawdown"
                score={risk.drawdown.score}
                max={30}
                detail={
                  risk.drawdown.currentDrawdownPct === 0
                    ? "No drawdown from peak"
                    : `${risk.drawdown.currentDrawdownPct}% below peak ($${risk.drawdown.peakCumulative.toFixed(2)} → $${risk.drawdown.currentCumulative.toFixed(2)})`
                }
              />
            </div>
          </div>
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
