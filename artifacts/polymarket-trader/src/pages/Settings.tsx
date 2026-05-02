import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useGetStrategyConfig,
  useGetWalletStatus,
  useTestTelegram,
} from "@workspace/api-client-react";
import { Settings2, Send, Wallet, Bot, AlertCircle, CheckCircle2, Zap, Activity, TrendingUp, PlayCircle, RotateCcw, Database, ChevronRight, Key, Shield, Bell, DollarSign, Info, RefreshCw, Calculator, FlaskConical, ShieldCheck, ShieldAlert, Percent, Timer, Globe, TestTube2, AlertTriangle } from "lucide-react";
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
  stopLossAutoExecute: boolean;
  takeProfitEnabled: boolean;
  takeProfitTier1Pct: number;
  takeProfitTier2Pct: number;
  takeProfitTier3Pct: number;
  trendFilterEnabled: boolean;
  autoCapital: boolean;
  autoCompound: boolean;
  categoryFilter: string;
  paperTradingMode: boolean;
  paperBankroll: number;
  paperSlippagePct: number;
  paperTakerFeePct: number;
  volatilityCheckEnabled: boolean;
  volatilityThresholdPct: number;
  cooldownAfterLossEnabled: boolean;
  maxRiskPerTradePct: number;
};

type NetworkMode = "mainnet" | "testnet";

function useNetworkMode() {
  const [mode, setModeState] = useState<NetworkMode>("mainnet");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/network/mode`)
      .then((r) => r.json())
      .then((d: { mode?: string }) => {
        if (d.mode === "mainnet" || d.mode === "testnet") setModeState(d.mode);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function setMode(newMode: NetworkMode) {
    setSaving(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/network/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: newMode }),
      });
      if (res.ok) setModeState(newMode);
    } finally {
      setSaving(false);
    }
  }

  return { mode, loading, saving, setMode };
}

function NetworkModePanel() {
  const { mode, loading, saving, setMode } = useNetworkMode();
  const [confirmMainnet, setConfirmMainnet] = useState(false);

  if (loading) return null;

  const isMainnet = mode === "mainnet";
  const isTestnet = mode === "testnet";

  async function handleSwitch(target: NetworkMode) {
    if (target === "mainnet" && !confirmMainnet) {
      setConfirmMainnet(true);
      return;
    }
    setConfirmMainnet(false);
    await setMode(target);
    window.location.reload();
  }

  return (
    <div className={cn(
      "rounded-xl border p-5 mb-5",
      isTestnet
        ? "border-blue-500/30 bg-blue-500/5"
        : "border-border bg-card"
    )}>
      <div className="flex items-start gap-3 mb-4">
        <div className={cn("p-2 rounded-lg", isTestnet ? "bg-blue-500/15" : "bg-primary/10")}>
          <Globe className={cn("h-4 w-4", isTestnet ? "text-blue-400" : "text-primary")} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Network Mode</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pilih antara Mainnet (trading nyata) atau Testnet (simulasi paper trading)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <button
          onClick={() => void handleSwitch("testnet")}
          disabled={saving || isTestnet}
          className={cn(
            "flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all",
            isTestnet
              ? "border-blue-500/50 bg-blue-500/15 ring-1 ring-blue-500/30"
              : "border-border bg-muted/40 hover:border-blue-500/30 hover:bg-blue-500/5"
          )}
        >
          <div className="flex items-center gap-2">
            <TestTube2 className={cn("h-4 w-4", isTestnet ? "text-blue-400" : "text-muted-foreground")} />
            <span className={cn("text-sm font-semibold", isTestnet ? "text-blue-400" : "text-muted-foreground")}>
              Testnet
            </span>
            {isTestnet && (
              <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                AKTIF
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Simulasi paper trading. Gunakan market data nyata tapi semua order hanya virtual — tanpa uang nyata.
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">Paper USDC</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">Data Nyata</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">0 Risiko</span>
          </div>
        </button>

        <button
          onClick={() => void handleSwitch("mainnet")}
          disabled={saving || isMainnet}
          className={cn(
            "flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all",
            isMainnet
              ? "border-yes/40 bg-yes/5 ring-1 ring-yes/20"
              : "border-border bg-muted/40 hover:border-yes/30 hover:bg-yes/5"
          )}
        >
          <div className="flex items-center gap-2">
            <Globe className={cn("h-4 w-4", isMainnet ? "text-yes" : "text-muted-foreground")} />
            <span className={cn("text-sm font-semibold", isMainnet ? "text-yes" : "text-muted-foreground")}>
              Mainnet
            </span>
            {isMainnet && (
              <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-yes/20 text-yes border border-yes/30">
                AKTIF
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Trading nyata di Polygon Mainnet. Order dikirim ke CLOB Polymarket dan menggunakan USDC asli.
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yes/10 text-yes border border-yes/20">USDC Nyata</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yes/10 text-yes border border-yes/20">Polygon Mainnet</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-no/10 text-no border border-no/20">Risiko Nyata</span>
          </div>
        </button>
      </div>

      {confirmMainnet && (
        <div className="rounded-lg border border-no/30 bg-no/5 p-4 space-y-3 mb-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-no shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-no">Peringatan: Mainnet Aktif</div>
              <p className="text-xs text-muted-foreground mt-1">
                Beralih ke Mainnet berarti semua order auto-trading akan dikirim ke Polymarket menggunakan <strong className="text-foreground">USDC asli</strong> dari wallet kamu. Pastikan kamu sudah mengkonfigurasi wallet dan API credentials dengan benar.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs"
              disabled={saving}
              onClick={() => void handleSwitch("mainnet")}
            >
              {saving ? "Switching..." : "Ya, aktifkan Mainnet"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setConfirmMainnet(false)}
            >
              Batal
            </Button>
          </div>
        </div>
      )}

      <div className={cn(
        "rounded-lg border p-3 text-[11px]",
        isTestnet
          ? "border-blue-500/20 bg-blue-500/5 text-blue-300"
          : "border-border bg-muted/30 text-muted-foreground"
      )}>
        {isTestnet ? (
          <div className="flex items-start gap-1.5">
            <TestTube2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              <strong>Mode Testnet aktif.</strong> Semua auto-trading diblokir dari CLOB nyata. Paper trading berjalan otomatis untuk simulasi strategi tanpa risiko finansial.
            </span>
          </div>
        ) : (
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-yellow-400" />
            <span>
              <strong className="text-yellow-400">Mode Mainnet aktif.</strong> Auto-trading akan mengeksekusi order nyata di Polymarket. Pastikan strategi dan risk management sudah dikonfigurasi dengan benar.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

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

function MinimumCapitalPanel({ bankroll, maxPositionPct, maxDailyTrades }: {
  bankroll: number;
  maxPositionPct: number;
  maxDailyTrades: number;
}) {
  const minPerTrade = (bankroll * maxPositionPct) / 100;
  const maxDailyExposure = minPerTrade * maxDailyTrades;
  const feePerTrade = minPerTrade * 0.01; // 1% CLOB taker fee
  const dailyFees = feePerTrade * maxDailyTrades;
  const absoluteMin = Math.max(20, bankroll);
  const recommended = Math.max(50, bankroll * 1.5);
  const comfortable = Math.max(100, bankroll * 3);

  const tiers = [
    {
      label: "Minimum Absolut",
      amount: absoluteMin,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10 border-yellow-500/20",
      dot: "bg-yellow-400",
      note: "Bisa mulai, tapi ruang gerak sempit",
    },
    {
      label: "Disarankan",
      amount: recommended,
      color: "text-yes",
      bg: "bg-yes/10 border-yes/20",
      dot: "bg-yes",
      note: "Cukup untuk ~" + Math.floor(recommended / minPerTrade) + " trade sekaligus",
    },
    {
      label: "Nyaman & Aman",
      amount: comfortable,
      color: "text-primary",
      bg: "bg-primary/10 border-primary/20",
      dot: "bg-primary",
      note: "Buffer aman, drawdown tidak panik",
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-5 mb-5">
      <SectionTitle
        icon={DollarSign}
        title="Kalkulator Modal Minimum"
        description="Estimasi modal USDC yang kamu butuhkan berdasarkan konfigurasi strategi aktif"
      />

      {/* Per-trade breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="rounded-lg bg-muted/40 p-3 space-y-0.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Per Trade</div>
          <div className="font-bold text-base text-foreground">${minPerTrade.toFixed(2)}</div>
          <div className="text-[10px] text-muted-foreground">{maxPositionPct}% dari bankroll ${bankroll}</div>
        </div>
        <div className="rounded-lg bg-muted/40 p-3 space-y-0.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Eksposur Harian</div>
          <div className="font-bold text-base text-foreground">${maxDailyExposure.toFixed(2)}</div>
          <div className="text-[10px] text-muted-foreground">{maxDailyTrades} trade/hari maks</div>
        </div>
        <div className="rounded-lg bg-muted/40 p-3 space-y-0.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Fee CLOB / Hari</div>
          <div className="font-bold text-base text-foreground">${dailyFees.toFixed(3)}</div>
          <div className="text-[10px] text-muted-foreground">1% taker fee × {maxDailyTrades} trade</div>
        </div>
        <div className="rounded-lg bg-muted/40 p-3 space-y-0.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Gas (Polygon)</div>
          <div className="font-bold text-base text-foreground">~$0.001</div>
          <div className="text-[10px] text-muted-foreground">Hampir gratis</div>
        </div>
      </div>

      {/* Tier cards */}
      <div className="space-y-2.5 mb-5">
        {tiers.map((t) => (
          <div key={t.label} className={cn("flex items-center justify-between rounded-lg border p-3.5", t.bg)}>
            <div className="flex items-center gap-2.5">
              <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", t.dot)} />
              <div>
                <div className={cn("text-sm font-semibold", t.color)}>{t.label}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{t.note}</div>
              </div>
            </div>
            <div className={cn("text-xl font-bold font-mono", t.color)}>
              ${t.amount.toFixed(0)} <span className="text-xs font-normal">USDC</span>
            </div>
          </div>
        ))}
      </div>

      {/* Info notes */}
      <div className="rounded-lg bg-background/60 border border-border p-3.5 space-y-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
          <Info className="h-3.5 w-3.5 text-primary" />
          Catatan penting
        </div>
        <ul className="space-y-1.5 list-disc list-inside leading-relaxed">
          <li>Polymarket minimum order adalah <span className="text-foreground font-medium">$1 USDC</span> per trade</li>
          <li>CLOB taker fee <span className="text-foreground font-medium">1%</span> dikenakan setiap order tereksekusi</li>
          <li>Gas fee di Polygon sangat murah, <span className="text-foreground font-medium">{"<$0.01"}</span> per transaksi</li>
          <li>Angka di atas dihitung dari: <span className="text-primary font-mono">Bankroll ${bankroll} × Max Position {maxPositionPct}%</span></li>
          <li>Ubah <span className="text-primary">Bankroll</span> dan <span className="text-primary">Max Position Size</span> di bawah untuk lihat perubahan real-time</li>
          <li>Sisakan <span className="text-foreground font-medium">10–20% USDC</span> sebagai cadangan, jangan invest 100%</li>
        </ul>
      </div>
    </div>
  );
}

function AutoCapitalPreview({
  balance,
  config,
}: {
  balance: number;
  config: StrategyConfig;
}) {
  const MIN_ORDER = 1;
  const minPctForMinOrder = balance > 0 ? (MIN_ORDER / balance) * 100 : 100;
  const effectiveMaxPosPct = Math.min(25, Math.max(config.maxPositionPct, Math.ceil(minPctForMinOrder)));
  const perTrade = (balance * effectiveMaxPosPct) / 100;
  const canTrade = perTrade >= MIN_ORDER;

  let mode: string, modeColor: string, modeBg: string;
  if (balance < 20) {
    mode = "🔴 Micro — Terlalu Kecil"; modeColor = "text-no"; modeBg = "bg-no/10 border-no/20";
  } else if (balance < 50) {
    mode = "🟡 Small Capital"; modeColor = "text-yellow-400"; modeBg = "bg-yellow-500/10 border-yellow-500/20";
  } else if (balance < 200) {
    mode = "🟢 Normal"; modeColor = "text-yes"; modeBg = "bg-yes/10 border-yes/20";
  } else {
    mode = "🟢 Comfortable"; modeColor = "text-yes"; modeBg = "bg-yes/10 border-yes/20";
  }

  const minLiq = balance < 50 ? 10_000 : config.minLiquidity;
  const minEdge = balance < 20 ? 5 : balance < 50 ? 4 : Math.round(config.minEdge * 100);
  const tradeCapacity = perTrade > 0 ? Math.floor(balance / perTrade) : 0;

  const warnings: string[] = [];
  if (!canTrade) warnings.push(`Per trade $${perTrade.toFixed(2)} < min $1 Polymarket — tidak bisa trade`);
  if (balance < 50 && canTrade) warnings.push("Filter: hanya market likuiditas >$10,000");
  if (balance < 50) warnings.push(`Min edge otomatis naik ke ${minEdge}% untuk modal kecil`);
  if (balance < 20 && canTrade) {
    const lossesToStop = Math.max(0, Math.floor((balance - 20) / perTrade));
    warnings.push(`Hanya ${lossesToStop} loss berturut → bot berhenti`);
  }

  return (
    <div className={cn("rounded-lg border p-3.5 space-y-3", modeBg)}>
      <div className="flex items-center justify-between">
        <span className={cn("text-xs font-semibold", modeColor)}>{mode}</span>
        <span className="text-[10px] text-muted-foreground">Saldo: ${balance.toFixed(2)} USDC</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md bg-background/60 p-2 text-center">
          <div className="text-[10px] text-muted-foreground">Per Trade</div>
          <div className={cn("font-bold text-sm", !canTrade ? "text-no" : "text-foreground")}>${perTrade.toFixed(2)}</div>
          <div className="text-[10px] text-muted-foreground">@{effectiveMaxPosPct}%</div>
        </div>
        <div className="rounded-md bg-background/60 p-2 text-center">
          <div className="text-[10px] text-muted-foreground">Kapasitas</div>
          <div className="font-bold text-sm text-foreground">{tradeCapacity} trade</div>
          <div className="text-[10px] text-muted-foreground">dari saldo</div>
        </div>
        <div className="rounded-md bg-background/60 p-2 text-center">
          <div className="text-[10px] text-muted-foreground">Min Edge</div>
          <div className="font-bold text-sm text-foreground">{minEdge}%</div>
          <div className="text-[10px] text-muted-foreground">auto-adjusted</div>
        </div>
      </div>

      <div className="rounded-md bg-background/50 border border-border/50 p-2.5 space-y-1.5">
        <div className="text-[10px] font-semibold text-foreground">Penyesuaian aktif:</div>
        <div className="text-[10px] text-muted-foreground space-y-0.5">
          <div>• Max position: <span className="text-foreground font-medium">{effectiveMaxPosPct}%</span> {effectiveMaxPosPct !== config.maxPositionPct && `(dari config ${config.maxPositionPct}% → auto-naik)`}</div>
          <div>• Min likuiditas: <span className="text-foreground font-medium">${minLiq.toLocaleString()}</span></div>
          <div>• Min edge: <span className="text-foreground font-medium">{minEdge}%</span></div>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className={cn("text-[10px] flex items-start gap-1", !canTrade && i === 0 ? "text-no font-semibold" : "text-yellow-400")}>
              <span className="shrink-0">{!canTrade && i === 0 ? "❌" : "⚠"}</span>
              {w}
            </div>
          ))}
        </div>
      )}
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

// ─── Mainnet Preflight Panel ─────────────────────────────────────────────────
interface PreflightCheck { id: string; label: string; status: "pass" | "fail" | "warn"; detail: string }
interface PreflightResult {
  readiness: "ready" | "ready_with_warnings" | "not_ready";
  passCount: number; failCount: number; warnCount: number; totalChecks: number;
  usdcBalance: number; checks: PreflightCheck[]; summary: string;
}

function MainnetPreflightPanel() {
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function runChecks() {
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/mainnet/preflight`);
      setResult(await res.json() as PreflightResult);
    } finally {
      setLoading(false);
    }
  }

  const statusIcon = (s: "pass" | "fail" | "warn") =>
    s === "pass" ? <CheckCircle2 className="h-4 w-4 text-yes shrink-0" />
    : s === "fail" ? <AlertCircle className="h-4 w-4 text-no shrink-0" />
    : <AlertCircle className="h-4 w-4 text-yellow-400 shrink-0" />;

  const readinessCfg = result ? {
    ready: { cls: "border-yes/30 bg-yes/5", text: "text-yes" },
    ready_with_warnings: { cls: "border-yellow-500/30 bg-yellow-500/5", text: "text-yellow-400" },
    not_ready: { cls: "border-no/30 bg-no/5", text: "text-no" },
  }[result.readiness] : null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 mt-5">
      <SectionTitle
        icon={ShieldCheck}
        title="Mainnet Preflight Checklist"
        description="Validasi semua syarat sebelum mulai live trading di Polymarket"
      />
      {!result ? (
        <div className="text-center py-6">
          <ShieldCheck className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-4">Jalankan pengecekan untuk memastikan bot siap mainnet</p>
          <Button onClick={() => void runChecks()} disabled={loading}>
            {loading ? "Mengecek..." : "🚀 Jalankan Preflight Check"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className={cn("rounded-lg border p-4", readinessCfg?.cls)}>
            <div className="flex items-center justify-between mb-2">
              <span className={cn("text-sm font-bold", readinessCfg?.text)}>{result.summary}</span>
              <Button size="sm" variant="outline" onClick={() => void runChecks()} disabled={loading} className="h-7 text-xs">
                <RefreshCw className={cn("h-3 w-3 mr-1", loading && "animate-spin")} />
                Ulangi
              </Button>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="text-yes">✅ {result.passCount} lulus</span>
              {result.warnCount > 0 && <span className="text-yellow-400">⚠️ {result.warnCount} peringatan</span>}
              {result.failCount > 0 && <span className="text-no">❌ {result.failCount} gagal</span>}
            </div>
          </div>

          <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {result.checks.map((check) => (
              <div key={check.id} className="flex items-start gap-3 p-3">
                {statusIcon(check.status)}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">{check.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{check.detail}</div>
                </div>
              </div>
            ))}
          </div>

          {result.readiness === "ready" && (
            <div className="rounded-lg border border-yes/30 bg-yes/5 p-3 text-xs text-yes font-medium">
              🎉 Bot 100% siap untuk mainnet Polymarket! Aktifkan auto-trading dan monitor dari Telegram.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Kelly Calculator Panel ──────────────────────────────────────────────────
function KellyCalculatorPanel() {
  const [prob, setProb] = useState(75);
  const [odds, setOdds] = useState(90);
  const [bankroll, setBankroll] = useState(500);
  const [fraction, setFraction] = useState(0.25);

  const p = prob / 100;
  const decimalOdds = odds / (100 - odds);
  const q = 1 - p;
  const fullKelly = Math.max(0, (p * decimalOdds - q) / decimalOdds);
  const fractionalKelly = fullKelly * fraction;
  const recommendedBet = fractionalKelly * bankroll;
  const expectedReturn = fullKelly * decimalOdds * p - fullKelly * q;

  return (
    <div className="rounded-xl border border-border bg-card p-5 mt-5">
      <SectionTitle
        icon={Calculator}
        title="Kelly Calculator"
        description="Hitung ukuran posisi optimal berdasarkan formula Kelly Criterion"
      />
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="space-y-1.5">
          <Label className="text-xs">Probabilitas menang (%)</Label>
          <Input type="number" value={prob} onChange={(e) => setProb(Number(e.target.value))} min={51} max={99} />
          <div className="text-[10px] text-muted-foreground">Contoh: YES price 75¢ → 75%</div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Harga beli di CLOB (¢)</Label>
          <Input type="number" value={odds} onChange={(e) => setOdds(Number(e.target.value))} min={51} max={99} />
          <div className="text-[10px] text-muted-foreground">Harga saat kamu beli YES/NO (dalam sen)</div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Bankroll ($)</Label>
          <Input type="number" value={bankroll} onChange={(e) => setBankroll(Number(e.target.value))} min={10} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Fraksi Kelly: {Math.round(fraction * 100)}%</Label>
          <Slider min={10} max={100} step={5} value={[Math.round(fraction * 100)]} onValueChange={([v]) => setFraction(v / 100)} />
          <div className="text-[10px] text-muted-foreground">25-50% Kelly = konservatif, 100% = agresif</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-center">
          <div className="text-[10px] text-muted-foreground mb-1">Full Kelly</div>
          <div className="text-lg font-bold text-primary">{(fullKelly * 100).toFixed(1)}%</div>
          <div className="text-[10px] text-muted-foreground">dari bankroll</div>
        </div>
        <div className="rounded-lg bg-yes/5 border border-yes/20 p-3 text-center">
          <div className="text-[10px] text-muted-foreground mb-1">Bet Optimal ({Math.round(fraction * 100)}% Kelly)</div>
          <div className="text-lg font-bold text-yes">${recommendedBet.toFixed(2)}</div>
          <div className="text-[10px] text-muted-foreground">{(fractionalKelly * 100).toFixed(1)}% dari ${bankroll}</div>
        </div>
        <div className="rounded-lg bg-background/50 border border-border p-3 text-center">
          <div className="text-[10px] text-muted-foreground mb-1">Expected Return</div>
          <div className={cn("text-lg font-bold", expectedReturn > 0 ? "text-yes" : "text-no")}>
            {(expectedReturn * 100).toFixed(1)}%
          </div>
          <div className="text-[10px] text-muted-foreground">per unit bankroll</div>
        </div>
      </div>
      {fullKelly <= 0 && (
        <div className="mt-3 rounded-md bg-no/10 border border-no/20 p-3 text-xs text-no">
          ⚠️ Kelly negatif — probabilitas tidak cukup tinggi untuk edge di harga ini. Jangan trade.
        </div>
      )}
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
  const { mutate: testTelegram, isPending: testing, data: telegramResult } = useTestTelegram();
  const { data: autoStatus } = useAutoTradingStatus();
  const { trigger: triggerScan, pending: scanPending, result: scanResult } = useTriggerScan();
  const { reset: resetDemo, pending: resetPending, result: resetResult, confirmOpen, setConfirmOpen } = useResetDemo();

  const [form, setForm] = useState<StrategyConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config && !form) {
      const cfg = config as unknown as StrategyConfig;
      setForm({
        ...config,
        autoCompound: cfg.autoCompound ?? false,
        categoryFilter: cfg.categoryFilter ?? "",
        paperTradingMode: cfg.paperTradingMode ?? false,
        paperBankroll: cfg.paperBankroll ?? 1000,
        paperSlippagePct: cfg.paperSlippagePct ?? 0.3,
        paperTakerFeePct: cfg.paperTakerFeePct ?? 1.0,
        volatilityCheckEnabled: cfg.volatilityCheckEnabled ?? false,
        volatilityThresholdPct: cfg.volatilityThresholdPct ?? 5,
        cooldownAfterLossEnabled: cfg.cooldownAfterLossEnabled ?? true,
        maxRiskPerTradePct: cfg.maxRiskPerTradePct ?? 3,
      });
    }
  }, [config, form]);

  function setField(field: keyof StrategyConfig, val: string | boolean) {
    setForm((prev) => {
      if (!prev) return prev;
      if (typeof val === "boolean") return { ...prev, [field]: val };
      const numVal = parseFloat(val as string);
      if (field === "categoryFilter") return { ...prev, [field]: val as string };
      return { ...prev, [field]: isNaN(numVal) ? 0 : numVal };
    });
  }

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/strategy/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) setSaved(true);
    } finally {
      setSaving(false);
    }
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

      <NetworkModePanel />

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

      <MinimumCapitalPanel
        bankroll={form?.bankroll ?? 100}
        maxPositionPct={form?.maxPositionPct ?? 5}
        maxDailyTrades={form?.maxDailyTrades ?? 5}
      />

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

            {/* ── Auto Capital Mode ── */}
            <div className="rounded-lg border border-border bg-background/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    Auto Capital Mode
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Bot otomatis sesuaikan ukuran posisi berdasarkan saldo USDC nyata
                  </div>
                </div>
                <Toggle
                  checked={form.autoCapital ?? false}
                  onChange={(v) => setField("autoCapital", v)}
                  label=""
                />
              </div>

              {form.autoCapital && autoStatus && (
                <AutoCapitalPreview
                  balance={autoStatus.usdcBalance}
                  config={form}
                />
              )}

              {form.autoCapital && !autoStatus && (
                <div className="text-xs text-muted-foreground bg-background/60 rounded-lg p-3">
                  Menunggu data saldo... Pastikan wallet terhubung untuk melihat preview.
                </div>
              )}

              {!form.autoCapital && (
                <div className="text-xs text-muted-foreground space-y-1 pt-1 border-t border-border/40">
                  <p>Saat <strong className="text-foreground">nonaktif</strong>: bot pakai Bankroll statis dari config di bawah.</p>
                  <p>Saat <strong className="text-foreground">aktif</strong>: bot baca saldo USDC real-time, hitung ukuran posisi otomatis, dan terapkan filter likuiditas jika modal kecil.</p>
                </div>
              )}
            </div>

            {/* ── Auto-Compound ── */}
            <div className="rounded-lg border border-border bg-background/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-primary" />
                    Auto-Compound Profit
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Reinvest keuntungan ke bankroll otomatis setiap hari (max 1x/24 jam)
                  </div>
                </div>
                <Toggle
                  checked={form.autoCompound ?? false}
                  onChange={(v) => setField("autoCompound", v)}
                  label=""
                />
              </div>
              {form.autoCompound && (
                <div className="flex items-center gap-2 rounded-md bg-yes/10 border border-yes/20 px-3 py-2">
                  <span className="text-[11px] text-yes font-medium">
                    ✅ Aktif — bot akan reinvest profit ke bankroll setiap hari dan kirim notifikasi Telegram
                  </span>
                </div>
              )}
              {!form.autoCompound && (
                <div className="text-[11px] text-muted-foreground">
                  Saat aktif: setiap scan harian, bot menghitung total P&L dari posisi closed, lalu menambahkan profit ke bankroll. Butuh Telegram untuk notifikasi.
                </div>
              )}
            </div>

            {/* ── Category Filter ── */}
            <div className="rounded-lg border border-border bg-background/50 p-4 space-y-3">
              <div>
                <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  Category Filter
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Batasi scanner hanya ke kategori market tertentu (kosongkan = semua kategori)
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Kategori (pisah dengan koma)</Label>
                <Input
                  type="text"
                  placeholder="Contoh: Politics, Sports, Crypto"
                  value={form.categoryFilter ?? ""}
                  onChange={(e) => setField("categoryFilter", e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="text-[10px] text-muted-foreground">
                Kategori umum Polymarket: <span className="text-foreground">Politics, Sports, Crypto, Finance, Science, Pop Culture</span>
              </div>
              {form.categoryFilter && (
                <div className="flex flex-wrap gap-1.5">
                  {form.categoryFilter.split(",").map((c) => c.trim()).filter(Boolean).map((cat) => (
                    <span key={cat} className="text-[10px] bg-primary/10 text-primary border border-primary/20 rounded px-2 py-0.5">
                      {cat}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* ── Paper Trading Mode ── */}
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-yellow-400" />
                    Paper Trading Mode
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Simulasi trading tanpa uang nyata — aman untuk test strategi
                  </div>
                </div>
                <Toggle
                  checked={form.paperTradingMode ?? false}
                  onChange={(v) => setField("paperTradingMode", v)}
                  label=""
                />
              </div>
              {form.paperTradingMode && (
                <>
                  <div className="flex items-center gap-2 rounded-md bg-yellow-500/20 border border-yellow-500/30 px-3 py-2">
                    <span className="text-[11px] text-yellow-400 font-medium">
                      🧪 Paper Mode aktif — semua trade dieksekusi di simulasi, tidak ada uang nyata yang dipakai
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Paper Bankroll ($)</Label>
                    <Input
                      type="number"
                      value={form.paperBankroll ?? 1000}
                      onChange={(e) => setField("paperBankroll", e.target.value)}
                      min={100}
                      max={100000}
                    />
                    <div className="text-[10px] text-muted-foreground">Modal simulasi awal untuk paper trading. Hasil dilihat di halaman Analytics.</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1">
                        <Percent className="h-3 w-3" />
                        Slippage (%)
                      </Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={form.paperSlippagePct ?? 0.3}
                        onChange={(e) => setField("paperSlippagePct", e.target.value)}
                        min={0}
                        max={5}
                      />
                      <div className="text-[10px] text-muted-foreground">Buy at ask+slip, sell at bid-slip</div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        Taker Fee (%)
                      </Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={form.paperTakerFeePct ?? 1.0}
                        onChange={(e) => setField("paperTakerFeePct", e.target.value)}
                        min={0}
                        max={3}
                      />
                      <div className="text-[10px] text-muted-foreground">Deducted from proceeds on exit</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                      onClick={async () => {
                        await fetch(`${import.meta.env.BASE_URL}api/paper-trading/reset`, { method: "POST" });
                      }}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Reset Paper Portfolio
                    </Button>
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Bankroll ($)
                  {form.autoCapital && <span className="ml-1 text-[10px] text-muted-foreground">(diabaikan saat Auto Capital aktif)</span>}
                </Label>
                <Input
                  type="number"
                  value={form.bankroll}
                  onChange={(e) => setField("bankroll", e.target.value)}
                  min={1}
                  className={form.autoCapital ? "opacity-50" : ""}
                />
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

            <div className="border-t border-border/50 pt-4 space-y-5">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Risk Management</div>

              <Toggle
                checked={form.trendFilterEnabled}
                onChange={(v) => setField("trendFilterEnabled", v)}
                label="Enable price trend filter (skips downtrending opportunities)"
              />

              {/* ── Stop-Loss ── */}
              <div className="rounded-lg border border-border bg-background/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Stop-Loss Otomatis</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">Posisi ditutup langsung saat rugi mencapai batas</div>
                  </div>
                  <span className="text-sm font-mono text-no font-bold">-{form.stopLossPct}%</span>
                </div>
                <Slider
                  min={10}
                  max={20}
                  step={1}
                  value={[form.stopLossPct]}
                  onValueChange={([v]) => setField("stopLossPct", String(v))}
                  className="w-full"
                />
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Min -10%</span>
                  <span>Max -20%</span>
                </div>
                <Toggle
                  checked={form.stopLossAutoExecute}
                  onChange={(v) => setField("stopLossAutoExecute", v)}
                  label="Auto-execute (tutup posisi otomatis — bukan hanya notifikasi)"
                />
                {form.stopLossAutoExecute && (
                  <div className="flex items-center gap-2 rounded-md bg-no/10 border border-no/20 px-3 py-2">
                    <span className="text-[11px] text-no font-medium">
                      ⚡ Aktif — posisi akan dijual otomatis jika rugi ≥ {form.stopLossPct}%
                    </span>
                  </div>
                )}
              </div>

              {/* ── Take-Profit Bertahap ── */}
              <div className="rounded-lg border border-border bg-background/50 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Take-Profit Bertahap</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">Ambil profit secara bertahap di 3 level</div>
                  </div>
                  <Toggle
                    checked={form.takeProfitEnabled}
                    onChange={(v) => setField("takeProfitEnabled", v)}
                    label=""
                  />
                </div>

                {form.takeProfitEnabled && (
                  <div className="space-y-4">
                    {/* Tier 1 */}
                    <div className="space-y-2 rounded-md border border-yes/20 bg-yes/5 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-semibold text-yes">Tier 1 — Ambil Modal Balik</span>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Jual cukup shares untuk balik modal awal. Sisa shares jalan gratis!
                          </p>
                        </div>
                        <span className="text-xs font-mono text-yes font-bold">+{form.takeProfitTier1Pct}%</span>
                      </div>
                      <Slider
                        min={20}
                        max={50}
                        step={5}
                        value={[form.takeProfitTier1Pct]}
                        onValueChange={([v]) => setField("takeProfitTier1Pct", String(v))}
                        className="w-full"
                      />
                      <div className="text-[10px] text-muted-foreground">
                        Contoh: trade $5 di harga 80¢ → saat profit {form.takeProfitTier1Pct}%, jual ${(5).toFixed(0)} → sisa shares jalan tanpa risiko
                      </div>
                    </div>

                    {/* Tier 2 */}
                    <div className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-semibold text-primary">Tier 2 — Ambil 50% Sisa</span>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Jual 50% dari sisa shares yang masih jalan
                          </p>
                        </div>
                        <span className="text-xs font-mono text-primary font-bold">+{form.takeProfitTier2Pct}%</span>
                      </div>
                      <Slider
                        min={40}
                        max={90}
                        step={5}
                        value={[form.takeProfitTier2Pct]}
                        onValueChange={([v]) => setField("takeProfitTier2Pct", String(v))}
                        className="w-full"
                      />
                    </div>

                    {/* Tier 3 */}
                    <div className="space-y-2 rounded-md border border-border p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-semibold text-foreground">Tier 3 — Tutup Penuh</span>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Tutup seluruh posisi yang tersisa
                          </p>
                        </div>
                        <span className="text-xs font-mono font-bold">+{form.takeProfitTier3Pct}%</span>
                      </div>
                      <Slider
                        min={80}
                        max={200}
                        step={10}
                        value={[form.takeProfitTier3Pct]}
                        onValueChange={([v]) => setField("takeProfitTier3Pct", String(v))}
                        className="w-full"
                      />
                    </div>

                    <div className="flex items-center gap-2 rounded-md bg-yes/10 border border-yes/20 px-3 py-2">
                      <span className="text-[11px] text-yes font-medium">
                        ✅ Tier 1 (+{form.takeProfitTier1Pct}%) → balik modal · Tier 2 (+{form.takeProfitTier2Pct}%) → jual 50% sisa · Tier 3 (+{form.takeProfitTier3Pct}%) → tutup penuh
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Risk Management ── */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert className="h-4 w-4 text-primary" />
                <div className="text-sm font-semibold text-foreground">Risk Management</div>
              </div>

              {/* Max risk per trade */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1">
                    <Percent className="h-3 w-3" />
                    Max Risk Per Trade (% of balance)
                  </Label>
                  <span className="text-xs font-mono text-primary">{form.maxRiskPerTradePct ?? 3}%</span>
                </div>
                <Slider
                  min={1}
                  max={10}
                  step={0.5}
                  value={[form.maxRiskPerTradePct ?? 3]}
                  onValueChange={([v]) => setField("maxRiskPerTradePct", String(v))}
                  className="w-full"
                />
                <div className="text-[10px] text-muted-foreground">Hard cap on position size regardless of Kelly sizing. Recommended: 2–5%.</div>
              </div>

              {/* Volatility check */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs flex items-center gap-1">
                      <Activity className="h-3 w-3" />
                      Volatility Check
                    </Label>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Skip entry if price moved more than threshold in last scan</div>
                  </div>
                  <Toggle
                    checked={form.volatilityCheckEnabled ?? false}
                    onChange={(v) => setField("volatilityCheckEnabled", v)}
                    label=""
                  />
                </div>
                {form.volatilityCheckEnabled && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Threshold (%)</Label>
                      <span className="text-xs font-mono text-primary">{form.volatilityThresholdPct ?? 5}%</span>
                    </div>
                    <Slider
                      min={1}
                      max={20}
                      step={0.5}
                      value={[form.volatilityThresholdPct ?? 5]}
                      onValueChange={([v]) => setField("volatilityThresholdPct", String(v))}
                      className="w-full"
                    />
                  </div>
                )}
              </div>

              {/* Cooldown after loss */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    Cooldown After Consecutive Losses
                  </Label>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    3 losses → 30min pause · 5% daily loss → pause until next day
                  </div>
                </div>
                <Toggle
                  checked={form.cooldownAfterLossEnabled ?? true}
                  onChange={(v) => setField("cooldownAfterLossEnabled", v)}
                  label=""
                />
              </div>

              <div className="flex items-center gap-2 rounded-md bg-primary/10 border border-primary/20 px-3 py-2">
                <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-[11px] text-primary font-medium">
                  Max {form.maxRiskPerTradePct ?? 3}% per trade
                  {form.volatilityCheckEnabled ? ` · Skip if >${form.volatilityThresholdPct ?? 5}% vol` : ""}
                  {form.cooldownAfterLossEnabled ? " · Loss cooldown active" : ""}
                </span>
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

      <MainnetPreflightPanel />
      <KellyCalculatorPanel />

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
