import { AppError } from "./errors.js";

type PostgrestLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

/**
 * Pesan dari trigger database (`raise exception 'KODE'`) diterjemahkan menjadi
 * galat yang bisa dibaca pengguna.
 *
 * Tanpa peta ini, setiap aturan bisnis yang ditegakkan trigger muncul sebagai
 * "Terjadi kesalahan di server" — pengguna tidak tahu apa yang harus diperbaiki,
 * dan pengembang mengira ada bug. Kode di sini HARUS sama dengan yang dipakai
 * di `packages/db/migrations/0002_community_feed.sql`.
 */
const TRIGGER_ERRORS: Record<string, { status: 400 | 403 | 409; code: string; message: string }> = {
  POST_OUTSIDE_RADIUS: {
    status: 400,
    code: "post_outside_radius",
    message: "Lokasi unggahan terlalu jauh dari titik bencana.",
  },
  EVENT_NOT_FOUND: {
    status: 400,
    code: "event_not_found",
    message: "Berita bencana tidak ditemukan.",
  },
  DISTRIBUTOR_PROFILE_MISSING: {
    status: 400,
    code: "distributor_missing",
    message: "Profil penyalur belum dibuat.",
  },
  DISTRIBUTOR_NOT_VERIFIED: {
    status: 403,
    code: "distributor_not_verified",
    message: "Verifikasi penyalur belum disetujui admin.",
  },
  SELF_APPROVAL_FORBIDDEN: {
    status: 403,
    code: "self_approval_forbidden",
    message: "Tidak bisa menyetujui pengajuan sendiri.",
  },
  PIC_NOT_APPROVED_FOR_EVENT: {
    status: 409,
    code: "pic_not_approved",
    message: "Penanggung jawab ini belum disetujui untuk berita tersebut.",
  },
  POSKO_NOT_IN_EVENT: {
    status: 400,
    code: "posko_not_in_event",
    message: "Posko yang dipilih bukan bagian dari berita ini.",
  },
  INSUFFICIENT_BALANCE: {
    status: 400,
    code: "insufficient_balance",
    message: "Saldo penanggung jawab tidak cukup untuk pencairan ini.",
  },
  TRANCHE_EXCEEDS_LIMIT: {
    status: 400,
    code: "tranche_exceeds_limit",
    message: "Nominal pencairan melebihi batas persentase per tahap.",
  },
  PREVIOUS_TRANCHE_UNCONFIRMED: {
    status: 409,
    code: "previous_tranche_unconfirmed",
    message: "Tahap sebelumnya belum dikonfirmasi pelapor.",
  },
  SELF_CONFIRMATION_FORBIDDEN: {
    status: 403,
    code: "self_confirmation_forbidden",
    message: "Penanggung jawab tidak bisa mengonfirmasi bukti belanjanya sendiri.",
  },
  ONLY_EVENT_REPORTERS_CAN_CONFIRM: {
    status: 403,
    code: "not_event_reporter",
    message: "Hanya warga yang melaporkan bencana ini yang bisa mengonfirmasi.",
  },
  EXPENSE_NOT_FOUND: {
    status: 400,
    code: "expense_not_found",
    message: "Bukti belanja tidak ditemukan.",
  },
  STOCK_NOT_FOUND: {
    status: 400,
    code: "stock_not_found",
    message: "Barang ini belum tercatat di posko.",
  },
  MERGE_SELF: {
    status: 400,
    code: "merge_self",
    message: "Berita tidak bisa digabung ke dirinya sendiri.",
  },
  EVENT_ALREADY_MERGED: {
    status: 409,
    code: "event_already_merged",
    message: "Berita ini sudah digabung ke berita lain.",
  },
};

/**
 * Supabase mengembalikan error sebagai objek biasa, bukan `Error`.
 * Hono hanya menjalankan `onError` untuk nilai `Error`, jadi objek itu
 * harus dikonversi di sini — kalau tidak, Worker melempar exception
 * mentah (Cloudflare error 1101) alih-alih JSON error.
 */
export function raiseDbError(error: PostgrestLike): never {
  const code = error.code ?? "";
  const message = error.message ?? "";
  const details = error.details ?? "";

  // Trigger memakai `raise exception 'KODE'`, sehingga kode itu muncul sebagai
  // `message` (bukan `code`) pada respons PostgREST.
  for (const [key, mapped] of Object.entries(TRIGGER_ERRORS)) {
    if (message === key || message.startsWith(`${key}\n`) || details.includes(key)) {
      throw new AppError(mapped.status, mapped.code, mapped.message, { trigger: key });
    }
  }

  // Tabel/view/fungsi belum ada → migrasi belum dijalankan.
  if (code === "PGRST205" || code === "PGRST202" || code === "42P01" || code === "42883") {
    throw new AppError(
      503,
      "database_not_migrated",
      "Skema database belum lengkap. Jalankan `bun run db:push` di packages/db.",
      { code, message },
    );
  }

  if (code === "23505") {
    throw new AppError(409, "duplicate", "Data ini sudah ada.", { message });
  }

  if (code === "23503") {
    throw new AppError(400, "invalid_reference", "Relasi data tidak valid.", { message });
  }

  if (code === "23514") {
    throw new AppError(400, "constraint_violation", "Data tidak memenuhi aturan.", {
      message,
      details,
    });
  }

  if (code === "42501") {
    throw new AppError(403, "forbidden", "Akses ditolak oleh aturan database.");
  }

  throw new AppError(500, "database_error", "Permintaan ke database gagal.", { code, message });
}
