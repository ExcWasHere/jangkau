import { Hono } from "hono";

import type { AppEnv } from "../../env.js";
import { raiseDbError } from "../../shared/db-errors.js";
import { notFound } from "../../shared/errors.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { adminClient } from "../../shared/supabase.js";

export const notificationRoutes = new Hono<AppEnv>();

notificationRoutes.use("*", requireAuth);

/**
 * Daftar notifikasi milik pemanggil.
 *
 * `unreadCount` dikirim bersama daftar supaya lencana di header tidak perlu
 * permintaan kedua. Notifikasi ditulis modul lain (admin, donasi, pencairan),
 * jadi tabelnya sendiri tidak punya aturan bisnis.
 */
notificationRoutes.get("/", async (c) => {
  const user = c.get("user");
  const admin = adminClient(c.env);

  const limit = Math.min(Number(c.req.query("limit") ?? 30), 100);

  const [{ data, error }, { count, error: countError }] = await Promise.all([
    admin
      .from("notifications")
      .select("id, kind, title, body, link, read_at, created_at")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit),
    admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", user.id)
      .is("read_at", null),
  ]);

  if (error) raiseDbError(error);
  if (countError) raiseDbError(countError);

  return c.json({ items: data ?? [], unreadCount: count ?? 0 });
});

/** Hanya jumlah belum dibaca, untuk lencana header yang dimuat ringan. */
notificationRoutes.get("/unread-count", async (c) => {
  const user = c.get("user");
  const admin = adminClient(c.env);

  const { count, error } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id)
    .is("read_at", null);

  if (error) raiseDbError(error);

  return c.json({ unreadCount: count ?? 0 });
});

notificationRoutes.patch("/:id/read", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const admin = adminClient(c.env);

  const { data, error } = await admin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("profile_id", user.id)
    .select("id, read_at")
    .maybeSingle();

  if (error) raiseDbError(error);
  if (!data) throw notFound("Notifikasi tidak ditemukan");

  return c.json({ notification: data });
});

/** Menandai semua sudah dibaca. Dipakai tombol "Tandai semua dibaca". */
notificationRoutes.post("/read-all", async (c) => {
  const user = c.get("user");
  const admin = adminClient(c.env);

  const { error } = await admin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("profile_id", user.id)
    .is("read_at", null);

  if (error) raiseDbError(error);

  return c.json({ ok: true });
});

/**
 * Menulis notifikasi dari modul lain. Tidak pernah melempar galat.
 *
 * Notifikasi adalah efek samping, bukan bagian dari transaksi utama: kalau
 * penulisan notifikasi gagal, donasi atau persetujuan yang memicunya tetap
 * harus berhasil. Kegagalan dicatat ke log untuk ditelusuri.
 */
export async function notify(
  env: AppEnv["Bindings"],
  input: {
    profileId: string;
    kind: string;
    title: string;
    body?: string | null;
    link?: string | null;
  },
): Promise<void> {
  if (!input.profileId) return;

  try {
    const admin = adminClient(env);
    const { error } = await admin.from("notifications").insert({
      profile_id: input.profileId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    });

    if (error) console.warn("notify gagal", input.kind, error.message);
  } catch (cause) {
    console.warn("notify gagal", input.kind, cause instanceof Error ? cause.message : cause);
  }
}
