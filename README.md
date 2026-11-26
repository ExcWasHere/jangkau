# Jangkau

Platform pelaporan kebutuhan, penggalangan dana, dan pemantauan stok pos pengungsian.
Tim **Isin Aq Yank** — Politeknik Negeri Malang, STACK 2026 (GDGoC ITB), Case 2.

Monorepo Bun dengan dua aplikasi yang **dideploy terpisah**:

| Bagian | Root repo | Target deploy | Perintah build |
|---|---|---|---|
| Frontend (React Router 7, SSR) | `apps/web` | Cloudflare Pages | `bun run build` → `build/client` |
| Backend (Hono) | `apps/api` | Cloudflare Workers | `bunx wrangler deploy` |
| Skema database | `packages/db` | Supabase | `psql -f migrations/0001_init.sql` |
| Kontrak bersama | `packages/shared` | — (dipakai kedua app) | — |

---

## Setup Pages (frontend)

Di dashboard Cloudflare → Workers & Pages → Create → Pages → Connect to Git:

| Setting | Nilai |
|---|---|
| Repository | `ExcWasHere/jangkau` |
| Production branch | `main` (atau `development` untuk staging) |
| Framework preset | `None` / `React Router` |
| **Root directory** | **`apps/web`** |
| Build command | `cd ../.. && bun install && cd apps/web && bun run build` |
| Build output directory | `build/client` |

Environment variables (Production **dan** Preview — `VITE_*` di-inline saat build):

| Variable | Nilai |
|---|---|
| `VITE_SUPABASE_URL` | `https://hfctvwlhviuqnwnlgvnn.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon/publishable key Supabase |
| `VITE_API_BASE_URL` | `https://jangkau-api.<subdomain-akun>.workers.dev/api/v1` |
| `SKIP_DEPENDENCY_INSTALL` | `1` — wajib. Tanpa ini Pages menjalankan `npm install` di `apps/web` dan gagal dengan `EUNSUPPORTEDPROTOCOL: workspace:*` |

`apps/web/functions/[[path]].ts` adalah satu-satunya entry SSR; tidak ada API di dalamnya.

Kenapa `SKIP_DEPENDENCY_INSTALL`: repo ini Bun workspace (`workspace:*`), yang tidak
dipahami npm. Install harus dijalankan dari root repo dengan Bun, sehingga build
command naik dua level dulu sebelum install.

## Setup Worker (backend)

```bash
cd apps/api
bunx wrangler deploy          # nama Worker: jangkau-api
```

Secret (sekali saja, tidak masuk repo):

```bash
cd apps/api
bunx wrangler secret put SUPABASE_URL
bunx wrangler secret put SUPABASE_ANON_KEY
bunx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
bunx wrangler secret put AI_BASE_URL
bunx wrangler secret put AI_API_KEY
bunx wrangler secret put AI_MODEL
```

Variable non-rahasia ada di `apps/api/wrangler.jsonc` (`APP_BASE_URL`, `ALLOWED_ORIGINS`,
`MIDTRANS_IS_PRODUCTION`). Isi `APP_BASE_URL` dengan URL Pages produksi supaya CORS
mengizinkannya; `*.pages.dev` dan `localhost:*` sudah diizinkan otomatis.

Cek: `curl https://jangkau-api.<subdomain>.workers.dev/api/v1/health`.

---

## Struktur

```
apps/
  web/
    app/
      routes/             modul rute: tipis, hanya menyusun fitur
      features/           per-domain: auth, reports, posts, campaigns, organizations
      shared/             ui primitives, api client, lib, layout
    assets/               sumber aset mentah (tidak disajikan)
    public/               aset yang disajikan (pattern.svg hasil generate)
    functions/[[path]].ts entry Pages Functions
  api/
    src/app.ts            aplikasi Hono (komposisi)
    src/index.ts          entry Worker
    src/modules/          per-domain: me, posts, reports, organizations, campaigns, stock, uploads
    src/shared/           errors, supabase, ai, r2, geo, middleware
packages/
  shared/                 zod schema + enum + label (kontrak web & api)
  db/                     migrasi SQL, seed, tipe hasil generate
```

Aturan arah dependensi: `routes → features → shared`. Fitur tidak mengimpor fitur lain;
`shared` tidak mengimpor `features`. API mengikuti pola yang sama dengan `modules → shared`.

Keputusan arsitektur dan skema database lengkap ada di [`prd-databaseSchema.md`](./prd-databaseSchema.md).
Dokumen itu sumber kebenaran: ubah dokumen dulu, baru kode.

---

## Prasyarat

- [Bun](https://bun.sh) 1.3+
- Akun: Supabase, Cloudflare (Pages + Workers + R2), inferhub (AI)

---

## Development lokal

```bash
bun install

cp apps/web/.env.example apps/web/.env
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

Isi nilainya. **Jangan commit** `.env` atau `.dev.vars` — sudah di `.gitignore`.

```bash
bun run dev          # web :5173 + api :8787 bersamaan
bun run dev:web
bun run dev:api
```

Cek API: `curl http://localhost:8787/api/v1/health`.

Menjalankan Pages lokal persis seperti produksi (SSR + `functions/`):

```bash
cd apps/web && bun run build && bunx wrangler pages dev build/client --port 8790
```

---

## Database

Migrasi diterapkan lewat `psql` (Supabase CLI butuh Docker). Ambil connection string
dari Supabase → Connect → **Session pooler**:

```bash
export PGPASSWORD='<password-db>'
export PGURL="postgresql://postgres.<project-ref>@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require"

psql "$PGURL" -v ON_ERROR_STOP=1 -f packages/db/migrations/0001_init.sql
psql "$PGURL" -v ON_ERROR_STOP=1 -f packages/db/seeds/demo.sql   # opsional, data sintetis
```

Catatan: `db.<ref>.supabase.co:5432` tidak punya record A (IPv4) — pakai pooler.
Ekstensi `postgis`, `pg_trgm`, `pgcrypto` dibuat oleh migrasi itu sendiri.

Akun demo (password `Jangkau#2026`):

| Email | Peran |
|---|---|
| `demo.pelapor@jangkau.test` | pelapor |
| `demo.admin@jangkau.test` | admin |
| `demo.org@jangkau.test` | organisasi terverifikasi (Yayasan Peduli Malang) |

---

## Perintah

| Perintah | Fungsi |
|---|---|
| `bun run dev` | web + api bersamaan |
| `bun run typecheck` | tsc di semua workspace |
| `bun run build` | build web (Pages) |
| `bun run db:push` | terapkan migrasi (butuh Supabase CLI) |
| `bun run db:types` | generate tipe DB |

---

## Alur inti

```
Lapor (offline-first) → Klasifikasi & merge AI → Geofence + upvote
→ Organisasi ambil alih → RAB → Konfirmasi pelapor → Donasi (Midtrans)
→ Pencairan bertahap (bukti + konfirmasi barang) → Stok pos ter-update
```

## Status implementasi

| Bagian | Status |
|---|---|
| Landing, auth (Supabase), halaman lapor + antrean offline | jalan |
| API: health, posts, reports (idempoten `clientUuid`), votes, classify, merge-candidates | jalan |
| Skema database (PostGIS geofence, trigger upvote/tranche, RLS) | sudah diterapkan + seed demo |
| Upload R2 | **jalan**: presigned PUT/GET, foto laporan tampil di daftar |
| Midtrans, tranche, stok, peta | belum |
| Notifikasi email | **terblokir**: Cloudflare Email butuh domain/zona yang belum ada |

## Keterbatasan yang disengaja

- Pencairan dana **disimulasikan** — tidak ada transfer uang nyata.
- Midtrans memakai sandbox; transaksi demo diberi label.
- Data demo adalah data sintetis.
- Verifikasi organisasi masih manual oleh admin.

---

## AI assistance

Pengembangan dibantu AI coding assistant (Claude) untuk scaffolding, penulisan kode,
dan review. Keputusan arsitektur, skema, dan verifikasi dilakukan oleh tim.
Model AI produk (klasifikasi laporan, verdict duplikat) dipanggil lewat endpoint
kompatibel OpenAI di inferhub, bukan alat bantu coding.
