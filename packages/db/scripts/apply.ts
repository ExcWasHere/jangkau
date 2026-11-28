/**
 * Menjalankan berkas SQL ke database Supabase.
 *
 *   bun run scripts/apply.ts migrations/0002_community_feed.sql \
 *     migrations/0003_offline_and_merge_review.sql migrations/0004_location_source.sql
 *   bun run scripts/apply.ts seeds/demo.sql
 *
 * Kenapa tidak memakai `psql` atau `supabase db push`:
 * - `psql` tidak selalu terpasang di mesin anggota tim.
 * - Supabase CLI butuh login dan `link` per mesin.
 * Skrip ini hanya butuh satu environment variable dan berjalan di Bun mana pun.
 *
 * Koneksi: DATABASE_URL, atau dirakit dari SUPABASE_DB_URL / SUPABASE_DB_PASSWORD
 * + SUPABASE_PROJECT_REF. Lihat README bagian "Database".
 */
import { SQL } from "bun";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Pemakaian: bun run scripts/apply.ts <berkas.sql> [berkas.sql…]");
  process.exit(1);
}

const url = process.env.DATABASE_URL ?? buildUrl();
if (!url) {
  console.error(
    "DATABASE_URL belum diset.\n" +
      "Isi salah satu:\n" +
      "  DATABASE_URL=postgres://postgres.<ref>:<password>@<pooler-host>:5432/postgres\n" +
      "  SUPABASE_PROJECT_REF=<ref> SUPABASE_DB_PASSWORD=<password> [SUPABASE_DB_HOST=<pooler-host>]",
  );
  process.exit(1);
}

function buildUrl(): string | null {
  const ref = process.env.SUPABASE_PROJECT_REF;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!ref || !password) return null;
  // Supabase mematikan IPv4 untuk koneksi langsung `db.<ref>.supabase.co`.
  // Pooler IPv4 dipakai supaya skrip jalan di jaringan biasa.
  const host = process.env.SUPABASE_DB_HOST ?? "aws-1-ap-northeast-1.pooler.supabase.com";
  const user = `postgres.${ref}`;
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:5432/postgres?sslmode=require`;
}

const sql = new SQL({ url, max: 1, connection_timeout: 30 });

/**
 * Tiap berkas mendapat transaksinya sendiri. Migrasi berikutnya bergantung pada
 * hasil migrasi sebelumnya, jadi kegagalan di satu berkas menghentikan sisanya:
 * melanjutkan hanya akan menumpuk error di atas skema setengah jadi.
 */
let failed = false;
for (const file of files) {
  const raw = await readFile(file, "utf8");

  // Berkas boleh membawa `begin;`/`commit;` sendiri; transaksi dikelola di sini
  // supaya kegagalan di tengah berkas tidak meninggalkan skema setengah jadi.
  const body = raw
    .replace(/^\s*begin\s*;\s*$/im, "")
    .replace(/^\s*commit\s*;\s*$/im, "")
    .trim();

  const started = performance.now();
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
    });
    const ms = Math.round(performance.now() - started);
    console.log(`OK ${basename(file)} (${ms} ms)`);
  } catch (error) {
    console.error(`GAGAL ${basename(file)}`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    failed = true;
    break;
  }
}

await sql.close();
if (failed) process.exit(1);
