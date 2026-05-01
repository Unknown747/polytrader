# PolyTrader

Dashboard trading untuk Polymarket prediction market di Polygon mainnet. Dilengkapi strategy scanner otomatis, backtester, Telegram notifications, dan auto-trading bot.

---

## Fitur Utama

| Halaman | Deskripsi |
|---|---|
| **Dashboard** | Ringkasan portfolio, chart P&L kumulatif, pasar trending |
| **Markets** | Daftar pasar Polymarket (data live dari Gamma API + fallback demo) |
| **Market Detail** | Info pasar + form order beli/jual YES/NO |
| **Positions** | Posisi terbuka dengan unrealized P&L |
| **Orders** | Riwayat order + cancel order |
| **Portfolio** | Chart P&L, breakdown posisi |
| **Strategy** | Scanner peluang: pasar probabilitas tinggi mendekati resolusi |
| **Backtest** | Simulasi strategi di data historis + equity curve + trade log |
| **Settings** | Konfigurasi wallet, Telegram bot, dan parameter auto-trading |

---

## Arsitektur

```
polytrader/
├── artifacts/
│   ├── api-server/          # Backend Express (PORT env, serve /api)
│   │   └── src/
│   │       ├── routes/      # Route handlers
│   │       └── services/    # Polymarket, Strategy, Backtest, Telegram, Scheduler
│   └── polymarket-trader/   # Frontend React + Vite (serve /)
│       └── src/
│           ├── pages/       # Halaman-halaman UI
│           └── components/  # Layout, UI components
├── lib/
│   ├── api-spec/            # OpenAPI spec (sumber kebenaran API contract)
│   ├── api-client-react/    # Generated React Query hooks (jangan edit manual)
│   └── api-zod/             # Generated Zod validation schemas (jangan edit manual)
└── scripts/                 # Utility scripts
```

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

Di Replit, semua sudah dikonfigurasi sebagai Workflows. Klik tombol **Run** atau aktifkan workflow masing-masing:

- `artifacts/api-server: API Server` — backend Express
- `artifacts/polymarket-trader: web` — frontend React + Vite

### Cara manual (lokal)

Jalankan dua terminal secara bersamaan:

**Terminal 1 — Backend API:**
```bash
PORT=8080 pnpm --filter @workspace/api-server run dev
```

**Terminal 2 — Frontend:**
```bash
BASE_URL=/ pnpm --filter @workspace/polymarket-trader run dev
```

Buka browser di `http://localhost:5173` (atau port yang muncul di terminal).

---

## Scripts Lengkap

### Root workspace

```bash
# Typecheck semua packages (libs + artifacts)
pnpm run typecheck

# Typecheck hanya shared libraries
pnpm run typecheck:libs

# Build semua (typecheck + build artifact)
pnpm run build
```

### API Server (`artifacts/api-server`)

```bash
# Dev mode: build lalu jalankan server
PORT=8080 pnpm --filter @workspace/api-server run dev

# Build saja (compile TypeScript → dist/)
pnpm --filter @workspace/api-server run build

# Jalankan server yang sudah di-build
PORT=8080 pnpm --filter @workspace/api-server run start

# Typecheck saja (tanpa emit)
pnpm --filter @workspace/api-server run typecheck
```

### Frontend (`artifacts/polymarket-trader`)

```bash
# Dev server dengan HMR
pnpm --filter @workspace/polymarket-trader run dev

# Build untuk production
pnpm --filter @workspace/polymarket-trader run build

# Preview build production
pnpm --filter @workspace/polymarket-trader run serve

# Typecheck saja
pnpm --filter @workspace/polymarket-trader run typecheck
```

### API Codegen (`lib/api-spec`)

Jalankan setiap kali mengubah `lib/api-spec/openapi.yaml`:

```bash
pnpm --filter @workspace/api-spec run codegen
```

Perintah ini akan:
1. Generate ulang React Query hooks di `lib/api-client-react/`
2. Generate ulang Zod schemas di `lib/api-zod/`
3. Jalankan `typecheck:libs` untuk validasi

---

## Environment Variables

### Wajib

| Variable | Keterangan |
|---|---|
| `PORT` | Port untuk API server (Replit set otomatis) |

### Opsional — Untuk live trading Polymarket

| Variable | Cara mendapatkan |
|---|---|
| `POLYMARKET_PRIVATE_KEY` | Private key wallet Polygon kamu |
| `POLYMARKET_API_KEY` | [polymarket.com](https://polymarket.com) → Account → API Keys |
| `POLYMARKET_API_SECRET` | Sama seperti di atas |
| `POLYMARKET_API_PASSPHRASE` | Sama seperti di atas |

### Opsional — Untuk Telegram notifications

| Variable | Cara mendapatkan |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Chat ke `@BotFather` di Telegram → `/newbot` |
| `TELEGRAM_CHAT_ID` | Kirim pesan ke bot, lalu buka `api.telegram.org/bot<TOKEN>/getUpdates` |

> Di Replit: set semua variable ini di **Secrets** (ikon kunci di sidebar kiri).

---

## Cara Setup Telegram

1. Buka Telegram, cari `@BotFather`
2. Kirim `/newbot` dan ikuti instruksinya
3. Copy **Bot Token** yang diberikan
4. Kirim sembarang pesan ke bot baru kamu
5. Buka URL ini di browser (ganti `<TOKEN>` dengan token kamu):
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
6. Copy nilai `chat.id` dari response JSON
7. Set `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_CHAT_ID` di Secrets
8. Buka halaman **Settings** → klik **Send test message** untuk verifikasi

---

## Cara Setup Live Trading

1. Buat atau siapkan wallet Polygon yang sudah punya USDC
2. Login ke [polymarket.com](https://polymarket.com)
3. Masuk ke **Account → API Keys** → buat API key baru
4. Catat `API Key`, `Secret`, dan `Passphrase`
5. Export private key wallet Polygon kamu (dari MetaMask: Settings → Security → Export Private Key)
6. Set semua 4 variable di Secrets:
   - `POLYMARKET_PRIVATE_KEY`
   - `POLYMARKET_API_KEY`
   - `POLYMARKET_API_SECRET`
   - `POLYMARKET_API_PASSPHRASE`
7. Restart server — sidebar otomatis berubah dari **DEMO** ke **LIVE**

---

## Strategi Trading

### Near-Resolution High-Probability Strategy

Scanner mencari pasar yang memenuhi semua kriteria berikut (bisa dikonfigurasi di Settings):

| Parameter | Default | Keterangan |
|---|---|---|
| Min probabilitas | 80% | Harga YES atau NO minimal 80¢ |
| Max hari ke resolusi | 21 hari | Pasar yang hampir selesai |
| Min volume 24h | $500 | Filter likuiditas |
| Min edge | 3% | Selisih harga pasar vs estimasi fair value |

### Ukuran Posisi (Half-Kelly Criterion)

```
Kelly fraction  = (p - price) / (1 - price)
Half-Kelly      = Kelly / 2
Posisi          = min(Half-Kelly, maxPositionPct) × bankroll
```

Contoh: YES di 82¢, estimasi fair value 88¢, bankroll $100, max 5%:
- Edge = 6%
- Full Kelly = (0.88 - 0.82) / (1 - 0.82) = 33%
- Half-Kelly = 16.5% → dikap ke 5% = $5.00 per trade

---

## Mengubah API Contract

Semua endpoint didefinisikan di `lib/api-spec/openapi.yaml`. Alur kerja:

```
Edit openapi.yaml
      ↓
pnpm --filter @workspace/api-spec run codegen
      ↓
Implement endpoint di artifacts/api-server/src/routes/
      ↓
Gunakan generated hook di frontend (useGetXxx, useMutateXxx)
```

Jangan edit file di `lib/api-client-react/` atau `lib/api-zod/` secara manual — file tersebut di-generate ulang setiap codegen.

---

## Struktur Backend Services

```
artifacts/api-server/src/services/
├── polymarket.ts   # Gamma API client, normalisasi data, caching 5 menit
├── strategy.ts     # Scanner peluang + half-Kelly calculator + config state
├── backtest.ts     # Engine simulasi historis (deterministik berdasarkan seed)
├── telegram.ts     # Telegram Bot API: kirim pesan notifikasi
└── scheduler.ts    # Auto-scan cron (setInterval, restart saat config berubah)
```

---

## Troubleshooting

**API tidak merespons:**
```bash
curl http://localhost:80/api/healthz
# atau
curl http://localhost:8080/api/healthz
```

**Typecheck error setelah edit openapi.yaml:**
```bash
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

**Peluang strategy kosong ([])**
- Normal jika tidak ada pasar Polymarket yang memenuhi kriteria saat ini
- Sistem akan fallback ke data demo otomatis
- Coba longgarkan filter di Settings (turunkan min probabilitas atau naikkan max hari)

**Telegram tidak terkirim:**
- Pastikan kamu sudah mengirim setidaknya satu pesan ke bot (Telegram tidak bisa kirim ke chat yang belum pernah dimulai)
- Verifikasi Chat ID menggunakan `getUpdates` API
- Pastikan Telegram Alerts diaktifkan di Settings

---

## Tech Stack

| Layer | Teknologi |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, shadcn/ui, Recharts, wouter, TanStack Query |
| Backend | Node.js, Express 5, TypeScript, Pino (logger) |
| API contract | OpenAPI 3.1, Orval (codegen), Zod (validasi) |
| Package manager | pnpm workspaces (monorepo) |
| Data | Polymarket Gamma API (public), CLOB API (butuh kredensial) |
