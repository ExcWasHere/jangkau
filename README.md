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

Sumber kebenaran skema adalah `packages/db/migrations/0002_community_feed.sql` — berkas
itu yang benar-benar dijalankan. Dokumen desain produk (PRD, skema database, design
system) dikelola tim di luar repo dan dibagikan terpisah ke developer.

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

Skema ada di `packages/db/migrations/`. Skema aktif adalah **`0002_community_feed.sql`** —
migrasi ini menghapus seluruh skema `0001_init.sql` (alur RAB/organisasi) dan
menggantinya dengan alur post bencana + event hasil merge + penanggung jawab + ledger.
`0001_init.sql` disimpan hanya sebagai riwayat.

Terapkan migrasi dan seed dari root repo:

```bash
export SUPABASE_PROJECT_REF=hfctvwlhviuqnwnlgvnn
export SUPABASE_DB_PASSWORD='<password-db>'

bun run db:push     # packages/db/migrations/0002_community_feed.sql
bun run db:seed     # packages/db/seeds/demo.sql (idempoten, aman diulang)
bun run db:types    # regenerasi packages/db/src/database.types.ts
```

Skrip memakai `Bun.SQL`, jadi tidak perlu `psql`, Docker, atau Supabase CLI.
Kalau ingin memakai `psql` langsung:

```bash
export PGPASSWORD='<password-db>'
psql "host=aws-1-ap-northeast-1.pooler.supabase.com port=5432 dbname=postgres \
      user=postgres.hfctvwlhviuqnwnlgvnn sslmode=require" \
     -v ON_ERROR_STOP=1 -f packages/db/migrations/0002_community_feed.sql
```

Catatan penting:

- `db.<ref>.supabase.co:5432` **hanya punya alamat IPv6**. Jaringan tanpa IPv6 akan
  gagal connect. Pakai pooler (`aws-1-ap-northeast-1.pooler.supabase.com`) dan user
  `postgres.<ref>`, bukan `postgres`.
- Pooler kadang menjawab `tenant/user ... not found` karena round-robin DNS ke node
  yang tidak punya project ini. Ulangi perintah sekali-dua kali; `scripts/apply.ts`
  sudah menangani ini lewat `max: 1` dan satu transaksi.
- Ekstensi `postgis`, `pg_trgm`, `pgcrypto`, `vector` dibuat oleh migrasi.

### Akun demo (password semua: `Jangkau2026!`)

| Email | Peran | Catatan |
|---|---|---|
| `demo.admin@jangkau.test` | admin | akses `/admin` |
| `demo.pelapor@jangkau.test` | warga | punya lencana Pelapor, pelapor event Banjir Arjuna |
| `demo.org@jangkau.test` | penyalur organisasi | terverifikasi, PIC Kebakaran Bukittinggi |
| `demo.relawan@jangkau.test` | penyalur relawan | terverifikasi, PIC Longsor Cianjur |
| `demo.kreator@jangkau.test` | penyalur kreator | terverifikasi, PIC Kebakaran Bukittinggi |
| `demo.warga1..5@jangkau.test` | warga | sebagian punya lencana Donatur |
| `warga1..75@jangkau.test` | warga | pengisi dukungan, supaya ambang 50 like nyata |

Data seed: 5 event (2 leaderboard, 2 pantau, 1 terbaru), 8 post, 131 dukungan,
3 posko tersurvei, 3 penanggung jawab, 8 donasi lunas (Rp14.250.000),
2 pencairan dengan 4 bukti belanja dan 3 konfirmasi pelapor.

---

## Kredit foto demo

Foto di `post_media` berasal dari Wikimedia Commons, dipotong ke 1600 px dan
dikonversi ke WebP oleh `scripts` internal. Semua berlisensi bebas dengan atribusi:

| Berkas | Judul asli | Lisensi | Kreator |
|---|---|---|---|
| `jakarta-flood-2020.webp` | Floods in Raya Bintara Rd. (1 January 2020) | CC BY 4.0 | Fikri RA |
| `semarang-flood.webp` | Abandoned guardhouse in flooded parking lot, Tanjung Mas Harbour, Semarang | CC BY-SA 3.0 | Crisco 1492 |
| `jakarta-flood-tanjung-duren.webp` | Banjir Jakarta Perumahan di Tanjung Duren 1 Januari 2020 | CC BY-SA 4.0 | Cun Cun |
| `tangerang-prison-fire.webp` | Kebakaran di Lapas Tangerang, VOA Indonesia | Public domain | Indra Yoga (VOA) |
| `merapi-eruption.webp` | 2010 Eruption at Mount Merapi, Indonesia | Public domain | Robert Simmon dan Jesse Allen |

Foto struk (`receipts/demo/*.webp`) dibuat sendiri oleh tim dan ditandai
"Dokumen simulasi" — bukan transaksi nyata.

---

## Perintah

| Perintah | Fungsi |
|---|---|
| `bun run dev` | web + api bersamaan |
| `bun run typecheck` | tsc di semua workspace |
| `bun run build` | build web (Pages) |
| `bun run db:push` | terapkan `migrations/0002_community_feed.sql` |
| `bun run db:seed` | isi data demo (idempoten) |
| `bun run db:types` | regenerasi `packages/db/src/database.types.ts` |

---

## Halaman

| Rute | Akses |
|---|---|
| `/` | publik |
| `/pos/:postId` | publik (SSR) |
| `/laporan/:reportId` | publik untuk laporan tervalidasi |
| `/masuk`, `/daftar` | publik |
| `/lapor`, `/laporan`, `/konfirmasi-rab` | pelapor |
| `/laporan-masuk`, `/stok`, `/organisasi` | organisasi terverifikasi |
| `/kampanye/:id` | pelapor terkait, organisasi, admin |
| `/admin/organisasi` | admin |

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
| Detail pos (`/pos/:id`) + detail laporan (`/laporan/:id`) dengan upvote | jalan |
| Organisasi: pendaftaran, status verifikasi, verifikasi admin + audit log | jalan |
| RAB builder, konfirmasi pelapor, donasi simulasi, pencairan bertahap | jalan |
| Stok per pos + riwayat pergerakan | jalan |
| Kandidat duplikat (trigram + verdict model) dan penggabungan | jalan |
| API: health, posts, reports (idempoten `clientUuid`), votes, classify, merge-candidates | jalan |
| Skema database (PostGIS geofence, trigger upvote/tranche, RLS) | sudah diterapkan + seed demo |
| Upload R2 | **jalan**: presigned PUT/GET, foto laporan tampil di daftar |
| Midtrans sungguhan | belum — donasi berjalan dalam mode simulasi berlabel |
| Peta interaktif | belum — detail pos memakai diagram radius SVG |
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
