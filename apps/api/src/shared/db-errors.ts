import { AppError } from "./errors.js";

type PostgrestLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

/**
 * Supabase mengembalikan error sebagai objek biasa, bukan `Error`.
 * Hono hanya menjalankan `onError` untuk nilai `Error`, jadi objek itu
 * harus dikonversi di sini — kalau tidak, Worker melempar exception
 * mentah (Cloudflare error 1101) alih-alih JSON error.
 */
export function raiseDbError(error: PostgrestLike): never {
  const code = error.code ?? "";

  // Tabel/view/fungsi belum ada → migrasi belum dijalankan.
  if (code === "PGRST205" || code === "PGRST202" || code === "42P01" || code === "42883") {
    throw new AppError(
      503,
      "database_not_migrated",
      "Skema database belum lengkap. Jalankan `bun run db:push` di packages/db.",
      { code, message: error.message },
    );
  }

  if (code === "23505") {
    throw new AppError(409, "duplicate", "Data ini sudah ada.", {
      message: error.message,
    });
  }

  if (code === "23503") {
    throw new AppError(400, "invalid_reference", "Relasi data tidak valid.", {
      message: error.message,
    });
  }

  if (code === "42501") {
    throw new AppError(403, "forbidden", "Akses ditolak oleh aturan database.");
  }

  throw new AppError(500, "database_error", "Permintaan ke database gagal.", {
    code,
    message: error.message,
  });
}
