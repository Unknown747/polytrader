import { useQuery } from "@tanstack/react-query";
import { Clock, AlertTriangle, TrendingUp, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ResolvingMarket {
  marketId: string;
  question: string;
  category: string;
  endDate: string;
  hoursLeft: number;
  daysLeft: number;
  yesPrice: number;
  noPrice: number;
  volume24h: number;
  liquidity: number;
  urgency: "critical" | "high" | "medium";
  openPosition: {
    market_id: string;
    side: string;
    price: number;
    amount: number;
    shares: number;
  } | null;
}

interface ResolutionData {
  markets: ResolvingMarket[];
  totalResolving: number;
  criticalCount: number;
  highCount: number;
}

function useResolutionTracker() {
  return useQuery<ResolutionData>({
    queryKey: ["markets-resolving-soon"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/markets/resolving-soon`);
      if (!res.ok) throw new Error("Failed to fetch resolving markets");
      return res.json() as Promise<ResolutionData>;
    },
    refetchInterval: 60000,
  });
}

function UrgencyBadge({ urgency }: { urgency: "critical" | "high" | "medium" }) {
  const cfg = {
    critical: { label: "🔴 Kritis", cls: "bg-no/20 text-no border-no/30" },
    high: { label: "🟡 Segera", cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
    medium: { label: "🟢 Normal", cls: "bg-yes/10 text-yes border-yes/20" },
  }[urgency];
  return (
    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded border", cfg.cls)}>
      {cfg.label}
    </span>
  );
}

function TimeDisplay({ hoursLeft }: { hoursLeft: number }) {
  if (hoursLeft < 1) {
    const mins = Math.round(hoursLeft * 60);
    return <span className="text-no font-bold">{mins}m tersisa</span>;
  }
  if (hoursLeft < 24) {
    return <span className="text-no font-bold">{hoursLeft.toFixed(1)}j tersisa</span>;
  }
  const days = Math.floor(hoursLeft / 24);
  const hrs = Math.round(hoursLeft % 24);
  return <span className="text-yellow-400 font-semibold">{days}h {hrs}j</span>;
}

function PriceBar({ yesPrice }: { yesPrice: number }) {
  const yesPct = Math.round(yesPrice * 100);
  const noPct = 100 - yesPct;
  return (
    <div className="space-y-1">
      <div className="flex h-2 w-full rounded-full overflow-hidden">
        <div className="bg-yes transition-all" style={{ width: `${yesPct}%` }} />
        <div className="bg-no transition-all" style={{ width: `${noPct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span className="text-yes">YES {yesPct}¢</span>
        <span className="text-no">NO {noPct}¢</span>
      </div>
    </div>
  );
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v}`;
}

export default function ResolutionTracker() {
  const { data, isLoading, refetch } = useResolutionTracker();

  const byUrgency = {
    critical: (data?.markets ?? []).filter((m) => m.urgency === "critical"),
    high: (data?.markets ?? []).filter((m) => m.urgency === "high"),
    medium: (data?.markets ?? []).filter((m) => m.urgency === "medium"),
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" />
            Resolving Soon
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Market yang akan resolve dalam 7 hari ke depan
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-foreground">{data?.totalResolving ?? 0}</div>
          <div className="text-xs text-muted-foreground mt-1">Total resolving</div>
        </div>
        <div className="rounded-xl border border-no/30 bg-no/5 p-4 text-center">
          <div className="text-2xl font-bold text-no">{data?.criticalCount ?? 0}</div>
          <div className="text-xs text-muted-foreground mt-1">Kritis (&lt;24 jam)</div>
        </div>
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-center">
          <div className="text-2xl font-bold text-yellow-400">{data?.highCount ?? 0}</div>
          <div className="text-xs text-muted-foreground mt-1">Segera (1-3 hari)</div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-3 animate-pulse" />
          <p className="text-sm text-muted-foreground">Memuat data market...</p>
        </div>
      ) : (data?.markets?.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Tidak ada market yang resolve dalam 7 hari ke depan.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Critical — &lt;24 jam */}
          {byUrgency.critical.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-no" />
                <span className="text-sm font-semibold text-no">Kritis — Resolve dalam 24 Jam</span>
              </div>
              <div className="space-y-3">
                {byUrgency.critical.map((m) => (
                  <MarketCard key={`${m.marketId}-${m.urgency}`} market={m} />
                ))}
              </div>
            </div>
          )}

          {/* High — 1-3 hari */}
          {byUrgency.high.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-yellow-400" />
                <span className="text-sm font-semibold text-yellow-400">Segera — Resolve 1-3 Hari</span>
              </div>
              <div className="space-y-3">
                {byUrgency.high.map((m) => (
                  <MarketCard key={`${m.marketId}-${m.urgency}`} market={m} />
                ))}
              </div>
            </div>
          )}

          {/* Medium — 3-7 hari */}
          {byUrgency.medium.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-muted-foreground">Dalam 7 Hari</span>
              </div>
              <div className="space-y-3">
                {byUrgency.medium.map((m) => (
                  <MarketCard key={`${m.marketId}-${m.urgency}`} market={m} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Info callout */}
      <div className="mt-6 rounded-lg border border-border bg-muted/20 p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground mb-1">💡 Cara gunakan halaman ini</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>Market kritis (&lt;24 jam) adalah peluang terbaik untuk strategi near-resolution</li>
          <li>Harga YES yang mendekati 90-97¢ artinya market hampir pasti resolve YES</li>
          <li>Posisi yang sudah open ditampilkan dengan latar warna berbeda</li>
          <li>Halaman ini auto-refresh setiap 60 detik</li>
        </ul>
      </div>
    </div>
  );
}

function MarketCard({ market }: { market: ResolvingMarket }) {
  const hasPosition = !!market.openPosition;
  return (
    <div className={cn(
      "rounded-xl border p-4 transition-colors",
      hasPosition
        ? "border-primary/30 bg-primary/5"
        : "border-border bg-card"
    )}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <UrgencyBadge urgency={market.urgency} />
            {market.category && (
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                {market.category}
              </span>
            )}
            {hasPosition && (
              <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded border border-primary/30 font-medium">
                ⚡ Posisi Open
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-foreground leading-tight">{market.question}</p>
        </div>
        <div className="text-right shrink-0">
          <TimeDisplay hoursLeft={market.hoursLeft} />
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {new Date(market.endDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        </div>
      </div>

      <PriceBar yesPrice={market.yesPrice} />

      <div className="flex items-center justify-between mt-3 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>Vol 24h: <span className="text-foreground">{formatVolume(market.volume24h)}</span></span>
          <span>Liq: <span className="text-foreground">{formatVolume(market.liquidity)}</span></span>
        </div>
        {hasPosition && market.openPosition && (
          <div className="flex items-center gap-1.5 text-primary">
            <span>{market.openPosition.side} @ {(market.openPosition.price * 100).toFixed(0)}¢ · ${market.openPosition.amount.toFixed(2)}</span>
          </div>
        )}
        <a
          href={`https://polymarket.com/event/${market.marketId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Polymarket
        </a>
      </div>
    </div>
  );
}
