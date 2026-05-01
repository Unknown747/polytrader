# PolyTrader

Dashboard trading lengkap untuk Polymarket prediction market di Polygon mainnet. Dilengkapi data pasar live, strategy scanner otomatis, backtester realistis, Telegram bot 16 perintah, auto-trading bot, dan panel manajemen risiko portofolio.

---

## Fitur Utama

| Halaman | Deskripsi |
|---|---|
| **Dashboard** | Ringkasan portofolio, **panel Portfolio Risk Score** (0–100: konsentrasi HHI + urgensi resolusi + drawdown), chart P&L kumulatif, pasar trending |
| **Markets** | Daftar pasar Polymarket — data live dari Gamma API dengan fallback demo otomatis, filter kategori/status/search, tombol watchlist |
| **Market Detail** | Info pasar, form order beli/jual YES/NO, **chart harga 30 hari**, **bintang watchlist**, **bel price alert** (notifikasi Telegram saat harga target tercapai) |
| **Positions** | Posisi terbuka dengan unrealized P&L, **harga live via SSE** (push 15 detik), badge LIVE, Export CSV |
| **Orders** | Riwayat order, cancel order, ringkasan statistik, Export CSV |
| **Portfolio** | Chart P&L kumulatif, chart P&L harian, pie chart alokasi, panel **live CLOB P&L** (data nyata dari Polymarket), Export CSV P&L + posisi |
| **Strategy** | Scanner peluang: skor komposit 5 faktor, **filter tren harga** (badge naik/turun/flat dari regresi linear 14 hari), sizing half-Kelly |
| **Backtest** | Simulasi historis realistis: 30 template pasar, **fee taker CLOB 1%**, **simulasi bid-ask spread** (0.3–2.5% per tier likuiditas), equity curve, trade log |
| **Correlation** | Heatmap korelasi Pearson antar pasar di watchlist, jendela 7–90 hari, peringatan konsentrasi risiko |
| **Settings** | **Wizard setup 3 langkah** (Private Key → API Credentials → Telegram), **slider Stop-Loss** (10–20%, auto-eksekusi), **slider Take-Profit tiered** (3 tier), toggle filter tren, panel status auto-trading |

---

## Arsitektur

```
polytrader/
├── artifacts/
│   ├── api-server/               # Backend Express (PORT=8080, serve /api)
│   │   └── src/
│   │       ├── routes/           # 5 file route (sistem, pasar, portofolio, notifikasi, trading)
│   │       ├── services/         # Polymarket, Strategy+Backtest, CLOB, AutoTrader, Scheduler, Telegram
│   │       └── lib/              # SQLite (db.ts) + portfolio state (state.ts)
│   └── polymarket-trader/        # Frontend React + Vite (PORT=5000, serve /)
│       └── src/
│           ├── pages/            # Halaman UI (Dashboard, Markets, Positions, dll.)
│           ├── components/       # Layout, shadcn/ui components
│           └── hooks/            # usePriceStream + useToast (index.ts)
├── lib/
│   ├── api-spec/                 # OpenAPI 3.1 spec (sumber kebenaran API contract)
│   ├── api-client-react/         # Generated React Query hooks (jangan edit manual)
│   └── api-zod/                  # Generated Zod schemas (jangan edit manual)
└── scripts/
```

### Route Files (Backend)

| File | Isi |
|---|---|
| `routes/system.ts` | Health check, wallet status, demo reset, credentials |
| `routes/markets.ts` | Daftar pasar, trending, detail, histori harga, korelasi watchlist |
| `routes/portfolio.ts` | Posisi, order, ringkasan, live CLOB, export CSV, **risk score** |
| `routes/notifications.ts` | Telegram test, watchlist CRUD, price alerts CRUD |
| `routes/trading.ts` | Strategy scanner, auto-trader, SSE price stream (`/prices/stream`) |

### Services (Backend)

| File | Tanggung Jawab |
|---|---|
| `services/polymarket.ts` | Gamma API client — cache 5 menit, retry 3×, fetch hingga 1.000 pasar |
| `services/strategy.ts` | Skor komposit 5 faktor + half-Kelly + config SQLite + **engine backtest** (merged) |
| `services/clob.ts` | CLOB API client — EIP-712 signing, HMAC-SHA256 auth, place order, live P&L |
| `services/autoTrader.ts` | Auto-trading engine — riwayat di SQLite, Kelly sizing, satu trade per pasar/hari |
| `services/scheduler.ts` | Cron setiap N menit: update harga, scan, alert Telegram, auto-trade, daily report |
| `services/telegram.ts` | Kirim notifikasi Telegram: alert peluang, laporan harian, test message |
| `services/telegramBot.ts` | Long-polling bot 16 perintah, rate limiting, inline keyboard konfirmasi |

---

## Instalasi

### Prasyarat

- Node.js >= 20
- pnpm >= 9 — install dengan `npm install -g pnpm`

### Clone dan install dependencies

```bash
git clone https://github.com/Unknown747/polytrader.git
cd polytrader
pnpm install
```

---

## Menjalankan Aplikasi

### Cara cepat (Replit)

Di Replit, semua sudah dikonfigurasi sebagai Workflows. Aktifkan dua workflow:

- **API Server** — `PORT=8080 pnpm --filter @workspace/api-server run dev`
- **Frontend** — `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/polymarket-trader run dev`

### Cara manual (lokal)

Jalankan dua terminal secara bersamaan:

**Terminal 1 — Backend API:**
```bash
PORT=8080 pnpm --filter @workspace/api-server run dev
```

**Terminal 2 — Frontend:**
```bash
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/polymarket-trader run dev
```

Buka browser di `http://localhost:5000`.

---

## Scripts Lengkap

### Root workspace

```bash
pnpm run typecheck        # Typecheck semua packages
pnpm run typecheck:libs   # Typecheck shared libraries saja
pnpm run build            # Build semua artifacts
```

### API Server

```bash
PORT=8080 pnpm --filter @workspace/api-server run dev       # Dev mode (build + run)
pnpm --filter @workspace/api-server run build               # Build saja
PORT=8080 pnpm --filter @workspace/api-server run start     # Jalankan build
pnpm --filter @workspace/api-server run typecheck           # Typecheck saja
```

### Frontend

```bash
pnpm --filter @workspace/polymarket-trader run dev          # Dev server + HMR
pnpm --filter @workspace/polymarket-trader run build        # Build production
pnpm --filter @workspace/polymarket-trader run typecheck    # Typecheck saja
```

### API Codegen

Jalankan setiap kali mengubah `lib/api-spec/openapi.yaml`:

```bash
pnpm --filter @workspace/api-spec run codegen
```

Perintah ini generate ulang: React Query hooks di `lib/api-client-react/` dan Zod schemas di `lib/api-zod/`.

---

## Environment Variables

### Wajib

| Variable | Keterangan |
|---|---|
| `PORT` | Port untuk API server (Replit set otomatis ke 8080) |

### Opsional — Live trading Polymarket

| Variable | Cara mendapatkan |
|---|---|
| `POLYMARKET_PRIVATE_KEY` | Private key wallet Polygon kamu |
| `POLYMARKET_API_KEY` | [polymarket.com](https://polymarket.com) → Account → API Keys |
| `POLYMARKET_API_SECRET` | Sama seperti di atas |
| `POLYMARKET_API_PASSPHRASE` | Sama seperti di atas |

### Opsional — Telegram

| Variable | Cara mendapatkan |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Chat ke `@BotFather` → `/newbot` |
| `TELEGRAM_CHAT_ID` | Kirim pesan ke bot, buka `api.telegram.org/bot<TOKEN>/getUpdates`, ambil `chat.id` |

> Di Replit: set semua variable di **Secrets** (ikon kunci di sidebar). Bisa juga disimpan via Telegram bot dengan `/setcred`.

---

## Cara Setup Telegram Bot

1. Buka Telegram, cari `@BotFather`
2. Kirim `/newbot` dan ikuti instruksi
3. Copy **Bot Token**
4. Kirim pesan sembarang ke bot baru kamu
5. Buka `https://api.telegram.org/bot<TOKEN>/getUpdates`
6. Copy nilai `chat.id` dari response JSON
7. Set `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_CHAT_ID` di Secrets
8. Buka **Settings** → klik **Send Test Message** untuk verifikasi

### Perintah Telegram Bot (16 perintah)

| Perintah | Fungsi |
|---|---|
| `/balance` | Total nilai portofolio, ringkasan P&L, saldo USDC live |
| `/positions` | Semua posisi terbuka dengan P&L per posisi |
| `/orders` | 10 order terakhir dengan status fill |
| `/cancel <id>` | Cancel order dengan konfirmasi inline keyboard |
| `/pnl` | Riwayat P&L 14 hari terakhir + total kumulatif |
| `/config` | Lihat semua pengaturan strategi; update dengan `/config <key> <value>` |
| `/markets <kata>` | Cari pasar Polymarket berdasarkan kata kunci |
| `/scan` | Trigger scan strategi manual (cooldown 60 detik) |
| `/status` | Status auto-trader: trade hari ini, sisa slot, waktu scan/trade terakhir |
| `/creds` | Status semua kredensial yang sudah dikonfigurasi |
| `/watch <marketId>` | Tambah pasar ke watchlist |
| `/unwatch <marketId>` | Hapus pasar dari watchlist |
| `/watchlist` | Lihat semua pasar di watchlist dengan harga live |
| `/alert <id> <yes\|no> <above\|below> <harga%>` | Set price alert, misal: `/alert mkt-001 yes above 90` |
| `/alerts` | Lihat semua price alert (aktif dan sudah terpicu) |
| `/delalert <id>` | Hapus price alert |
| `/setcred <type> <value>` | Simpan kredensial ke DB (type: `privatekey`, `apikey`, `apisecret`, `apipassphrase`, `chatid`) |
| `/resetdemo` | Reset data portofolio ke nilai demo awal |
| `/help` | Daftar semua perintah |

---

## Cara Setup Live Trading

1. Siapkan wallet Polygon yang sudah ada USDC-nya
2. Login ke [polymarket.com](https://polymarket.com)
3. Masuk ke **Account → API Keys** → buat API key baru
4. Catat `API Key`, `Secret`, dan `Passphrase`
5. Export private key dari MetaMask: **Settings → Security → Export Private Key**
6. Set 4 variable di Secrets:
   - `POLYMARKET_PRIVATE_KEY`
   - `POLYMARKET_API_KEY`
   - `POLYMARKET_API_SECRET`
   - `POLYMARKET_API_PASSPHRASE`
7. Restart server — badge di sidebar berubah dari **DEMO** ke **LIVE**

### Alur Penandatanganan Order

```
1. EIP-712 typed-data signature menggunakan POLYMARKET_PRIVATE_KEY (ethers.js Wallet)
2. L2 HMAC-SHA256 header (POLY_SIGNATURE): timestamp + METHOD + path + body
3. Order dikirim ke https://clob.polymarket.com/order sebagai GTC limit order
```

---

## Strategi Trading

### Near-Resolution High-Probability Strategy

Scanner mencari pasar yang memenuhi semua kriteria ini (bisa dikonfigurasi di Settings):

| Parameter | Default | Keterangan |
|---|---|---|
| Min probabilitas | 80% | Harga YES atau NO minimal 80¢ |
| Max hari ke resolusi | 21 hari | Pasar yang hampir selesai |
| Min volume 24h | $500 | Filter likuiditas |
| Min likuiditas | $1.000 | Filter depth order book |
| Min edge | 3% | Selisih harga vs estimasi fair value |

### Skor Komposit (5 Faktor)

| Faktor | Bobot |
|---|---|
| Edge (selisih harga vs fair value) | 35% |
| Expected return | 20% |
| Urgensi waktu (mendekati resolusi) | 20% |
| Likuiditas | 15% |
| Volume 24 jam | 10% |

### Ukuran Posisi (Half-Kelly Criterion)

```
Kelly fraction  = (p_estimasi - harga_pasar) / (1 - harga_pasar)
Half-Kelly      = Kelly / 2
Posisi          = min(Half-Kelly, maxPositionPct) × bankroll
```

Contoh: YES di 82¢, estimasi fair value 88¢, bankroll $1.000, max posisi 5%:
- Full Kelly = (0.88 − 0.82) / (1 − 0.82) = 33%
- Half-Kelly = 16.5% → dikap ke 5% = **$50 per trade**

### Filter Tren Harga

Scanner melakukan regresi linear 14 hari pada data harga. Badge pada setiap peluang:
- 🟢 **Naik** — slope positif (harga YES sedang naik)
- 🟡 **Flat** — slope mendekati nol
- 🔴 **Turun** — slope negatif (pertimbangkan untuk skip)

---

## Manajemen Risiko

### Stop-Loss

Dikonfigurasi di Settings → tab Risk Management:

| Pengaturan | Keterangan |
|---|---|
| **Stop-Loss %** | Tutup posisi jika unrealized loss melebihi X% dari nilai awal (10–20%) |
| **Auto-Eksekusi** | Jika aktif, sistem otomatis menutup posisi tanpa perlu konfirmasi manual |

### Take-Profit (3 Tier)

| Tier | Kapan Terpicu | Aksi |
|---|---|---|
| **Tier 1 — Recover Capital** | Harga mencapai titik impas | Jual sebagian untuk menutup modal awal |
| **Tier 2 — Lock Profit** | Harga melewati Tier 1 | Jual 50% posisi yang tersisa |
| **Tier 3 — Full Close** | Harga mendekati 95–98¢ | Tutup seluruh posisi |

### Portfolio Risk Score Panel (Dashboard)

Panel di Dashboard menghitung skor risiko komposit 0–100 secara live (refresh 30 detik):

| Komponen | Maks | Cara Hitung |
|---|---|---|
| **Konsentrasi** | 40 poin | Herfindahl–Hirschman Index (HHI) dari nilai posisi — makin terdiversifikasi, makin rendah |
| **Urgensi Resolusi** | 30 poin | % nilai portofolio di posisi yang resolusi ≤7 hari |
| **Drawdown** | 30 poin | Penurunan P&L kumulatif dari puncak, relatif terhadap bankroll |

Label: **Healthy** (0–33) · **Moderate** (34–66) · **Elevated** (67–100)

---

## Database SQLite (`poly.db`)

| Tabel | Isi |
|---|---|
| `portfolio_orders` | Semua order (demo + live) |
| `portfolio_positions` | Posisi terbuka dengan harga live |
| `portfolio_pnl` | P&L harian dan kumulatif |
| `bot_state` | `lastUpdateId` Telegram bot (anti-replay) |
| `strategy_config` | Konfigurasi strategi (bertahan saat restart) |
| `auto_trade_history` | Semua auto-trade dengan status sukses/error |
| `market_watchlist` | Pasar yang di-watch user |
| `price_alerts` | Price alert per pasar (aktif dan sudah terpicu) |
| `app_credentials` | Kredensial yang disimpan via `/setcred` |
| `position_risk_events` | Log event stop-loss dan take-profit yang terpicu |

---

## API Endpoints

| Method | Path | Deskripsi |
|---|---|---|
| GET | `/api/healthz` | Health check server |
| GET | `/api/markets` | Daftar/cari pasar |
| GET | `/api/markets/trending` | 5 pasar trending berdasarkan volume 24h |
| GET | `/api/markets/:id` | Detail pasar |
| GET | `/api/markets/:id/history` | Histori harga N hari (`?days=7–90`) |
| GET | `/api/watchlist/correlation` | Matriks korelasi Pearson pasar di watchlist |
| GET | `/api/positions` | Posisi terbuka |
| GET | `/api/orders` | Daftar order |
| POST | `/api/orders` | Pasang order baru |
| DELETE | `/api/orders/:id` | Cancel order |
| GET | `/api/portfolio/summary` | Ringkasan portofolio |
| GET | `/api/portfolio/pnl` | Riwayat P&L dari SQLite |
| GET | `/api/portfolio/live` | Live P&L dari CLOB Polymarket |
| GET | `/api/portfolio/export` | Export CSV (`?type=orders\|positions\|pnl`) |
| GET | `/api/portfolio/risk` | Skor risiko komposit 0–100 |
| GET | `/api/wallet/status` | Status koneksi wallet + saldo USDC |
| GET | `/api/watchlist` | Daftar watchlist |
| POST | `/api/watchlist` | Tambah ke watchlist |
| DELETE | `/api/watchlist/:marketId` | Hapus dari watchlist |
| GET | `/api/alerts` | Daftar price alerts |
| POST | `/api/alerts` | Buat price alert baru |
| DELETE | `/api/alerts/:id` | Hapus price alert |
| POST | `/api/telegram/test` | Kirim test message Telegram |
| GET | `/api/strategy/opportunities` | Hasil scan peluang |
| GET | `/api/strategy/config` | Baca konfigurasi strategi |
| PUT | `/api/strategy/config` | Update konfigurasi strategi |
| POST | `/api/strategy/backtest` | Jalankan simulasi backtest |
| GET | `/api/auto-trading/status` | Status auto-trader + saldo + trade terbaru |
| GET | `/api/auto-trading/history` | Riwayat lengkap auto-trade |
| POST | `/api/auto-trading/trigger` | Trigger scan + eksekusi manual |
| GET | `/api/prices/stream` | SSE stream harga live (push 15 detik) |
| POST | `/api/demo/reset` | Reset data demo |
| POST | `/api/credentials` | Simpan kredensial ke DB |

---

## Mengubah API Contract

```
Edit lib/api-spec/openapi.yaml
      ↓
pnpm --filter @workspace/api-spec run codegen
      ↓
Implement endpoint di artifacts/api-server/src/routes/
      ↓
Gunakan generated hook di frontend (useGetXxx, useMutateXxx)
```

Jangan edit file di `lib/api-client-react/` atau `lib/api-zod/` secara manual.

---

## Troubleshooting

**API tidak merespons:**
```bash
curl http://localhost:8080/api/healthz
```

**Typecheck error setelah edit `openapi.yaml`:**
```bash
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

**Peluang strategy kosong:**
- Normal jika tidak ada pasar yang memenuhi semua filter saat ini
- Sistem fallback ke data demo otomatis
- Coba longgarkan filter di Settings (turunkan min probabilitas, naikkan max hari)

**Telegram tidak terkirim:**
- Pastikan kamu sudah kirim minimal satu pesan ke bot sebelum bot bisa membalas
- Verifikasi Chat ID via endpoint `getUpdates`
- Pastikan **Telegram Alerts** diaktifkan di Settings

**Badge tetap DEMO padahal sudah set kredensial:**
- Pastikan `POLYMARKET_PRIVATE_KEY` valid (hex, dengan atau tanpa prefix `0x`)
- Restart API server setelah set Secrets baru

---

## Tech Stack

| Layer | Teknologi |
|---|---|
| Frontend | React 19, Vite 7, Tailwind CSS v4, shadcn/ui, Recharts, wouter, TanStack Query v5 |
| Backend | Node.js 20, Express 5, TypeScript, better-sqlite3, Pino (logger), esbuild |
| Order signing | ethers.js v6 (EIP-712), HMAC-SHA256 (L2 auth) |
| API contract | OpenAPI 3.1, Orval (codegen), Zod (validasi runtime) |
| Package manager | pnpm workspaces (monorepo) |
| Data | Polymarket Gamma API (publik), CLOB API (butuh kredensial) |
