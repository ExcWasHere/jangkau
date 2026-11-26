import { Hono } from "hono";

import { createReportSchema, reportListQuerySchema } from "@jangkau/shared";

import type { AppEnv } from "../env.js";
import { badRequest, forbidden, notFound, unprocessable } from "../lib/errors.js";
import { adminClient, toPoint } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";

export const reportRoutes = new Hono<AppEnv>();

reportRoutes.use("*", requireAuth);

/**
 * Idempoten terhadap `clientUuid`: retry dari antrean offline mengembalikan
 * baris yang sudah ada (200) alih-alih membuat duplikat.
 */
reportRoutes.post("/", async (c) => {
  const user = c.get("user");
  const parsed = createReportSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Laporan tidak valid", parsed.error.issues);
  }

  const input = parsed.data;
  const admin = adminClient(c.env);

  const { data: existing } = await admin
    .from("reports")
    .select("id")
    .eq("client_uuid", input.clientUuid)
    .maybeSingle();

  if (existing) {
    return c.json({ id: existing.id, duplicate: true }, 200);
  }

  const { data: post } = await admin
    .from("relief_posts")
    .select("id")
    .eq("id", input.postId)
    .eq("status", "active")
    .maybeSingle();

  if (!post) throw notFound("Pos pengungsian tidak ditemukan atau tidak aktif");

  const { data: created, error } = await admin
    .from("reports")
    .insert({
      client_uuid: input.clientUuid,
      post_id: input.postId,
      reporter_id: user.id,
      body_text: input.bodyText ?? null,
      transcript: input.transcript ?? null,
      category: input.category ?? "other",
      severity: input.severity,
      headcount_delta: input.headcountDelta ?? null,
      location: toPoint(input.location.lat, input.location.lng),
      location_accuracy_m: input.location.accuracyM ?? null,
      captured_at: input.capturedAt,
    })
    .select("id, geofence_ok, status")
    .single();

  if (error) throw error;

  // Geofence dihitung trigger; laporan di luar radius langsung ditolak
  // agar tidak masuk feed. Baris tetap disimpan sebagai jejak audit.
  if (!created.geofence_ok) {
    await admin
      .from("reports")
      .update({ status: "rejected", reject_reason: "outside_radius" })
      .eq("id", created.id);

    throw unprocessable(
      "outside_radius",
      "Lokasi perangkat berada di luar radius pos pengungsian",
      { postId: input.postId },
    );
  }

  if (input.mediaKeys.length > 0) {
    const { error: mediaError } = await admin.from("report_media").insert(
      input.mediaKeys.map((key) => ({
        report_id: created.id,
        r2_key: key,
        kind: "report_photo" as const,
        mime_type: "image/jpeg",
        size_bytes: 1,
      })),
    );
    if (mediaError) throw mediaError;
  }

  return c.json({ id: created.id, status: created.status, duplicate: false }, 201);
});

reportRoutes.get("/", async (c) => {
  const parsed = reportListQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    throw badRequest("invalid_query", "Parameter filter tidak valid", parsed.error.issues);
  }

  const { limit, postId, status } = parsed.data;
  const admin = adminClient(c.env);

  let query = admin
    .from("reports")
    .select("id, post_id, body_text, category, severity, status, upvote_count, captured_at")
    .order("captured_at", { ascending: false })
    .limit(limit);

  if (postId) query = query.eq("post_id", postId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;

  return c.json({ items: data ?? [] });
});

reportRoutes.post("/:id/votes", async (c) => {
  const user = c.get("user");
  const reportId = c.req.param("id");
  const admin = adminClient(c.env);

  const { error } = await admin
    .from("report_votes")
    .insert({ report_id: reportId, profile_id: user.id });

  // 23505 = sudah pernah vote; idempoten.
  if (error && error.code !== "23505") throw error;

  const { data } = await admin
    .from("reports")
    .select("id, upvote_count, status")
    .eq("id", reportId)
    .maybeSingle();

  if (!data) throw notFound("Laporan tidak ditemukan");
  return c.json(data);
});

reportRoutes.delete("/:id/votes", async (c) => {
  const user = c.get("user");
  const reportId = c.req.param("id");
  const admin = adminClient(c.env);

  const { error } = await admin
    .from("report_votes")
    .delete()
    .eq("report_id", reportId)
    .eq("profile_id", user.id);

  if (error) throw error;

  const { data } = await admin
    .from("reports")
    .select("id, upvote_count, status")
    .eq("id", reportId)
    .maybeSingle();

  if (!data) throw notFound("Laporan tidak ditemukan");
  return c.json(data);
});

reportRoutes.post("/:id/reject", async (c) => {
  const user = c.get("user");
  if (user.role !== "admin" && !user.organizationId) {
    throw forbidden("Hanya admin atau organisasi terverifikasi");
  }

  const admin = adminClient(c.env);
  const { data, error } = await admin
    .from("reports")
    .update({ status: "rejected", reject_reason: "reviewed" })
    .eq("id", c.req.param("id"))
    .select("id, status")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw notFound("Laporan tidak ditemukan");
  return c.json(data);
});
