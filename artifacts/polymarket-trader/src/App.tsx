import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Markets from "@/pages/Markets";
import MarketDetail from "@/pages/MarketDetail";
import Positions from "@/pages/Positions";
import Orders from "@/pages/Orders";
import Portfolio from "@/pages/Portfolio";
import Strategy from "@/pages/Strategy";
import Backtest from "@/pages/Backtest";
import Correlation from "@/pages/Correlation";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/markets" component={Markets} />
        <Route path="/markets/:marketId" component={MarketDetail} />
        <Route path="/positions" component={Positions} />
        <Route path="/orders" component={Orders} />
        <Route path="/portfolio" component={Portfolio} />
        <Route path="/strategy" component={Strategy} />
        <Route path="/backtest" component={Backtest} />
        <Route path="/correlation" component={Correlation} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
