# Jangkau

Platform pelaporan kebutuhan, penggalangan dana, dan pemantauan stok pos pengungsian.
Tim **Isin Aq Yank** — Politeknik Negeri Malang, STACK 2026 (GDGoC ITB), Case 2.

Monorepo berisi aplikasi web (React Router 7 + SSR di Cloudflare Workers) dan API
(Hono di Cloudflare Workers), dengan Supabase sebagai database dan Cloudflare R2
sebagai object storage.

---

## Struktur

```
apps/
  web/    React Router 7 (SSR) — UI, offline queue, Supabase Auth
  api/    Hono — aturan bisnis, geofence, RAB, donasi, tranche, stok, AI
packages/
  shared/ zod schema + enum + label (dipakai web & api)
  db/     migrasi SQL, seed, tipe hasil generate
```

Keputusan arsitektur dan skema database lengkap ada di [`prd-databaseSchema.md`](./prd-databaseSchema.md).
Dokumen itu sumber kebenaran: ubah dokumen dulu, baru kode.

---

## Prasyarat

- [Bun](https://bun.sh) 1.3+
- Node 22+ (untuk tooling yang masih butuh Node)
- Akun: Supabase, Cloudflare (Workers + R2), Midtrans sandbox, Google AI Studio (Gemini)

---

## Setup

```bash
bun install
```

### 1. Environment

```bash
cp apps/web/.env.example apps/web/.env
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

Isi nilainya. **Jangan commit** `.env` atau `.dev.vars` — sudah masuk `.gitignore`.

| File | Variabel | Sumber |
|---|---|---|
| `apps/web/.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `apps/web/.env` | `VITE_API_BASE_URL` | `http://localhost:8787/api/v1` saat lokal |
| `apps/api/.dev.vars` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | idem |
| `apps/api/.dev.vars` | `R2_*` | Cloudflare → R2 → Manage API Tokens |
| `apps/api/.dev.vars` | `MIDTRANS_*` | dashboard.midtrans.com → Access Keys (sandbox) |
| `apps/api/.dev.vars` | `GEMINI_API_KEY` | aistudio.google.com/apikey |

`SUPABASE_SERVICE_ROLE_KEY` hanya boleh ada di Worker. Kunci itu melewati RLS.

### 2. Database

Jalankan migrasi lewat Supabase CLI (link project dulu):

```bash
supabase link --project-ref <ref>
bun run db:push      # menerapkan packages/db/migrations/*.sql
bun run db:types     # generate tipe ke packages/db/src/database.types.ts
```

Di dashboard Supabase, aktifkan ekstensi `postgis`, `vector`, dan `pgcrypto`
(migrasi sudah memanggil `create extension`, butuh role owner).

### 3. Jalankan

```bash
bun run dev        # web :5173 + api :8787
bun run dev:web
bun run dev:api
```

Cek API: `curl http://localhost:8787/api/v1/health`.

---

## Perintah

| Perintah | Fungsi |
|---|---|
| `bun run dev` | web + api bersamaan |
| `bun run typecheck` | tsc di semua workspace |
| `bun run build` | build web + dry-run deploy api |
| `bun run deploy` | deploy web dan api ke Cloudflare |
| `bun run db:push` | terapkan migrasi |
| `bun run db:types` | generate tipe DB |

Deploy butuh `wrangler login` dan secret yang sudah dipasang:

```bash
cd apps/api && bunx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

---

## Alur inti

```
Lapor (offline-first) → Klasifikasi & merge AI → Geofence + upvote
→ Organisasi ambil alih → RAB → Konfirmasi pelapor → Donasi (Midtrans)
→ Pencairan bertahap (bukti + konfirmasi barang) → Stok pos ter-update
```

Status yang sudah berjalan di repo ini: landing page, auth (Supabase), health API,
skema database lengkap dengan trigger geofence/upvote/tranche dan RLS, presign upload R2,
endpoint laporan idempoten.

---

## Keterbatasan yang disengaja

- Pencairan dana **disimulasikan** — tidak ada transfer uang nyata.
- Midtrans memakai sandbox; transaksi demo diberi label.
- Data demo adalah data sintetis.
- Verifikasi organisasi masih manual oleh admin.

---

## AI assistance

Pengembangan dibantu AI coding assistant (Claude) untuk scaffolding, penulisan kode,
dan review. Keputusan arsitektur, skema, dan verifikasi dilakukan oleh tim.
Gemini API adalah komponen produk (klasifikasi & embedding), bukan alat bantu coding.
