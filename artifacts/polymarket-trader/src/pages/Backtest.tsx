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
import {
  FlaskConical,
  TrendingUp,
  TrendingDown,
  Trophy,
  AlertTriangle,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  Info,
  DollarSign,
  ArrowRight,
} from "lucide-react";
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

interface BacktestResult {
  totalReturn: number;
  totalReturnPct: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  totalFeesPaid: number;
  avgSpreadPct: number;
  trades: Array<{
    date: string;
    question: string;
    side: "YES" | "NO";
    entryPrice: number;
    exitPrice: number;
    amount: number;
    pnl: number;
    pnlPct: number;
    outcome: "win" | "loss";
    feePaid: number;
    spread: number;
  }>;
  equityCurve: Array<{ date: string; pnl: number; cumulative: number }>;
}

interface CompareResult {
  taker: BacktestResult;
  maker: BacktestResult;
  feesSaved: number;
  takerFinalEquity: number;
  makerFinalEquity: number;
  verdict: "maker" | "taker" | "tie";
  verdictReason: string;
}

function StatCard({
  label,
  value,
  positive,
  icon: Icon,
  sub,
}: {
  label: string;
  value: string;
  positive?: boolean;
  icon: React.ElementType;
  sub?: string;
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
      {sub && <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function CompareStatRow({
  label,
  takerVal,
  makerVal,
  winner,
  format,
}: {
  label: string;
  takerVal: number;
  makerVal: number;
  winner: "taker" | "maker" | "tie" | "none";
  format: (v: number) => string;
}) {
  return (
    <div className="grid grid-cols-3 items-center py-2.5 border-b border-border/50 last:border-0 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={cn(
        "text-center font-semibold",
        winner === "taker" ? "text-yes" : "text-foreground"
      )}>
        {format(takerVal)}
        {winner === "taker" && <span className="ml-1 text-[10px] text-yes">✓</span>}
      </span>
      <span className={cn(
        "text-center font-semibold",
        winner === "maker" ? "text-yes" : "text-foreground"
      )}>
        {format(makerVal)}
        {winner === "maker" && <span className="ml-1 text-[10px] text-yes">✓</span>}
      </span>
    </div>
  );
}

function SmallCapitalPanel({ bankroll }: { bankroll: number }) {
  const minOrder = 1;
  const maxPosPct = 5;
  const perTrade = (bankroll * maxPosPct) / 100;
  const isTooSmall = perTrade < minOrder;
  const isTight = perTrade < 3;
  const spreadCostPct = perTrade < 5 ? 2.5 : perTrade < 20 ? 1.5 : 0.8;
  const feeAndSpread = (CLOB_TAKER_FEE_PCT + spreadCostPct).toFixed(1);
  const breakEvenEdge = (parseFloat(feeAndSpread)).toFixed(1);
  const feasible = !isTooSmall;

  const statusColor = isTooSmall
    ? "border-no/30 bg-no/5"
    : isTight
    ? "border-yellow-500/30 bg-yellow-500/5"
    : "border-yes/30 bg-yes/5";
  const statusIcon = isTooSmall ? XCircle : isTight ? AlertTriangle : CheckCircle2;
  const statusIconColor = isTooSmall ? "text-no" : isTight ? "text-yellow-400" : "text-yes";
  const statusText = isTooSmall
    ? "Terlalu kecil — per trade di bawah minimum $1 Polymarket"
    : isTight
    ? "Bisa dipakai, tapi spread+fee menggerus profit lebih besar"
    : "Layak digunakan untuk bot trading";

  return (
    <div className={cn("rounded-xl border p-5 mb-6", statusColor)}>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-background/60">
          <DollarSign className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Analisis Modal ${bankroll} — Apakah Layak?
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Dihitung otomatis dari bankroll dan max position {maxPosPct}%
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="rounded-lg bg-background/60 p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Per Trade</div>
          <div className={cn("font-bold text-lg", isTooSmall ? "text-no" : "text-foreground")}>
            ${perTrade.toFixed(2)}
          </div>
          <div className="text-[10px] text-muted-foreground">Min Polymarket: $1</div>
        </div>
        <div className="rounded-lg bg-background/60 p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Fee + Spread</div>
          <div className="font-bold text-lg text-no">{feeAndSpread}%</div>
          <div className="text-[10px] text-muted-foreground">dari setiap trade</div>
        </div>
        <div className="rounded-lg bg-background/60 p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Min Edge Perlu</div>
          <div className="font-bold text-lg text-yellow-400">{breakEvenEdge}%+</div>
          <div className="text-[10px] text-muted-foreground">untuk BEP per trade</div>
        </div>
        <div className="rounded-lg bg-background/60 p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Status</div>
          <div className={cn("font-bold text-sm mt-1", statusIconColor)}>
            {isTooSmall ? "❌ Tidak bisa" : isTight ? "⚠️ Mepet" : "✅ Bisa"}
          </div>
        </div>
      </div>

      <div className={cn("flex items-start gap-2 rounded-lg p-3", statusColor)}>
        {(() => { const Icon = statusIcon; return <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", statusIconColor)} />; })()}
        <div className="text-xs leading-relaxed">
          <span className="font-semibold text-foreground">{statusText}</span>
          {feasible && (
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {isTight && (
                <>
                  <li>• Spread ~{spreadCostPct}% di market kecil terasa berat untuk order ${perTrade.toFixed(2)}</li>
                  <li>• Strategi bot butuh edge ≥{breakEvenEdge}% hanya untuk impas — sudah di-set {">"}3% tapi mepet</li>
                  <li>• <strong className="text-foreground">Solusi:</strong> naikkan bankroll ke $200+ atau pilih market likuid saja</li>
                </>
              )}
              {!isTight && (
                <>
                  <li>• Per trade ${perTrade.toFixed(2)} cukup di atas minimum $1 Polymarket</li>
                  <li>• Pastikan pilih market dengan likuiditas {">"}$10,000 untuk spread yang kecil</li>
                  <li>• Bot sudah bisa dijalankan dengan modal ini</li>
                </>
              )}
            </ul>
          )}
          {!feasible && (
            <ul className="mt-2 space-y-1 text-muted-foreground">
              <li>• Dengan bankroll ${bankroll} dan max position {maxPosPct}% = ${perTrade.toFixed(2)}/trade</li>
              <li>• Naikkan bankroll ke min <strong className="text-foreground">${Math.ceil(minOrder * 100 / maxPosPct)}</strong> agar bisa trade</li>
              <li>• Atau naikkan Max Position Size {">"} {Math.ceil(minOrder * 100 / bankroll)}% di Strategy Config</li>
            </ul>
          )}
        </div>
      </div>

      {feasible && (
        <div className="mt-3 rounded-lg bg-background/60 border border-border p-3 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground flex items-center gap-1 mb-1.5">
            <Info className="h-3 w-3 text-primary" /> Rekomendasi modal berdasarkan ukuran
          </span>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {[
              { label: "Starter", amount: 50, note: "Bisa, spread terasa berat" },
              { label: "Disarankan", amount: 200, note: "Nyaman untuk 5 trade/hari" },
              { label: "Optimal", amount: 500, note: "Spread tidak signifikan" },
            ].map((t) => (
              <div key={t.label} className={cn(
                "rounded-md p-2 text-center",
                bankroll >= t.amount ? "bg-yes/10 border border-yes/20" : "bg-muted/30"
              )}>
                <div className="font-semibold text-foreground">${t.amount}</div>
                <div className="text-[10px] text-primary font-medium">{t.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{t.note}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const CLOB_TAKER_FEE_PCT = 1;

export default function Backtest() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [mode, setMode] = useState<"single" | "compare">("single");
  const [comparing, setComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const { mutate, data: result, isPending, isSuccess } = useRunBacktest();

  function handleRun() {
    if (mode === "compare") {
      setComparing(true);
      setCompareResult(null);
      fetch(`${import.meta.env.BASE_URL}api/strategy/backtest-compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
        .then((r) => r.json() as Promise<CompareResult>)
        .then((data) => { setCompareResult(data); setComparing(false); })
        .catch(() => setComparing(false));
    } else {
      mutate({ data: form });
    }
  }

  function setField(field: keyof FormState, val: string) {
    setForm((prev) => ({ ...prev, [field]: parseFloat(val) || 0 }));
  }

  const isRunning = isPending || comparing;

  // Build merged equity curve for comparison chart
  const mergedCurve = compareResult
    ? (() => {
        const takerMap = new Map(compareResult.taker.equityCurve.map((p) => [p.date, p.cumulative]));
        const makerMap = new Map(compareResult.maker.equityCurve.map((p) => [p.date, p.cumulative]));
        const allDates = Array.from(new Set([
          ...compareResult.taker.equityCurve.map((p) => p.date),
          ...compareResult.maker.equityCurve.map((p) => p.date),
        ])).sort();
        let lastTaker = 0, lastMaker = 0;
        return allDates.map((date) => {
          if (takerMap.has(date)) lastTaker = takerMap.get(date)!;
          if (makerMap.has(date)) lastMaker = makerMap.get(date)!;
          return { date, taker: lastTaker, maker: lastMaker };
        });
      })()
    : [];

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

      {/* Small capital analysis — shown when bankroll ≤ 200 */}
      {form.bankroll <= 200 && (
        <SmallCapitalPanel bankroll={form.bankroll} />
      )}

      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Backtest Parameters</h2>
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            <button
              onClick={() => setMode("single")}
              className={cn(
                "px-3 py-1.5 flex items-center gap-1.5 transition-colors",
                mode === "single" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <FlaskConical className="h-3 w-3" /> Single Run
            </button>
            <button
              onClick={() => setMode("compare")}
              className={cn(
                "px-3 py-1.5 flex items-center gap-1.5 transition-colors border-l border-border",
                mode === "compare" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Zap className="h-3 w-3" /> Maker vs Taker
            </button>
          </div>
        </div>

        {mode === "compare" && (
          <div className="rounded-lg bg-primary/5 border border-primary/20 px-3.5 py-2.5 mb-4 text-xs text-muted-foreground flex items-start gap-2">
            <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <span>
              Mode ini menjalankan <strong className="text-foreground">dua simulasi sekaligus</strong> — satu dengan order Taker (1% fee, 100% terisi) dan satu Maker (0% fee, ~70% terisi). Kamu bisa lihat mana yang lebih menguntungkan untuk modal dan strategi kamu.
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Days back</Label>
            <Input type="number" value={form.daysBack} onChange={(e) => setField("daysBack", e.target.value)} min={7} max={365} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Starting bankroll ($)</Label>
            <Input type="number" value={form.bankroll} onChange={(e) => setField("bankroll", e.target.value)} min={10} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Min probability (%)</Label>
            <Input type="number" value={Math.round(form.minProbability * 100)} onChange={(e) => setField("minProbability", String(parseInt(e.target.value) / 100))} min={70} max={97} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Max days to resolution</Label>
            <Input type="number" value={form.maxDaysToResolution} onChange={(e) => setField("maxDaysToResolution", e.target.value)} min={1} max={60} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Max position size (%)</Label>
            <Input type="number" value={form.maxPositionPct} onChange={(e) => setField("maxPositionPct", e.target.value)} min={1} max={25} />
          </div>
        </div>
        <Button onClick={handleRun} disabled={isRunning} className="mt-4">
          {isRunning
            ? mode === "compare" ? "Comparing..." : "Running simulation..."
            : mode === "compare" ? "Compare Maker vs Taker" : "Run Backtest"}
        </Button>
      </div>

      {/* ── COMPARE MODE RESULTS ── */}
      {mode === "compare" && compareResult && (
        <>
          {/* Verdict banner */}
          <div className={cn(
            "rounded-xl border p-5 mb-6 flex items-start gap-4",
            compareResult.verdict === "maker"
              ? "border-yes/30 bg-yes/5"
              : compareResult.verdict === "taker"
              ? "border-primary/30 bg-primary/5"
              : "border-border bg-card"
          )}>
            <div className={cn(
              "flex items-center justify-center h-10 w-10 rounded-full shrink-0 text-lg",
              compareResult.verdict === "maker" ? "bg-yes/20" : compareResult.verdict === "taker" ? "bg-primary/20" : "bg-muted"
            )}>
              {compareResult.verdict === "maker" ? "🏆" : compareResult.verdict === "taker" ? "⚡" : "🤝"}
            </div>
            <div>
              <div className="font-semibold text-foreground text-sm mb-1">
                {compareResult.verdict === "maker"
                  ? "Maker Menang!"
                  : compareResult.verdict === "taker"
                  ? "Taker Menang!"
                  : "Hasil Seri"}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{compareResult.verdictReason}</p>
              <div className="flex items-center gap-4 mt-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Taker final: </span>
                  <span className={cn("font-semibold", compareResult.takerFinalEquity >= form.bankroll ? "text-yes" : "text-no")}>
                    ${compareResult.takerFinalEquity.toFixed(2)}
                  </span>
                </div>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <div>
                  <span className="text-muted-foreground">Maker final: </span>
                  <span className={cn("font-semibold", compareResult.makerFinalEquity >= form.bankroll ? "text-yes" : "text-no")}>
                    ${compareResult.makerFinalEquity.toFixed(2)}
                  </span>
                </div>
                <div className="ml-auto">
                  <span className="text-muted-foreground">Fee hemat dengan Maker: </span>
                  <span className="font-semibold text-yes">${compareResult.feesSaved.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Side-by-side stats */}
          <div className="rounded-xl border border-border bg-card overflow-hidden mb-6">
            <div className="grid grid-cols-3 bg-muted/30 text-xs font-semibold">
              <div className="px-4 py-3 text-muted-foreground">Metrik</div>
              <div className="px-4 py-3 text-center flex items-center justify-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-primary" />
                <span className="text-primary">Taker (1% fee)</span>
              </div>
              <div className="px-4 py-3 text-center flex items-center justify-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-yes" />
                <span className="text-yes">Maker (0% fee)</span>
              </div>
            </div>
            <div className="px-4 divide-y divide-border/50">
              <CompareStatRow
                label="Total Return"
                takerVal={compareResult.taker.totalReturnPct}
                makerVal={compareResult.maker.totalReturnPct}
                winner={compareResult.taker.totalReturnPct > compareResult.maker.totalReturnPct ? "taker" : compareResult.maker.totalReturnPct > compareResult.taker.totalReturnPct ? "maker" : "tie"}
                format={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
              />
              <CompareStatRow
                label="Win Rate"
                takerVal={compareResult.taker.winRate}
                makerVal={compareResult.maker.winRate}
                winner={compareResult.taker.winRate > compareResult.maker.winRate ? "taker" : "maker"}
                format={(v) => `${v.toFixed(1)}%`}
              />
              <CompareStatRow
                label="Total Trades"
                takerVal={compareResult.taker.totalTrades}
                makerVal={compareResult.maker.totalTrades}
                winner={compareResult.taker.totalTrades > compareResult.maker.totalTrades ? "taker" : "maker"}
                format={(v) => String(v)}
              />
              <CompareStatRow
                label="Fee Dibayar"
                takerVal={compareResult.taker.totalFeesPaid}
                makerVal={compareResult.maker.totalFeesPaid}
                winner={compareResult.taker.totalFeesPaid < compareResult.maker.totalFeesPaid ? "taker" : "maker"}
                format={(v) => `$${v.toFixed(2)}`}
              />
              <CompareStatRow
                label="Max Drawdown"
                takerVal={compareResult.taker.maxDrawdown}
                makerVal={compareResult.maker.maxDrawdown}
                winner={compareResult.taker.maxDrawdown < compareResult.maker.maxDrawdown ? "taker" : "maker"}
                format={(v) => `${v.toFixed(1)}%`}
              />
              <CompareStatRow
                label="Sharpe Ratio"
                takerVal={compareResult.taker.sharpeRatio}
                makerVal={compareResult.maker.sharpeRatio}
                winner={compareResult.taker.sharpeRatio > compareResult.maker.sharpeRatio ? "taker" : "maker"}
                format={(v) => v.toFixed(2)}
              />
              <CompareStatRow
                label="Avg Return/Trade"
                takerVal={compareResult.taker.avgReturn}
                makerVal={compareResult.maker.avgReturn}
                winner={compareResult.taker.avgReturn > compareResult.maker.avgReturn ? "taker" : "maker"}
                format={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
              />
            </div>
          </div>

          {/* Dual equity curve */}
          <div className="rounded-xl border border-border bg-card p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Equity Curve — Taker vs Maker</h2>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary inline-block" /> Taker</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-yes inline-block" /> Maker</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={mergedCurve}>
                <defs>
                  <linearGradient id="taker-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="maker-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--yes))" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="hsl(var(--yes))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
                <Tooltip
                  formatter={(v: number, name: string) => [`$${v.toFixed(2)}`, name === "taker" ? "Taker P&L" : "Maker P&L"]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                />
                <Area type="monotone" dataKey="taker" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#taker-grad)" />
                <Area type="monotone" dataKey="maker" stroke="hsl(var(--yes))" strokeWidth={2} fill="url(#maker-grad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Penjelasan */}
          <div className="rounded-xl border border-border bg-card p-5 mb-6">
            <h2 className="text-sm font-semibold text-foreground mb-3">Kapan Pakai Maker? Kapan Taker?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-primary">Taker — Selalu Terisi</span>
                </div>
                <ul className="text-xs text-muted-foreground space-y-1.5">
                  <li>✓ 100% order langsung tereksekusi</li>
                  <li>✓ Cocok untuk market hampir resolve ({"<"}3 hari)</li>
                  <li>✓ Tidak perlu pantau order yang nongkrong</li>
                  <li>✗ Fee 1% setiap trade mengurangi profit</li>
                  <li>✗ Entry di harga ask (sedikit lebih mahal)</li>
                </ul>
              </div>
              <div className="rounded-lg bg-yes/5 border border-yes/20 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-yes" />
                  <span className="text-sm font-semibold text-yes">Maker — Hemat Fee</span>
                </div>
                <ul className="text-xs text-muted-foreground space-y-1.5">
                  <li>✓ 0% fee — hemat ~${compareResult.feesSaved.toFixed(2)} di simulasi ini</li>
                  <li>✓ Entry lebih baik (harga mid, bukan ask)</li>
                  <li>✓ Cocok untuk market dengan banyak waktu</li>
                  <li>✗ ~30% order tidak terisi (market bergerak)</li>
                  <li>✗ Berisiko lewatkan peluang near-resolution</li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── SINGLE MODE RESULTS ── */}
      {mode === "single" && isSuccess && result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard label="Total Return" value={`${result.totalReturnPct >= 0 ? "+" : ""}${result.totalReturnPct.toFixed(1)}%`} positive={result.totalReturnPct >= 0} icon={result.totalReturnPct >= 0 ? TrendingUp : TrendingDown} />
            <StatCard label="Win Rate" value={`${result.winRate.toFixed(1)}%`} positive={result.winRate >= 55} icon={Trophy} />
            <StatCard label="Total Trades" value={String(result.totalTrades)} icon={FlaskConical} />
            <StatCard label="Max Drawdown" value={`${result.maxDrawdown.toFixed(1)}%`} positive={result.maxDrawdown < 15} icon={AlertTriangle} />
            <StatCard label="Sharpe Ratio" value={result.sharpeRatio.toFixed(2)} positive={result.sharpeRatio >= 1} icon={TrendingUp} />
            <StatCard label="Avg Return/Trade" value={`${result.avgReturn >= 0 ? "+" : ""}${result.avgReturn.toFixed(1)}%`} positive={result.avgReturn >= 0} icon={TrendingUp} />
            <StatCard label="Total Fees Paid" value={`$${result.totalFeesPaid.toFixed(2)}`} positive={result.totalFeesPaid < result.totalTrades * 0.5} icon={AlertTriangle} sub="1% CLOB taker fee" />
            <StatCard label="Avg Spread Cost" value={`${result.avgSpreadPct.toFixed(2)}%`} positive={result.avgSpreadPct < 1} icon={AlertTriangle} />
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
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
                <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "Cumulative P&L"]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                <Area type="monotone" dataKey="cumulative" stroke="hsl(var(--yes))" strokeWidth={2} fill="url(#bt-gradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 mb-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">P&L per Trade</h2>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={result.trades.slice(0, 40)}>
                <XAxis hide />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
                <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "P&L"]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                  {result.trades.slice(0, 40).map((t, i) => (
                    <Cell key={i} fill={t.outcome === "win" ? "hsl(var(--yes))" : "hsl(var(--no))"} />
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
                        <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold", t.side === "YES" ? "bg-yes/10 text-yes" : "bg-no/10 text-no")}>
                          {t.side}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">{(t.entryPrice * 100).toFixed(0)}¢</td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">{(t.exitPrice * 100).toFixed(0)}¢</td>
                      <td className="px-4 py-2.5 text-right">${t.amount.toFixed(2)}</td>
                      <td className={cn("px-4 py-2.5 text-right font-medium", t.pnl >= 0 ? "text-yes" : "text-no")}>
                        {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground text-xs">${t.feePaid.toFixed(3)}</td>
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
