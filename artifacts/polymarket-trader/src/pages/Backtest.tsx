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

function SmallCapitalPanel({ bankroll, maxPosPct }: { bankroll: number; maxPosPct: number }) {
  const minOrder = 1;
  const perTrade = (bankroll * maxPosPct) / 100;
  const isTooSmall = perTrade < minOrder;
  // "Dead zone" bankroll = when kelly sizing falls below min order
  const deadZoneBankroll = Math.ceil((minOrder / (maxPosPct / 100)));
  const lossesToDead = perTrade > 0 ? Math.max(0, Math.floor((bankroll - deadZoneBankroll) / perTrade)) : 0;

  const isCritical = bankroll <= 20; // $20 or below — special warning
  const isTight = perTrade < 3 && !isTooSmall;
  const feasible = !isTooSmall;

  const spreadCostPct = perTrade < 2 ? 2.5 : perTrade < 5 ? 2.0 : perTrade < 20 ? 1.5 : 0.8;
  const feePerWinTrade = perTrade > 0 ? (perTrade / 0.85) * 0.01 : 0; // ~1% of shares value
  const feeAndSpread = (CLOB_TAKER_FEE_PCT + spreadCostPct).toFixed(1);
  const totalFeesAt100Trades = feePerWinTrade * 100 * 0.8; // assume 80% win rate

  const statusColor = isTooSmall
    ? "border-no/30 bg-no/5"
    : isCritical
    ? "border-no/30 bg-no/5"
    : isTight
    ? "border-yellow-500/30 bg-yellow-500/5"
    : "border-yes/30 bg-yes/5";
  const statusIconColor = isTooSmall || isCritical ? "text-no" : isTight ? "text-yellow-400" : "text-yes";
  const statusEmoji = isTooSmall ? "❌" : isCritical ? "🔴" : isTight ? "⚠️" : "✅";
  const statusLabel = isTooSmall
    ? "Tidak bisa — per trade di bawah minimum $1"
    : isCritical
    ? "Sangat berisiko — bot bisa berhenti setelah beberapa loss"
    : isTight
    ? "Bisa dipakai, tapi butuh hati-hati"
    : "Layak digunakan untuk bot trading";

  return (
    <div className={cn("rounded-xl border p-5 mb-6", statusColor)}>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-background/60">
          <DollarSign className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Analisis Modal ${bankroll} — Apakah Cukup?
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Dihitung dari bankroll ${bankroll} dengan max position {maxPosPct}%
          </p>
        </div>
        <div className={cn("ml-auto px-2.5 py-1 rounded-full text-xs font-bold border", statusIconColor,
          isTooSmall || isCritical ? "border-no/30 bg-no/10" : isTight ? "border-yellow-500/30 bg-yellow-500/10" : "border-yes/30 bg-yes/10"
        )}>
          {statusEmoji} {isTooSmall ? "Tidak Bisa" : isCritical ? "Berisiko Tinggi" : isTight ? "Mepet" : "Layak"}
        </div>
      </div>

      {/* Metric grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="rounded-lg bg-background/60 p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Per Trade</div>
          <div className={cn("font-bold text-lg", isTooSmall ? "text-no" : isCritical ? "text-yellow-400" : "text-foreground")}>
            ${perTrade.toFixed(2)}
          </div>
          <div className="text-[10px] text-muted-foreground">Min Polymarket: $1</div>
        </div>
        <div className="rounded-lg bg-background/60 p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Fee 100 trade</div>
          <div className="font-bold text-lg text-yes">${totalFeesAt100Trades.toFixed(2)}</div>
          <div className="text-[10px] text-muted-foreground">Fee BUKAN masalah utama</div>
        </div>
        <div className="rounded-lg bg-background/60 p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Bot Berhenti Saat</div>
          <div className={cn("font-bold text-lg", isTooSmall ? "text-no" : "text-no")}>
            ${deadZoneBankroll}
          </div>
          <div className="text-[10px] text-muted-foreground">bankroll &lt; min order</div>
        </div>
        <div className="rounded-lg bg-background/60 p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Loss Sebelum Stop</div>
          <div className={cn("font-bold text-lg", lossesToDead <= 3 ? "text-no" : lossesToDead <= 8 ? "text-yellow-400" : "text-yes")}>
            {isTooSmall ? "0" : lossesToDead} loss
          </div>
          <div className="text-[10px] text-muted-foreground">berturut-turut (worst case)</div>
        </div>
      </div>

      {/* Main warning/info block */}
      <div className={cn("rounded-lg p-3.5 text-xs leading-relaxed space-y-2", statusColor)}>
        <div className={cn("font-semibold flex items-center gap-1.5", statusIconColor)}>
          {isTooSmall || isCritical
            ? <XCircle className="h-4 w-4 shrink-0" />
            : isTight
            ? <AlertTriangle className="h-4 w-4 shrink-0" />
            : <CheckCircle2 className="h-4 w-4 shrink-0" />}
          {statusLabel}
        </div>

        {isCritical && !isTooSmall && (
          <div className="space-y-1.5 text-muted-foreground pt-1 border-t border-border/40">
            <p className="text-foreground font-medium">❓ Apakah fee akan menguras modal $20?</p>
            <p>
              <span className="text-yes font-semibold">Fee TIDAK</span> akan menguras modal. Dengan per trade ${perTrade.toFixed(2)},
              fee per trade hanya <span className="text-yes font-semibold">~${feePerWinTrade.toFixed(3)}</span>. Bahkan 100 trade pun fee total cuma ~${totalFeesAt100Trades.toFixed(2)}.
            </p>
            <p className="text-foreground font-medium mt-2">⚠️ Yang berbahaya adalah LOSING STREAK:</p>
            <div className="grid grid-cols-1 gap-1 mt-1">
              {[
                { loss: 1, eq: bankroll - perTrade * 1, note: "Normal" },
                { loss: 3, eq: bankroll - perTrade * 3, note: "Mulai kritis" },
                { loss: lossesToDead + 1, eq: bankroll - perTrade * (lossesToDead + 1), note: "Bot tidak bisa trade" },
              ].filter((r) => r.eq >= 0).map((row) => (
                <div key={row.loss} className="flex items-center justify-between bg-background/40 rounded px-2 py-1">
                  <span>{row.loss}x loss berturut</span>
                  <span className={cn("font-semibold", row.eq < deadZoneBankroll ? "text-no" : row.eq < bankroll * 0.85 ? "text-yellow-400" : "text-foreground")}>
                    Sisa ${Math.max(0, row.eq).toFixed(2)}
                    {row.eq < deadZoneBankroll && <span className="ml-1 text-no font-bold">← BOT STOP</span>}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2">
              <span className="text-foreground font-semibold">Kesimpulan:</span> Dengan $20, bot bisa berhenti permanen hanya setelah{" "}
              <span className="text-no font-semibold">{lossesToDead} loss berturut</span>. Win rate bot ~75-85% — kemungkinan ini terjadi kecil, tapi nyata.
            </p>
            <p>
              <span className="text-foreground font-semibold">Solusi terbaik:</span> Naikkan ke minimal{" "}
              <span className="text-yes font-semibold">$50</span> agar punya buffer lebih aman, atau naikkan Max Position Size ke 10% (tapi risikonya lebih besar).
            </p>
          </div>
        )}

        {isTooSmall && (
          <div className="space-y-1 text-muted-foreground pt-1 border-t border-border/40">
            <li>Bankroll ${bankroll} × {maxPosPct}% = ${perTrade.toFixed(2)} — di bawah minimum $1 Polymarket</li>
            <li>Naikkan bankroll ke minimal <span className="text-foreground font-semibold">${deadZoneBankroll}</span></li>
            <li>Atau naikkan Max Position Size ke {">"}{Math.ceil(100 / bankroll)}% di Strategy Config</li>
          </div>
        )}

        {!isCritical && !isTooSmall && (
          <ul className="space-y-1 text-muted-foreground pt-1 border-t border-border/40">
            {isTight ? (
              <>
                <li>• Spread ~{spreadCostPct}% di market kecil terasa berat untuk order ${perTrade.toFixed(2)}</li>
                <li>• Bot butuh edge ≥{feeAndSpread}% per trade untuk impas — strategi sudah set {">"}3%</li>
                <li>• <strong className="text-foreground">Saran:</strong> pilih market dengan likuiditas {">"}$50,000 saja</li>
              </>
            ) : (
              <>
                <li>• Per trade ${perTrade.toFixed(2)} cukup nyaman di atas minimum $1</li>
                <li>• Fee 100 trade hanya ~${totalFeesAt100Trades.toFixed(2)} — tidak signifikan</li>
                <li>• Bot bisa berhenti jika sisa bankroll turun ke ${deadZoneBankroll} ({lossesToDead} loss berturut)</li>
              </>
            )}
          </ul>
        )}
      </div>

      {/* Tier table */}
      <div className="mt-3 rounded-lg bg-background/60 border border-border p-3">
        <span className="text-[11px] font-medium text-foreground flex items-center gap-1 mb-2">
          <Info className="h-3 w-3 text-primary" /> Perbandingan ukuran modal
        </span>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Terlalu kecil", amount: 20, note: "Bot bisa stop 4 loss", color: "text-no", bg: "bg-no/10 border-no/20" },
            { label: "Starter", amount: 50, note: "Bisa, spread terasa", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
            { label: "Disarankan", amount: 200, note: "Nyaman & aman", color: "text-primary", bg: "bg-primary/10 border-primary/20" },
            { label: "Optimal", amount: 500, note: "Spread tidak terasa", color: "text-yes", bg: "bg-yes/10 border-yes/20" },
          ].map((t) => (
            <div key={t.label} className={cn(
              "rounded-md p-2 text-center border",
              bankroll >= t.amount && (t.amount === 500 || bankroll < ([20,50,200,500].find((x) => x > t.amount) ?? 999))
                ? t.bg
                : bankroll === t.amount
                ? t.bg
                : "bg-muted/20 border-border/50"
            )}>
              <div className={cn("font-bold text-sm", bankroll <= t.amount ? t.color : "text-muted-foreground")}>${t.amount}</div>
              <div className={cn("text-[10px] font-medium mt-0.5", bankroll <= t.amount ? t.color : "text-muted-foreground")}>{t.label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{t.note}</div>
            </div>
          ))}
        </div>
      </div>
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
        <SmallCapitalPanel bankroll={form.bankroll} maxPosPct={form.maxPositionPct} />
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
