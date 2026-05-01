import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListMarkets, getListMarketsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Search, ChevronRight, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const CATEGORIES = ["All", "Economics", "Crypto", "Politics", "Sports", "AI", "Tech", "Science", "Stocks"];
const STATUSES = ["all", "active", "resolved"] as const;
type StatusFilter = typeof STATUSES[number];

interface WatchlistItem {
  marketId: string;
  marketQuestion: string;
  category: string;
  yesPrice: number;
  noPrice: number;
  volume24h: number;
  addedAt: string;
}

function useWatchlist() {
  return useQuery<WatchlistItem[]>({
    queryKey: ["watchlist"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/watchlist`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<WatchlistItem[]>;
    },
  });
}

function useToggleWatch() {
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: async (marketId: string) => {
      await fetch(`${import.meta.env.BASE_URL}api/watchlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });
  const remove = useMutation({
    mutationFn: async (marketId: string) => {
      await fetch(`${import.meta.env.BASE_URL}api/watchlist/${marketId}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });
  return { add, remove };
}

function MarketStatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge className="text-[10px] bg-yes/15 text-yes border-yes/30 hover:bg-yes/20">Active</Badge>;
  if (status === "resolved") return <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30 hover:bg-primary/20">Resolved</Badge>;
  return <Badge variant="secondary" className="text-[10px]">Closed</Badge>;
}

function PriceBar({ yes, no }: { yes: number; no: number }) {
  return (
    <div className="flex h-1 w-full rounded-full overflow-hidden">
      <div className="bg-yes" style={{ width: `${yes * 100}%` }} />
      <div className="bg-no" style={{ width: `${no * 100}%` }} />
    </div>
  );
}

export default function Markets() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);

  const params = {
    ...(search ? { search } : {}),
    ...(category !== "All" ? { category } : {}),
    ...(status !== "all" ? { status } : {}),
  };

  const { data: markets, isLoading } = useListMarkets(params, {
    query: { queryKey: getListMarketsQueryKey(params), refetchInterval: 60000 },
  });

  const { data: watchlist = [] } = useWatchlist();
  const { add, remove } = useToggleWatch();

  const watchedIds = new Set(watchlist.map((w) => w.marketId));

  const visibleMarkets = showWatchlistOnly
    ? (markets ?? []).filter((m) => watchedIds.has(m.id))
    : (markets ?? []);

  function toggleWatch(e: React.MouseEvent, marketId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (watchedIds.has(marketId)) {
      remove.mutate(marketId);
    } else {
      add.mutate(marketId);
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Markets</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Browse prediction markets</p>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="input-search"
            placeholder="Search markets..."
            className="pl-9 bg-card border-border"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowWatchlistOnly(!showWatchlistOnly)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium border transition-colors flex items-center gap-1.5",
              showWatchlistOnly
                ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
            )}
          >
            <Star className="h-3 w-3" />
            Watchlist {watchedIds.size > 0 && `(${watchedIds.size})`}
          </button>
          <div className="h-5 w-px bg-border" />
          {STATUSES.map((s) => (
            <button
              key={s}
              data-testid={`filter-status-${s}`}
              onClick={() => setStatus(s)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize",
                status === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              )}
            >
              {s}
            </button>
          ))}
          <div className="h-5 w-px bg-border" />
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              data-testid={`filter-category-${cat}`}
              onClick={() => setCategory(cat)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                category === cat
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Market list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : !visibleMarkets || visibleMarkets.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {showWatchlistOnly ? "No watched markets match current filters" : "No markets found"}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleMarkets.map((market) => {
            const isWatched = watchedIds.has(market.id);
            return (
              <Link key={market.id} href={`/markets/${market.id}`}>
                <div
                  data-testid={`market-card-${market.id}`}
                  className="rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:bg-accent/30 transition-colors cursor-pointer group"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <MarketStatusBadge status={market.status} />
                        <span className="text-[10px] text-muted-foreground">{market.category}</span>
                      </div>
                      <div className="text-sm font-medium text-foreground leading-snug mb-2">
                        {market.question}
                      </div>
                      <PriceBar yes={market.yesPrice} no={market.noPrice} />
                      <div className="flex items-center gap-4 mt-1.5">
                        <span className="text-xs text-yes font-mono font-medium">YES {(market.yesPrice * 100).toFixed(0)}¢</span>
                        <span className="text-xs text-no font-mono font-medium">NO {(market.noPrice * 100).toFixed(0)}¢</span>
                        <span className="text-xs text-muted-foreground ml-auto font-mono">
                          Vol ${(market.volume / 1000).toFixed(0)}K
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => toggleWatch(e, market.id)}
                        className={cn(
                          "p-1.5 rounded-lg transition-colors",
                          isWatched
                            ? "text-yellow-400 hover:text-yellow-300"
                            : "text-muted-foreground hover:text-yellow-400"
                        )}
                        title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
                      >
                        <Star className={cn("h-4 w-4", isWatched && "fill-current")} />
                      </button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5 group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
