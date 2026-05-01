import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PieChart, TrendingUp, TrendingDown, Award, AlertTriangle, RefreshCw, BarChart2, Target, Percent, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CategoryStat {
  category: string;
  trades: number;
  winRate: number;
  totalPnl: number;
  avgEdge: number;
}

interface PaperTrade {
  id: number;
  timestamp: string;
  marketId: string;
  question: string;
  category: string;
  side: "YES" | "NO";
  entryPrice: number;
  amount: number;
  shares: number;
  edge: number;
  compositeScore: number;
  status: string;
  pnl: number | null;
  pnlPct: number | null;
}

interface AnalyticsData {
  byCategory: CategoryStat[];
  bestTrades: PaperTrade[];
  worstTrades: PaperTrade[];
  totalTrades: number;
  overallWinRate: number;
  totalPnl: number;
  avgEdge: number;
  tradeStats: {
    total: number;
    totalAttempts: number;
    successRate: number;
    avgEdge: number;
    avgScore: number;
    recentTrades: Array<{
      timestamp: string;
      question: string;
      side: "YES" | "NO";
      price: number;
      amount: number;
      edge: number;
      compositeScore: number;
      success: boolean;
      orderId: string | null;
      error: string | null;
    }>;
  };
}

interface PaperPortfolio {
  balance: number;
  initialBalance: number;
  totalTrades: number;
  openTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnl: number;
  totalPnlPct: number;
  winRate: number;
  openPositionValue: number;
  paperTradingMode: boolean;
  paperBankroll: number;
  trades: PaperTrade[];
}

function useAnalytics() {
  return useQuery<AnalyticsData>({
    queryKey: ["analytics-performance"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/analytics/performance`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json() as Promise<AnalyticsData>;
    },
    refetchInterval: 30000,
  });
}

function usePaperPortfolio() {
  return useQuery<PaperPortfolio>({
    queryKey: ["paper-portfolio"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/paper-trading/status`);
      if (!res.ok) throw new Error("Failed to fetch paper portfolio");
      return res.json() as Promise<PaperPortfolio>;
    },
    refetchInterval: 15000,
  });
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={cn("text-2xl font-bold", color ?? "text-foreground")}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function WinRateBar({ winRate, trades }: { winRate: number; trades: number }) {
  const color = winRate >= 65 ? "bg-yes" : winRate >= 50 ? "bg-yellow-400" : "bg-no";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{trades} trades</span>
        <span className={cn("font-semibold", winRate >= 65 ? "text-yes" : winRate >= 50 ? "text-yellow-400" : "text-no")}>
          {winRate.toFixed(1)}%
        </span>
      </div>
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(winRate, 100)}%` }} />
      </div>
    </div>
  );
}

function PnlBadge({ pnl }: { pnl: number }) {
  const sign = pnl >= 0 ? "+" : "";
  return (
    <span className={cn("text-xs font-mono font-semibold", pnl >= 0 ? "text-yes" : "text-no")}>
      {sign}${pnl.toFixed(2)}
    </span>
  );
}

export default function Analytics() {
  const { data: analytics, isLoading: loadingAnalytics, refetch } = useAnalytics();
  const { data: paper, isLoading: loadingPaper, refetch: refetchPaper } = usePaperPortfolio();
  const [resetting, setResetting] = useState(false);
  const [activeTab, setActiveTab] = useState<"paper" | "live">("paper");

  async function handleReset() {
    setResetting(true);
    try {
      await fetch(`${import.meta.env.BASE_URL}api/paper-trading/reset`, { method: "POST" });
      await refetchPaper();
    } finally {
      setResetting(false);
    }
  }

  const paperTrades = paper?.trades ?? [];
  const closedPaperTrades = paperTrades.filter((t) => t.status === "won" || t.status === "lost");

  const catMap: Record<string, { wins: number; total: number; pnl: number }> = {};
  for (const t of closedPaperTrades) {
    if (!catMap[t.category]) catMap[t.category] = { wins: 0, total: 0, pnl: 0 };
    catMap[t.category].total++;
    catMap[t.category].pnl += t.pnl ?? 0;
    if (t.status === "won") catMap[t.category].wins++;
  }

  const paperByCategory = Object.entries(catMap).map(([cat, d]) => ({
    category: cat,
    trades: d.total,
    winRate: d.total > 0 ? (d.wins / d.total) * 100 : 0,
    totalPnl: d.pnl,
  })).sort((a, b) => b.totalPnl - a.totalPnl);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <PieChart className="h-6 w-6 text-primary" />
            Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Performance analytics, win rate per kategori, dan paper trading
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { void refetch(); void refetchPaper(); }}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-6 bg-muted/30 rounded-lg p-1 w-fit">
        {(["paper", "live"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === "paper" ? "📝 Paper Trading" : "📊 Live Bot"}
          </button>
        ))}
      </div>

      {/* ── PAPER TRADING TAB ── */}
      {activeTab === "paper" && (
        <div className="space-y-5">
          {/* Paper mode status banner */}
          {!paper?.paperTradingMode && (
            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-yellow-300">Paper Trading Nonaktif</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Aktifkan Paper Trading Mode di Settings untuk mulai simulasi. Data di bawah adalah history sebelumnya.
                </div>
              </div>
            </div>
          )}

          {/* Paper stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Paper Balance"
              value={`$${(paper?.balance ?? 0).toFixed(2)}`}
              sub={`Awal: $${(paper?.initialBalance ?? 0).toFixed(2)}`}
            />
            <StatCard
              label="Total P&L"
              value={`${(paper?.totalPnl ?? 0) >= 0 ? "+" : ""}$${(paper?.totalPnl ?? 0).toFixed(2)}`}
              sub={`${(paper?.totalPnlPct ?? 0).toFixed(2)}%`}
              color={(paper?.totalPnl ?? 0) >= 0 ? "text-yes" : "text-no"}
            />
            <StatCard
              label="Win Rate"
              value={`${(paper?.winRate ?? 0).toFixed(1)}%`}
              sub={`${paper?.winningTrades ?? 0}W / ${paper?.losingTrades ?? 0}L`}
              color={(paper?.winRate ?? 0) >= 55 ? "text-yes" : "text-no"}
            />
            <StatCard
              label="Open Trades"
              value={String(paper?.openTrades ?? 0)}
              sub={`$${(paper?.openPositionValue ?? 0).toFixed(2)} exposed`}
            />
          </div>

          {/* Paper by category */}
          {paperByCategory.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Win Rate per Kategori (Paper)</span>
              </div>
              <div className="space-y-3">
                {paperByCategory.map((cat) => (
                  <div key={cat.category} className="flex items-center gap-4">
                    <div className="w-28 text-xs text-muted-foreground truncate">{cat.category || "Unknown"}</div>
                    <div className="flex-1">
                      <WinRateBar winRate={cat.winRate} trades={cat.trades} />
                    </div>
                    <PnlBadge pnl={cat.totalPnl} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trade list */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Semua Paper Trades</span>
                <span className="text-xs text-muted-foreground">({paperTrades.length} trades)</span>
              </div>
              <Button variant="outline" size="sm" onClick={handleReset} disabled={resetting}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                {resetting ? "Mereset..." : "Reset Portfolio"}
              </Button>
            </div>

            {loadingPaper ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Memuat data...</div>
            ) : paperTrades.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                Belum ada paper trades. Aktifkan Paper Trading Mode di Settings.
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {paperTrades.map((t) => {
                  const isOpen = t.status === "open";
                  const isWon = t.status === "won";
                  return (
                    <div key={t.id} className={cn(
                      "rounded-lg border p-3 text-xs",
                      isOpen ? "border-border bg-background/50"
                      : isWon ? "border-yes/20 bg-yes/5"
                      : "border-no/20 bg-no/5"
                    )}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-foreground truncate">{t.question}</div>
                          <div className="text-muted-foreground mt-0.5">
                            {t.side} @ {(t.entryPrice * 100).toFixed(0)}¢ · $
                            {t.amount.toFixed(2)} · Edge {(t.edge * 100).toFixed(1)}%
                            {t.category && <span className="ml-2 text-[10px] bg-muted px-1.5 py-0.5 rounded">{t.category}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {isOpen ? (
                            <span className="text-yellow-400 font-medium">Open</span>
                          ) : (
                            <span className={isWon ? "text-yes font-medium" : "text-no font-medium"}>
                              {isWon ? "Won" : "Lost"} {t.pnl !== null ? `(${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)})` : ""}
                            </span>
                          )}
                          <div className="text-muted-foreground">{new Date(t.timestamp).toLocaleDateString("id-ID")}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── LIVE BOT TAB ── */}
      {activeTab === "live" && (
        <div className="space-y-5">
          {/* Live bot stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Total Attempts"
              value={String(analytics?.tradeStats?.totalAttempts ?? 0)}
              sub="order dikirim ke CLOB"
            />
            <StatCard
              label="Berhasil"
              value={String(analytics?.tradeStats?.total ?? 0)}
              sub="order dikonfirmasi"
              color="text-yes"
            />
            <StatCard
              label="Success Rate"
              value={`${(analytics?.tradeStats?.successRate ?? 0).toFixed(1)}%`}
              sub="order fill rate"
              color={(analytics?.tradeStats?.successRate ?? 0) >= 80 ? "text-yes" : "text-yellow-400"}
            />
            <StatCard
              label="Avg Edge"
              value={`${(analytics?.tradeStats?.avgEdge ?? 0).toFixed(1)}%`}
              sub="rata-rata edge"
              color="text-primary"
            />
          </div>

          {/* Paper analytics by category (combined) */}
          {(analytics?.byCategory?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Win Rate per Kategori (Simulasi)</span>
              </div>
              <div className="space-y-3">
                {(analytics?.byCategory ?? []).map((cat) => (
                  <div key={cat.category} className="flex items-center gap-4">
                    <div className="w-28 text-xs text-muted-foreground truncate">{cat.category}</div>
                    <div className="flex-1">
                      <WinRateBar winRate={cat.winRate} trades={cat.trades} />
                    </div>
                    <div className="text-right">
                      <PnlBadge pnl={cat.totalPnl} />
                      <div className="text-[10px] text-muted-foreground">{cat.avgEdge.toFixed(1)}% avg edge</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Best trades */}
          {(analytics?.bestTrades?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Award className="h-4 w-4 text-yes" />
                <span className="text-sm font-semibold text-yes">Trade Terbaik</span>
              </div>
              <div className="space-y-2">
                {analytics!.bestTrades.map((t) => (
                  <div key={t.id} className="rounded-lg border border-yes/20 bg-yes/5 p-3 text-xs">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{t.question}</div>
                        <div className="text-muted-foreground mt-0.5">{t.side} @ {(t.entryPrice * 100).toFixed(0)}¢ · {t.category}</div>
                      </div>
                      <PnlBadge pnl={t.pnl ?? 0} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Worst trades */}
          {(analytics?.worstTrades?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown className="h-4 w-4 text-no" />
                <span className="text-sm font-semibold text-no">Trade Terburuk</span>
              </div>
              <div className="space-y-2">
                {analytics!.worstTrades.map((t) => (
                  <div key={t.id} className="rounded-lg border border-no/20 bg-no/5 p-3 text-xs">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{t.question}</div>
                        <div className="text-muted-foreground mt-0.5">{t.side} @ {(t.entryPrice * 100).toFixed(0)}¢ · {t.category}</div>
                      </div>
                      <PnlBadge pnl={t.pnl ?? 0} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent live bot trades */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Riwayat Bot Terbaru</span>
            </div>
            {loadingAnalytics ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Memuat...</div>
            ) : (analytics?.tradeStats?.recentTrades?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                Belum ada trade. Aktifkan Auto-Trading dan tunggu bot scan peluang.
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {(analytics?.tradeStats?.recentTrades ?? []).map((t, i) => (
                  <div key={i} className={cn(
                    "rounded-lg border p-3 text-xs",
                    t.success ? "border-yes/20 bg-yes/5" : "border-no/20 bg-no/5"
                  )}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{t.question}</div>
                        <div className="text-muted-foreground mt-0.5">
                          {t.side} @ {(t.price * 100).toFixed(0)}¢ · ${t.amount.toFixed(2)}
                          · Edge {(t.edge * 100).toFixed(1)}%
                          · Score {(t.compositeScore * 100).toFixed(0)}/100
                        </div>
                        {t.error && <div className="text-no mt-0.5">{t.error}</div>}
                      </div>
                      <div className="text-right shrink-0">
                        <span className={t.success ? "text-yes font-medium" : "text-no font-medium"}>
                          {t.success ? "✓ Filled" : "✗ Failed"}
                        </span>
                        <div className="text-muted-foreground">{new Date(t.timestamp).toLocaleDateString("id-ID")}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Overall analytics summary */}
          {analytics && analytics.totalTrades > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Percent className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Ringkasan Simulasi</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Total Trades" value={String(analytics.totalTrades)} />
                <StatCard label="Win Rate" value={`${analytics.overallWinRate.toFixed(1)}%`} color={analytics.overallWinRate >= 55 ? "text-yes" : "text-no"} />
                <StatCard label="Total P&L" value={`${analytics.totalPnl >= 0 ? "+" : ""}$${analytics.totalPnl.toFixed(2)}`} color={analytics.totalPnl >= 0 ? "text-yes" : "text-no"} />
                <StatCard label="Avg Edge" value={`${analytics.avgEdge.toFixed(1)}%`} color="text-primary" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
