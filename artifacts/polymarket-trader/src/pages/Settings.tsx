import { useState, useEffect } from "react";
import {
  useGetStrategyConfig,
  useUpdateStrategyConfig,
  useGetWalletStatus,
  useTestTelegram,
} from "@workspace/api-client-react";
import { Settings2, Send, Wallet, Bot, AlertCircle, CheckCircle2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type StrategyConfig = {
  autoTradingEnabled: boolean;
  bankroll: number;
  maxPositionPct: number;
  minEdge: number;
  minProbability: number;
  maxDaysToResolution: number;
  minVolume24h: number;
  scanIntervalMinutes: number;
  telegramAlertsEnabled: boolean;
  maxDailyTrades: number;
};

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

        <div className="mt-4 rounded-lg bg-background/60 border border-border p-3.5 text-xs text-muted-foreground leading-relaxed">
          <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-yellow-400" />
            How to connect
          </p>
          <p>Set these environment secrets to enable live trading:</p>
          <ul className="mt-1.5 space-y-0.5 font-mono text-[11px]">
            <li><span className="text-primary">POLYMARKET_PRIVATE_KEY</span> — Polygon wallet private key</li>
            <li><span className="text-primary">POLYMARKET_API_KEY</span> — Polymarket L2 API key</li>
            <li><span className="text-primary">POLYMARKET_API_SECRET</span> — API secret</li>
            <li><span className="text-primary">POLYMARKET_API_PASSPHRASE</span> — API passphrase</li>
          </ul>
          <p className="mt-2">Get L2 credentials from <span className="text-primary">polymarket.com → Account → API Keys</span></p>
        </div>
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
                <Label className="text-xs">Scan interval (minutes)</Label>
                <Input type="number" value={form.scanIntervalMinutes} onChange={(e) => setField("scanIntervalMinutes", e.target.value)} min={1} max={60} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Max daily trades</Label>
                <Input type="number" value={form.maxDailyTrades} onChange={(e) => setField("maxDailyTrades", e.target.value)} min={1} max={50} />
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
    </div>
  );
}
