import { useState } from "react";
import {
  useGetOpportunities,
  useGetWalletStatus,
} from "@workspace/api-client-react";
import { RefreshCw, Zap, TrendingUp, Clock, ShieldCheck, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const RISK_COLORS = {
  low: "bg-yes/10 text-yes border border-yes/20",
  medium: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  high: "bg-no/10 text-no border border-no/20",
};

const RISK_ICON = {
  low: ShieldCheck,
  medium: AlertTriangle,
  high: AlertTriangle,
};

function OpportunityCard({
  op,
}: {
  op: {
    marketId: string;
    question: string;
    category: string;
    recommendedSide: "YES" | "NO";
    currentPrice: number;
    estimatedFairValue: number;
    edge: number;
    expectedReturn: number;
    kellyFraction: number;
    suggestedAmount: number;
    riskLevel: "low" | "medium" | "high";
    daysToResolution: number;
    volume24h: number;
    liquidity: number;
    compositeScore: number;
    rationale: string;
  };
}) {
  const RiskIcon = RISK_ICON[op.riskLevel];
  const isYes = op.recommendedSide === "YES";
  const scorePct = Math.round(op.compositeScore * 100);
  const scoreColor = scorePct >= 70 ? "text-yes" : scorePct >= 45 ? "text-yellow-400" : "text-no";
  const liqFormatted = op.liquidity >= 1_000_000
    ? `$${(op.liquidity / 1_000_000).toFixed(1)}M`
    : op.liquidity >= 1000
    ? `$${(op.liquidity / 1000).toFixed(0)}k`
    : `$${op.liquidity}`;

  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">
            {op.question}
          </p>
          <span className="text-xs text-muted-foreground mt-1 inline-block">
            {op.category}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={cn(
              "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold",
              isYes ? "bg-yes/10 text-yes" : "bg-no/10 text-no"
            )}
          >
            {op.recommendedSide}
          </span>
          <span className={cn("text-xs font-semibold", scoreColor)}>
            Score {scorePct}/100
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-background/50 rounded-lg p-3 text-center">
          <div className="text-xs text-muted-foreground mb-1">Price</div>
          <div className="text-base font-bold text-foreground">
            {(op.currentPrice * 100).toFixed(0)}¢
          </div>
          <div className="text-[10px] text-muted-foreground">FV {(op.estimatedFairValue * 100).toFixed(0)}¢</div>
        </div>
        <div className="bg-background/50 rounded-lg p-3 text-center">
          <div className="text-xs text-muted-foreground mb-1">Edge</div>
          <div className="text-base font-bold text-yes">
            +{(op.edge * 100).toFixed(1)}%
          </div>
        </div>
        <div className="bg-background/50 rounded-lg p-3 text-center">
          <div className="text-xs text-muted-foreground mb-1">Exp. Return</div>
          <div className="text-base font-bold text-yes">
            +{(op.expectedReturn * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {op.daysToResolution < 1 ? "<1 day" : `${op.daysToResolution.toFixed(1)}d to resolve`}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Vol: ${op.volume24h >= 1000 ? `${(op.volume24h / 1000).toFixed(0)}k` : op.volume24h}
          </div>
          <div>Liq: {liqFormatted}</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
            RISK_COLORS[op.riskLevel]
          )}
        >
          <RiskIcon className="h-3 w-3" />
          {op.riskLevel.charAt(0).toUpperCase() + op.riskLevel.slice(1)} risk
        </span>
        <div className="text-right">
          <span className="text-xs text-muted-foreground">Suggested bet</span>
          <div className="text-sm font-bold text-foreground">
            ${op.suggestedAmount.toFixed(2)}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-3">
        {op.rationale}
      </p>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
      <div className="flex gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-7 w-12 rounded-full" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

export default function Strategy() {
  const [filter, setFilter] = useState<"all" | "low" | "medium" | "high">("all");

  const { data: wallet } = useGetWalletStatus();
  const {
    data: opportunities,
    isLoading,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useGetOpportunities();

  const filtered = (opportunities ?? []).filter(
    (op) => filter === "all" || op.riskLevel === filter
  );

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : null;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Strategy Scanner
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Near-resolution high-probability markets · Half-Kelly sizing
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              Updated {lastUpdated}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {wallet && (
        <div
          className={cn(
            "mb-5 rounded-lg px-4 py-3 text-sm border flex items-center gap-2",
            wallet.dataSource === "live"
              ? "bg-yes/5 border-yes/20 text-yes"
              : "bg-yellow-500/5 border-yellow-500/20 text-yellow-400"
          )}
        >
          <div className={cn("h-2 w-2 rounded-full", wallet.dataSource === "live" ? "bg-yes animate-pulse" : "bg-yellow-400")} />
          {wallet.dataSource === "live"
            ? "Connected to Polymarket mainnet — live opportunity data"
            : "Demo mode — connect wallet in Settings for real mainnet data"}
        </div>
      )}

      <div className="flex gap-2 mb-5">
        {(["all", "low", "medium", "high"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setFilter(r)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              filter === r
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {r === "all" ? "All risks" : r.charAt(0).toUpperCase() + r.slice(1)}
            {r !== "all" && opportunities && (
              <span className="ml-1 opacity-60">
                ({opportunities.filter((op) => op.riskLevel === r).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2, 4].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Zap className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No opportunities found</p>
          <p className="text-xs mt-1">
            {filter !== "all"
              ? "Try selecting a different risk level"
              : "Markets don't meet the current filter criteria"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((op) => (
            <OpportunityCard key={`${op.marketId}-${op.recommendedSide}`} op={op} />
          ))}
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="mt-4 text-xs text-muted-foreground text-center">
          Showing {filtered.length} opportunit{filtered.length === 1 ? "y" : "ies"} ·
          Strategy: probability &gt;80%, resolution &lt;21 days, half-Kelly sizing, max 5% per trade
        </div>
      )}
    </div>
  );
}
