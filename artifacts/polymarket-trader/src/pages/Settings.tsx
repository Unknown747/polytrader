import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useGetStrategyConfig,
  useUpdateStrategyConfig,
  useGetWalletStatus,
  useTestTelegram,
} from "@workspace/api-client-react";
import { Settings2, Send, Wallet, Bot, AlertCircle, CheckCircle2, Zap, Activity, TrendingUp, PlayCircle, RotateCcw, Database, ChevronRight, Key, Shield, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface AutoTradingStatus {
  enabled: boolean;
  clobConfigured: boolean;
  tradesToday: number;
  maxDailyTrades: number;
  remainingSlots: number;
  totalTradesLifetime: number;
  lastScanAt: string | null;
  lastTradeAt: string | null;
  usdcBalance: number;
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
}

function useAutoTradingStatus() {
  return useQuery<AutoTradingStatus>({
    queryKey: ["auto-trading-status"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auto-trading/status`);
      if (!res.ok) throw new Error("Failed to fetch auto-trading status");
      return res.json() as Promise<AutoTradingStatus>;
    },
    refetchInterval: 15000,
  });
}

function useTriggerScan() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const trigger = async () => {
    setPending(true);
    setResult(null);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auto-trading/trigger`, { method: "POST" });
      const data = await res.json() as { success: boolean; message: string };
      setResult(data);
    } catch {
      setResult({ success: false, message: "Request failed" });
    } finally {
      setPending(false);
    }
  };
  return { trigger, pending, result };
}

function useResetDemo() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const reset = async () => {
    setPending(true);
    setResult(null);
    setConfirmOpen(false);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/demo/reset`, { method: "POST" });
      const data = await res.json() as { success: boolean; message: string };
      setResult(data);
    } catch {
      setResult({ success: false, message: "Request failed" });
    } finally {
      setPending(false);
    }
  };
  return { reset, pending, result, confirmOpen, setConfirmOpen };
}

type StrategyConfig = {
  autoTradingEnabled: boolean;
  bankroll: number;
  maxPositionPct: number;
  minEdge: number;
  minProbability: number;
  maxDaysToResolution: number;
  minVolume24h: number;
  minLiquidity: number;
  scanIntervalMinutes: number;
  telegramAlertsEnabled: boolean;
  maxDailyTrades: number;
  maxOpportunities: number;
  dailyReportHour: number;
  stopLossPct: number;
  takeProfitPct: number;
  trendFilterEnabled: boolean;
};

const WIZARD_STEPS = [
  {
    id: "privatekey",
    label: "Wallet Key",
    icon: Key,
    title: "Step 1 — Polygon Wallet Private Key",
    description: "Your wallet private key is used to sign orders on-chain. Never share it.",
    fields: [{ key: "POLYMARKET_PRIVATE_KEY", label: "Private Key", placeholder: "0x…", type: "password" }],
    hint: "Export from MetaMask: Account → Three dots → Account details → Export private key",
  },
  {
    id: "api",
    label: "API Credentials",
    icon: Shield,
    title: "Step 2 — Polymarket L2 API Credentials",
    description: "Used to sign REST requests to the CLOB order book.",
    fields: [
      { key: "POLYMARKET_API_KEY", label: "API Key", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", type: "text" },
      { key: "POLYMARKET_API_SECRET", label: "API Secret", placeholder: "your-api-secret", type: "password" },
      { key: "POLYMARKET_API_PASSPHRASE", label: "API Passphrase", placeholder: "your-passphrase", type: "password" },
    ],
    hint: "Get these from polymarket.com → Account → API Keys → Create key",
  },
  {
    id: "telegram",
    label: "Telegram",
    icon: Bell,
    title: "Step 3 — Telegram Notifications (Optional)",
    description: "Receive trade alerts, P&L reports and market resolution notifications.",
    fields: [
      { key: "TELEGRAM_BOT_TOKEN", label: "Bot Token", placeholder: "123456:ABC-DEF…", type: "password" },
      { key: "TELEGRAM_CHAT_ID", label: "Chat ID", placeholder: "-100123456789", type: "text" },
    ],
    hint: "Create a bot via @BotFather → /newbot. Get Chat ID from api.telegram.org/bot<TOKEN>/getUpdates after messaging your bot.",
  },
];

interface WizardValues { [key: string]: string }

async function saveCredential(key: string, value: string): Promise<boolean> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function CredentialWizard({ walletConfigured, apiConfigured, telegramConfigured }: {
  walletConfigured: boolean;
  apiConfigured: boolean;
  telegramConfigured: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<WizardValues>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allConfigured = walletConfigured && apiConfigured && telegramConfigured;
  const currentStep = WIZARD_STEPS[step];
  const StepIcon = currentStep.icon;

  function setVal(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
    setSaved(false);
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const results = await Promise.all(
      currentStep.fields.map(async (f) => {
        const val = values[f.key] ?? "";
        if (!val.trim()) return true;
        return saveCredential(f.key, val.trim());
      })
    );
    setSaving(false);
    if (results.every(Boolean)) {
      setSaved(true);
    } else {
      setError("Failed to save some credentials. Check your connection.");
    }
  }

  function handleNext() {
    if (step < WIZARD_STEPS.length - 1) {
      setStep(step + 1);
      setSaved(false);
      setError(null);
    } else {
      setOpen(false);
      setStep(0);
    }
  }

  const stepDone = [walletConfigured, apiConfigured, telegramConfigured];

  if (!open) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              {WIZARD_STEPS.map((s, i) => (
                <div
                  key={s.id}
                  className={cn(
                    "h-2 w-2 rounded-full",
                    stepDone[i] ? "bg-yes" : "bg-muted"
                  )}
                  title={s.label}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {stepDone.filter(Boolean).length} / {WIZARD_STEPS.length} configured
              {allConfigured && " — All credentials set!"}
            </span>
          </div>
          <Button
            size="sm"
            variant={allConfigured ? "outline" : "default"}
            className="h-7 text-xs gap-1.5"
            onClick={() => { setOpen(true); setStep(allConfigured ? 0 : stepDone.findIndex((d) => !d)); }}
          >
            {allConfigured ? "Review" : "Setup Wizard"}
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {WIZARD_STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => { setStep(i); setSaved(false); setError(null); }}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-colors",
                  i === step
                    ? "bg-primary text-primary-foreground"
                    : stepDone[i]
                    ? "bg-yes/10 text-yes"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {stepDone[i] && i !== step ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <Icon className="h-3 w-3" />
                )}
                {s.label}
              </button>
            );
          })}
        </div>
        <button onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <StepIcon className="h-3.5 w-3.5 text-primary" />
          <span className="text-sm font-semibold text-foreground">{currentStep.title}</span>
        </div>
        <p className="text-xs text-muted-foreground">{currentStep.description}</p>
      </div>

      <div className="space-y-3">
        {currentStep.fields.map((f) => (
          <div key={f.key} className="space-y-1">
            <Label className="text-xs">{f.label}</Label>
            <Input
              type={f.type}
              placeholder={f.placeholder}
              value={values[f.key] ?? ""}
              onChange={(e) => setVal(f.key, e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </div>
        ))}
      </div>

      <div className="rounded-md bg-background/60 border border-border p-2.5 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">Tip: </span>{currentStep.hint}
      </div>

      {error && <p className="text-xs text-no">{error}</p>}

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-xs">
          {saving ? "Saving…" : "Save credentials"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleNext}
          className="h-7 text-xs gap-1"
          disabled={saving}
        >
          {step < WIZARD_STEPS.length - 1 ? "Next step" : "Done"}
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        {saved && (
          <span className="text-xs text-yes flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Saved
          </span>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, description }: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="p-2 rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        {ok ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-yes" />
        ) : (
          <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className={cn("text-sm font-medium", ok ? "text-yes" : "text-muted-foreground")}>
          {value}
        </span>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted"
        )}
      >
        <div
          className={cn(
            "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </div>
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}

export default function Settings() {
  const { data: wallet, isLoading: walletLoading } = useGetWalletStatus();
  const { data: config, isLoading: configLoading } = useGetStrategyConfig();
  const { mutate: saveConfig, isPending: saving, isSuccess: saved } = useUpdateStrategyConfig();
  const { mutate: testTelegram, isPending: testing, data: telegramResult } = useTestTelegram();
  const { data: autoStatus } = useAutoTradingStatus();
  const { trigger: triggerScan, pending: scanPending, result: scanResult } = useTriggerScan();
  const { reset: resetDemo, pending: resetPending, result: resetResult, confirmOpen, setConfirmOpen } = useResetDemo();

  const [form, setForm] = useState<StrategyConfig | null>(null);

  useEffect(() => {
    if (config && !form) setForm({ ...config });
  }, [config, form]);

  function setField(field: keyof StrategyConfig, val: string | boolean) {
    setForm((prev) =>
      prev ? { ...prev, [field]: typeof val === "boolean" ? val : parseFloat(val as string) || 0 } : prev
    );
  }

  function handleSave() {
    if (form) saveConfig({ data: form });
  }

  const isLoading = walletLoading || configLoading;

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[300px] text-muted-foreground text-sm">
        Loading settings…
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-primary" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure your wallet, strategy, and notifications
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 mb-5">
        <SectionTitle
          icon={Wallet}
          title="Wallet & API Status"
          description="Connect your Polygon wallet to enable live trading"
        />
        <div>
          <StatusRow
            label="Wallet connected"
            value={wallet?.connected ? wallet.address ?? "Connected" : "Not connected"}
            ok={wallet?.connected ?? false}
          />
          <StatusRow
            label="CLOB API credentials"
            value={wallet?.hasApiCredentials ? "Configured" : "Not set"}
            ok={wallet?.hasApiCredentials ?? false}
          />
          <StatusRow
            label="Network"
            value={wallet?.network ?? "Unknown"}
            ok={true}
          />
          <StatusRow
            label="Data source"
            value={wallet?.dataSource === "live" ? "Live (Polymarket mainnet)" : "Demo data"}
            ok={wallet?.dataSource === "live"}
          />
        </div>

        <CredentialWizard
          walletConfigured={wallet?.connected ?? false}
          apiConfigured={wallet?.hasApiCredentials ?? false}
          telegramConfigured={wallet?.telegramConfigured ?? false}
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-5 mb-5">
        <SectionTitle
          icon={Send}
          title="Telegram Notifications"
          description="Get alerts for opportunities, fills, and daily P&L reports"
        />

        <div className="mb-4">
          <StatusRow
            label="Telegram configured"
            value={wallet?.telegramConfigured ? "Connected" : "Not configured"}
            ok={wallet?.telegramConfigured ?? false}
          />
        </div>

        <div className="rounded-lg bg-background/60 border border-border p-3.5 text-xs text-muted-foreground leading-relaxed mb-4">
          <p className="font-medium text-foreground mb-1">Setup instructions</p>
          <ol className="mt-1.5 space-y-0.5 list-decimal list-inside">
            <li>Open Telegram and message <span className="text-primary font-mono">@BotFather</span></li>
            <li>Send <span className="font-mono">/newbot</span> and follow the steps</li>
            <li>Copy the Bot Token</li>
            <li>Message your bot, then visit <span className="font-mono text-[10px]">api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</span> to get your Chat ID</li>
            <li>Set <span className="text-primary font-mono">TELEGRAM_BOT_TOKEN</span> and <span className="text-primary font-mono">TELEGRAM_CHAT_ID</span> as environment secrets</li>
          </ol>
        </div>

        <div className="rounded-lg bg-background/60 border border-border p-3.5 text-xs text-muted-foreground leading-relaxed mb-4">
          <p className="font-medium text-foreground mb-1.5">Bot commands</p>
          <p className="mb-2 text-[11px]">Once configured, message your bot directly in Telegram to control your portfolio:</p>
          <div className="space-y-1">
            {[
              { cmd: "/balance", desc: "Portfolio value, P&L, and USDC balance" },
              { cmd: "/positions", desc: "All open positions with P&L" },
              { cmd: "/orders", desc: "Recent order history with fill status" },
              { cmd: "/cancel <id>", desc: "Cancel an open order (with confirmation)" },
              { cmd: "/pnl", desc: "P&L history for the last 14 days" },
              { cmd: "/config", desc: "View or update strategy settings (e.g. /config bankroll 500)" },
              { cmd: "/markets <keyword>", desc: "Search Polymarket markets by keyword" },
              { cmd: "/scan", desc: "Trigger a strategy scan for opportunities" },
              { cmd: "/status", desc: "Auto-trader status and daily trade count" },
              { cmd: "/watch <marketId>", desc: "Add a market to your watchlist" },
              { cmd: "/unwatch <marketId>", desc: "Remove from watchlist" },
              { cmd: "/watchlist", desc: "View your watched markets" },
              { cmd: "/alert <id> <yes|no> <above|below> <price%>", desc: "Set a Telegram price alert" },
              { cmd: "/alerts", desc: "View all price alerts (active and triggered)" },
              { cmd: "/delalert <id>", desc: "Delete a price alert" },
              { cmd: "/creds", desc: "Show which credentials are configured" },
              { cmd: "/setcred <type> <value>", desc: "Set a credential — types: privatekey, apikey, apisecret, apipassphrase" },
              { cmd: "/resetdemo", desc: "Reset all portfolio data back to demo values" },
              { cmd: "/help", desc: "List all available commands" },
            ].map(({ cmd, desc }) => (
              <div key={cmd} className="flex items-baseline gap-2">
                <span className="text-primary font-mono shrink-0">{cmd}</span>
                <span className="text-muted-foreground">— {desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => testTelegram()}
            disabled={testing || !wallet?.telegramConfigured}
          >
            <Bot className="h-3.5 w-3.5 mr-1.5" />
            {testing ? "Sending…" : "Send test message"}
          </Button>
          {telegramResult && (
            <span className={cn("text-xs", telegramResult.success ? "text-yes" : "text-no")}>
              {telegramResult.success ? "✓ " : "✗ "}{telegramResult.message}
            </span>
          )}
        </div>
      </div>

      {form && (
        <div className="rounded-xl border border-border bg-card p-5 mb-5">
          <SectionTitle
            icon={Zap}
            title="Strategy Configuration"
            description="Parameters for the auto-scanner and auto-trading bot"
          />

          <div className="space-y-5">
            <div className="flex flex-col gap-3">
              <Toggle
                checked={form.autoTradingEnabled}
                onChange={(v) => setField("autoTradingEnabled", v)}
                label="Auto-trading enabled"
              />
              {form.autoTradingEnabled && (
                <p className="text-xs text-yellow-400 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Auto-trading requires wallet credentials to be set
                </p>
              )}
              <Toggle
                checked={form.telegramAlertsEnabled}
                onChange={(v) => setField("telegramAlertsEnabled", v)}
                label="Telegram alerts enabled"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Bankroll ($)</Label>
                <Input type="number" value={form.bankroll} onChange={(e) => setField("bankroll", e.target.value)} min={1} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Max position size (%)</Label>
                <Input type="number" value={form.maxPositionPct} onChange={(e) => setField("maxPositionPct", e.target.value)} min={1} max={25} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Min edge (%)</Label>
                <Input type="number" value={Math.round(form.minEdge * 100)} onChange={(e) => setField("minEdge", String(parseFloat(e.target.value) / 100))} min={1} max={30} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Min probability (%)</Label>
                <Input type="number" value={Math.round(form.minProbability * 100)} onChange={(e) => setField("minProbability", String(parseFloat(e.target.value) / 100))} min={70} max={97} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Max days to resolution</Label>
                <Input type="number" value={form.maxDaysToResolution} onChange={(e) => setField("maxDaysToResolution", e.target.value)} min={1} max={60} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Min 24h volume ($)</Label>
                <Input type="number" value={form.minVolume24h} onChange={(e) => setField("minVolume24h", e.target.value)} min={0} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Min liquidity ($)</Label>
                <Input type="number" value={form.minLiquidity} onChange={(e) => setField("minLiquidity", e.target.value)} min={0} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Scan interval (minutes)</Label>
                <Input type="number" value={form.scanIntervalMinutes} onChange={(e) => setField("scanIntervalMinutes", e.target.value)} min={1} max={60} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Max daily trades</Label>
                <Input type="number" value={form.maxDailyTrades} onChange={(e) => setField("maxDailyTrades", e.target.value)} min={1} max={50} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Max opportunities shown</Label>
                <Input type="number" value={form.maxOpportunities} onChange={(e) => setField("maxOpportunities", e.target.value)} min={5} max={100} />
              </div>
            </div>

            <div className="border-t border-border/50 pt-4 space-y-4">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Risk Management</div>

              <Toggle
                checked={form.trendFilterEnabled}
                onChange={(v) => setField("trendFilterEnabled", v)}
                label="Enable price trend filter (skips downtrending opportunities)"
              />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Stop-Loss threshold</Label>
                  <span className="text-xs font-mono text-no font-semibold">-{form.stopLossPct}%</span>
                </div>
                <Slider
                  min={5}
                  max={60}
                  step={5}
                  value={[form.stopLossPct]}
                  onValueChange={([v]) => setField("stopLossPct", String(v))}
                  className="w-full"
                />
                <p className="text-[11px] text-muted-foreground">Alert sent when position P&L drops below this threshold</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Take-Profit threshold</Label>
                  <span className="text-xs font-mono text-yes font-semibold">+{form.takeProfitPct}%</span>
                </div>
                <Slider
                  min={10}
                  max={200}
                  step={10}
                  value={[form.takeProfitPct]}
                  onValueChange={([v]) => setField("takeProfitPct", String(v))}
                  className="w-full"
                />
                <p className="text-[11px] text-muted-foreground">Alert sent when position P&L exceeds this threshold</p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save Configuration"}
              </Button>
              {saved && (
                <span className="text-xs text-yes flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Saved — scanner restarted
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {autoStatus && (
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center gap-3 p-4 border-b border-border">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="font-semibold text-sm">Auto-Trading Status</div>
              <div className="text-xs text-muted-foreground">Live execution engine</div>
            </div>
            <div className={cn(
              "ml-auto flex items-center gap-1.5 text-xs px-2 py-1 rounded-full",
              autoStatus.enabled && autoStatus.clobConfigured
                ? "bg-yes/10 text-yes"
                : autoStatus.enabled
                ? "bg-yellow-500/10 text-yellow-500"
                : "bg-muted text-muted-foreground"
            )}>
              <span className={cn(
                "h-1.5 w-1.5 rounded-full",
                autoStatus.enabled && autoStatus.clobConfigured
                  ? "bg-yes animate-pulse"
                  : autoStatus.enabled ? "bg-yellow-500" : "bg-muted-foreground"
              )} />
              {autoStatus.enabled && autoStatus.clobConfigured
                ? "Live"
                : autoStatus.enabled
                ? "Credentials missing"
                : "Disabled"}
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-muted/40 p-3 space-y-0.5">
                <div className="text-xs text-muted-foreground">USDC Balance</div>
                <div className="font-semibold text-sm">${autoStatus.usdcBalance.toFixed(2)}</div>
              </div>
              <div className="rounded-lg bg-muted/40 p-3 space-y-0.5">
                <div className="text-xs text-muted-foreground">Trades Today</div>
                <div className="font-semibold text-sm">
                  {autoStatus.tradesToday} / {autoStatus.maxDailyTrades}
                </div>
              </div>
              <div className="rounded-lg bg-muted/40 p-3 space-y-0.5">
                <div className="text-xs text-muted-foreground">Slots Remaining</div>
                <div className="font-semibold text-sm">{autoStatus.remainingSlots}</div>
              </div>
              <div className="rounded-lg bg-muted/40 p-3 space-y-0.5">
                <div className="text-xs text-muted-foreground">Total Lifetime</div>
                <div className="font-semibold text-sm">{autoStatus.totalTradesLifetime}</div>
              </div>
            </div>

            {!autoStatus.clobConfigured && autoStatus.enabled && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-600 dark:text-yellow-400">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium mb-0.5">CLOB credentials required</div>
                  Set <code className="font-mono">POLYMARKET_PRIVATE_KEY</code>,{" "}
                  <code className="font-mono">POLYMARKET_API_KEY</code>,{" "}
                  <code className="font-mono">POLYMARKET_API_SECRET</code>, and{" "}
                  <code className="font-mono">POLYMARKET_API_PASSPHRASE</code> environment variables to enable live order execution.
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
              <div>Last scan: {autoStatus.lastScanAt
                ? new Date(autoStatus.lastScanAt).toLocaleString()
                : "Not yet"}
              </div>
              <div>Last trade: {autoStatus.lastTradeAt
                ? new Date(autoStatus.lastTradeAt).toLocaleString()
                : "None"}
              </div>
            </div>

            {autoStatus.recentTrades.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" /> Recent Trades
                </div>
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {autoStatus.recentTrades.slice(0, 5).map((trade, i) => (
                    <div key={i} className="flex items-start gap-3 px-3 py-2 text-xs">
                      <span className={cn(
                        "shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold",
                        trade.side === "YES" ? "bg-yes/10 text-yes" : "bg-no/10 text-no"
                      )}>{trade.side}</span>
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-foreground">{trade.question}</div>
                        <div className="text-muted-foreground mt-0.5">
                          ${trade.amount.toFixed(2)} @ {(trade.price * 100).toFixed(0)}¢ · edge {(trade.edge * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {trade.success
                          ? <span className="text-yes flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Filled</span>
                          : <span className="text-no flex items-center gap-1"><AlertCircle className="h-3 w-3" />Failed</span>
                        }
                        <div className="text-muted-foreground mt-0.5">
                          {new Date(trade.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={triggerScan}
                disabled={scanPending || !autoStatus.clobConfigured}
                className="flex items-center gap-1.5"
              >
                <PlayCircle className="h-3.5 w-3.5" />
                {scanPending ? "Scanning…" : "Trigger Manual Scan"}
              </Button>
              {scanResult && (
                <span className={cn(
                  "text-xs flex items-center gap-1",
                  scanResult.success ? "text-yes" : "text-no"
                )}>
                  {scanResult.success
                    ? <CheckCircle2 className="h-3.5 w-3.5" />
                    : <AlertCircle className="h-3.5 w-3.5" />
                  }
                  {scanResult.message}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5 mt-5">
        <SectionTitle
          icon={Database}
          title="Demo Data"
          description="Reset portfolio to sample data with 22 orders, 8 positions, and 90 days of P&L history"
        />
        <p className="text-xs text-muted-foreground mb-4">
          This will erase all current orders, positions, and P&L history and replace them with pre-built demo data.
          Strategy configuration and credentials are not affected.
        </p>
        {!confirmOpen ? (
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmOpen(true)}
              disabled={resetPending}
              className="flex items-center gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Demo Data
            </Button>
            {resetResult && (
              <span className={cn(
                "text-xs flex items-center gap-1",
                resetResult.success ? "text-yes" : "text-no"
              )}>
                {resetResult.success
                  ? <CheckCircle2 className="h-3.5 w-3.5" />
                  : <AlertCircle className="h-3.5 w-3.5" />
                }
                {resetResult.success ? "Demo data restored" : resetResult.message}
              </span>
            )}
          </div>
        ) : (
          <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3.5 space-y-3">
            <p className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span><b>Are you sure?</b> All orders, positions, and P&L history will be replaced with demo data.</span>
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="destructive" onClick={resetDemo} disabled={resetPending} className="flex items-center gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />
                {resetPending ? "Resetting…" : "Yes, reset now"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmOpen(false)} disabled={resetPending}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
