import { Hono } from "hono";

import { createReportSchema, reportListQuerySchema } from "@jangkau/shared";

import type { AppEnv } from "../../env.js";
import { classifyReport, judgeDuplicate } from "../../shared/ai.js";
import { raiseDbError } from "../../shared/db-errors.js";
import { distanceMeters } from "../../shared/geo.js";
import { presignGet } from "../../shared/r2.js";
import { badRequest, forbidden, notFound, unprocessable } from "../../shared/errors.js";
import { adminClient, toPoint } from "../../shared/supabase.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { optionalAuth } from "../../shared/middleware/optional-auth.js";

export const reportRoutes = new Hono<AppEnv>();

// Hanya endpoint baca publik yang memakai optionalAuth; sisanya wajib login.
reportRoutes.get("/:id", optionalAuth);

const MERGE_THRESHOLD = 0.35;
const MERGE_LIMIT = 5;

/**
 * Idempoten terhadap `clientUuid`: retry dari antrean offline mengembalikan
 * baris yang sudah ada (200) alih-alih membuat duplikat.
 *
 * Klasifikasi AI berjalan sinkron di sini supaya hasilnya langsung terlihat
 * di UI. Bila AI lambat atau gagal, laporan tetap tersimpan dengan
 * kategori "other" — laporan warga tidak boleh gagal karena AI.
 */
reportRoutes.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const parsed = createReportSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Laporan tidak valid", parsed.error.issues);
  }

  const input = parsed.data;
  const admin = adminClient(c.env);

  const { data: existing } = await admin
    .from("reports")
    .select("id, category, severity, ai_confidence, status")
    .eq("client_uuid", input.clientUuid)
    .maybeSingle();

  if (existing) {
    return c.json({ ...existing, duplicate: true }, 200);
  }

  const { data: post } = await admin
    .from("public_posts")
    .select("id, lat, lng, radius_m, status")
    .eq("id", input.postId)
    .eq("status", "active")
    .maybeSingle();

  if (!post) throw notFound("Pos pengungsian tidak ditemukan atau tidak aktif");

  // Pra-cek radius sebelum memanggil AI: laporan di luar radius tidak
  // perlu biaya klasifikasi. Trigger PostGIS tetap menghitung ulang.
  const distance = distanceMeters(input.location, { lat: post.lat, lng: post.lng });
  if (distance > post.radius_m) {
    throw unprocessable(
      "outside_radius",
      `Lokasi perangkat ${Math.round(distance)} m dari pos, di luar radius ${post.radius_m} m`,
      { postId: input.postId, distanceM: Math.round(distance), radiusM: post.radius_m },
    );
  }

  const text = input.bodyText ?? input.transcript ?? "";
  const classification = input.category ? null : await classifyReport(c.env, text);

  const { data: created, error } = await admin
    .from("reports")
    .insert({
      client_uuid: input.clientUuid,
      post_id: input.postId,
      reporter_id: user.id,
      body_text: input.bodyText ?? null,
      transcript: input.transcript ?? null,
      category: input.category ?? classification?.category ?? "other",
      severity: classification?.severity ?? input.severity,
      ai_category: classification?.category ?? null,
      ai_confidence: classification?.confidence ?? null,
      ai_model: classification ? c.env.AI_MODEL : null,
      headcount_delta: input.headcountDelta ?? null,
      location: toPoint(input.location.lat, input.location.lng),
      location_accuracy_m: input.location.accuracyM ?? null,
      captured_at: input.capturedAt,
    })
    .select("id, geofence_ok, status, category, severity, ai_confidence")
    .single();

  if (error) raiseDbError(error);

  // Geofence dihitung trigger; laporan di luar radius ditolak agar tidak
  // masuk feed. Baris tetap disimpan sebagai jejak audit.
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

  if (input.media.length > 0) {
    const { error: mediaError } = await admin.from("report_media").insert(
      input.media.map((file) => ({
        report_id: created.id,
        r2_key: file.key,
        kind: "report_photo" as const,
        mime_type: file.mimeType,
        size_bytes: file.sizeBytes,
      })),
    );
    if (mediaError) raiseDbError(mediaError);
  }

  return c.json(
    {
      ...created,
      duplicate: false,
      ai: classification
        ? { summary: classification.summary, items: classification.items }
        : null,
    },
    201,
  );
});

/**
 * Kotak masuk organisasi: laporan yang sudah memenuhi ambang dukungan dan
 * belum punya kampanye. Hanya untuk organisasi terverifikasi atau admin.
 */
reportRoutes.get("/inbox", requireAuth, async (c) => {
  const user = c.get("user");
  if (!user.organizationId && user.role !== "admin") {
    throw forbidden("Akun harus terhubung ke organisasi yang sudah terverifikasi");
  }

  const admin = adminClient(c.env);
  const { data, error } = await admin
    .from("reports")
    .select(
      "id, post_id, body_text, category, severity, status, upvote_count, captured_at, ai_confidence",
    )
    .eq("status", "eligible")
    .order("upvote_count", { ascending: false })
    .limit(50);

  if (error) raiseDbError(error);

  const { data: taken } = await admin.from("campaigns").select("report_id");
  const takenIds = new Set((taken ?? []).map((row) => row.report_id));

  const { data: posts } = await admin.from("public_posts").select("id, name, regency");
  const postById = new Map((posts ?? []).map((post) => [post.id, post]));

  return c.json({
    items: (data ?? [])
      .filter((report) => !takenIds.has(report.id))
      .map((report) => ({ ...report, post: postById.get(report.post_id) ?? null })),
  });
});

reportRoutes.get("/", requireAuth, async (c) => {
  const parsed = reportListQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    throw badRequest("invalid_query", "Parameter filter tidak valid", parsed.error.issues);
  }

  const { limit, postId, status, mine } = parsed.data;
  const admin = adminClient(c.env);

  let query = admin
    .from("reports")
    .select(
      "id, post_id, body_text, category, severity, status, upvote_count, captured_at, ai_confidence",
    )
    .order("captured_at", { ascending: false })
    .limit(limit);

  if (postId) query = query.eq("post_id", postId);
  if (status) query = query.eq("status", status);
  // API memakai service_role, jadi filter kepemilikan harus eksplisit —
  // RLS tidak menyaring untuknya.
  if (mine) query = query.eq("reporter_id", c.get("user").id);

  const { data, error } = await query;
  if (error) raiseDbError(error);

  const rows = data ?? [];
  if (rows.length === 0) return c.json({ items: [] });

  // Bucket R2 privat, jadi URL foto ditandatangani di sini (TTL 5 menit)
  // supaya bisa dipakai langsung sebagai `src` <img> tanpa header.
  const { data: mediaRows } = await admin
    .from("report_media")
    .select("report_id, r2_key, mime_type")
    .in("report_id", rows.map((row) => row.id));

  const byReport = new Map<string, Array<{ mimeType: string; url: string }>>();
  await Promise.all(
    (mediaRows ?? []).map(async (row) => {
      const url = await presignGet(c.env, row.r2_key);
      const list = byReport.get(row.report_id) ?? [];
      list.push({ mimeType: row.mime_type, url });
      byReport.set(row.report_id, list);
    }),
  );

  const { data: myVotes } = await admin
    .from("report_votes")
    .select("report_id")
    .eq("profile_id", c.get("user").id)
    .in("report_id", rows.map((row) => row.id));

  const voted = new Set((myVotes ?? []).map((row) => row.report_id));

  return c.json({
    items: rows.map((row) => ({
      ...row,
      media: byReport.get(row.id) ?? [],
      hasVoted: voted.has(row.id),
    })),
  });
});

/** Detail satu laporan: teks, media, dan status dukungan pemanggil. */
reportRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const admin = adminClient(c.env);

  const { data: report, error } = await admin
    .from("reports")
    .select(
      "id, post_id, reporter_id, body_text, transcript, category, ai_category, ai_confidence, severity, status, upvote_count, captured_at, reject_reason, merged_into_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) raiseDbError(error);
  if (!report) throw notFound("Laporan tidak ditemukan");

  // Laporan orang lain hanya boleh dibaca bila sudah lolos validasi.
  const isPublic = ["validated", "eligible", "taken_up", "merged"].includes(report.status);
  const canSeeUnpublished =
    user !== undefined &&
    (report.reporter_id === user.id || user.role === "admin" || Boolean(user.organizationId));

  if (!isPublic && !canSeeUnpublished) {
    throw forbidden("Laporan ini belum tervalidasi");
  }

  const [{ data: media }, { data: vote }, { data: post }, { data: threshold }] = await Promise.all([
    admin.from("report_media").select("r2_key, mime_type").eq("report_id", id),
    user
      ? admin
          .from("report_votes")
          .select("report_id")
          .eq("report_id", id)
          .eq("profile_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("public_posts")
      .select("id, name, regency, radius_m")
      .eq("id", report.post_id)
      .maybeSingle(),
    // Ambang dukungan disimpan di app_settings agar bisa dikalibrasi tanpa deploy.
    admin.from("app_settings").select("value").eq("key", "upvote_threshold").maybeSingle(),
  ]);

  const files = await Promise.all(
    (media ?? []).map(async (file) => ({
      mimeType: file.mime_type,
      url: await presignGet(c.env, file.r2_key),
    })),
  );

  // `reporter_id` hanya dipakai untuk memutuskan akses; identitas pelapor
  // tidak boleh keluar di respons publik (lihat view public_reports).
  const { reporter_id: _reporterId, ...publicReport } = report;

  const thresholdValue = threshold?.value;
  const upvoteThreshold =
    typeof thresholdValue === "number" ? thresholdValue : Number(thresholdValue ?? 5);

  return c.json({
    ...publicReport,
    media: files,
    hasVoted: Boolean(vote),
    upvoteThreshold: Number.isFinite(upvoteThreshold) ? upvoteThreshold : 5,
    post,
  });
});

/** Klasifikasi ulang manual (mis. setelah model diperbaiki). */
reportRoutes.post("/:id/classify", requireAuth, async (c) => {
  const user = c.get("user");
  const admin = adminClient(c.env);
  const id = c.req.param("id");

  const { data: report } = await admin
    .from("reports")
    .select("id, reporter_id, body_text, transcript")
    .eq("id", id)
    .maybeSingle();

  if (!report) throw notFound("Laporan tidak ditemukan");
  if (report.reporter_id !== user.id && user.role !== "admin" && !user.organizationId) {
    throw forbidden();
  }

  const classification = await classifyReport(
    c.env,
    report.body_text ?? report.transcript ?? "",
  );
  if (!classification) {
    return c.json({ error: { code: "ai_unavailable", message: "AI tidak tersedia" } }, 503);
  }

  const { data, error } = await admin
    .from("reports")
    .update({
      category: classification.category,
      severity: classification.severity,
      ai_category: classification.category,
      ai_confidence: classification.confidence,
      ai_model: c.env.AI_MODEL,
    })
    .eq("id", id)
    .select("id, category, severity, ai_confidence")
    .maybeSingle();

  if (error) raiseDbError(error);
  return c.json({ ...data, summary: classification.summary, items: classification.items });
});

/**
 * Kandidat duplikat: trigram menyaring kandidat murah, model bahasa
 * memberi verdict. Hanya organisasi terverifikasi/admin yang melihat ini
 * karena keputusan merge mengubah data laporan warga.
 */
reportRoutes.get("/:id/merge-candidates", requireAuth, async (c) => {
  const user = c.get("user");
  if (user.role !== "admin" && !user.organizationId) {
    throw forbidden("Hanya admin atau organisasi terverifikasi");
  }

  const admin = adminClient(c.env);
  const id = c.req.param("id");

  const { data: report } = await admin
    .from("reports")
    .select("id, post_id, body_text, transcript, category")
    .eq("id", id)
    .maybeSingle();

  if (!report) throw notFound("Laporan tidak ditemukan");

  const text = report.body_text ?? report.transcript ?? "";
  const { data: candidates, error } = await admin.rpc("fn_report_candidates", {
    p_post_id: report.post_id,
    p_text: text,
    p_threshold: MERGE_THRESHOLD,
    p_limit: MERGE_LIMIT,
    p_exclude_id: id,
  });
  if (error) raiseDbError(error);

  const rows = (candidates ?? []) as Array<{ report_id: string; similarity: number }>;
  const judged = await Promise.all(
    rows.map(async (candidate) => {
      const { data: other } = await admin
        .from("reports")
        .select("body_text, transcript")
        .eq("id", candidate.report_id)
        .maybeSingle();
      const otherText = other?.body_text ?? other?.transcript ?? "";
      const verdict = await judgeDuplicate(c.env, text, otherText);
      return {
        reportId: candidate.report_id,
        similarity: candidate.similarity,
        duplicate: verdict?.duplicate ?? null,
        confidence: verdict?.confidence ?? null,
        reason: verdict?.reason ?? null,
      };
    }),
  );

  return c.json({ items: judged });
});

reportRoutes.post("/:id/merge", requireAuth, async (c) => {
  const user = c.get("user");
  if (user.role !== "admin" && !user.organizationId) {
    throw forbidden("Hanya admin atau organisasi terverifikasi");
  }

  const body = (await c.req.json()) as { intoReportId?: string };
  const into = body.intoReportId;
  if (!into || into === c.req.param("id")) {
    throw badRequest("invalid_target", "intoReportId wajib dan harus berbeda");
  }

  const admin = adminClient(c.env);
  const { data, error } = await admin
    .from("reports")
    .update({ status: "merged", merged_into_id: into })
    .eq("id", c.req.param("id"))
    .select("id, status, merged_into_id")
    .maybeSingle();

  if (error) raiseDbError(error);
  if (!data) throw notFound("Laporan tidak ditemukan");
  return c.json(data);
});

reportRoutes.post("/:id/votes", requireAuth, async (c) => {
  const user = c.get("user");
  const reportId = c.req.param("id");
  const admin = adminClient(c.env);

  const { error } = await admin
    .from("report_votes")
    .insert({ report_id: reportId, profile_id: user.id });

  // 23505 = sudah pernah vote; idempoten.
  if (error && error.code !== "23505") raiseDbError(error);

  const { data } = await admin
    .from("reports")
    .select("id, upvote_count, status")
    .eq("id", reportId)
    .maybeSingle();

  if (!data) throw notFound("Laporan tidak ditemukan");
  return c.json({ ...data, hasVoted: true });
});

reportRoutes.delete("/:id/votes", requireAuth, async (c) => {
  const user = c.get("user");
  const reportId = c.req.param("id");
  const admin = adminClient(c.env);

  const { error } = await admin
    .from("report_votes")
    .delete()
    .eq("report_id", reportId)
    .eq("profile_id", user.id);

  if (error) raiseDbError(error);

  const { data } = await admin
    .from("reports")
    .select("id, upvote_count, status")
    .eq("id", reportId)
    .maybeSingle();

  if (!data) throw notFound("Laporan tidak ditemukan");
  return c.json({ ...data, hasVoted: false });
});

reportRoutes.post("/:id/reject", requireAuth, async (c) => {
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

  if (error) raiseDbError(error);
  if (!data) throw notFound("Laporan tidak ditemukan");
  return c.json(data);
});
