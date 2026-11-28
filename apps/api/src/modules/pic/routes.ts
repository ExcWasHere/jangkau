import { Hono } from "hono";

import { picApplicationSchema } from "@jangkau/shared";

import type { AppEnv } from "../../env.js";
import { raiseDbError } from "../../shared/db-errors.js";
import { badRequest, conflict, forbidden, notFound } from "../../shared/errors.js";
import { requireAuth, requireVerifiedDistributor } from "../../shared/middleware/auth.js";
import { adminClient } from "../../shared/supabase.js";

/**
 * Pengajuan diri sebagai penanggung jawab penyaluran pada satu event.
 *
 * Syarat tunggalnya adalah centang terverifikasi; akun penyalur tanpa centang
 * tetap boleh melapor dan berdonasi. Trigger `fn_guard_pic_assignment` menegakkan
 * aturan yang sama di database, jadi jalur ini tidak bisa dilewati.
 */
export const picRoutes = new Hono<AppEnv>();

picRoutes.use("*", requireAuth);

picRoutes.post("/:id/pic-applications", requireVerifiedDistributor, async (c) => {
  const eventId = c.req.param("id");
  const user = c.get("user");

  const parsed = picApplicationSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Pengajuan tidak valid", parsed.error.issues);
  }

  const admin = adminClient(c.env);

  const { data: event, error: eventError } = await admin
    .from("disaster_events")
    .select("id, merged_into_id, status")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) raiseDbError(eventError);
  if (!event) throw notFound("Berita bencana tidak ditemukan");
  if (event.merged_into_id) {
    throw conflict("event_merged", "Berita ini sudah digabung ke berita lain");
  }

  const { data: existing, error: existingError } = await admin
    .from("pic_assignments")
    .select("id, status")
    .eq("event_id", eventId)
    .eq("distributor_id", user.id)
    .maybeSingle();

  if (existingError) raiseDbError(existingError);

  if (existing) {
    if (existing.status === "applied") {
      throw conflict("already_applied", "Pengajuan kamu masih menunggu tinjauan admin");
    }
    if (existing.status === "approved") {
      throw conflict("already_approved", "Kamu sudah menjadi penanggung jawab berita ini");
    }

    // Ditolak atau dicabut: boleh mengajukan ulang dengan pitch baru.
    const { data, error } = await admin
      .from("pic_assignments")
      .update({
        status: "applied",
        pitch: parsed.data.pitch,
        applied_at: new Date().toISOString(),
        reviewed_by: null,
        reviewed_at: null,
        review_note: null,
        approved_at: null,
        revoked_at: null,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) raiseDbError(error);
    return c.json({ application: data, reapplied: true }, 201);
  }

  const { data, error } = await admin
    .from("pic_assignments")
    .insert({
      event_id: eventId,
      distributor_id: user.id,
      status: "applied",
      pitch: parsed.data.pitch,
    })
    .select("*")
    .single();

  if (error) raiseDbError(error);

  return c.json({ application: data, reapplied: false }, 201);
});

/** Menarik pengajuan yang belum diputuskan. */
picRoutes.delete("/:id/pic-applications/mine", async (c) => {
  const eventId = c.req.param("id");
  const user = c.get("user");
  const admin = adminClient(c.env);

  const { data: existing, error: existingError } = await admin
    .from("pic_assignments")
    .select("id, status")
    .eq("event_id", eventId)
    .eq("distributor_id", user.id)
    .maybeSingle();

  if (existingError) raiseDbError(existingError);
  if (!existing) throw notFound("Pengajuan tidak ditemukan");
  if (existing.status !== "applied") {
    throw forbidden("Hanya pengajuan yang belum diputuskan bisa ditarik");
  }

  const { error } = await admin.from("pic_assignments").delete().eq("id", existing.id);
  if (error) raiseDbError(error);

  return c.json({ ok: true });
});

/**
 * Semua event yang sedang ditangani penyalur ini, untuk dashboard.
 * Dua segmen supaya tidak bertabrakan dengan `GET /events/:id`.
 */
picRoutes.get("/pic-assignments/mine", async (c) => {
  const user = c.get("user");
  const admin = adminClient(c.env);

  const { data, error } = await admin
    .from("pic_assignments")
    .select(
      "id, event_id, status, pitch, applied_at, approved_at, review_note, disaster_events(id, title, province, regency)",
    )
    .eq("distributor_id", user.id)
    .order("applied_at", { ascending: false });

  if (error) raiseDbError(error);

  return c.json({ items: data ?? [] });
});
