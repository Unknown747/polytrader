# PolyTrader — Dokumentasi Lengkap

## Gambaran Proyek

PolyTrader adalah **full-stack trading dashboard** untuk Polymarket (prediction market berbasis Polygon blockchain). Sistem ini memungkinkan pengguna untuk memantau pasar, mengelola portofolio, menjalankan strategi trading otomatis, dan menganalisis performa — semuanya dari satu antarmuka.

---

## Arsitektur

```
pnpm monorepo (workspace root)
├── artifacts/
│   ├── api-server/          ← Express + TypeScript backend (port 8080)
│   ├── polymarket-trader/   ← React + Vite frontend (port 5000)
│   ├── api-zod/             ← Tipe Zod dari OpenAPI spec (jangan diedit)
│   └── api-client-react/    ← React hooks (jangan diedit)
├── replit.md                ← Dokumentasi ini
└── package.json
```

### API Server (`artifacts/api-server`)
- **Framework**: Express.js + TypeScript  
- **Build**: esbuild (output ke `dist/index.mjs`)  
- **Database**: SQLite via `better-sqlite3` (file `polytrader.db`)  
- **Port**: 8080

### Frontend (`artifacts/polymarket-trader`)
- **Framework**: React 18 + Vite  
- **Styling**: Tailwind CSS + shadcn/ui  
- **State**: TanStack Query v5  
- **Routing**: Wouter  
- **Port**: 5000

---

## Cara Jalankan

### Development
```bash
# Terminal 1 — API Server
cd artifacts/api-server && pnpm run dev

# Terminal 2 — Frontend  
pnpm --filter @workspace/polymarket-trader run dev
```

### Production Build (API)
```bash
cd artifacts/api-server && pnpm run build && PORT=8080 node --enable-source-maps ./dist/index.mjs
```

### Workflows Replit
- **"API Server"** → build + jalankan backend (port 8080)
- **"Frontend"** → jalankan Vite dev server (port 5000)

---

## Environment Variables (Secrets)

Set melalui Replit Secrets atau environment:

| Variabel | Keterangan | Wajib? |
|---|---|---|
| `POLYMARKET_PRIVATE_KEY` | Private key wallet Polygon (0x...) | Untuk live trading |
| `POLYMARKET_API_KEY` | API key CLOB Polymarket | Untuk live trading |
| `POLYMARKET_API_SECRET` | API secret CLOB | Untuk live trading |
| `POLYMARKET_API_PASSPHRASE` | API passphrase CLOB | Untuk live trading |
| `TELEGRAM_BOT_TOKEN` | Token bot Telegram (@BotFather) | Opsional |
| `TELEGRAM_CHAT_ID` | Chat ID Telegram | Opsional |

---

## Database Schema

File: `artifacts/api-server/polytrader.db` (SQLite)

### Tabel Utama

```sql
-- Riwayat P&L harian
CREATE TABLE pnl_history (id, date, pnl, cumulative_pnl, trade_count);

-- Order/trade
CREATE TABLE portfolio_orders (
  id, market_id, question, side, price, amount, shares,
  status, filled_at, edge, composite_score, category, created_at
);

-- Posisi terbuka
CREATE TABLE open_positions (
  id, market_id, question, side, entry_price, current_price,
  amount, shares, unrealized_pnl, category, created_at
);

-- Konfigurasi strategi
CREATE TABLE strategy_config (key TEXT PRIMARY KEY, value TEXT);

-- Paper trading
CREATE TABLE paper_trades (
  id, timestamp, market_id, question, category, side,
  entry_price, amount, shares, edge, composite_score,
  status, exit_price, pnl, pnl_pct, closed_at
);
CREATE TABLE paper_portfolio (id, balance, initial_balance, last_updated);

-- Alert saldo rendah
CREATE TABLE low_balance_alerts (id, timestamp, balance, threshold, notified);

-- Fitur lainnya
CREATE TABLE market_watchlist (market_id, added_at);
CREATE TABLE price_alerts (market_id, side, condition, price_pct, triggered, created_at);
CREATE TABLE credentials (key TEXT PRIMARY KEY, value TEXT);
```

---

## Fitur Lengkap

### 1. Dashboard
Halaman utama dengan ringkasan portofolio:
- Total value, P&L hari ini, open positions, order count
- Chart P&L 30/60/90 hari
- Peringatan stop-loss aktif
- Quick stats (win rate, avg return, dll)

### 2. Markets
Daftar market Polymarket aktif dengan:
- Filter (search, kategori, volume, likuiditas)  
- Price bar YES/NO  
- Watchlist (tandai market favorit)
- Price alerts (notifikasi saat harga melewati threshold)

### 3. Strategy Scanner
Halaman utama untuk analisis peluang trading:
- Scan otomatis market menggunakan composite scoring (edge, volume, likuiditas, trend)
- Filter: min edge, min probability, max days to resolution
- **Kelly Calculator widget** — hitung ukuran posisi optimal (new)
- One-click manual execution
- Trend indicator (uptrend/downtrend/stable)

### 4. Auto-Trading Bot
Eksekusi order otomatis via Polymarket CLOB API:
- Scan interval yang bisa dikonfigurasi
- Batas max daily trades
- Auto-capital mode (posisi otomatis berdasarkan saldo nyata)
- Auto-compound (reinvest profit ke bankroll)
- Category filter (hanya trade kategori tertentu)
- **Emergency Stop** (`/emergencystop` Telegram command) — cancel semua order + flag stop
- **Volatility check** — skip entry jika harga bergerak >threshold% antar scan
- **Cooldown after loss** — 3 consecutive losses → 30min pause; 5% daily loss → stop until next day
- **Max risk per trade** — hard cap % dari balance terlepas dari Kelly sizing
- **Minimum liquidity check** — skip jika vol24h < $500 atau market depth < $1000
- **Rate limit handler** — queue 18 req/s ke Polymarket CLOB API
- **Order recovery** — on startup, fetch + reconcile stale open orders (cancel if >24h old)
- **Heartbeat monitor** — alert via Telegram jika scan tidak berjalan selama 2× interval

### 5. Paper Trading Mode (NEW)
Simulasi trading tanpa uang nyata:
- Paper bankroll terpisah ($1000 default)
- **Slippage simulation** — buy at ask+slippage%, sell at bid-slippage%
- **Fee simulation** — taker fee deducted from proceeds on resolution
- Resolve otomatis saat market mendekati deadline
- Reset kapan saja via Settings

### 6. Performance Analytics (NEW)
Analisis performa trading mendalam:
- Win rate, total P&L, avg return (live & paper)
- Win rate per kategori market
- Best & worst trades
- Trade history lengkap dengan filter

### 7. Resolution Tracker (NEW)
Market yang akan resolve dalam 7 hari:
- Kritis: <24 jam
- Segera: 1-3 hari  
- Normal: 3-7 hari
- Tampilkan posisi open jika ada di market tersebut
- Auto-refresh 60 detik

### 8. Backtest
Uji strategi dengan data historis:
- Single backtest dengan konfigurasi custom
- Multi-timeframe comparison (7/30/90 hari)
- Metrics: win rate, total return, max drawdown, Sharpe ratio

### 9. Correlation Matrix
Analisis korelasi antar market:
- Grid korelasi harga YES antar market
- Color-coded (merah=negatif, hijau=positif)

### 10. Portfolio
Manajemen portofolio:
- P&L chart interaktif (line/bar, 30/60/90 hari)
- Tabel order history dengan filter
- Export CSV
- **Equity Curve chart** — total portfolio value over time (recorded each scan cycle)
- **Drawdown chart** — peak-to-trough drawdown % with ATH, max drawdown, recovery days stats

### 11. Positions
Posisi terbuka dengan:
- Unrealized P&L real-time
- Stop-loss alert
- Manual close (market/limit order)

### 12. Telegram Bot
Kontrol bot melalui Telegram:
```
/balance      → Saldo & P&L
/positions    → Posisi terbuka  
/orders       → History order
/scan         → Trigger manual scan
/status       → Status auto-trader
/config       → Lihat/ubah konfigurasi
/markets      → Cari market
/watch        → Tambah watchlist
/alert        → Set price alert
/creds        → Cek credentials
/resetdemo    → Reset demo data
/help         → Semua perintah
```

### 13. Mainnet Preflight Checklist (NEW)
Validasi 10 syarat sebelum live trading:
1. CLOB credentials lengkap
2. Saldo USDC cukup (min $50 recommended)
3. Auto-trading enabled
4. Auto-capital mode aktif
5. Stop-loss protection aktif
6. Min edge dalam rentang aman (2-15%)
7. Max position size konservatif (≤10%)
8. Daily trade limit aman (≤10/hari)
9. Telegram alerts aktif
10. Paper trading dinonaktifkan

### 14. Kelly Calculator (NEW)
Widget interaktif untuk kalkulasi sizing:
- Input: probabilitas menang, harga CLOB, bankroll, fraksi Kelly
- Output: full Kelly %, bet optimal ($), expected return
- Warning otomatis jika Kelly negatif (no edge)

### 15. Auto-Compound (NEW)
Reinvest profit otomatis:
- Cek 1x per 24 jam
- Tambahkan realized P&L ke bankroll config
- Notifikasi Telegram saat compound terjadi

### 16. Balance Low Alert (NEW)
Alert saldo rendah:
- Threshold: $25 USDC (default)
- Cooldown: 4 jam
- Notifikasi via Telegram

---

## Strategy Config Fields

Tersimpan di tabel `strategy_config` (key-value pairs):

| Field | Default | Keterangan |
|---|---|---|
| `autoTradingEnabled` | false | Aktifkan auto-trading bot |
| `bankroll` | 100 | Modal dalam dollar |
| `maxPositionPct` | 5 | Max % per posisi dari bankroll |
| `minEdge` | 0.04 | Minimum edge (4%) |
| `minProbability` | 0.75 | Minimum probabilitas (75%) |
| `maxDaysToResolution` | 14 | Max hari sampai resolve |
| `minVolume24h` | 1000 | Min volume 24 jam ($) |
| `minLiquidity` | 500 | Min likuiditas ($) |
| `scanIntervalMinutes` | 5 | Interval scan (menit) |
| `telegramAlertsEnabled` | false | Aktifkan notifikasi Telegram |
| `maxDailyTrades` | 5 | Max trade per hari |
| `maxOpportunities` | 20 | Max peluang ditampilkan |
| `dailyReportHour` | 20 | Jam laporan harian (0-23) |
| `stopLossPct` | 15 | Stop-loss % (15%) |
| `stopLossAutoExecute` | false | Auto-eksekusi stop-loss |
| `takeProfitEnabled` | false | Aktifkan take-profit bertahap |
| `takeProfitTier1Pct` | 20 | Take-profit tier 1 (+20%) |
| `takeProfitTier2Pct` | 50 | Take-profit tier 2 (+50%) |
| `takeProfitTier3Pct` | 100 | Take-profit tier 3 (+100%) |
| `trendFilterEnabled` | false | Filter trend harga |
| `autoCapital` | false | Sizing otomatis dari saldo nyata |
| `autoCompound` | false | Auto-reinvest profit (NEW) |
| `categoryFilter` | "" | Filter kategori (NEW) |
| `paperTradingMode` | false | Mode simulasi (NEW) |
| `paperBankroll` | 1000 | Modal simulasi (NEW) |

---

## API Routes Lengkap

### Strategy
```
GET  /api/strategy/config          → Baca konfigurasi
PUT  /api/strategy/config          → Update konfigurasi
GET  /api/strategy/opportunities   → Peluang trading saat ini
POST /api/strategy/backtest        → Jalankan backtest
GET  /api/strategy/kelly-calc      → Hitung Kelly Criterion
```

### Auto-Trading
```
GET  /api/auto-trading/status      → Status bot
POST /api/auto-trading/trigger     → Manual scan
```

### Paper Trading (NEW)
```
GET  /api/paper-trading/status     → Status paper portfolio
POST /api/paper-trading/reset      → Reset paper portfolio
```

### Analytics (NEW)
```
GET  /api/analytics/performance    → Statistik performa (live + paper)
```

### Markets (NEW)
```
GET  /api/markets/resolving-soon   → Market resolve dalam 7 hari
```

### Mainnet (NEW)
```
GET  /api/mainnet/preflight        → Preflight checklist (10 checks)
```

### Portfolio
```
GET  /api/portfolio/pnl-history    → Riwayat P&L harian
GET  /api/portfolio/open-positions → Posisi terbuka
GET  /api/portfolio/orders         → Order history
POST /api/portfolio/execute        → Eksekusi order
POST /api/portfolio/close-position → Tutup posisi
GET  /api/portfolio/export         → Export CSV
```

### Markets
```
GET  /api/markets                  → Daftar market Polymarket
GET  /api/markets/:id              → Detail market
GET  /api/markets/:id/prices       → Riwayat harga
POST /api/markets/watchlist        → Tambah watchlist
DELETE /api/markets/watchlist/:id  → Hapus watchlist
GET  /api/markets/watchlist        → Lihat watchlist
POST /api/markets/alerts           → Set price alert
GET  /api/markets/alerts           → Lihat price alerts
DELETE /api/markets/alerts/:id     → Hapus price alert
```

### Credentials & System
```
POST /api/credentials              → Simpan credential
GET  /api/wallet/status            → Status wallet
GET  /api/prices/stream            → SSE price stream
POST /api/telegram/test            → Test notifikasi
POST /api/demo/reset               → Reset demo data
```

---

## Panduan Setup Mainnet (Step-by-Step)

### Step 1 — Buat wallet Polygon
1. Install MetaMask
2. Buat wallet baru atau import existing
3. Tambahkan network Polygon (chainId: 137)
4. Export private key: Account → Three dots → Account details → Export private key

### Step 2 — Deposit USDC ke Polygon
1. Beli USDC di exchange
2. Withdraw ke alamat Polygon wallet kamu
3. Minimal $50 untuk mulai trading ($20 minimum absolut)

### Step 3 — Buat CLOB API credentials
1. Buka [polymarket.com](https://polymarket.com)
2. Connect wallet
3. Pergi ke Account → API Keys → Create key
4. Simpan: API Key, API Secret, Passphrase

### Step 4 — Set credentials di PolyTrader
1. Buka Settings → Credential Wizard
2. Masukkan: Private Key → API credentials → Telegram (opsional)

### Step 5 — Setup Telegram Bot (Opsional tapi disarankan)
1. Chat @BotFather di Telegram → /newbot
2. Ikuti instruksi → Salin Bot Token
3. Chat bot kamu → Buka `api.telegram.org/bot<TOKEN>/getUpdates` → Ambil Chat ID
4. Set TELEGRAM_BOT_TOKEN dan TELEGRAM_CHAT_ID di Secrets

### Step 6 — Konfigurasi strategi
Settings → Strategy Configuration:
- Aktifkan Auto-Trading
- Set Bankroll sesuai saldo
- Aktifkan Auto Capital Mode
- Set Stop-Loss Auto Execute
- Aktifkan Telegram Alerts

### Step 7 — Jalankan Preflight Check
Settings → Mainnet Preflight Checklist → "Jalankan Preflight Check"
Pastikan semua item ✅ atau minimal tidak ada ❌

### Step 8 — Mulai dengan Paper Trading dulu
1. Aktifkan Paper Trading Mode di Settings
2. Set Paper Bankroll ($1000 default)
3. Monitor hasil di Analytics → Paper Trading tab
4. Setelah puas dengan performa, nonaktifkan Paper Mode
5. Aktifkan auto-trading untuk live trading

---

## Composite Scoring Algorithm

Bot menggunakan scoring 0-100 untuk menilai setiap peluang:

```
compositeScore = (
  edgeScore    * 0.35 +   // Edge % vs fair value
  volumeScore  * 0.25 +   // Volume 24 jam (likuiditas pasar)
  liquidScore  * 0.20 +   // Depth order book
  timingScore  * 0.20     // Days to resolution (semakin dekat = lebih baik)
)
```

Hanya peluang dengan compositeScore ≥ 55 yang dianggap layak.

---

## Kelly Criterion

Formula yang digunakan:

```
f* = (p × b - q) / b
```

Di mana:
- `p` = probabilitas menang (fair value)
- `q` = 1 - p (probabilitas kalah)
- `b` = odds desimal (harga resolve / harga beli)
- `f*` = fraksi optimal dari bankroll

PolyTrader menggunakan **fractional Kelly** (25-50% dari full Kelly) untuk manajemen risiko konservatif.

---

## Troubleshooting

### API Server tidak start
```bash
cd artifacts/api-server && pnpm run build
```
Cek error TypeScript di output build.

### Frontend tidak connect ke API
- Pastikan API server running di port 8080
- Cek `VITE_API_BASE_URL` di Vite config
- Gunakan `$REPLIT_DEV_DOMAIN` bukan localhost untuk debug

### Data masih Demo setelah set credentials
- Refresh halaman setelah set credentials
- Cek Settings → Wallet & API Status → "Data source"
- Jika masih "Demo data", credentials mungkin tidak terbaca — re-input via wizard

### Order tidak tereksekusi
1. Cek CLOB credentials di Settings
2. Cek saldo USDC cukup
3. Cek `autoTradingEnabled = true`
4. Jalankan manual scan via Settings → Trigger Manual Scan
5. Cek logs API Server

### Telegram tidak menerima notifikasi
1. Pastikan sudah chat bot Telegram kamu sekali
2. Verifikasi Chat ID (bisa negatif untuk group)
3. Klik "Send test message" di Settings → Telegram

---

## File Struktur Kunci

```
artifacts/api-server/src/
├── index.ts                    ← Entry point Express app
├── lib/
│   └── db.ts                   ← SQLite setup, tabel schema, logger
├── routes/
│   ├── trading.ts              ← Strategy, backtest, paper trading, preflight routes
│   ├── markets.ts              ← Markets, watchlist, price alerts routes
│   ├── portfolio.ts            ← Portfolio, orders, positions routes
│   ├── wallet.ts               ← Wallet status, credentials routes
│   └── telegram.ts             ← Telegram webhook routes
└── services/
    ├── strategy.ts             ← Scanning, scoring, config management
    ├── scheduler.ts            ← Cron jobs, auto-compound, balance alert
    ├── autoTrader.ts           ← Auto-execution engine
    ├── paperTrader.ts          ← Paper trading + analytics service (NEW)
    ├── polymarket.ts           ← Gamma API client
    ├── clob.ts                 ← CLOB API client (order execution)
    └── telegram.ts             ← Telegram bot service

artifacts/polymarket-trader/src/
├── App.tsx                     ← Router setup
├── pages/
│   ├── Dashboard.tsx           ← Halaman utama
│   ├── Markets.tsx             ← Daftar market
│   ├── MarketDetail.tsx        ← Detail market
│   ├── Strategy.tsx            ← Scanner peluang
│   ├── Positions.tsx           ← Posisi terbuka
│   ├── Orders.tsx              ← Order history
│   ├── Portfolio.tsx           ← P&L chart & analytics
│   ├── Backtest.tsx            ← Multi-timeframe backtest
│   ├── Analytics.tsx           ← Performance analytics (NEW)
│   ├── ResolutionTracker.tsx   ← Market resolving soon (NEW)
│   ├── Correlation.tsx         ← Correlation matrix
│   └── Settings.tsx            ← Konfigurasi lengkap (updated)
└── components/
    └── layout/
        ├── AppLayout.tsx
        └── Sidebar.tsx         ← Nav dengan semua halaman
```

---

## Perubahan Terbaru (Session Ini)

### Backend (API Server)
- `db.ts`: Tambah tabel `paper_trades`, `paper_portfolio`, `low_balance_alerts`
- `strategy.ts`: Tambah field `autoCompound`, `categoryFilter`, `paperTradingMode`, `paperBankroll` ke `StrategyConfig`
- `telegram.ts`: Tambah `notifyLowBalance`, `notifyAutoCompound`, `notifyPaperTrade`
- `scheduler.ts`: Tambah `checkLowBalance()`, `runAutoCompound()`, integrasi paper trading
- `paperTrader.ts` (NEW): Service paper trading lengkap + performance analytics
- `trading.ts`: Tambah routes `/kelly-calc`, `/analytics/performance`, `/markets/resolving-soon`, `/paper-trading/*`, `/mainnet/preflight`

### Frontend (polymarket-trader)
- `Analytics.tsx` (NEW): Halaman analytics performa (live + paper, per kategori, best/worst trades)
- `ResolutionTracker.tsx` (NEW): Halaman market resolving 1-7 hari
- `Settings.tsx`: Tambah panel Auto-Compound, Category Filter, Paper Trading Mode, Mainnet Preflight Checklist, Kelly Calculator
- `Sidebar.tsx`: Tambah nav items Analytics + Resolving Soon
- `App.tsx`: Tambah routes `/analytics` dan `/resolution`
