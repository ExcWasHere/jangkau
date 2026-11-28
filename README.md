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
      features/           per-domain: auth, feed, marketing
      shared/             ui primitives, api client, lib, layout
    assets/               sumber aset mentah (tidak disajikan)
    public/               aset yang disajikan (pattern.svg hasil generate)
    functions/[[path]].ts entry Pages Functions
  api/
    src/app.ts            aplikasi Hono (komposisi)
    src/index.ts          entry Worker
    src/modules/          per-domain: events, posts, uploads, me
    src/shared/           errors, supabase, ai, r2, geo, cursor, middleware
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
bun run dev:web      # web memakai API lokal (lihat scripts/dev.mjs)
bun run dev:remote   # web memakai URL API dari .env
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
| `demo.penyalurbaru@jangkau.test` | penyalur relawan | terverifikasi, siap mengajukan PIC |
| `demo.yayasanbaru@jangkau.test` | penyalur organisasi | menunggu verifikasi, untuk demo antrean admin |
| `demo.warga1..5@jangkau.test` | warga | sebagian punya lencana Donatur |
| `warga1..75@jangkau.test` | warga | pengisi dukungan, supaya ambang 50 like nyata |

Data seed: 5 event (2 leaderboard, 2 pantau, 1 terbaru), 8 post, 131 dukungan,
3 posko tersurvei, 3 penanggung jawab, 8 donasi lunas (Rp14.250.000),
2 pencairan dengan 4 bukti belanja dan 3 konfirmasi pelapor.

---

## Pembayaran

`MIDTRANS_SERVER_KEY` kosong berarti **mode simulasi**: `POST /donations`
menghasilkan payload QR bertanda `JANGKAU-MOCK|…`, UI menampilkan label
"Simulasi", dan tombol "Tandai lunas (simulasi)" menandai donasi `paid`.
Tidak ada uang yang berpindah.

Isi `MIDTRANS_SERVER_KEY` (dan `MIDTRANS_CLIENT_KEY`) untuk beralih ke QRIS
sandbox sungguhan. Tidak ada perubahan kode: `paymentProvider()` memilih
implementasi Midtrans saat key tersedia, dan endpoint simulasi otomatis
menolak (403) supaya uang nyata tidak bisa ditandai lunas dari sana.

Webhook: `POST /api/v1/donations/webhook/mock` atau `/webhook/midtrans`.
Keaslian dijaga tanda tangan (SHA-512 untuk Midtrans); notifikasi berulang
idempoten.

---

## Alur dana

```
Donasi masuk (ledger +) → saldo penanggung jawab
  → ajukan pencairan (maks 40% saldo, tahap berurutan)
  → admin setujui → admin tandai dicairkan (ledger −, disimulasikan)
  → penanggung jawab unggah bukti belanja (tidak boleh melebihi nominal tahap)
  → pelapor konfirmasi diterima / sebagian / tidak diterima (+ catatan)
  → tahap berikutnya terbuka setelah ada bukti yang dikonfirmasi
```

Aturan ini ditegakkan trigger database, bukan hanya UI:

| Aturan | Trigger |
|---|---|
| Pencairan ≤ 40% saldo, tidak melebihi saldo | `fn_guard_disbursement` |
| Tahap n>1 butuh bukti terkonfirmasi di tahap n−1 | `fn_guard_disbursement` |
| Konfirmasi hanya oleh pelapor event, bukan penanggung jawab | `fn_guard_expense_confirmation` |
| Entri ledger tidak bisa dobel per pencairan | unique index parsial |

Transfer uang **disimulasikan**: tidak ada dana nyata berpindah, dan UI
menampilkan label "Simulasi" pada setiap tahap.

---

## Antrean offline

Warga di lokasi bencana sering kehilangan sinyal justru saat laporan paling
dibutuhkan. Unggahan disimpan di IndexedDB — termasuk foto yang sudah
dikompres — lalu dikirim otomatis saat jaringan kembali.

| Kejadian | Perilaku |
|---|---|
| Jaringan putus saat kirim | Laporan disimpan di perangkat, muncul panel konfirmasi, indikator di bawah header |
| Sinyal kembali | Sinkron otomatis, tanpa perlu membuka halaman tertentu |
| Server menolak (4xx) | Dikeluarkan dari antrean dengan pesan; mengulang tidak akan menolong |
| GPS gagal | Laporan tidak diantrekan: lokasi wajib, dan menebaknya lebih berbahaya |

`clientUuid` dibuat di perangkat dan dipakai server sebagai kunci idempotensi,
jadi percobaan ulang tidak pernah membuat unggahan ganda.

## Tinjauan penggabungan AI

AI menggabungkan unggahan yang diyakininya membicarakan bencana yang sama.
Di ambang keyakinan menengah (0,72–0,86) penggabungan tetap dilakukan tetapi
ditandai `needs_review`, karena salah menggabung lebih merugikan daripada tidak
menggabung: satu berita bisa menelan laporan dari lokasi berbeda.

Admin memutuskan di tab **Tinjauan merge**:

| Keputusan | Efek |
|---|---|
| **Setujui** | `needs_review` dibersihkan, unggahan tetap di berita itu |
| **Pisahkan** | `fn_split_post` membuat berita baru dari unggahan itu; berita lama tetap punya unggahan utama |

---

## Moderasi

Pelapor dan pengunjung login bisa melaporkan berita lewat tombol **Laporkan
konten** di halaman berita. Laporan masuk antrean admin dengan lima alasan
(hoaks, duplikat, tidak relevan, grafis, lainnya) dan catatan opsional.

Keputusan admin:

| Keputusan | Efek |
|---|---|
| **Sembunyikan** | Berita berstatus `archived`: hilang dari feed dan detail (404), baris dan seluruh riwayatnya tetap utuh untuk audit |
| **Abaikan** | Status laporan `dismissed`, berita tidak berubah |

Pelapor menerima notifikasi berisi keputusan itu — tanpa ini, laporan terasa
masuk lubang hitam dan orang berhenti melaporkan.

## Notifikasi

Ditulis sebagai efek samping aksi server (verifikasi, pengajuan PIC, donasi,
pencairan, moderasi), tidak pernah bisa dibuat pengguna. Lencana di header
menyegarkan diri tiap 60 detik dan seketika setelah pengguna menandai dibaca.

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

| Rute | Akses | Isi |
|---|---|---|
| `/` | publik | Beranda: rak Leaderboard, Pantau, Terbaru |
| `/leaderboard`, `/pantau` | publik | Daftar penuh per section |
| `/bencana/:id` | publik | Detail berita, pengunggah, penanggung jawab, posko, donasi terbaru |
| `/bencana/:id/donasi` | publik | Form donasi: pilih PIC, nominal, anonim |
| `/donasi/:id` | publik + token klaim | QR, hitung mundur, modal terima kasih |
| `/pencairan?assignment=<id>` | penanggung jawab | Ajukan pencairan, unggah bukti belanja, rekap dana |
| `/konfirmasi` | pelapor | Bukti belanja yang menunggu konfirmasi |
| `/notifikasi` | login | Kabar verifikasi, PIC, donasi, pencairan, moderasi |
| `/unggah` | login | Unggah laporan + foto + GPS |
| `/saya` | login | Profil, lencana, status verifikasi penyalur |
| `/dashboard` | login | Dasbor penyalur: dokumen verifikasi, pengajuan PIC, profil |
| `/admin` | admin | Antrean verifikasi, pengajuan PIC, laporan konten |
| `/masuk`, `/daftar` | publik | Email/password + Google; pilih tipe akun |

## Alur inti

```
Unggah post + GPS → AI klasifikasi & cek duplikat → event digabung atau dibuat
→ dukungan publik (ambang 50) → Leaderboard → penyalur terverifikasi mengajukan
→ admin setujui → Pantau → survei posko → donasi per penanggung jawab
→ pencairan bertahap + bukti belanja → konfirmasi pelapor
```

## Status implementasi

| Bagian | Status |
|---|---|
| Skema database baru (23 tabel, 6 view, 50 policy, 22 trigger) | jalan, terpasang di Supabase |
| Seed demo idempoten (5 event, 131 dukungan, 3 PIC, 8 donasi) | jalan |
| API: health, feed keyset, detail event, like/unlike, lapor konten | jalan |
| API: unggah post + klasifikasi AI + merge otomatis/tinjauan | jalan |
| API: presign R2 (bucket publik + privat terpisah) | jalan |
| Web: beranda 3 rak, daftar section, detail event, unggah, profil | jalan |
| Auth: email/password + Google, pilih tipe akun (Warga/Penyalur) | jalan |
| Tema gelap/terang + token desain dari `design.md` | jalan |
| Skeleton, toast, menu preferensi, navigasi ponsel | jalan |
| Verifikasi penyalur (dokumen per label, centang otomatis setelah lengkap) | jalan |
| Pengajuan penanggung jawab + persetujuan admin | jalan |
| Posko: buat, survei, kebutuhan, stok dengan log | jalan |
| Admin: antrean verifikasi, PIC, laporan konten, pencairan, jejak audit | jalan |
| Lapor konten dari UI, sembunyikan berita, notifikasi dalam aplikasi | jalan |
| Antrean offline (IndexedDB) + sinkron otomatis saat sinyal kembali | jalan |
| Tinjauan penggabungan AI oleh admin (setujui / pisahkan) | jalan |
| Donasi QRIS (mock), ledger publik, modal terima kasih, klaim donasi tamu | jalan |
| Pencairan bertahap (maks 40%/tahap), bukti belanja, konfirmasi pelapor | jalan |
| Midtrans | **mock**: `MIDTRANS_SERVER_KEY` kosong → provider mock berlabel "Simulasi"; isi key untuk beralih ke QRIS sandbox tanpa ubah kode |
| Antrean offline IndexedDB | jalan |
| i18n ID/EN + pemilih bahasa & tema (tersimpan di cookie + akun) | jalan |

## Keterbatasan yang disengaja

- Pencairan dana **disimulasikan** — tidak ada transfer uang nyata.
- Data demo adalah data sintetis. Foto demo memakai gambar berlisensi bebas dari
  Wikimedia Commons; judul event diselaraskan dengan foto yang tersedia.
- AI hanya mengusulkan. Kalau provider AI tidak bisa dipakai, post tetap terbit
  dengan `needs_review = true` dan penggabungan memakai jarak sebagai fallback.
- Verifikasi organisasi masih manual oleh admin.

---

## AI assistance

Pengembangan dibantu AI coding assistant (Claude) untuk scaffolding, penulisan kode,
dan review. Keputusan arsitektur, skema, dan verifikasi dilakukan oleh tim.
Model AI produk (klasifikasi laporan, verdict duplikat) dipanggil lewat endpoint
kompatibel OpenAI di inferhub, bukan alat bantu coding.
