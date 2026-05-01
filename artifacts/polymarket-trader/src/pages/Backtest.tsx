import { useState } from "react";
import { useRunBacktest } from "@workspace/api-client-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { FlaskConical, TrendingUp, TrendingDown, Trophy, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormState {
  daysBack: number;
  bankroll: number;
  minProbability: number;
  maxDaysToResolution: number;
  maxPositionPct: number;
}

const DEFAULT_FORM: FormState = {
  daysBack: 90,
  bankroll: 100,
  minProbability: 0.8,
  maxDaysToResolution: 21,
  maxPositionPct: 5,
};

function StatCard({
  label,
  value,
  positive,
  icon: Icon,
}: {
  label: string;
  value: string;
  positive?: boolean;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div
        className={cn(
          "text-xl font-bold",
          positive === true
            ? "text-yes"
            : positive === false
            ? "text-no"
            : "text-foreground"
        )}
      >
        {value}
      </div>
    </div>
  );
}

export default function Backtest() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const { mutate, data: result, isPending, isSuccess } = useRunBacktest();

  function handleRun() {
    mutate({ data: form });
  }

  function setField(field: keyof FormState, val: string) {
    setForm((prev) => ({ ...prev, [field]: parseFloat(val) || 0 }));
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          Strategy Backtester
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Simulate the near-resolution strategy on historical Polymarket data
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Backtest Parameters</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Days back</Label>
            <Input
              type="number"
              value={form.daysBack}
              onChange={(e) => setField("daysBack", e.target.value)}
              min={7}
              max={365}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Starting bankroll ($)</Label>
            <Input
              type="number"
              value={form.bankroll}
              onChange={(e) => setField("bankroll", e.target.value)}
              min={10}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Min probability (%)</Label>
            <Input
              type="number"
              value={Math.round(form.minProbability * 100)}
              onChange={(e) => setField("minProbability", String(parseInt(e.target.value) / 100))}
              min={70}
              max={97}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Max days to resolution</Label>
            <Input
              type="number"
              value={form.maxDaysToResolution}
              onChange={(e) => setField("maxDaysToResolution", e.target.value)}
              min={1}
              max={60}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Max position size (%)</Label>
            <Input
              type="number"
              value={form.maxPositionPct}
              onChange={(e) => setField("maxPositionPct", e.target.value)}
              min={1}
              max={25}
            />
          </div>
        </div>
        <Button onClick={handleRun} disabled={isPending} className="mt-4">
          {isPending ? "Running simulation..." : "Run Backtest"}
        </Button>
      </div>

      {isSuccess && result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard
              label="Total Return"
              value={`${result.totalReturnPct >= 0 ? "+" : ""}${result.totalReturnPct.toFixed(1)}%`}
              positive={result.totalReturnPct >= 0}
              icon={result.totalReturnPct >= 0 ? TrendingUp : TrendingDown}
            />
            <StatCard
              label="Win Rate"
              value={`${result.winRate.toFixed(1)}%`}
              positive={result.winRate >= 55}
              icon={Trophy}
            />
            <StatCard
              label="Total Trades"
              value={String(result.totalTrades)}
              icon={FlaskConical}
            />
            <StatCard
              label="Max Drawdown"
              value={`${result.maxDrawdown.toFixed(1)}%`}
              positive={result.maxDrawdown < 15}
              icon={AlertTriangle}
            />
            <StatCard
              label="Sharpe Ratio"
              value={result.sharpeRatio.toFixed(2)}
              positive={result.sharpeRatio >= 1}
              icon={TrendingUp}
            />
            <StatCard
              label="Avg Return/Trade"
              value={`${result.avgReturn >= 0 ? "+" : ""}${result.avgReturn.toFixed(1)}%`}
              positive={result.avgReturn >= 0}
              icon={TrendingUp}
            />
            <StatCard
              label="Total Fees Paid"
              value={`$${result.totalFeesPaid.toFixed(2)}`}
              positive={result.totalFeesPaid < result.totalTrades * 0.5}
              icon={AlertTriangle}
            />
            <StatCard
              label="Avg Spread Cost"
              value={`${result.avgSpreadPct.toFixed(2)}%`}
              positive={result.avgSpreadPct < 1}
              icon={AlertTriangle}
            />
            <StatCard
              label="Wins"
              value={String(result.winningTrades)}
              positive={true}
              icon={Trophy}
            />
            <StatCard
              label="Losses"
              value={String(result.losingTrades)}
              positive={false}
              icon={AlertTriangle}
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-5 mb-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Equity Curve</h2>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={result.equityCurve}>
                <defs>
                  <linearGradient id="bt-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--yes))" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="hsl(var(--yes))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                />
                <Tooltip
                  formatter={(v: number) => [`$${v.toFixed(2)}`, "Cumulative P&L"]}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke="hsl(var(--yes))"
                  strokeWidth={2}
                  fill="url(#bt-gradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 mb-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">P&L per Trade</h2>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={result.trades.slice(0, 40)}>
                <XAxis hide />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
                <Tooltip
                  formatter={(v: number) => [`$${v.toFixed(2)}`, "P&L"]}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                  {result.trades.slice(0, 40).map((t, i) => (
                    <Cell
                      key={i}
                      fill={t.outcome === "win" ? "hsl(var(--yes))" : "hsl(var(--no))"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Trade Log</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-background/50">
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Date</th>
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Market</th>
                    <th className="text-center px-4 py-2.5 text-muted-foreground font-medium">Side</th>
                    <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Entry</th>
                    <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Exit</th>
                    <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Amount</th>
                    <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">P&L</th>
                    <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((t, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-background/40">
                      <td className="px-4 py-2.5 text-muted-foreground">{t.date}</td>
                      <td className="px-4 py-2.5 text-foreground max-w-xs truncate">{t.question}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-bold",
                          t.side === "YES" ? "bg-yes/10 text-yes" : "bg-no/10 text-no"
                        )}>
                          {t.side}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {(t.entryPrice * 100).toFixed(0)}¢
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {(t.exitPrice * 100).toFixed(0)}¢
                      </td>
                      <td className="px-4 py-2.5 text-right">${t.amount.toFixed(2)}</td>
                      <td className={cn(
                        "px-4 py-2.5 text-right font-medium",
                        t.pnl >= 0 ? "text-yes" : "text-no"
                      )}>
                        {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground text-xs">
                        ${t.feePaid.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
