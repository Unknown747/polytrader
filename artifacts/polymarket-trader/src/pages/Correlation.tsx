import { useState } from "react";
import { useGetWatchlistCorrelation } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AlertTriangle, Info, LayoutGrid } from "lucide-react";

const DAYS_OPTIONS = [
  { label: "7d", value: 7 },
  { label: "14d", value: 14 },
  { label: "30d", value: 30 },
  { label: "60d", value: 60 },
  { label: "90d", value: 90 },
];

const CATEGORY_COLORS: Record<string, string> = {
  Crypto: "text-purple-400",
  Economics: "text-blue-400",
  Sports: "text-green-400",
  Stocks: "text-amber-400",
  Politics: "text-red-400",
};

function correlationColor(r: number): string {
  if (r === 1) return "bg-emerald-500";
  if (r >= 0.7) return "bg-emerald-500/80";
  if (r >= 0.4) return "bg-emerald-500/50";
  if (r >= 0.1) return "bg-emerald-500/25";
  if (r > -0.1) return "bg-muted";
  if (r > -0.4) return "bg-red-500/25";
  if (r > -0.7) return "bg-red-500/50";
  return "bg-red-500/80";
}

function correlationTextColor(r: number): string {
  if (r >= 0.4) return "text-emerald-300";
  if (r > -0.4) return "text-muted-foreground";
  return "text-red-300";
}

function shortLabel(question: string, maxLen = 28): string {
  return question.length > maxLen ? question.slice(0, maxLen - 1) + "…" : question;
}

function ExposureWarning({
  markets,
  matrix,
}: {
  markets: Array<{ marketId: string; question: string; category: string }>;
  matrix: number[][];
}) {
  if (markets.length < 2) return null;

  const exposures = markets.map((m, i) => {
    const highCorrCount = matrix[i].filter(
      (r, j) => j !== i && r >= 0.6
    ).length;
    return { ...m, highCorrCount };
  });

  const warnings = exposures.filter((e) => e.highCorrCount >= 2);

  if (warnings.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-300 mb-1">Concentration Risk Detected</p>
          <ul className="space-y-0.5">
            {warnings.map((w) => (
              <li key={w.marketId} className="text-xs text-amber-400/80">
                <span className="font-medium">{shortLabel(w.question, 50)}</span>
                {" "}moves with {w.highCorrCount} other watched market{w.highCorrCount !== 1 ? "s" : ""} (r ≥ 0.60)
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ColorLegend() {
  const steps = [
    { label: "+1.0", className: "bg-emerald-500" },
    { label: "+0.7", className: "bg-emerald-500/80" },
    { label: "+0.4", className: "bg-emerald-500/50" },
    { label: "+0.1", className: "bg-emerald-500/25" },
    { label: "0", className: "bg-muted" },
    { label: "−0.1", className: "bg-red-500/25" },
    { label: "−0.4", className: "bg-red-500/50" },
    { label: "−0.7", className: "bg-red-500/80" },
  ];
  return (
    <div className="flex items-center gap-1">
      {steps.map((s) => (
        <div key={s.label} className="flex flex-col items-center gap-0.5">
          <div className={cn("h-3 w-6 rounded-sm", s.className)} />
          <span className="text-[9px] text-muted-foreground leading-none">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function Correlation() {
  const [days, setDays] = useState(30);
  const [hovered, setHovered] = useState<{ i: number; j: number } | null>(null);

  const { data, isLoading } = useGetWatchlistCorrelation(
    { days },
    { query: { refetchInterval: 60000 } }
  );

  const markets = data?.markets ?? [];
  const matrix = data?.matrix ?? [];
  const n = markets.length;

  const hoveredCorr =
    hovered && matrix.length > 0
      ? matrix[hovered.i]?.[hovered.j]
      : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Correlation Heatmap</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            How YES prices across your watched markets move together
          </p>
        </div>

        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
          {DAYS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                days === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : n === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-20 text-center">
          <LayoutGrid className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground">No markets in your watchlist</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add markets to your watchlist from the Markets page to see correlations.
          </p>
        </div>
      ) : n === 1 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-20 text-center">
          <Info className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground">Only one market watched</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add at least two markets to your watchlist to compute correlations.
          </p>
        </div>
      ) : (
        <>
          <ExposureWarning markets={markets} matrix={matrix} />

          <div className="rounded-xl border border-border bg-card p-5 overflow-auto">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Pearson correlation of YES prices over {days} days · Hover cells for details
                </span>
              </div>
              <ColorLegend />
            </div>

            {hoveredCorr !== null && hovered && (
              <div className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
                <span className="text-muted-foreground">
                  {shortLabel(markets[hovered.i].question, 50)}
                </span>
                <span className="mx-2 text-muted-foreground">↔</span>
                <span className="text-muted-foreground">
                  {shortLabel(markets[hovered.j].question, 50)}
                </span>
                <span
                  className={cn(
                    "ml-3 font-bold text-sm",
                    hoveredCorr >= 0.4
                      ? "text-emerald-400"
                      : hoveredCorr <= -0.4
                      ? "text-red-400"
                      : "text-foreground"
                  )}
                >
                  r = {hoveredCorr.toFixed(4)}
                </span>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-1 min-w-max">
                <thead>
                  <tr>
                    <th className="w-40" />
                    {markets.map((m, j) => (
                      <th key={m.marketId} className="w-10 pb-1">
                        <div
                          className="h-20 flex items-end justify-center"
                          title={m.question}
                        >
                          <div
                            className={cn(
                              "text-[10px] font-medium leading-tight text-center",
                              CATEGORY_COLORS[m.category] ?? "text-muted-foreground"
                            )}
                            style={{
                              writingMode: "vertical-rl",
                              transform: "rotate(180deg)",
                              maxHeight: "76px",
                              overflow: "hidden",
                            }}
                          >
                            {shortLabel(m.question, 32)}
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {markets.map((rowMarket, i) => (
                    <tr key={rowMarket.marketId}>
                      <td className="pr-2 text-right">
                        <span
                          className={cn(
                            "text-[11px] font-medium leading-tight",
                            CATEGORY_COLORS[rowMarket.category] ?? "text-muted-foreground"
                          )}
                          title={rowMarket.question}
                        >
                          {shortLabel(rowMarket.question, 28)}
                        </span>
                      </td>
                      {markets.map((_, j) => {
                        const r = matrix[i]?.[j] ?? 0;
                        const isDiag = i === j;
                        const isHov =
                          hovered?.i === i && hovered?.j === j;
                        return (
                          <td
                            key={j}
                            className={cn(
                              "h-9 w-9 rounded-md cursor-default transition-all select-none",
                              correlationColor(r),
                              isHov && "ring-2 ring-white/50 scale-105"
                            )}
                            onMouseEnter={() =>
                              !isDiag && setHovered({ i, j })
                            }
                            onMouseLeave={() => setHovered(null)}
                            title={
                              isDiag
                                ? rowMarket.question
                                : `r = ${r.toFixed(4)}`
                            }
                          >
                            <div
                              className={cn(
                                "h-full w-full flex items-center justify-center text-[10px] font-semibold",
                                isDiag ? "text-foreground" : correlationTextColor(r)
                              )}
                            >
                              {isDiag ? "—" : r.toFixed(2)}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                label: "Highly Correlated Pairs",
                desc: "Moving together (r ≥ 0.70)",
                color: "text-emerald-400",
                bg: "bg-emerald-500/10 border-emerald-500/20",
                filter: (r: number) => r >= 0.7 && r < 1,
              },
              {
                label: "Uncorrelated Pairs",
                desc: "Independent (−0.2 ≤ r ≤ 0.2)",
                color: "text-foreground",
                bg: "bg-muted/30 border-border",
                filter: (r: number) => r > -0.2 && r < 0.2,
              },
              {
                label: "Negatively Correlated",
                desc: "Moving opposite (r ≤ −0.40)",
                color: "text-red-400",
                bg: "bg-red-500/10 border-red-500/20",
                filter: (r: number) => r <= -0.4,
              },
            ].map((stat) => {
              let count = 0;
              for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                  if (stat.filter(matrix[i][j])) count++;
                }
              }
              return (
                <div
                  key={stat.label}
                  className={cn("rounded-xl border p-4", stat.bg)}
                >
                  <div className={cn("text-2xl font-bold", stat.color)}>
                    {count}
                  </div>
                  <div className="text-sm font-medium text-foreground mt-0.5">
                    {stat.label}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {stat.desc}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
