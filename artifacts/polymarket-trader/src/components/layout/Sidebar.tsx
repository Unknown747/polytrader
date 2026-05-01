import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  TrendingUp,
  Wallet,
  ClipboardList,
  BarChart3,
  Activity,
  Zap,
  FlaskConical,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetWalletStatus } from "@workspace/api-client-react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/markets", label: "Markets", icon: TrendingUp },
  { href: "/positions", label: "Positions", icon: Wallet },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/portfolio", label: "Portfolio", icon: BarChart3 },
  { href: "/strategy", label: "Strategy", icon: Zap },
  { href: "/backtest", label: "Backtest", icon: FlaskConical },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export function Sidebar() {
  const [location] = useLocation();
  const { data: wallet } = useGetWalletStatus();
  const isLive = wallet?.dataSource === "live";

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-sidebar flex flex-col h-screen sticky top-0">
      <div className="flex items-center gap-2 px-5 py-5 border-b border-border">
        <Activity className="h-5 w-5 text-primary" />
        <span className="font-bold text-base tracking-tight text-foreground">
          PolyTrader
        </span>
        <span
          className={cn(
            "ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded border",
            isLive
              ? "bg-yes/20 text-yes border-yes/30"
              : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
          )}
        >
          {isLive ? "LIVE" : "DEMO"}
        </span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = location === href;
          return (
            <Link key={href} href={href}>
              <div
                data-testid={`nav-${label.toLowerCase()}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-border">
        <div className="text-xs text-muted-foreground">
          <div className="font-medium text-foreground mb-1">
            {isLive ? "Polygon Mainnet" : "Demo Mode"}
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full animate-pulse",
                isLive ? "bg-yes" : "bg-yellow-400"
              )}
            />
            {isLive ? "Live Polymarket data" : "Using demo data"}
          </div>
        </div>
      </div>
    </aside>
  );
}
